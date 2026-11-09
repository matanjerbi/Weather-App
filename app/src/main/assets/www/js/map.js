// Interactive weather map: Leaflet base + canvas heatmap, wind particles, isolines, radar/satellite tiles.
/* global L */
import { grid, rainviewer, pointNow } from './api.js';
import { LAYERS, LAYER_BY_ID, SCALES, makeScale, isUnlocked } from './layers.js';
import { upsample, isoline, levels, extrema, sample } from './contour.js';
import { store } from './store.js';
import { el, hhmm, relDay, round, dirName, windUV, toast, nearestIndex } from './util.js';

const scales = Object.fromEntries(Object.entries(SCALES).map(([k, v]) => [k, makeScale(v)]));
const DPR = Math.min(2, window.devicePixelRatio || 1);

export class WeatherMap {
  constructor(root, { onLesson, onLab, onPlace }) {
    this.root = root;
    this.cb = { onLesson, onLab, onPlace };
    this.layer = LAYER_BY_ID[store.get().lastLayer] || LAYER_BY_ID.wind;
    if (!isUnlocked(this.layer, store.get())) this.layer = LAYER_BY_ID.wind;
    this.t = 0;
    this.grid = null;
    this.fetchSeq = 0;
    this.playing = false;
    this.particles = [];
    this.uv = null;
    this.radar = null;
    this.buildDom();
    this.initMap();
  }

  buildDom() {
    this.mapEl = el('div', { class: 'map' });
    this.chips = el('div', { class: 'chips' });
    this.legend = el('div', { class: 'legend' });
    this.timeLabel = el('div', { class: 'tlabel' });
    this.slider = el('input', { type: 'range', min: 0, max: 0, value: 0, class: 'tslider' });
    this.playBtn = el('button', { class: 'play', 'aria-label': 'נגן' }, '▶');
    this.timebar = el('div', { class: 'timebar' }, this.playBtn, el('div', { class: 'tcol' }, this.timeLabel, this.slider));
    this.loading = el('div', { class: 'maploading hidden' }, el('span', { class: 'spinner' }), 'טוען נתונים…');
    this.infoBtn = el('button', { class: 'fab info', 'aria-label': 'הסבר' }, '?');
    this.locBtn = el('button', { class: 'fab loc', 'aria-label': 'המיקום שלי' }, '◎');
    this.sheet = el('div', { class: 'sheet hidden' });
    this.infoCard = el('div', { class: 'infocard hidden' });
    this.root.append(this.mapEl, this.chips, this.loading, this.infoBtn, this.locBtn, this.infoCard,
      el('div', { class: 'mapbottom' }, this.legend, this.timebar), this.sheet);

    this.slider.addEventListener('input', () => { this.setTime(+this.slider.value); });
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.infoBtn.addEventListener('click', () => this.showInfo());
    this.locBtn.addEventListener('click', () => {
      const p = store.get().place;
      this.map.setView([p.lat, p.lon], Math.max(this.map.getZoom(), 8));
    });
    this.renderChips();
    store.on(() => this.renderChips());
  }

  renderChips() {
    const st = store.get();
    this.chips.innerHTML = '';
    const groups = [['basic', ''], ['map', 'עוד'], ['pro', 'מקצועי']];
    for (const [g, title] of groups) {
      const ls = LAYERS.filter(l => l.group === g);
      if (title) this.chips.append(el('span', { class: 'chipsep' }, title));
      for (const l of ls) {
        const open = isUnlocked(l, st);
        const c = el('button', {
          class: 'chip' + (l.id === this.layer.id ? ' on' : '') + (open ? '' : ' locked'),
          onclick: () => this.pickLayer(l),
        }, el('span', {}, l.emoji), ' ', l.name, open ? null : el('span', { class: 'lock' }, ' 🔒'));
        this.chips.append(c);
      }
    }
    const on = this.chips.querySelector('.chip.on');
    if (on && !this._chipScrolled) { this._chipScrolled = true; setTimeout(() => on.scrollIntoView({ inline: 'center', block: 'nearest' }), 50); }
  }

  pickLayer(l) {
    const st = store.get();
    if (!isUnlocked(l, st)) {
      this.showLocked(l);
      return;
    }
    this.layer = l;
    store.set({ lastLayer: l.id });
    this.renderChips();
    this.grid = null;
    this.load();
    const seen = JSON.parse(localStorage.getItem('atmo.seenLayers') || '{}');
    if (!seen[l.id]) {
      seen[l.id] = 1;
      localStorage.setItem('atmo.seenLayers', JSON.stringify(seen));
      this.showInfo();
    } else this.infoCard.classList.add('hidden');
  }

  showLocked(l) {
    this.infoCard.innerHTML = '';
    this.infoCard.append(
      el('div', { class: 'ichead' }, el('b', {}, `🔒 ${l.name}`), el('button', { class: 'x', onclick: () => this.infoCard.classList.add('hidden') }, '✕')),
      el('p', {}, 'השכבה הזו נפתחת אחרי שתעבור את השיעור שמסביר אותה — ככה תבין מה אתה רואה ולא רק תראה צבעים יפים.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', onclick: () => { this.infoCard.classList.add('hidden'); this.cb.onLesson(l.lesson); } }, 'לשיעור'),
        el('button', { class: 'btn', onclick: () => { store.set({ unlocked: { ...store.get().unlocked, [l.id]: true } }); this.infoCard.classList.add('hidden'); this.pickLayer(l); } }, 'פתח בכל זאת')),
    );
    this.infoCard.classList.remove('hidden');
  }

  showInfo() {
    const l = this.layer;
    this.infoCard.innerHTML = '';
    this.infoCard.append(
      el('div', { class: 'ichead' }, el('b', {}, `${l.emoji} ${l.name}`), el('button', { class: 'x', onclick: () => this.infoCard.classList.add('hidden') }, '✕')),
      el('p', {}, l.info),
      l.lesson ? el('button', { class: 'btn small', onclick: () => { this.infoCard.classList.add('hidden'); this.cb.onLesson(l.lesson); } }, '📖 לשיעור המלא') : null,
    );
    this.infoCard.classList.remove('hidden');
  }

  initMap() {
    const p = store.get().place;
    const map = L.map(this.mapEl, {
      center: [p.lat, p.lon], zoom: 6, minZoom: 3, maxZoom: 12, zoomControl: false, attributionControl: true,
      worldCopyJump: false, zoomSnap: 0.5,
    });
    this.map = map;
    map.attributionControl.setPrefix('');
    map.attributionControl.addAttribution('Natural Earth | Open-Meteo');

    // Offline basemap: land fill below the weather, coastlines/borders + Hebrew place names above it.
    map.createPane('land').style.zIndex = 250;
    map.createPane('wx').style.zIndex = 350;
    map.createPane('wxtiles').style.zIndex = 340;
    const labels = map.createPane('labels');
    labels.style.zIndex = 460;
    labels.style.pointerEvents = 'none';
    this.loadBasemap();
    this.addPlaceNames();

    const pane = map.getPane('wx');
    this.heat = el('canvas', { class: 'wxc' });
    this.part = el('canvas', { class: 'wxc' });
    this.vec = el('canvas', { class: 'wxc' });
    pane.append(this.heat, this.part, this.vec);

    this.pinMarker = null;

    map.on('movestart zoomstart', () => { this.stopParticles(); this.clear(this.part); });
    map.on('zoomstart', () => { pane.style.opacity = 0; });
    map.on('moveend', () => {
      pane.style.opacity = 1;
      this.resize();
      this.draw();
      this.maybeRefetch();
    });
    map.on('click', (e) => this.onTap(e.latlng));
    window.addEventListener('resize', () => { map.invalidateSize(); this.resize(); this.draw(); });

    this.resize();
  }

  async loadBasemap() {
    try {
      const d = await (await fetch('data/basemap.json')).json();
      const landR = L.canvas({ pane: 'land', padding: 0.3 });
      const lineR = L.canvas({ pane: 'labels', padding: 0.3 });
      for (const g of d.land) {
        L.geoJSON(g, { renderer: landR, interactive: false, style: { stroke: false, fill: true, fillColor: '#1C283B', fillOpacity: 1 } }).addTo(this.map);
      }
      for (const g of d.lines) {
        L.geoJSON(g, { renderer: lineR, interactive: false, style: { color: '#E6EEF9', weight: 1.1, opacity: 0.75, fill: false } }).addTo(this.map);
      }
    } catch (e) { console.warn('basemap', e); }
  }

  addPlaceNames() {
    const P = [
      // [name, lat, lon, minZoom, kind]
      ['ירושלים', 31.778, 35.235, 5, 'big'], ['תל אביב', 32.08, 34.78, 5, 'big'], ['חיפה', 32.79, 34.99, 5, 'big'],
      ['באר שבע', 31.25, 34.79, 5, 'big'], ['אילת', 29.56, 34.95, 5, 'big'],
      ['טבריה', 32.79, 35.53, 7], ['נצרת', 32.70, 35.30, 7], ['צפת', 32.965, 35.496, 7], ['קריית שמונה', 33.207, 35.571, 7],
      ['אשדוד', 31.80, 34.65, 7], ['אשקלון', 31.67, 34.57, 7], ['נתניה', 32.33, 34.86, 7], ['דימונה', 31.07, 35.03, 7],
      ['מצפה רמון', 30.61, 34.80, 7], ['עין בוקק', 31.20, 35.36, 7], ['קצרין', 32.99, 35.69, 7], ['ערד', 31.26, 35.21, 8],
      ['רמת גן', 32.08, 34.81, 9], ['הרצליה', 32.165, 34.84, 9], ['רחובות', 31.89, 34.81, 8], ['מודיעין', 31.90, 35.01, 8],
      ['בית שאן', 32.50, 35.50, 8], ['עפולה', 32.61, 35.29, 8], ['נהריה', 33.01, 35.10, 8], ['אריאל', 32.10, 35.17, 9],
      ['החרמון ▲', 33.30, 35.79, 7, 'peak'], ['ים המלח', 31.50, 35.48, 8, 'water'], ['הכנרת', 32.82, 35.59, 9, 'water'],
      ['ביירות', 33.89, 35.50, 4], ['דמשק', 33.51, 36.29, 4], ['עמאן', 31.95, 35.93, 4], ['קהיר', 30.04, 31.24, 4],
      ['ניקוסיה', 35.17, 33.36, 4], ['אנקרה', 39.93, 32.86, 4], ['בגדד', 33.31, 44.36, 4], ['ריאד', 24.71, 46.68, 4],
      ['אתונה', 37.98, 23.73, 4], ['איסטנבול', 41.01, 28.98, 4], ['אלכסנדריה', 31.20, 29.92, 5], ['עקבה', 29.53, 35.00, 8],
      ['רומא', 41.9, 12.5, 3], ['פריז', 48.86, 2.35, 3], ['לונדון', 51.5, -0.12, 3], ['ברלין', 52.52, 13.4, 3],
      ['מוסקבה', 55.75, 37.6, 3], ['טהרן', 35.7, 51.4, 3], ['דובאי', 25.2, 55.27, 4],
      ['הים התיכון', 33.6, 31.2, 4, 'sea'], ['הים האדום', 22.5, 37.8, 4, 'sea'], ['הים השחור', 43.2, 34.5, 4, 'sea'],
    ];
    this.placeMarkers = P.map(([name, lat, lon, minZ, kind]) => ({
      minZ, kind,
      m: L.marker([lat, lon], {
        pane: 'labels', interactive: false, keyboard: false,
        icon: L.divIcon({ className: `citylbl ${kind || ''}`, html: `${kind === 'sea' || kind === 'water' || kind === 'peak' ? '' : '<i></i>'}<span>${name}</span>`, iconSize: [0, 0] }),
      }),
    }));
    const update = () => {
      const z = this.map.getZoom();
      for (const p of this.placeMarkers) {
        const show = z >= p.minZ && !(p.kind === 'sea' && z > 8);
        if (show && !this.map.hasLayer(p.m)) p.m.addTo(this.map);
        if (!show && this.map.hasLayer(p.m)) this.map.removeLayer(p.m);
      }
    };
    this.map.on('zoomend', update);
    update();
  }

  setPlace(p) {
    this.map.setView([p.lat, p.lon], Math.max(this.map.getZoom(), 7));
  }

  visible() {
    // called when the map tab is shown (Leaflet can't measure itself while hidden)
    this.map.invalidateSize();
    this.resize();
    const pre = this.preselect;
    this.preselect = null;
    if (pre && pre.id !== this.layer.id) { this.started = true; this.pickLayer(pre); return; }
    if (!this.started) { this.started = true; this.load(); return; }
    this.draw();
  }

  resize() {
    const s = this.map.getSize();
    const tl = this.map.containerPointToLayerPoint([0, 0]);
    for (const c of [this.heat, this.part, this.vec]) {
      if (c.width !== Math.round(s.x * DPR) || c.height !== Math.round(s.y * DPR)) {
        c.width = Math.round(s.x * DPR); c.height = Math.round(s.y * DPR);
        c.style.width = s.x + 'px'; c.style.height = s.y + 'px';
      }
      L.DomUtil.setPosition(c, tl);
    }
    this.W = s.x; this.H = s.y;
  }

  clear(c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); }

  // ---------- data ----------
  fetchBounds() {
    const b = this.map.getBounds();
    let lat0 = b.getSouth(), lat1 = b.getNorth(), lon0 = b.getWest(), lon1 = b.getEast();
    const pl = (lat1 - lat0) * 0.2, pw = (lon1 - lon0) * 0.2;
    lat0 = Math.max(-75, lat0 - pl); lat1 = Math.min(75, lat1 + pl);
    lon0 = Math.max(-179.5, lon0 - pw); lon1 = Math.min(179.5, lon1 + pw);
    const midLat = (lat0 + lat1) / 2;
    const aspect = ((lon1 - lon0) * Math.cos(midLat * Math.PI / 180)) / (lat1 - lat0);
    const N = 120;
    let nx = Math.round(Math.sqrt(N * aspect)); nx = Math.max(6, Math.min(16, nx));
    let ny = Math.round(N / nx); ny = Math.max(6, Math.min(16, ny));
    return { lat0, lat1, lon0, lon1, nx, ny };
  }

  maybeRefetch() {
    const l = this.layer;
    if (l.tiles || !this.grid) return;
    const g = this.grid;
    const b = this.map.getBounds();
    const inside = b.getSouth() >= g.lat0 && b.getNorth() <= g.lat1 && b.getWest() >= g.lon0 && b.getEast() <= g.lon1;
    const z = this.map.getZoom();
    if (!inside || Math.abs(z - this.fetchZoom) >= 1.5) this.load();
  }

  async load() {
    const l = this.layer;
    const seq = ++this.fetchSeq;
    this.stopPlay();
    this.clearTiles();
    if (l.tiles === 'radar') return this.loadRadar(seq);
    if (l.tiles === 'satellite') return this.loadSatellite();
    this.timebar.classList.remove('hidden');
    const fb = this.fetchBounds();
    this.loading.classList.remove('hidden');
    try {
      const g = await grid(l.vars, fb, { nx: fb.nx, ny: fb.ny, marine: !!l.marine });
      if (seq !== this.fetchSeq) return;
      this.fetchZoom = this.map.getZoom();
      const prevT = this.grid ? this.grid.times[this.t] : null;
      this.grid = g;
      this.prepUV();
      const n = g.times.length;
      this.slider.max = Math.max(0, n - 1);
      this.t = prevT ? Math.min(n - 1, nearestIndex(g.times, prevT)) : 0;
      this.slider.value = this.t;
      this.updateLabel();
      this.renderLegend();
      this.draw();
    } catch (e) {
      if (seq === this.fetchSeq) toast(e.message || 'שגיאה בטעינת הנתונים');
    } finally {
      if (seq === this.fetchSeq) this.loading.classList.add('hidden');
    }
  }

  prepUV() {
    const g = this.grid, l = this.layer;
    this.uv = null;
    if (!l.particles) return;
    const [sv, dv] = l.particles;
    const S = g.data[sv], D = g.data[dv];
    if (!S || !D) return;
    const U = new Float32Array(S.length), V = new Float32Array(S.length);
    for (let k = 0; k < S.length; k++) {
      const [u, v] = windUV(S[k], D[k]);
      U[k] = u; V[k] = v;
    }
    this.uv = { U, V };
  }

  clearTiles() {
    if (this.tileLayers) this.tileLayers.forEach(t => this.map.removeLayer(t));
    this.tileLayers = null;
    clearInterval(this.radarTimer);
    this.radar = null;
    this.grid = null;
    this.uv = null;
    [this.heat, this.part, this.vec].forEach(c => this.clear(c));
    this.stopParticles();
  }

  async loadRadar(seq) {
    this.timebar.classList.remove('hidden');
    this.legend.innerHTML = '';
    this.legend.append(el('div', { class: 'lgtitle' }, 'עוצמת גשם במכ״ם'), el('div', { class: 'lgbar', style: { background: 'linear-gradient(to left, #9be7ff, #00a2ff, #0044ff, #ffee00, #ff8800, #ff0000, #ff00ff)' } }),
      el('div', { class: 'lgticks' }, el('span', {}, 'טפטוף'), el('span', {}, 'גשם'), el('span', {}, 'סופה')));
    this.loading.classList.remove('hidden');
    try {
      const d = await rainviewer();
      if (seq !== this.fetchSeq) return;
      const frames = [...(d.radar?.past || []), ...(d.radar?.nowcast || [])];
      if (!frames.length) throw new Error('אין כרגע נתוני מכ״ם');
      const layers = frames.map(f => L.tileLayer(`${d.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        pane: 'wxtiles', opacity: 0, maxNativeZoom: 7, maxZoom: 12, tileSize: 256, attribution: 'RainViewer',
      }).addTo(this.map));
      this.tileLayers = layers;
      this.radar = { frames, i: frames.length - 1 - (d.radar?.nowcast?.length || 0) };
      this.slider.max = frames.length - 1;
      this.slider.value = this.radar.i;
      this.showRadarFrame(this.radar.i);
      setTimeout(() => this.togglePlay(true), 600);
    } catch (e) {
      toast(e.message || 'שגיאה בטעינת המכ״ם');
    } finally {
      this.loading.classList.add('hidden');
    }
  }

  showRadarFrame(i) {
    if (!this.radar) return;
    this.radar.i = i;
    this.tileLayers.forEach((t, k) => t.setOpacity(k === i ? 0.85 : 0));
    const f = this.radar.frames[i];
    const d = new Date(f.time * 1000);
    const mins = Math.round((Date.now() / 1000 - f.time) / 60);
    this.timeLabel.textContent = `${hhmm(d)} · ${mins > 0 ? `לפני ${mins} דק׳` : mins < 0 ? `תחזית +${-mins} דק׳` : 'עכשיו'}`;
  }

  loadSatellite() {
    this.timebar.classList.add('hidden');
    this.legend.innerHTML = '';
    this.legend.append(el('div', { class: 'lgtitle' }, 'אינפרא-אדום 10.8µm — לבן = ענן גבוה וקר'),
      el('div', { class: 'lgbar', style: { background: 'linear-gradient(to left, #111, #555, #aaa, #fff)' } }),
      el('div', { class: 'lgticks' }, el('span', {}, 'קרקע / ים'), el('span', {}, 'ענן נמוך'), el('span', {}, 'ענן סערה')));
    const wms = L.tileLayer.wms('https://view.eumetsat.int/geoserver/ows', {
      layers: 'msg_fes:ir108', format: 'image/png', transparent: true, version: '1.3.0', opacity: 0.8,
      pane: 'wxtiles', attribution: 'EUMETSAT',
    }).addTo(this.map);
    this.tileLayers = [wms];
  }

  // ---------- time ----------
  setTime(i) {
    if (this.radar) { this.showRadarFrame(i); return; }
    if (!this.grid) return;
    this.t = i;
    this.updateLabel();
    this.draw();
  }

  updateLabel() {
    if (!this.grid) return;
    const d = new Date(this.grid.times[this.t] * 1000);
    const h = this.t;
    this.timeLabel.textContent = `${relDay(d)} ${hhmm(d)}${h === 0 ? ' · עכשיו' : ` · בעוד ${h} שע׳`}`;
  }

  togglePlay(force) {
    if (this.playing && force !== true) return this.stopPlay();
    this.playing = true;
    this.playBtn.textContent = '❚❚';
    clearInterval(this.playTimer);
    this.playTimer = setInterval(() => {
      const max = +this.slider.max;
      let v = +this.slider.value + 1;
      if (v > max) v = 0;
      this.slider.value = v;
      this.setTime(v);
    }, this.radar ? 550 : 450);
  }

  stopPlay() {
    this.playing = false;
    this.playBtn.textContent = '▶';
    clearInterval(this.playTimer);
  }

  // ---------- drawing ----------
  gridXY(lat, lon) {
    const g = this.grid;
    return [(lon - g.lon0) / (g.lon1 - g.lon0) * (g.nx - 1), (lat - g.lat0) / (g.lat1 - g.lat0) * (g.ny - 1)];
  }

  field(v) {
    const g = this.grid;
    const a = g.data[v];
    if (!a) return null;
    const n = g.nx * g.ny;
    return a.subarray(this.t * n, (this.t + 1) * n);
  }

  draw() {
    if (!this.grid || this.layer.tiles) return;
    this.drawHeat();
    this.drawVectors();
    this.startParticles();
  }

  drawHeat() {
    const l = this.layer, g = this.grid;
    const ctx = this.heat.getContext('2d');
    ctx.clearRect(0, 0, this.heat.width, this.heat.height);
    const f = this.field(l.heat);
    if (!f) return;
    const sc = scales[l.scale];
    const step = 4;
    const w = Math.ceil(this.W / step), h = Math.ceil(this.H / step);
    if (!this._off || this._off.width !== w || this._off.height !== h) {
      this._off = document.createElement('canvas');
      this._off.width = w; this._off.height = h;
    }
    const octx = this._off.getContext('2d');
    const img = octx.createImageData(w, h);
    const px = img.data;
    const gx = new Float32Array(w), gy = new Float32Array(h);
    for (let x = 0; x < w; x++) gx[x] = this.gridXY(0, this.map.containerPointToLatLng([x * step, 0]).lng)[0];
    for (let y = 0; y < h; y++) gy[y] = this.gridXY(this.map.containerPointToLatLng([0, y * step]).lat, 0)[1];
    const out = [0, 0, 0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = sample(f, g.nx, g.ny, gx[x], gy[y]);
        const o = (y * w + x) * 4;
        if (isNaN(v)) { px[o + 3] = 0; continue; }
        sc.at(v, out, 0);
        px[o] = out[0]; px[o + 1] = out[1]; px[o + 2] = out[2]; px[o + 3] = out[3];
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = l.heatAlpha ?? 0.72;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this._off, 0, 0, w * step * DPR, h * step * DPR);
    ctx.restore();
  }

  toScreen(x, y, G) {
    const g = this.grid;
    const lat = g.lat0 + (g.lat1 - g.lat0) * y / (G.ny - 1);
    const lon = g.lon0 + (g.lon1 - g.lon0) * x / (G.nx - 1);
    const p = this.map.latLngToContainerPoint([lat, lon]);
    return [p.x * DPR, p.y * DPR];
  }

  drawVectors() {
    const l = this.layer, g = this.grid;
    const ctx = this.vec.getContext('2d');
    ctx.clearRect(0, 0, this.vec.width, this.vec.height);
    ctx.save();
    if (l.contour) {
      const f = this.field(l.contour.var);
      if (f) {
        const U = upsample(f, g.nx, g.ny, 4);
        const lv = levels(U.vals, l.contour.step);
        ctx.lineJoin = 'round';
        const labelsDone = [];
        for (const level of lv) {
          const seg = isoline(U.vals, U.nx, U.ny, level);
          const bold = Math.abs(level - l.contour.bold) < 1e-6;
          ctx.strokeStyle = bold ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
          ctx.lineWidth = (bold ? 2.2 : 1.2) * DPR;
          ctx.beginPath();
          for (let k = 0; k < seg.length; k += 4) {
            const [x0, y0] = this.toScreen(seg[k], seg[k + 1], U);
            const [x1, y1] = this.toScreen(seg[k + 2], seg[k + 3], U);
            ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
          }
          ctx.stroke();
          // label: one or two per level, away from other labels
          let placed = 0;
          for (let k = Math.floor(seg.length / 8) * 4; k < seg.length && placed < 2; k += Math.max(4, Math.floor(seg.length / 12) * 4)) {
            const [x, y] = this.toScreen(seg[k], seg[k + 1], U);
            if (x < 30 * DPR || y < 90 * DPR || x > this.vec.width - 30 * DPR || y > this.vec.height - 150 * DPR) continue;
            if (labelsDone.some(([a, b]) => Math.hypot(a - x, b - y) < 70 * DPR)) continue;
            labelsDone.push([x, y]);
            const txt = l.contour.label(level);
            ctx.font = `${11 * DPR}px system-ui, sans-serif`;
            const tw = ctx.measureText(txt).width;
            ctx.fillStyle = 'rgba(11,18,32,0.75)';
            ctx.fillRect(x - tw / 2 - 3 * DPR, y - 8 * DPR, tw + 6 * DPR, 15 * DPR);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(txt, x, y);
            placed++;
          }
        }
      }
    }
    if (l.extrema) {
      const f = this.field(l.extrema.var);
      if (f) {
        const ex = extrema(f, g.nx, g.ny, 2, l.extrema.var.startsWith('pressure') ? 1.5 : 15);
        for (const e of ex) {
          const [x, y] = this.toScreen(e.i, e.j, g);
          const hi = e.type === 'hi';
          ctx.font = `bold ${26 * DPR}px system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 4 * DPR; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.strokeText(hi ? 'H' : 'L', x, y);
          ctx.fillStyle = hi ? '#5BB8FF' : '#FF5A5A';
          ctx.fillText(hi ? 'H' : 'L', x, y);
          ctx.font = `${10 * DPR}px system-ui, sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.fillText(`${hi ? 'רמה' : 'שקע'} ${l.extrema.var.startsWith('pressure') ? Math.round(e.v) : Math.round(e.v / 10)}`, x, y + 18 * DPR);
        }
      }
    }
    if (l.arrows) {
      const D = this.field(l.arrows.dir);
      const S = this.field(l.heat);
      if (D) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.6 * DPR;
        for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
          const d = D[j * g.nx + i];
          if (isNaN(d)) continue;
          const [x, y] = this.toScreen(i, j, g);
          const toward = (d + 180) * Math.PI / 180;
          const len = (8 + Math.min(14, (S ? S[j * g.nx + i] : 1) * 5)) * DPR;
          const dx = Math.sin(toward) * len, dy = -Math.cos(toward) * len;
          ctx.beginPath(); ctx.moveTo(x - dx / 2, y - dy / 2); ctx.lineTo(x + dx / 2, y + dy / 2); ctx.stroke();
          const a = Math.atan2(dy, dx);
          ctx.beginPath();
          ctx.moveTo(x + dx / 2, y + dy / 2);
          ctx.lineTo(x + dx / 2 - Math.cos(a - 0.5) * 5 * DPR, y + dy / 2 - Math.sin(a - 0.5) * 5 * DPR);
          ctx.lineTo(x + dx / 2 - Math.cos(a + 0.5) * 5 * DPR, y + dy / 2 - Math.sin(a + 0.5) * 5 * DPR);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // ---------- particles ----------
  startParticles() {
    this.stopParticles();
    if (!this.uv || !this.grid) return;
    const l = this.layer, g = this.grid;
    const n = g.nx * g.ny;
    const U = this.uv.U.subarray(this.t * n, (this.t + 1) * n);
    const V = this.uv.V.subarray(this.t * n, (this.t + 1) * n);
    const count = Math.min(2600, Math.round(this.W * this.H / 260));
    const ctx = this.part.getContext('2d');
    ctx.clearRect(0, 0, this.part.width, this.part.height);
    // per-pixel row/column -> grid coordinate lookups
    const gxAt = (x) => (this.map.containerPointToLatLng([x, 0]).lng - g.lon0) / (g.lon1 - g.lon0) * (g.nx - 1);
    const gyCache = new Float32Array(Math.ceil(this.H) + 1);
    for (let y = 0; y <= this.H; y++) gyCache[y] = (this.map.containerPointToLatLng([0, y]).lat - g.lat0) / (g.lat1 - g.lat0) * (g.ny - 1);
    const lng0 = this.map.containerPointToLatLng([0, 0]).lng, lng1 = this.map.containerPointToLatLng([this.W, 0]).lng;
    const gx0 = gxAt(0), gxPerPx = (gxAt(this.W) - gx0) / this.W;
    void lng0; void lng1;
    const speedK = 0.045 * (l.particleSpeed || 1);
    const rand = () => ({ x: Math.random() * this.W, y: Math.random() * this.H, age: Math.random() * 80 | 0 });
    this.particles = Array.from({ length: count }, rand);
    const alpha = l.particleAlpha ?? 0.85;
    let last = 0;
    const step = (ts) => {
      this.raf = requestAnimationFrame(step);
      if (ts - last < 30) return; // ~30fps is plenty and saves battery
      last = ts;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(0, 0, this.part.width, this.part.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 1.15 * DPR;
      ctx.beginPath();
      for (const p of this.particles) {
        const yi = p.y | 0;
        const gx = gx0 + p.x * gxPerPx, gy = gyCache[yi < 0 ? 0 : yi > this.H ? this.H | 0 : yi];
        const u = sample(U, g.nx, g.ny, gx, gy), v = sample(V, g.nx, g.ny, gx, gy);
        if (isNaN(u) || isNaN(v) || p.age > 90) { Object.assign(p, rand(), { age: 0 }); continue; }
        const nx = p.x + u * speedK, ny = p.y - v * speedK;
        ctx.moveTo(p.x * DPR, p.y * DPR);
        ctx.lineTo(nx * DPR, ny * DPR);
        p.x = nx; p.y = ny; p.age++;
        if (p.x < 0 || p.y < 0 || p.x > this.W || p.y > this.H) Object.assign(p, rand(), { age: 0 });
      }
      ctx.stroke();
    };
    this.raf = requestAnimationFrame(step);
  }

  stopParticles() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  pause() { this.stopParticles(); this.stopPlay(); }

  // ---------- legend ----------
  renderLegend() {
    const l = this.layer;
    const sc = scales[l.scale];
    this.legend.innerHTML = '';
    if (!sc) return;
    const mid = (sc.lo + sc.hi) / 2;
    const fmt = (v) => (l.valueFmt ? l.valueFmt(v) : round(v, Math.abs(sc.hi - sc.lo) < 10 ? 1 : 0));
    this.legend.append(
      el('div', { class: 'lgtitle' }, `${l.name}${l.unit ? ` (${l.unit})` : ''}`),
      el('div', { class: 'lgbar', style: { background: sc.css() } }),
      el('div', { class: 'lgticks' }, el('span', {}, fmt(sc.lo)), el('span', {}, fmt(mid)), el('span', {}, fmt(sc.hi))),
    );
  }

  // ---------- tap ----------
  async onTap(ll) {
    const lat = ll.lat, lon = ((ll.lng + 540) % 360) - 180;
    if (this.pinMarker) this.map.removeLayer(this.pinMarker);
    this.pinMarker = L.circleMarker([lat, ll.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#3FA9F5', fillOpacity: 1 }).addTo(this.map);
    this.infoCard.classList.add('hidden');
    const l = this.layer;
    const body = el('div', { class: 'sheetbody' }, el('div', { class: 'muted' }, 'טוען…'));
    const close = () => { this.sheet.classList.add('hidden'); if (this.pinMarker) { this.map.removeLayer(this.pinMarker); this.pinMarker = null; } };
    this.sheet.innerHTML = '';
    this.sheet.append(
      el('div', { class: 'sheethead' }, el('b', {}, `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`), el('button', { class: 'x', onclick: close }, '✕')),
      body,
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn small', onclick: () => { close(); this.cb.onLab({ lat, lon, name: `${lat.toFixed(2)}, ${lon.toFixed(2)}` }, 'skewt'); } }, '📈 Skew-T כאן'),
        el('button', { class: 'btn small', onclick: () => { close(); this.cb.onLab({ lat, lon, name: `${lat.toFixed(2)}, ${lon.toFixed(2)}` }, 'models'); } }, '⚖️ השוואת מודלים'),
        el('button', { class: 'btn small', onclick: () => { close(); this.cb.onPlace({ lat, lon, name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, auto: false }); } }, '📍 תחזית למקום הזה')),
    );
    this.sheet.classList.remove('hidden');

    // value of the active layer from the grid
    const rows = [];
    if (this.grid && !l.tiles) {
      const [x, y] = this.gridXY(lat, lon);
      const v = sample(this.field(l.heat), this.grid.nx, this.grid.ny, x, y);
      rows.push(el('div', { class: 'bigval' }, `${l.emoji} ${l.name}: `, el('b', {}, isNaN(v) ? 'אין נתון' : (l.valueFmt ? l.valueFmt(v) : `${round(v, l.unit === 'מ׳' && v < 20 ? 1 : 0)} ${l.unit}`))));
    }
    try {
      const d = await pointNow(lat, ll.lng);
      const h = d.hourly;
      const tt = this.grid ? this.grid.times[this.t] : Date.now() / 1000;
      const i = nearestIndex(h.time, tt);
      const at = new Date(h.time[i] * 1000);
      const kv = (k, v) => el('div', { class: 'kv' }, el('span', {}, k), el('b', {}, v));
      body.innerHTML = '';
      body.append(...rows,
        el('div', { class: 'muted' }, `${relDay(at)} ${hhmm(at)} · גובה הנקודה ${Math.round(d.elevation ?? 0)} מ׳`),
        el('div', { class: 'kvgrid' },
          kv('טמפרטורה', `${round(h.temperature_2m[i])}°`),
          kv('מורגש', `${round(h.apparent_temperature[i])}°`),
          kv('רוח', `${round(h.wind_speed_10m[i])} קמ״ש ${dirName(h.wind_direction_10m[i])}`),
          kv('משבים', `${round(h.wind_gusts_10m[i])} קמ״ש`),
          kv('לחות', `${round(h.relative_humidity_2m[i])}%`),
          kv('נקודת טל', `${round(h.dew_point_2m[i])}°`),
          kv('לחץ', `${round(h.pressure_msl[i])} hPa`),
          kv('עננות', `${round(h.cloud_cover[i])}%`),
          kv('משקעים', `${round(h.precipitation[i], 1)} מ״מ`),
          kv('CAPE', `${round(h.cape[i])} J/kg`),
        ));
    } catch (e) {
      body.innerHTML = '';
      body.append(...rows, el('div', { class: 'muted' }, e.message));
    }
  }

  isSheetOpen() {
    if (!this.sheet.classList.contains('hidden')) { this.sheet.classList.add('hidden'); return true; }
    if (!this.infoCard.classList.contains('hidden')) { this.infoCard.classList.add('hidden'); return true; }
    return false;
  }
}


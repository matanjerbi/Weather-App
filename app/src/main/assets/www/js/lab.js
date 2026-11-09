// Pro lab: Skew-T sounding + model comparison.
import { profile, models, MODELS, LEVELS } from './api.js';
import { dewpoint, parcel, capeCin, dryAdiabat, moistAdiabat, mixing } from './thermo.js';
import { timeChart } from './charts.js';
import { store } from './store.js';
import { el, round, hhmm, relDay, dayName, dirName, nearestIndex, toast } from './util.js';

const DPR = Math.min(2, window.devicePixelRatio || 1);

export class LabView {
  constructor(root, cb) {
    this.root = root;
    this.cb = cb;
    this.tool = 'skewt';
    this.place = null;
    this.explain = true;
    this.hour = 0;
  }

  open(place, tool) {
    if (place) this.place = place;
    if (tool) this.tool = tool;
    this.render();
  }

  render() {
    const p = this.place || store.get().place;
    this.place = p;
    this.root.innerHTML = '';
    const tabs = el('div', { class: 'seg' },
      el('button', { class: this.tool === 'skewt' ? 'on' : '', onclick: () => { this.tool = 'skewt'; this.render(); } }, '📈 Skew-T'),
      el('button', { class: this.tool === 'models' ? 'on' : '', onclick: () => { this.tool = 'models'; this.render(); } }, '⚖️ השוואת מודלים'));
    this.root.append(
      el('div', { class: 'fhead' }, el('div', { class: 'h1' }, '🔬 מעבדה'),
        el('button', { class: 'placebtn small', onclick: () => { this.place = store.get().place; this.render(); } }, '📍 ', p.name)),
      tabs);
    this.body = el('div', {});
    this.root.append(this.body);
    if (this.tool === 'skewt') this.skewt(); else this.modelsView();
  }

  // ───────────── SKEW-T ─────────────
  async skewt() {
    const p = this.place;
    this.body.innerHTML = '';
    this.body.append(el('div', { class: 'card skeleton', style: { height: '420px' } }));
    let d;
    try { d = await profile(p.lat, p.lon); } catch (e) { this.body.innerHTML = ''; this.body.append(el('div', { class: 'card err' }, e.message)); return; }
    const H = d.hourly;
    const now = Date.now() / 1000;
    const startIdx = Math.max(0, nearestIndex(H.time, now));
    const maxH = Math.min(H.time.length - 1, startIdx + 72);
    if (this.hour < startIdx || this.hour > maxH) this.hour = startIdx;

    this.body.innerHTML = '';
    const canvas = el('canvas', { class: 'skewt' });
    const label = el('div', { class: 'tlabel' });
    const slider = el('input', { type: 'range', min: startIdx, max: maxH, value: this.hour, class: 'tslider' });
    const toggle = el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: this.explain ? true : null }), el('span', {}, 'מצב מוסבר'));
    const summary = el('div', { class: 'card' });
    const notes = el('div', { class: 'notes' });
    this.body.append(
      el('div', { class: 'card nopad' }, canvas,
        el('div', { class: 'skewlegend' },
          el('span', { class: 'lg', style: { '--c': '#FF6B6B' } }, 'טמפרטורה'),
          el('span', { class: 'lg', style: { '--c': '#5EE08A' } }, 'נקודת טל'),
          el('span', { class: 'lg dash', style: { '--c': '#FFD166' } }, 'חבילה עולה'),
          el('span', { class: 'lg bar', style: { '--c': 'rgba(255,90,90,0.5)' } }, 'CAPE')),
        el('div', { class: 'timebar inline' }, el('div', { class: 'tcol' }, label, slider)), toggle),
      notes, summary,
      el('button', { class: 'btn block', onclick: () => this.cb.onLesson('skewt') }, '📖 איך קוראים Skew-T?'));

    const draw = () => {
      const i = this.hour;
      const at = new Date(H.time[i] * 1000);
      label.textContent = `${relDay(at)} ${hhmm(at)}`;
      const snd = this.sounding(d, i);
      this.drawSkewT(canvas, snd);
      this.skewSummary(summary, notes, snd);
    };
    slider.addEventListener('input', () => { this.hour = +slider.value; draw(); });
    toggle.querySelector('input').addEventListener('change', (e) => { this.explain = e.target.checked; draw(); });
    requestAnimationFrame(draw);
  }

  sounding(d, i) {
    const H = d.hourly;
    const ps = H.surface_pressure[i] ?? 1013;
    const lv = [];
    lv.push({ p: ps, T: H.temperature_2m[i], Td: H.dew_point_2m[i], z: d.elevation ?? 0, ws: H.wind_speed_10m[i], wd: H.wind_direction_10m[i], sfc: true });
    for (const p of LEVELS) {
      if (p >= ps - 2) continue;
      const T = H[`temperature_${p}hPa`]?.[i], rh = H[`relative_humidity_${p}hPa`]?.[i];
      if (T == null) continue;
      lv.push({ p, T, Td: rh != null ? Math.min(T, dewpoint(T, rh)) : NaN, z: H[`geopotential_height_${p}hPa`]?.[i], ws: H[`wind_speed_${p}hPa`]?.[i], wd: H[`wind_direction_${p}hPa`]?.[i] });
    }
    // fine pressure grid for parcel/CAPE
    const fine = [];
    for (let p = Math.floor(ps); p >= 200; p -= 5) fine.push(p);
    const interp = (key, p) => {
      for (let k = 0; k < lv.length - 1; k++) {
        const a = lv[k], b = lv[k + 1];
        if (p <= a.p && p >= b.p) {
          const t = Math.log(a.p / p) / Math.log(a.p / b.p);
          return a[key] + (b[key] - a[key]) * t;
        }
      }
      return NaN;
    };
    const envFine = fine.map(p => interp('T', p));
    const s = lv[0];
    const par = parcel(s.T, s.Td, s.p, fine);
    const cc = capeCin(fine, envFine, par.temps);
    const zAt = (p) => interp('z', p);
    return { lv, fine, envFine, par, cc, zAt, interp, modelCape: H.cape?.[i], cloud: H.cloud_cover?.[i], elevation: d.elevation ?? 0 };
  }

  drawSkewT(canvas, snd) {
    const W = canvas.clientWidth || 340;
    const Hh = Math.round(W * 1.12);
    canvas.width = W * DPR; canvas.height = Hh * DPR; canvas.style.height = Hh + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    const L = 46, R = 46, T = 10, B = 26;
    const pw = W - L - R, ph = Hh - T - B;
    const pTop = 200, pBot = 1050;
    const Y = (p) => T + (Math.log(p) - Math.log(pTop)) / (Math.log(pBot) - Math.log(pTop)) * ph;
    const Tmin = -40, Tmax = 45;
    const sx = pw / (Tmax - Tmin);
    const X = (t, p) => L + (t - Tmin) * sx + (T + ph - Y(p)) * 0.9;

    ctx.save();
    ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(L, T, pw, ph);
    // isotherms
    for (let t = -120; t <= 50; t += 10) {
      ctx.strokeStyle = t === 0 ? 'rgba(90,170,255,0.6)' : 'rgba(255,255,255,0.10)';
      ctx.lineWidth = t === 0 ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(X(t, pBot), Y(pBot)); ctx.lineTo(X(t, pTop), Y(pTop)); ctx.stroke();
    }
    // dry adiabats
    ctx.strokeStyle = 'rgba(255,170,90,0.16)';
    for (let th = 250; th <= 470; th += 10) {
      ctx.beginPath();
      for (let p = pBot; p >= pTop; p -= 10) { const x = X(dryAdiabat(th, p), p), y = Y(p); p === pBot ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // moist adiabats
    ctx.strokeStyle = 'rgba(94,224,138,0.15)';
    ctx.setLineDash([4, 4]);
    for (let t0 = -10; t0 <= 36; t0 += 4) {
      ctx.beginPath();
      let t = t0, pp = 1050;
      ctx.moveTo(X(t, pp), Y(pp));
      for (let p = 1030; p >= 220; p -= 20) { t = moistAdiabat(t, pp, p, 10); pp = p; ctx.lineTo(X(t, p), Y(p)); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // isobars
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    for (const p of [1000, 925, 850, 700, 500, 400, 300, 250, 200]) { ctx.beginPath(); ctx.moveTo(L, Y(p)); ctx.lineTo(L + pw, Y(p)); ctx.stroke(); }

    const { lv, fine, envFine, par, cc } = snd;
    // CAPE / CIN shading
    const shade = (pos) => {
      ctx.fillStyle = pos ? 'rgba(255,80,80,0.33)' : 'rgba(90,140,255,0.22)';
      let k = 0;
      while (k < fine.length) {
        const ok = (j) => !isNaN(par.temps[j]) && !isNaN(envFine[j]) && (pos ? par.temps[j] > envFine[j] : par.temps[j] < envFine[j] && fine[j] < par.lcl.p + 1 && fine[j] > 400);
        if (!ok(k)) { k++; continue; }
        const a = k;
        while (k < fine.length && ok(k)) k++;
        ctx.beginPath();
        for (let j = a; j < k; j++) ctx.lineTo(X(par.temps[j], fine[j]), Y(fine[j]));
        for (let j = k - 1; j >= a; j--) ctx.lineTo(X(envFine[j], fine[j]), Y(fine[j]));
        ctx.closePath(); ctx.fill();
      }
    };
    if (cc.cape > 10) shade(true);
    if (this.explain && cc.cape > 10) shade(false);

    // moist layers (explain)
    if (this.explain) {
      for (let k = 1; k < lv.length - 1; k++) {
        const a = lv[k];
        if (a.T - a.Td <= 2.5) {
          const yTop = Y((a.p + lv[k + 1].p) / 2), yBot = Y((a.p + lv[k - 1].p) / 2);
          ctx.fillStyle = 'rgba(94,224,138,0.10)';
          ctx.fillRect(L, yTop, pw, yBot - yTop);
        }
      }
    }

    const line = (key, color, w) => {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
      let st = false;
      for (const l of lv) { const v = l[key]; if (v == null || isNaN(v)) continue; const x = X(v, l.p), y = Y(l.p); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
      ctx.stroke();
    };
    line('Td', '#5EE08A', 2.4);
    line('T', '#FF6B6B', 2.6);
    // parcel
    ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 1.8; ctx.setLineDash([6, 4]);
    ctx.beginPath();
    let st = false;
    fine.forEach((p, j) => { const v = par.temps[j]; if (isNaN(v)) return; const x = X(v, p), y = Y(p); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);

    // annotations
    ctx.font = '11px system-ui, sans-serif';
    const tag = (txt, x, y, color) => {
      const w = ctx.measureText(txt).width + 8;
      const xx = Math.min(Math.max(L + 2, x), L + pw - w - 2);
      ctx.fillStyle = 'rgba(11,18,32,0.85)'; ctx.fillRect(xx, y - 8, w, 16);
      ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, xx + 4, y);
    };
    if (this.explain) {
      const lclY = Y(par.lcl.p);
      if (par.lcl.p > pTop) {
        ctx.strokeStyle = 'rgba(255,209,102,0.7)'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(L, lclY); ctx.lineTo(L + pw, lclY); ctx.stroke(); ctx.setLineDash([]);
        const z = snd.zAt(par.lcl.p);
        tag(`בסיס ענן (LCL) ${isNaN(z) ? '' : '~' + Math.round(z / 50) * 50 + ' מ׳'}`, X(par.lcl.T, par.lcl.p) + 8, lclY - 10, '#FFD166');
      }
      let invDone = 0;
      for (let k = 0; k < lv.length - 1 && invDone < 2; k++) {
        const a = lv[k], b = lv[k + 1];
        if (b.T > a.T + 0.3 && a.p > 500) { tag('היפוך ↑ (שכבה יציבה)', X(b.T, b.p) + 10, Y((a.p + b.p) / 2), '#FF9F9F'); invDone++; }
      }
      let moistDone = false;
      for (let k = 1; k < lv.length && !moistDone; k++) {
        const a = lv[k];
        if (a.T - a.Td <= 2.5 && a.p >= 300) { tag('לח — כנראה ענן', L + 4, Y(a.p), '#8FF0B0'); moistDone = true; }
      }
      // freezing level
      for (let k = 0; k < lv.length - 1; k++) {
        const a = lv[k], b = lv[k + 1];
        if (a.T > 0 && b.T <= 0) {
          const t = a.T / (a.T - b.T), p = Math.exp(Math.log(a.p) + (Math.log(b.p) - Math.log(a.p)) * t);
          const z = snd.zAt(p);
          tag(`0° בגובה ~${isNaN(z) ? '?' : Math.round(z / 100) * 100} מ׳`, X(0, p) + 6, Y(p) + 12, '#8FC8FF');
          break;
        }
      }
      if (cc.cape > 50) {
        const j = par.temps.findIndex((v, k) => v > envFine[k] && fine[k] < par.lcl.p);
        if (j > 0) tag(`CAPE ≈ ${cc.cape}`, X(par.temps[j], fine[j]) + 10, Y(fine[j]) - 14, '#FF8080');
      }
    }
    ctx.restore();

    // axes labels
    ctx.fillStyle = 'rgba(200,215,235,0.8)'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const zLbl = { 1000: '0.1', 850: '1.5', 700: '3', 500: '5.5', 300: '9', 200: '12' };
    for (const p of [1000, 850, 700, 500, 300, 200]) {
      ctx.fillText(String(p), L - 4, Y(p) - 5);
      ctx.fillStyle = 'rgba(200,215,235,0.45)'; ctx.fillText(`${zLbl[p]} ק״מ`, L - 4, Y(p) + 7); ctx.fillStyle = 'rgba(200,215,235,0.8)';
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let t = -30; t <= 40; t += 10) { const x = X(t, pBot); if (x > L && x < L + pw) ctx.fillText(`${t}°`, x, Hh - 8); }

    // wind barbs
    const bx = L + pw + 24;
    ctx.strokeStyle = '#DDE7F5'; ctx.fillStyle = '#DDE7F5'; ctx.lineWidth = 1.4;
    for (const l of lv) {
      if (l.ws == null || l.wd == null || l.p < pTop) continue;
      this.barb(ctx, bx, Y(l.p), l.ws / 1.852, l.wd);
    }
  }

  barb(ctx, x, y, kt, dirFrom) {
    const len = 22;
    const r = dirFrom * Math.PI / 180;
    const ux = Math.sin(r), uy = -Math.cos(r); // points toward where wind comes FROM
    if (kt < 2.5) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke(); return; }
    const tx = x + ux * len, ty = y + uy * len;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
    let k = Math.round(kt / 5) * 5;
    let pos = 0;
    const px = -uy, py = ux; // perpendicular
    const at = (d) => [tx - ux * d, ty - uy * d];
    while (k >= 50) { const [ax, ay] = at(pos), [bx2, by2] = at(pos + 6); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + px * 9, ay + py * 9); ctx.lineTo(bx2, by2); ctx.fill(); pos += 8; k -= 50; }
    while (k >= 10) { const [ax, ay] = at(pos); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + px * 9 + ux * 3, ay + py * 9 + uy * 3); ctx.stroke(); pos += 4; k -= 10; }
    if (k >= 5) { const [ax, ay] = at(pos === 0 ? 4 : pos); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + px * 5 + ux * 2, ay + py * 5 + uy * 2); ctx.stroke(); }
  }

  skewSummary(card, notes, snd) {
    const { lv, par, cc, interp } = snd;
    const T850 = interp('T', 850), T700 = interp('T', 700), T500 = interp('T', 500);
    const Td850 = interp('Td', 850), Td700 = interp('Td', 700);
    const Kidx = (T850 - T500) + Td850 - (T700 - Td700);
    const j500 = snd.fine.findIndex(p => p <= 500);
    const LI = j500 >= 0 ? T500 - par.temps[j500] : NaN;
    const lclZ = snd.zAt(par.lcl.p);
    const lclAGL = isNaN(lclZ) ? NaN : lclZ - snd.elevation;
    const kv = (k, v, sub) => el('div', { class: 'kv' }, el('span', {}, k), el('b', {}, v), sub ? el('small', { class: 'muted' }, sub) : null);
    card.innerHTML = '';
    card.append(el('div', { class: 'cardtitle' }, 'מדדים'),
      kv('CAPE (המודל)', `${round(snd.modelCape)} J/kg`, snd.modelCape >= 1000 ? 'גבוה' : snd.modelCape >= 300 ? 'בינוני' : 'נמוך'),
      kv('CAPE (חבילה מהקרקע)', `${cc.cape} J/kg`, cc.cin < -25 ? `CIN ${cc.cin}` : ''),
      kv('Lifted Index', isNaN(LI) ? '–' : LI.toFixed(1), isNaN(LI) ? '' : LI < -4 ? 'לא יציב מאוד' : LI < 0 ? 'לא יציב' : LI < 3 ? 'יציב חלקית' : 'יציב'),
      kv('K-Index', isNaN(Kidx) ? '–' : Kidx.toFixed(0), Kidx >= 30 ? 'סיכוי גבוה לרעמים' : Kidx >= 20 ? 'סיכוי בינוני' : 'נמוך'),
      kv('בסיס ענן (LCL)', isNaN(lclAGL) ? '–' : `${Math.round(lclAGL / 50) * 50} מ׳ מעל הקרקע`),
      kv('T 850 / T 500', `${round(T850)}° / ${round(T500)}°`, `הפרש ${round(T850 - T500)}°`));
    notes.innerHTML = '';
    if (!this.explain) return;
    const msgs = [];
    const moist = lv.filter((l, k) => k > 0 && l.T - l.Td <= 2.5).map(l => l.p);
    if (moist.length) msgs.push(`☁️ האוויר כמעט רווי ב-${moist.slice(0, 3).join(', ')} hPa — שם צפויים עננים.`);
    const dry = lv.filter((l, k) => k > 0 && l.T - l.Td >= 15 && l.p >= 400);
    if (dry.length >= 2) msgs.push('🏜️ יש שכבות יבשות מאוד (פער גדול בין האדום לירוק) — אוויר ששוקע, כנראה רמה בגובה.');
    if (cc.cape > 500) msgs.push(`⚡ CAPE של ${cc.cape}: חבילה שתתחיל לעלות תמשיך לבד עד גובה רב. אם יש מנגנון הרמה, יכולות להיווצר סופות.`);
    else if (cc.cape > 50) msgs.push('🌤️ קצת CAPE — מספיק לענני קומולוס, לא לסופות רציניות.');
    else msgs.push('🧱 אין CAPE: החבילה קרה מהסביבה ותשקע חזרה. אטמוספרה יציבה.');
    const inv = lv.some((l, k) => k < lv.length - 1 && lv[k + 1].T > l.T + 0.3 && l.p > 500);
    if (inv) msgs.push('🔒 יש היפוך טמפרטורה בשכבות הנמוכות. הוא "סוגר" את האוויר למטה, ולכן מתאספים מתחתיו אובך, זיהום או עננות נמוכה.');
    const w850 = lv.find(l => l.p === 850), w500 = lv.find(l => l.p === 500);
    if (w850 && w500 && w850.wd != null && w500.wd != null) msgs.push(`🧭 ב-850 הרוח ${dirName(w850.wd)} ${round(w850.ws)} קמ״ש, וב-500 ${dirName(w500.wd)} ${round(w500.ws)} קמ״ש.`);
    notes.append(el('div', { class: 'card' }, el('div', { class: 'cardtitle' }, '🎓 מה רואים כאן'), ...msgs.map(m => el('p', {}, m))));
  }

  // ───────────── MODELS ─────────────
  async modelsView() {
    const p = this.place;
    this.body.innerHTML = '';
    this.body.append(el('div', { class: 'card skeleton', style: { height: '320px' } }));
    let d;
    try { d = await models(p.lat, p.lon); } catch (e) { this.body.innerHTML = ''; this.body.append(el('div', { class: 'card err' }, e.message)); toast(e.message); return; }
    this.body.innerHTML = '';
    const H = d.hourly, D = d.daily;
    const key = (base, m) => `${base}_${m.id}`;
    const charts = [
      { title: 'טמפרטורה', base: 'temperature_2m', fmt: (v) => `${Math.round(v)}°` },
      { title: 'רוח (קמ״ש)', base: 'wind_speed_10m', fmt: (v) => Math.round(v) },
      { title: 'לחץ (hPa)', base: 'pressure_msl', fmt: (v) => Math.round(v) },
    ];
    this.body.append(el('div', { class: 'card' },
      el('p', { class: 'hint' }, 'כל קו הוא מודל אחר. איפה שהקווים צמודים — הביטחון בתחזית גבוה. איפה שהם מתפצלים — האטמוספרה "רגישה" והתחזית פחות ודאית.'),
      el('div', { class: 'legendrow' }, ...MODELS.map(m => el('span', { class: 'lg', style: { '--c': m.color } }, m.name)))));
    for (const c of charts) {
      const cv = el('canvas', { class: 'chart' });
      this.body.append(el('div', { class: 'card' }, el('div', { class: 'cardtitle' }, c.title), cv));
      requestAnimationFrame(() => timeChart(cv, {
        times: H.time, height: 150, nowT: Date.now() / 1000, yFmt: c.fmt,
        series: MODELS.map(m => ({ values: H[key(c.base, m)] || [], color: m.color, width: 2 })),
      }));
    }
    // daily agreement table
    const rows = D.time.map((t, i) => {
      const tx = MODELS.map(m => D[key('temperature_2m_max', m)]?.[i]).filter(v => v != null);
      const pr = MODELS.map(m => D[key('precipitation_sum', m)]?.[i]).filter(v => v != null);
      const spread = tx.length ? Math.max(...tx) - Math.min(...tx) : NaN;
      const wet = pr.filter(v => v >= 1).length, dry = pr.filter(v => v < 0.2).length;
      let agree = spread <= 2 ? 'high' : spread <= 4 ? 'mid' : 'low';
      if (wet && dry) agree = agree === 'high' ? 'mid' : 'low';
      return { t, tx, pr, spread, agree, rainFight: wet && dry };
    });
    const badge = { high: ['הסכמה גבוהה', 'ok'], mid: ['הסכמה בינונית', 'mid'], low: ['מחלוקת', 'bad'] };
    this.body.append(el('div', { class: 'card' },
      el('div', { class: 'cardtitle' }, 'יום-יום: מקסימום וגשם לפי כל מודל'),
      el('div', { class: 'mtable' },
        el('div', { class: 'mrow head' }, el('span', {}, 'יום'), ...MODELS.map(m => el('span', { style: { color: m.color } }, m.name)), el('span', {}, '')),
        ...rows.map(r => el('div', { class: 'mrow' },
          el('span', {}, relDay(new Date(r.t * 1000)) === 'היום' ? 'היום' : dayName(new Date(r.t * 1000), true)),
          ...MODELS.map(m => {
            const i = D.time.indexOf(r.t);
            const tx = D[key('temperature_2m_max', m)]?.[i], pr = D[key('precipitation_sum', m)]?.[i];
            return el('span', {}, tx == null ? '–' : `${round(tx)}°`, pr >= 0.5 ? el('small', { class: 'rainval' }, ` ${round(pr, 1)}מ״מ`) : null);
          }),
          el('span', { class: `badge ${badge[r.agree][1]}` }, r.rainFight ? 'ויכוח על גשם' : badge[r.agree][0])))),
      el('p', { class: 'hint' }, 'שים לב איך המחלוקת גדלה ככל שמתרחקים בזמן — זה הכאוס של האטמוספרה בפעולה.')));
    this.body.append(el('div', { class: 'card' }, el('div', { class: 'cardtitle' }, 'מי זה מי'),
      ...MODELS.map(m => el('p', {}, el('b', { style: { color: m.color } }, m.name), ' — ', m.desc))),
    el('button', { class: 'btn block', onclick: () => this.cb.onLesson('models') }, '📖 שיעור: מודלים ואי-ודאות'));
  }
}

void mixing;

// Forecast screen for the chosen place.
import { forecast, geocode, reverseName } from './api.js';
import { prepare, dayStats } from './wx.js';
import { insights } from './insights.js';
import { rideScore, bestWindows } from './moto.js';
import { timeChart } from './charts.js';
import { store } from './store.js';
import { native, syncNative } from './native.js';
import { el, icon, wmoText, round, dirName, hhmm, relDay, dayName, beaufort, toast, WMO_EMOJI, wmoKind, clamp } from './util.js';

export class ForecastView {
  constructor(root, cb) {
    this.root = root;
    this.cb = cb; // { onMap(layer), onLesson(id), onLab(place, tool), onPlaceChanged(place), openSettings() }
    this.data = null;
  }

  async load(force = false) {
    const p = store.get().place;
    if (!this.data || force) this.renderSkeleton(p);
    try {
      const d = await forecast(p.lat, p.lon);
      this.data = d;
      this.render(p, d);
      syncNative(p, d);
    } catch (e) {
      this.root.innerHTML = '';
      this.root.append(this.header(p), el('div', { class: 'card err' }, el('b', {}, 'לא הצלחתי לטעון תחזית'), el('p', {}, e.message),
        el('button', { class: 'btn primary', onclick: () => this.load(true) }, 'נסה שוב')));
    }
  }

  header(p) {
    return el('div', { class: 'fhead' },
      el('button', { class: 'placebtn', onclick: () => this.openPlaces() }, el('span', { class: 'pin' }, p.auto ? '📍' : '📌'), ' ', p.name, ' ▾'),
      el('div', { class: 'row' },
        el('button', { class: 'iconbtn', 'aria-label': 'מיקום נוכחי', onclick: () => this.useGps() }, '◎'),
        el('button', { class: 'iconbtn', 'aria-label': 'הגדרות', onclick: () => this.cb.openSettings() }, '⚙')));
  }

  renderSkeleton(p) {
    this.root.innerHTML = '';
    this.root.append(this.header(p), el('div', { class: 'hero skeleton' }), el('div', { class: 'card skeleton', style: { height: '120px' } }));
  }

  render(p, d) {
    const fx = prepare(d);
    this.fx = fx;
    const c = fx.cur;
    const today = fx.days[fx.todayIdx] || {};
    const root = this.root;
    root.innerHTML = '';
    root.append(this.header(p));
    if (d._offline) root.append(el('div', { class: 'banner' }, 'אין חיבור — מוצגת התחזית האחרונה ששמרתי'));

    // HERO
    const isDay = c.is_day ?? 1;
    root.append(el('div', { class: `hero k-${wmoKind(c.weather_code)} ${isDay ? 'day' : 'night'}` },
      el('div', { class: 'heroicon', html: icon(c.weather_code, isDay, 96) }),
      el('div', { class: 'herotxt' },
        el('div', { class: 'bigtemp' }, `${round(c.temperature_2m)}°`),
        el('div', { class: 'herodesc' }, wmoText(c.weather_code)),
        el('div', { class: 'muted' }, `מורגש ${round(c.apparent_temperature)}° · ${round(today.temperature_2m_max)}° / ${round(today.temperature_2m_min)}°`),
        el('div', { class: 'muted' }, `רוח ${round(c.wind_speed_10m)} קמ״ש מ${dirName(c.wind_direction_10m)} · לחות ${round(c.relative_humidity_2m)}%`))));

    // Nowcast from minutely data
    const nc = this.nowcast(d);
    if (nc) root.append(el('div', { class: 'banner rain' }, nc));

    // WHY TODAY
    const ins = insights(fx);
    const top = ins[0];
    const insCard = el('div', { class: 'card insight' },
      el('div', { class: 'eyebrow' }, '🎓 למה היום ככה?'),
      el('div', { class: 'institle' }, `${top.emoji} ${top.title}`),
      el('p', {}, top.text),
      el('div', { class: 'row wrap' },
        top.layer ? el('button', { class: 'btn small primary', onclick: () => this.cb.onMap(top.layer) }, '🗺️ תראה במפה') : null,
        top.lesson ? el('button', { class: 'btn small', onclick: () => this.cb.onLesson(top.lesson) }, '📖 לשיעור') : null),
    );
    if (ins.length > 1) {
      const more = el('div', { class: 'moreins hidden' }, ...ins.slice(1, 3).map(x => el('div', { class: 'subins' },
        el('b', {}, `${x.emoji} ${x.title}`), el('p', {}, x.text),
        el('div', { class: 'row wrap' },
          x.layer ? el('button', { class: 'btn small', onclick: () => this.cb.onMap(x.layer) }, 'במפה') : null,
          x.lesson ? el('button', { class: 'btn small', onclick: () => this.cb.onLesson(x.lesson) }, 'לשיעור') : null))));
      insCard.append(more, el('button', { class: 'linkbtn', onclick: (e) => { more.classList.toggle('hidden'); e.target.textContent = more.classList.contains('hidden') ? `עוד ${Math.min(2, ins.length - 1)} הסברים ›` : 'פחות'; } }, `עוד ${Math.min(2, ins.length - 1)} הסברים ›`));
    }
    root.append(insCard);

    // HOURLY STRIP
    const next = fx.future.slice(0, 25);
    root.append(el('div', { class: 'card' },
      el('div', { class: 'cardtitle' }, 'השעות הקרובות'),
      el('div', { class: 'hstrip' }, ...next.map((h, i) => el('div', { class: 'hcol' },
        el('div', { class: 'hh' }, i === 0 ? 'עכשיו' : hhmm(new Date(h.t * 1000))),
        el('div', { html: icon(h.weather_code, h.is_day, 32) }),
        el('div', { class: 'ht' }, `${round(h.temperature_2m)}°`),
        el('div', { class: 'hp' }, h.precipitation_probability >= 10 ? `💧${round(h.precipitation_probability)}%` : ' '),
        el('div', { class: 'hw' }, el('span', { class: 'arrow', style: { transform: `rotate(${(h.wind_direction_10m + 180) % 360}deg)` } }, '↑'), ` ${round(h.wind_speed_10m)}`),
      )))));

    // CHART
    const c48 = fx.future.slice(0, 49);
    const canvas = el('canvas', { class: 'chart' });
    root.append(el('div', { class: 'card' },
      el('div', { class: 'cardtitle' }, '48 שעות: טמפרטורה, נקודת טל וגשם'),
      canvas,
      el('div', { class: 'legendrow' },
        el('span', { class: 'lg', style: { '--c': '#FF8A4C' } }, 'טמפרטורה'),
        el('span', { class: 'lg dash', style: { '--c': '#5EE08A' } }, 'נקודת טל'),
        el('span', { class: 'lg bar', style: { '--c': '#3FA9F5' } }, 'גשם')),
      el('p', { class: 'hint' }, 'כשהקו הכתום והירוק מתקרבים, האוויר מתקרב לרוויה: עננים נמוכים, ערפל או טל.')));
    requestAnimationFrame(() => timeChart(canvas, {
      times: c48.map(h => h.t), height: 170, nowT: Date.now() / 1000,
      series: [
        { values: c48.map(h => h.dew_point_2m), color: '#5EE08A', width: 1.6, dash: [5, 4] },
        { values: c48.map(h => h.temperature_2m), color: '#FF8A4C', width: 2.4 },
      ],
      bars: { values: c48.map(h => h.precipitation), color: 'rgba(63,169,245,0.75)', max: 4 },
      yFmt: (v) => `${Math.round(v)}°`,
    }));

    // MOTO
    if (store.get().moto.enabled) root.append(this.motoCard(fx));

    // DETAILS
    root.append(this.details(fx, d));

    // 7 DAYS
    const days = fx.days.slice(fx.todayIdx, fx.todayIdx + 7);
    const tmin = Math.min(...days.map(x => x.temperature_2m_min)), tmax = Math.max(...days.map(x => x.temperature_2m_max));
    root.append(el('div', { class: 'card' },
      el('div', { class: 'cardtitle' }, '7 ימים'),
      ...days.map((x, i) => {
        const a = (x.temperature_2m_min - tmin) / (tmax - tmin || 1) * 100, b = (x.temperature_2m_max - tmin) / (tmax - tmin || 1) * 100;
        const row = el('div', { class: 'drow' },
          el('div', { class: 'dname' }, i === 0 ? 'היום' : dayName(new Date(x.t * 1000))),
          el('div', { html: icon(x.weather_code, 1, 30) }),
          el('div', { class: 'dp' }, x.precipitation_probability_max >= 10 ? `💧${round(x.precipitation_probability_max)}%` : ''),
          el('div', { class: 'dmin' }, `${round(x.temperature_2m_min)}°`),
          el('div', { class: 'dbar' }, el('span', { style: { right: a + '%', width: Math.max(4, b - a) + '%' } })),
          el('div', { class: 'dmax' }, `${round(x.temperature_2m_max)}°`));
        const det = el('div', { class: 'ddet hidden' },
          `${wmoText(x.weather_code)} · רוח עד ${round(x.wind_speed_10m_max)} קמ״ש (${dirName(x.wind_direction_10m_dominant)}) · משבים ${round(x.wind_gusts_10m_max)} · גשם ${round(x.precipitation_sum, 1)} מ״מ · UV ${round(x.uv_index_max)}`);
        row.addEventListener('click', () => det.classList.toggle('hidden'));
        return el('div', {}, row, det);
      })));

    root.append(el('div', { class: 'row wrap center pad' },
      el('button', { class: 'btn', onclick: () => this.cb.onLab(p, 'models') }, '⚖️ מה אומרים המודלים?'),
      el('button', { class: 'btn', onclick: () => this.cb.onLab(p, 'skewt') }, '📈 Skew-T למקום הזה')));
    const upd = new Date((c.time || Date.now() / 1000) * 1000);
    root.append(el('div', { class: 'foot' }, `נתונים: Open-Meteo · עודכן ${hhmm(upd)}`));
  }

  nowcast(d) {
    const m = d.minutely_15;
    if (!m) return null;
    const now = Date.now() / 1000;
    const idx = m.time.findIndex(t => t > now);
    if (idx < 0) return null;
    const nowRain = (m.precipitation[idx - 1] || 0) >= 0.1;
    for (let k = idx; k < Math.min(m.time.length, idx + 8); k++) {
      const v = m.precipitation[k] || 0;
      const mins = Math.max(15, Math.round((m.time[k] - now) / 60));
      if (!nowRain && v >= 0.1) return `🌧️ גשם צפוי להתחיל בעוד כ-${mins} דקות`;
      if (nowRain && v < 0.05) return `🌤️ הגשם צפוי להיפסק בעוד כ-${mins} דקות`;
    }
    if (nowRain) return '🌧️ יורד גשם, וימשיך גם בשעתיים הקרובות';
    return null;
  }

  motoCard(fx) {
    const now = rideScore(fx.future[0]);
    const todayHrs = fx.future.filter(h => h.t < fx.days[fx.todayIdx + 1]?.t);
    const tomHrs = fx.hoursOfDay(fx.todayIdx + 1);
    const wT = bestWindows(todayHrs), wM = bestWindows(tomHrs);
    const fmtW = (w) => w.length ? w.slice(0, 2).map(x => `${hhmm(new Date(x.from * 1000))}–${hhmm(new Date(x.to * 1000))}`).join(', ') : 'אין חלון טוב';
    const color = now.score >= 80 ? '#5EE08A' : now.score >= 60 ? '#E3D23B' : now.score >= 40 ? '#F5A623' : '#FF5A5A';
    const strip = el('div', { class: 'motostrip' }, ...fx.future.slice(0, 24).map(h => {
      const s = rideScore(h).score;
      return el('span', { title: hhmm(new Date(h.t * 1000)), style: { background: s >= 80 ? '#5EE08A' : s >= 60 ? '#E3D23B' : s >= 40 ? '#F5A623' : '#FF5A5A' } });
    }));
    return el('div', { class: 'card moto' },
      el('div', { class: 'cardtitle' }, '🏍️ מצב אופנוע'),
      el('div', { class: 'motonow' },
        el('div', { class: 'motoscore', style: { borderColor: color, color } }, now.score),
        el('div', {}, el('b', {}, now.verdict), el('div', { class: 'muted' }, now.why.length ? now.why.join(' · ') : 'אין גורמים מפריעים'))),
      el('div', { class: 'muted small' }, '24 השעות הקרובות:'),
      strip,
      el('div', { class: 'kv' }, el('span', {}, 'הכי טוב היום'), el('b', {}, fmtW(wT))),
      el('div', { class: 'kv' }, el('span', {}, 'הכי טוב מחר'), el('b', {}, fmtW(wM))));
  }

  details(fx, d) {
    const c = fx.cur, h = fx.future[0];
    const today = fx.days[fx.todayIdx] || {};
    const trend = c.pressureTrend;
    const trendTxt = trend == null ? '' : trend > 1 ? `↑ עולה (${trend.toFixed(1)}+ ב-3 שע׳)` : trend < -1 ? `↓ יורד (${trend.toFixed(1)} ב-3 שע׳)` : '→ יציב';
    const bf = beaufort(c.wind_speed_10m);
    const tile = (title, value, sub, explain, extra) => {
      const ex = el('div', { class: 'texp hidden' }, explain);
      const t = el('div', { class: 'tile' }, el('div', { class: 'ttitle' }, title, el('span', { class: 'q' }, '?')), el('div', { class: 'tval' }, value), sub ? el('div', { class: 'tsub' }, sub) : null, extra || null, ex);
      t.addEventListener('click', () => ex.classList.toggle('hidden'));
      return t;
    };
    const compass = el('div', { class: 'compass' }, el('span', { class: 'needle', style: { transform: `rotate(${(c.wind_direction_10m + 180) % 360}deg)` } }), el('i', { class: 'n' }, 'צ'));
    const sunrise = today.sunrise ? hhmm(new Date(today.sunrise * 1000)) : '–', sunset = today.sunset ? hhmm(new Date(today.sunset * 1000)) : '–';
    const cl = (v) => el('div', { class: 'clbar' }, el('span', { style: { width: clamp(v || 0, 0, 100) + '%' } }));
    const vis = h.visibility;
    const st = dayStats(fx.hoursOfDay(fx.todayIdx));
    return el('div', { class: 'card' },
      el('div', { class: 'cardtitle' }, 'פרטים — לחץ על כל אחד להסבר'),
      el('div', { class: 'tiles' },
        tile('רוח', `${round(c.wind_speed_10m)} קמ״ש`, `מ${dirName(c.wind_direction_10m)} (${round(c.wind_direction_10m)}°) · בופור ${bf.force}: ${bf.name}`,
          'החץ מראה לאן הרוח נושבת, והאות מראה מאיפה היא באה. רוח מערבית מגיעה מהים, ורוח מזרחית מהמדבר.', compass),
        tile('משבים', `${round(c.wind_gusts_10m)} קמ״ש`, `פי ${(c.wind_gusts_10m / Math.max(1, c.wind_speed_10m)).toFixed(1)} מהרוח`, 'שיא הרוח לכמה שניות. יחס גבוה בין משבים לרוח = אוויר סוער ולא יציב.'),
        tile('לחות', `${round(c.relative_humidity_2m)}%`, st.rhMinDay < 100 ? `מינימום היום ${round(st.rhMinDay)}%` : null, 'כמה אדים יש באוויר ביחס למקסימום בטמפרטורה הזו. בלילה היא עולה כי האוויר מתקרר.'),
        tile('נקודת טל', `${round(c.dew_point_2m ?? h.dew_point_2m)}°`, (c.dew_point_2m ?? h.dew_point_2m) >= 20 ? 'מחניק' : (c.dew_point_2m ?? h.dew_point_2m) >= 15 ? 'לח' : (c.dew_point_2m ?? h.dew_point_2m) >= 5 ? 'נעים' : 'יבש מאוד',
          'הטמפרטורה שבה האוויר יתעבה. מודדת את כמות המים בפועל: מעל 20° דביק, מתחת ל-5° יבש.'),
        tile('לחץ', `${round(c.pressure_msl)} hPa`, trendTxt, 'לחץ יורד = מערכת מתקרבת, לרוב עננים ורוח. לחץ עולה = התבהרות ויציבות. הממוצע הוא 1013.'),
        tile('UV', `${round(h.uv_index, 1)}`, (today.uv_index_max != null ? `שיא היום ${round(today.uv_index_max)}` : null), 'מעל 3 צריך הגנה. מעל 8 אפשר להיכוות תוך פחות מ-20 דקות.'),
        tile('ראות', vis >= 1000 ? `${round(vis / 1000, 1)} ק״מ` : `${round(vis)} מ׳`, vis < 1000 ? 'ערפל!' : vis < 5000 ? 'אובך / ערפילי' : 'טובה', 'כמה רחוק אפשר לראות. מתחת ל-1 ק״מ = ערפל. אבק ולחות גבוהה מורידים ראות.'),
        tile('עננות', `${round(c.cloud_cover)}%`, null, 'נמוכים: עד 2 ק״מ (סטרטוס, קומולוס). בינוניים: 2–6 ק״מ. גבוהים: מעל 6 ק״מ (צירוס, עשויים קרח).',
          el('div', { class: 'cls' }, el('small', {}, 'גבוהים'), cl(h.cloud_cover_high), el('small', {}, 'בינוניים'), cl(h.cloud_cover_mid), el('small', {}, 'נמוכים'), cl(h.cloud_cover_low))),
        tile('CAPE', `${round(st.capeMax)} J/kg`, st.capeMax >= 1000 ? 'גבוה — סופות אפשריות' : st.capeMax >= 300 ? 'בינוני' : 'נמוך — יציב', 'שיא האנרגיה היום לעליית אוויר. מעל 500 יכולות להתפתח סופות רעמים.'),
        tile('גובה האפס', `${round(h.freezing_level_height)} מ׳`, h.freezing_level_height < 1000 ? 'שלג אפשרי בהרים' : null, 'הגובה שבו הטמפרטורה 0°. מתחת לגובה ההר + משקעים = שלג.'),
        tile('שמש', `${sunrise} – ${sunset}`, `${round((today.sunset - today.sunrise) / 3600, 1)} שעות אור`, 'זריחה ושקיעה. אורך היום משתנה בישראל בין כ-10 שעות בדצמבר לכ-14 שעות ביוני.'),
        tile('גובה המקום', `${round(d.elevation)} מ׳`, null, 'הגובה לפי המודל. כל 100 מ׳ גובה ≈ 0.65° פחות.'),
      ));
  }

  // ---------- places ----------
  openPlaces() {
    const st = store.get();
    const input = el('input', { class: 'search', placeholder: 'חפש עיר או ישוב…', type: 'search' });
    const list = el('div', { class: 'plist' });
    const choose = (pl) => {
      const places = [pl, ...st.places.filter(x => x.name !== pl.name)].slice(0, 8);
      store.set({ place: { ...pl, auto: false }, places });
      close();
      this.cb.onPlaceChanged(store.get().place);
    };
    const renderList = (items) => {
      list.innerHTML = '';
      items.forEach(pl => list.append(el('button', { class: 'pitem', onclick: () => choose(pl) }, el('b', {}, pl.name), pl.sub ? el('span', { class: 'muted' }, ' ' + pl.sub) : null)));
    };
    renderList(st.places);
    let h;
    input.addEventListener('input', () => {
      clearTimeout(h);
      const q = input.value.trim();
      if (q.length < 2) return renderList(st.places);
      h = setTimeout(async () => {
        try { renderList(await geocode(q)); } catch (e) { list.innerHTML = ''; list.append(el('div', { class: 'muted' }, e.message)); }
      }, 350);
    });
    const modal = el('div', { class: 'modal' }, el('div', { class: 'mbox' },
      el('div', { class: 'ichead' }, el('b', {}, 'בחירת מקום'), el('button', { class: 'x', onclick: () => close() }, '✕')),
      el('button', { class: 'btn primary block', onclick: () => { close(); this.useGps(); } }, '◎ המיקום הנוכחי שלי'),
      input, list));
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.body.append(modal);
    window._closeModal = close;
    setTimeout(() => input.focus(), 100);
  }

  useGps(silent = false) {
    if (!navigator.geolocation) { if (!silent) toast('אין גישה למיקום'); return; }
    if (!silent) toast('מאתר מיקום…', 1500);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      const name = (await reverseName(lat, lon)) || 'המיקום שלי';
      store.set({ place: { name, lat, lon, auto: true } });
      this.cb.onPlaceChanged(store.get().place);
    }, () => { if (!silent) toast('לא הצלחתי לקבל מיקום. בדוק שההרשאה פעילה'); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60e3 });
  }
}

void native; void relDay; void WMO_EMOJI;

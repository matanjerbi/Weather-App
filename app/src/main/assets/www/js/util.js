// Small shared helpers: formatting, weather codes, icons, DOM.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const round = (v, d = 0) => (v == null || isNaN(v) ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toString());

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function dayName(d, short = false) {
  return (short ? DAYS_SHORT : DAYS)[d.getDay()];
}
export function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function relDay(d, now = new Date()) {
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  return 'יום ' + dayName(d);
}
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Wind direction (meteorological "from") -> Hebrew compass name
const DIRS = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב'];
const DIRS_SHORT = ['צ', 'צ״מ', 'מז', 'ד״מ', 'ד', 'ד״מע', 'מע', 'צ״מע'];
export function dirName(deg, short = false) {
  if (deg == null || isNaN(deg)) return '–';
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return (short ? DIRS_SHORT : DIRS)[i];
}

export function beaufort(kmh) {
  const limits = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  const names = ['שקט', 'משב קל מאוד', 'רוח קלה', 'רוח חלשה', 'רוח מתונה', 'רוח בינונית', 'רוח חזקה',
    'רוח חזקה מאוד', 'סערה', 'סערה חזקה', 'סערה עזה', 'סופה', 'הוריקן'];
  let b = 0;
  while (b < limits.length && kmh >= limits[b]) b++;
  return { force: b, name: names[b] };
}

export const WMO = {
  0: ['שמיים בהירים', 'clear'], 1: ['בהיר ברובו', 'mostly'], 2: ['מעונן חלקית', 'partly'], 3: ['מעונן', 'cloud'],
  45: ['ערפל', 'fog'], 48: ['ערפל עם כפור', 'fog'],
  51: ['טפטוף קל', 'drizzle'], 53: ['טפטוף', 'drizzle'], 55: ['טפטוף חזק', 'drizzle'],
  56: ['טפטוף קופא', 'drizzle'], 57: ['טפטוף קופא', 'drizzle'],
  61: ['גשם קל', 'rain'], 63: ['גשם', 'rain'], 65: ['גשם חזק', 'rain'],
  66: ['גשם קופא', 'rain'], 67: ['גשם קופא', 'rain'],
  71: ['שלג קל', 'snow'], 73: ['שלג', 'snow'], 75: ['שלג כבד', 'snow'], 77: ['פתיתי שלג', 'snow'],
  80: ['ממטרים קלים', 'rain'], 81: ['ממטרים', 'rain'], 82: ['ממטרים עזים', 'rain'],
  85: ['ממטרי שלג', 'snow'], 86: ['ממטרי שלג', 'snow'],
  95: ['סופת רעמים', 'storm'], 96: ['סופת רעמים וברד', 'storm'], 99: ['סופת רעמים וברד', 'storm'],
};
export const wmoText = (c) => (WMO[c] || ['–'])[0];
export const wmoKind = (c) => (WMO[c] || [0, 'cloud'])[1];
export const WMO_EMOJI = { clear: '☀️', mostly: '🌤️', partly: '⛅', cloud: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', snow: '❄️', storm: '⛈️' };

// Inline SVG weather icon
export function icon(code, isDay = 1, size = 40) {
  const k = wmoKind(code);
  const sun = `<g class="i-sun"><circle cx="24" cy="22" r="8" fill="#FFC53D"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
    const r = a * Math.PI / 180; const x1 = 24 + Math.cos(r) * 11.5, y1 = 22 + Math.sin(r) * 11.5, x2 = 24 + Math.cos(r) * 15, y2 = 22 + Math.sin(r) * 15;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#FFC53D" stroke-width="2.4" stroke-linecap="round"/>`;
  }).join('')}</g>`;
  const moon = `<path d="M28 10a12 12 0 1 0 10 18a10 10 0 1 1 -10 -18z" fill="#D9E3F5"/>`;
  const cloud = (x = 0, y = 0, c = '#E8EEF7') => `<path transform="translate(${x} ${y})" d="M16 40h20a8 8 0 0 0 0-16a11 11 0 0 0-21-2a7 7 0 0 0 1 18z" fill="${c}"/>`;
  const drops = (n = 3, c = '#4FB3FF') => Array.from({ length: n }, (_, i) => `<line x1="${18 + i * 7}" y1="43" x2="${15 + i * 7}" y2="50" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`).join('');
  const flakes = Array.from({ length: 3 }, (_, i) => `<circle cx="${18 + i * 7}" cy="47" r="2.2" fill="#fff"/>`).join('');
  const bolt = `<path d="M27 40l-5 8h5l-3 7l9-10h-5l3-5z" fill="#FFD43B"/>`;
  const fog = [30, 36, 42].map(y => `<line x1="10" y1="${y}" x2="42" y2="${y}" stroke="#C5D0DE" stroke-width="3" stroke-linecap="round"/>`).join('');
  const body = (() => {
    const sm = isDay ? sun : moon;
    switch (k) {
      case 'clear': return isDay ? `<g transform="translate(0 4)">${sun}</g>` : `<g transform="translate(-4 2)">${moon}</g>`;
      case 'mostly': return `<g transform="translate(-4 -4)">${sm}</g>${cloud(6, 6)}`;
      case 'partly': return `<g transform="translate(-6 -6)">${sm}</g>${cloud(2, 2)}`;
      case 'cloud': return cloud(-6, -4, '#B9C6D8') + cloud(2, 0);
      case 'fog': return fog;
      case 'drizzle': return cloud(0, -4) + drops(3, '#7CC6FF');
      case 'rain': return cloud(0, -4, '#C9D4E3') + drops(4, '#3FA9F5');
      case 'snow': return cloud(0, -4) + flakes;
      case 'storm': return cloud(0, -6, '#9AA8BC') + bolt;
      default: return cloud();
    }
  })();
  return `<svg class="wicon" width="${size}" height="${size}" viewBox="0 0 52 56" aria-hidden="true">${body}</svg>`;
}

export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) { t = el('div', { id: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}

export function debounce(fn, ms) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

// Wind (speed, from-direction) -> u/v components pointing where the air goes.
export function windUV(speed, dirFrom) {
  const r = dirFrom * Math.PI / 180;
  return [-speed * Math.sin(r), -speed * Math.cos(r)];
}

export function nearestIndex(times, t) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(times[i] - t);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

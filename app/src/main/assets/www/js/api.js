// Data access: Open-Meteo (forecast, models, pressure levels, marine, geocoding), RainViewer.
import { cacheGet, cacheSet } from './store.js';

const FC = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';

const mem = new Map();

async function getJSON(url, { cacheKey, maxAge = 20 * 60e3, persist = false } = {}) {
  const key = cacheKey || url;
  const m = mem.get(key);
  if (m && Date.now() - m.t < maxAge) return m.v;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    const old = persist && cacheGet(key, 7 * 86400e3);
    if (old) { old._offline = true; return old; }
    throw new Error('אין חיבור לאינטרנט');
  }
  if (!res.ok) {
    let reason = '';
    try { reason = (await res.json()).reason || ''; } catch (e) { /* ignore */ }
    if (res.status === 429) throw new Error('הגענו למגבלת הבקשות של שרת מזג האוויר. נסה שוב בעוד כמה דקות');
    throw new Error('שגיאה מהשרת: ' + (reason || res.status));
  }
  const v = await res.json();
  mem.set(key, { t: Date.now(), v });
  if (persist) cacheSet(key, v);
  return v;
}

const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const f4 = (x) => (+x).toFixed(4);

export const HOURLY = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'dew_point_2m', 'precipitation',
  'precipitation_probability', 'weather_code', 'pressure_msl', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid',
  'cloud_cover_high', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'cape', 'uv_index',
  'is_day', 'freezing_level_height',
];
const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant', 'sunrise', 'sunset', 'uv_index_max',
];
const CURRENT = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'is_day', 'precipitation', 'weather_code',
  'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'dew_point_2m',
];

/** Full forecast for one place (with 1 past day so we can show pressure trend). */
export async function forecast(lat, lon) {
  const url = `${FC}?${qs({
    latitude: f4(lat), longitude: f4(lon), current: CURRENT.join(','), hourly: HOURLY.join(','),
    daily: DAILY.join(','), minutely_15: 'precipitation', timezone: 'auto', timeformat: 'unixtime',
    forecast_days: 8, past_days: 1,
  })}`;
  const d = await getJSON(url, { cacheKey: `fc:${(+lat).toFixed(2)},${(+lon).toFixed(2)}`, persist: true });
  return d;
}

/** Point snapshot (used on map tap). */
export async function pointNow(lat, lon) {
  const url = `${FC}?${qs({
    latitude: f4(lat), longitude: f4(lon), hourly: HOURLY.join(','), timezone: 'auto', timeformat: 'unixtime', forecast_days: 6,
  })}`;
  return getJSON(url, { cacheKey: `pt:${(+lat).toFixed(2)},${(+lon).toFixed(2)}` });
}

export const MODELS = [
  { id: 'ecmwf_ifs025', name: 'ECMWF', color: '#4FB3FF', desc: 'המרכז האירופי — נחשב המודל העולמי המדויק ביותר' },
  { id: 'gfs_seamless', name: 'GFS', color: '#FF8A4C', desc: 'המודל האמריקאי (NOAA) — מתעדכן 4 פעמים ביום' },
  { id: 'icon_seamless', name: 'ICON', color: '#7CE38B', desc: 'המודל הגרמני (DWD) — ברזולוציה גבוהה מעל אירופה' },
];

export async function models(lat, lon) {
  const url = `${FC}?${qs({
    latitude: f4(lat), longitude: f4(lon),
    hourly: 'temperature_2m,precipitation,wind_speed_10m,pressure_msl,cloud_cover',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    models: MODELS.map(m => m.id).join(','), timezone: 'auto', timeformat: 'unixtime', forecast_days: 7,
  })}`;
  return getJSON(url, { cacheKey: `md:${(+lat).toFixed(2)},${(+lon).toFixed(2)}`, maxAge: 60 * 60e3 });
}

export const LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200];

/** Vertical profile for the Skew-T diagram. */
export async function profile(lat, lon) {
  const vars = [];
  for (const p of LEVELS) {
    vars.push(`temperature_${p}hPa`, `relative_humidity_${p}hPa`, `wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `geopotential_height_${p}hPa`);
  }
  vars.push('temperature_2m', 'dew_point_2m', 'surface_pressure', 'cape', 'wind_speed_10m', 'wind_direction_10m', 'cloud_cover');
  const url = `${FC}?${qs({
    latitude: f4(lat), longitude: f4(lon), hourly: vars.join(','), timezone: 'auto', timeformat: 'unixtime', forecast_days: 4,
  })}`;
  return getJSON(url, { cacheKey: `pf:${(+lat).toFixed(2)},${(+lon).toFixed(2)}`, maxAge: 60 * 60e3 });
}

/** Past days (forecast game scoring). */
export async function recentDays(lat, lon) {
  const url = `${FC}?${qs({
    latitude: f4(lat), longitude: f4(lon), daily: 'temperature_2m_max,precipitation_sum,wind_speed_10m_max',
    timezone: 'auto', past_days: 10, forecast_days: 2,
  })}`;
  return getJSON(url, { cacheKey: `rd:${(+lat).toFixed(2)},${(+lon).toFixed(2)}`, maxAge: 3 * 60 * 60e3 });
}

export async function geocode(name) {
  const url = `${GEO}?${qs({ name, count: 8, language: 'he', format: 'json' })}`;
  const d = await getJSON(url, { maxAge: 86400e3 });
  return (d.results || []).map(r => ({
    name: r.name, lat: r.latitude, lon: r.longitude,
    sub: [r.admin1, r.country].filter(Boolean).join(', '),
  }));
}

export async function reverseName(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?${qs({ latitude: lat, longitude: lon, localityLanguage: 'he' })}`;
    const d = await getJSON(url, { maxAge: 7 * 86400e3, persist: true });
    return d.city || d.locality || d.principalSubdivision || null;
  } catch (e) { return null; }
}

/**
 * Gridded hourly data for the map.
 * Returns { nx, ny, lat0, lat1, lon0, lon1, times:[unix], data:{ var: Float32Array(nt*nx*ny) } }
 * index = t*(nx*ny) + j*nx + i, j=0 at lat0 (south), i=0 at lon0 (west).
 */
export async function grid(vars, bounds, { nx = 11, ny = 11, marine = false, hours = 120 } = {}) {
  const { lat0, lat1, lon0, lon1 } = bounds;
  const lats = [], lons = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    lats.push((lat0 + (lat1 - lat0) * j / (ny - 1)).toFixed(3));
    lons.push((lon0 + (lon1 - lon0) * i / (nx - 1)).toFixed(3));
  }
  const n = lats.length;
  const chunk = 60;
  const reqs = [];
  for (let s = 0; s < n; s += chunk) {
    const la = lats.slice(s, s + chunk), lo = lons.slice(s, s + chunk);
    const url = `${marine ? MARINE : FC}?${qs({
      latitude: la.join(','), longitude: lo.join(','), hourly: vars.join(','),
      timeformat: 'unixtime', timezone: 'GMT', forecast_days: 6,
    })}`;
    reqs.push(getJSON(url, { maxAge: 45 * 60e3 }).then(r => (Array.isArray(r) ? r : [r])));
  }
  const parts = (await Promise.all(reqs)).flat();
  const nowH = Math.floor(Date.now() / 3600e3) * 3600;
  const allT = parts[0]?.hourly?.time || [];
  let start = allT.findIndex(t => t >= nowH);
  if (start < 0) start = 0;
  const times = allT.slice(start, start + hours);
  const nt = times.length;
  const data = {};
  for (const v of vars) data[v] = new Float32Array(nt * n).fill(NaN);
  parts.forEach((p, k) => {
    if (!p || !p.hourly) return;
    for (const v of vars) {
      const arr = p.hourly[v];
      if (!arr) continue;
      const out = data[v];
      for (let t = 0; t < nt; t++) {
        const val = arr[start + t];
        out[t * n + k] = val == null ? NaN : val;
      }
    }
  });
  return { nx, ny, lat0, lat1, lon0, lon1, times, data };
}

export async function rainviewer() {
  return getJSON('https://api.rainviewer.com/public/weather-maps.json', { maxAge: 5 * 60e3 });
}

// Visual smoke test with mocked APIs:  node tests/browser.mjs  (needs playwright + a static server on :8765)
import { chromium } from 'playwright';

const LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200];
const STD_Z = { 1000: 110, 975: 320, 950: 540, 925: 760, 900: 990, 850: 1460, 800: 1950, 700: 3010, 600: 4200, 500: 5570, 400: 7180, 300: 9160, 250: 10360, 200: 11780 };

function val(v, lat, lon, t, model = 0) {
  const d2 = (lat - 33.2) ** 2 + (lon - 32.5) ** 2;
  const hr = new Date(t * 1000).getHours();
  const diurnal = Math.sin((hr - 8) / 24 * 2 * Math.PI);
  const low = Math.exp(-d2 / 30);
  const dx = lon - 32.5, dy = lat - 33.2, r = Math.sqrt(d2) + 0.5;
  const sp = 12 + 40 * low + model * 3;
  const u = -dy / r * sp, vv = dx / r * sp; // counter-clockwise
  const dirFrom = (Math.atan2(-u, -vv) * 180 / Math.PI + 360) % 360;
  const T = 22 + 7 * diurnal - (lat - 32) * 1.1 + model * 0.8 + (t % 86400 > 43200 ? 0 : 0);
  let m;
  if ((m = v.match(/^(temperature|relative_humidity|wind_speed|wind_direction|geopotential_height)_(\d+)hPa/))) {
    const p = +m[2];
    const z = STD_Z[p] - 80 * low;
    if (m[1] === 'temperature') return +(T - 6.5 * z / 1000 - (p < 300 ? 5 : 0)).toFixed(1);
    if (m[1] === 'relative_humidity') return p > 800 ? 75 : p > 600 ? 92 : 30;
    if (m[1] === 'wind_speed') return +(sp * (1 + (1000 - p) / 250)).toFixed(1);
    if (m[1] === 'wind_direction') return Math.round((dirFrom + (1000 - p) / 20) % 360);
    return Math.round(z);
  }
  switch (v.replace(/_(ecmwf_ifs025|gfs_seamless|icon_seamless)$/, '')) {
    case 'temperature_2m': case 'apparent_temperature': return +T.toFixed(1);
    case 'dew_point_2m': return +(T - 6).toFixed(1);
    case 'relative_humidity_2m': return Math.round(65 - 15 * diurnal);
    case 'pressure_msl': return +(1016 - 16 * low + model).toFixed(1);
    case 'surface_pressure': return 1008;
    case 'wind_speed_10m': return +sp.toFixed(1);
    case 'wind_direction_10m': return Math.round(dirFrom);
    case 'wind_gusts_10m': return +(sp * 1.6).toFixed(1);
    case 'precipitation': return low > 0.5 ? +(3 * low).toFixed(1) : 0;
    case 'precipitation_probability': return Math.round(90 * low);
    case 'weather_code': return low > 0.5 ? 63 : low > 0.2 ? 3 : 1;
    case 'cloud_cover': case 'cloud_cover_low': case 'cloud_cover_mid': case 'cloud_cover_high': return Math.round(100 * Math.min(1, low * 1.4));
    case 'visibility': return 24000;
    case 'cape': return Math.round(1400 * low);
    case 'uv_index': return Math.max(0, +(8 * diurnal).toFixed(1));
    case 'is_day': return hr >= 6 && hr < 18 ? 1 : 0;
    case 'freezing_level_height': return 2800;
    case 'wave_height': return lon > 34.6 ? null : +(0.5 + 3 * low).toFixed(2);
    case 'wave_direction': return lon > 34.6 ? null : Math.round(dirFrom);
    case 'wave_period': return lon > 34.6 ? null : 7;
    case 'sea_surface_temperature': return lon > 34.6 ? null : 24;
    default: return 10;
  }
}

function forecastResp(u) {
  const lats = u.searchParams.get('latitude').split(',').map(Number);
  const lons = u.searchParams.get('longitude').split(',').map(Number);
  const hv = (u.searchParams.get('hourly') || '').split(',').filter(Boolean);
  const dv = (u.searchParams.get('daily') || '').split(',').filter(Boolean);
  const cv = (u.searchParams.get('current') || '').split(',').filter(Boolean);
  const models = (u.searchParams.get('models') || '').split(',').filter(Boolean);
  const days = +(u.searchParams.get('forecast_days') || 7), past = +(u.searchParams.get('past_days') || 0);
  const unix = u.searchParams.get('timeformat') === 'unixtime';
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const start = d0.getTime() / 1000 - past * 86400;
  const out = lats.map((lat, k) => {
    const lon = lons[k];
    const o = { latitude: lat, longitude: lon, elevation: 50, utc_offset_seconds: -new Date().getTimezoneOffset() * 60 };
    const times = Array.from({ length: (days + past) * 24 }, (_, i) => start + i * 3600);
    o.hourly = { time: times };
    const vars = models.length ? hv.flatMap(v => models.map(m => `${v}_${m}`)) : hv;
    for (const v of vars) o.hourly[v] = times.map(t => val(v, lat, lon, t, models.findIndex(m => v.endsWith(m))));
    if (dv.length) {
      const dt = Array.from({ length: days + past }, (_, i) => start + i * 86400);
      o.daily = { time: unix ? dt : dt.map(t => { const d = new Date(t * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }) };
      const dvars = models.length ? dv.flatMap(v => models.map(m => `${v}_${m}`)) : dv;
      for (const v of dvars) {
        const mi = models.findIndex(m => v.endsWith(m));
        const base = v.replace(/_(ecmwf_ifs025|gfs_seamless|icon_seamless)$/, '');
        o.daily[v] = dt.map((t, i) => {
          if (base === 'temperature_2m_max') return 28 + mi + i * 0.5 * mi;
          if (base === 'temperature_2m_min') return 17;
          if (base === 'precipitation_sum') return i === 2 ? (mi === 1 ? 0 : 6) : 0;
          if (base === 'sunrise') return t + 6 * 3600 + 1200;
          if (base === 'sunset') return t + 17 * 3600;
          if (base === 'weather_code') return [1, 2, 63, 3, 0, 1, 80, 1][i % 8];
          if (base === 'precipitation_probability_max') return i === 2 ? 80 : 5;
          return val(base.replace(/_(max|min|sum|dominant)$/, ''), lat, lon, t + 12 * 3600);
        });
      }
    }
    if (cv.length) {
      const now = Math.floor(Date.now() / 900000) * 900;
      o.current = { time: now };
      for (const v of cv) o.current[v] = val(v, lat, lon, now);
    }
    if (u.searchParams.get('minutely_15')) {
      const now = Math.floor(Date.now() / 900000) * 900;
      const tt = Array.from({ length: 16 }, (_, i) => now - 3600 + i * 900);
      o.minutely_15 = { time: tt, precipitation: tt.map((t, i) => (i > 6 ? 0.4 : 0)) };
    }
    return o;
  });
  return out.length === 1 ? out[0] : out;
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, locale: 'he-IL', geolocation: { latitude: 32.08, longitude: 34.81 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === 'localhost') return route.continue();
  if (u.hostname.endsWith('open-meteo.com') && !u.hostname.startsWith('geocoding')) return route.fulfill({ json: forecastResp(u), headers: { 'access-control-allow-origin': '*' } });
  if (u.hostname.startsWith('geocoding')) return route.fulfill({ json: { results: [{ name: 'ירושלים', latitude: 31.77, longitude: 35.21, country: 'ישראל', admin1: 'מחוז ירושלים' }] }, headers: { 'access-control-allow-origin': '*' } });
  if (u.hostname.includes('bigdatacloud')) return route.fulfill({ json: { city: 'רמת גן' }, headers: { 'access-control-allow-origin': '*' } });
  if (u.hostname.includes('rainviewer.com') && u.pathname.endsWith('.json')) return route.fulfill({ json: { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: Date.now() / 1000 - 600, path: '/v2/radar/1' }, { time: Date.now() / 1000, path: '/v2/radar/2' }], nowcast: [] } }, headers: { 'access-control-allow-origin': '*' } });
  return route.fulfill({ status: 204, body: '' });
});

const shot = (n) => page.screenshot({ path: `/tmp/shots/${n}.png` });
await page.goto('http://localhost:8765/index.html');
await page.waitForTimeout(800);
await shot('00-intro');
for (let i = 0; i < 4; i++) { await page.click('.introbox .btn.primary'); await page.waitForTimeout(150); }
await page.waitForTimeout(1200);
await shot('01-forecast');
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(300);
await shot('02-forecast-mid');
await page.evaluate(() => window.scrollTo(0, 2000));
await page.waitForTimeout(300);
await shot('03-forecast-low');

await page.click('.tab[data-screen="map"]');
await page.waitForTimeout(2200);
await shot('10-map-wind');
await page.click('.chip:has-text("לחץ ואיזוברים")');
await page.waitForTimeout(1800);
await shot('11-map-pressure');
await page.click('.chip:has-text("טמפרטורה")');
await page.waitForTimeout(1500);
await page.mouse.click(200, 430);
await page.waitForTimeout(800);
await shot('12-map-tap');
await page.click('.sheet .x');
await page.click('.chip:has-text("CAPE")');
await page.waitForTimeout(500);
await shot('13-locked');

await page.click('.tab[data-screen="lab"]');
await page.waitForTimeout(1500);
await shot('20-skewt');
await page.evaluate(() => window.scrollTo(0, 700));
await shot('21-skewt-notes');
await page.click('.seg button:has-text("השוואת מודלים")');
await page.waitForTimeout(1200);
await shot('22-models');
await page.evaluate(() => window.scrollTo(0, 800));
await shot('23-models-table');

await page.click('.tab[data-screen="learn"]');
await page.waitForTimeout(500);
await shot('30-learn');
await page.click('.lesson >> nth=0');
await page.waitForTimeout(300);
await shot('31-lesson');
for (let i = 0; i < 4; i++) { await page.click('.navrow .btn.primary'); await page.waitForTimeout(120); }
await shot('32-quiz');
await page.click('.opt >> nth=1');
await shot('33-quiz-answer');
await page.click('.btn.primary.block'); await page.click('.opt >> nth=1'); await page.click('.btn.primary.block');
await page.click('.opt >> nth=1'); await page.click('.btn.primary.block');
await page.waitForTimeout(200);
await shot('34-finish');

// unlock humidity lesson then check map
await page.evaluate(() => { localStorage.setItem('x', 1); });
await page.click('.tab[data-screen="forecast"]');
await page.click('.iconbtn[aria-label="הגדרות"]');
await page.waitForTimeout(300);
await shot('40-settings');

console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();

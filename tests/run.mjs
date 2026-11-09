// Unit tests for the pure logic of the web app.  Run: node tests/run.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const W = (f) => pathToFileURL(resolve('app/src/main/assets/www/js', f)).href;
const { isoline, extrema, levels, sample, upsample } = await import(W('contour.js'));
const { dewpoint, lcl, parcel, capeCin, moistAdiabat, theta, dryAdiabat } = await import(W('thermo.js'));
const { rideScore, bestWindows } = await import(W('moto.js'));
const { prepare, dayStats } = await import(W('wx.js'));
const { insights } = await import(W('insights.js'));
const { makeScale, SCALES, LAYERS, BUNDLES, bundleOf } = await import(W('layers.js'));
const { windUV, dirName, beaufort } = await import(W('util.js'));
const { LESSONS, GLOSSARY } = await import(W('lessons.js'));
const { scorePrediction } = await import(W('game.js'));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('isoline on a ramp gives a vertical line', () => {
  const nx = 5, ny = 5, v = new Float32Array(25);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = i;
  const seg = isoline(v, nx, ny, 2.5);
  assert.equal(seg.length, 4 * 4);
  for (let k = 0; k < seg.length; k += 2) assert.ok(Math.abs(seg[k] - 2.5) < 1e-6);
});

t('extrema finds a bowl minimum', () => {
  const nx = 9, ny = 9, v = new Float32Array(81);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = 1000 + (i - 4) ** 2 + (j - 4) ** 2;
  const e = extrema(v, nx, ny, 2, 1);
  assert.equal(e.length, 1);
  assert.equal(e[0].type, 'lo');
  assert.equal(e[0].i, 4);
});

t('levels and sampling', () => {
  assert.deepEqual(levels([1001, 1009], 2), [1002, 1004, 1006, 1008]);
  const v = new Float32Array([0, 1, 2, 3]);
  assert.ok(Math.abs(sample(v, 2, 2, 0.5, 0.5) - 1.5) < 1e-6);
  assert.ok(isNaN(sample(v, 2, 2, -1, 0)));
  const u = upsample(v, 2, 2, 2);
  assert.equal(u.nx, 3);
  assert.ok(Math.abs(u.vals[4] - 1.5) < 1e-6);
});

t('thermo sanity', () => {
  assert.ok(Math.abs(dewpoint(20, 100) - 20) < 0.1);
  assert.ok(Math.abs(dewpoint(30, 50) - 18.4) < 0.5);
  const L = lcl(30, 20, 1010);
  assert.ok(L.p > 850 && L.p < 900, 'LCL ~ 870 hPa, got ' + L.p);
  assert.ok(Math.abs(dryAdiabat(theta(20, 1000), 1000) - 20) < 1e-6);
  const m = moistAdiabat(20, 1000, 500);
  assert.ok(m > -10 && m < -2, 'moist adiabat 20C/1000 -> 500 hPa ≈ -6, got ' + m);
  const ps = [1000, 900, 800, 700, 600, 500, 400, 300];
  const pr = parcel(30, 22, 1000, ps);
  assert.equal(pr.temps.length, ps.length);
  const env = [28, 20, 13, 6, -2, -11, -22, -36];
  const c = capeCin(ps, env, pr.temps);
  assert.ok(c.cape > 200, 'unstable sounding should have CAPE, got ' + c.cape);
});

t('ride score', () => {
  const good = rideScore({ temperature_2m: 24, apparent_temperature: 24, wind_gusts_10m: 20, wind_speed_10m: 10, precipitation: 0, precipitation_probability: 0, visibility: 20000, is_day: 1, weather_code: 1 });
  assert.ok(good.score >= 90);
  const bad = rideScore({ temperature_2m: 12, wind_gusts_10m: 70, wind_speed_10m: 40, precipitation: 3, precipitation_probability: 90, visibility: 5000, is_day: 1, weather_code: 63 });
  assert.equal(bad.score, 0);
  const hrs = Array.from({ length: 6 }, (_, i) => ({ t: i * 3600, temperature_2m: 22, wind_gusts_10m: i < 3 ? 15 : 80, precipitation: 0, is_day: 1 }));
  const w = bestWindows(hrs);
  assert.equal(w.length, 1);
  assert.equal(w[0].to, 3 * 3600);
});

function fakeForecast({ tmax = 24, rh = 60, dir = 270, precip = 0, gust = 20, cape = 0, p = 1015 } = {}) {
  const start = Math.floor(Date.now() / 86400000) * 86400 - 86400;
  const N = 24 * 4;
  const time = Array.from({ length: N }, (_, i) => start + i * 3600);
  const hr = (i) => new Date(time[i] * 1000).getHours();
  const H = {
    time,
    temperature_2m: time.map((_, i) => tmax - 10 + 10 * Math.max(0, Math.sin((hr(i) - 6) / 12 * Math.PI))),
    relative_humidity_2m: time.map(() => rh), wind_direction_10m: time.map(() => dir), wind_speed_10m: time.map(() => 15),
    precipitation: time.map(() => precip / 24), wind_gusts_10m: time.map(() => gust), cape: time.map(() => cape),
    pressure_msl: time.map(() => p), cloud_cover: time.map(() => 20), visibility: time.map(() => 20000),
    dew_point_2m: time.map(() => 15), freezing_level_height: time.map(() => 3500), weather_code: time.map(() => 1),
  };
  const daily = { time: [0, 1, 2, 3].map(d => start + d * 86400), temperature_2m_max: [tmax, tmax, tmax, tmax] };
  return { hourly: H, daily, utc_offset_seconds: -new Date().getTimezoneOffset() * 60 };
}

t('prepare + insights', () => {
  const fx = prepare(fakeForecast());
  assert.equal(fx.todayIdx, 1);
  assert.ok(fx.hoursOfDay(1).length === 24);
  const s = dayStats(fx.hoursOfDay(1));
  assert.ok(Math.abs(s.windDir - 270) < 1);
  const sh = insights(prepare(fakeForecast({ tmax: 38, rh: 12, dir: 100 })), 5);
  assert.equal(sh[0].id, 'sharav');
  const st = insights(prepare(fakeForecast({ precip: 12, cape: 1200, dir: 250, p: 1006 })), 1);
  assert.equal(st[0].id, 'storms');
  assert.ok(st.some(x => x.id === 'cyprus'));
  const calm = insights(prepare(fakeForecast()), 4);
  assert.ok(calm.length >= 1);
});

t('scales & layers', () => {
  for (const k of Object.keys(SCALES)) {
    const s = makeScale(SCALES[k]);
    const o = [0, 0, 0, 0];
    s.at(s.lo - 100, o, 0); s.at(s.hi + 100, o, 0);
    assert.ok(o.every(x => x >= 0 && x <= 255));
  }
  for (const l of LAYERS) {
    if (l.tiles) continue;
    assert.ok(SCALES[l.scale], 'missing scale for ' + l.id);
    assert.ok(l.vars.includes(l.heat), 'heat var not fetched for ' + l.id);
    if (l.particles) l.particles.forEach(v => assert.ok(l.vars.includes(v), l.id + ' missing particle var ' + v));
    if (l.contour) assert.ok(l.vars.includes(l.contour.var));
    for (const v of l.vars) assert.ok(BUNDLES[bundleOf(l)].includes(v), `${l.id}: ${v} missing from bundle ${bundleOf(l)}`);
  }
});

t('wind helpers', () => {
  const [u, v] = windUV(10, 270); // wind FROM west blows east
  assert.ok(u > 9.9 && Math.abs(v) < 1e-9);
  assert.equal(dirName(90), 'מזרח');
  assert.equal(beaufort(0).force, 0);
  assert.equal(beaufort(45).force, 6);
});

t('lessons are well-formed', () => {
  const ids = new Set();
  const layerIds = new Set(LAYERS.map(l => l.id));
  for (const l of LESSONS) {
    assert.ok(!ids.has(l.id), 'duplicate lesson ' + l.id); ids.add(l.id);
    assert.ok(l.title && l.sections?.length, l.id);
    assert.ok(l.quiz?.length >= 2, 'quiz too short: ' + l.id);
    for (const q of l.quiz) assert.ok(q.a >= 0 && q.a < q.o.length, 'bad answer index in ' + l.id);
    for (const u of l.unlocks || []) assert.ok(layerIds.has(u), 'unknown layer ' + u);
    if (l.layer) assert.ok(layerIds.has(l.layer), 'unknown layer ' + l.layer);
  }
  for (const l of LAYERS) if (l.lesson) assert.ok(ids.has(l.lesson), 'layer points to missing lesson ' + l.lesson);
  for (const l of LAYERS) if (l.group !== 'basic') assert.ok(LESSONS.some(x => (x.unlocks || []).includes(l.id)), 'no lesson unlocks ' + l.id);
  assert.ok(GLOSSARY.length > 20);
});

t('game scoring', () => {
  const r = scorePrediction({ tmax: 25, rain: false, wind: 'mid' }, { tmax: 25.4, precip: 0, wind: 22 });
  assert.equal(r.total, 100);
  const r2 = scorePrediction({ tmax: 20, rain: true, wind: 'calm' }, { tmax: 26, precip: 0, wind: 50 });
  assert.equal(r2.total, 0);
});

console.log(`\n${n} test groups passed`);

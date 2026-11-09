// Turns an Open-Meteo forecast response into convenient arrays of objects.  Pure (unit-tested).

export function prepare(d, nowSec = Date.now() / 1000) {
  const H = d.hourly, D = d.daily;
  const hours = H.time.map((t, i) => {
    const o = { t };
    for (const k of Object.keys(H)) if (k !== 'time') o[k] = H[k][i];
    return o;
  });
  const days = (D?.time || []).map((t, i) => {
    const o = { t };
    for (const k of Object.keys(D)) if (k !== 'time') o[k] = D[k][i];
    return o;
  });
  let nowIdx = hours.findIndex(h => h.t > nowSec) - 1;
  if (nowIdx < 0) nowIdx = 0;
  let todayIdx = 0;
  for (let i = 0; i < days.length; i++) if (days[i].t <= nowSec) todayIdx = i;
  const offset = d.utc_offset_seconds || 0;
  const dayOf = (t) => Math.floor((t + offset) / 86400);
  const hoursOfDay = (dayIdx) => {
    if (!days[dayIdx]) return [];
    const k = dayOf(days[dayIdx].t);
    return hours.filter(h => dayOf(h.t) === k);
  };
  const cur = d.current ? { ...d.current } : { ...hours[nowIdx] };
  // pressure trend over the last 3 hours
  const p3 = hours[nowIdx - 3]?.pressure_msl;
  cur.pressureTrend = p3 != null && hours[nowIdx]?.pressure_msl != null ? hours[nowIdx].pressure_msl - p3 : null;
  return { hours, days, nowIdx, todayIdx, offset, cur, hoursOfDay, future: hours.slice(nowIdx) };
}

export function dayStats(hrs) {
  const pick = (k) => hrs.map(h => h[k]).filter(v => v != null && !isNaN(v));
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const daytime = hrs.filter(h => {
    const hr = new Date(h.t * 1000).getHours();
    return hr >= 10 && hr <= 17;
  });
  const dt = (k) => daytime.map(h => h[k]).filter(v => v != null && !isNaN(v));
  // vector-average wind direction during daytime
  let sx = 0, sy = 0;
  for (const h of daytime) {
    if (h.wind_direction_10m == null) continue;
    const r = h.wind_direction_10m * Math.PI / 180, w = h.wind_speed_10m || 1;
    sx += Math.sin(r) * w; sy += Math.cos(r) * w;
  }
  const windDir = (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360;
  return {
    tmax: Math.max(...pick('temperature_2m')),
    tmin: Math.min(...pick('temperature_2m')),
    rhMinDay: Math.min(...dt('relative_humidity_2m'), 100),
    rhAvg: avg(pick('relative_humidity_2m')),
    precip: pick('precipitation').reduce((s, v) => s + v, 0),
    gustMax: Math.max(...pick('wind_gusts_10m'), 0),
    windMax: Math.max(...pick('wind_speed_10m'), 0),
    windDir,
    windDayAvg: avg(dt('wind_speed_10m')),
    capeMax: Math.max(...pick('cape'), 0),
    pMin: Math.min(...pick('pressure_msl')),
    pMax: Math.max(...pick('pressure_msl')),
    pAvg: avg(pick('pressure_msl')),
    cloudAvg: avg(pick('cloud_cover')),
    visMin: Math.min(...pick('visibility'), 99999),
    dewAvg: avg(pick('dew_point_2m')),
    freezeMin: Math.min(...pick('freezing_level_height'), 99999),
    codes: pick('weather_code'),
  };
}

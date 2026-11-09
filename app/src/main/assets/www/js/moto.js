// Motorcycle riding score per hour.  Pure (unit-tested).

export function rideScore(h) {
  let s = 100;
  const why = [];
  const pp = h.precipitation_probability ?? 0, pr = h.precipitation ?? 0;
  if (pr >= 0.3) { s -= 55; why.push('גשם'); } else if (pp >= 50) { s -= 30; why.push(`${Math.round(pp)}% סיכוי לגשם`); } else if (pp >= 25) { s -= 10; }
  const g = h.wind_gusts_10m ?? 0, w = h.wind_speed_10m ?? 0;
  if (g >= 60) { s -= 45; why.push(`משבים ${Math.round(g)} קמ״ש`); } else if (g >= 45) { s -= 25; why.push(`משבים ${Math.round(g)} קמ״ש`); } else if (g >= 35) { s -= 10; }
  if (w >= 35) { s -= 10; }
  const t = h.apparent_temperature ?? h.temperature_2m ?? 20;
  if (t >= 38) { s -= 35; why.push('חום קיצוני'); } else if (t >= 33) { s -= 15; why.push('חם'); } else if (t <= 5) { s -= 30; why.push('קר מאוד'); } else if (t <= 10) { s -= 12; why.push('קר'); }
  const vis = h.visibility ?? 20000;
  if (vis < 1000) { s -= 35; why.push('ערפל'); } else if (vis < 4000) { s -= 12; why.push('ראות מוגבלת'); }
  if (h.is_day === 0) { s -= 8; }
  if ((h.weather_code ?? 0) >= 95) { s -= 40; why.push('סופת רעמים'); }
  s = Math.max(0, Math.min(100, Math.round(s)));
  return { score: s, why, verdict: s >= 80 ? 'מעולה לרכיבה' : s >= 60 ? 'סביר' : s >= 40 ? 'לא נעים' : 'עדיף לא' };
}

/** Best continuous windows (>= minScore) among the given hours. */
export function bestWindows(hours, minScore = 75, minLen = 2) {
  const res = [];
  let start = -1;
  const sc = hours.map(h => rideScore(h).score);
  for (let i = 0; i <= hours.length; i++) {
    const ok = i < hours.length && sc[i] >= minScore && hours[i].is_day !== 0;
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      if (i - start >= minLen) res.push({ from: hours[start].t, to: hours[i - 1].t + 3600, avg: Math.round(sc.slice(start, i).reduce((a, b) => a + b, 0) / (i - start)) });
      start = -1;
    }
  }
  return res;
}

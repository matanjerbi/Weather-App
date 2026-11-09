// Forecast game scoring.  Pure (unit-tested).

export const WIND_CATS = [
  { id: 'calm', name: 'חלשה', desc: 'עד 15 קמ״ש', max: 15 },
  { id: 'mid', name: 'בינונית', desc: '15–35 קמ״ש', max: 35 },
  { id: 'strong', name: 'חזקה', desc: 'מעל 35 קמ״ש', max: Infinity },
];

export const windCat = (kmh) => (kmh < 15 ? 'calm' : kmh <= 35 ? 'mid' : 'strong');

/** guess: {tmax, rain:boolean, wind:'calm'|'mid'|'strong'}; actual: {tmax, precip, wind(kmh)} */
export function scorePrediction(guess, actual) {
  const diff = Math.abs(guess.tmax - actual.tmax);
  const temp = diff <= 1 ? 50 : Math.max(0, Math.round(50 - 12 * (diff - 1)));
  const rainActual = actual.precip >= 1;
  const rain = guess.rain === rainActual ? 30 : 0;
  const wind = guess.wind === windCat(actual.wind) ? 20 : 0;
  return { temp, rain, wind, total: temp + rain + wind, diff, rainActual, windActual: windCat(actual.wind) };
}

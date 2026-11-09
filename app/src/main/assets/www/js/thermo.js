// Atmospheric thermodynamics for the Skew-T.  Pure (unit-tested).  T in °C, p in hPa.

const Rd = 287.04, cp = 1005.7, Lv = 2.501e6, eps = 0.622, K = 273.15, kappa = Rd / cp;

export const es = (T) => 6.112 * Math.exp(17.67 * T / (T + 243.5));           // saturation vapour pressure hPa
export const mixing = (T, p) => { const e = es(T); return eps * e / (p - e); };  // kg/kg at saturation
export function dewpoint(T, rh) {
  const a = 17.625, b = 243.04;
  const g = Math.log(Math.max(rh, 0.5) / 100) + a * T / (b + T);
  return b * g / (a - g);
}
export const theta = (T, p) => (T + K) * Math.pow(1000 / p, kappa);
export const dryAdiabat = (th, p) => th * Math.pow(p / 1000, kappa) - K;

/** dT/dp along a saturated (pseudo)adiabat, T in K, p in hPa -> K/hPa */
function moistGradient(Tk, p) {
  const rs = mixing(Tk - K, p);
  return (1 / p) * (Rd * Tk + Lv * rs) / (cp + (Lv * Lv * rs * eps) / (Rd * Tk * Tk));
}

/** Follow a moist adiabat from (T0,p0) to p1, returns °C. */
export function moistAdiabat(T0, p0, p1, step = 5) {
  let T = T0 + K, p = p0;
  const dir = p1 < p0 ? -1 : 1;
  while ((dir < 0 && p > p1) || (dir > 0 && p < p1)) {
    const dp = dir * Math.min(step, Math.abs(p1 - p));
    // RK2
    const k1 = moistGradient(T, p);
    const k2 = moistGradient(T + k1 * dp, p + dp);
    T += (k1 + k2) / 2 * dp;
    p += dp;
  }
  return T - K;
}

/** Lifting condensation level from surface T, Td (°C), p (hPa). Bolton (1980). */
export function lcl(T, Td, p) {
  const Tk = T + K, Tdk = Td + K;
  const Tl = 1 / (1 / (Tdk - 56) + Math.log(Tk / Tdk) / 800) + 56;
  const pl = p * Math.pow(Tl / Tk, 1 / kappa);
  return { T: Tl - K, p: pl };
}

/** Parcel temperature profile at the given pressures (descending pressure order). */
export function parcel(T0, Td0, p0, pressures) {
  const L = lcl(T0, Td0, p0);
  const th = theta(T0, p0);
  const out = [];
  let lastT = null, lastP = null;
  for (const p of pressures) {
    if (p > p0) { out.push(NaN); continue; }
    if (p >= L.p) { out.push(dryAdiabat(th, p)); continue; }
    if (lastT == null) { lastT = L.T; lastP = L.p; }
    lastT = moistAdiabat(lastT, lastP, p);
    lastP = p;
    out.push(lastT);
  }
  return { temps: out, lcl: L };
}

/** Simple CAPE / CIN estimate (J/kg) from env & parcel temps on pressure levels (descending p). */
export function capeCin(pressures, env, par) {
  let cape = 0, cin = 0, seenPositive = false;
  for (let i = 0; i < pressures.length - 1; i++) {
    const p1 = pressures[i], p2 = pressures[i + 1];
    const e1 = env[i], e2 = env[i + 1], q1 = par[i], q2 = par[i + 1];
    if ([e1, e2, q1, q2].some(v => v == null || isNaN(v))) continue;
    const d = ((q1 - e1) + (q2 - e2)) / 2; // Rd * ΔT * dln(p)
    const val = Rd * d * Math.log(p1 / p2);
    if (val > 0) { cape += val; seenPositive = true; } else if (!seenPositive) cin += val;
  }
  return { cape: Math.round(cape), cin: Math.round(cin) };
}

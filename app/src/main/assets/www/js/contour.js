// Marching squares + local extrema on a regular grid.  Pure functions (unit-tested).

/** Bilinear upsample of a nx*ny field by factor f. */
export function upsample(vals, nx, ny, f) {
  const NX = (nx - 1) * f + 1, NY = (ny - 1) * f + 1;
  const out = new Float32Array(NX * NY);
  for (let J = 0; J < NY; J++) {
    const y = J / f, j = Math.min(ny - 2, Math.floor(y)), ty = y - j;
    for (let I = 0; I < NX; I++) {
      const x = I / f, i = Math.min(nx - 2, Math.floor(x)), tx = x - i;
      const a = vals[j * nx + i], b = vals[j * nx + i + 1], c = vals[(j + 1) * nx + i], d = vals[(j + 1) * nx + i + 1];
      out[J * NX + I] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return { vals: out, nx: NX, ny: NY };
}

/**
 * Segments of the iso-line `level`.  Coordinates are grid indices (x = i, y = j).
 * Returns flat array [x0,y0,x1,y1, ...]
 */
export function isoline(vals, nx, ny, level) {
  const seg = [];
  const interp = (x0, y0, v0, x1, y1, v1) => {
    const t = (level - v0) / (v1 - v0);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = vals[j * nx + i], b = vals[j * nx + i + 1], c = vals[(j + 1) * nx + i + 1], d = vals[(j + 1) * nx + i];
      if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d)) continue;
      let code = 0;
      if (a >= level) code |= 1;
      if (b >= level) code |= 2;
      if (c >= level) code |= 4;
      if (d >= level) code |= 8;
      if (code === 0 || code === 15) continue;
      // edges: bottom (a-b), right (b-c), top (d-c), left (a-d)
      const E = {
        b: () => interp(i, j, a, i + 1, j, b),
        r: () => interp(i + 1, j, b, i + 1, j + 1, c),
        t: () => interp(i, j + 1, d, i + 1, j + 1, c),
        l: () => interp(i, j, a, i, j + 1, d),
      };
      const push = (e1, e2) => { const p = E[e1](), q = E[e2](); seg.push(p[0], p[1], q[0], q[1]); };
      const center = (a + b + c + d) / 4;
      switch (code) {
        case 1: case 14: push('l', 'b'); break;
        case 2: case 13: push('b', 'r'); break;
        case 3: case 12: push('l', 'r'); break;
        case 4: case 11: push('r', 't'); break;
        case 6: case 9: push('b', 't'); break;
        case 7: case 8: push('l', 't'); break;
        case 5: if (center >= level) { push('l', 't'); push('b', 'r'); } else { push('l', 'b'); push('r', 't'); } break;
        case 10: if (center >= level) { push('l', 'b'); push('r', 't'); } else { push('l', 't'); push('b', 'r'); } break;
        default: break;
      }
    }
  }
  return seg;
}

/** Levels between min and max at `step`. */
export function levels(vals, step) {
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) { if (!isNaN(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  if (!isFinite(lo)) return [];
  const out = [];
  for (let l = Math.ceil(lo / step) * step; l <= hi; l += step) out.push(l);
  return out;
}

/**
 * Local extrema: a cell that's the min / max of its (2r+1)^2 neighbourhood and differs from
 * the neighbourhood mean by at least `minDiff`.
 */
export function extrema(vals, nx, ny, r = 2, minDiff = 1) {
  const out = [];
  for (let j = r; j < ny - r; j++) {
    for (let i = r; i < nx - r; i++) {
      const v = vals[j * nx + i];
      if (isNaN(v)) continue;
      let isMax = true, isMin = true, sum = 0, n = 0;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (!di && !dj) continue;
        const w = vals[(j + dj) * nx + i + di];
        if (isNaN(w)) continue;
        if (w >= v) isMax = false;
        if (w <= v) isMin = false;
        sum += w; n++;
      }
      if (!n) continue;
      const mean = sum / n;
      if (isMax && v - mean >= minDiff) out.push({ i, j, v, type: 'hi' });
      if (isMin && mean - v >= minDiff) out.push({ i, j, v, type: 'lo' });
    }
  }
  return out;
}

/** Bilinear sample with NaN-awareness; x,y in grid index coords. */
export function sample(vals, nx, ny, x, y) {
  if (x < 0 || y < 0 || x > nx - 1 || y > ny - 1) return NaN;
  const i = Math.min(nx - 2, Math.floor(x)), j = Math.min(ny - 2, Math.floor(y));
  const tx = x - i, ty = y - j;
  const a = vals[j * nx + i], b = vals[j * nx + i + 1], c = vals[(j + 1) * nx + i], d = vals[(j + 1) * nx + i + 1];
  const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  const v = [a, b, c, d];
  let s = 0, ws = 0;
  for (let k = 0; k < 4; k++) if (!isNaN(v[k])) { s += v[k] * w[k]; ws += w[k]; }
  return ws > 0.25 ? s / ws : NaN;
}

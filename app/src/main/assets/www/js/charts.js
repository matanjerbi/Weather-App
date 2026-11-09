// Minimal canvas charts (line + bars) with a time x-axis.
import { hhmm, dayName } from './util.js';

const DPR = Math.min(2, window.devicePixelRatio || 1);

/**
 * opts: { times:[unix], series:[{values, color, width, dash, fill}], bars?:{values,color,max},
 *         height, yFmt, nowT, yPad }
 */
export function timeChart(canvas, opts) {
  const W = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
  const H = opts.height || 160;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.clearRect(0, 0, W, H);
  const padL = 8, padR = 34, padT = 12, padB = 26;
  const { times } = opts;
  const t0 = times[0], t1 = times[times.length - 1];
  // RTL: time flows right-to-left so it reads naturally in Hebrew
  const X = (t) => W - padR - (t - t0) / (t1 - t0 || 1) * (W - padL - padR);
  let lo = Infinity, hi = -Infinity;
  for (const s of opts.series) for (const v of s.values) if (v != null && !isNaN(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  const pad = opts.yPad ?? Math.max(1, (hi - lo) * 0.12);
  lo -= pad; hi += pad;
  const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  // day separators + labels
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200,215,235,0.7)';
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.textAlign = 'center';
  const span = t1 - t0;
  const stepH = span > 4 * 86400 ? 24 : span > 36 * 3600 ? 6 : 3;
  for (const t of times) {
    const d = new Date(t * 1000);
    if (d.getMinutes() !== 0) continue;
    const h = d.getHours();
    if (h === 0) {
      ctx.beginPath(); ctx.moveTo(X(t), padT); ctx.lineTo(X(t), H - padB); ctx.stroke();
    }
    if (h % stepH === 0) {
      ctx.fillText(stepH === 24 ? dayName(d, true) : (h === 0 ? dayName(d, true) : hhmm(d)), X(t), H - 8);
    }
  }
  // y grid
  ctx.textAlign = 'left';
  const ticks = 4;
  for (let k = 0; k <= ticks; k++) {
    const v = lo + (hi - lo) * k / ticks;
    const y = Y(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(opts.yFmt ? opts.yFmt(v) : Math.round(v), W - padR + 4, y + 4);
  }
  // bars
  if (opts.bars) {
    const b = opts.bars;
    const max = b.max ?? Math.max(1, ...b.values.filter(v => v != null));
    const bw = Math.max(2, (W - padL - padR) / times.length * 0.7);
    ctx.fillStyle = b.color;
    times.forEach((t, i) => {
      const v = b.values[i];
      if (!v) return;
      const h = Math.min(1, v / max) * (H - padT - padB) * 0.6;
      ctx.fillRect(X(t) - bw / 2, H - padB - h, bw, h);
    });
  }
  // now marker
  if (opts.nowT && opts.nowT >= t0 && opts.nowT <= t1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X(opts.nowT), padT); ctx.lineTo(X(opts.nowT), H - padB); ctx.stroke();
    ctx.setLineDash([]);
  }
  // lines
  for (const s of opts.series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width || 2;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    let started = false;
    s.values.forEach((v, i) => {
      if (v == null || isNaN(v)) return;
      const x = X(times[i]), y = Y(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  return { X, Y };
}

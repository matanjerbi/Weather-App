// Persistent state in localStorage (WebView dom storage).

const KEY = 'atmo.v1';

const DEFAULTS = {
  place: { name: 'רמת גן', lat: 32.0823, lon: 34.8107, auto: true },
  places: [],
  proMode: false,          // unlock everything
  completed: {},           // lessonId -> {score, at}
  unlocked: {},            // layerId -> true (from lessons)
  predictions: [],         // forecast game
  alerts: { enabled: false, rain: true, wind: true, windKmh: 50, heat: true, heatC: 35, sharav: true },
  moto: { enabled: true },
  seenIntro: false,
  lastLayer: 'wind',
  xp: 0,
};

let state;
try {
  state = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  state.alerts = { ...DEFAULTS.alerts, ...(state.alerts || {}) };
} catch (e) {
  state = { ...DEFAULTS };
}

const listeners = new Set();

export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
    listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  addXp(n) { store.set({ xp: (state.xp || 0) + n }); },
};

// Cache helper for API responses (separate key per entry so size stays manageable)
export function cacheGet(key, maxAgeMs) {
  try {
    const raw = localStorage.getItem('atmo.c.' + key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > maxAgeMs) return null;
    return v;
  } catch (e) { return null; }
}
export function cacheSet(key, v) {
  try { localStorage.setItem('atmo.c.' + key, JSON.stringify({ t: Date.now(), v })); }
  catch (e) {
    // purge old cache entries and retry once
    try {
      Object.keys(localStorage).filter(k => k.startsWith('atmo.c.')).forEach(k => localStorage.removeItem(k));
      localStorage.setItem('atmo.c.' + key, JSON.stringify({ t: Date.now(), v }));
    } catch (e2) { /* give up */ }
  }
}

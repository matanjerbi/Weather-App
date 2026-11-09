// Bridge to the Android shell (window.Native). Everything degrades gracefully in a plain browser.
import { store } from './store.js';
import { round, wmoText, WMO_EMOJI, wmoKind, dirName } from './util.js';

export const native = (() => {
  try { return window.Native && window.Native.isNative() ? window.Native : null; } catch (e) { return null; }
})();

export function saveConfig() {
  if (!native) return;
  const st = store.get();
  native.saveConfig(JSON.stringify({ lat: st.place.lat, lon: st.place.lon, place: st.place.name, alerts: st.alerts }));
}

export function syncNative(place, d) {
  if (!native) return;
  try {
    const c = d.current;
    if (c) {
      const dl = d.daily;
      let i = 0;
      const now = Date.now() / 1000;
      if (dl) dl.time.forEach((t, k) => { if (t <= now) i = k; });
      const extra = dl ? `${round(dl.temperature_2m_max[i])}° / ${round(dl.temperature_2m_min[i])}°  ·  רוח ${round(c.wind_speed_10m)} קמ״ש ${dirName(c.wind_direction_10m, true)}` : '';
      native.updateWidget(place.name, `${round(c.temperature_2m)}°`, WMO_EMOJI[wmoKind(c.weather_code)] || '', wmoText(c.weather_code), extra);
    }
    saveConfig();
  } catch (e) { console.warn(e); }
}

export function requestNotifications() {
  return new Promise((resolve) => {
    if (!native) return resolve(false);
    if (native.hasNotificationPermission()) return resolve(true);
    window.onNativeNotifPermission = (g) => resolve(!!g);
    native.requestNotificationPermission();
  });
}

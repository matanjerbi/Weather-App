// App shell: tabs, navigation, settings, onboarding.
import { WeatherMap } from './map.js';
import { ForecastView } from './forecast.js';
import { LabView } from './lab.js';
import { LearnView } from './learn.js';
import { LAYER_BY_ID } from './layers.js';
import { store } from './store.js';
import { native, saveConfig, requestNotifications } from './native.js';
import { el, $, $$, toast } from './util.js';

const screens = {};
let current = 'forecast';
let mapView, forecastView, labView, learnView;

function show(name) {
  current = name;
  $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.screen === name));
  if (name === 'map') { mapView.visible(); } else { mapView.pause(); }
  if (name !== 'map') window.scrollTo(0, 0);
}

const nav = {
  onMap(layerId) {
    const l = LAYER_BY_ID[layerId];
    if (l) mapView.preselect = l;
    show('map');
  },
  onLesson(id) {
    show('learn');
    learnView.lesson(id);
  },
  onLab(place, tool) {
    show('lab');
    labView.open(place || store.get().place, tool);
  },
  onPlace(p) {
    store.set({ place: { name: p.name, lat: p.lat, lon: p.lon, auto: !!p.auto } });
    show('forecast');
    forecastView.load(true);
  },
  onPlaceChanged(p) {
    forecastView.load(true);
    mapView.setPlace(p);
    saveConfig();
  },
  openSettings,
};

function openSettings() {
  const st = store.get();
  const a = { ...st.alerts };
  const sw = (label, checked, onChange, sub) => {
    const inp = el('input', { type: 'checkbox', checked: checked ? true : null });
    inp.addEventListener('change', () => onChange(inp.checked));
    return el('label', { class: 'setrow' }, el('div', {}, el('b', {}, label), sub ? el('div', { class: 'muted small' }, sub) : null), el('span', { class: 'toggle' }, inp, el('i')));
  };
  const num = (label, value, min, max, step, unit, onChange) => {
    const v = el('b', {}, `${value} ${unit}`);
    const r = el('input', { type: 'range', min, max, step, value, class: 'tslider' });
    r.addEventListener('input', () => { v.textContent = `${r.value} ${unit}`; onChange(+r.value); });
    return el('div', { class: 'setrow col' }, el('div', { class: 'row space' }, el('span', {}, label), v), r);
  };
  const saveAlerts = () => { store.set({ alerts: { ...a } }); saveConfig(); };
  const modal = el('div', { class: 'modal' }, el('div', { class: 'mbox tall' },
    el('div', { class: 'ichead' }, el('b', {}, '⚙ הגדרות'), el('button', { class: 'x', onclick: () => modal.remove() }, '✕')),
    el('div', { class: 'cardtitle' }, 'התראות'),
    sw('התראות מזג אוויר', a.enabled, async (v) => {
      if (v && native) {
        const ok = await requestNotifications();
        if (!ok) { toast('צריך לאשר התראות בהגדרות הטלפון'); }
      }
      if (v && !native) toast('התראות פועלות רק באפליקציה המותקנת');
      a.enabled = v; saveAlerts();
    }, `נבדק כל חצי שעה עבור ${st.place.name}`),
    sw('🌧️ גשם מתקרב (שעה קדימה)', a.rain, (v) => { a.rain = v; saveAlerts(); }),
    sw('💨 משבי רוח חזקים', a.wind, (v) => { a.wind = v; saveAlerts(); }),
    num('סף משבים', a.windKmh, 30, 90, 5, 'קמ״ש', (v) => { a.windKmh = v; saveAlerts(); }),
    sw('🌡️ חום כבד', a.heat, (v) => { a.heat = v; saveAlerts(); }),
    num('סף חום', a.heatC, 30, 42, 1, '°', (v) => { a.heatC = v; saveAlerts(); }),
    sw('🔥 שרב (חם ויבש)', a.sharav, (v) => { a.sharav = v; saveAlerts(); }),
    native ? el('div', { class: 'row wrap' },
      el('button', { class: 'btn small', onclick: async () => { await requestNotifications(); native.testAlert(); } }, 'שלח התראת בדיקה'),
      el('button', { class: 'btn small', onclick: () => { native.runCheckNow(); toast('בודק עכשיו…'); } }, 'בדוק עכשיו')) : null,
    el('div', { class: 'cardtitle' }, 'תצוגה'),
    sw('🏍️ מצב אופנוע', st.moto.enabled, (v) => { store.set({ moto: { enabled: v } }); forecastView.load(); }, 'ציון רכיבה וחלונות זמן טובים במסך התחזית'),
    sw('🎓 מצב מקצועי — לפתוח את כל השכבות', st.proMode, (v) => { store.set({ proMode: v }); }, 'בלי לחכות לשיעורים'),
    el('div', { class: 'cardtitle' }, 'נתונים'),
    el('p', { class: 'muted small' }, 'תחזיות ומודלים: Open-Meteo (ECMWF, GFS, ICON). מכ״ם: RainViewer. לוויין: EUMETSAT. מפה: OpenStreetMap ו-CARTO.'),
    el('button', { class: 'btn small danger', onclick: () => { if (confirm('לאפס את ההתקדמות בשיעורים ובמשחק?')) { store.set({ completed: {}, unlocked: {}, predictions: [], xp: 0 }); toast('אופס'); modal.remove(); learnView.home(); } } }, 'איפוס התקדמות'),
  ));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.append(modal);
}

function intro() {
  const steps = [
    ['🌍', 'ברוך הבא ל"אטמוספרה"', 'אפליקציית מזג אוויר שגם מלמדת אותך להבין אותו. כל דבר שתראה כאן, ממפת הרוחות ועד דיאגרמות של חזאים, מגיע עם הסבר.'],
    ['🗺️', 'המפה', 'רוח, טמפרטורה, גשם, לחץ, מכ״ם ולוויין. לחץ על "?" לקבלת הסבר, ועל כל נקודה במפה לקבלת הנתונים שלה. הסליידר מזיז אותך 5 ימים קדימה.'],
    ['🎓', 'ללמוד', '23 שיעורים קצרים בארבעה שלבים: מהיסודות ועד Skew-T ומודלים. כל שיעור פותח שכבות מקצועיות חדשות במפה.'],
    ['🎯', 'להתאמן', 'כל יום אפשר לנחש את מזג האוויר של מחר ולהתחרות במודל האירופי. זו הדרך הכי מהירה ללמוד לקרוא מפה.'],
  ];
  let i = 0;
  const box = el('div', { class: 'mbox introbox' });
  const modal = el('div', { class: 'modal' }, box);
  const draw = () => {
    const [e, t, d] = steps[i];
    box.innerHTML = '';
    box.append(el('div', { class: 'bigemoji center' }, e), el('h2', { class: 'center' }, t), el('p', { class: 'center' }, d),
      el('div', { class: 'dots center' }, ...steps.map((_, k) => el('span', { class: k === i ? 'd on' : 'd' }))),
      el('button', { class: 'btn primary block', onclick: () => {
        if (i < steps.length - 1) { i++; draw(); } else { modal.remove(); store.set({ seenIntro: true }); forecastView.useGps(true); }
      } }, i < steps.length - 1 ? 'הבא' : 'יאללה, מתחילים'));
  };
  draw();
  document.body.append(modal);
}

window.handleBack = () => {
  const m = $('.modal');
  if (m) { m.remove(); return true; }
  if (current === 'map' && mapView.isSheetOpen()) return true;
  if (current === 'learn' && learnView.back()) return true;
  if (current !== 'forecast') { show('forecast'); return true; }
  return false;
};

function boot() {
  for (const s of $$('.screen')) screens[s.dataset.screen] = s;
  forecastView = new ForecastView(screens.forecast, nav);
  mapView = new WeatherMap(screens.map, { onLesson: nav.onLesson, onLab: nav.onLab, onPlace: nav.onPlace });
  labView = new LabView(screens.lab, nav);
  learnView = new LearnView(screens.learn, nav);
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    const name = t.dataset.screen;
    if (name === 'learn' && current === 'learn') learnView.home();
    show(name);
    if (name === 'lab' && !labView.body) labView.open(store.get().place);
    if (name === 'learn' && !learnView.inner) learnView.home();
  }));
  learnView.home();
  forecastView.load();
  show('forecast');
  if (!store.get().seenIntro) intro();
  else if (store.get().place.auto) forecastView.useGps(true);
  // refresh when returning to the app after a while
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (Date.now() - hiddenAt > 20 * 60e3) forecastView.load();
  });
}

boot();

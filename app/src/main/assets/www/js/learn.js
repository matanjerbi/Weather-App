// Learning hub: course path, lessons with quizzes, glossary, forecast game.
import { LESSONS, LESSON_BY_ID, LEVELS, GLOSSARY } from './lessons.js';
import { LAYER_BY_ID } from './layers.js';
import { store } from './store.js';
import { forecast, recentDays } from './api.js';
import { scorePrediction, WIND_CATS } from './game.js';
import { el, dateKey, dayName, round, toast } from './util.js';

export class LearnView {
  constructor(root, cb) {
    this.root = root;
    this.cb = cb; // { onMap(layer), onLab(place, tool) }
    this.stack = [];
  }

  home() {
    this.stack = [];
    const st = store.get();
    const done = Object.keys(st.completed).length;
    const root = this.root;
    root.innerHTML = '';
    const pct = Math.round(done / LESSONS.length * 100);
    root.append(
      el('div', { class: 'fhead' }, el('div', { class: 'h1' }, '🎓 ללמוד מזג אוויר'), el('div', { class: 'xp' }, `⭐ ${st.xp || 0}`)),
      el('div', { class: 'card progress' },
        el('div', { class: 'row space' }, el('b', {}, `${done} מתוך ${LESSONS.length} שיעורים`), el('span', { class: 'muted' }, `${pct}%`)),
        el('div', { class: 'pbar' }, el('span', { style: { width: pct + '%' } })),
        el('div', { class: 'muted small' }, this.rank(done))),
    );
    root.append(this.gameCard());
    root.append(el('div', { class: 'row wrap' },
      el('button', { class: 'btn', onclick: () => this.glossary() }, '📚 מילון מונחים'),
      el('button', { class: 'btn', onclick: () => this.gameHistory() }, '🏆 היסטוריית תחזיות')));

    for (const lvl of LEVELS) {
      const ls = LESSONS.filter(l => l.level === lvl.n);
      const dn = ls.filter(l => st.completed[l.id]).length;
      root.append(el('div', { class: 'levelhead' }, el('span', { class: 'lvemoji' }, lvl.emoji),
        el('div', {}, el('b', {}, `שלב ${lvl.n}: ${lvl.name}`), el('div', { class: 'muted small' }, `${lvl.desc} · ${dn}/${ls.length}`))));
      const path = el('div', { class: 'path' });
      ls.forEach((l) => {
        const isDone = !!st.completed[l.id];
        const next = !isDone && LESSONS.find(x => !st.completed[x.id])?.id === l.id;
        path.append(el('button', { class: `lesson ${isDone ? 'done' : ''} ${next ? 'next' : ''}`, onclick: () => this.lesson(l.id) },
          el('span', { class: 'lemoji' }, isDone ? '✓' : l.emoji),
          el('div', { class: 'ltxt' }, el('b', {}, l.title), el('div', { class: 'muted small' },
            `${l.minutes} דק׳`, (l.unlocks || []).length ? ` · פותח: ${(l.unlocks || []).map(u => LAYER_BY_ID[u].name).join(', ')}` : '')),
          next ? el('span', { class: 'nexttag' }, 'הבא') : null));
      });
      root.append(path);
    }
    root.append(el('div', { class: 'foot' }, 'כל שיעור פותח שכבות חדשות במפה. אפשר גם לפתוח הכול ב"מצב מקצועי" בהגדרות.'));
  }

  rank(done) {
    if (done >= 22) return '🏅 דרגה: חזאי';
    if (done >= 16) return '🌀 דרגה: צייד סערות';
    if (done >= 11) return '🗺️ דרגה: קורא מפות';
    if (done >= 5) return '🌤️ דרגה: מתלמד';
    return '🌱 דרגה: מתחיל — התחל משיעור 1';
  }

  back() {
    if (this.stack.length) { const f = this.stack.pop(); f(); return true; }
    if (this.inner) { this.inner = false; this.home(); return true; }
    return false;
  }

  // ───────────── LESSON ─────────────
  lesson(id, startAt = 0) {
    const l = LESSON_BY_ID[id];
    if (!l) return this.home();
    this.inner = true;
    let i = startAt;
    const root = this.root;
    const total = l.sections.length;
    const show = () => {
      root.innerHTML = '';
      root.scrollTop = 0;
      window.scrollTo(0, 0);
      const s = l.sections[i];
      root.append(
        el('div', { class: 'fhead' }, el('button', { class: 'iconbtn', onclick: () => { this.inner = false; this.home(); } }, '✕'),
          el('div', { class: 'dots' }, ...Array.from({ length: total + 1 }, (_, k) => el('span', { class: k < i ? 'd done' : k === i ? 'd on' : 'd' }))),
          el('span', { class: 'muted small' }, `${i + 1}/${total}`)),
        el('div', { class: 'lessonhead' }, el('span', { class: 'bigemoji' }, l.emoji), el('div', { class: 'muted' }, l.title)),
        el('div', { class: 'card lessoncard' },
          el('h2', {}, s.h),
          el('p', { html: s.p }),
          s.tip ? el('div', { class: 'tip' }, '💡 ', el('span', { html: s.tip })) : null),
        el('div', { class: 'row wrap' },
          l.layer ? el('button', { class: 'btn small', onclick: () => this.cb.onMap(l.layer) }, `🗺️ תראה במפה: ${LAYER_BY_ID[l.layer].name}`) : null,
          l.lab ? el('button', { class: 'btn small', onclick: () => this.cb.onLab(null, l.lab) }, '🔬 פתח במעבדה') : null),
        el('div', { class: 'navrow' },
          i > 0 ? el('button', { class: 'btn', onclick: () => { i--; show(); } }, '→ הקודם') : el('span'),
          el('button', { class: 'btn primary', onclick: () => { if (i < total - 1) { i++; show(); } else this.quiz(l); } }, i < total - 1 ? 'הבא ←' : 'למבחן קצר ←')),
      );
    };
    show();
  }

  quiz(l) {
    const root = this.root;
    let qi = 0, correct = 0;
    const show = () => {
      const q = l.quiz[qi];
      root.innerHTML = '';
      window.scrollTo(0, 0);
      const opts = el('div', { class: 'opts' });
      const fb = el('div', { class: 'feedback hidden' });
      const nextBtn = el('button', { class: 'btn primary block hidden', onclick: () => { qi++; if (qi < l.quiz.length) show(); else this.finish(l, correct); } }, qi < l.quiz.length - 1 ? 'השאלה הבאה ←' : 'סיום ←');
      q.o.forEach((o, k) => {
        const b = el('button', { class: 'opt', onclick: () => {
          if (opts.dataset.done) return;
          opts.dataset.done = 1;
          const ok = k === q.a;
          if (ok) correct++;
          b.classList.add(ok ? 'right' : 'wrong');
          opts.children[q.a].classList.add('right');
          fb.className = 'feedback ' + (ok ? 'ok' : 'no');
          fb.innerHTML = '';
          fb.append(el('b', {}, ok ? '✓ נכון! ' : '✗ לא בדיוק. '), q.why);
          nextBtn.classList.remove('hidden');
        } }, o);
        opts.append(b);
      });
      root.append(
        el('div', { class: 'fhead' }, el('button', { class: 'iconbtn', onclick: () => { this.inner = false; this.home(); } }, '✕'),
          el('b', {}, `מבחן: ${l.title}`), el('span', { class: 'muted small' }, `${qi + 1}/${l.quiz.length}`)),
        el('div', { class: 'card lessoncard' }, el('h2', {}, q.q), opts, fb), nextBtn);
    };
    show();
  }

  finish(l, correct) {
    const st = store.get();
    const total = l.quiz.length;
    const passed = correct >= Math.ceil(total * 0.5);
    const first = !st.completed[l.id];
    const newUnlocks = (l.unlocks || []).filter(u => !st.unlocked[u]);
    if (passed) {
      const unlocked = { ...st.unlocked };
      (l.unlocks || []).forEach(u => { unlocked[u] = true; });
      store.set({ completed: { ...st.completed, [l.id]: { score: correct, at: Date.now() } }, unlocked });
      if (first) store.addXp(10 + correct * 5);
    }
    const next = LESSONS[LESSONS.indexOf(l) + 1];
    this.root.innerHTML = '';
    this.root.append(el('div', { class: 'card center finish' },
      el('div', { class: 'bigemoji' }, passed ? (correct === total ? '🏆' : '🎉') : '📖'),
      el('h2', {}, passed ? (correct === total ? 'מושלם!' : 'עברת!') : 'כמעט'),
      el('p', {}, `${correct} מתוך ${total} תשובות נכונות${passed && first ? ` · +${10 + correct * 5} ⭐` : ''}`),
      passed && newUnlocks.length ? el('div', { class: 'unlock' }, el('b', {}, '🔓 נפתח במפה:'), ...newUnlocks.map(u => el('button', { class: 'btn small primary', onclick: () => this.cb.onMap(u) }, `${LAYER_BY_ID[u].emoji} ${LAYER_BY_ID[u].name}`))) : null,
      !passed ? el('p', { class: 'muted' }, 'צריך לפחות חצי מהתשובות. עבור שוב על השיעור, זה לוקח 2 דקות.') : null,
      el('div', { class: 'row wrap center' },
        !passed ? el('button', { class: 'btn primary', onclick: () => this.lesson(l.id) }, 'חזרה על השיעור') : null,
        passed && next ? el('button', { class: 'btn primary', onclick: () => this.lesson(next.id) }, `לשיעור הבא: ${next.title}`) : null,
        el('button', { class: 'btn', onclick: () => { this.inner = false; this.home(); } }, 'לכל השיעורים'))));
  }

  // ───────────── GLOSSARY ─────────────
  glossary() {
    this.inner = true;
    const root = this.root;
    root.innerHTML = '';
    const input = el('input', { class: 'search', type: 'search', placeholder: 'חפש מונח…' });
    const list = el('div', { class: 'gloss' });
    const render = () => {
      const q = input.value.trim();
      list.innerHTML = '';
      GLOSSARY.filter(([t, d]) => !q || t.includes(q) || d.includes(q)).sort((a, b) => a[0].localeCompare(b[0], 'he'))
        .forEach(([t, d]) => list.append(el('div', { class: 'gitem' }, el('b', {}, t), el('div', {}, d))));
    };
    input.addEventListener('input', render);
    root.append(el('div', { class: 'fhead' }, el('button', { class: 'iconbtn', onclick: () => { this.inner = false; this.home(); } }, '→'), el('div', { class: 'h1' }, '📚 מילון')), input, list);
    render();
  }

  // ───────────── FORECAST GAME ─────────────
  gameCard() {
    const st = store.get();
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    const key = dateKey(tom);
    const existing = st.predictions.find(p => p.date === key);
    const card = el('div', { class: 'card game' }, el('div', { class: 'eyebrow' }, '🎯 חזאי היום'));
    this.resolvePending();
    const scored = st.predictions.filter(p => p.result);
    const lastScored = scored[scored.length - 1];
    if (lastScored && Date.now() - (lastScored.resolvedAt || 0) < 36 * 3600e3) {
      const r = lastScored.result;
      card.append(el('div', { class: 'gameres' },
        el('b', {}, `התחזית שלך ל${dayName(new Date(lastScored.date + 'T12:00'))}: ${r.total}/100`),
        el('div', { class: 'muted small' }, `אמרת ${lastScored.guess.tmax}°, בפועל ${round(lastScored.actual.tmax, 1)}° · גשם: ${r.rainActual ? 'ירד' : 'לא ירד'}${lastScored.model ? ` · המודל אמר ${round(lastScored.model.tmax)}°` : ''}`),
        lastScored.model ? el('div', { class: 'small' }, Math.abs(lastScored.guess.tmax - lastScored.actual.tmax) < Math.abs(lastScored.model.tmax - lastScored.actual.tmax) ? '🏆 ניצחת את המודל בטמפרטורה!' : '🤖 המודל היה מדויק יותר הפעם') : null));
    }
    if (existing) {
      card.append(el('p', {}, `ניחשת למחר ב${st.place.name}: ${existing.guess.tmax}°, ${existing.guess.rain ? 'עם גשם' : 'בלי גשם'}, רוח ${WIND_CATS.find(w => w.id === existing.guess.wind).name}. נבדוק מחרתיים בבוקר!`));
      return card;
    }
    card.append(el('p', {}, `נחש איך ייראה מחר (${dayName(tom)}) ב${st.place.name}. מותר להסתכל במפה ובמעבדה, אבל לא במסך התחזית 😉`),
      el('button', { class: 'btn primary', onclick: () => this.predict() }, 'לנחש את מחר'));
    return card;
  }

  predict() {
    this.inner = true;
    const st = store.get();
    const root = this.root;
    root.innerHTML = '';
    let tmax = 25, rain = false, wind = 'mid';
    const tv = el('div', { class: 'bigval center' }, `${tmax}°`);
    const sl = el('input', { type: 'range', min: -5, max: 46, value: tmax, class: 'tslider' });
    sl.addEventListener('input', () => { tmax = +sl.value; tv.textContent = `${tmax}°`; });
    const seg = (items, get, set) => {
      const s = el('div', { class: 'seg' });
      const draw = () => { s.innerHTML = ''; items.forEach(([v, label]) => s.append(el('button', { class: get() === v ? 'on' : '', onclick: () => { set(v); draw(); } }, label))); };
      draw();
      return s;
    };
    root.append(
      el('div', { class: 'fhead' }, el('button', { class: 'iconbtn', onclick: () => { this.inner = false; this.home(); } }, '✕'), el('div', { class: 'h1' }, '🎯 התחזית שלך למחר')),
      el('div', { class: 'card' },
        el('div', { class: 'cardtitle' }, 'טמפרטורה מקסימלית'), tv, sl,
        el('div', { class: 'cardtitle' }, 'יירד גשם (לפחות 1 מ״מ)?'), seg([[false, '☀️ לא'], [true, '🌧️ כן']], () => rain, (v) => { rain = v; }),
        el('div', { class: 'cardtitle' }, 'רוח מקסימלית'), seg(WIND_CATS.map(w => [w.id, `${w.name} (${w.desc})`]), () => wind, (v) => { wind = v; })),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn small', onclick: () => this.cb.onMap('temp') }, '🗺️ להציץ במפה'),
        el('button', { class: 'btn small', onclick: () => this.cb.onLab(null, 'models') }, '⚖️ להציץ במודלים')),
      el('button', { class: 'btn primary block', onclick: async () => {
        const tom = new Date(); tom.setDate(tom.getDate() + 1);
        let model = null;
        try {
          const f = await forecast(st.place.lat, st.place.lon);
          const i = f.daily.time.findIndex(t => dateKey(new Date(t * 1000)) === dateKey(tom));
          if (i >= 0) model = { tmax: f.daily.temperature_2m_max[i], precip: f.daily.precipitation_sum[i], wind: f.daily.wind_speed_10m_max[i] };
        } catch (e) { /* fine without */ }
        const preds = [...store.get().predictions, { date: dateKey(tom), lat: st.place.lat, lon: st.place.lon, place: st.place.name, guess: { tmax, rain, wind }, model, at: Date.now() }].slice(-60);
        store.set({ predictions: preds });
        store.addXp(5);
        toast('נשמר! נבדוק מחר בערב 🎯');
        this.inner = false;
        this.home();
      } }, 'לשמור את התחזית'));
  }

  async resolvePending() {
    const st = store.get();
    const today = dateKey(new Date());
    const pending = st.predictions.filter(p => !p.result && p.date < today);
    if (!pending.length || this._resolving) return;
    this._resolving = true;
    try {
      let changed = false;
      const preds = [...st.predictions];
      for (const p of pending) {
        const d = await recentDays(p.lat, p.lon);
        const i = d.daily.time.indexOf(p.date);
        if (i < 0) continue;
        const actual = { tmax: d.daily.temperature_2m_max[i], precip: d.daily.precipitation_sum[i], wind: d.daily.wind_speed_10m_max[i] };
        if (actual.tmax == null) continue;
        const result = scorePrediction(p.guess, actual);
        const k = preds.indexOf(p);
        preds[k] = { ...p, actual, result, resolvedAt: Date.now() };
        changed = true;
        store.addXp(Math.round(result.total / 10));
      }
      if (changed) { store.set({ predictions: preds }); if (!this.inner) this.home(); }
    } catch (e) { /* try again later */ } finally { this._resolving = false; }
  }

  gameHistory() {
    this.inner = true;
    const st = store.get();
    const scored = st.predictions.filter(p => p.result).reverse();
    const avg = scored.length ? Math.round(scored.reduce((s, p) => s + p.result.total, 0) / scored.length) : 0;
    const wins = scored.filter(p => p.model && Math.abs(p.guess.tmax - p.actual.tmax) < Math.abs(p.model.tmax - p.actual.tmax)).length;
    this.root.innerHTML = '';
    this.root.append(
      el('div', { class: 'fhead' }, el('button', { class: 'iconbtn', onclick: () => { this.inner = false; this.home(); } }, '→'), el('div', { class: 'h1' }, '🏆 התחזיות שלי')),
      el('div', { class: 'card' },
        el('div', { class: 'kv' }, el('span', {}, 'תחזיות שנבדקו'), el('b', {}, scored.length)),
        el('div', { class: 'kv' }, el('span', {}, 'ציון ממוצע'), el('b', {}, `${avg}/100`)),
        el('div', { class: 'kv' }, el('span', {}, 'ניצחת את המודל בטמפרטורה'), el('b', {}, `${wins} פעמים`))),
      ...(scored.length ? scored.map(p => el('div', { class: 'card small' },
        el('div', { class: 'row space' }, el('b', {}, `${p.date} · ${p.place}`), el('b', {}, `${p.result.total}`)),
        el('div', { class: 'muted small' }, `ניחוש: ${p.guess.tmax}° ${p.guess.rain ? '🌧️' : '☀️'} · בפועל: ${round(p.actual.tmax, 1)}° ${p.result.rainActual ? '🌧️' : '☀️'}${p.model ? ` · מודל: ${round(p.model.tmax)}°` : ''}`)))
        : [el('p', { class: 'muted center' }, 'עוד אין תחזיות שנבדקו.')]));
  }
}

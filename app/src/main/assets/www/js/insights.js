// "Why is today like this?" — rule-based explanations that connect today's data to a concept.
import { dayStats } from './wx.js';
import { dirName } from './util.js';

const inRange = (d, a, b) => (a <= b ? d >= a && d <= b : d >= a || d <= b);

/**
 * @param fx  result of prepare()
 * @param month 1-12
 * @returns array of {id, emoji, title, text, lesson, layer, score}
 */
export function insights(fx, month = new Date().getMonth() + 1) {
  const today = dayStats(fx.hoursOfDay(fx.todayIdx));
  const tomorrow = dayStats(fx.hoursOfDay(fx.todayIdx + 1));
  const out = [];
  const R = (v) => Math.round(v);
  const dir = dirName(today.windDir);
  const east = inRange(today.windDir, 45, 160);
  const west = inRange(today.windDir, 200, 330);
  const winter = [11, 12, 1, 2, 3].includes(month);
  const summer = [6, 7, 8, 9].includes(month);

  if (today.capeMax >= 600 && today.precip >= 1) {
    out.push({
      id: 'storms', emoji: '⛈️', score: 95, lesson: 'cape', layer: 'cape',
      title: 'אוויר לא יציב — סיכוי לסופות רעמים',
      text: `ה-CAPE מגיע היום ל-${R(today.capeMax)} J/kg. זה אומר שחבילות אוויר חמות שעולות למעלה ממשיכות לעלות לבד, כמו בלון — וככה נבנים ענני סערה גבוהים (קומולונימבוס) עם ברקים וממטרים חזקים.`,
    });
  }
  if (today.precip >= 2 && west && today.pMin < 1012) {
    out.push({
      id: 'cyprus', emoji: '🌀', score: 90, lesson: 'cyprus', layer: 'pressure',
      title: winter ? 'מערכת חורפית — כנראה שקע קפריסאי' : 'מערכת גשם עם רוח מערבית',
      text: `לחץ נמוך (עד ${R(today.pMin)} hPa), רוח ${dir} וכ-${today.precip.toFixed(1)} מ״מ גשם. בחורף ככה נראה שקע ליד קפריסין: הרוח מסתובבת נגד כיוון השעון סביב השקע, ומביאה אלינו אוויר לח מהים.`,
    });
  } else if (today.precip >= 0.5) {
    out.push({
      id: 'rain', emoji: '🌧️', score: 70, lesson: 'clouds', layer: 'radar',
      title: 'יורד גשם — בוא נראה מאיפה',
      text: `צפויים כ-${today.precip.toFixed(1)} מ״מ היום. פתח את שכבת המכ״ם וראה איך הגשם זז עם הרוח (${dir}). גשם נוצר כשאוויר לח עולה, מתקרר ומתעבה לטיפות.`,
    });
  }
  if (today.tmax >= 30 && today.rhMinDay <= 25 && (east || inRange(today.windDir, 120, 220))) {
    out.push({
      id: 'sharav', emoji: '🔥', score: 92, lesson: 'sharav', layer: 'humidity',
      title: 'שרב! אוויר חם ויבש מהמדבר',
      text: `עד ${R(today.tmax)}° עם לחות של ${R(today.rhMinDay)}% בלבד, ורוח ${dir}. האוויר הגיע מהמדבר במקום מהים — ולכן הוא גם חם וגם יבש. בשכבת הלחות תראה את "לשון" האוויר היבש.`,
    });
  } else if (east && today.rhMinDay <= 35 && !summer) {
    out.push({
      id: 'sharkia', emoji: '🏜️', score: 80, lesson: 'sharav', layer: 'wind',
      title: 'שרקיה — רוח מזרחית יבשה',
      text: `הרוח נושבת היום מ${dir}, מהמדבר ולא מהים, והלחות יורדת ל-${R(today.rhMinDay)}%. בסתיו ובחורף זה קורה כשיש רמה מצפון-מזרח ואפיק ים-סופי מדרום. לרוב: קר בלילה, חם ביום, ושמיים צלולים.`,
    });
  }
  if (summer && today.rhAvg >= 60 && (west || inRange(today.windDir, 270, 360))) {
    out.push({
      id: 'persian', emoji: '🥵', score: 65, lesson: 'persian', layer: 'dewpoint',
      title: 'קיץ ישראלי קלאסי — אפיק פרסי',
      text: `לחות ממוצעת של ${R(today.rhAvg)}% ונקודת טל של ${R(today.dewAvg)}°. האפיק הפרסי (שלוחה של לחץ נמוך מהמפרץ הפרסי) מושך אלינו רוח מערבית קבועה מהים — לכן חם ודביק בחוף, ונעים יותר בהרים.`,
    });
  }
  if (today.gustMax >= 55) {
    out.push({
      id: 'gusty', emoji: '💨', score: 85, lesson: 'gusts', layer: 'pressure',
      title: 'יום סוער',
      text: `משבים של עד ${R(today.gustMax)} קמ״ש. בשכבת הלחץ חפש איזוברים צפופים מעליך — ככל שהלחץ משתנה מהר יותר על פני מרחק קצר, האוויר "נדחף" חזק יותר.`,
    });
  }
  if (today.visMin < 1000) {
    out.push({
      id: 'fog', emoji: '🌫️', score: 75, lesson: 'humidity', layer: 'visibility',
      title: 'ערפל',
      text: `הראות יורדת עד ${R(today.visMin)} מ׳. בלילה צלול האדמה מקרינה חום לחלל, האוויר שמעליה מתקרר עד נקודת הטל — ואדי המים הופכים לטיפות זעירות שמרחפות באוויר.`,
    });
  }
  if (winter && today.freezeMin < 1100) {
    out.push({
      id: 'snow', emoji: '❄️', score: 88, lesson: 'cape', layer: 'freezing',
      title: 'אוויר קר מאוד — שלג בהרים?',
      text: `גובה האפס יורד ל-${R(today.freezeMin)} מ׳. אם הוא נמוך מגובה ההר ויש משקעים — יורד שלג. ירושלים בגובה ~800 מ׳, החרמון מעל 2000 מ׳.`,
    });
  }
  if (tomorrow.tmax - today.tmax >= 6) {
    out.push({
      id: 'warmup', emoji: '📈', score: 60, lesson: 'levels', layer: 't850',
      title: `מחר יתחמם ב-${R(tomorrow.tmax - today.tmax)}°`,
      text: 'כשמסת אוויר חמה מתקרבת רואים את זה קודם בגובה. פתח את שכבת 850 hPa והזז את הזמן למחר — תראה את האוויר החם (כתום) נכנס.',
    });
  } else if (today.tmax - tomorrow.tmax >= 6) {
    out.push({
      id: 'cooldown', emoji: '📉', score: 60, lesson: 'levels', layer: 't850',
      title: `מחר יתקרר ב-${R(today.tmax - tomorrow.tmax)}°`,
      text: 'מסת אוויר קרה בדרך. בשכבת 850 hPa תראה את האוויר הכחול מתקדם לכיוון ישראל — לרוב מצפון-מערב, מאירופה.',
    });
  }
  if (today.pAvg >= 1019 && today.cloudAvg < 25 && today.precip < 0.2) {
    out.push({
      id: 'high', emoji: '🔵', score: 50, lesson: 'pressure', layer: 'pressure',
      title: 'רמה — מזג אוויר יציב',
      text: `לחץ גבוה של כ-${R(today.pAvg)} hPa. ברמה האוויר שוקע לאט מלמעלה, מתחמם ומתייבש תוך כדי — ולכן כמעט אין עננים.`,
    });
  }
  if (today.tmax - today.tmin >= 13 && today.cloudAvg < 30) {
    out.push({
      id: 'diurnal', emoji: '🌗', score: 45, lesson: 'temperature', layer: 'temp',
      title: `הפרש של ${R(today.tmax - today.tmin)}° בין יום ללילה`,
      text: 'שמיים צלולים ואוויר יבש הם כמו בית בלי שמיכה: ביום השמש מחממת חזק, ובלילה החום בורח ישר לחלל. בחוף, הים מרכך את ההפרש.',
    });
  }
  if (!out.length) {
    out.push({
      id: 'breeze', emoji: '🏖️', score: 30, lesson: 'breeze', layer: 'wind',
      title: 'יום רגיל — בדיוק הזמן ללמוד על בריזה',
      text: `הרוח היום בעיקר ${dir}, עד ${R(today.windMax)} קמ״ש. בצהריים היבשה מתחממת יותר מהים, האוויר מעליה עולה, ואוויר מהים "נשאב" פנימה — זו הבריזה. הזז את הסליידר בין הבוקר לצהריים ותראה את הרוח מסתובבת.`,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

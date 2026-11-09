// Map layer definitions + color scales.

export const SCALES = {
  wind: [[0, '#3B4CC0'], [10, '#3D8BD9'], [20, '#36B5A5'], [30, '#7ACB4F'], [40, '#E3D23B'], [55, '#F39C34'], [70, '#E5533B'], [90, '#B3245C'], [120, '#7A1F7A']],
  jet: [[0, '#1E2A5A'], [60, '#2E5FA8'], [100, '#2BA3B5'], [140, '#7ACB4F'], [180, '#E3D23B'], [220, '#F06A2F'], [270, '#C2185B'], [320, '#7A1F7A']],
  temp: [[-15, '#7A4FD6'], [-5, '#4B6FE0'], [0, '#3FA0E8'], [5, '#45C2D6'], [10, '#5ACB9B'], [15, '#8AD25F'], [20, '#D9D43C'], [25, '#F5B133'], [30, '#F27B2E'], [35, '#E2462F'], [40, '#B5203F'], [46, '#6E1240']],
  t850: [[-20, '#7A4FD6'], [-10, '#4B6FE0'], [-4, '#3FA0E8'], [0, '#45C2D6'], [5, '#5ACB9B'], [10, '#8AD25F'], [15, '#D9D43C'], [20, '#F5B133'], [25, '#F27B2E'], [30, '#B5203F']],
  t500: [[-45, '#5B3FB8'], [-35, '#3F68D8'], [-28, '#3FA0E8'], [-22, '#45C2D6'], [-16, '#8AD25F'], [-10, '#E3C23B'], [-4, '#F27B2E']],
  precip: [[0, 'rgba(0,0,0,0)'], [0.1, 'rgba(120,200,255,0.35)'], [0.5, '#64B5F6'], [1, '#2F8CE0'], [2.5, '#2E5FD0'], [5, '#5A3FD0'], [10, '#B23FD0'], [20, '#E0309A'], [40, '#FF6060']],
  clouds: [[0, 'rgba(255,255,255,0)'], [20, 'rgba(230,236,245,0.15)'], [50, 'rgba(230,236,245,0.45)'], [80, 'rgba(240,244,250,0.75)'], [100, 'rgba(250,252,255,0.92)']],
  pressure: [[975, '#5A2D9A'], [990, '#3F5FC8'], [1000, '#3F95C8'], [1008, '#5AA79A'], [1013, '#7FA868'], [1018, '#B8A850'], [1025, '#C98A45'], [1035, '#C9573F']],
  humidity: [[0, '#A0522D'], [20, '#D39A4A'], [40, '#E8D27A'], [60, '#8FD18B'], [80, '#3FA9C8'], [100, '#2A5FB8']],
  dewpoint: [[-15, '#8B5A2B'], [-5, '#C08A4A'], [5, '#E0C870'], [10, '#A8D878'], [15, '#5AC88A'], [20, '#2FA8B8'], [24, '#2A6FD0'], [28, '#5A3FC8']],
  cape: [[0, 'rgba(0,0,0,0)'], [100, 'rgba(255,240,120,0.25)'], [300, '#F4E04D'], [700, '#F5A623'], [1200, '#F06A2F'], [2000, '#D6243A'], [3000, '#A01A7D'], [4500, '#5E1E8C']],
  visibility: [[0, '#F5F5F5'], [1000, '#C8CDD4'], [3000, 'rgba(150,160,175,0.6)'], [8000, 'rgba(100,110,125,0.25)'], [20000, 'rgba(0,0,0,0)']],
  freezing: [[0, '#E8F4FF'], [1000, '#A8D4F5'], [2000, '#6AA8E0'], [3000, '#5ACB9B'], [4000, '#E3C23B'], [5000, '#F27B2E']],
  uv: [[0, '#3E8E4A'], [3, '#A3C83B'], [6, '#F5C433'], [8, '#F07A2E'], [11, '#D6243A'], [14, '#8E3CB8']],
  waves: [[0, '#1E3A6E'], [0.3, '#2A6FB0'], [0.7, '#2FA8B8'], [1.2, '#5ACB9B'], [2, '#E3D23B'], [3, '#F27B2E'], [4.5, '#D6243A'], [7, '#7A1F7A']],
  sst: [[10, '#3F5FC8'], [16, '#3FA0E8'], [20, '#45C2D6'], [24, '#8AD25F'], [27, '#E3C23B'], [30, '#F27B2E'], [33, '#D6243A']],
};

function parseColor(c) {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  const p = m[1].split(',').map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3] * 255) : 255];
}

/** Build a lookup: value -> [r,g,b,a] */
export function makeScale(stops) {
  const s = stops.map(([v, c]) => [v, parseColor(c)]);
  const lo = s[0][0], hi = s[s.length - 1][0];
  const N = 512;
  const lut = new Uint8ClampedArray(N * 4);
  for (let k = 0; k < N; k++) {
    const v = lo + (hi - lo) * k / (N - 1);
    let a = 0;
    while (a < s.length - 2 && v > s[a + 1][0]) a++;
    const [v0, c0] = s[a], [v1, c1] = s[a + 1];
    const t = v1 === v0 ? 0 : Math.min(1, Math.max(0, (v - v0) / (v1 - v0)));
    for (let ch = 0; ch < 4; ch++) lut[k * 4 + ch] = c0[ch] + (c1[ch] - c0[ch]) * t;
  }
  return {
    lo, hi, stops,
    at(v, out, o) {
      let k = Math.round((v - lo) / (hi - lo) * (N - 1));
      if (k < 0) k = 0; else if (k >= N) k = N - 1;
      out[o] = lut[k * 4]; out[o + 1] = lut[k * 4 + 1]; out[o + 2] = lut[k * 4 + 2]; out[o + 3] = lut[k * 4 + 3];
    },
    css() {
      return `linear-gradient(to left, ${stops.map(([v, c]) => `${c} ${((v - lo) / (hi - lo) * 100).toFixed(1)}%`).join(',')})`;
    },
  };
}

// level: 'basic' = open from day one; otherwise unlocked by the lesson in `lesson`.
export const LAYERS = [
  {
    id: 'wind', name: 'רוח', emoji: '💨', group: 'basic', vars: ['wind_speed_10m', 'wind_direction_10m'], heat: 'wind_speed_10m',
    scale: 'wind', unit: 'קמ״ש', particles: ['wind_speed_10m', 'wind_direction_10m'], lesson: 'wind',
    info: 'הקווים הזזים הם האוויר עצמו בגובה 10 מטר — הם זורמים לכיוון שהרוח נושבת אליו. הצבע מראה מהירות: כחול = חלש, אדום = חזק. שים לב איך הרוח מסתובבת סביב שקעים ורמות.',
  },
  {
    id: 'temp', name: 'טמפרטורה', emoji: '🌡️', group: 'basic', vars: ['temperature_2m', 'wind_speed_10m', 'wind_direction_10m'], heat: 'temperature_2m',
    scale: 'temp', unit: '°C', particles: ['wind_speed_10m', 'wind_direction_10m'], particleAlpha: 0.35, lesson: 'temperature',
    info: 'טמפרטורת האוויר בגובה 2 מטר — הגובה שבו מודדים בתחנות מטאורולוגיות. חפש איך ההרים קרים יותר מהשפלה, ואיך המדבר מתחמם ביום ומתקרר מהר בלילה.',
  },
  {
    id: 'precip', name: 'גשם (תחזית)', emoji: '🌧️', group: 'basic', vars: ['precipitation', 'wind_speed_10m', 'wind_direction_10m'], heat: 'precipitation',
    scale: 'precip', unit: 'מ״מ/שעה', particles: ['wind_speed_10m', 'wind_direction_10m'], particleAlpha: 0.3, lesson: 'clouds',
    info: 'כמה משקעים צפויים לרדת בכל שעה, לפי המודל. הזז את הסליידר קדימה כדי לראות איך מערכת גשם נכנסת מהים. ‏1 מ״מ = ליטר מים על כל מ״ר.',
  },
  {
    id: 'radar', name: 'מכ״ם חי', emoji: '📡', group: 'basic', tiles: 'radar', lesson: 'radar',
    info: 'זה לא מודל — זו מדידה אמיתית. המכ״ם שולח גלי רדיו ומודד מה חוזר מטיפות הגשם. ה-2 השעות האחרונות מוצגות בלולאה, כך שרואים לאן הגשם זז.',
  },
  {
    id: 'clouds', name: 'עננים', emoji: '☁️', group: 'basic', vars: ['cloud_cover', 'wind_speed_10m', 'wind_direction_10m'], heat: 'cloud_cover',
    scale: 'clouds', unit: '%', particles: ['wind_speed_10m', 'wind_direction_10m'], particleAlpha: 0.25, lesson: 'clouds',
    info: 'כמה מהשמיים מכוסה בעננים (0–100%). לבן = מעונן לגמרי. שים לב שעננים מתרכזים לאורך החזיתות ובצד ההר שהרוח מגיעה אליו.',
  },
  {
    id: 'pressure', name: 'לחץ ואיזוברים', emoji: '🌀', group: 'basic', vars: ['pressure_msl', 'wind_speed_10m', 'wind_direction_10m'], heat: 'pressure_msl',
    scale: 'pressure', unit: 'hPa', heatAlpha: 0.45, contour: { var: 'pressure_msl', step: 2, bold: 1012, label: (v) => v.toFixed(0) },
    extrema: { var: 'pressure_msl', hi: 'H', lo: 'L' }, particles: ['wind_speed_10m', 'wind_direction_10m'], particleAlpha: 0.35, lesson: 'pressure',
    info: 'הקווים הם איזוברים — כל קו מחבר נקודות עם אותו לחץ אוויר (כל 2 hPa). H = רמה (מזג אוויר יציב), L = שקע (עננים וגשם). קווים צפופים = רוח חזקה.',
  },
  {
    id: 'gusts', name: 'משבים', emoji: '🌬️', group: 'map', vars: ['wind_gusts_10m', 'wind_speed_10m', 'wind_direction_10m'], heat: 'wind_gusts_10m',
    scale: 'wind', unit: 'קמ״ש', particles: ['wind_speed_10m', 'wind_direction_10m'], lesson: 'gusts',
    info: 'המהירות של המשבים הכי חזקים — הדחיפות הפתאומיות שאתה מרגיש על האופנוע. משבים חזקים בהרבה מהרוח הממוצעת = אוויר סוער ולא יציב.',
  },
  {
    id: 'humidity', name: 'לחות', emoji: '💧', group: 'map', vars: ['relative_humidity_2m'], heat: 'relative_humidity_2m', scale: 'humidity', unit: '%', lesson: 'humidity',
    info: 'לחות יחסית — כמה אדי מים יש באוויר ביחס למקסימום שהוא יכול להכיל בטמפרטורה הזו. חום = יבש (מדבר, שרב), כחול = לח (חוף, לילה).',
  },
  {
    id: 'dewpoint', name: 'נקודת טל', emoji: '🌫️', group: 'map', vars: ['dew_point_2m'], heat: 'dew_point_2m', scale: 'dewpoint', unit: '°C', lesson: 'humidity',
    info: 'הטמפרטורה שבה האוויר יתחיל להתעבות לטיפות. זה מדד "אמיתי" לכמות המים באוויר. מעל 20° = מחניק ודביק (קיץ בתל אביב), מתחת ל-5° = יבש מאוד.',
  },
  {
    id: 'visibility', name: 'ראות וערפל', emoji: '👁️', group: 'map', vars: ['visibility'], heat: 'visibility', scale: 'visibility', unit: 'מ׳', lesson: 'humidity',
    valueFmt: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + ' ק״מ' : Math.round(v) + ' מ׳'),
    info: 'כמה רחוק אפשר לראות. אזורים לבנים = ערפל או אובך כבד. ערפל נוצר בעיקר בלילות צלולים ולחים, כשהאוויר מתקרר עד נקודת הטל.',
  },
  {
    id: 'uv', name: 'קרינת UV', emoji: '🕶️', group: 'map', vars: ['uv_index'], heat: 'uv_index', scale: 'uv', unit: '', lesson: 'temperature',
    info: 'עוצמת הקרינה העל-סגולה. מעל 8 = גבוה מאוד — כוויה תוך פחות מ-20 דקות. בלילה היא תמיד 0.',
  },
  {
    id: 'cape', name: 'CAPE — אנרגיה לסופות', emoji: '⚡', group: 'pro', vars: ['cape', 'wind_speed_10m', 'wind_direction_10m'], heat: 'cape',
    scale: 'cape', unit: 'J/kg', particles: ['wind_speed_10m', 'wind_direction_10m'], particleAlpha: 0.3, lesson: 'cape',
    info: 'CAPE היא כמות האנרגיה שחבילת אוויר חמה יכולה לקבל כשהיא עולה. מעל 500 = יכולות להתפתח סופות רעמים, מעל 1500 = סופות חזקות. זה הדלק — עדיין צריך גם "מצת".',
  },
  {
    id: 'freezing', name: 'גובה האפס', emoji: '🧊', group: 'pro', vars: ['freezing_level_height'], heat: 'freezing_level_height', scale: 'freezing', unit: 'מ׳', lesson: 'cape',
    info: 'הגובה שבו הטמפרטורה יורדת ל-0°. כשהוא יורד מתחת ל-1000 מטר בחורף — יש סיכוי לשלג בירושלים ובגולן.',
  },
  {
    id: 't850', name: '850 hPa — טמפ׳ ורוח', emoji: '🛩️', group: 'pro', vars: ['temperature_850hPa', 'wind_speed_850hPa', 'wind_direction_850hPa'], heat: 'temperature_850hPa',
    scale: 't850', unit: '°C', particles: ['wind_speed_850hPa', 'wind_direction_850hPa'], lesson: 'levels',
    info: 'בערך 1.5 ק״מ גובה — מעל השפעת הקרקע. כאן רואים את "המסה" של האוויר: אוויר קר מאירופה (כחול) מביא גשם, אוויר חם מהמדבר (כתום) מביא שרב. חזאים מסתכלים פה כדי לראות חזיתות.',
  },
  {
    id: 'z500', name: '500 hPa — שקעים עליונים', emoji: '🗻', group: 'pro', vars: ['geopotential_height_500hPa', 'temperature_500hPa'], heat: 'temperature_500hPa',
    scale: 't500', unit: '°C', heatAlpha: 0.55, contour: { var: 'geopotential_height_500hPa', step: 60, bold: 5700, label: (v) => (v / 10).toFixed(0) },
    extrema: { var: 'geopotential_height_500hPa', hi: 'H', lo: 'L' }, lesson: 'levels',
    info: 'בערך 5.5 ק״מ — אמצע האטמוספרה. הקווים הם גובה משטח הלחץ (בדקמטרים). "שקע עליון" (קווים שמתעקלים דרומה עם אוויר קר) מעל ישראל = אוויר לא יציב וגשם. זו המפה הכי חשובה לחזאים.',
  },
  {
    id: 'jet', name: 'זרם הסילון (250 hPa)', emoji: '✈️', group: 'pro', vars: ['wind_speed_250hPa', 'wind_direction_250hPa'], heat: 'wind_speed_250hPa',
    scale: 'jet', unit: 'קמ״ש', particles: ['wind_speed_250hPa', 'wind_direction_250hPa'], particleSpeed: 0.35, lesson: 'jet',
    info: 'נהר של רוח בגובה ~10 ק״מ, לפעמים מעל 250 קמ״ש. הוא "מנווט" את מערכות מזג האוויר. בחורף הוא יורד דרומה, ליד ישראל — ואז מגיעים השקעים.',
  },
  {
    id: 'waves', name: 'גלים', emoji: '🌊', group: 'pro', marine: true, vars: ['wave_height', 'wave_direction', 'wave_period'], heat: 'wave_height',
    scale: 'waves', unit: 'מ׳', arrows: { dir: 'wave_direction' }, lesson: 'sea',
    info: 'גובה הגלים המשמעותי (הממוצע של השליש הגבוה). החצים מראים לאן הגלים נעים. גלים גבוהים בים התיכון מגיעים כשרוח מערבית חזקה נושבת לאורך מרחק ארוך מעל הים.',
  },
  {
    id: 'sst', name: 'טמפרטורת הים', emoji: '🐠', group: 'pro', marine: true, vars: ['sea_surface_temperature'], heat: 'sea_surface_temperature', scale: 'sst', unit: '°C', lesson: 'sea',
    info: 'הטמפרטורה של פני הים. ים חם בסתיו = יותר אנרגיה ולחות לסופות הראשונות של החורף. הים התיכון מגיע לכ-30° באוגוסט.',
  },
  {
    id: 'satellite', name: 'לוויין (אינפרא-אדום)', emoji: '🛰️', group: 'pro', tiles: 'satellite', lesson: 'satellite',
    info: 'תמונה אמיתית מלוויין Meteosat בגובה 36,000 ק״מ, בערוץ אינפרא-אדום — רואה גם בלילה. ככל שהענן לבן יותר, הוא קר יותר = גבוה יותר. עננים לבנים בוהקים = ענני סערה עמוקים.',
  },
];

// Layers share a few "bundles" so switching layers re-uses one download instead of hitting the API again.
export const BUNDLES = {
  sfc: ['temperature_2m', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'precipitation', 'cloud_cover',
    'pressure_msl', 'relative_humidity_2m', 'dew_point_2m', 'visibility', 'uv_index', 'cape', 'freezing_level_height'],
  upper: ['temperature_850hPa', 'wind_speed_850hPa', 'wind_direction_850hPa', 'geopotential_height_500hPa',
    'temperature_500hPa', 'wind_speed_250hPa', 'wind_direction_250hPa'],
  marine: ['wave_height', 'wave_direction', 'wave_period', 'sea_surface_temperature'],
};
export const bundleOf = (l) => (l.marine ? 'marine' : l.vars.some(v => v.includes('hPa')) ? 'upper' : 'sfc');

export const LAYER_BY_ID = Object.fromEntries(LAYERS.map(l => [l.id, l]));

export function isUnlocked(layer, st) {
  return layer.group === 'basic' || st.proMode || !!st.unlocked[layer.id];
}

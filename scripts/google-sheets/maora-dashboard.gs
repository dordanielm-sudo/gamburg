/**
 * דשבורד קמפיינים - מאורה
 *
 * Google Apps Script שבונה לשונית "דשבורד" מעוצבת מתוך:
 *   1. "מאורה טבלה מעודכנת" - שורה לכל ליד (מקור הליד = שם קמפיין,
 *      סטטוס תהליך, פרמיה חודשית, מילת מפתח, נציג מכירות).
 *   2. גיליון העלויות - עלות לכל קמפיין לפי תקופה.
 *
 * הדשבורד מכיל רק נתונים מסוכמים (בלי שמות / ת"ז של לקוחות), כך שאפשר
 * לשתף את קובץ הדשבורד עם הלקוח בלי לחשוף את טבלת הלידים עצמה.
 *
 * ההגדרות היחידות שחובה למלא נמצאות ב-CONFIG למטה. הוראות התקנה:
 * scripts/google-sheets/README.md
 */

const CONFIG = {
  // ה-ID מופיע בכתובת הקובץ: docs.google.com/spreadsheets/d/<ID>/edit
  // ריק = הקובץ שבו הסקריפט מותקן.
  LEADS_SPREADSHEET_ID: '',
  LEADS_SHEET_NAME: '', // שם הלשונית. ריק = הלשונית הראשונה.

  COSTS_SPREADSHEET_ID: '',
  COSTS_SHEET_NAME: '',

  DASHBOARD_SHEET_NAME: 'דשבורד',
  DASHBOARD_TITLE: 'דשבורד קמפיינים',

  // ערכי "סטטוס תהליך" שנספרים כמכירה.
  SALE_STATUSES: ['מכירה'],

  TOP_KEYWORDS: 15,

  // כותרות העמודות (מספר שמות אפשריים לכל עמודה). המיקום לא משנה -
  // הסקריפט מחפש את שורת הכותרות בעשר השורות הראשונות.
  // עמודות טבלת הלידים לפי אות. נקבע לפי אות ולא לפי כותרת: כותרת עם תו
  // נסתר גרמה ל"פרמיה חודשית" להיתפס בעמודה I ("פרמיה חודשית תיק ישן"),
  // ושתי עמודות הפרמיה הציגו את אותם מספרים. אם עמודה זזה - משנים כאן.
  LEADS_COLUMN_LETTERS: {
    date: 'C',       // תאריך יצירה - חודש/יום הליד
    campaign: 'D',   // מקור הליד / אופן הגעה
    status: 'E',     // סטטוס תהליך - "מכירה"
    rep: 'H',        // נציג מכירות
    oldPremium: 'I', // פרמיה חודשית תיק ישן
    premium: 'J',    // פרמיה חודשית
    keyword: 'L',    // מילת מפתח
    saleDate: 'M',   // תאריך עדכון אחרון - יום המכירה
  },
  COSTS_COLUMNS: {
    date: ['תאריך', 'חודש', 'תקופה'],
    campaign: ['שם קמפיין', 'קמפיין', 'מקור הליד'],
    cost: ['עלות קמפיין', 'עלות'],
    keyword: ['מילת מפתח'], // לא חובה - אם קיימת, מחושבת גם עלות לכל מילת מפתח
  },
};

const ALL_CAMPAIGNS = 'כל הקמפיינים';
const FILTER_ROW = 3;
const SITE_DATA_SHEET_NAME = 'נתונים לאתר';
// לשונית בקובץ הדשבורד: A = חשבון גוגל, B = שם קמפיין בגוגל, C = שם הקמפיין
// בפלנדו (מקור הליד). עלויות שרשומות בשם הגוגלי נזקפות לשם שבפלנדו.
const CAMPAIGN_MAP_SHEET_NAME = 'שמות קמפיינים';
const CHART_COLUMN = 12; // L - משמאל לטבלאות (הגיליון מימין לשמאל)
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי',
  'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const COLORS = {
  title: '#1f3a5f',
  header: '#1f3a5f',
  tile: '#f1f5fb',
  tileLabel: '#5b6b80',
  stripe: '#f7f9fc',
  totals: '#dfe8f5',
  muted: '#7a8699',
  series: ['#2f6fb3', '#e08a2e', '#3a9d6a', '#c04a5b', '#7a5cc4', '#3fa7b5',
    '#b0892f', '#6b7a8f', '#d46aa4', '#4f8f3a', '#8a4f2f', '#2f3f8a'],
};

const FMT = {
  text: '@',
  int: '#,##0',
  pct: '0.0%',
  money: '"₪"#,##0',
  money1: '"₪"#,##0.0',
  ratio: '0.00',
};

// ---------------------------------------------------------------- תפריט / טריגרים

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📊 דשבורד')
    .addItem('רענן עכשיו', 'refreshDashboard')
    .addItem('קישור לאתר', 'showSiteLink')
    .addSeparator()
    .addItem('התקנה (פעם אחת)', 'setup')
    .addToUi();
}

/** מתקין רענון אוטומטי בכל שעה + רענון מיידי כשמשנים מסנן בדשבורד. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['onDashboardEdit', 'refreshDashboard'].includes(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
    }
  });
  const ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('onDashboardEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('refreshDashboard').timeBased().everyHours(1).create();
  refreshDashboard();
}

// טריגר מותקן (לא onEdit פשוט) - פשוט לא יכול לפתוח קבצים אחרים.
function onDashboardEdit(e) {
  const range = e && e.range;
  if (!range || range.getSheet().getName() !== CONFIG.DASHBOARD_SHEET_NAME) return;
  if (range.getRow() !== FILTER_ROW) return;
  refreshDashboard();
}

function refreshDashboard() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return;
  try {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(CONFIG.DASHBOARD_SHEET_NAME)
      || ss.insertSheet(CONFIG.DASHBOARD_SHEET_NAME, 0);

    ss.toast('קורא את טבלת הלידים...', 'דשבורד', -1);
    const leads = readLeads();
    ss.toast('קורא את גיליון העלויות...', 'דשבורד', -1);
    const costs = readCosts(readCampaignMap(ss, leads));
    ss.toast('בונה את הדשבורד...', 'דשבורד', -1);
    const data = indexData(leads, costs);
    writeSiteData(ss, data);
    const filters = resolveFilters(readFilters(sheet), data);
    render(sheet, data, filters);
    ss.toast(`הדשבורד עודכן (${leads.rows.reduce((n, l) => n + l.leads, 0)} לידים)`, 'דשבורד', 5);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- נתונים לאתר

/**
 * כותב ללשונית "נתונים לאתר" סיכום (שורה לכל יום+קמפיין+מילת מפתח+נציג)
 * שהאתר (maora-dashboard.html) טוען דרך doGet. האתר מסנן ומחשב הכל
 * בדפדפן, כך שהוא לא מחכה ל-Apps Script ולא נוגע בטבלת הלידים עצמה.
 * בלשונית אין שמות או ת"ז - רק ספירות וסכומים.
 */
function writeSiteData(ss, data) {
  const groups = new Map();
  const keywordNames = new Map();
  const keywordName = kw => {
    if (!kw) return '';
    const key = matchKey(kw);
    if (!keywordNames.has(key)) keywordNames.set(key, kw);
    return keywordNames.get(key);
  };
  const group = (type, day, campaignKey, keyword, rep) => {
    const id = [type, day, campaignKey, keyword, rep].join('|');
    if (!groups.has(id)) {
      groups.set(id, [type, day, data.campaignNames.get(campaignKey), keyword, rep, 0, 0, 0, 0, 0]);
    }
    return groups.get(id);
  };

  data.leads.forEach(l => {
    const g = group('lead', l.day, l.campaignKey, keywordName(l.keyword), l.rep);
    g[5] += l.leads;
    g[6] += l.sales;
    g[7] += l.premium;
    g[8] += l.oldPremium;
  });
  const tz = Session.getScriptTimeZone();
  const today = Number(Utilities.formatDate(new Date(), tz, 'yyyyMMdd'));
  data.costs.forEach(c => {
    costDays(c, today).forEach(([day, amount]) => {
      group('cost', day, c.campaignKey, keywordName(c.keyword), '')[9] += amount;
    });
  });

  const header = ['type', 'date', 'campaign', 'keyword', 'rep', 'leads', 'sales', 'premium', 'oldPremium', 'cost'];
  let updated = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
  if (data.skippedSales) updated += ` · ${data.skippedSales} מכירות בלי תאריך עדכון אחרון לא נכללו`;
  const meta = ['meta', 0, updated, '', '', 0, 0, 0, 0, 0];
  const body = Array.from(groups.values()).map(g => {
    g[9] = Math.round(g[9] * 100) / 100;
    return g;
  });
  const rows = [header, meta].concat(body);

  cacheSiteCsv(rows.map(r => r.map(csvCell).join(',')).join('\n'));

  const sheet = ss.getSheetByName(SITE_DATA_SHEET_NAME) || ss.insertSheet(SITE_DATA_SHEET_NAME);
  sheet.clearContents();
  if (sheet.getMaxRows() < rows.length) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
  if (sheet.getMaxColumns() < header.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), header.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, rows.length, header.length).setNumberFormat('@').setValues(rows);
}

// האתר מבקש את הנתונים בכל כניסה. קריאה מהזיכרון המהיר של הסקריפט (Cache)
// לוקחת עשיריות שנייה, לעומת שניות לקריאת אלפי שורות מהגיליון. ערך בודד
// מוגבל ל-100KB, אז ה-CSV נשמר בחלקים. תוקף 6 שעות; הרענון השעתי מחדש אותו.
const SITE_CACHE_CHUNK = 40000;

function cacheSiteCsv(csv) {
  const chunks = { site_csv_n: '0' };
  const n = Math.ceil(csv.length / SITE_CACHE_CHUNK);
  for (let i = 0; i < n; i++) chunks['site_csv_' + i] = csv.slice(i * SITE_CACHE_CHUNK, (i + 1) * SITE_CACHE_CHUNK);
  chunks.site_csv_n = String(n);
  try {
    CacheService.getScriptCache().putAll(chunks, 21600);
  } catch (err) {
    // גדול מדי לזיכרון המהיר - doGet יקרא מהלשונית.
  }
}

function cachedSiteCsv() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('site_csv_n'));
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push('site_csv_' + i);
  const got = cache.getAll(keys);
  if (keys.some(k => got[k] === undefined || got[k] === null)) return null;
  return keys.map(k => got[k]).join('');
}

/**
 * האתר קורא את "נתונים לאתר" דרך הסקריפט עצמו (פריסה כאפליקציית אינטרנט),
 * ולא דרך "פרסום באינטרנט": Google חוסמת לפעמים קריאה של CSV מפורסם מאתר
 * אחר, ותשובות של Apps Script כן מותרות לקריאה מכל אתר.
 * הכתובת כוללת מפתח אקראי - בלעדיו מוחזר רק "forbidden".
 */
function doGet(e) {
  const key = e && e.parameter && e.parameter.key;
  if (key !== siteKey()) {
    return ContentService.createTextOutput('forbidden').setMimeType(ContentService.MimeType.TEXT);
  }
  let csv = cachedSiteCsv();
  if (csv === null) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SITE_DATA_SHEET_NAME);
    const values = sheet ? sheet.getDataRange().getDisplayValues() : [];
    csv = values.map(row => row.map(csvCell).join(',')).join('\n');
    cacheSiteCsv(csv);
  }
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}

function csvCell(v) {
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function siteKey() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('SITE_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SITE_KEY', key);
  }
  return key;
}

// ScriptApp.getService().getUrl() מחזיר לעיתים קרובות את כתובת הבדיקה (/dev),
// שעובדת רק לעורכי הסקריפט כשהם מחוברים - כל אחד אחר מקבל "לא ניתן לפתוח את
// הקובץ". לכן מבקשים פעם אחת את כתובת ה-/exec מחלון הפריסה ושומרים אותה.
function showSiteLink() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  let base = props.getProperty('WEBAPP_URL');
  if (!base) {
    const res = ui.prompt('כתובת אפליקציית האינטרנט',
      'ב-Apps Script: פריסה ← ניהול פריסות ← מעתיקים את "כתובת URL" שמתחת ל"אפליקציית אינטרנט" '
      + '(מסתיימת ב-/exec) ומדביקים כאן:', ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    base = res.getResponseText().trim().split('?')[0];
    if (!/^https:\/\/script\.google\.com\/.*\/exec$/.test(base)) {
      ui.alert('זו לא הכתובת הנכונה', 'הכתובת צריכה להתחיל ב-https://script.google.com/ '
        + 'ולהסתיים ב-/exec. כתובת שמסתיימת ב-/dev היא כתובת בדיקה ולא תעבוד באתר.', ui.ButtonSet.OK);
      return;
    }
    props.setProperty('WEBAPP_URL', base);
  }
  const url = `${base}?key=${siteKey()}`;
  const html = HtmlService.createHtmlOutput(
    '<div dir="rtl" style="font-family:Arial;font-size:14px">'
    + '<p>1. פתח את הקישור בחלון גלישה בסתר - צריך להופיע טקסט שמתחיל ב-<b>type,month</b>.</p>'
    + '<p>2. הדבק אותו במסך ההגדרה של האתר.</p>'
    + `<textarea style="width:100%;height:80px;direction:ltr" onclick="this.select()" readonly>${url}</textarea>`
    + '<p style="color:#777">אל תשלח את הקישור הזה ללקוח - רק את כתובת האתר. '
    + 'כתובת שגויה? <a href="#" onclick="google.script.run.withSuccessHandler(google.script.host.close).resetSiteLink();return false">איפוס</a></p></div>')
    .setWidth(540).setHeight(260);
  ui.showModalDialog(html, 'קישור לאתר');
}

function resetSiteLink() {
  PropertiesService.getScriptProperties().deleteProperty('WEBAPP_URL');
}

// ---------------------------------------------------------------- קריאת המקורות

function openSheet(spreadsheetId, sheetName) {
  const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActive();
  const sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];
  if (!sheet) throw new Error(`לא נמצאה הלשונית "${sheetName}" בקובץ "${ss.getName()}"`);
  return sheet;
}

function locateColumns(values, spec, required, sourceName) {
  for (let r = 0; r < Math.min(values.length, 10); r++) {
    const headers = values[r].map(normalizeText);
    const cols = {};
    Object.keys(spec).forEach(key => { cols[key] = findHeader(headers, spec[key]); });
    if (required.every(key => cols[key] >= 0)) return { headerRow: r, cols };
  }
  const names = required.map(key => `"${spec[key][0]}"`).join(', ');
  throw new Error(`ב${sourceName} לא נמצאה שורת כותרות עם העמודות ${names}`);
}

function findHeader(headers, aliases) {
  // התאמה מדויקת קודם: "פרמיה חודשית" לא תתפוס את "פרמיה חודשית תיק ישן".
  for (const alias of aliases) {
    const i = headers.indexOf(normalizeText(alias));
    if (i >= 0) return i;
  }
  for (const alias of aliases) {
    const n = normalizeText(alias);
    const i = headers.findIndex(h => h && h.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
}

function readLeads() {
  const sheet = openSheet(CONFIG.LEADS_SPREADSHEET_ID, CONFIG.LEADS_SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const headerRow = 0;
  const cols = {};
  Object.keys(CONFIG.LEADS_COLUMN_LETTERS).forEach(key => {
    cols[key] = columnIndex(CONFIG.LEADS_COLUMN_LETTERS[key]);
  });
  const saleStatuses = CONFIG.SALE_STATUSES.map(normalizeText);

  const rows = [];
  let skipped = 0;
  let skippedSales = 0;
  for (let r = headerRow + 1; r < values.length; r++) {
    const row = values[r];
    const campaign = normalizeText(row[cols.campaign]);
    const created = parsePeriod(row[cols.date]);
    if (!created) {
      if (campaign) skipped++;
      continue;
    }
    const base = {
      campaign: campaign || '(ללא מקור)',
      keyword: cols.keyword >= 0 ? normalizeText(row[cols.keyword]) : '',
      rep: cols.rep >= 0 ? normalizeText(row[cols.rep]) : '',
    };
    // הליד נספר בחודש היצירה, והמכירה (עם הפרמיה) בחודש של "תאריך עדכון
    // אחרון" (עמודה M) בלבד - שם נסגרה העסקה. מכירה בלי תאריך עדכון לא
    // נספרת, ומדווחת בשורת "עודכן" כדי שאפשר יהיה להשלים לה תאריך.
    rows.push(Object.assign({
      month: created.month, day: dayOf(created), leads: 1, sales: 0, premium: 0, oldPremium: 0,
    }, base));
    if (saleStatuses.includes(normalizeText(row[cols.status]))) {
      const closed = cols.saleDate >= 0 ? parsePeriod(row[cols.saleDate]) : null;
      if (!closed) {
        skippedSales++;
        continue;
      }
      rows.push(Object.assign({
        month: closed.month,
        day: dayOf(closed),
        leads: 0,
        sales: 1,
        // פרמיה נספרת רק ללקוח בסטטוס מכירה - בשאר השורות זו הצעה, לא הכנסה.
        premium: toNumber(row[cols.premium]) || 0,
        oldPremium: cols.oldPremium >= 0 ? toNumber(row[cols.oldPremium]) || 0 : 0,
      }, base));
    }
  }
  return { rows, skipped, skippedSales };
}

function readCosts(campaignMap) {
  const sheet = openSheet(CONFIG.COSTS_SPREADSHEET_ID, CONFIG.COSTS_SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const { headerRow, cols } = locateColumns(values, CONFIG.COSTS_COLUMNS,
    ['date', 'campaign', 'cost'], 'גיליון העלויות');

  // גיליון עלויות של דוח ידני חוזר על שורות כותרת ושורות סה"כ בכל בלוק -
  // מדלגים על כל שורה בלי עלות מספרית או עם שם קמפיין שהוא סיכום.
  const entries = [];
  for (let r = headerRow + 1; r < values.length; r++) {
    const row = values[r];
    const cost = toNumber(row[cols.cost]);
    const rawCampaign = normalizeText(row[cols.campaign]);
    const period = parsePeriod(row[cols.date]);
    if (cost === null || !rawCampaign || !period || isTotalLabel(rawCampaign)) continue;
    const campaign = campaignMap ? campaignMap(rawCampaign, firstDayOf(period)) : rawCampaign;
    entries.push({
      month: period.month,
      day: period.day,
      campaign,
      keyword: cols.keyword >= 0 ? normalizeText(row[cols.keyword]) : '',
      cost,
      range: period.range,
    });
  }

  // תקופות "1-6/08/2025" ואחריה "1-28/08/2025" הן צילומי מצב מצטברים של
  // אותו חודש - סכימה שלהן הייתה סופרת את העלות פעמיים. לכל חודש+קמפיין+
  // יום התחלה נשאר רק הצילום המאוחר ביותר. תקופות עם ימי התחלה שונים
  // (1-7, 8-14...) לא חופפות ולכן נסכמות.
  const latest = new Map();
  const plain = [];
  entries.forEach(e => {
    if (!e.range) { plain.push(e); return; }
    const key = [e.month, e.campaign, e.keyword, e.range.start].join('|');
    const prev = latest.get(key);
    if (!prev || e.range.end >= prev.range.end) latest.set(key, e);
  });
  return {
    entries: plain.concat(Array.from(latest.values())),
    hasKeywords: cols.keyword >= 0,
  };
}

/**
 * קורא את "שמות קמפיינים" ומחזיר פונקציה (שם בגוגל, יום) -> שם בפלנדו.
 * שם שלא מופיע בטבלה חוזר כמו שהוא, כך שגיליון עלויות שכבר כתוב בשמות של
 * פלנדו ממשיך לעבוד.
 *
 * הערה בעמודה H מהצורה "עד 13/10/2026 נכנסו לבדיקת תיק ביטוחי" מגדירה שם
 * אחר לתקופה שלפני התאריך: מזוהה התאריך, ושם הקמפיין הוא שם קיים מטבלת
 * הלידים שמופיע בתוך ההערה (הארוך ביותר שמתאים).
 */
function readCampaignMap(ss, leads) {
  const sheet = ss.getSheetByName(CAMPAIGN_MAP_SHEET_NAME);
  if (!sheet) return null;
  const known = Array.from(new Set(leads.rows.map(l => l.campaign)))
    .map(name => ({ name, key: matchKey(name) }))
    .filter(k => k.key.length >= 4)
    .sort((a, b) => b.key.length - a.key.length);
  const rules = new Map();
  sheet.getDataRange().getValues().forEach((row, i) => {
    const google = normalizeText(row[1]);
    const plando = normalizeText(row[2]);
    if (i === 0 || !google) return;
    let until = null, before = null;
    const note = normalizeText(row[7]);
    const dateMatch = note.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
    if (dateMatch) {
      // מפתח ההשוואה מסיר רווחים וסימנים, אז "ביטוחי" עדיין מכיל את "ביטוח".
      const noteKey = matchKey(note);
      const hit = known.find(k => noteKey.includes(k.key));
      if (hit) {
        until = +dateMatch[3] * 10000 + +dateMatch[2] * 100 + +dateMatch[1];
        before = hit.name;
      }
    }
    if (!plando && !before) return;
    rules.set(matchKey(google), { plando: plando || before, until, before });
  });
  return (name, day) => {
    const rule = rules.get(matchKey(name));
    if (!rule) return name;
    if (rule.until && day && day < rule.until) return rule.before;
    return rule.plando;
  };
}

// יום בפורמט yyyymmdd. כשהתאריך הוא רק חודש - היום הראשון בחודש.
function dayOf(period) {
  return period.day || firstDayOf(period);
}

function firstDayOf(period) {
  if (period.day) return period.day;
  const [y, m] = period.month.split('-').map(Number);
  return y * 10000 + m * 100 + (period.range ? period.range.start : 1);
}

/**
 * מפזר עלות על פני ימי התקופה שלה, כדי שאפשר יהיה לסנן לפי תאריכים מדויקים.
 * חודש שלם מתחלק שווה בשווה בין ימיו (בחודש הנוכחי - רק עד היום, כי העלות
 * שרשומה בו היא עד עכשיו); טווח "1-6/08" מתחלק בין ימי הטווח.
 */
function costDays(entry, today) {
  if (entry.day) return [[entry.day, entry.cost]];
  const [y, m] = entry.month.split('-').map(Number);
  const monthDays = new Date(y, m, 0).getDate();
  let start = 1, end = monthDays;
  if (entry.range) {
    start = Math.max(1, entry.range.start);
    end = Math.min(monthDays, entry.range.end);
  } else if (Math.floor(today / 100) === y * 100 + m) {
    end = today % 100;
  }
  if (end < start) end = start;
  const share = entry.cost / (end - start + 1);
  const out = [];
  for (let d = start; d <= end; d++) out.push([y * 10000 + m * 100 + d, share]);
  return out;
}

// ---------------------------------------------------------------- עיבוד

function indexData(leads, costs) {
  const months = new Set();
  const campaignNames = new Map(); // מפתח השוואה -> שם לתצוגה
  const register = name => {
    const key = matchKey(name);
    if (!campaignNames.has(key)) campaignNames.set(key, name);
    return key;
  };

  leads.rows.forEach(l => { months.add(l.month); l.campaignKey = register(l.campaign); });
  costs.entries.forEach(c => { months.add(c.month); c.campaignKey = register(c.campaign); });

  return {
    leads: leads.rows,
    skippedLeads: leads.skipped,
    skippedSales: leads.skippedSales,
    costs: costs.entries,
    hasKeywordCosts: costs.hasKeywords && costs.entries.some(c => c.keyword),
    months: Array.from(months).sort(),
    campaignNames,
  };
}

function newBucket() {
  return { leads: 0, sales: 0, premium: 0, cost: 0, hasCost: false };
}

function bucketFor(map, key) {
  if (!map.has(key)) map.set(key, newBucket());
  return map.get(key);
}

function aggregate(data, filters) {
  const inScope = (month, campaignKey) => month >= filters.from && month <= filters.to
    && (filters.campaign === ALL_CAMPAIGNS || campaignKey === filters.campaign);

  const total = newBucket();
  const byCampaign = new Map();
  const byMonth = new Map();
  const byKeyword = new Map();
  const keywordNames = new Map();
  const byRep = new Map();
  data.months.filter(m => m >= filters.from && m <= filters.to)
    .forEach(m => byMonth.set(m, newBucket()));

  data.leads.forEach(l => {
    if (!inScope(l.month, l.campaignKey)) return;
    const buckets = [total, bucketFor(byCampaign, l.campaignKey), bucketFor(byMonth, l.month)];
    if (l.keyword) {
      const kw = matchKey(l.keyword);
      if (!keywordNames.has(kw)) keywordNames.set(kw, l.keyword);
      buckets.push(bucketFor(byKeyword, kw));
    }
    if (l.rep) buckets.push(bucketFor(byRep, l.rep));
    buckets.forEach(b => {
      b.leads += l.leads;
      b.sales += l.sales;
      b.premium += l.premium;
    });
  });

  data.costs.forEach(c => {
    if (!inScope(c.month, c.campaignKey)) return;
    const buckets = [total, bucketFor(byCampaign, c.campaignKey), bucketFor(byMonth, c.month)];
    if (c.keyword) {
      const kw = matchKey(c.keyword);
      if (!keywordNames.has(kw)) keywordNames.set(kw, c.keyword);
      buckets.push(bucketFor(byKeyword, kw));
    }
    buckets.forEach(b => { b.cost += c.cost; b.hasCost = true; });
  });

  return { total, byCampaign, byMonth, byKeyword, keywordNames, byRep };
}

// אותן הגדרות כמו בדוח הידני הקיים, כדי שהמספרים יהיו מוכרים ללקוח.
function metrics(b) {
  const cost = b.hasCost ? b.cost : null;
  return {
    closeRate: div(b.sales, b.leads),
    avgPremium: div(b.premium, b.sales),
    cost,
    costPerLead: cost === null ? null : div(cost, b.leads),
    costPerSale: cost === null ? null : div(cost, b.sales),
    costToPremium: cost === null ? null : div(cost, b.premium),
  };
}

function div(a, b) {
  return b ? a / b : null;
}

// ---------------------------------------------------------------- מסננים

function readFilters(sheet) {
  if (sheet.getLastRow() < FILTER_ROW) return {};
  return {
    from: sheet.getRange(FILTER_ROW, 2).getDisplayValue(),
    to: sheet.getRange(FILTER_ROW, 4).getDisplayValue(),
    campaign: sheet.getRange(FILTER_ROW, 6).getDisplayValue(),
  };
}

function resolveFilters(prev, data) {
  const months = data.months;
  const byLabel = new Map(months.map(m => [monthLabel(m), m]));
  let from = byLabel.get(prev.from) || months[0] || '';
  let to = byLabel.get(prev.to) || months[months.length - 1] || '';
  if (from > to) [from, to] = [to, from];

  let campaign = ALL_CAMPAIGNS;
  data.campaignNames.forEach((name, key) => { if (name === prev.campaign) campaign = key; });
  return { from, to, campaign };
}

// ---------------------------------------------------------------- ציור הדשבורד

function render(sheet, data, filters) {
  resetSheet(sheet);
  const agg = aggregate(data, filters);
  const width = 10;

  // כותרת
  sheet.getRange(1, 1, 1, width).merge()
    .setValue(CONFIG.DASHBOARD_TITLE)
    .setFontSize(20).setFontWeight('bold').setFontColor(COLORS.title)
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 44);
  const tz = Session.getScriptTimeZone();
  let subtitle = `עודכן ${Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm')}`;
  if (data.skippedLeads) subtitle += ` · ${data.skippedLeads} לידים ללא תאריך יצירה תקין לא נכללו`;
  if (data.skippedSales) subtitle += ` · ${data.skippedSales} מכירות בלי תאריך עדכון אחרון לא נכללו`;
  sheet.getRange(2, 1, 1, width).merge().setValue(subtitle)
    .setFontColor(COLORS.muted).setFontSize(9);

  renderFilters(sheet, data, filters);
  renderKpis(sheet, agg.total, agg.byCampaign);

  let row = 11;

  // ביצועים לפי קמפיין
  const campaignRows = Array.from(agg.byCampaign.entries())
    .sort((a, b) => (b[1].leads - a[1].leads) || (b[1].cost - a[1].cost))
    .map(([key, b]) => campaignRow(data.campaignNames.get(key), b));
  const campaigns = writeTable(sheet, row, 'ביצועים לפי קמפיין',
    ['שם קמפיין', 'לידים', 'מכירות', 'אחוז סגירה', 'סה"כ פרמיה', 'פרמיה ממוצעת',
      'עלות קמפיין', 'עלות לליד', 'עלות לסגירה', 'עלות פרמיה'],
    campaignRows,
    [FMT.text, FMT.int, FMT.int, FMT.pct, FMT.money, FMT.money, FMT.money, FMT.money1, FMT.money, FMT.ratio],
    campaignRow('סה"כ', agg.total));
  if (campaignRows.length) {
    sheet.setConditionalFormatRules(sheet.getConditionalFormatRules().concat([
      SpreadsheetApp.newConditionalFormatRule()
        .setRanges([sheet.getRange(campaigns.firstDataRow, 4, campaignRows.length, 1)])
        .setGradientMinpoint('#ffffff')
        .setGradientMaxpoint('#9fd3b0')
        .build(),
    ]));
  }
  row = campaigns.nextRow;

  // מגמה חודשית
  const monthRows = Array.from(agg.byMonth.entries()).map(([m, b]) => {
    const x = metrics(b);
    return [monthLabel(m), b.leads, b.sales, dash(x.closeRate), b.premium, b.cost,
      dash(x.costPerLead), dash(x.costPerSale)];
  });
  const monthly = writeTable(sheet, row, 'מגמה חודשית',
    ['חודש', 'לידים', 'מכירות', 'אחוז סגירה', 'סה"כ פרמיה', 'עלות קמפיינים', 'עלות לליד', 'עלות לסגירה'],
    monthRows,
    [FMT.text, FMT.int, FMT.int, FMT.pct, FMT.money, FMT.money, FMT.money1, FMT.money]);
  row = monthly.nextRow;

  // מילות מפתח
  const keywordHeaders = ['מילת מפתח', 'לידים', 'מכירות', 'אחוז סגירה', 'סה"כ פרמיה', 'פרמיה ממוצעת'];
  const keywordFormats = [FMT.text, FMT.int, FMT.int, FMT.pct, FMT.money, FMT.money];
  if (data.hasKeywordCosts) {
    keywordHeaders.push('עלות', 'עלות לליד', 'עלות לסגירה');
    keywordFormats.push(FMT.money, FMT.money1, FMT.money);
  }
  const keywordRows = Array.from(agg.byKeyword.entries())
    .sort((a, b) => (b[1].leads - a[1].leads) || (b[1].premium - a[1].premium))
    .slice(0, CONFIG.TOP_KEYWORDS)
    .map(([key, b]) => {
      const x = metrics(b);
      const r = [agg.keywordNames.get(key), b.leads, b.sales, dash(x.closeRate), b.premium, dash(x.avgPremium)];
      if (data.hasKeywordCosts) r.push(dash(x.cost), dash(x.costPerLead), dash(x.costPerSale));
      return r;
    });
  row = writeTable(sheet, row, `מילות מפתח מובילות (${CONFIG.TOP_KEYWORDS} לפי לידים)`,
    keywordHeaders, keywordRows, keywordFormats).nextRow;

  // נציגי מכירות
  const repRows = Array.from(agg.byRep.entries())
    .filter(([, b]) => b.sales || b.premium)
    .sort((a, b) => (b[1].premium - a[1].premium) || (b[1].sales - a[1].sales))
    .map(([name, b]) => {
      const x = metrics(b);
      return [name, b.leads, b.sales, dash(x.closeRate), b.premium, dash(x.avgPremium)];
    });
  writeTable(sheet, row, 'נציגי מכירות',
    ['נציג מכירות', 'לידים', 'מכירות', 'אחוז סגירה', 'סה"כ פרמיה', 'פרמיה ממוצעת'],
    repRows, [FMT.text, FMT.int, FMT.int, FMT.pct, FMT.money, FMT.money]);

  renderCharts(sheet, campaigns, campaignRows.length, monthly, monthRows.length);

  sheet.setColumnWidth(1, 250);
  for (let c = 2; c <= width; c++) sheet.setColumnWidth(c, 112);
  sheet.setColumnWidth(width + 1, 24);
}

function campaignRow(name, b) {
  const x = metrics(b);
  return [name, b.leads, b.sales, dash(x.closeRate), b.premium, dash(x.avgPremium),
    dash(x.cost), dash(x.costPerLead), dash(x.costPerSale), dash(x.costToPremium)];
}

function resetSheet(sheet) {
  sheet.getCharts().forEach(c => sheet.removeChart(c));
  sheet.getBandings().forEach(b => b.remove());
  const all = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns());
  all.breakApart();
  all.clearDataValidations();
  sheet.clear();
  sheet.clearConditionalFormatRules();
  sheet.setRightToLeft(true);
  sheet.setHiddenGridlines(true);
  all.setFontFamily('Heebo').setVerticalAlignment('middle');
  sheet.setRowHeights(1, Math.min(sheet.getMaxRows(), 200), 24);
}

function renderFilters(sheet, data, filters) {
  const labelStyle = r => r.setFontWeight('bold').setFontColor(COLORS.tileLabel).setHorizontalAlignment('left');
  const pickerStyle = r => r.setBackground('#fff7e0').setBorder(true, true, true, true, false, false,
    '#e0b84c', SpreadsheetApp.BorderStyle.SOLID).setHorizontalAlignment('center').setNumberFormat(FMT.text);

  const monthLabels = data.months.map(monthLabel);
  const monthRule = SpreadsheetApp.newDataValidation().requireValueInList(monthLabels.length ? monthLabels : ['-'], true)
    .setAllowInvalid(false).build();

  labelStyle(sheet.getRange(FILTER_ROW, 1).setValue('מחודש:'));
  pickerStyle(sheet.getRange(FILTER_ROW, 2)).setValue(filters.from ? monthLabel(filters.from) : '')
    .setDataValidation(monthRule);
  labelStyle(sheet.getRange(FILTER_ROW, 3).setValue('עד חודש:'));
  pickerStyle(sheet.getRange(FILTER_ROW, 4)).setValue(filters.to ? monthLabel(filters.to) : '')
    .setDataValidation(monthRule);

  const names = Array.from(data.campaignNames.values()).sort((a, b) => a.localeCompare(b, 'he'));
  const campaignRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([ALL_CAMPAIGNS].concat(names), true).setAllowInvalid(false).build();
  labelStyle(sheet.getRange(FILTER_ROW, 5).setValue('קמפיין:'));
  const picker = sheet.getRange(FILTER_ROW, 6, 1, 3).merge();
  pickerStyle(picker).setValue(filters.campaign === ALL_CAMPAIGNS
    ? ALL_CAMPAIGNS : data.campaignNames.get(filters.campaign))
    .setDataValidation(campaignRule);

  sheet.getRange(FILTER_ROW, 9, 1, 2).merge().setValue('שינוי מסנן מרענן את הדשבורד')
    .setFontColor(COLORS.muted).setFontSize(9).setFontStyle('italic');
}

function renderKpis(sheet, total, byCampaign) {
  const x = metrics(total);
  const active = Array.from(byCampaign.values()).filter(b => b.leads > 0).length;
  const tiles = [
    ['לידים', total.leads, FMT.int],
    ['מכירות', total.sales, FMT.int],
    ['אחוז סגירה', dash(x.closeRate), FMT.pct],
    ['סה"כ פרמיה חודשית', total.premium, FMT.money],
    ['פרמיה ממוצעת למכירה', dash(x.avgPremium), FMT.money],
    ['עלות קמפיינים', dash(x.cost), FMT.money],
    ['עלות לליד', dash(x.costPerLead), FMT.money1],
    ['עלות לסגירה', dash(x.costPerSale), FMT.money],
    ['עלות פרמיה (עלות ÷ פרמיה)', dash(x.costToPremium), FMT.ratio],
    ['קמפיינים פעילים', active, FMT.int],
  ];
  tiles.forEach(([label, value, format], i) => {
    const labelRow = i < 5 ? 5 : 8;
    const col = (i % 5) * 2 + 1;
    const labelCell = sheet.getRange(labelRow, col, 1, 2).merge();
    const valueCell = sheet.getRange(labelRow + 1, col, 1, 2).merge();
    labelCell.setValue(label).setFontSize(9).setFontColor(COLORS.tileLabel);
    valueCell.setValue(value).setNumberFormat(format)
      .setFontSize(20).setFontWeight('bold').setFontColor(COLORS.title);
    sheet.getRange(labelRow, col, 2, 2).setBackground(COLORS.tile).setHorizontalAlignment('center')
      .setBorder(true, true, true, true, false, false, '#ffffff', SpreadsheetApp.BorderStyle.SOLID_THICK);
  });
  [5, 8].forEach(r => { sheet.setRowHeight(r, 22); sheet.setRowHeight(r + 1, 42); });
}

function writeTable(sheet, row, title, headers, rows, formats, totalsRow) {
  const width = headers.length;
  sheet.getRange(row, 1, 1, width).merge().setValue(title)
    .setFontSize(13).setFontWeight('bold').setFontColor(COLORS.title);
  sheet.setRowHeight(row, 30);
  row++;

  const headerRow = row;
  sheet.getRange(row, 1, 1, width).setValues([headers])
    .setBackground(COLORS.header).setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setWrap(true);
  sheet.setRowHeight(row, 34);
  row++;

  const body = rows.length ? rows : [['אין נתונים בתקופה שנבחרה'].concat(new Array(width - 1).fill(''))];
  const all = totalsRow ? body.concat([totalsRow]) : body;
  const range = sheet.getRange(row, 1, all.length, width);
  range.setValues(all)
    .setNumberFormats(all.map(() => formats))
    .setHorizontalAlignment('center')
    .setBackgrounds(all.map((_, i) => new Array(width).fill(i % 2 ? COLORS.stripe : '#ffffff')))
    .setBorder(null, null, true, null, null, true, '#e3e8ef', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(row, 1, all.length, 1).setHorizontalAlignment('right');
  if (totalsRow) {
    sheet.getRange(row + body.length, 1, 1, width)
      .setBackground(COLORS.totals).setFontWeight('bold')
      .setBorder(true, null, null, null, null, null, COLORS.header, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }

  return { headerRow, firstDataRow: row, nextRow: row + all.length + 2 };
}

function renderCharts(sheet, campaigns, campaignCount, monthly, monthCount) {
  const place = (builder, slot) => sheet.insertChart(builder
    .setPosition(1 + slot * 18, CHART_COLUMN, 0, 0)
    .setOption('width', 640).setOption('height', 360)
    .setOption('legend', { position: 'bottom' })
    .setOption('titleTextStyle', { fontSize: 14, bold: true, color: COLORS.title })
    .setOption('fontName', 'Heebo')
    .build());

  let slot = 0;
  if (monthCount) {
    place(sheet.newChart().setChartType(Charts.ChartType.COMBO)
      .addRange(sheet.getRange(monthly.headerRow, 1, monthCount + 1, 3))
      .setNumHeaders(1)
      .setOption('title', 'לידים ומכירות לפי חודש')
      .setOption('colors', [COLORS.series[0], COLORS.series[1]])
      .setOption('series', {
        0: { type: 'bars', targetAxisIndex: 0 },
        1: { type: 'line', targetAxisIndex: 1, pointSize: 6, lineWidth: 3 },
      })
      .setOption('vAxes', { 0: { title: 'לידים' }, 1: { title: 'מכירות' } }), slot++);

    place(sheet.newChart().setChartType(Charts.ChartType.COLUMN)
      .addRange(sheet.getRange(monthly.headerRow, 1, monthCount + 1, 1))
      .addRange(sheet.getRange(monthly.headerRow, 5, monthCount + 1, 2))
      .setNumHeaders(1)
      .setOption('title', 'פרמיה מול עלות קמפיינים לפי חודש')
      .setOption('colors', [COLORS.series[2], COLORS.series[3]])
      .setOption('vAxis', { format: '₪#,##0' }), slot++);
  }
  if (campaignCount) {
    place(sheet.newChart().setChartType(Charts.ChartType.PIE)
      .addRange(sheet.getRange(campaigns.headerRow, 1, campaignCount + 1, 2))
      .setNumHeaders(1)
      .setOption('title', 'חלוקת לידים לפי קמפיין')
      .setOption('pieHole', 0.45)
      .setOption('colors', COLORS.series)
      .setOption('legend', { position: 'right' }), slot++);

    place(sheet.newChart().setChartType(Charts.ChartType.BAR)
      .addRange(sheet.getRange(campaigns.headerRow, 1, campaignCount + 1, 1))
      .addRange(sheet.getRange(campaigns.headerRow, 5, campaignCount + 1, 1))
      .setNumHeaders(1)
      .setOption('title', 'סה"כ פרמיה לפי קמפיין')
      .setOption('colors', [COLORS.series[2]])
      .setOption('hAxis', { format: '₪#,##0' })
      .setOption('legend', { position: 'none' }), slot++);
  }
}

// ---------------------------------------------------------------- עזרים

// 'A' -> 0, 'J' -> 9, 'AA' -> 26
function columnIndex(letter) {
  return String(letter).toUpperCase().split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

function normalizeText(v) {
  if (v === null || v === undefined) return '';
  // תווי כיווניות נסתרים (RLM/LRM וכו') שנכנסים בהעתקה מאתרים ומ-CRM.
  return String(v).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

// מפתח השוואה בין שני הגיליונות: אותו קמפיין נכתב לפעמים עם רווחים או
// סימני פיסוק מעט שונים ("( כספים אבודים )" מול "(כספים אבודים)").
function matchKey(name) {
  return normalizeText(name).replace(/[\s"'״׳()\-–_.]/g, '').toLowerCase();
}

function isTotalLabel(text) {
  return /^סה["״']?כ/.test(text);
}

function toNumber(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[₪,\s]/g, '');
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  return parseFloat(s);
}

/**
 * מחזיר { month: 'YYYY-MM', day: yyyymmdd | undefined, range: {start, end} | null }.
 * מקבל: תאריך אמיתי, "01/01/2025 00:02", "07/2025", "1-6/08/2025".
 */
function parsePeriod(v) {
  const ym = (y, m) => (m >= 1 && m <= 12 && y > 1900) ? `${y}-${String(m).padStart(2, '0')}` : null;
  if (v instanceof Date && !isNaN(v)) {
    // לפי אזור הזמן של הקובץ, לא של הסקריפט: ליד מ-01/07 00:02 שעון ישראל
    // הוא עדיין 30/06 ב-UTC.
    const ymd = Utilities.formatDate(v, spreadsheetTimeZone(), 'yyyyMMdd');
    return { month: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`, day: Number(ymd), range: null };
  }
  const s = normalizeText(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\s?-\s?(\d{1,2})\s?[\/.]\s?(\d{1,2})\s?[\/.]\s?(\d{4})/);
  if (m) {
    const month = ym(+m[4], +m[3]);
    return month ? { month, range: { start: +m[1], end: +m[2] } } : null;
  }
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (m) {
    const month = ym(+m[3], +m[2]);
    return month && +m[1] >= 1 && +m[1] <= 31
      ? { month, day: +m[3] * 10000 + +m[2] * 100 + +m[1], range: null } : null;
  }
  m = s.match(/^(\d{1,2})[\/.](\d{4})$/);
  if (m) {
    const month = ym(+m[2], +m[1]);
    return month ? { month, range: null } : null;
  }
  return null;
}

// נקרא פעם אחת ונשמר: קריאה לשירות של Google לכל שורת ליד הופכת אלפי
// שורות לדקות של המתנה.
let cachedTimeZone = null;
function spreadsheetTimeZone() {
  if (!cachedTimeZone) cachedTimeZone = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return cachedTimeZone;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${HEBREW_MONTHS[+m - 1]} ${y}`;
}

function dash(v) {
  return v === null || v === undefined || !isFinite(v) ? '—' : v;
}

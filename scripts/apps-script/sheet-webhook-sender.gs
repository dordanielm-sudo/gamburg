// ============================================================================
// הגדרות גלובליות
// ============================================================================
const WEBHOOK_URL = "https://hook.eu2.make.com/q79ywe2s15tcx089ggbphuklmlap9hpo";

// עמודות: U=21 (סטטוס), V=22 (זמן), W=23 (תוצאה)
const STATUS_COL = 21;
const SENT_AT_COL = 22;
const RESULT_COL = 23;

// שדות חובה (אינדקס 1-based): B(2), D(4) בלבד
const REQUIRED_COLS = [2, 4];

// חלון דה-דופ (שניות) - למניעת כפילויות מידיות
const DEDUPE_WINDOW_SEC = 15;

// השהיה לפני שליחה (מילישניות) - 60 שניות
const DELAY_BEFORE_SEND = 60000;

// סטטוסים שמשמעותם "בטיפול / טופל" - לא נוגעים בהם בעריכה
const SKIP_STATUSES = ["כן", "ממתין...", "שולח..."];

// ---------------------------------------------------------------------------
// הגדרות לוג
// ---------------------------------------------------------------------------
const LOG_SHEET_NAME = "לוג שליחות";
const LOG_HEADERS = [
  "זמן", "מזהה ריצה", "מקור", "גיליון", "שורה", "B", "D",
  "אירוע", "תוצאה", "קוד HTTP", "משך (ms)", "הודעה", "Payload שנשלח", "תשובת השרת"
];
const LOG_PAYLOAD = true;           // לרשום את ה-JSON המלא שנשלח
const LOG_CELL_MAX = 45000;         // מגבלת תא בגוגל שיטס היא 50,000 תווים
const LOG_MAX_ROWS = 20000;         // מעבר לזה - נמחקות השורות הוותיקות
const LOG_TRIM_ROWS = 2000;         // כמה שורות למחוק בכל ניקוי

// ============================================================================
// פונקציה ראשית - מופעלת ע"י טריגר (Installable Trigger)
// תומכת בעריכה בודדת וגם בהעתק-הדבק של מספר שורות
// ============================================================================
function handleEditWithDelay(e) {
  if (!e) return;

  const sheet = e.source.getActiveSheet();
  if (sheet.getName() === LOG_SHEET_NAME) return; // עריכה בגיליון הלוג עצמו

  const startRow = e.range.getRow();
  const numRows = e.range.getNumRows();
  const col = e.range.getColumn();
  const lastCol = sheet.getLastColumn();

  // דילוג אם העריכה היא בכותרת בלבד (שורה 1)
  if (startRow <= 1 && numRows === 1) return;

  // בדיקה אם העריכה נוגעת בעמודות רלוונטיות (B או D)
  const endCol = col + e.range.getNumColumns() - 1;
  const isRelevantCol = (col <= 2 && endCol >= 2) || (col <= 4 && endCol >= 4);
  if (!isRelevantCol) return;

  const log = newRunLogger("עריכה", sheet);
  log.event(null, null, "התחלת ריצה", "מידע", {
    msg: `טווח ${e.range.getA1Notation()} (${numRows} שורות)`
  });

  const rowsToProcess = [];

  // *** שלב 1: זיהוי וסימון ראשוני ("ממתין...") ***
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(30000);

    const safeStartRow = startRow > 1 ? startRow : 2;
    let actualRowsToRead = numRows;
    if (startRow === 1) actualRowsToRead = numRows - 1;
    if (actualRowsToRead <= 0) return;

    const rangeData = sheet.getRange(safeStartRow, 1, actualRowsToRead, lastCol).getValues();
    const cache = CacheService.getDocumentCache();
    const props = PropertiesService.getDocumentProperties();

    for (let i = 0; i < rangeData.length; i++) {
      const rowVals = rangeData[i];
      const currentRowIndex = safeStartRow + i;
      const status = rowVals[STATUS_COL - 1];

      if (SKIP_STATUSES.indexOf(status) !== -1) {
        log.event(currentRowIndex, rowVals, "דולג", "דילוג", { msg: `סטטוס קיים: "${status}"` });
        continue;
      }
      if (!hasRequiredFields(rowVals)) {
        log.event(currentRowIndex, rowVals, "דולג", "דילוג", { msg: "שדות חובה ריקים: " + missingFields(rowVals) });
        continue;
      }

      // דה-דופ (Cache + Properties)
      const signature = makeSignature(rowVals, REQUIRED_COLS);
      const cacheKey = `dedupe:${sheet.getSheetId()}:${currentRowIndex}:${signature}`;
      if (cache.get(cacheKey)) {
        log.event(currentRowIndex, rowVals, "דולג", "דילוג", { msg: "כפילות - אותה שורה כבר בתור (Cache)" });
        continue;
      }

      const lastSent = props.getProperty(`lastSent:${sheet.getSheetId()}:${currentRowIndex}`);
      if (lastSent) {
        const [tsStr, sig] = lastSent.split(":");
        const ageMs = Date.now() - Number(tsStr);
        if (ageMs < (DEDUPE_WINDOW_SEC * 1000) && sig === signature) {
          log.event(currentRowIndex, rowVals, "דולג", "דילוג", {
            msg: `כפילות - נשלחה לפני ${Math.round(ageMs / 1000)} שניות עם אותם ערכים`
          });
          continue;
        }
      }

      rowsToProcess.push({ rowIndex: currentRowIndex });
      cache.put(cacheKey, "1", DEDUPE_WINDOW_SEC + 60);
      log.event(currentRowIndex, rowVals, "נכנס לתור", "ממתין", {
        msg: `ישלח בעוד ${Math.round(DELAY_BEFORE_SEND / 1000)} שניות`
      });
    }

    if (rowsToProcess.length === 0) {
      log.event(null, null, "סיום ריצה", "מידע", { msg: "אין שורות לשליחה" });
      return;
    }

    rowsToProcess.forEach(item => {
      sheet.getRange(item.rowIndex, STATUS_COL, 1, 3).setValues([["ממתין...", new Date(), ""]]);
    });
    SpreadsheetApp.flush();

  } catch (err) {
    log.event(null, null, "שגיאת שלב זיהוי", "שגיאה", { msg: errText(err) });
    throw err;
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }

  // *** שלב 2: השהיה ***
  Utilities.sleep(DELAY_BEFORE_SEND);

  // *** שלב 3: שליחה בפועל ***
  // כל שורה עטופה ב-try: שגיאה בשורה אחת לא משאירה את השאר תקועות
  let sent = 0, failed = 0, skipped = 0;
  for (let k = 0; k < rowsToProcess.length; k++) {
    const rIdx = rowsToProcess[k].rowIndex;
    let currentVals = null;
    try {
      currentVals = sheet.getRange(rIdx, 1, 1, lastCol).getValues()[0];

      // בדיקה לפי שדות החובה (לא לפי עמודה A), ועדכון סטטוס במקום דילוג שקט
      if (!currentVals || !hasRequiredFields(currentVals)) {
        writeStatus(sheet, rIdx, "דולג", "שדות חובה ריקים בזמן השליחה");
        log.event(rIdx, currentVals, "דולג", "דילוג", {
          msg: "שדות חובה התרוקנו במהלך ההמתנה: " + missingFields(currentVals || [])
        });
        skipped++;
        continue;
      }

      sheet.getRange(rIdx, STATUS_COL).setValue("שולח...");
      SpreadsheetApp.flush();

      const result = sendRow(currentVals, lastCol, false);
      writeStatus(sheet, rIdx, result.ok ? "כן" : "שגיאה", result.msg);
      log.send(rIdx, currentVals, result);

      if (result.ok) { saveLastSent(sheet, rIdx, currentVals); sent++; } else { failed++; }

    } catch (err) {
      failed++;
      try { writeStatus(sheet, rIdx, "שגיאה", truncate(errText(err), 200)); } catch (e2) {}
      log.event(rIdx, currentVals, "חריגה", "שגיאה", { msg: errText(err) });
    }
  }

  log.event(null, null, "סיום ריצה", failed ? "שגיאה" : "הצלחה", {
    msg: `נשלחו ${sent}, נכשלו ${failed}, דולגו ${skipped}`
  });
}

// ============================================================================
// תפריט ידני ושליחה רטרואקטיבית
// ============================================================================

/** יצירת תפריט בגיליון כשפותחים אותו */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ אוטומציה')
    .addItem('שלח שורות שלא נשלחו (רטרו)', 'processUnsentRows')
    .addSeparator()
    .addItem('פתח לוג שליחות', 'openLogSheet')
    .addToUi();
}

/** מעבר לגיליון הלוג (יוצר אותו אם לא קיים) */
function openLogSheet() {
  getLogSheet().activate();
}

/** עובר על כל הגיליון ושולח כל שורה שאין לה סטטוס "כן" */
function processUnsentRows() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (sheet.getName() === LOG_SHEET_NAME) {
    ui.alert('עבור לגיליון הנתונים לפני הרצת שליחה רטרואקטיבית.');
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 1) {
    ui.alert('אין נתונים בגיליון.');
    return;
  }

  const response = ui.alert(
    'שליחה רטרואקטיבית',
    'האם לעבור על כל הגיליון ולשלוח שורות שאין להן סטטוס "כן"?\nפעולה זו תשלח את הנתונים מיידית ללא המתנה של 60 שניות.',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  const log = newRunLogger("רטרו", sheet);
  log.event(null, null, "התחלת ריצה", "מידע", { msg: `${lastRow - 1} שורות בגיליון` });

  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let sentCount = 0, errCount = 0, alreadySent = 0, missing = 0;

  for (let i = 0; i < data.length; i++) {
    const rowIdx = i + 2;
    const rowValues = data[i];

    // שורות שכבר נשלחו לא נרשמות אחת-אחת (רעש) - רק בסיכום
    if (rowValues[STATUS_COL - 1] === "כן") { alreadySent++; continue; }
    if (!hasRequiredFields(rowValues)) {
      missing++;
      // שורה ריקה לגמרי לא מעניינת; שורה חלקית כן
      if (rowValues.some(v => v !== "" && v !== null)) {
        log.event(rowIdx, rowValues, "דולג", "דילוג", { msg: "שדות חובה ריקים: " + missingFields(rowValues) });
      }
      continue;
    }

    try {
      const result = sendRow(rowValues, lastCol, true);
      writeStatus(sheet, rowIdx, result.ok ? "כן" : "שגיאה", result.msg);
      log.send(rowIdx, rowValues, result);

      if (result.ok) {
        saveLastSent(sheet, rowIdx, rowValues);
        sentCount++;
      } else {
        errCount++;
      }
      Utilities.sleep(200);

    } catch (err) {
      errCount++;
      try { writeStatus(sheet, rowIdx, "שגיאה", truncate(errText(err), 200)); } catch (e2) {}
      log.event(rowIdx, rowValues, "חריגה", "שגיאה", { msg: errText(err) });
    }
  }

  SpreadsheetApp.flush();
  log.event(null, null, "סיום ריצה", errCount ? "שגיאה" : "הצלחה", {
    msg: `נשלחו ${sentCount}, נכשלו ${errCount}, כבר נשלחו קודם ${alreadySent}, חסרי שדות חובה ${missing}`
  });
  ui.alert(`סיימנו! נשלחו ${sentCount} שורות` + (errCount ? `, ${errCount} נכשלו.` : '.') +
           `\nפירוט מלא בגיליון "${LOG_SHEET_NAME}".`);
}

// ============================================================================
// לוג מפורט
// ============================================================================

/**
 * יוצר לוגר לריצה אחת. כל השורות של אותה ריצה חולקות "מזהה ריצה",
 * כך שאפשר לסנן בגיליון הלוג ולראות בדיוק מה קרה בהפעלה מסוימת.
 */
function newRunLogger(source, sheet) {
  const runId = Utilities.getUuid().slice(0, 8);
  const sheetName = sheet.getName();

  function write(rowIdx, rowVals, eventName, outcome, extra) {
    extra = extra || {};
    const line = [
      new Date(),
      runId,
      source,
      sheetName,
      rowIdx || "",
      rowVals ? cellSafe(rowVals[1]) : "",
      rowVals ? cellSafe(rowVals[3]) : "",
      eventName,
      outcome,
      extra.code !== undefined ? extra.code : "",
      extra.durationMs !== undefined ? extra.durationMs : "",
      cellSafe(extra.msg || ""),
      cellSafe(extra.payload || ""),
      cellSafe(extra.response || "")
    ];

    // גם ללוג ההרצות של Apps Script (Executions) - שימושי אם כתיבה לגיליון נכשלה
    console.log(JSON.stringify({ runId, source, sheet: sheetName, row: rowIdx, event: eventName,
                                 outcome, code: extra.code, ms: extra.durationMs, msg: extra.msg }));

    try {
      getLogSheet().appendRow(line);
    } catch (err) {
      console.error("כתיבה ללוג נכשלה: " + errText(err));
    }
  }

  return {
    runId: runId,
    event: write,
    /** רישום תוצאת שליחה מלאה של שורה */
    send: function (rowIdx, rowVals, result) {
      write(rowIdx, rowVals, "שליחה", result.ok ? "הצלחה" : "שגיאה", {
        code: result.code,
        durationMs: result.durationMs,
        msg: result.msg,
        payload: LOG_PAYLOAD ? result.payloadJson : "",
        response: result.responseText
      });
    }
  };
}

/** מחזיר את גיליון הלוג, יוצר אותו עם כותרות אם צריך, ומנקה שורות ישנות */
function getLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(LOG_SHEET_NAME);

  if (!logSheet) {
    logSheet = ss.insertSheet(LOG_SHEET_NAME);
    logSheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight("bold");
    logSheet.setFrozenRows(1);
    logSheet.setRightToLeft(true);
    logSheet.getRange("A:A").setNumberFormat("dd/MM/yyyy HH:mm:ss");
    logSheet.setColumnWidth(12, 300);
    logSheet.setColumnWidth(13, 300);
    logSheet.setColumnWidth(14, 300);
    logSheet.getRange("L:N").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    return logSheet;
  }

  const rows = logSheet.getLastRow();
  if (rows > LOG_MAX_ROWS + 1) {
    logSheet.deleteRows(2, Math.min(LOG_TRIM_ROWS, rows - 2));
  }
  return logSheet;
}

/** ערך בטוח לתא: חיתוך אורך + מניעת פירוש כנוסחה */
function cellSafe(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  let s = truncate(String(v), LOG_CELL_MAX);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

/** אילו שדות חובה חסרים (לפי אות עמודה) */
function missingFields(rowVals) {
  const miss = REQUIRED_COLS.filter(c => isEmpty(rowVals[c - 1])).map(colToLetter);
  return miss.length ? miss.join(", ") : "-";
}

function errText(err) {
  if (!err) return "";
  return err.stack ? `${err.message}\n${err.stack}` : String(err);
}

// ============================================================================
// פונקציות עזר (Helpers)
// ============================================================================

function isEmpty(v) {
  return v === "" || v === null || v === undefined;
}

/** בודק שכל שדות החובה מלאים */
function hasRequiredFields(rowVals) {
  return REQUIRED_COLS.every(c => !isEmpty(rowVals[c - 1]));
}

/** שולח שורה ל-Webhook ומחזיר {ok, msg, code, durationMs, payloadJson, responseText} */
function sendRow(rowVals, lastCol, isRetro) {
  const payload = {};
  for (let c = 1; c <= lastCol; c++) {
    payload[colToLetter(c)] = rowVals[c - 1];
  }
  if (isRetro) payload["is_retro"] = true;
  const payloadJson = JSON.stringify(payload);

  let code = 0, text = "";
  const started = Date.now();
  try {
    const resp = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: payloadJson,
      muteHttpExceptions: true,
    });
    code = resp.getResponseCode();
    text = resp.getContentText();
  } catch (err) {
    code = -1;
    text = errText(err);
  }
  const durationMs = Date.now() - started;

  const ok = (code >= 200 && code < 300);
  const msg = ok ? `OK ${code}${isRetro ? " (Retro)" : ""}` : `ERR ${code} ${truncate(text, 200)}`;
  return { ok, msg, code, durationMs, payloadJson, responseText: text };
}

/** כתיבת סטטוס + זמן + תוצאה (U:W) */
function writeStatus(sheet, rowIdx, status, msg) {
  sheet.getRange(rowIdx, STATUS_COL, 1, 3).setValues([[status, new Date(), msg]]);
}

/** שמירת חתימת השליחה האחרונה לצורך דה-דופ */
function saveLastSent(sheet, rowIdx, rowVals) {
  const sig = makeSignature(rowVals, REQUIRED_COLS);
  PropertiesService.getDocumentProperties()
    .setProperty(`lastSent:${sheet.getSheetId()}:${rowIdx}`, `${Date.now()}:${sig}`);
}

/** המרת אינדקס עמודה לאותיות A1 */
function colToLetter(col) {
  let letter = "";
  while (col > 0) {
    const temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp - 1) / 26;
  }
  return letter;
}

/** חתימה ייחודית (MD5) על שדות החובה */
function makeSignature(values, oneBasedCols) {
  const raw = oneBasedCols.map(c => String(values[c - 1] || "")).join("|");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
  return digest.map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}

/** קיצור מחרוזת ארוכה ללוג */
function truncate(s, max) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

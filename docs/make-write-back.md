# כתיבה חזרה לעדכנית — מפרט לסנריו ב-Make

מה ה-CRM שולח כשמשתמש עורך שדה, ומה הוא מצפה לקבל בחזרה. הסנריו בצד Make
נבנה לפי המסמך הזה.

## הזרימה

1. המשתמש עורך שדה במסך כלשהו ויוצא מהשדה.
2. ה-CRM שומר מקומית, ורק אם השמירה הצליחה —
3. שולח `POST` לוובהוק היוצא ומחכה לתשובה **סינכרונית** (timeout 10 שניות).
4. אם התשובה `failure` — ה-CRM **מבטל את השינוי המקומי** ומציג שגיאה למשתמש.
   כלומר: תשובת Make היא מה שקובע אם השינוי נשאר.

כתובת הוובהוק נלקחת מ-`webhook_configs` תחת המפתח `outgoing_case_update`
(או ממשתנה הסביבה `MAKE_OUTGOING_WEBHOOK_URL`). אם אין כתובת מוגדרת,
ה-CRM מחזיר `warning` ושומר מקומית בלבד — שימושי לפני שהסנריו קיים.

## גוף הבקשה

```json
{
  "case_id":      "uuid של התיק ב-CRM",
  "case_number":  "מספר התיק — המפתח הטבעי מול עדכנית",
  "field_name":   "שם השדה",
  "page_name":    "שם החוצץ, או null",
  "entity_type":  "case | case_field | task | deadline | document",
  "entity_id":    "uuid של השורה ב-CRM, או null",
  "source_ref":   "המזהה שעדכנית מכירה, או null",
  "value_type":   "text | date | number — לשדה חוצץ בלבד, אחרת null",
  "old_value":    "הערך לפני",
  "new_value":    "הערך אחרי",
  "changed_by":   "uuid של המשתמש",
  "changed_at":   "ISO timestamp"
}
```

### על `entity_id` מול `source_ref` — הנקודה החשובה ביותר

`entity_id` הוא ה-UUID של ה-CRM. **עדכנית מעולם לא ראתה אותו ואי אפשר
לחפש לפיו.** הוא נשלח לצורכי מעקב ותחקור בלבד.

`source_ref` הוא המזהה שעדכנית מכירה. **זה השדה שלפיו מאתרים את הרשומה.**

## הניתוב לפי `entity_type`

| `entity_type` | מה זה | איך מאתרים בעדכנית |
|---|---|---|
| `case` | שדה על התיק עצמו (טלפון, כתובת, סטטוס, צוות...) | `case_number` |
| `case_field` | שדה בחוצץ | `case_number` + `page_name` + `field_name` |
| `task` | משימה | `source_ref` = מזהה המשימה בעדכנית |
| `deadline` | מועד | `case_number` + `source_ref`, כאשר `source_ref` הוא **שם השדה** בעדכנית שממנו נגזר המועד (למשל `תאריך דיון.`) |
| `document` | — | **לא נשלח.** ראה למטה. |

שים לב ש-`deadline` שונה מהאחרים: מועד אינו רשומה נפרדת בעדכנית אלא **שדה
תאריך על התיק**. לכן `source_ref` שם הוא שם שדה, לא מזהה שורה, והעדכון הוא
עדכון שדה על התיק — בדיוק כמו `case`, רק ששם השדה מגיע ב-`source_ref`
במקום ב-`field_name`.

### `page_name` — למה הוא הכרחי

אותו שם שדה מופיע ביותר מחוצץ אחד. `מועד קבלת צו`, למשל, קיים גם בחדל"פ
וגם בצו שיקום כלכלי. בלי `page_name` הסנריו יכתוב לשדה הלא נכון.

## התשובה הנדרשת

Make חייב להחזיר **סינכרונית**, בגוף JSON:

```json
{ "status": "success", "message": "אופציונלי", "record_id": "אופציונלי" }
```

`status` הוא אחד מ:

| ערך | משמעות | מה ה-CRM עושה |
|---|---|---|
| `success` | העדכון נכתב בעדכנית | השינוי נשאר |
| `warning` | נשמר ב-CRM אך לא בעדכנית | השינוי נשאר, עם הודעה |
| `failure` | העדכון נכשל | **השינוי מבוטל** והמשתמש רואה שגיאה |

`message` מוצג למשתמש כשיש `failure` — כדאי שיהיה קריא בעברית.

כל דבר אחר — timeout, סטטוס לא-2xx, גוף לא תקין, כשל רשת — נחשב `failure`,
כדי שהמשתמש תמיד יקבל תשובה חד-משמעית ולא ישאר עם שינוי שהוא חושב שנשמר.

## מסמכים — למה הם לא נשלחים

`documents` היא הטבלה היחידה שנפתחה לעריכה ואין ממנה דרך חזרה. מסמכים
נכנסים דרך הוובהוק `incoming-document`, והסכימה לא שומרת שום מזהה מהמקור.
התאמה לפי הכותרת לא עוזרת — הכותרת היא אחד השדות שנערכים.

לכן עריכת מסמך נשמרת ב-CRM בלבד, והמסך אומר זאת במפורש ("שינויים נשמרים")
במקום לרמוז על סנכרון. כדי לפתוח גם אותם צריך קודם להוסיף עמודת מזהה מקור
ל-`documents` ולמלא אותה בוובהוק הקליטה.

## מה שנשמר מקומית בלבד גם כשיש סנכרון

`sync` מושמט, וממילא לא נשלח וובהוק, בשלושה מקרים:

- **אישורים** (`approval_requests`) — מודול שקיים רק ב-CRM.
- **משימה בלי `source_task_id`** — משימה שנוצרה ב-CRM ומעולם לא הייתה
  בעדכנית.
- **מועד בלי `source_field_name`** — אין שדה בעדכנית לכתוב אליו.

בכל אחד מהם השדה עדיין נערך ונשמר; פשוט לא נרשם שינוי ש-Make לא יוכל לנתב.

## הלוג

כל קריאה נרשמת פעמיים:

- `case_sync_log` — שורה לכל שינוי שדה, עם `webhook_status` ו-`webhook_message`
  שמתמלאים מהתשובה. זה מסך המעקב לשאלה "מה נשלח ומה קרה איתו".
- `webhook_logs` — הבקשה והתשובה המלאות, לתחקור. נצפה במסך
  `/dashboard/webhooks`.

## בדיקה אחרי שהסנריו קיים

1. ערוך טלפון בכרטיס תיק → צריך להגיע `entity_type: "case"` עם `case_number`.
2. ערוך שדה בחוצץ → `entity_type: "case_field"` עם `page_name` מלא.
3. ערוך תאריך של מועד → `entity_type: "deadline"` עם `source_ref` שהוא שם שדה.
4. הגדר את הסנריו להחזיר `failure` בכוונה → ודא שהערך **חוזר אחורה** במסך.
5. **הבדיקה החשובה:** ערוך שדה בחוצץ, ואז הרץ את סנכרון החוצצים — ודא שלא
   נוצרה שורה כפולה ושהערך לא נדרס בחזרה.

---

# בניית הסנריו ב-Make

## מה הסנריו עושה — ומה הוא לא עושה

הוא **לא** נוגע ב-Supabase. כשהמשתמש עורך שדה, ה-CRM כבר עדכן את Supabase
מהדפדפן, ורק אחר כך שלח את הוובהוק. מודול שכותב חזרה ל-Supabase ייצור לולאה.

התפקיד היחיד: **לכתוב לעדכנית**, ולהחזיר תשובה.

## מפת הסכימה של עדכנית

נגזרה מהגדרת `vwExportToOuterSystems_Files` ואומתה בכתיבה בפועל.

**מפתח ההתאמה:** `case_number` ב-CRM הוא `vwMainTik.VisualID`. הוא הולך
ל-`WHERE` בכל שאילתה.

**הקישור ללקוח:** `vwMainTik.SideCounter = vwClients.Counter`.

**ארבעה שדות הם קודים, לא טקסט.** התצוגה מצרפת טבלת קודים כדי להחזיר שם
קריא, אז ה-CRM מקבל שם — אבל בטבלה יושב מספר. כתיבת השם היישר לעמודה
תיכשל או תשתבש:

| שדה ב-CRM | עמודת הקוד | טבלת השמות | עמודת השם |
|---|---|---|---|
| `status` | `vwMainTik.Status` | `vwTikStatuses` | `StatusName` |
| `case_nature` | `vwMainTik.MautCode` | `vwTikMaut` | `MautName` |
| `team` | `vwMainTik.TeamCounter` | `vwTeams` | `TeamName` |
| `case_type` | `vwMainTik.UserDataType` | `vwTikTypes` | `TypeName` |

`case_type` יושב על `UserDataType`, לא על `HALICH` — `HALICH` הוא שדה נפרד
שה-CRM אינו מסנכרן.

**פרטי הלקוח אינם בתצוגת הייצוא.** ממנה נלקחים מ-`vwClients` רק `VisualID`
ו-`clcFullName`. הטלפון/מייל/כתובת נמשכים בשאילתה נפרדת בסנריו הנכנס,
ו-`vwClients` מחזיקה **שלוש** עמודות טלפון: `Phone1`, `Phone2`, `Mobile`.

יש לכתוב לאותה עמודה שהסנכרון הנכנס קורא ממנה. אחרת העריכה תצליח, Make
יחזיר `success`, והסנכרון הבא ידרוס אותה — המשתמש יראה את הערך הישן חוזר
בלי שום הודעת שגיאה.

`vwClients` ניתנת לכתיבה ישירה (נבדק).

## מבנה הסנריו

```
Webhook (Custom webhook)
  └─ Router
       ├─ Route: entity_type = "case"        → SQL: עדכון שדה על התיק
       ├─ Route: entity_type = "case_field"  → SQL: עדכון שדה מותאם
       ├─ Route: entity_type = "task"        → SQL: עדכון משימה
       ├─ Route: entity_type = "deadline"    → SQL: עדכון שדה תאריך על התיק
       └─ Route: fallback                    → Webhook Response: failure
  └─ Webhook Response (בסוף כל ענף)
```

הוובהוק חייב להיות מסוג **Custom webhook** עם `Response` מוגדר, לא
"Instant trigger" — ה-CRM מחכה לתשובה סינכרונית עד 10 שניות ומבטל את
השינוי אם היא לא מגיעה.

## אזהרת אבטחה — הזרקת SQL

`new_value` מגיע ממה שהמשתמש הקליד ב-CRM. **אסור לשרשר אותו לתוך מחרוזת
ה-SQL.** בחורים שבהם המשתמש שולט, ערך כמו `'; drop table ...; --` יורץ
כפקודה.

במודול ה-SQL של Make יש לשים `?` בשאילתה ולמלא את הערכים בשדה
**Parameters** בנפרד. כך המנוע מעביר אותם כנתונים ולא כקוד.

הדוגמאות למטה כתובות כך.

## ה-SQL לכל ענף

### `entity_type = "case"` — שדה טקסט על התיק

```sql
update vwMainTik set TikName = ? where VisualID = ?;
select @@ROWCOUNT as affected;
```
Parameters: `{{new_value}}`, `{{case_number}}`

### `entity_type = "case"` — שדה קוד (סטטוס, מהות, צוות, סוג)

```sql
update mt
   set mt.Status = ts.Counter
  from vwMainTik mt
  join vwTikStatuses ts on ts.StatusName = ?
 where mt.VisualID = ?;
select @@ROWCOUNT as affected;
```

הדפוס הזה בטוח: אם שם הסטטוס אינו קיים בטבלת הקודים, ה-`join` לא מתאים
כלום, `affected` יוצא `0`, ובדיקת ה-ROWCOUNT מחזירה `failure`. לא נכתב קוד
שגוי ולא נמחק ערך קיים — מה שהיה קורה עם תת-שאילתה שמחזירה `NULL`.

לשלושת האחרים אותו מבנה, עם העמודה וטבלת השמות מהטבלה למעלה.

### `entity_type = "case"` — פרטי לקוח

```sql
update vwClients
   set Phone1 = ?
 where Counter = (select SideCounter from vwMainTik where VisualID = ?);
select @@ROWCOUNT as affected;
```
Parameters: `{{new_value}}`, `{{case_number}}`

**הטלפון יושב על הלקוח, לא על התיק.** ללקוח עם כמה תיקים, עדכון באחד מהם
משנה את כולם. זו כנראה ההתנהגות הרצויה — לאדם יש טלפון אחד — אבל כדאי
שהלקוחה תדע, כי עורכת דין שמשנה טלפון בתיק אחד לא בהכרח מצפה לכך.

### `entity_type = "case_field"` — שדה בחוצץ

```sql
update <טבלת_שדות_מותאמים>
   set strData = ?
 where FileNumber = ? and PageName = ? and FieldName = ?
```
Parameters: `{{new_value}}`, `{{case_number}}`, `{{page_name}}`, `{{field_name}}`

**`page_name` הכרחי בתנאי.** אותו שם שדה קיים ביותר מחוצץ אחד — `מועד קבלת צו`
נמצא גם בחדל"פ וגם בצו שיקום כלכלי. בלעדיו תעדכנו את השדה הלא נכון.

עמודת היעד תלויה בסוג, וה-CRM שולח אותו ב-`value_type`:

| `value_type` | העמודה בעדכנית |
|---|---|
| `text` | `strData` |
| `date` | `dateData` |
| `number` | `numData` |

נתבו לפיו ואל תנחשו מצורת הערך — שדה טקסט שמכיל `2026-01-15` ייראה כמו
תאריך וייכתב לעמודה הלא נכונה.

### `entity_type = "task"` — משימה

```sql
update <טבלת_המשימות>
   set <עמודה> = ?
 where TaskID = ?
```
Parameters: `{{new_value}}`, `{{source_ref}}`

כאן `source_ref` הוא מזהה המשימה בעדכנית. **לא** `entity_id` — זה ה-UUID
של ה-CRM ועדכנית מעולם לא ראתה אותו.

### `entity_type = "deadline"` — מועד

```sql
update <טבלת_התיקים>
   set <שם_השדה_מתוך_source_ref> = ?
 where FileNumber = ?
```
Parameters: `{{new_value}}`, `{{case_number}}`

**זה הענף החריג.** מועד אינו רשומה נפרדת בעדכנית אלא **שדה תאריך על התיק**.
לכן `source_ref` כאן הוא **שם שדה** (למשל `תאריך דיון.`), לא מזהה שורה, והעדכון
הוא עדכון שדה על התיק — בדיוק כמו הענף הראשון, רק ששם השדה מגיע ב-`source_ref`
במקום ב-`field_name`.

## מיפוי שמות שדות

`field_name` מגיע כשם העמודה ב-CRM (`client_phone`), לא כשמה בעדכנית. צריך
טבלת המרה — Data Store ב-Make, או `switch()` במודול. לדוגמה:

| `field_name` ב-CRM | העמודה בעדכנית |
|---|---|
| `client_phone` | `Phone` |
| `client_email` | `Email` |
| `client_address` | `Address` |
| `client_id_number` | `IDNumber` |
| `case_name` | `FileName` |
| `case_type` | `FileType` |
| `opened_date` | `OpenDate` |
| `status` | `StatusName` |
| `team` | `TeamName` |

השמות בעמודה הימנית הם ניחוש — יש לאמת מול הסכימה של עדכנית.

**אל תבנו את שם העמודה בשרשור מחרוזת מ-`field_name` ישירות.** גם שם עמודה
שמגיע מבחוץ הוא וקטור הזרקה, ובניגוד לערך אי אפשר להעביר אותו כפרמטר. מיפוי
מרשימה סגורה הוא מה שמגן כאן: שם שאינו ברשימה → `failure`, לא ניסיון עדכון.

## התשובה

בסוף כל ענף, מודול **Webhook Response**:

- Status: `200`
- Body:
```json
{ "status": "success" }
```

בענף השגיאה ובענף ה-fallback:
```json
{ "status": "failure", "message": "הסבר קצר בעברית" }
```

ה-`message` מוצג למשתמש, ו-`failure` **מבטל את השינוי במסך**. זו לא הודעה
פורמלית — היא קובעת מה קורה לעריכה.

כדאי לעטוף את מודול ה-SQL ב-**Error handler** שמפנה למודול Response עם
`failure`, אחרת שגיאת SQL תפיל את ההרצה בלי תשובה, ה-CRM יקבל timeout,
ויתייחס אליו כ-`failure` — נכון מבחינת המשתמש, אבל בלי הודעה מועילה.

## בדיקה מקצה לקצה

1. הפעילו את הסנריו ופתחו את הלוג שלו.
2. ערכו טלפון בכרטיס תיק ב-CRM.
3. בלוג: לוודא ש-`entity_type` הוא `case` ושה-`case_number` נכון.
4. בעדכנית: לוודא שהערך התעדכן.
5. **החזירו `failure` בכוונה** (למשל ע"י שינוי זמני ב-Response) וודאו
   שהערך **חוזר אחורה** במסך ה-CRM.
6. **הבדיקה החשובה ביותר:** ערכו שדה בחוצץ, ואז הריצו את סנכרון החוצצים
   הנכנס — וודאו שלא נוצרה שורה כפולה ושהערך לא נדרס בחזרה.

בכל שלב אפשר לראות מה נשלח ומה חזר במסך `/dashboard/webhooks` ב-CRM.

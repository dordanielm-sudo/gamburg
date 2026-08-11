# משיכת החוצצים מעדכנית — סנריו נכנס ב-Make

כל החוצצים (חדל"פ, כללי, הסדר נושים, לקוח חדש, טופס 5, צו שיקום כלכלי, וכל
חוצץ שייווצר בעתיד) נמשכים מעדכנית ב**תרחיש אחד**, שרץ מתוזמן.

היעד: `POST /api/webhooks/case-field-sync`, עם הכותרת `x-webhook-secret`.
הסוד נקבע ב-`/dashboard/webhooks` (או ב-`MAKE_CASE_FIELD_SYNC_WEBHOOK_SECRET`).

## למה בחבילות ולא תיק-תיק

ב-Make כל באנדל שעובר במודול נספר כאופרציה — כולל Iterator. אין דרך "לאחד
ב-Make": כל מה שיוצא מהשאילתא כשורה נפרדת כבר עלה כסף. לכן האיחוד חייב
לקרות ב-SQL, לפני ש-Make רואה את הנתונים.

הסדרי הגודל, על סמך ספירה בפועל:

| מבנה | באנדלים לריצה | ריצה יומית, לחודש |
|---|---|---|
| שורה לכל שדה | ~67,000 | ~2,000,000 |
| שורה לכל תיק+חוצץ | ~3,200 | ~96,000 |
| שורה לכל 50 תיקים | ~64 | ~4,000 |

השורה השלישית היא מה שהתרחיש בונה. גודל החבילה עצמו כמעט לא משנה את
העלות — 25, 50 או 100 תיקים לחבילה כולם זניחים לעומת השורה שמעליהם — ולכן
הוא נקבע לפי מגבלת גודל הגוף ולא לפי חיסכון.

## גוף הבקשה

```json
{
  "batches": [
    {
      "case_number": "2024-1234",
      "page_name": "לקוח חדש",
      "fields": [
        { "field_name": "מקור הפניה", "value_text": "המלצה" },
        { "field_name": "תאריך פגישה", "value_date": "2026-01-15T00:00:00" },
        { "field_name": "מספר נושים", "value_number": 7 }
      ]
    }
  ]
}
```

מפתח חסר נחשב `null` — אין צורך לשלוח שדות ריקים במפורש. שדה ריק כן נשמר
כשורה עם `null`, כי חוצץ אמור להציג את כל השדות שלו עם מקף במקום הריקים.

הצורה הישנה, תיק בודד ללא `batches`, עדיין נתמכת:

```json
{ "case_number": "2024-1234", "page_name": "חדל\"פ", "fields": [ ... ] }
```

היא נשמרה כדי שהתרחיש הקיים של חדל"פ ימשיך לעבוד בזמן המעבר.

מערך חשוף ללא העטיפה מתקבל גם הוא:

```json
[ { "case_number": "...", "page_name": "...", "fields": [ ... ] } ]
```

זו הצורה שמתקבלת כשממפים את עמודת ה-SQL לגוף הבקשה בלי `{"batches": ...}`
סביבה, וכן `batches` שהגיע כמחרוזת JSON (הטוקן עטוף במרכאות). שתיהן טעויות
מיפוי נפוצות ב-Make, ושתיהן חד-משמעיות, אז ה-endpoint מקבל אותן ומחזיר
`warnings` במקום לדחות.

## התשובה

```json
{ "status": "ok", "cases": 100, "synced": 2847, "skipped": [] }
```

`skipped` מחזיק כל קבוצה שלא נכתבה ואת הסיבה — בעיקר מספרי תיק שקיימים
בעדכנית ואינם ב-CRM. הבקשה **לא** נכשלת בגללם: 100 תיקים בחבילה, ותיק אחד
לא מוכר לא אמור להפיל את 99 האחרים. אם אף קבוצה לא נכתבה מוחזר 400.

## השאילתא

```sql
with pairs as (
  select d.TikCounter,
         d.PageName,
         (row_number() over (order by d.TikCounter, d.PageName) - 1) / 50 as chunk_no
  from (select distinct TikCounter, PageName
        from vwExportToOuterSystems_UserData) d
),
docs as (
  select p.chunk_no,
         (select mt.VisualID as case_number,
                 p.PageName  as page_name,
                 json_query((
                   select ud.FieldName as field_name,
                          ud.strData   as value_text,
                          ud.dateData  as value_date,
                          ud.numData   as value_number
                   from vwExportToOuterSystems_UserData ud
                   where ud.TikCounter = p.TikCounter
                     and ud.PageName   = p.PageName
                   for json path
                 )) as fields
          from vwMainTik mt
          where mt.Counter = p.TikCounter
          for json path, without_array_wrapper) as doc
  from pairs p
)
select chunk_no,
       '[' + string_agg(doc, ',') + ']' as batches
from docs
group by chunk_no
order by chunk_no;
```

שלוש נקודות שקל לפספס:

* `vwExportToOuterSystems_UserData` מפתחת על `TikCounter`, לא על מספר התיק.
  ה-join ל-`vwMainTik` הוא מה שמייצר את `case_number` (שהוא `VisualID`).
* `json_query()` הכרחי סביב ה-`for json path` הפנימי. בלעדיו SQL Server
  מתייחס לתוצאה כמחרוזת ומברח את הגרשיים, ו-`fields` מגיע כטקסט במקום
  כמערך.
* `/ 50` הוא גודל החבילה, והוא **הכפתור היחיד** לוויסות גודל הבקשה. אם
  מתקבל 413, יורדים ל-25. ראו "מגבלת גודל הגוף" למטה.

## המבנה ב-Make

1. **MSSQL → Execute a query** עם השאילתא שלמעלה. מחזיר ~33 שורות.
2. **HTTP → Make a request**, ישירות אחריו. בלי Iterator ובלי Aggregator —
   כל מה שצריך כבר בנוי.
   * Method: `POST`, URL: `https://crm.hanagamburg.com/api/webhooks/case-field-sync`
   * Header: `x-webhook-secret`
   * Body type: `Raw`, Content type: `application/json`
   * Body: `{"batches":{{batches}}}`

`{{batches}}` נכנס **בלי מרכאות**. השדה כבר מחזיק JSON תקין, ועטיפה במרכאות
תשלח מחרוזת במקום מערך והבקשה תיפול על 400.

ב-HTTP module כדאי להגדיר error handler מסוג `Ignore`, כדי שכשל בחבילה אחת
לא יעצור את הריצה.

## מגבלת גודל הגוף

ברירת המחדל של Nginx היא 1MB, ובקשה גדולה ממנה נחתכת עוד ב-Nginx ומחזירה
413 בלי שהאפליקציה רואה אותה — כלומר **בלי שורה ביומן הקריאות**, מה שמקשה
לאבחן. אם רואים 413 או תשובת HTML במקום JSON, זה המקור.

**גודל החבילה הוא הכפתור, לא תצורת Nginx.** באחסון מנוהל (Cloudways) לרוב אין
גישה לתצורת Nginx, ולכן התרחיש מכויל להישאר בתוך המגבלה: 50 תיקים לחבילה הם
בערך 100KB, פי עשרה מתחת ל-1MB. אם בכל זאת מתקבל 413, יורדים ל-25 בשאילתא.
העלות של ירידה כזו זניחה — ראו הטבלה בראש המסמך.

מי שכן יש לו גישה יכול להוסיף `client_max_body_size 20m;`, ראו
[`../DEPLOY.md`](../DEPLOY.md), אבל זו הרחבה ולא תנאי.

מעל 20,000 שדות בבקשה אחת ה-endpoint עצמו מחזיר 413 עם הסבר, כדי שהמגבלה
תתגלה בתשובה ולא כשגיאת רשת סתומה.

## למה זו משיכה מלאה בכל פעם

ל-`vwExportToOuterSystems_UserData` אין עמודת תאריך עדכון — העמודות הן
PageName, FieldName, TikCounter, strData, dateData, numData, Data, RowNum.
לכן אי אפשר למשוך רק את מה שהשתנה, וכל ריצה מושכת הכל. זה בסדר במחיר הזה
(~33 אופרציות), אבל אם עדכנית תוסיף עמודת חותמת זמן שווה לסנן לפיה.

הכתיבה היא upsert על `(case_id, page_name, field_name)`, כך שמשיכה חוזרת לא
כופלת ולא מוחקת. שדה שהופיע פעמיים באותה בקשה מקבל את הערך האחרון — לתצוגה
בעדכנית יש `RowNum`, כלומר קבוצות חוזרות קיימות שם, ו-Postgres מסרב ל-upsert
שנוגע באותה שורה פעמיים באותה פקודה.

## הרשאות חוצצים

משתמש עם רשומות ב-`profile_tab_permissions` נמצא ברשימת היתר סגורה: חוצץ
חדש **לא** יופיע לו עד שיתווסף לו ידנית ב-`/dashboard/users/<id>`. משתמש בלי
רשומות כלל רואה את כל החוצצים. זו התנהגות מכוונת (fail-closed), אבל היא
הסיבה הצפויה לכך שמישהו לא רואה חוצץ שזה עתה נמשך.

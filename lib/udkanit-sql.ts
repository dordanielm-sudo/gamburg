import "server-only";

// Builds the complete statement Make should run against עדכנית - values
// already in place, ready to paste into a single SQL module. No router, no
// field-name mapping, no second field to wire up.
//
// The values are inlined rather than bound, which puts the whole weight of
// safety on sqlLiteral() below. `new_value` is whatever a user typed into a
// form, and this string is executed verbatim against the firm's live
// case-management database - so that function is the one place in this file
// that has to be right.
//
// It also means the webhook is a credential. Anyone who can POST to it can
// run these statements - not arbitrary SQL, since the templates are fixed
// here, but still writes against עדכנית.

export interface UdkanitStatement {
  sql: string;
  // kept alongside the statement for the log and for tracing a bad write back
  // to what was sent; Make does not need it
  params: (string | number | null)[];
}

// Renders a value as a T-SQL literal.
//
// Two things this must get right:
//   * a single quote inside the value ends the literal early - doubling it is
//     the escape SQL Server defines, and it is the only one needed for a
//     string literal
//   * the N prefix marks the literal as nvarchar. Without it SQL Server reads
//     it as the database's non-Unicode codepage and Hebrew comes out as
//     question marks - silently, since the write itself succeeds
function sqlLiteral(value: string | number | null): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`ערך מספרי לא תקין: ${value}`);
    }
    return String(value);
  }
  // A NUL byte cannot appear in an nvarchar literal and would truncate the
  // statement at the driver. Nothing legitimate contains one.
  if (value.includes("\u0000")) {
    throw new Error("הערך מכיל תו NUL ואינו ניתן לכתיבה");
  }
  return `N'${value.replace(/'/g, "''")}'`;
}

// Returned instead of a statement when a field has no write path yet, so Make
// can answer with a clear reason rather than a silent success.
export interface UnsupportedUpdate {
  sql: null;
  reason: string;
}

export type UdkanitUpdate = UdkanitStatement | UnsupportedUpdate;

// ---------------------------------------------------------------------------
// Schema map, derived from vwExportToOuterSystems_Files and verified by
// writing to vwClients. See docs/make-write-back.md.
//
// case_number in the CRM is vwMainTik.VisualID - the key in every WHERE.
// The client hangs off vwMainTik.SideCounter = vwClients.Counter.
// ---------------------------------------------------------------------------

// Plain text columns on the case itself.
const CASE_TEXT_COLUMNS: Record<string, string> = {
  case_name: "TikName",
};

// Columns holding a code, joined to a lookup table to produce the readable
// name the CRM stores. Writing the name straight in would fail or corrupt, so
// the statement joins the lookup and writes the matching Counter.
//
// The join is deliberate rather than a subquery: an unknown name matches
// nothing and updates zero rows, which the caller detects. A subquery would
// return NULL and blank out a good value.
const CASE_CODE_COLUMNS: Record<
  string,
  { column: string; lookupTable: string; nameColumn: string }
> = {
  status: { column: "Status", lookupTable: "vwTikStatuses", nameColumn: "StatusName" },
  case_nature: { column: "MautCode", lookupTable: "vwTikMaut", nameColumn: "MautName" },
  team: { column: "TeamCounter", lookupTable: "vwTeams", nameColumn: "TeamName" },
  case_type: { column: "UserDataType", lookupTable: "vwTikTypes", nameColumn: "TypeName" },
};

// Columns on the client record, reached through SideCounter.
//
// client_phone maps to Mobile per the incoming sync - it has to be the same
// column the sync reads, or the next run overwrites the edit and the user
// watches the old value reappear with no error.
const CLIENT_COLUMNS: Record<string, string> = {
  client_phone: "Mobile",
  client_email: "EMail",
  client_id_number: "ID",
};

// Fields the CRM lets a user edit but that have no safe write path.
const UNSUPPORTED_CASE_FIELDS: Record<string, string> = {
  client_address:
    "הכתובת מפוצלת בעדכנית לעיר/רחוב/מספר/דירה ומוצגת מחוברת - אי אפשר לפרק את המחרוזת בחזרה באופן אמין",
  opened_date:
    "עמודת תאריך פתיחת התיק בעדכנית טרם אומתה - יש לקבוע אם היא HozlapOpenDate או אחרת",
};

// Appended to every statement so Make can tell a write that matched nothing
// from one that worked. An UPDATE that finds no rows is not an error in SQL -
// it succeeds silently - so without this the scenario would report success on
// a case number that does not exist.
const ROWCOUNT_PROBE = "\nselect @@ROWCOUNT as affected;";

// ---------------------------------------------------------------------------
// חוצצים - עדכנית's custom-field store
//
// vwExportToOuterSystems_UserData joins six tables, so it can never be written
// to: SQL Server only lets an UPDATE touch one base table. That is why writing
// through it silently changed nothing. The shape, from the view definition:
//
//   UserData_Records   Counter (pk), TikCounter, PageID   - one row per case+tab
//   UserData_Pages     PageID, PageName, Deleted          - the tabs
//   UserData_Defs      FieldID, PageID, FieldName, Deleted - the field list
//   UserData_Str       RecCounter, FieldID, Data          - text values
//   UserData_Date      RecCounter, FieldID, Data          - date values
//   UserData_Num       RecCounter, FieldID, Data          - numeric values
//
// A field with no value has NO row in its value table - it shows as null in
// the view only because of the LEFT JOIN. So writing is an upsert, not an
// update, and a plain UPDATE would report success while changing nothing.
// ---------------------------------------------------------------------------

// Which value table a field's data lives in, and the UserData_Defs.FieldType
// codes that belong to it. Counted straight off the live data - 7,770 + 11,478
// values for types 1 and 5 in Str, 174 + 5,204 for 2 and 6 in Num, 8,904 for
// type 3 in Date, and not a single value anywhere it does not belong.
//
// The FieldType list is not only a mapping, it is the guard: the statement
// looks the field up with `FieldType in (...)`, so if the CRM's idea of the
// type ever disagrees with עדכנית's, the lookup finds nothing and the write
// reports zero rows. The alternative - trusting the CRM and writing anyway -
// would put a date in the text table, where the next sync would read it back
// as a string and the field would quietly stop working.
const VALUE_TABLE: Record<string, { table: string; fieldTypes: number[] }> = {
  text: { table: "dbo.UserData_Str", fieldTypes: [1, 5] },
  date: { table: "dbo.UserData_Date", fieldTypes: [3] },
  number: { table: "dbo.UserData_Num", fieldTypes: [2, 6] },
};

// Renders the value for the typed column it is going into. Each value table's
// Data column has its own type - varchar, datetime, float - and a string
// literal in the numeric one would be a conversion error at write time.
function userDataLiteral(
  valueType: "text" | "date" | "number",
  value: string | null,
): string {
  if (value === null || value === "") return "null";
  if (valueType === "text") return sqlLiteral(value);
  if (valueType === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new Error(`ערך מספרי לא תקין לשדה מספרי: ${value}`);
    }
    return String(n);
  }
  // style 126 is ISO 8601, which is what the CRM stores and sends - parsing it
  // explicitly rather than letting SQL Server guess from the server's locale,
  // where 03/04 could be March or April
  return `convert(datetime, ${sqlLiteral(value)}, 126)`;
}

function buildUserDataUpdate(input: {
  caseNumber: string;
  pageName: string | null;
  fieldName: string;
  valueType: "text" | "date" | "number" | null;
  newValue: string | null;
}): UdkanitUpdate {
  const { caseNumber, pageName, fieldName, valueType, newValue } = input;

  if (!valueType) {
    return {
      sql: null,
      reason: `לשדה ${fieldName} לא נשלח סוג ערך - אי אפשר לדעת לאיזו טבלת ערכים לכתוב`,
    };
  }
  const target = VALUE_TABLE[valueType];
  if (!target) {
    return { sql: null, reason: `סוג ערך לא מוכר: ${valueType}` };
  }
  const table = target.table;
  const typeGuard = `d.FieldType in (${target.fieldTypes.join(", ")})`;

  // Without a page the field name has to be unique across all tabs. It often
  // is not - "החרגת רכב" exists on both כללי and לקוח חדש - and writing to
  // whichever one came back first would corrupt the other tab silently. The
  // count() makes an ambiguous name resolve to null, which the guard below
  // turns into affected = 0 rather than a wrong write.
  const fieldLookup = pageName
    ? `select top 1 d.FieldID
       from dbo.UserData_Defs d
       join dbo.UserData_Pages p on p.PageID = d.PageID and p.Deleted = 0
      where p.PageName = ${sqlLiteral(pageName)}
        and d.FieldName = ${sqlLiteral(fieldName)}
        and ${typeGuard}
        and d.Deleted = 0`
    : `select case when count(*) = 1 then min(d.FieldID) end
       from dbo.UserData_Defs d
       join dbo.UserData_Pages p on p.PageID = d.PageID and p.Deleted = 0
      where d.FieldName = ${sqlLiteral(fieldName)}
        and ${typeGuard}
        and d.Deleted = 0`;

  const value = userDataLiteral(valueType, newValue);

  return {
    sql: `declare @fld int = (${fieldLookup});
declare @page int = (select PageID from dbo.UserData_Defs where FieldID = @fld);
declare @tik int = (select Counter from vwMainTik where VisualID = ${sqlLiteral(caseNumber)});
-- a case can hold several records for the same tab (the view numbers them
-- with ROW_NUMBER), and the first is the one the CRM shows
declare @rec int = (
  select top 1 Counter from dbo.UserData_Records
   where TikCounter = @tik and PageID = @page
   order by Counter
);
declare @affected int = 0;

if @fld is not null and @rec is not null
begin
  update ${table} set Data = ${value}
   where RecCounter = @rec and FieldID = @fld;
  set @affected = @@ROWCOUNT;

  -- no row yet means the field was never filled in for this case, not that
  -- the lookup failed - the view shows it as null either way
  if @affected = 0
  begin
    insert into ${table} (RecCounter, FieldID, Data)
    values (@rec, @fld, ${value});
    set @affected = @@ROWCOUNT;
  end

  update dbo.UserData_Records set tsModifyDate = getdate() where Counter = @rec;
end

select @affected as affected;`,
    params: [newValue, caseNumber, pageName, fieldName],
  };
}

// ---------------------------------------------------------------------------
// משימות - dbo.Tasks
//
// From vwExportToOuterSystems_Tasks. Unlike the חוצצים, this is one base table
// with the row identified by Counter - which is exactly what the CRM stores as
// source_task_id. No record lookup, no upsert: the row always exists, because
// a task without a source_task_id was created in the CRM and never existed in
// עדכנית at all.
//
// Priority and status are codes joined to dbo.odpl_TableTypes, a shared lookup
// keyed by TableName. Same reasoning as the case's status/מהות columns: the
// join is deliberate rather than a subquery, so an unknown name updates zero
// rows instead of writing NULL over a good value.
// ---------------------------------------------------------------------------

const TASK_TEXT_COLUMNS: Record<string, string> = {
  text: "TaskText",
  subject: "TaskSubject",
};

const TASK_DATE_COLUMNS: Record<string, string> = {
  due_date: "EndDate",
  start_date: "StartDate",
};

const TASK_CODE_COLUMNS: Record<string, { column: string; tableName: string }> = {
  priority_name: { column: "Priority", tableName: "TaskPriority" },
  status_name: { column: "TaskStatus", tableName: "TaskStatus" },
};

const UNSUPPORTED_TASK_FIELDS: Record<string, string> = {
  notes:
    "הערות המשימה הן שדה של ה-CRM בלבד - לטבלת המשימות בעדכנית אין עמודה מקבילה",
};

function buildTaskUpdate(input: {
  fieldName: string;
  sourceRef: string | null;
  newValue: string | null;
}): UdkanitUpdate {
  const { fieldName, sourceRef, newValue } = input;

  const unsupported = UNSUPPORTED_TASK_FIELDS[fieldName];
  if (unsupported) return { sql: null, reason: unsupported };

  if (!sourceRef) {
    return {
      sql: null,
      reason: "למשימה אין מזהה מקור - היא נוצרה ב-CRM ואינה קיימת בעדכנית",
    };
  }
  // Tasks.Counter is an int; source_task_id is stored as text on our side.
  // Checking here rather than letting SQL Server attempt the conversion keeps
  // a malformed id a readable refusal instead of a driver error.
  const counter = Number(sourceRef);
  if (!Number.isInteger(counter)) {
    return { sql: null, reason: `מזהה המשימה בעדכנית אינו מספר: ${sourceRef}` };
  }

  const textColumn = TASK_TEXT_COLUMNS[fieldName];
  if (textColumn) {
    return {
      sql:
        `update dbo.Tasks set ${textColumn} = ${sqlLiteral(newValue)}` +
        ` where Counter = ${counter};${ROWCOUNT_PROBE}`,
      params: [newValue, sourceRef],
    };
  }

  const dateColumn = TASK_DATE_COLUMNS[fieldName];
  if (dateColumn) {
    // style 126 is ISO 8601 - explicit, rather than letting SQL Server read
    // 03/04 as March or April depending on the server's locale
    const value =
      newValue === null || newValue === ""
        ? "null"
        : `convert(datetime, ${sqlLiteral(newValue)}, 126)`;
    return {
      sql:
        `update dbo.Tasks set ${dateColumn} = ${value}` +
        ` where Counter = ${counter};${ROWCOUNT_PROBE}`,
      params: [newValue, sourceRef],
    };
  }

  const code = TASK_CODE_COLUMNS[fieldName];
  if (code) {
    return {
      sql:
        `update t set t.${code.column} = lk.TypeID1\n` +
        `  from dbo.Tasks t\n` +
        `  join dbo.odpl_TableTypes lk\n` +
        `    on lk.TableName = ${sqlLiteral(code.tableName)}\n` +
        `   and lk.TypeName = ${sqlLiteral(newValue)}\n` +
        ` where t.Counter = ${counter};${ROWCOUNT_PROBE}`,
      params: [newValue, sourceRef],
    };
  }

  return { sql: null, reason: `לשדה ${fieldName} במשימה אין מיפוי לעדכנית` };
}

export function buildUdkanitUpdate(input: {
  entityType: "case" | "case_field" | "task" | "deadline" | "document";
  fieldName: string;
  caseNumber?: string;
  newValue: string | null;
  pageName?: string | null;
  sourceRef?: string | null;
  valueType?: "text" | "date" | "number" | null;
}): UdkanitUpdate {
  const { entityType, fieldName, caseNumber, newValue } = input;

  if (!caseNumber) {
    return { sql: null, reason: "אין מספר תיק - אין לפי מה לאתר את הרשומה בעדכנית" };
  }

  if (entityType === "case") {
    const unsupported = UNSUPPORTED_CASE_FIELDS[fieldName];
    if (unsupported) return { sql: null, reason: unsupported };

    const textColumn = CASE_TEXT_COLUMNS[fieldName];
    if (textColumn) {
      return {
        sql:
          `update vwMainTik set ${textColumn} = ${sqlLiteral(newValue)}` +
          ` where VisualID = ${sqlLiteral(caseNumber)};${ROWCOUNT_PROBE}`,
        params: [newValue, caseNumber],
      };
    }

    const code = CASE_CODE_COLUMNS[fieldName];
    if (code) {
      return {
        sql:
          `update mt set mt.${code.column} = lk.Counter\n` +
          `  from vwMainTik mt\n` +
          `  join ${code.lookupTable} lk on lk.${code.nameColumn} = ${sqlLiteral(newValue)}\n` +
          ` where mt.VisualID = ${sqlLiteral(caseNumber)};${ROWCOUNT_PROBE}`,
        params: [newValue, caseNumber],
      };
    }

    const clientColumn = CLIENT_COLUMNS[fieldName];
    if (clientColumn) {
      return {
        sql:
          `update vwClients set ${clientColumn} = ${sqlLiteral(newValue)}\n` +
          ` where Counter = (select SideCounter from vwMainTik` +
          ` where VisualID = ${sqlLiteral(caseNumber)});` +
          ROWCOUNT_PROBE,
        params: [newValue, caseNumber],
      };
    }

    return { sql: null, reason: `לשדה ${fieldName} אין מיפוי לעדכנית` };
  }

  // חוצצים and מועדים are both rows in עדכנית's custom-field store: a deadline
  // is not a record of its own, it is a date field on the case, named by
  // source_field_name. Same statement, the field name arriving in a different
  // key.
  if (entityType === "case_field" || entityType === "deadline") {
    return buildUserDataUpdate({
      caseNumber,
      pageName: input.pageName ?? null,
      fieldName: entityType === "deadline" ? (input.sourceRef ?? fieldName) : fieldName,
      valueType: input.valueType ?? (entityType === "deadline" ? "date" : null),
      newValue,
    });
  }

  if (entityType === "task") {
    return buildTaskUpdate({
      fieldName,
      sourceRef: input.sourceRef ?? null,
      newValue,
    });
  }

  return {
    sql: null,
    reason: "מסמכים אינם מסונכרנים חזרה - אין להם מזהה מקור בסכימה",
  };
}

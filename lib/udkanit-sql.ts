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
    return {
      sql: null,
      reason:
        "טבלת הבסיס של השדות המותאמים בעדכנית טרם אותרה - " +
        "יש להריץ sys.dm_sql_referenced_entities על vwExportToOuterSystems_UserData",
    };
  }

  if (entityType === "task") {
    return {
      sql: null,
      reason: "ענף המשימות טרם נבנה - נדרשים שם טבלת המשימות בעדכנית ועמודת המזהה שלה",
    };
  }

  return {
    sql: null,
    reason: "מסמכים אינם מסונכרנים חזרה - אין להם מזהה מקור בסכימה",
  };
}

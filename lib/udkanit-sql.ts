import "server-only";

// Builds the exact statement Make should run against עדכנית, so the scenario
// is a single SQL module that executes what it was handed - no router, no
// field-name mapping, no query assembled by hand in Make's UI.
//
// The value never enters the SQL text. Every statement uses `?` placeholders
// and ships its values in `params`, bound by the driver. That matters more
// here than anywhere else in the codebase: `new_value` is whatever a user
// typed into a form, and this string is executed verbatim against the firm's
// live case-management database.
//
// It also means the webhook must be treated as a credential. Anyone who can
// POST to it can run these statements - not arbitrary SQL, since the
// templates are fixed here, but still writes against עדכנית.

export interface UdkanitStatement {
  sql: string;
  params: (string | number | null)[];
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
        sql: `update vwMainTik set ${textColumn} = ? where VisualID = ?;${ROWCOUNT_PROBE}`,
        params: [newValue, caseNumber],
      };
    }

    const code = CASE_CODE_COLUMNS[fieldName];
    if (code) {
      return {
        sql:
          `update mt set mt.${code.column} = lk.Counter\n` +
          `  from vwMainTik mt\n` +
          `  join ${code.lookupTable} lk on lk.${code.nameColumn} = ?\n` +
          ` where mt.VisualID = ?;${ROWCOUNT_PROBE}`,
        params: [newValue, caseNumber],
      };
    }

    const clientColumn = CLIENT_COLUMNS[fieldName];
    if (clientColumn) {
      return {
        sql:
          `update vwClients set ${clientColumn} = ?\n` +
          ` where Counter = (select SideCounter from vwMainTik where VisualID = ?);` +
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

// The dashboard's chart arrangement is one view_templates row - `screen` is
// free text on that table, so no migration was needed to carve out a
// namespace for it, and keeping add/remove/rename in a single row makes each
// change one atomic write. Migration 0046 enforces that there is only ever
// one such row.
//
// This lives in its own module rather than beside the panel that writes it:
// the panel is a "use client" file, and app/dashboard/page.tsx - a server
// component - filters on this same value. Importing a plain constant across
// that boundary is not what the client boundary is for (it exists to hand
// server code an opaque reference to a component, not to share values), and
// the value the server bundle ends up with is not guaranteed to be the string
// written here. A query filtered on the wrong value is not an error, it just
// matches nothing - which is exactly how the saved layout came back empty on
// every load while the row sat there in the table.
export const DASHBOARD_LAYOUT_SCREEN = "dashboard_layout";

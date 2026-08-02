-- Gamburg CRM - עדכון תבניות סינון (view_templates) לגרסה מתקדמת יותר.
--
-- מיגרציה 0030 תמכה רק בערך יחיד לכל תנאי, ולא שמרה עמודות/מיון. לפי
-- פידבק: (1) תנאי סינון צריך לתמוך בבחירה מרובה (OR בין ערכים לאותו
-- שדה - "סטטוס הוא פתוח או בטיפול"), (2) תבנית שמורה בניהול תיקים
-- צריכה לשמור גם אילו עמודות מוצגות ובאיזה סדר מיון, לא רק את הסינון,
-- (3) גם עוגות הדשבורד צריכות תבנית סינון (מסנן איזה תיקים נכנסים
-- לעוגה, לפני החלוקה לפי שדה). במקום להרחיב את המבנה הקיים, מחליפים
-- אותו בשלמותו - אין עדיין שימוש אמיתי בטבלה, רק בדיקות.
--
-- config הוא jsonb גנרי, הצורה תלויה ב-screen:
--   cases:     {"filters": [...], "columns": ["case_number", ...],
--               "sortKey": "last_touched_at", "sortDir": "desc"}
--   dashboard: {"filters": [...], "groupBy": "status"}
-- filters הוא מערך של {"key": "...", "values": ["...", "..."]} - key
-- מקודד את השדה בדיוק כמו בבורר בממשק: "fixed:<col>" או
-- "case_field:<page_name>::<field_name>". תואם למי שכבר True (any) בין
-- values, ו-AND בין תנאים שונים באותה תבנית.

drop table if exists public.view_templates;

create table public.view_templates (
  id            uuid primary key default gen_random_uuid(),
  screen        text not null,
  name          text not null,
  config        jsonb not null default '{}'::jsonb,
  display_order int not null default 0,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);

create index view_templates_screen_idx on public.view_templates (screen, display_order);

alter table public.view_templates enable row level security;

create policy view_templates_select_all
  on public.view_templates for select
  to authenticated
  using (true);

create policy view_templates_insert_manager
  on public.view_templates for insert
  to authenticated
  with check (public.current_user_role() = 'manager');

create policy view_templates_update_manager
  on public.view_templates for update
  to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

create policy view_templates_delete_manager
  on public.view_templates for delete
  to authenticated
  using (public.current_user_role() = 'manager');

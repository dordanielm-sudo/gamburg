-- Gamburg CRM - תבניות סינון שמורות (view_templates).
--
-- מנהל בונה שילוב של תנאי סינון (על עמודות קבועות או על שדות מתוך כל
-- חוצץ) ושומר אותו בשם, כדי שלא יצטרך לבנות מחדש כל פעם. כל מי שרואה
-- את המסך יכול לבחור תבנית שמורה ולהחיל אותה; רק מנהל יוצר/מוחק תבניות -
-- אותו עיקרון בדיוק כמו case_type_stages (0028) ו-case_type_column_presets
-- (0019).
--
-- screen מבחין בין המסכים שמשתמשים בתבניות (cases/deadlines/approvals) -
-- טבלה אחת גנרית במקום טבלה נפרדת לכל מסך, כי הצורה (שם + רשימת תנאים)
-- זהה בכולם.
--
-- filters הוא jsonb - מערך של תנאי שוויון בצורה:
--   {"source": "fixed", "field": "status", "value": "פתוח"}
--   {"source": "case_field", "page_name": "חדל\"פ", "field_name": "חובות", "value": "..."}
-- כל התנאים מחוברים ב-AND. זו אותה גרנולריות שכבר קיימת בדרופדאונים
-- הקבועים במסכים האלה (שוויון בלבד, לא טווחים/הכלה) - לא מרחיבים את
-- הסמנטיקה, רק את מקור השדות.

create table public.view_templates (
  id            uuid primary key default gen_random_uuid(),
  screen        text not null,
  name          text not null,
  filters       jsonb not null default '[]'::jsonb,
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

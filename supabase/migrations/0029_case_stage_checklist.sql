-- Gamburg CRM - שלב + תתי-שלבים (checklist per stage), and confirmation
-- that מהות תיק is a separate, coarser axis.
--
-- The client's actual Excel ("מהות תיק" / "שלב" sheet) has two distinct
-- axes, not one:
--   - מהות תיק (coarse, 5 values: לא הוגש טופס 5 -> הוגש טופס 5 מחכים
--     לצו -> צו פתיחת הליכים -> צו שיקום כללי -> הפטר). This is exactly
--     cases.case_nature, already editable + two-way synced since 0027 -
--     no schema change needed, only the real-world values change.
--   - שלב (fine-grained, 8 values: קליטה -> בדיקה מקדמית -> הכנת טופס 5
--     -> ממתין לצו -> לאחר צו -> דוחות חודשיים -> שיקום -> הסתיים). New,
--     CRM-native field (several שלב values can map to one מהות תיק value -
--     e.g. ממתין לצו/לאחר צו/דוחות חודשיים all fall under the single
--     מהות תיק value "צו פתיחת הליכים"). Powers the stepper on the case
--     card, same interaction pattern as case_nature previously did.
--   - Each שלב has an ordered checklist of תתי-שלבים (things to complete
--     before moving on) - this is new: case_type_stages (0028) only had
--     the stage list itself, no sub-items.
--
-- case_type_stages (0028) keeps representing the שלב list per case_type;
-- this migration adds the checklist layer under it, plus per-case
-- completion tracking, plus the new cases.case_stage column.

alter table public.cases add column case_stage text;

-- two-way editable from the stepper, same mechanism as status/case_nature
-- (0027) - RLS row policies are already correct (0002), only the
-- column-level grant is needed
grant update (case_stage) on public.cases to authenticated;

create table public.case_type_stage_items (
  id            uuid primary key default gen_random_uuid(),
  stage_id      uuid not null references public.case_type_stages (id) on delete cascade,
  item_text     text not null,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

create index case_type_stage_items_stage_id_idx
  on public.case_type_stage_items (stage_id, display_order);

alter table public.case_type_stage_items enable row level security;

-- same shape as case_type_stages (0028): everyone sees the checklist,
-- only a manager curates it
create policy case_type_stage_items_select_all
  on public.case_type_stage_items for select
  to authenticated
  using (true);

create policy case_type_stage_items_insert_manager
  on public.case_type_stage_items for insert
  to authenticated
  with check (public.current_user_role() = 'manager');

create policy case_type_stage_items_update_manager
  on public.case_type_stage_items for update
  to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

create policy case_type_stage_items_delete_manager
  on public.case_type_stage_items for delete
  to authenticated
  using (public.current_user_role() = 'manager');

-- per-case completion state - one row per (case, item) once checked;
-- absence of a row means "not done". Not synced to Make - this is
-- CRM-native bookkeeping, unlike case_nature/status.
create table public.case_stage_checklist (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases (id) on delete cascade,
  item_id    uuid not null references public.case_type_stage_items (id) on delete cascade,
  done       boolean not null default false,
  done_by    uuid references public.profiles (id),
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (case_id, item_id)
);

create index case_stage_checklist_case_id_idx on public.case_stage_checklist (case_id);

alter table public.case_stage_checklist enable row level security;

-- identical shape to case_deadlines (0008): manager/secretary see
-- everything, handler sees/edits only their own cases' rows
create policy case_stage_checklist_select_manager_secretary
  on public.case_stage_checklist for select
  to authenticated
  using (public.current_user_role() in ('manager', 'secretary'));

create policy case_stage_checklist_select_handler_own
  on public.case_stage_checklist for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_stage_checklist.case_id and c.handler_id = auth.uid()
    )
  );

create policy case_stage_checklist_insert
  on public.case_stage_checklist for insert
  to authenticated
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = case_stage_checklist.case_id and c.handler_id = auth.uid()
    )
  );

create policy case_stage_checklist_update
  on public.case_stage_checklist for update
  to authenticated
  using (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = case_stage_checklist.case_id and c.handler_id = auth.uid()
    )
  )
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = case_stage_checklist.case_id and c.handler_id = auth.uid()
    )
  );

create policy case_stage_checklist_delete_manager
  on public.case_stage_checklist for delete
  to authenticated
  using (public.current_user_role() = 'manager');

-- ---------------------------------------------------------------------------
-- Seed: שלבים ותתי-שלבים לחדל"פ, מתומלל מגיליון "מהות תיק/שלב" באקסל של
-- הלקוחה. הרצה חד-פעמית - אם מריצים פעמיים תיווצר כפילות (אין הגנת
-- on-conflict, כי "חוצץ לקוח חדש" חוקית מופיע פעמיים במקור).
-- אם "חדל"פ" אינו הערך המדויק המופיע בעמודת case_type בתיקים שלך,
-- יש לעדכן אותו כאן לפני ההרצה.
-- ---------------------------------------------------------------------------

with stage_rows as (
  insert into public.case_type_stages (case_type, stage_name, display_order)
  values
    ('חדל"פ', 'קליטה', 0),
    ('חדל"פ', 'בדיקה מקדמית', 1),
    ('חדל"פ', 'הכנת טופס 5', 2),
    ('חדל"פ', 'ממתין לצו', 3),
    ('חדל"פ', 'לאחר צו', 4),
    ('חדל"פ', 'דוחות חודשיים', 5),
    ('חדל"פ', 'שיקום', 6),
    ('חדל"פ', 'הסתיים', 7)
  returning id, stage_name
),
items (stage_name, item_text, item_order) as (
  values
    ('קליטה', 'חוצץ לקוח חדש', 0),
    ('קליטה', 'חוצץ לקוח חדש', 1),
    ('קליטה', 'ת.ז', 2),
    ('קליטה', 'ייפוי כוח חום', 3),
    ('קליטה', 'הסכם שכר טרחה חתום', 4),
    ('קליטה', 'צריך החרגת רכב', 5),
    ('קליטה', 'צריך הפעלת עסק', 6),
    ('קליטה', 'הוראות נוהל', 7),
    ('קליטה', 'האם יש חוב לרשויות', 8),
    ('קליטה', 'נדרש עיכוב הליכים', 9),
    ('קליטה', 'ייצוג בהוצ"פ', 10),
    ('קליטה', 'צ''ק פיקדון', 11),

    ('בדיקה מקדמית', '1.1', 0),
    ('בדיקה מקדמית', 'חוצץ כללי השלמת מסמכים פרוט', 1),
    ('בדיקה מקדמית', 'הוצל"פ- חוצץ כללי', 2),
    ('בדיקה מקדמית', 'חובות חיצוניים- חוצץ כללי', 3),
    ('בדיקה מקדמית', 'עיכוב הליכים- חוצץ', 4),

    ('הכנת טופס 5', '2.1', 0),
    ('הכנת טופס 5', '2.2', 1),
    ('הכנת טופס 5', '2.3', 2),
    ('הכנת טופס 5', '2.4', 3),
    ('הכנת טופס 5', '2.5', 4),
    ('הכנת טופס 5', '2.6', 5),
    ('הכנת טופס 5', '2.7', 6),
    ('הכנת טופס 5', '2.8', 7),
    ('הכנת טופס 5', '2.9', 8),
    ('הכנת טופס 5', 'אישור עורך דין וחנה', 9),

    ('ממתין לצו', '2.91', 0),

    ('לאחר צו', 'החרגת רכב', 0),
    ('לאחר צו', 'הפעלת עסק', 1),
    ('לאחר צו', 'תשלומים', 2),
    ('לאחר צו', 'דוחות', 3),
    ('לאחר צו', 'עדכון לקוח', 4),

    ('דוחות חודשיים', 'חוצץ חדל"פ', 0),
    ('דוחות חודשיים', 'דוח אחרון שהוגש', 1),
    ('דוחות חודשיים', 'הדוח הבא להגשה', 2),
    ('דוחות חודשיים', 'תגובות', 3),
    ('דוחות חודשיים', 'חקירה', 4),

    ('שיקום', 'תשלום לממונה', 0),
    ('שיקום', 'דוח חצי שנתי', 1),
    ('שיקום', 'מעקב הפרות', 2)
)
insert into public.case_type_stage_items (stage_id, item_text, display_order)
select stage_rows.id, items.item_text, items.item_order
from items
join stage_rows on stage_rows.stage_name = items.stage_name;

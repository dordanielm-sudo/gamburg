-- Gamburg CRM - כרטיס תיק reorganization per the client's screen spec: two
-- more client-identity fields alongside the existing client_id_number/
-- client_phone (same "source" column pattern - synced by case-sync, not
-- CRM-only).

alter table public.cases
  add column client_email text,
  add column client_address text;

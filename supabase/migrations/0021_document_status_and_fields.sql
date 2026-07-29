-- Gamburg CRM - documents per the client's screen spec: status tracks
-- document *correctness* (תקין/בתיקון/נדרש תיקון), not arrival - a
-- different axis than the previous pending/received/missing, so it's a
-- full replace rather than a rename. Also adds אחראי (responsible person)
-- and מסמך (a link to the actual file).

alter type public.document_status rename to document_status_old;
create type public.document_status as enum ('valid', 'in_correction', 'correction_needed');

alter table public.documents alter column status drop default;
alter table public.documents
  alter column status type public.document_status
  using (
    case status::text
      when 'received' then 'valid'
      else 'correction_needed'
    end
  )::public.document_status;
alter table public.documents alter column status set default 'correction_needed';

drop type public.document_status_old;

alter table public.documents
  add column responsible_id uuid references public.profiles (id),
  add column file_url text;

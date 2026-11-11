-- 48 · Declaración de uso de recursos, origen de los sprites y reclamaciones de propiedad intelectual
-- (corre este archivo completo en Supabase → SQL Editor)

alter table public.vn_characters add column if not exists origin text not null default '';
alter table public.vn_characters add column if not exists credit text not null default '';
alter table public.vn_characters add column if not exists rights_ok_at timestamptz;

alter table public.vn_characters drop constraint if exists vn_characters_origin_ck;
alter table public.vn_characters add constraint vn_characters_origin_ck check (origin in ('', 'own', 'commission', 'licensed', 'ai', 'other') and length(credit) <= 200);

-- Reclamaciones de artistas y apelaciones de quien subió el recurso
create table if not exists public.ip_claims (
  id uuid primary key default gen_random_uuid(),
  by uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('claim', 'appeal')),
  link text not null default '' check (length(link) <= 400),
  message text not null check (length(message) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'removed', 'rejected', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.ip_claims enable row level security;
drop policy if exists ipc_ins on public.ip_claims;
create policy ipc_ins on public.ip_claims for insert to authenticated with check (by = auth.uid());
drop policy if exists ipc_sel on public.ip_claims;
create policy ipc_sel on public.ip_claims for select to authenticated using (by = auth.uid() or public.is_owner());
drop policy if exists ipc_upd on public.ip_claims;
create policy ipc_upd on public.ip_claims for update to authenticated using (public.is_owner()) with check (public.is_owner());
revoke delete on public.ip_claims from anon, authenticated;

-- máximo 5 reclamaciones abiertas por persona (evita abusos)
create or replace function public.ip_claim_guard() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.ip_claims where by = new.by and status = 'open') >= 5 then raise exception 'Ya tienes 5 reclamaciones abiertas'; end if;
  return new;
end $$;
drop trigger if exists trg_ip_claim_guard on public.ip_claims;
create trigger trg_ip_claim_guard before insert on public.ip_claims for each row execute function public.ip_claim_guard();

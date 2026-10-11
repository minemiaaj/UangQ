-- UangQ schema v2 (aman dijalankan ulang). Jalankan di Supabase: SQL Editor > New query > Run

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null,
  amount      numeric(16,2) not null,
  category    text not null,
  note        text,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

-- Batasan data (validasi di sisi server)
alter table public.transactions drop constraint if exists tx_type_chk;
alter table public.transactions drop constraint if exists tx_amount_chk;
alter table public.transactions drop constraint if exists tx_category_chk;
alter table public.transactions drop constraint if exists tx_note_chk;
alter table public.transactions add constraint tx_type_chk     check (type in ('income','expense'));
alter table public.transactions add constraint tx_amount_chk   check (amount > 0 and amount < 100000000000);
alter table public.transactions add constraint tx_category_chk check (char_length(category) between 1 and 60);
alter table public.transactions add constraint tx_note_chk     check (note is null or char_length(note) <= 300);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

-- Hak akses minimal: pengunjung anonim tidak punya akses sama sekali
revoke all on public.transactions from anon;
grant select, insert, update, delete on public.transactions to authenticated;

alter table public.transactions enable row level security;
alter table public.transactions force row level security;

drop policy if exists "baca data sendiri"   on public.transactions;
drop policy if exists "tambah data sendiri" on public.transactions;
drop policy if exists "ubah data sendiri"   on public.transactions;
drop policy if exists "hapus data sendiri"  on public.transactions;
drop policy if exists "wajib 2fa"           on public.transactions;

create policy "baca data sendiri"   on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "tambah data sendiri" on public.transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ubah data sendiri"   on public.transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "hapus data sendiri"  on public.transactions for delete to authenticated using ((select auth.uid()) = user_id);

-- WAJIB verifikasi 2 langkah: tanpa sesi AAL2, semua akses ditolak
create policy "wajib 2fa" on public.transactions as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- Jejak audit (hanya bisa ditambah oleh trigger, tidak bisa diubah/dihapus pengguna)
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  action     text not null,
  table_name text not null,
  row_id     uuid,
  at         timestamptz not null default now()
);
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
alter table public.audit_log enable row level security;
drop policy if exists "baca log sendiri" on public.audit_log;
drop policy if exists "wajib 2fa log"    on public.audit_log;
create policy "baca log sendiri" on public.audit_log for select to authenticated using ((select auth.uid()) = user_id);
create policy "wajib 2fa log" on public.audit_log as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

create or replace function public.log_tx() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log(user_id, action, table_name, row_id) values (old.user_id, tg_op, tg_table_name, old.id);
    return old;
  else
    insert into public.audit_log(user_id, action, table_name, row_id) values (new.user_id, tg_op, tg_table_name, new.id);
    return new;
  end if;
end $$;
revoke all on function public.log_tx() from public, anon, authenticated;

drop trigger if exists tx_audit on public.transactions;
create trigger tx_audit after insert or update or delete on public.transactions
  for each row execute function public.log_tx();

-- Realtime (abaikan error "already member" jika sudah aktif)
do $$ begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null; end $$;

-- OPSIONAL (keamanan maksimal): hanya email tertentu yang boleh mendaftar.
-- Hapus tanda komentar, ganti email, lalu jalankan.
-- create table if not exists public.allowed_emails(email text primary key);
-- insert into public.allowed_emails values ('emailanda@gmail.com') on conflict do nothing;
-- alter table public.allowed_emails enable row level security;   -- tanpa policy = tak bisa diakses klien
-- create or replace function public.only_allowed() returns trigger language plpgsql security definer set search_path = public as $$
-- begin
--   if not exists (select 1 from public.allowed_emails where lower(email) = lower(new.email)) then
--     raise exception 'Email tidak diizinkan';
--   end if;
--   return new;
-- end $$;
-- drop trigger if exists only_allowed_trg on auth.users;
-- create trigger only_allowed_trg before insert on auth.users for each row execute function public.only_allowed();

-- Tema jarak jauh: bucket publik "theme" (baca publik; unggah hanya lewat dashboard/pemilik proyek)
insert into storage.buckets (id, name, public) values ('theme', 'theme', true) on conflict (id) do nothing;

-- =====================================================================
-- v3: rekening (bank / dompet digital / tunai), transfer, saldo, impor CSV
-- Nomor rekening lengkap TIDAK disimpan; hanya 4 digit terakhir (opsional).
-- =====================================================================
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind            text not null,
  provider        text not null,
  name            text not null,
  last4           text,
  opening_balance numeric(16,2) not null default 0,
  source          text not null default 'manual',
  external_id     text,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.accounts drop constraint if exists acc_kind_chk;
alter table public.accounts drop constraint if exists acc_provider_chk;
alter table public.accounts drop constraint if exists acc_name_chk;
alter table public.accounts drop constraint if exists acc_last4_chk;
alter table public.accounts drop constraint if exists acc_open_chk;
alter table public.accounts drop constraint if exists acc_source_chk;
alter table public.accounts drop constraint if exists acc_ext_chk;
alter table public.accounts add constraint acc_kind_chk     check (kind in ('bank','ewallet','cash'));
alter table public.accounts add constraint acc_provider_chk check (char_length(provider) between 1 and 40);
alter table public.accounts add constraint acc_name_chk     check (char_length(name) between 1 and 40);
alter table public.accounts add constraint acc_last4_chk    check (last4 is null or last4 ~ '^[0-9]{4}$');
alter table public.accounts add constraint acc_open_chk     check (opening_balance > -100000000000 and opening_balance < 100000000000);
alter table public.accounts add constraint acc_source_chk   check (source in ('manual','aggregator'));
alter table public.accounts add constraint acc_ext_chk      check (external_id is null or char_length(external_id) <= 100);

revoke all on public.accounts from anon;
grant select, insert, update on public.accounts to authenticated;   -- tanpa DELETE: rekening diarsipkan, riwayat tetap utuh
alter table public.accounts enable row level security;
alter table public.accounts force row level security;
drop policy if exists "baca rekening sendiri"   on public.accounts;
drop policy if exists "tambah rekening sendiri" on public.accounts;
drop policy if exists "ubah rekening sendiri"   on public.accounts;
drop policy if exists "wajib 2fa rekening"      on public.accounts;
create policy "baca rekening sendiri"   on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy "tambah rekening sendiri" on public.accounts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ubah rekening sendiri"   on public.accounts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "wajib 2fa rekening" on public.accounts as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
drop trigger if exists acc_audit on public.accounts;
create trigger acc_audit after insert or update or delete on public.accounts for each row execute function public.log_tx();

-- Transaksi boleh ditautkan ke rekening; impor CSV memakai import_hash agar tidak dobel
alter table public.transactions add column if not exists account_id  uuid references public.accounts(id) on delete set null;
alter table public.transactions add column if not exists import_hash text;
create unique index if not exists tx_import_hash_uq on public.transactions (user_id, import_hash);
create index if not exists tx_account_idx on public.transactions (account_id);

drop policy if exists "tambah data sendiri" on public.transactions;
drop policy if exists "ubah data sendiri"   on public.transactions;
create policy "tambah data sendiri" on public.transactions for insert to authenticated
  with check ((select auth.uid()) = user_id
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))));
create policy "ubah data sendiri" on public.transactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))));

-- Transfer antar rekening
create table if not exists public.transfers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_account uuid not null references public.accounts(id),
  to_account   uuid not null references public.accounts(id),
  amount       numeric(16,2) not null,
  date         date not null default current_date,
  note         text,
  created_at   timestamptz not null default now()
);
alter table public.transfers drop constraint if exists tr_amount_chk;
alter table public.transfers drop constraint if exists tr_diff_chk;
alter table public.transfers drop constraint if exists tr_note_chk;
alter table public.transfers add constraint tr_amount_chk check (amount > 0 and amount < 100000000000);
alter table public.transfers add constraint tr_diff_chk   check (from_account <> to_account);
alter table public.transfers add constraint tr_note_chk   check (note is null or char_length(note) <= 300);
create index if not exists transfers_user_date_idx on public.transfers (user_id, date desc);

revoke all on public.transfers from anon;
grant select, insert, delete on public.transfers to authenticated;
alter table public.transfers enable row level security;
alter table public.transfers force row level security;
drop policy if exists "baca transfer sendiri"   on public.transfers;
drop policy if exists "tambah transfer sendiri" on public.transfers;
drop policy if exists "hapus transfer sendiri"  on public.transfers;
drop policy if exists "wajib 2fa transfer"      on public.transfers;
create policy "baca transfer sendiri" on public.transfers for select to authenticated using ((select auth.uid()) = user_id);
create policy "tambah transfer sendiri" on public.transfers for insert to authenticated
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.accounts a where a.id = from_account and a.user_id = (select auth.uid()))
    and exists (select 1 from public.accounts a where a.id = to_account   and a.user_id = (select auth.uid())));
create policy "hapus transfer sendiri" on public.transfers for delete to authenticated using ((select auth.uid()) = user_id);
create policy "wajib 2fa transfer" on public.transfers as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
drop trigger if exists tr_audit on public.transfers;
create trigger tr_audit after insert or update or delete on public.transfers for each row execute function public.log_tx();

-- Transfer + biaya admin (opsional) dalam satu langkah atomik; berjalan dengan hak pengguna (RLS tetap berlaku)
create or replace function public.make_transfer(p_from uuid, p_to uuid, p_amount numeric, p_fee numeric, p_date date, p_note text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  insert into public.transfers(from_account, to_account, amount, date, note)
  values (p_from, p_to, p_amount, coalesce(p_date, current_date), p_note) returning id into v_id;
  if coalesce(p_fee, 0) > 0 then
    insert into public.transactions(type, amount, category, note, date, account_id)
    values ('expense', p_fee, 'Biaya admin', 'Biaya transfer', coalesce(p_date, current_date), p_from);
  end if;
  return v_id;
end $$;
revoke all on function public.make_transfer(uuid, uuid, numeric, numeric, date, text) from public, anon;
grant execute on function public.make_transfer(uuid, uuid, numeric, numeric, date, text) to authenticated;

-- Saldo tiap rekening = saldo awal + pemasukan - pengeluaran + transfer masuk - transfer keluar
create or replace view public.account_balances with (security_invoker = true) as
select a.id, a.user_id,
  a.opening_balance
  + coalesce((select sum(case when t.type = 'income' then t.amount else -t.amount end) from public.transactions t where t.account_id = a.id), 0)
  + coalesce((select sum(x.amount) from public.transfers x where x.to_account = a.id), 0)
  - coalesce((select sum(x.amount) from public.transfers x where x.from_account = a.id), 0) as balance
from public.accounts a;
revoke all on public.account_balances from anon;
grant select on public.account_balances to authenticated;

do $$ begin alter publication supabase_realtime add table public.accounts;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.transfers; exception when duplicate_object then null; end $$;

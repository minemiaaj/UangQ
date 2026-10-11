-- Jalankan di Supabase: SQL Editor > New query > Run
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type in ('income','expense')),
  amount      numeric(16,2) not null check (amount > 0),
  category    text not null,
  note        text,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

alter table public.transactions enable row level security;

create policy "baca data sendiri"   on public.transactions for select using (auth.uid() = user_id);
create policy "tambah data sendiri" on public.transactions for insert with check (auth.uid() = user_id);
create policy "ubah data sendiri"   on public.transactions for update using (auth.uid() = user_id);
create policy "hapus data sendiri"  on public.transactions for delete using (auth.uid() = user_id);

-- Aktifkan sinkron realtime antar perangkat
alter publication supabase_realtime add table public.transactions;

-- BookCompass v2 Database Schema Migration
-- Workstreams A, C, D, F, G (Sections 1, 5.4, 8.2, 8.3)

-- 1. Reader Profiles Table (Workstream A & Section 8.2)
create table if not exists reader_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null,
  updated_at timestamptz default now()
);

alter table reader_profiles enable row level security;

create policy "own profile select" on reader_profiles for select using (user_id = auth.uid());
create policy "own profile insert" on reader_profiles for insert with check (user_id = auth.uid());
create policy "own profile update" on reader_profiles for update using (user_id = auth.uid());
create policy "own profile delete" on reader_profiles for delete using (user_id = auth.uid());

-- 2. User Chats Table Updates & RLS (Workstream D & Section 5.4)
alter table user_chats add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table user_chats add column if not exists messages jsonb default '[]'::jsonb;
alter table user_chats alter column user_id set default auth.uid();
alter table user_chats enable row level security;

create policy "own chats select" on user_chats for select using (user_id = auth.uid());
create policy "own chats insert" on user_chats for insert with check (user_id = auth.uid());
create policy "own chats update" on user_chats for update using (user_id = auth.uid());
create policy "own chats delete" on user_chats for delete using (user_id = auth.uid());

create index if not exists user_chats_user_id_updated_at_idx on user_chats (user_id, updated_at desc);

-- 3. Books Table Additions & Key Normalization (Workstream C & Section 8.3)
alter table books
  add column if not exists title_author_key text,
  add column if not exists sources text[] default '{}',
  add column if not exists heat_level text check (heat_level in ('clean','mild','steamy')),
  add column if not exists openlibrary_key text;

-- Deterministic normalization matching TypeScript normalizeTitleAuthorKey
update books set title_author_key = lower(regexp_replace(title || '|' || author, '[^a-zA-Z0-9|]+', '', 'g'))
where title_author_key is null;

create unique index if not exists books_title_author_key_idx on books (title_author_key);

create extension if not exists pgcrypto;
create table if not exists public.photo_downloads (
  photo_id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  storage_path text not null unique,
  status text not null default 'pending'
);
alter table public.photo_downloads add column if not exists status text not null default 'pending';
alter table public.photo_downloads drop constraint if exists photo_expiry_after_creation;
alter table public.photo_downloads add constraint photo_expiry_after_creation check (expires_at > created_at);
alter table public.photo_downloads drop constraint if exists photo_status_allowed;
alter table public.photo_downloads add constraint photo_status_allowed check (status in ('pending','ready','deleting'));
alter table public.photo_downloads drop constraint if exists photo_storage_path_shape;
alter table public.photo_downloads add constraint photo_storage_path_shape check (storage_path ~ '^photos/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.jpg$');
create index if not exists photo_downloads_expiry_status_idx on public.photo_downloads (expires_at,status);
create index if not exists photo_downloads_pending_idx on public.photo_downloads (created_at) where status='pending';
alter table public.photo_downloads enable row level security;
alter table public.photo_downloads force row level security;
revoke all on table public.photo_downloads from anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('photo-booth-private','photo-booth-private',false,4194304,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=4194304,allowed_mime_types=array['image/jpeg'];

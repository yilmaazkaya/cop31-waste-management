-- ═══════════════════════════════════════════════════════
-- İŞ TAKİBİ (GÖREV YÖNETİMİ) MODÜLÜ (v5)
-- Supabase SQL Editor'e yapıştırıp RUN deyin.
-- Mevcut verileri SİLMEZ.
-- ═══════════════════════════════════════════════════════

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title text not null,
  description text,
  assignee_id uuid references staff(id),
  assignee_name text,
  assigned_by text,                        -- atayan yönetici
  due_date date,                           -- termin
  priority text default 'orta',            -- dusuk / orta / yuksek
  status text default 'yapilacak',         -- yapilacak / devam / tamamlandi
  notify_email text,                       -- atanan kişinin e-postası (bildirim için)
  notified boolean default false,          -- e-posta gönderildi mi
  seen boolean default false,              -- atanan kişi gördü mü (uygulama içi rozet)
  active boolean default true
);

-- Personele e-posta alanı (bildirim için) — yoksa ekle
alter table staff add column if not exists email text;

alter table tasks enable row level security;
create policy "open_read"  on tasks for select using (true);
create policy "open_write" on tasks for insert with check (true);
create policy "open_upd"   on tasks for update using (true);

-- ═══════════════════════════════════════════════════════
-- İŞ TAKİBİ — GELİŞMİŞ (v6): yorum, dosya, kontrol listesi, onay
-- Supabase SQL Editor'e yapıştırıp RUN deyin. Mevcut veriyi SİLMEZ.
-- (schema_tasks.sql daha önce çalıştırılmış olmalı.)
-- ═══════════════════════════════════════════════════════

-- tasks tablosuna yeni alanlar
alter table tasks add column if not exists checklist text;      -- JSON: [{text, done}]
alter table tasks add column if not exists approved_by text;    -- onaylayan yönetici
alter table tasks add column if not exists approved_at timestamptz;
alter table tasks add column if not exists reject_note text;     -- revize gerekçesi

-- Görev yorumları (ileri-geri iletişim)
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  task_id uuid references tasks(id) on delete cascade,
  author text not null,
  is_admin boolean default false,
  body text,
  file_url text,        -- yoruma iliştirilen dosya (opsiyonel)
  file_name text,
  active boolean default true
);

alter table task_comments enable row level security;
create policy "open_read"  on task_comments for select using (true);
create policy "open_write" on task_comments for insert with check (true);
create policy "open_upd"   on task_comments for update using (true);

-- Görev dosyaları için depo (fotoğraf + her tür belge)
insert into storage.buckets (id, name, public) values ('gorev', 'gorev', true)
on conflict (id) do nothing;

create policy "gorev_up"   on storage.objects for insert with check (bucket_id = 'gorev');
create policy "gorev_read" on storage.objects for select using (bucket_id = 'gorev');

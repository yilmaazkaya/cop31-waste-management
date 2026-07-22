-- ═══════════════════════════════════════════════════════
-- COP31 ATIK YÖNETİM SİSTEMİ — VERİTABANI ŞEMASI
-- Supabase SQL Editor'e yapıştırıp RUN deyin.
-- ═══════════════════════════════════════════════════════

-- Personel
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  role text not null,
  shift text,
  phone text,
  pin text not null default '0000',      -- giriş kodu (4 hane)
  is_admin boolean default false,
  active boolean default true
);

-- Temizlik kayıtları
create table if not exists clean_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  zone text not null,
  staff_id uuid references staff(id),
  staff_name text,
  action text not null,                  -- Giriş / Çıkış
  notes text,
  active boolean default true
);

-- Atık kayıtları
create table if not exists waste_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  zone text not null,
  type text not null,
  amount numeric not null,
  destination text not null,
  facility_license text,                 -- lisanslı tesis çevre lisans no
  uatf_no text,                          -- Ulusal Atık Taşıma Formu no (tehlikeli atıkta zorunlu)
  vehicle text,
  km numeric default 0,                  -- taşıma mesafesi (karbon hesabı için)
  photo_url text,                        -- kantar fişi / kanıt fotoğrafı
  staff_name text,
  active boolean default true
);

-- Olay bildirimleri
create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  zone text not null,
  severity text not null,
  description text not null,
  status text default 'Açık',
  photo_url text,
  staff_name text,
  active boolean default true
);

-- Görev atamaları (bölge sorumluluğu + hedef sıklık)
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  zone text not null,
  staff_id uuid references staff(id),
  staff_name text,
  freq_hours numeric default 4,          -- kaç saatte bir temizlenmeli (SLA)
  active boolean default true
);

-- Hedefler (ISO 20121 hedef-gerçekleşen takibi)
create table if not exists targets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  key text unique not null,              -- recycle_rate, max_landfill_kg, max_carbon_kg
  value numeric not null,
  label text
);

insert into targets (key, value, label) values
  ('recycle_rate', 75, 'Geri dönüşüm oranı hedefi (%)'),
  ('max_landfill_kg', 500, 'Günlük azami düzenli depolama (kg)'),
  ('max_carbon_kg', 300, 'Günlük azami karbon (kg CO2e)')
on conflict (key) do nothing;

-- Denetim izi
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_name text,
  action text,
  table_name text,
  record_id text,
  detail text
);

-- İlk yönetici (girişte PIN: 1907 — sonra değiştirin)
insert into staff (name, role, shift, pin, is_admin)
values ('Yönetici', 'Saha Sorumlusu', 'Tam gün', '1907', true);

-- ═══ ERİŞİM (RLS) ═══
-- Prototip aşaması: anon anahtarla okuma/yazma açık.
-- Canlı kullanımda Supabase Auth'a geçilmesi önerilir.
alter table staff enable row level security;
alter table clean_logs enable row level security;
alter table waste_logs enable row level security;
alter table incidents enable row level security;
alter table assignments enable row level security;
alter table targets enable row level security;
alter table audit_log enable row level security;

create policy "open_read"  on staff for select using (true);
create policy "open_write" on staff for insert with check (true);
create policy "open_upd"   on staff for update using (true);
create policy "open_read"  on clean_logs for select using (true);
create policy "open_write" on clean_logs for insert with check (true);
create policy "open_upd"   on clean_logs for update using (true);
create policy "open_read"  on waste_logs for select using (true);
create policy "open_write" on waste_logs for insert with check (true);
create policy "open_upd"   on waste_logs for update using (true);
create policy "open_read"  on incidents for select using (true);
create policy "open_write" on incidents for insert with check (true);
create policy "open_upd"   on incidents for update using (true);
create policy "open_read"  on assignments for select using (true);
create policy "open_write" on assignments for insert with check (true);
create policy "open_upd"   on assignments for update using (true);
create policy "open_read"  on targets for select using (true);
create policy "open_upd"   on targets for update using (true);
create policy "open_read"  on audit_log for select using (true);
create policy "open_write" on audit_log for insert with check (true);

-- ═══ FOTOĞRAF DEPOSU ═══
insert into storage.buckets (id, name, public) values ('kanit', 'kanit', true)
on conflict (id) do nothing;

create policy "kanit_up"   on storage.objects for insert with check (bucket_id = 'kanit');
create policy "kanit_read" on storage.objects for select using (bucket_id = 'kanit');

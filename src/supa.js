import { createClient } from "@supabase/supabase-js";

/* Supabase ayarları Vercel'de Environment Variables olarak girilir:
   VITE_SUPABASE_URL  ve  VITE_SUPABASE_ANON_KEY
   Girilmemişse sistem yerel modda (sadece bu tarayıcı) çalışır. */

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supa = URL_ && KEY_ ? createClient(URL_, KEY_) : null;
export const isOnline = !!supa;

/* ── Genel veri katmanı: tablo bazlı oku/yaz, çevrimdışıysa localStorage ── */

const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export async function fetchAll(table) {
  if (!supa) return lsGet("cop31_" + table);
  const { data, error } = await supa.from(table).select("*").order("created_at", { ascending: true });
  if (error) { console.error(table, error); return []; }
  return data || [];
}

export async function insertRow(table, row, user) {
  if (!supa) {
    const all = lsGet("cop31_" + table);
    const r = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    lsSet("cop31_" + table, [...all, r]);
    return r;
  }
  const { data, error } = await supa.from(table).insert(row).select().single();
  if (error) { console.error(table, error); alert("Kayıt hatası: " + error.message); return null; }
  await audit(user, "EKLE", table, data?.id, row);
  return data;
}

export async function updateRow(table, id, patch, user) {
  if (!supa) {
    const all = lsGet("cop31_" + table).map(r => r.id === id ? { ...r, ...patch } : r);
    lsSet("cop31_" + table, all);
    return true;
  }
  const { error } = await supa.from(table).update(patch).eq("id", id);
  if (error) { console.error(table, error); return false; }
  await audit(user, "GÜNCELLE", table, id, patch);
  return true;
}

/* Silme yok — denetim izi için pasifleştirme (soft delete) */
export async function deactivateRow(table, id, user) {
  return updateRow(table, id, { active: false }, user);
}

/* KALICI SİLME — yalnız deneme aşaması için. Canlıya geçişte
   uygulamadan kaldırılır (denetim izi ilkesi gereği). */
export async function hardDeleteRow(table, id, user) {
  if (!supa) {
    const all = lsGet("cop31_" + table).filter(r => r.id !== id);
    lsSet("cop31_" + table, all);
    return true;
  }
  const { error } = await supa.from(table).delete().eq("id", id);
  if (error) { console.error(table, error); alert("Silme hatası: " + error.message); return false; }
  await audit(user, "KALICI_SİL", table, id, {});
  return true;
}

async function audit(user, action, table, recordId, detail) {
  if (!supa) return;
  await supa.from("audit_log").insert({
    user_name: user || "bilinmiyor", action, table_name: table,
    record_id: String(recordId || ""), detail: JSON.stringify(detail).slice(0, 2000),
  });
}

/* ── Fotoğraf yükleme (Supabase Storage 'kanit' bucket) ── */
export async function uploadPhoto(file) {
  if (!supa || !file) return null;
  const small = await shrink(file, 900, 0.7);
  const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supa.storage.from("kanit").upload(path, small, { contentType: "image/jpeg" });
  if (error) { console.error(error); alert("Fotoğraf yüklenemedi: " + error.message); return null; }
  const { data } = supa.storage.from("kanit").getPublicUrl(path);
  return data?.publicUrl || null;
}

function shrink(file, maxW, q) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = img.width * scale; c.height = img.height * scale;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => res(b), "image/jpeg", q);
    };
    img.src = URL.createObjectURL(file);
  });
}

/* ── Karbon emisyon faktörleri (kg CO2e / kg atık) ──
   Kaynak: yaklaşık DEFRA/EPA WARM değerleri; kesin raporlama için
   resmi ulusal faktörlerle güncellenmelidir. */
export const EMISSION = {
  "Geri Dönüşüm Tesisi": 0.021,
  "Kompost Alanı": 0.010,
  "Düzenli Depolama": 0.467,
  "Tehlikeli Atık Deposu": 0.250,
  "Geçici Depo": 0.0,
  TRANSPORT_PER_TON_KM: 0.107, // kg CO2e / ton-km (orta boy kamyon)
};

export function carbonOf(w) {
  const disposal = (EMISSION[w.destination] ?? 0) * (w.amount || 0);
  const transport = ((w.km || 0) * (w.amount || 0) / 1000) * EMISSION.TRANSPORT_PER_TON_KM;
  return disposal + transport;
}

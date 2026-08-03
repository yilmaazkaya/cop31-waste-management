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

/* Dosya boyut sınırları (deponuz şişmesin diye).
   Resimler zaten küçültülür; belgeler olduğu gibi yüklenir, o yüzden sınırlı. */
export const FILE_LIMITS = {
  IMAGE_MAX_MB: 15,      // yükleme öncesi ham resim üst sınırı (küçültülecek)
  DOC_MAX_MB: 10,        // belge (PDF/Word/Excel…) üst sınırı
  IMG_MAX_WIDTH: 1200,   // küçültme genişliği
  IMG_QUALITY: 0.65,     // sıkıştırma (0-1)
};

/* Her tür dosya yükleme (görev ekleri: PDF, Word, Excel, resim…).
   Resimse küçültülüp sıkıştırılır; belge boyut sınırını aşarsa reddedilir. */
export async function uploadFile(file, bucket = "gorev") {
  if (!supa || !file) return null;
  const isImg = file.type.startsWith("image/");
  const mb = file.size / (1024 * 1024);

  if (isImg && mb > FILE_LIMITS.IMAGE_MAX_MB) {
    alert(`Fotoğraf çok büyük (${mb.toFixed(1)} MB). En fazla ${FILE_LIMITS.IMAGE_MAX_MB} MB olmalı.`);
    return null;
  }
  if (!isImg && mb > FILE_LIMITS.DOC_MAX_MB) {
    alert(`Belge çok büyük (${mb.toFixed(1)} MB). En fazla ${FILE_LIMITS.DOC_MAX_MB} MB olmalı.`);
    return null;
  }

  const body = isImg ? await shrink(file, FILE_LIMITS.IMG_MAX_WIDTH, FILE_LIMITS.IMG_QUALITY) : file;
  const safe = (file.name || "dosya").replace(/[^\w.\-]/g, "_").slice(-60);
  const path = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safe}`;
  const { error } = await supa.storage.from(bucket).upload(path, body, {
    contentType: isImg ? "image/jpeg" : (file.type || "application/octet-stream"),
  });
  if (error) { console.error(error); alert("Dosya yüklenemedi: " + error.message); return null; }
  const { data } = supa.storage.from(bucket).getPublicUrl(path);
  return { url: data?.publicUrl || null, name: file.name || "dosya" };
}

/* Depo doluluk bilgisi (kanit + gorev bucket'larındaki toplam boyut).
   Ücretsiz Supabase planı 1 GB dosya alanı verir. */
export async function storageUsage() {
  if (!supa) return null;
  let total = 0, count = 0;
  for (const bucket of ["gorev", "kanit"]) {
    try {
      let offset = 0;
      while (true) {
        const { data, error } = await supa.storage.from(bucket).list("", { limit: 100, offset });
        if (error || !data || data.length === 0) break;
        for (const f of data) { total += f.metadata?.size || 0; count++; }
        if (data.length < 100) break;
        offset += 100;
      }
    } catch { /* bucket yoksa atla */ }
  }
  const limitBytes = 1024 * 1024 * 1024; // 1 GB
  return { bytes: total, count, limitBytes, percent: Math.min(100, (total / limitBytes) * 100) };
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

/* ── E-POSTA BİLDİRİMİ (Resend) ──
   Vercel'e VITE_RESEND_KEY girilirse görev atandığında e-posta gider.
   Girilmezse sessizce atlanır (uygulama içi bildirim yine çalışır).
   Not: Tarayıcıdan doğrudan Resend çağrısı CORS nedeniyle üretimde
   bir Vercel Serverless fonksiyonu (/api/send) üzerinden yapılmalıdır;
   bu fonksiyon o uç noktayı çağırır. */
export async function sendTaskEmail({ to, name, title, due, priority, assignedBy }) {
  if (!to) return false;
  try {
    const res = await fetch("/api/send-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, name, title, due, priority, assignedBy }),
    });
    return res.ok;
  } catch (e) {
    console.warn("E-posta bildirimi atlandı (uç nokta yok):", e.message);
    return false;
  }
}

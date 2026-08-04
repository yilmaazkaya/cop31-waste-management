// Vercel Serverless Function — Yönetici şifre sıfırlama
// Personelin şifresini yönetici belirler; e-posta gerekmez.
//
// Vercel'de tanımlanması gereken değişkenler:
//   SUPABASE_URL         → https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY → Supabase secret (service_role) anahtarı
//
// GÜVENLİK: service_role anahtarı yalnız burada (sunucuda) kullanılır,
// tarayıcıya asla gönderilmez. İstek yapan kişinin gerçekten yönetici
// olduğu, gönderdiği oturum jetonu Supabase'e doğrulatılarak kontrol edilir.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });

  const URL_ = process.env.SUPABASE_URL;
  const SERVICE = process.env.SUPABASE_SERVICE_KEY;
  if (!URL_ || !SERVICE) {
    return res.status(500).json({ error: "Sunucu ayarları eksik (SUPABASE_URL / SUPABASE_SERVICE_KEY)." });
  }

  const { accessToken, targetEmail, newPassword } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Oturum bulunamadı." });
  if (!targetEmail || !newPassword) return res.status(400).json({ error: "E-posta ve yeni şifre gerekli." });
  if (String(newPassword).length < 8) return res.status(400).json({ error: "Şifre en az 8 karakter olmalı." });

  try {
    // 1) İsteği yapan kişinin kimliğini doğrula
    const meRes = await fetch(`${URL_}/auth/v1/user`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) return res.status(401).json({ error: "Oturum geçersiz." });
    const me = await meRes.json();

    // 2) Bu kişi gerçekten yönetici mi? (staff tablosundan kontrol)
    const staffRes = await fetch(
      `${URL_}/rest/v1/staff?select=is_admin,name,email,auth_id&auth_id=eq.${me.id}`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    const staffRows = await staffRes.json();
    const isim = staffRows?.[0];
    if (!isim?.is_admin) return res.status(403).json({ error: "Bu işlem için yönetici yetkisi gerekir." });

    // 3) Hedef kullanıcıyı bul
    const listRes = await fetch(
      `${URL_}/auth/v1/admin/users?per_page=1000`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    const list = await listRes.json();
    const hedef = (list?.users || []).find(
      u => (u.email || "").toLowerCase() === String(targetEmail).toLowerCase()
    );
    if (!hedef) return res.status(404).json({ error: "Bu e-postayla giriş hesabı bulunamadı." });

    // 4) Şifreyi güncelle
    const updRes = await fetch(`${URL_}/auth/v1/admin/users/${hedef.id}`, {
      method: "PUT",
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: String(newPassword) }),
    });
    if (!updRes.ok) {
      const e = await updRes.json().catch(() => ({}));
      return res.status(500).json({ error: e?.msg || e?.message || "Şifre güncellenemedi." });
    }

    // 5) Denetim izine yaz
    await fetch(`${URL_}/rest/v1/audit_log`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_name: isim.name || "yönetici",
        action: "ŞİFRE_SIFIRLA",
        table_name: "auth.users",
        record_id: hedef.id,
        detail: JSON.stringify({ hedef: targetEmail }),
      }),
    }).catch(() => {});

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

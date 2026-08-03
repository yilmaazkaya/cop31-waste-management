// Vercel Serverless Function — görev atandığında e-posta gönderir.
// Resend kullanır. Vercel'e RESEND_KEY environment variable'ı girilmelidir.
// Girilmezse istek sessizce başarısız döner (uygulama içi bildirim yine çalışır).

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });

  const KEY = process.env.RESEND_KEY;
  if (!KEY) return res.status(200).json({ skipped: "RESEND_KEY yok" });

  const { to, name, title, due, priority, assignedBy } = req.body || {};
  if (!to) return res.status(400).json({ error: "alıcı yok" });

  const prLabel = { dusuk: "Düşük", orta: "Orta", yuksek: "Yüksek" }[priority] || priority || "";

  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e3e8e5;border-radius:12px;overflow:hidden">
      <div style="background:#1e6b45;color:#fff;padding:16px 20px;font-weight:700;font-size:16px">COP31 · Yeni görev atandı</div>
      <div style="padding:20px;color:#16241d">
        <p>Merhaba ${name || ""},</p>
        <p>Size yeni bir görev atandı:</p>
        <div style="background:#f4f6f5;border-radius:10px;padding:14px;margin:12px 0">
          <div style="font-weight:700;font-size:15px">${title || ""}</div>
          ${due ? `<div style="color:#5c6b63;font-size:13px;margin-top:4px">Termin: ${due}</div>` : ""}
          ${prLabel ? `<div style="color:#5c6b63;font-size:13px">Öncelik: ${prLabel}</div>` : ""}
        </div>
        <p style="color:#5c6b63;font-size:13px">Atayan: ${assignedBy || "Yönetici"}</p>
        <p style="font-size:13px">Görevi görmek için COP31 uygulamasına giriş yapın.</p>
      </div>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "COP31 <onboarding@resend.dev>", // kendi doğrulanmış alan adınızla değiştirin
        to: [to],
        subject: `Yeni görev: ${title || "COP31"}`,
        html,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data });
    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

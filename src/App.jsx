import { useState, useEffect, useMemo, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend, AreaChart, Area, LineChart, Line } from "recharts";
import { stilliExcelIndir } from "./excel.js";
import { supa, isOnline, fetchAll, insertRow, updateRow, deactivateRow, hardDeleteRow, uploadPhoto, uploadFile, storageUsage, FILE_LIMITS, carbonOf, EMISSION, sendTaskEmail,
  girisYap, cikisYap, oturumBilgisi, hesapOlustur, kullaniciAdiMusait, sifreDegistir, sifreSifirlaMaili, yoneticiSifreSifirla, MIN_SIFRE } from "./supa.js";

/* ═══════════ SABİTLER ═══════════ */
const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

/* DENEME MODU: true iken yöneticiye "kalıcı sil" ve "tüm deneme verisini
   temizle" düğmeleri görünür. Canlıya geçerken bunu false yapın —
   böylece kayıtlar yalnız pasifleştirilebilir (denetim izi korunur). */
const DENEME_MODU = true;

/* Bölgeler artık veritabanından gelir. Aşağıdaki liste yalnızca
   Supabase'e henüz zones tablosu eklenmemişse (yerel mod) yedektir. */
const FALLBACK_ZONES = [
  { code: "Z01", name: "Ana Konferans Salonu", area: "4.200 m²" },
  { code: "Z02", name: "Sergi Alanı A", area: "2.800 m²" },
  { code: "Z03", name: "Sergi Alanı B", area: "2.400 m²" },
  { code: "Z04", name: "Yemek Alanı", area: "1.600 m²" },
  { code: "Z05", name: "Medya Merkezi", area: "1.200 m²" },
  { code: "Z06", name: "VIP Lounge", area: "800 m²" },
  { code: "Z07", name: "Dış Alan / Bahçe", area: "5.000 m²" },
  { code: "Z08", name: "Otopark & Transfer", area: "3.500 m²" },
];

const WASTE_TYPES = [
  { id: "plastic", name: "Plastik", color: "#d94f3d" },
  { id: "paper", name: "Kağıt / Karton", color: "#2f6fb2" },
  { id: "organic", name: "Organik", color: "#3d8b4f" },
  { id: "glass", name: "Cam", color: "#7d5ba6" },
  { id: "metal", name: "Metal", color: "#c8862a" },
  { id: "electronic", name: "Elektronik", color: "#2a9d8f" },
  { id: "hazardous", name: "Tehlikeli", color: "#a02c2c" },
  { id: "mixed", name: "Karışık", color: "#6c757d" },
];

const DESTINATIONS = ["Geri Dönüşüm Tesisi", "Kompost Alanı", "Düzenli Depolama", "Tehlikeli Atık Deposu", "Geçici Depo"];
/* Görevler artık veritabanından gelir (job_roles). Aşağıdaki liste
   yalnızca tablo henüz kurulmadıysa (yerel mod) yedektir. */
const FALLBACK_ROLES = ["Temizlik", "Atık Toplama", "Denetim", "Araç Sürücü", "Saha Sorumlusu"];
/* Vardiyalar veritabanından gelir; bu liste yalnızca yedektir. */
const FALLBACK_SHIFTS = ["Tam gün", "Sabah (08-17)", "Akşam (17-01)", "Gece (01-08)"];

/* ── EKRANLAR ve YETKİ ──
   ALL_TABS: sistemdeki tüm ekranlar.
   ROLE_TABS: rol seçilince önerilen varsayılan ekranlar.
   Kişiye özel seçim yapılırsa (staff.permissions) o geçerli olur. */
const ALL_TABS = [
  { id: "dashboard", label: "Genel durum", desc: "Özet, grafikler, uyarılar" },
  { id: "istakip",   label: "İş Takibi",   desc: "Bana atanan görevler" },
  { id: "isanaliz",  label: "İş Analizi",  desc: "Görev istatistikleri ve grafikler" },
  { id: "saha",      label: "Saha kaydı",  desc: "QR ile giriş/çıkış" },
  { id: "atik",      label: "Atık girişi", desc: "Tür, kg, hedef, fotoğraf" },
  { id: "gorev",     label: "Görev atama", desc: "Bölge sorumlulukları, SLA" },
  { id: "olay",      label: "Arıza & Talep", desc: "Arıza bildirimi, takip, performans" },
  { id: "stok",      label: "Stok & Malzeme", desc: "Stok durumu, sevk, tüketim analizi" },
  { id: "rapor",     label: "Rapor",       desc: "Özet + CSV dışa aktarım" },
  { id: "personel",  label: "Personel",    desc: "Ekip yönetimi", admin: true },
  { id: "bolge",     label: "Bölgeler",    desc: "Bölge ekle/düzenle", admin: true },
  { id: "qr",        label: "QR kodlar",   desc: "QR üret ve yazdır", admin: true },
  { id: "hedef",     label: "Hedefler",    desc: "ISO 20121 hedefleri", admin: true },
];

const ROLE_TABS = {
  "Temizlik":       ["saha", "istakip", "stok"],
  "Atık Toplama":   ["atik", "istakip", "stok"],
  "Araç Sürücü":    ["atik", "istakip"],
  "Denetim":        ["dashboard", "istakip", "isanaliz", "olay", "gorev", "rapor"],
  "Saha Sorumlusu": ["dashboard", "istakip", "isanaliz", "saha", "atik", "gorev", "olay", "stok", "rapor"],
};

/* Bir kullanıcının görebileceği ekranları hesaplar. */
function allowedTabsFor(user) {
  if (user.is_admin) return ALL_TABS.map(t => t.id);
  let custom = null;
  try { custom = user.permissions ? JSON.parse(user.permissions) : null; } catch { custom = null; }
  const list = (Array.isArray(custom) && custom.length > 0) ? custom : (ROLE_TABS[user.role] || ["saha"]);
  // Yönetici ekranları kişiye özel seçimle bile açılamaz
  const adminOnly = ALL_TABS.filter(t => t.admin).map(t => t.id);
  return list.filter(id => !adminOnly.includes(id));
}

const trDate = (iso) => new Date(iso).toLocaleDateString("tr-TR");
const trTime = (iso) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const isToday = (iso) => trDate(iso) === new Date().toLocaleDateString("tr-TR");

/* ═══════════ TASARIM ═══════════ */
const T = {
  bg: "#f4f6f5", surface: "#ffffff", ink: "#16241d", sub: "#5c6b63", faint: "#8b988f",
  line: "#e3e8e5", green: "#1e6b45", greenSoft: "#e6f2ec", amber: "#b07d1e", amberSoft: "#faf3e3",
  red: "#b03030", redSoft: "#fbeaea", blue: "#2f6fb2", blueSoft: "#e9f1f9",
};
/* ── Ekran genişliği takibi (mobil uyum) ── */
function useIsMobile(esik = 820) {
  const [mobil, setMobil] = useState(
    typeof window !== "undefined" ? window.innerWidth < esik : false
  );
  useEffect(() => {
    const kontrol = () => setMobil(window.innerWidth < esik);
    window.addEventListener("resize", kontrol);
    window.addEventListener("orientationchange", kontrol);
    kontrol();
    return () => {
      window.removeEventListener("resize", kontrol);
      window.removeEventListener("orientationchange", kontrol);
    };
  }, [esik]);
  return mobil;
}

const S = {
  card: { background: T.surface, borderRadius: 14, border: `1px solid ${T.line}`, padding: "clamp(14px, 3.5vw, 22px)", marginBottom: 14 },
  h2: { fontFamily: "'Sora', sans-serif", fontSize: 17, fontWeight: 700, color: T.ink, marginBottom: 4 },
  sub: { fontSize: 13, color: T.sub, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 600, color: T.sub, marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: 0.4 },
  input: { width: "100%", padding: "12px 13px", borderRadius: 10, border: `1.5px solid ${T.line}`, background: "#fbfcfb", color: T.ink, fontSize: 16, marginBottom: 14, outline: "none", boxSizing: "border-box", fontFamily: "'Inter', sans-serif", maxWidth: "100%" },
  btn: { padding: "12px 20px", borderRadius: 10, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Inter', sans-serif", minHeight: 42, whiteSpace: "nowrap" },
  btnGreen: { background: T.green, color: "#fff" },
  btnGhost: { background: "transparent", color: T.sub, border: `1.5px solid ${T.line}` },
  btnRed: { background: T.red, color: "#fff" },
  tag: (bg, fg) => ({ display: "inline-block", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: bg, color: fg }),
  tooltip: { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 12.5, boxShadow: "0 4px 16px rgba(22,36,29,.08)" },
};

/* ═══════════ KÖK: GİRİŞ + UYGULAMA ═══════════ */
export default function Root() {
  const [user, setUser] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  /* Açılışta mevcut oturumu kontrol et; personel kaydıyla eşleştir */
  const oturumYukle = useCallback(async () => {
    if (!isOnline) {
      // Yerel mod: Supabase yoksa kimlik doğrulama yapılamaz
      setYukleniyor(false);
      return;
    }
    const authUser = await oturumBilgisi();
    if (!authUser) { setUser(null); setYukleniyor(false); return; }
    const kayitlar = await fetchAll("staff");
    const kisi = kayitlar.find(s => s.active !== false &&
      (s.auth_id === authUser.id || (s.email || "").toLowerCase() === (authUser.email || "").toLowerCase()));
    if (!kisi) {
      // Auth hesabı var ama personel kaydı yok
      await cikisYap();
      setUser(null); setYukleniyor(false);
      alert("Bu hesap için personel kaydı bulunamadı. Yöneticinize başvurun.");
      return;
    }
    setUser({ id: kisi.id, name: kisi.name, role: kisi.role, department: kisi.department,
      email: kisi.email, is_admin: !!kisi.is_admin, permissions: kisi.permissions || null });
    setYukleniyor(false);
  }, []);

  useEffect(() => { oturumYukle(); }, [oturumYukle]);

  const logout = async () => { await cikisYap(); setUser(null); };

  if (yukleniyor) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.sub, fontSize: 14 }}>
        Yükleniyor…
      </div>
    );
  }
  return user ? <App user={user} logout={logout} /> : <Login onGiris={oturumYukle} />;
}

/* ═══════════ GİRİŞ EKRANI ═══════════ */
function Login({ onGiris }) {
  const [email, setEmail] = useState("");   // kullanıcı adı (veya e-posta)
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState(false);
  const [unuttum, setUnuttum] = useState(false);
  const [bilgi, setBilgi] = useState("");

  const gir = async () => {
    if (!email.trim() || !sifre) { setHata("Kullanıcı adı ve şifre girin."); return; }
    setBusy(true); setHata("");
    const r = await girisYap(email, sifre);
    setBusy(false);
    if (r.hata) { setHata(r.hata); return; }
    onGiris();
  };

  const sifirla = async () => {
    if (!email.trim() || !email.includes("@")) { setHata("Sıfırlama için e-posta adresinizi yazın."); return; }
    setBusy(true); setHata(""); setBilgi("");
    const r = await sifreSifirlaMaili(email);
    setBusy(false);
    if (r.hata) setHata(r.hata);
    else { setBilgi("Sıfırlama bağlantısı e-postanıza gönderildi."); setUnuttum(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ ...S.card, maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 18 }}>
          <img src="/cop31.jpg" alt="COP31 Türkiye Antalya" style={{ height: 82, width: "auto", objectFit: "contain" }} />
          <div style={{ width: 1, height: 52, background: T.line }} />
          <img src="/abm.jpg" alt="ABM Grup" style={{ height: 40, width: "auto", objectFit: "contain" }} />
        </div>
        <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 20, color: T.ink }}>Atık Yönetim Sistemi</div>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 22 }}>COP31 · Antalya · Kasım 2026</div>

        {!isOnline ? (
          <div style={{ fontSize: 13.5, color: T.amber, background: T.amberSoft, borderRadius: 10, padding: 14, textAlign: "left", lineHeight: 1.6 }}>
            Sistem merkezi veritabanına bağlı değil. Giriş yapılamaz.
            Vercel'de <b>VITE_SUPABASE_URL</b> ve <b>VITE_SUPABASE_ANON_KEY</b> tanımlı olmalıdır.
          </div>
        ) : (
          <>
            <div style={{ textAlign: "left" }}>
              <label style={S.label}>{unuttum ? "E-posta adresiniz" : "Kullanıcı adı"}</label>
              <input style={S.input} type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
                placeholder={unuttum ? "ornek@sirket.com" : "kullanici.adi"}
                value={email} onChange={e => { setEmail(e.target.value); setHata(""); }}
                onKeyDown={e => e.key === "Enter" && (unuttum ? sifirla() : gir())} />
              {!unuttum && (
                <>
                  <label style={S.label}>Şifre</label>
                  <input style={S.input} type="password" autoComplete="current-password" placeholder="••••••••"
                    value={sifre} onChange={e => { setSifre(e.target.value); setHata(""); }}
                    onKeyDown={e => e.key === "Enter" && gir()} />
                </>
              )}
            </div>

            {hata && <div style={{ color: T.red, fontSize: 13, marginBottom: 10, textAlign: "left" }}>{hata}</div>}
            {bilgi && <div style={{ color: T.green, fontSize: 13, marginBottom: 10, textAlign: "left" }}>{bilgi}</div>}

            {unuttum ? (
              <>
                <button onClick={sifirla} disabled={busy} style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: busy ? 0.5 : 1 }}>
                  {busy ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
                </button>
                <button onClick={() => { setUnuttum(false); setHata(""); }} style={{ ...S.btn, ...S.btnGhost, width: "100%", marginTop: 8 }}>
                  Geri dön
                </button>
              </>
            ) : (
              <>
                <button onClick={gir} disabled={busy} style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: busy ? 0.5 : 1 }}>
                  {busy ? "Giriş yapılıyor…" : "Giriş yap"}
                </button>
                <button onClick={() => { setUnuttum(true); setHata(""); setBilgi(""); }}
                  style={{ ...S.btn, background: "transparent", color: T.sub, fontSize: 12.5, marginTop: 10 }}>
                  Şifremi unuttum
                </button>
                <div style={{ fontSize: 11.5, color: T.faint, marginTop: 4 }}>
                  Şifrenizi yöneticiniz de sıfırlayabilir.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
function App({ user, logout }) {
  const [tab, setTab] = useState("dashboard");
  const [staff, setStaff] = useState([]);
  const [cleanLogs, setCleanLogs] = useState([]);
  const [wasteLogs, setWasteLogs] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [targets, setTargets] = useState([]);
  const [zones, setZones] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [roles, setRoles] = useState([]);
  const [depts, setDepts] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [ticketCats, setTicketCats] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [stockMoves, setStockMoves] = useState([]);
  const [qrZone, setQrZone] = useState(null);
  const mobil = useIsMobile();
  const [menuAcik, setMenuAcik] = useState(false);
  /* Mobil üst çubuktaki bildirim rozeti */
  const bekleyenGorev = tasks.filter(t => t.assignee_id === user.id && !t.seen && t.status !== "tamamlandi").length;
  const [sifreModal, setSifreModal] = useState(false);
  const [yeniSifre, setYeniSifre] = useState("");
  const [yeniSifre2, setYeniSifre2] = useState("");
  const [sifreMsg, setSifreMsg] = useState("");

  const reload = useCallback(async () => {
    const [s, c, w, i, a, t, z, tk, jr, dp, sh, tc, si, sm] = await Promise.all([
      fetchAll("staff"), fetchAll("clean_logs"), fetchAll("waste_logs"),
      fetchAll("incidents"), fetchAll("assignments"), fetchAll("targets"),
      fetchAll("zones"), fetchAll("tasks"), fetchAll("job_roles"), fetchAll("departments"),
      fetchAll("shifts"), fetchAll("ticket_categories"),
      fetchAll("stock_items"), fetchAll("stock_moves"),
    ]);
    setStaff(s.filter(x => x.active !== false));
    setCleanLogs(c.filter(x => x.active !== false));
    setWasteLogs(w.filter(x => x.active !== false));
    setIncidents(i.filter(x => x.active !== false));
    setAssignments(a.filter(x => x.active !== false));
    setTargets(t);
    setTasks(tk.filter(x => x.active !== false));
    const jrActive = jr.filter(x => x.active !== false);
    setRoles(jrActive.length > 0 ? jrActive : FALLBACK_ROLES.map(n => ({ name: n })));
    setDepts(dp.filter(x => x.active !== false));
    setShifts(sh.filter(x => x.active !== false));
    setTicketCats(tc.filter(x => x.active !== false));
    setStockItems(si.filter(x => x.active !== false));
    setStockMoves(sm);
    // Bölgeleri normalize et: her kayıtta id = code olsun (eski kod uyumu için).
    // zones tablosu yoksa (yerel mod / eski kurulum) yedek listeye düş.
    const zActive = z.filter(x => x.active !== false);
    const zNorm = zActive.length > 0
      ? zActive.map(x => ({ ...x, dbId: x.id, id: x.code })).sort((a, b) => a.code.localeCompare(b.code))
      : FALLBACK_ZONES.map(x => ({ ...x, id: x.code }));
    setZones(zNorm);
  }, []);

  useEffect(() => {
    reload();
    const p = new URLSearchParams(window.location.search).get("zone");
    if (p) { setQrZone(p); setTab("saha"); }
    const iv = setInterval(reload, 30000); // 30 sn'de bir yenile (canlı görünüm)
    return () => clearInterval(iv);
  }, [reload]);

  /* Kullanıcının görebileceği ekranlar: kişiye özel seçim varsa o,
     yoksa rolün varsayılanı. Yönetici hepsini görür. */
  const allowed = allowedTabsFor(user);
  const NAV = ALL_TABS.filter(t => allowed.includes(t.id));

  const ctx = { user, staff, zones, tasks, roles, depts, shifts, ticketCats, stockItems, stockMoves, cleanLogs, wasteLogs, incidents, assignments, targets, reload, qrZone };

  // Kullanıcının erişimi olmayan bir sekmedeyse ilk izinli sekmeye düş
  useEffect(() => {
    if (!allowed.includes(tab)) setTab(allowed[0] || "saha");
  }, [tab, user.role, user.is_admin]); // eslint-disable-line

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex" }}>
      {/* MOBİLDE ÜST ÇUBUK */}
      {mobil && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 56, zIndex: 120,
          background: T.surface, borderBottom: `1px solid ${T.line}`,
          display: "flex", alignItems: "center", gap: 10, padding: "0 12px",
        }}>
          <button onClick={() => setMenuAcik(true)} aria-label="Menü" style={{
            ...S.btn, padding: "8px 12px", fontSize: 20, lineHeight: 1,
            background: T.greenSoft, color: T.green,
          }}>☰</button>
          <img src="/cop31.jpg" alt="COP31" style={{ height: 34, width: "auto", objectFit: "contain" }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 13, color: T.ink, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {NAV.find(n => n.id === tab)?.label || "Atık Yönetimi"}
            </div>
            <div style={{ fontSize: 10.5, color: T.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
          </div>
          {bekleyenGorev > 0 && (
            <span style={{ background: T.red, color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 999, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{bekleyenGorev}</span>
          )}
        </div>
      )}

      {/* Mobil menü arka planı */}
      {mobil && menuAcik && (
        <div onClick={() => setMenuAcik(false)} style={{ position: "fixed", inset: 0, background: "rgba(22,36,29,.45)", zIndex: 130 }} />
      )}

      {/* SOL KENAR ÇUBUĞU / MOBİL ÇEKMECE */}
      <aside style={mobil ? {
        width: 260, background: T.surface, borderRight: `1px solid ${T.line}`,
        display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, left: 0,
        zIndex: 140, transform: menuAcik ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .22s ease", boxShadow: menuAcik ? "0 0 30px rgba(0,0,0,.18)" : "none",
      } : {
        width: 220, background: T.surface, borderRight: `1px solid ${T.line}`,
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0,
      }}>
        {/* Logolar */}
        <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${T.line}`, position: "relative" }}>
          {mobil && (
            <button onClick={() => setMenuAcik(false)} aria-label="Kapat" style={{
              ...S.btn, position: "absolute", top: 8, right: 8, padding: "4px 10px",
              fontSize: 16, background: "transparent", color: T.faint,
            }}>×</button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
            <img src="/cop31.jpg" alt="COP31 Türkiye Antalya" style={{ height: 52, width: "auto", objectFit: "contain" }} />
            <div style={{ width: 1, height: 34, background: T.line, flexShrink: 0 }} />
            <img src="/abm.jpg" alt="ABM Grup" style={{ height: 28, width: "auto", objectFit: "contain" }} />
          </div>
        </div>

        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 14, color: T.ink, lineHeight: 1.2 }}>Atık Yönetimi</div>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user.name} · <span style={{ color: isOnline ? T.green : T.amber }}>{isOnline ? "çevrimiçi" : "yerel mod"}</span>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: 10, overflowY: "auto", flex: 1 }}>
          {NAV.map(n => {
            const badge = n.id === "istakip"
              ? tasks.filter(t => t.assignee_id === user.id && !t.seen && t.status !== "tamamlandi").length
              : 0;
            return (
              <button key={n.id} onClick={() => { setTab(n.id); setMenuAcik(false); }} style={{
                ...S.btn, padding: mobil ? "13px 14px" : "10px 14px", fontSize: 14, textAlign: "left",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                background: tab === n.id ? T.greenSoft : "transparent",
                color: tab === n.id ? T.green : T.sub, fontWeight: tab === n.id ? 700 : 500,
              }}>
                <span>{n.label}</span>
                {badge > 0 && (
                  <span style={{ background: T.red, color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: 10, borderTop: `1px solid ${T.line}` }}>
          <button onClick={() => setSifreModal(true)} title="Şifremi değiştir" style={{
            ...S.btn, padding: "10px 14px", fontSize: 13, textAlign: "left", width: "100%",
            background: "transparent", color: T.sub,
          }}>Şifre değiştir</button>
          <button onClick={logout} title="Oturumu kapat" style={{
            ...S.btn, padding: "10px 14px", fontSize: 13.5, textAlign: "left", width: "100%",
            background: "transparent", color: T.faint,
          }}>← Çıkış</button>
        </div>
      </aside>

      {sifreModal && (
        <div onClick={() => setSifreModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(22,36,29,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...S.card, maxWidth: 380, width: "100%", marginBottom: 0 }}>
            <div style={S.h2}>Şifre değiştir</div>
            <div style={S.sub}>Yeni şifreniz en az {MIN_SIFRE} karakter olmalıdır.</div>
            <label style={S.label}>Yeni şifre</label>
            <input style={S.input} type="password" autoComplete="new-password" value={yeniSifre}
              onChange={e => { setYeniSifre(e.target.value); setSifreMsg(""); }} />
            <label style={S.label}>Yeni şifre (tekrar)</label>
            <input style={S.input} type="password" autoComplete="new-password" value={yeniSifre2}
              onChange={e => { setYeniSifre2(e.target.value); setSifreMsg(""); }} />
            {sifreMsg && <div style={{ fontSize: 13, marginBottom: 10, color: sifreMsg.startsWith("✓") ? T.green : T.red }}>{sifreMsg}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={async () => {
                if (yeniSifre.length < MIN_SIFRE) { setSifreMsg(`Şifre en az ${MIN_SIFRE} karakter olmalı.`); return; }
                if (yeniSifre !== yeniSifre2) { setSifreMsg("Şifreler eşleşmiyor."); return; }
                const r = await sifreDegistir(yeniSifre);
                if (r.hata) setSifreMsg(r.hata);
                else { setSifreMsg("✓ Şifreniz değiştirildi."); setYeniSifre(""); setYeniSifre2(""); setTimeout(() => setSifreModal(false), 1500); }
              }} style={{ ...S.btn, ...S.btnGreen, flex: 1 }}>Kaydet</button>
              <button onClick={() => { setSifreModal(false); setYeniSifre(""); setYeniSifre2(""); setSifreMsg(""); }} style={{ ...S.btn, ...S.btnGhost }}>İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* İÇERİK */}
      <main style={{
        flex: 1, minWidth: 0, maxWidth: 1500, margin: "0 auto", width: "100%",
        padding: mobil ? "70px 12px 40px" : "26px 24px 60px",
      }}>
        {allowed.includes(tab) && (<>
          {tab === "dashboard" && <Dashboard {...ctx} />}
          {tab === "istakip" && <TaskManager {...ctx} />}
          {tab === "isanaliz" && <TaskAnalytics {...ctx} />}
          {tab === "saha" && <FieldEntry {...ctx} />}
          {tab === "atik" && <WasteEntry {...ctx} />}
          {tab === "gorev" && <Assignments {...ctx} />}
          {tab === "olay" && <Incidents {...ctx} />}
          {tab === "stok" && <StokYonetimi {...ctx} />}
          {tab === "rapor" && <Report {...ctx} />}
          {tab === "personel" && user.is_admin && <Personnel {...ctx} />}
          {tab === "bolge" && user.is_admin && <ZonesManager {...ctx} />}
          {tab === "qr" && user.is_admin && <QRManager {...ctx} />}
          {tab === "hedef" && user.is_admin && <Targets {...ctx} />}
        </>)}
      </main>
    </div>
  );
}

/* ── Departman / unvan filtre çubuğu (tüm ekranlarda ortak) ── */
function FilterBar({ depts = [], roles = [], dept, setDept, role, setRole, extra, note }) {
  const deptNames = depts.map(d => d.name);
  const roleNames = roles.map(r => r.name);
  const active = (dept && dept !== "hepsi") || (role && role !== "hepsi");
  return (
    <div style={{ ...S.card, padding: 14, marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: 0.4 }}>Filtre</span>
      {deptNames.length > 0 && (
        <select style={{ ...S.input, marginBottom: 0, width: "auto", minWidth: 160, padding: "8px 11px", fontSize: 13 }} value={dept} onChange={e => setDept(e.target.value)}>
          <option value="hepsi">Tüm departmanlar</option>
          {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
          <option value="__yok">— Departmansız —</option>
        </select>
      )}
      {roleNames.length > 0 && (
        <select style={{ ...S.input, marginBottom: 0, width: "auto", minWidth: 150, padding: "8px 11px", fontSize: 13 }} value={role} onChange={e => setRole(e.target.value)}>
          <option value="hepsi">Tüm görevler</option>
          {roleNames.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {extra}
      {active && (
        <button onClick={() => { setDept("hepsi"); setRole("hepsi"); }} style={{ ...S.btn, padding: "7px 13px", fontSize: 12.5, ...S.btnGhost }}>
          Temizle
        </button>
      )}
      {note && <span style={{ marginLeft: "auto", fontSize: 12, color: T.faint }}>{note}</span>}
    </div>
  );
}

/* Ad Soyad'dan kullanıcı adı önerir: "Ayşe Yılmaz" -> "ayse.yilmaz" */
function kullaniciAdiOner(adSoyad) {
  const tr = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u",
               "Ç": "c", "Ğ": "g", "İ": "i", "I": "i", "Ö": "o", "Ş": "s", "Ü": "u" };
  return (adSoyad || "")
    .split("").map(k => tr[k] ?? k).join("")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/).filter(Boolean)
    .join(".");
}

/* ── HİYERARŞİ ──
   Bir kişinin tüm astları (alt kademeler dahil). */
function astlariniBul(staff, kisiId, gorulen = new Set()) {
  const sonuc = [];
  const dogrudan = staff.filter(s => s.manager_id === kisiId);
  for (const a of dogrudan) {
    if (gorulen.has(a.id)) continue;   // döngü koruması
    gorulen.add(a.id);
    sonuc.push(a);
    sonuc.push(...astlariniBul(staff, a.id, gorulen));
  }
  return sonuc;
}

/* Kime görev atayabilir: yönetici herkese; diğerleri astlarına
   ve kendi departmanındaki kişilere. */
function atanabilirKisiler(staff, user) {
  if (user.is_admin) return staff;
  const astlar = astlariniBul(staff, user.id);
  const ayniDept = user.department
    ? staff.filter(s => s.department === user.department && s.id !== user.id)
    : [];
  const harita = new Map();
  [...astlar, ...ayniDept].forEach(s => harita.set(s.id, s));
  return [...harita.values()];
}

/* Görev geçmişine kayıt düşer */
async function gecmiseYaz(taskId, actor, action, detail) {
  try {
    await insertRow("task_history", { task_id: taskId, actor, action, detail: detail || null }, actor);
  } catch { /* geçmiş yazılamazsa işlem yine de sürsün */ }
}

/* Bir personelin filtreye uyup uymadığı */
function staffMatches(s, dept, role) {
  if (!s) return false;
  if (dept && dept !== "hepsi") {
    if (dept === "__yok") { if (s.department) return false; }
    else if (s.department !== dept) return false;
  }
  if (role && role !== "hepsi" && s.role !== role) return false;
  return true;
}

/* ═══════════ GENEL DURUM ═══════════ */
function Dashboard({ user, zones = [], cleanLogs, wasteLogs, incidents, targets, assignments }) {
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    if (user?.is_admin && isOnline) storageUsage().then(setUsage).catch(() => {});
  }, [user]);
  const todayWaste = wasteLogs.filter(w => isToday(w.created_at));
  const totalWaste = wasteLogs.reduce((s, w) => s + Number(w.amount), 0);
  const recycled = wasteLogs.filter(w => w.destination === "Geri Dönüşüm Tesisi").reduce((s, w) => s + Number(w.amount), 0);
  const rate = totalWaste > 0 ? Math.round((recycled / totalWaste) * 100) : 0;
  const carbon = wasteLogs.reduce((s, w) => s + carbonOf(w), 0);
  const openInc = incidents.filter(i => !["kapandi", "iptal"].includes(i.status)).length;

  const tRate = targets.find(t => t.key === "recycle_rate")?.value ?? 75;
  const tLandfill = targets.find(t => t.key === "max_landfill_kg")?.value ?? 500;
  const todayLandfill = todayWaste.filter(w => w.destination === "Düzenli Depolama").reduce((s, w) => s + Number(w.amount), 0);

  /* SLA gecikme kontrolü */
  const delays = assignments.map(a => {
    const last = cleanLogs.filter(c => c.zone === a.zone && c.action === "Çıkış").slice(-1)[0];
    const hoursSince = last ? (Date.now() - new Date(last.created_at)) / 3600000 : Infinity;
    return { ...a, hoursSince, late: hoursSince > Number(a.freq_hours || 4) };
  }).filter(d => d.late);

  const byType = WASTE_TYPES.map(t => ({
    name: t.name, value: wasteLogs.filter(w => w.type === t.id).reduce((s, w) => s + Number(w.amount), 0), color: t.color,
  })).filter(d => d.value > 0);

  const kpis = [
    { label: "Bugünkü temizlik", value: cleanLogs.filter(c => isToday(c.created_at)).length, unit: "kayıt", accent: T.green },
    { label: "Toplam atık", value: totalWaste.toLocaleString("tr-TR"), unit: "kg", accent: T.amber },
    { label: `Geri dönüşüm (hedef %${tRate})`, value: rate, unit: "%", accent: rate >= tRate ? T.green : T.red },
    { label: "Karbon ayak izi", value: carbon.toFixed(1), unit: "kg CO₂e", accent: T.blue },
    { label: "Açık olay", value: openInc, unit: "bildirim", accent: openInc > 0 ? T.red : T.faint },
  ];

  return (
    <div>
      {delays.length > 0 && (
        <div style={{ ...S.card, background: T.redSoft, borderColor: "#e5b8b8" }}>
          <div style={{ fontWeight: 700, color: T.red, fontSize: 14, marginBottom: 8 }}>⚠ Geciken temizlik görevleri</div>
          {delays.map(d => (
            <div key={d.id} style={{ fontSize: 13.5, color: T.ink, padding: "4px 0" }}>
              <b>{zones.find(z => z.id === d.zone)?.name || d.zone}</b> — sorumlu: {d.staff_name} — son temizlikten bu yana{" "}
              {d.hoursSince === Infinity ? "hiç kayıt yok" : `${d.hoursSince.toFixed(1)} saat geçti`} (hedef: {d.freq_hours} saat)
            </div>
          ))}
        </div>
      )}

      {todayLandfill > tLandfill && (
        <div style={{ ...S.card, background: T.amberSoft, borderColor: "#e5d5ab", fontSize: 13.5, color: "#7a5c17" }}>
          ⚠ Bugünkü düzenli depolama miktarı ({todayLandfill} kg) günlük hedefi ({tLandfill} kg) aştı.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...S.card, marginBottom: 0, padding: 18, borderTop: `3px solid ${k.accent}` }}>
            <div style={{ fontSize: 12, color: T.sub, fontWeight: 600, marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 28, fontWeight: 800, color: T.ink, lineHeight: 1 }}>
              {k.value}<span style={{ fontSize: 12.5, fontWeight: 500, color: T.faint, marginLeft: 5 }}>{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {usage && (
        <div style={{ ...S.card, borderTop: `3px solid ${usage.percent > 85 ? T.red : usage.percent > 60 ? T.amber : T.green}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={S.h2}>Dosya deposu</div>
              <div style={{ fontSize: 12.5, color: T.sub }}>{usage.count} dosya · {(usage.bytes / (1024 * 1024)).toFixed(1)} MB / 1024 MB</div>
            </div>
            <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: usage.percent > 85 ? T.red : usage.percent > 60 ? T.amber : T.green }}>
              %{usage.percent.toFixed(0)}
            </div>
          </div>
          <div style={{ height: 8, background: "#eef0ef", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${usage.percent}%`, height: "100%", background: usage.percent > 85 ? T.red : usage.percent > 60 ? T.amber : T.green }} />
          </div>
          {usage.percent > 85 && (
            <div style={{ fontSize: 12.5, color: T.red, marginTop: 8 }}>
              Depo dolmak üzere. Eski/kapanan görevlerin dosyalarını temizleyin veya planı yükseltin.
            </div>
          )}
        </div>
      )}

      {byType.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
          <div style={S.card}>
            <div style={S.h2}>Atık türü dağılımı</div>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={48} paddingAngle={2}>
                  {byType.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={S.tooltip} formatter={(v, n) => [`${v} kg`, n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={S.card}>
            <div style={S.h2}>Karbon dağılımı (bertaraf yöntemine göre)</div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={DESTINATIONS.map(d => ({
                name: d.split(" ")[0],
                co2: wasteLogs.filter(w => w.destination === d).reduce((s, w) => s + carbonOf(w), 0),
              })).filter(x => x.co2 > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.sub }} />
                <YAxis tick={{ fontSize: 11, fill: T.sub }} />
                <Tooltip contentStyle={S.tooltip} formatter={v => [`${v.toFixed(2)} kg CO₂e`]} />
                <Bar dataKey="co2" fill={T.blue} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ SAHA KAYDI ═══════════ */
function FieldEntry({ user, zones = [], cleanLogs, reload, qrZone }) {
  const [zone, setZone] = useState(qrZone || "");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(null);
  const zoneObj = zones.find(z => z.id === zone);

  const log = async (action) => {
    if (!zone) return;
    await insertRow("clean_logs", { zone, staff_id: user.id === "local-admin" ? null : user.id, staff_name: user.name, action, notes }, user.name);
    setDone(action); setNotes(""); reload();
    setTimeout(() => setDone(null), 2500);
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      {qrZone && zoneObj && (
        <div style={{ ...S.card, background: T.greenSoft, borderColor: T.green, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.green, textTransform: "uppercase", letterSpacing: 1 }}>QR ile giriş yapıldı</div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 22, fontWeight: 800, color: T.ink, margin: "6px 0 2px" }}>{zoneObj.name}</div>
          <div style={{ fontSize: 13, color: T.sub }}>{zoneObj.id} · {zoneObj.area}</div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.h2}>Saha kaydı</div>
        <div style={S.sub}>Kayıt <b>{user.name}</b> adına oluşturulur.</div>

        {!qrZone && (
          <>
            <label style={S.label}>Bölge</label>
            <select style={S.input} value={zone} onChange={e => setZone(e.target.value)}>
              <option value="">Seçin</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
            </select>
          </>
        )}

        <label style={S.label}>Not (isteğe bağlı)</label>
        <input style={S.input} placeholder="Örn: Konteyner %80 dolu" value={notes} onChange={e => setNotes(e.target.value)} />

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => log("Giriş")} disabled={!zone} style={{ ...S.btn, ...S.btnGreen, flex: 1, opacity: !zone ? 0.4 : 1 }}>Giriş kaydı</button>
          <button onClick={() => log("Çıkış")} disabled={!zone} style={{ ...S.btn, flex: 1, background: T.ink, color: "#fff", opacity: !zone ? 0.4 : 1 }}>Çıkış kaydı</button>
        </div>

        {done && <div style={{ marginTop: 14, padding: 13, borderRadius: 10, background: T.greenSoft, color: T.green, fontWeight: 600, fontSize: 14, textAlign: "center" }}>✓ {done} kaydı oluşturuldu</div>}
      </div>

      {cleanLogs.length > 0 && (
        <div style={S.card}>
          <div style={S.h2}>Son kayıtlar</div>
          <div style={{ marginTop: 10 }}>
            {cleanLogs.slice(-10).reverse().map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
                <span style={S.tag(l.action === "Giriş" ? T.blueSoft : T.greenSoft, l.action === "Giriş" ? T.blue : T.green)}>{l.action}</span>
                <span style={{ fontWeight: 600, color: T.ink }}>{l.staff_name}</span>
                <span style={{ color: T.sub }}>{l.zone}</span>
                <span style={{ marginLeft: "auto", color: T.faint, fontSize: 12.5 }}>{trDate(l.created_at)} {trTime(l.created_at)}</span>
                {user.is_admin && (
                  <button onClick={async () => {
                    if (!window.confirm(`"${l.staff_name}" adına ${l.zone} bölgesindeki "${l.action}" kaydı KALICI silinecek.\n\nBu işlem geri alınamaz. Devam edilsin mi?`)) return;
                    await hardDeleteRow("clean_logs", l.id, user.name); reload();
                  }} title="Kaydı sil (yalnız yönetici)" style={{ ...S.btn, padding: "4px 10px", fontSize: 11.5, background: T.redSoft, color: T.red }}>Sil</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ ATIK GİRİŞİ ═══════════ */
function WasteEntry({ user, zones = [], wasteLogs, reload }) {
  const [f, setF] = useState({ zone: "", type: "", amount: "", destination: "", facility_license: "", uatf_no: "", vehicle: "", km: "" });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const isHaz = f.type === "hazardous";
  const valid = f.zone && f.type && f.amount && f.destination && (!isHaz || f.uatf_no.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    let photo_url = null;
    if (photo) photo_url = await uploadPhoto(photo);
    await insertRow("waste_logs", {
      zone: f.zone, type: f.type, amount: parseFloat(f.amount), destination: f.destination,
      facility_license: f.facility_license || null, uatf_no: f.uatf_no || null,
      vehicle: f.vehicle || null, km: parseFloat(f.km) || 0, photo_url, staff_name: user.name,
    }, user.name);
    setF({ zone: "", type: "", amount: "", destination: "", facility_license: "", uatf_no: "", vehicle: "", km: "" });
    setPhoto(null); setBusy(false); setDone(true); reload();
    setTimeout(() => setDone(false), 2500);
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={S.card}>
        <div style={S.h2}>Atık girişi</div>
        <div style={S.sub}>Tartı fişi fotoğrafı eklemeniz önerilir. Tehlikeli atıkta UATF numarası zorunludur.</div>

        <label style={S.label}>Kaynak bölge</label>
        <select style={S.input} value={f.zone} onChange={e => set("zone", e.target.value)}>
          <option value="">Seçin</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
        </select>

        <label style={S.label}>Atık türü</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 14 }}>
          {WASTE_TYPES.map(t => (
            <button key={t.id} onClick={() => set("type", t.id)} style={{
              ...S.btn, padding: "10px 8px", fontSize: 12.5,
              background: f.type === t.id ? t.color : "#fbfcfb",
              color: f.type === t.id ? "#fff" : T.sub,
              border: `1.5px solid ${f.type === t.id ? t.color : T.line}`,
            }}>{t.name}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={S.label}>Miktar (kg)</label>
            <input style={S.input} type="number" min="0" placeholder="45" value={f.amount} onChange={e => set("amount", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Taşıma mesafesi (km)</label>
            <input style={S.input} type="number" min="0" placeholder="12" value={f.km} onChange={e => set("km", e.target.value)} />
          </div>
        </div>

        <label style={S.label}>Gönderim yeri</label>
        <select style={S.input} value={f.destination} onChange={e => set("destination", e.target.value)}>
          <option value="">Seçin</option>
          {DESTINATIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <label style={S.label}>Tesis çevre lisans no (isteğe bağlı)</label>
        <input style={S.input} placeholder="Örn: 07-GDL-2026-0142" value={f.facility_license} onChange={e => set("facility_license", e.target.value)} />

        {isHaz && (
          <>
            <label style={{ ...S.label, color: T.red }}>UATF numarası (tehlikeli atıkta zorunlu)</label>
            <input style={{ ...S.input, borderColor: f.uatf_no ? T.line : T.red }} placeholder="Ulusal Atık Taşıma Formu no" value={f.uatf_no} onChange={e => set("uatf_no", e.target.value)} />
          </>
        )}

        <label style={S.label}>Araç plakası</label>
        <input style={S.input} placeholder="07 ABC 123" value={f.vehicle} onChange={e => set("vehicle", e.target.value)} />

        <label style={S.label}>Kanıt fotoğrafı (tartı fişi vb.)</label>
        <input style={{ ...S.input, padding: 9 }} type="file" accept="image/*" capture="environment" onChange={e => setPhoto(e.target.files?.[0] || null)} />
        {!isOnline && photo && <div style={{ fontSize: 12, color: T.amber, marginTop: -8, marginBottom: 10 }}>Yerel modda fotoğraf kaydedilmez (Supabase gerekli).</div>}

        <button onClick={submit} disabled={!valid || busy} style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: (!valid || busy) ? 0.4 : 1 }}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        {done && <div style={{ marginTop: 14, padding: 13, borderRadius: 10, background: T.greenSoft, color: T.green, fontWeight: 600, fontSize: 14, textAlign: "center" }}>✓ Atık kaydı oluşturuldu</div>}
      </div>

      {wasteLogs.length > 0 && (
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <div style={S.h2}>Son atık kayıtları</div>
              <div style={{ fontSize: 12.5, color: T.sub }}>Toplam {wasteLogs.length} kayıt</div>
            </div>
            {wasteLogs.length > 10 && (
              <button onClick={() => setShowAll(v => !v)} style={{ ...S.btn, padding: "7px 13px", fontSize: 12.5, ...S.btnGhost }}>
                {showAll ? "Son 10'u göster" : `Tümünü göster (${wasteLogs.length})`}
              </button>
            )}
          </div>
          <div style={{ marginTop: 10, maxHeight: showAll ? 520 : "none", overflowY: showAll ? "auto" : "visible" }}>
            {(showAll ? wasteLogs.slice() : wasteLogs.slice(-10)).reverse().map(l => {
              const wt = WASTE_TYPES.find(t => t.id === l.type);
              return (
                <div key={l.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={S.tag(wt.color + "1a", wt.color)}>{wt.name}</span>
                    <span style={{ fontWeight: 700, color: T.ink }}>{l.amount} kg</span>
                    <span style={{ color: T.sub }}>{l.zone} → {l.destination}</span>
                    {l.photo_url && <a href={l.photo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.blue }}>📷 kanıt</a>}
                    <span style={{ marginLeft: "auto", color: T.faint, fontSize: 12.5 }}>{trDate(l.created_at)} {trTime(l.created_at)}</span>
                    {user.is_admin && (
                      <button onClick={async () => {
                        if (!window.confirm(`${l.amount} kg ${wt.name} atık kaydı (${l.zone} → ${l.destination}) KALICI silinecek.\n\nBu işlem geri alınamaz. Devam edilsin mi?`)) return;
                        await hardDeleteRow("waste_logs", l.id, user.name); reload();
                      }} title="Kaydı sil (yalnız yönetici)" style={{ ...S.btn, padding: "4px 10px", fontSize: 11.5, background: T.redSoft, color: T.red }}>Sil</button>
                    )}
                  </div>
                  {(l.uatf_no || l.facility_license) && (
                    <div style={{ fontSize: 12, color: T.faint, marginTop: 3 }}>
                      {l.uatf_no && `UATF: ${l.uatf_no}`} {l.facility_license && ` · Lisans: ${l.facility_license}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ GÖREVLER (SLA) ═══════════ */
function Assignments({ user, zones = [], staff, assignments, cleanLogs, reload }) {
  const [zone, setZone] = useState("");
  const [person, setPerson] = useState("");
  const [freq, setFreq] = useState("4");

  const add = async () => {
    if (!zone || !person) return;
    const p = staff.find(s => s.id === person);
    await insertRow("assignments", { zone, staff_id: person, staff_name: p?.name, freq_hours: parseFloat(freq) || 4 }, user.name);
    setZone(""); setPerson(""); reload();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      {user.is_admin && (
        <div style={S.card}>
          <div style={S.h2}>Görev ata</div>
          <div style={S.sub}>Bir bölgeyi bir personele bağlayın ve temizlik sıklığı (SLA) belirleyin.</div>
          <label style={S.label}>Bölge</label>
          <select style={S.input} value={zone} onChange={e => setZone(e.target.value)}>
            <option value="">Seçin</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
          </select>
          <label style={S.label}>Sorumlu personel</label>
          <select style={S.input} value={person} onChange={e => setPerson(e.target.value)}>
            <option value="">Seçin</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name} — {s.shift}</option>)}
          </select>
          <label style={S.label}>Temizlik sıklığı (saat)</label>
          <input style={S.input} type="number" min="0.5" step="0.5" value={freq} onChange={e => setFreq(e.target.value)} />
          <button onClick={add} disabled={!zone || !person} style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: (!zone || !person) ? 0.4 : 1 }}>Ata</button>
        </div>
      )}

      <div style={S.card}>
        <div style={S.h2}>Aktif görevler ({assignments.length})</div>
        {assignments.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>Henüz görev atanmadı.</div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {assignments.map(a => {
              const last = cleanLogs.filter(c => c.zone === a.zone && c.action === "Çıkış").slice(-1)[0];
              const hrs = last ? (Date.now() - new Date(last.created_at)) / 3600000 : null;
              const late = hrs === null || hrs > Number(a.freq_hours);
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: `1px solid ${T.line}`, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: T.ink }}>{zones.find(z => z.id === a.zone)?.name || a.zone}</div>
                    <div style={{ fontSize: 12.5, color: T.sub }}>{a.staff_name} · her {a.freq_hours} saatte</div>
                  </div>
                  <span style={S.tag(late ? T.redSoft : T.greenSoft, late ? T.red : T.green)}>
                    {hrs === null ? "Kayıt yok" : late ? `${hrs.toFixed(1)} sa gecikme` : "Zamanında"}
                  </span>
                  {user.is_admin && (
                    <button onClick={async () => { await deactivateRow("assignments", a.id, user.name); reload(); }}
                      style={{ ...S.btn, padding: "6px 12px", fontSize: 12, background: T.redSoft, color: T.red }}>Kaldır</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════ OLAYLAR ═══════════ */
/* ═══════════ ARIZA / TALEP YÖNETİMİ ═══════════
   Otel operasyon sistemleri mantığı: bildirim → departmana yönlendirme →
   kabul → müdahale → çözüm → doğrulama/kapanış. Her adımın zamanı
   kaydedilir, SLA hedefleriyle karşılaştırılıp performans raporlanır. */

const TICKET_DURUM = [
  { id: "acik",     label: "Açık",         color: "#b03030", soft: "#fbeaea", sira: 1 },
  { id: "kabul",    label: "Kabul edildi", color: "#2f6fb2", soft: "#e9f1f9", sira: 2 },
  { id: "devam",    label: "Müdahale",     color: "#b07d1e", soft: "#faf3e3", sira: 3 },
  { id: "cozuldu",  label: "Çözüldü",      color: "#2a9d8f", soft: "#e4f4f2", sira: 4 },
  { id: "kapandi",  label: "Kapatıldı",    color: "#1e6b45", soft: "#e6f2ec", sira: 5 },
  { id: "iptal",    label: "İptal",        color: "#6c757d", soft: "#eef0ef", sira: 6 },
];
const tDurum = (id) => TICKET_DURUM.find(d => d.id === id) || TICKET_DURUM[0];

const TICKET_ONCELIK = [
  { id: "kritik", label: "Kritik", color: "#a02c2c", carpan: 0.5 },
  { id: "yuksek", label: "Yüksek", color: "#b03030", carpan: 0.75 },
  { id: "orta",   label: "Orta",   color: "#b07d1e", carpan: 1 },
  { id: "dusuk",  label: "Düşük",  color: "#2f6fb2", carpan: 2 },
];
const tOncelik = (id) => TICKET_ONCELIK.find(p => p.id === id) || TICKET_ONCELIK[2];

/* Dakikayı okunaklı süreye çevirir */
function sureMetni(dk) {
  if (dk === null || dk === undefined || isNaN(dk)) return "—";
  const d = Math.max(0, Math.round(dk));
  if (d < 60) return `${d} dk`;
  const s = Math.floor(d / 60), k = d % 60;
  if (s < 24) return k ? `${s} sa ${k} dk` : `${s} sa`;
  const g = Math.floor(s / 24), sk = s % 24;
  return sk ? `${g} gün ${sk} sa` : `${g} gün`;
}

/* İki zaman arasındaki dakika farkı */
const dkFark = (a, b) => (a && b) ? (new Date(b) - new Date(a)) / 60000 : null;

/* Bir arızanın süre ve SLA bilgilerini hesaplar */
function arizaMetrik(t) {
  const yanit  = dkFark(t.created_at, t.acknowledged_at);
  const cozum  = dkFark(t.created_at, t.resolved_at);
  const kapanis= dkFark(t.created_at, t.closed_at);
  const acikMi = !["kapandi", "iptal"].includes(t.status);
  const gecenSure = dkFark(t.created_at, new Date().toISOString());

  const hedefYanit = t.sla_response_min ?? 30;
  const hedefCozum = t.sla_resolve_min ?? 240;

  /* Yanıt SLA: kabul edilmişse gerçekleşen, edilmemişse geçen süre */
  const yanitSure = yanit ?? (acikMi && t.status === "acik" ? gecenSure : null);
  const yanitAsim = yanitSure !== null && yanitSure > hedefYanit;

  const cozumSure = cozum ?? (acikMi ? gecenSure : null);
  const cozumAsim = cozumSure !== null && cozumSure > hedefCozum;

  return { yanit, cozum, kapanis, yanitSure, cozumSure, hedefYanit, hedefCozum,
           yanitAsim, cozumAsim, acikMi, gecenSure,
           slaUygun: !yanitAsim && !cozumAsim };
}

function Incidents({ user, zones = [], incidents = [], staff = [], depts = [], ticketCats = [], reload }) {
  const mobil = useIsMobile();
  const isAdmin = user.is_admin;
  const [gorunum, setGorunum] = useState("liste");   // liste | yeni | performans | turler
  const [acikId, setAcikId] = useState(null);
  const [fDurum, setFDurum] = useState("acik");      // acik = kapanmamışlar
  const [fDept, setFDept] = useState("hepsi");
  const [ara, setAra] = useState("");

  /* Kullanıcı hangi arızaları görür: yönetici hepsini,
     diğerleri kendi departmanına düşen + kendi bildirdikleri */
  const gorunur = incidents.filter(t => {
    if (isAdmin) return true;
    return t.assigned_dept === user.department
        || t.assignee_id === user.id
        || t.staff_name === user.name;
  });

  const liste = gorunur
    .filter(t => fDurum === "acik" ? !["kapandi", "iptal"].includes(t.status)
               : fDurum === "hepsi" ? true : t.status === fDurum)
    .filter(t => fDept === "hepsi" || t.assigned_dept === fDept)
    .filter(t => {
      const q = ara.trim().toLowerCase();
      if (!q) return true;
      return (t.description || "").toLowerCase().includes(q)
          || String(t.ticket_no || "").includes(q)
          || (t.category || "").toLowerCase().includes(q)
          || (t.zone || "").toLowerCase().includes(q);
    })
    .slice()
    .sort((a, b) => {
      /* Önce SLA aşanlar, sonra öncelik, sonra yenilik */
      const ma = arizaMetrik(a), mb = arizaMetrik(b);
      if (ma.cozumAsim !== mb.cozumAsim) return ma.cozumAsim ? -1 : 1;
      const w = { kritik: 0, yuksek: 1, orta: 2, dusuk: 3 };
      const fark = (w[a.severity] ?? 2) - (w[b.severity] ?? 2);
      if (fark) return fark;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  if (acikId) {
    const t = incidents.find(x => x.id === acikId);
    if (!t) { setAcikId(null); return null; }
    return <ArizaDetay ticket={t} user={user} isAdmin={isAdmin} staff={staff} zones={zones}
      depts={depts} ticketCats={ticketCats} onBack={() => setAcikId(null)} reload={reload} />;
  }

  if (gorunum === "performans") {
    return <ArizaPerformans incidents={gorunur} depts={depts} staff={staff}
      onBack={() => setGorunum("liste")} />;
  }

  if (gorunum === "turler") {
    return (
      <div>
        <button onClick={() => setGorunum("liste")} style={{ ...S.btn, ...S.btnGhost, marginBottom: 14 }}>← Arıza listesi</button>
        <div style={{ maxWidth: 560 }}>
          <ArizaKategoriYonetimi user={user} cats={ticketCats} depts={depts} reload={reload} />
        </div>
      </div>
    );
  }

  /* Üst özet kartları */
  const acikSayi = gorunur.filter(t => t.status === "acik").length;
  const devamSayi = gorunur.filter(t => ["kabul", "devam"].includes(t.status)).length;
  const asimSayi = gorunur.filter(t => { const m = arizaMetrik(t); return m.acikMi && (m.cozumAsim || m.yanitAsim); }).length;
  const bugunKapanan = gorunur.filter(t => t.closed_at && isToday(t.closed_at)).length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 14 }}>
        {[
          { l: "Açık arıza", v: acikSayi, c: acikSayi > 0 ? T.red : T.faint },
          { l: "Müdahalede", v: devamSayi, c: T.amber },
          { l: "Süre aşımı", v: asimSayi, c: asimSayi > 0 ? T.red : T.green },
          { l: "Bugün kapanan", v: bugunKapanan, c: T.green },
        ].map(k => (
          <div key={k.l} style={{ ...S.card, marginBottom: 0, padding: 16, borderTop: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 11.5, color: T.sub, fontWeight: 600, marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 26, fontWeight: 800, color: T.ink }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={() => setGorunum("yeni")} style={{ ...S.btn, ...S.btnGreen }}>+ Arıza bildir</button>
        <button onClick={() => setGorunum("performans")} style={{ ...S.btn, ...S.btnGhost }}>Performans raporu</button>
        {isAdmin && (
          <button onClick={() => setGorunum("turler")} style={{ ...S.btn, ...S.btnGhost }}>Arıza türleri & SLA</button>
        )}
      </div>

      {gorunum === "yeni" && (
        <ArizaBildir user={user} zones={zones} depts={depts} staff={staff} ticketCats={ticketCats}
          onKapat={() => setGorunum("liste")} reload={reload} />
      )}

      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={S.h2}>Arıza kayıtları</div>
            <div style={{ fontSize: 13, color: T.sub }}>{liste.length} kayıt</div>
          </div>
          <input style={{ ...S.input, marginBottom: 0, width: mobil ? "100%" : 190, padding: "9px 12px", fontSize: 14 }}
            placeholder="No, açıklama, bölge…" value={ara} onChange={e => setAra(e.target.value)} />
          {depts.length > 0 && (
            <select style={{ ...S.input, marginBottom: 0, width: "auto", minWidth: 150, padding: "9px 12px", fontSize: 13.5 }}
              value={fDept} onChange={e => setFDept(e.target.value)}>
              <option value="hepsi">Tüm departmanlar</option>
              {depts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
          )}
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          {[{ id: "acik", label: "Açık işler" }, { id: "hepsi", label: "Hepsi" }, ...TICKET_DURUM].map(d => (
            <button key={d.id} onClick={() => setFDurum(d.id)} style={{
              ...S.btn, padding: "6px 11px", fontSize: 12, minHeight: 0,
              background: fDurum === d.id ? T.green : "#fbfcfb",
              color: fDurum === d.id ? "#fff" : T.sub,
              border: `1.5px solid ${fDurum === d.id ? T.green : T.line}`,
            }}>{d.label}</button>
          ))}
        </div>

        {liste.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>
            Kayıt bulunamadı.
          </div>
        ) : liste.map(t => {
          const d = tDurum(t.status), p = tOncelik(t.severity), m = arizaMetrik(t);
          const bolge = zones.find(z => z.id === t.zone);
          return (
            <div key={t.id} onClick={() => setAcikId(t.id)} style={{
              padding: "13px 0", borderBottom: `1px solid ${T.line}`, cursor: "pointer",
              borderLeft: m.acikMi && m.cozumAsim ? `3px solid ${T.red}` : "3px solid transparent",
              paddingLeft: m.acikMi && m.cozumAsim ? 10 : 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: T.faint, fontWeight: 700 }}>#{t.ticket_no}</span>
                <span style={S.tag(d.soft, d.color)}>{d.label}</span>
                <span style={S.tag(p.color + "1a", p.color)}>{p.label}</span>
                {m.acikMi && m.cozumAsim && <span style={S.tag(T.redSoft, T.red)}>⚠ süre aşımı</span>}
                {t.escalated && <span style={S.tag(T.amberSoft, T.amber)}>↑ eskalasyon</span>}
                <span style={{ fontWeight: 600, fontSize: 14, color: T.ink, flex: 1, minWidth: 140 }}>
                  {t.category ? `${t.category} — ` : ""}{t.description}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 12.5, color: T.sub, alignItems: "center" }}>
                <span>📍 {bolge?.name || t.zone}</span>
                {t.assigned_dept && <span>🏢 {t.assigned_dept}</span>}
                {t.assignee_name && <span>👤 {t.assignee_name}</span>}
                <span style={{ color: m.acikMi ? (m.cozumAsim ? T.red : T.faint) : T.green, fontWeight: m.cozumAsim ? 700 : 400 }}>
                  {m.acikMi ? `⏱ ${sureMetni(m.gecenSure)} açık` : `✓ ${sureMetni(m.kapanis ?? m.cozum)} içinde çözüldü`}
                </span>
                <span style={{ marginLeft: "auto", color: T.blue, fontWeight: 600 }}>Aç →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── ARIZA BİLDİRİM FORMU ── */
function ArizaBildir({ user, zones, depts, staff, ticketCats, onKapat, reload }) {
  const [f, setF] = useState({ zone: "", category: "", severity: "orta", description: "", assigned_dept: "", assignee_id: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [foto, setFoto] = useState(null);
  const [busy, setBusy] = useState(false);

  /* Kategori seçilince departman ve SLA otomatik gelir */
  const kategoriSec = (ad) => {
    const k = ticketCats.find(c => c.name === ad);
    setF(p => ({ ...p, category: ad, assigned_dept: k?.department || p.assigned_dept, assignee_id: "" }));
  };

  const seciliKat = ticketCats.find(c => c.name === f.category);
  const carpan = tOncelik(f.severity).carpan;
  const slaYanit = Math.round((seciliKat?.sla_response_min ?? 30) * carpan);
  const slaCozum = Math.round((seciliKat?.sla_resolve_min ?? 240) * carpan);

  const deptPersonel = staff.filter(s => !f.assigned_dept || s.department === f.assigned_dept);

  const gonder = async () => {
    if (!f.zone || !f.description.trim() || busy) return;
    setBusy(true);
    let photo_url = null;
    if (foto) { const up = await uploadFile(foto, "kanit"); if (up) photo_url = up.url; }
    const p = staff.find(s => s.id === f.assignee_id);
    const kayit = await insertRow("incidents", {
      zone: f.zone, category: f.category || null, severity: f.severity,
      description: f.description.trim(), status: "acik",
      assigned_dept: f.assigned_dept || null,
      assignee_id: f.assignee_id || null, assignee_name: p?.name || null,
      sla_response_min: slaYanit, sla_resolve_min: slaCozum,
      staff_name: user.name, photo_url,
    }, user.name);
    if (kayit?.id) {
      await insertRow("ticket_history", { ticket_id: kayit.id, actor: user.name, action: "BİLDİRİM",
        detail: `${f.category || "Arıza"} · ${f.assigned_dept || "departman atanmadı"}` }, user.name);
    }
    if (p?.email) {
      await sendTaskEmail({ to: p.email, name: p.name, title: `Arıza: ${f.description.slice(0, 60)}`,
        due: null, priority: f.severity, assignedBy: user.name });
    }
    setBusy(false); onKapat(); reload();
  };

  return (
    <div style={{ ...S.card, borderColor: T.green }}>
      <div style={S.h2}>Yeni arıza / talep bildir</div>
      <div style={S.sub}>Kategori seçince ilgili departman ve hedef süreler otomatik gelir.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div>
          <label style={S.label}>Bölge / konum <span style={{ color: T.red }}>*</span></label>
          <select style={S.input} value={f.zone} onChange={e => set("zone", e.target.value)}>
            <option value="">Seçin</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Arıza türü</label>
          <select style={S.input} value={f.category} onChange={e => kategoriSec(e.target.value)}>
            <option value="">Seçin</option>
            {ticketCats.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>İlgili departman</label>
          <select style={S.input} value={f.assigned_dept} onChange={e => { set("assigned_dept", e.target.value); set("assignee_id", ""); }}>
            <option value="">— Atanmadı —</option>
            {depts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Sorumlu kişi (isteğe bağlı)</label>
          <select style={S.input} value={f.assignee_id} onChange={e => set("assignee_id", e.target.value)}>
            <option value="">— Departman havuzuna bırak —</option>
            {deptPersonel.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <label style={S.label}>Öncelik</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {TICKET_ONCELIK.map(p => (
          <button key={p.id} onClick={() => set("severity", p.id)} style={{
            ...S.btn, flex: 1, minWidth: 90, padding: "10px 8px", fontSize: 13,
            background: f.severity === p.id ? p.color : "#fbfcfb",
            color: f.severity === p.id ? "#fff" : T.sub,
            border: `1.5px solid ${f.severity === p.id ? p.color : T.line}`,
          }}>{p.label}</button>
        ))}
      </div>

      <div style={{ background: T.blueSoft, borderRadius: 9, padding: 11, fontSize: 12.5, color: T.blue, marginBottom: 12 }}>
        Hedef süreler — kabul: <b>{sureMetni(slaYanit)}</b> · çözüm: <b>{sureMetni(slaCozum)}</b>
      </div>

      <label style={S.label}>Açıklama <span style={{ color: T.red }}>*</span></label>
      <textarea style={{ ...S.input, height: 80, resize: "vertical" }} placeholder="Arızayı tarif edin…"
        value={f.description} onChange={e => set("description", e.target.value)} />

      <label style={S.label}>Fotoğraf (isteğe bağlı)</label>
      <input style={{ ...S.input, padding: 9 }} type="file" accept="image/*" capture="environment"
        onChange={e => setFoto(e.target.files?.[0] || null)} />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={gonder} disabled={!f.zone || !f.description.trim() || busy}
          style={{ ...S.btn, ...S.btnGreen, opacity: (!f.zone || !f.description.trim() || busy) ? 0.4 : 1 }}>
          {busy ? "Gönderiliyor…" : "Arızayı bildir"}
        </button>
        <button onClick={onKapat} style={{ ...S.btn, ...S.btnGhost }}>İptal</button>
      </div>
    </div>
  );
}

/* ── ARIZA DETAY ── */
function ArizaDetay({ ticket: t, user, isAdmin, staff, zones, depts = [], ticketCats = [], onBack, reload }) {
  const [yorumlar, setYorumlar] = useState([]);
  const [gecmis, setGecmis] = useState([]);
  const [metin, setMetin] = useState("");
  const [dosya, setDosya] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cozumNot, setCozumNot] = useState("");
  const [atamaAcik, setAtamaAcik] = useState(false);
  const [atananKisi, setAtananKisi] = useState("");

  const m = arizaMetrik(t);
  const d = tDurum(t.status), p = tOncelik(t.severity);
  const bolge = zones.find(z => z.id === t.zone);
  /* İşlem yapabilir: yönetici, atanan kişi veya o departmandaki personel */
  const yetkili = isAdmin || t.assignee_id === user.id || (t.assigned_dept && t.assigned_dept === user.department);
  const bildiren = t.staff_name === user.name;

  const yukle = async () => {
    const [c, h] = await Promise.all([fetchAll("ticket_comments"), fetchAll("ticket_history")]);
    setYorumlar(c.filter(x => x.ticket_id === t.id && x.active !== false));
    setGecmis(h.filter(x => x.ticket_id === t.id));
  };
  useEffect(() => { yukle(); }, [t.id]); // eslint-disable-line

  const gecmisYaz = async (action, detail) => {
    await insertRow("ticket_history", { ticket_id: t.id, actor: user.name, action, detail: detail || null }, user.name);
  };

  const durumDegistir = async (yeniDurum, ekstra = {}, aciklama = "") => {
    setBusy(true);
    await updateRow("incidents", t.id, { status: yeniDurum, ...ekstra }, user.name);
    await gecmisYaz("DURUM", `${tDurum(t.status).label} → ${tDurum(yeniDurum).label}${aciklama ? ` · ${aciklama}` : ""}`);
    setBusy(false); reload(); yukle();
  };

  const kabulEt = () => durumDegistir("kabul", {
    acknowledged_at: new Date().toISOString(),
    assignee_id: t.assignee_id || user.id,
    assignee_name: t.assignee_name || user.name,
  });
  const basla = () => durumDegistir("devam", { started_at: new Date().toISOString() });
  const cozdum = async () => {
    if (!cozumNot.trim()) { alert("Lütfen ne yapıldığını kısaca yazın."); return; }
    await durumDegistir("cozuldu", { resolved_at: new Date().toISOString(), resolution_note: cozumNot.trim() }, cozumNot.trim());
    setCozumNot("");
  };
  const kapat = () => durumDegistir("kapandi", { closed_at: new Date().toISOString(), closed_by: user.name });
  const yenidenAc = async () => {
    const sebep = window.prompt("Neden yeniden açılıyor?");
    if (sebep === null) return;
    await durumDegistir("devam", { resolved_at: null, closed_at: null, reopened_count: (t.reopened_count || 0) + 1 }, sebep);
  };
  const iptalEt = async () => {
    const sebep = window.prompt("İptal gerekçesi:");
    if (sebep === null) return;
    await durumDegistir("iptal", { closed_at: new Date().toISOString(), closed_by: user.name }, sebep);
  };
  const eskalasyon = async () => {
    await updateRow("incidents", t.id, { escalated: true }, user.name);
    await gecmisYaz("ESKALASYON", "Yönetime bildirildi");
    reload(); yukle();
  };

  /* Arıza türünü değiştir — departman ve süre hedefleri de güncellenir */
  const turDegistir = async (yeniTur) => {
    const k = ticketCats.find(c => c.name === yeniTur);
    const carpan = tOncelik(t.severity).carpan;
    setBusy(true);
    await updateRow("incidents", t.id, {
      category: yeniTur || null,
      assigned_dept: k?.department || t.assigned_dept,
      sla_response_min: k ? Math.round(k.sla_response_min * carpan) : t.sla_response_min,
      sla_resolve_min: k ? Math.round(k.sla_resolve_min * carpan) : t.sla_resolve_min,
    }, user.name);
    await gecmisYaz("TÜR", `${t.category || "belirsiz"} → ${yeniTur || "belirsiz"}${k?.department ? ` · ${k.department}` : ""}`);
    setBusy(false); reload(); yukle();
  };

  /* Departmanı elle değiştir (yönlendirme düzeltmesi) */
  const deptDegistir = async (yeniDept) => {
    setBusy(true);
    await updateRow("incidents", t.id, { assigned_dept: yeniDept || null, assignee_id: null, assignee_name: null }, user.name);
    await gecmisYaz("YÖNLENDİRME", `${t.assigned_dept || "yok"} → ${yeniDept || "yok"}`);
    setBusy(false); reload(); yukle();
  };

  /* Önceliği değiştir — SLA hedefleri yeniden hesaplanır */
  const oncelikDegistir = async (yeni) => {
    const k = ticketCats.find(c => c.name === t.category);
    const carpan = tOncelik(yeni).carpan;
    setBusy(true);
    await updateRow("incidents", t.id, {
      severity: yeni,
      sla_response_min: Math.round((k?.sla_response_min ?? 30) * carpan),
      sla_resolve_min: Math.round((k?.sla_resolve_min ?? 240) * carpan),
    }, user.name);
    await gecmisYaz("ÖNCELİK", `${tOncelik(t.severity).label} → ${tOncelik(yeni).label}`);
    setBusy(false); reload(); yukle();
  };

  const atamaYap = async () => {
    if (!atananKisi) return;
    const kisi = staff.find(s => s.id === atananKisi);
    setBusy(true);
    await updateRow("incidents", t.id, {
      assignee_id: kisi.id, assignee_name: kisi.name,
      assigned_dept: kisi.department || t.assigned_dept,
    }, user.name);
    await gecmisYaz("ATAMA", `${t.assignee_name || "havuz"} → ${kisi.name}`);
    if (kisi.email) {
      await sendTaskEmail({ to: kisi.email, name: kisi.name, title: `Arıza #${t.ticket_no}: ${t.description.slice(0, 50)}`,
        due: null, priority: t.severity, assignedBy: user.name });
    }
    setAtamaAcik(false); setAtananKisi(""); setBusy(false); reload(); yukle();
  };

  const yorumEkle = async () => {
    if ((!metin.trim() && !dosya) || busy) return;
    setBusy(true);
    let file_url = null, file_name = null;
    if (dosya) { const up = await uploadFile(dosya); if (up) { file_url = up.url; file_name = up.name; } }
    await insertRow("ticket_comments", { ticket_id: t.id, author: user.name, body: metin.trim() || null, file_url, file_name }, user.name);
    setMetin(""); setDosya(null); setBusy(false); yukle();
  };

  /* Zaman çizelgesi adımları */
  const adimlar = [
    { ad: "Bildirim", zaman: t.created_at, kisi: t.staff_name },
    { ad: "Kabul", zaman: t.acknowledged_at, kisi: t.assignee_name, hedef: m.hedefYanit, gercek: m.yanit },
    { ad: "Müdahale", zaman: t.started_at, kisi: t.assignee_name },
    { ad: "Çözüm", zaman: t.resolved_at, kisi: t.assignee_name, hedef: m.hedefCozum, gercek: m.cozum },
    { ad: "Kapanış", zaman: t.closed_at, kisi: t.closed_by },
  ];

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ ...S.btn, ...S.btnGhost }}>← Arıza listesi</button>
        {isAdmin && !["kapandi", "iptal"].includes(t.status) && (
          <button onClick={iptalEt} style={{ ...S.btn, padding: "12px 16px", fontSize: 13.5, background: "#eef0ef", color: T.sub, marginLeft: "auto" }}>İptal et</button>
        )}
        {isAdmin && (
          <button onClick={async () => {
            if (!window.confirm(`#${t.ticket_no} arıza kaydı KALICI silinecek.\n\nGeri alınamaz. Devam edilsin mi?`)) return;
            await hardDeleteRow("incidents", t.id, user.name); reload(); onBack();
          }} style={{ ...S.btn, padding: "12px 16px", fontSize: 13.5, background: T.red, color: "#fff" }}>Sil</button>
        )}
      </div>

      {/* Başlık */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontFamily: "monospace", fontSize: 13, color: T.faint, fontWeight: 700 }}>#{t.ticket_no}</span>
          <span style={S.tag(d.soft, d.color)}>{d.label}</span>
          <span style={S.tag(p.color + "1a", p.color)}>{p.label}</span>
          {t.escalated && <span style={S.tag(T.amberSoft, T.amber)}>↑ eskalasyon</span>}
          {t.reopened_count > 0 && <span style={S.tag("#eef0ef", T.sub)}>↻ {t.reopened_count} kez yeniden açıldı</span>}
        </div>
        <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 18, fontWeight: 800, color: T.ink }}>
          {t.category ? `${t.category}` : "Arıza"}
        </div>
        <div style={{ fontSize: 14.5, color: T.ink, marginTop: 6, lineHeight: 1.6 }}>{t.description}</div>
        <div style={{ fontSize: 12.5, color: T.faint, marginTop: 10 }}>
          📍 {bolge?.name || t.zone} · Bildiren: {t.staff_name}
          {t.assigned_dept && <> · Departman: <b style={{ color: T.sub }}>{t.assigned_dept}</b></>}
          {t.assignee_name && <> · Sorumlu: <b style={{ color: T.sub }}>{t.assignee_name}</b></>}
        </div>
        {t.photo_url && (
          <a href={t.photo_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10 }}>
            <img src={t.photo_url} alt="Arıza fotoğrafı" style={{ maxHeight: 160, borderRadius: 9, border: `1px solid ${T.line}` }} />
          </a>
        )}
        {t.resolution_note && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: T.greenSoft, color: T.green, fontSize: 13.5 }}>
            <b>Yapılan işlem:</b> {t.resolution_note}
          </div>
        )}
      </div>

      {/* Sınıflandırma — tür, departman, öncelik düzeltmesi */}
      {yetkili && !["kapandi", "iptal"].includes(t.status) && (
        <div style={S.card}>
          <div style={S.h2}>Sınıflandırma</div>
          <div style={S.sub}>Yanlış açılmışsa düzeltin — departman ve hedef süreler otomatik güncellenir.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 4 }}>
            <div>
              <label style={S.label}>Arıza türü</label>
              <select style={{ ...S.input, marginBottom: 0 }} value={t.category || ""} disabled={busy}
                onChange={e => turDegistir(e.target.value)}>
                <option value="">— Belirsiz —</option>
                {ticketCats.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>İlgili departman</label>
              <select style={{ ...S.input, marginBottom: 0 }} value={t.assigned_dept || ""} disabled={busy}
                onChange={e => deptDegistir(e.target.value)}>
                <option value="">— Atanmadı —</option>
                {depts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Öncelik</label>
              <select style={{ ...S.input, marginBottom: 0 }} value={t.severity} disabled={busy}
                onChange={e => oncelikDegistir(e.target.value)}>
                {TICKET_ONCELIK.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Süre / SLA paneli */}
      <div style={S.card}>
        <div style={S.h2}>Süre takibi</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
          {[
            { l: "Kabul süresi", g: m.yanit, h: m.hedefYanit, asim: m.yanitAsim },
            { l: "Çözüm süresi", g: m.cozum, h: m.hedefCozum, asim: m.cozumAsim },
            { l: "Toplam (kapanışa dek)", g: m.kapanis, h: null, asim: false },
          ].map(x => (
            <div key={x.l} style={{ background: "#fafbfa", borderRadius: 10, padding: 12, border: `1px solid ${T.line}` }}>
              <div style={{ fontSize: 11.5, color: T.sub, fontWeight: 600 }}>{x.l}</div>
              <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 19, fontWeight: 800, color: x.asim ? T.red : (x.g !== null ? T.green : T.faint), marginTop: 4 }}>
                {x.g !== null ? sureMetni(x.g) : (m.acikMi ? sureMetni(m.gecenSure) + " (devam)" : "—")}
              </div>
              {x.h !== null && <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>Hedef: {sureMetni(x.h)}</div>}
            </div>
          ))}
        </div>
        {m.acikMi && (m.yanitAsim || m.cozumAsim) && (
          <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: T.redSoft, color: T.red, fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>⚠ Hedef süre aşıldı.</span>
            {!t.escalated && yetkili && (
              <button onClick={eskalasyon} style={{ ...S.btn, padding: "6px 12px", fontSize: 12, background: T.red, color: "#fff", minHeight: 0 }}>
                Yönetime bildir
              </button>
            )}
          </div>
        )}
      </div>

      {/* Zaman çizelgesi */}
      <div style={S.card}>
        <div style={S.h2}>Süreç</div>
        <div style={{ marginTop: 12 }}>
          {adimlar.map((a, i) => {
            const oldu = !!a.zaman;
            const asim = a.hedef && a.gercek && a.gercek > a.hedef;
            return (
              <div key={a.ad} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: i < adimlar.length - 1 ? 14 : 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: oldu ? (asim ? T.red : T.green) : "#eef0ef",
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                    {oldu ? "✓" : i + 1}
                  </div>
                  {i < adimlar.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 22, background: oldu ? T.green : "#eef0ef", marginTop: 2 }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: oldu ? T.ink : T.faint }}>{a.ad}</div>
                  {oldu ? (
                    <div style={{ fontSize: 12, color: T.sub }}>
                      {new Date(a.zaman).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {a.kisi ? ` · ${a.kisi}` : ""}
                      {a.gercek !== null && a.gercek !== undefined && (
                        <span style={{ color: asim ? T.red : T.green, fontWeight: 600 }}> · {sureMetni(a.gercek)}</span>
                      )}
                    </div>
                  ) : <div style={{ fontSize: 12, color: T.faint }}>bekliyor</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Aksiyonlar */}
      <div style={S.card}>
        <div style={S.h2}>İşlem</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {yetkili && t.status === "acik" && (
            <button onClick={kabulEt} disabled={busy} style={{ ...S.btn, background: tDurum("kabul").color, color: "#fff" }}>Kabul et (üzerime al)</button>
          )}
          {yetkili && t.status === "kabul" && (
            <button onClick={basla} disabled={busy} style={{ ...S.btn, background: tDurum("devam").color, color: "#fff" }}>Müdahaleye başla</button>
          )}
          {yetkili && ["kabul", "devam"].includes(t.status) && (
            <div style={{ width: "100%", marginTop: 8 }}>
              <label style={S.label}>Yapılan işlem (çözüm notu)</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...S.input, marginBottom: 0, flex: 1, minWidth: 180 }} placeholder="Ne yapıldı?"
                  value={cozumNot} onChange={e => setCozumNot(e.target.value)} />
                <button onClick={cozdum} disabled={busy} style={{ ...S.btn, ...S.btnGreen }}>Çözüldü olarak işaretle</button>
              </div>
            </div>
          )}
          {t.status === "cozuldu" && (
            <>
              {(isAdmin || bildiren) ? (
                <>
                  <button onClick={kapat} disabled={busy} style={{ ...S.btn, ...S.btnGreen }}>Doğrula ve kapat</button>
                  <button onClick={yenidenAc} disabled={busy} style={{ ...S.btn, ...S.btnRed }}>Çözülmemiş — yeniden aç</button>
                </>
              ) : (
                <span style={{ fontSize: 13.5, color: T.blue }}>Bildiren kişinin/yöneticinin doğrulaması bekleniyor…</span>
              )}
            </>
          )}
          {t.status === "kapandi" && (
            <span style={{ fontSize: 13.5, color: T.green, fontWeight: 600 }}>
              ✓ {t.closed_by} tarafından kapatıldı · toplam {sureMetni(m.kapanis)}
            </span>
          )}
          {t.status === "iptal" && <span style={{ fontSize: 13.5, color: T.sub }}>Bu kayıt iptal edildi.</span>}

          {isAdmin && !["kapandi", "iptal"].includes(t.status) && (
            atamaAcik ? (
              <div style={{ width: "100%", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <select style={{ ...S.input, marginBottom: 0, flex: 1, minWidth: 180 }} value={atananKisi} onChange={e => setAtananKisi(e.target.value)}>
                  <option value="">Kime atanacak?</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}{s.department ? ` · ${s.department}` : ""}</option>)}
                </select>
                <button onClick={atamaYap} disabled={!atananKisi || busy} style={{ ...S.btn, ...S.btnGreen, opacity: !atananKisi ? 0.4 : 1 }}>Ata</button>
                <button onClick={() => setAtamaAcik(false)} style={{ ...S.btn, ...S.btnGhost }}>İptal</button>
              </div>
            ) : (
              <button onClick={() => setAtamaAcik(true)} style={{ ...S.btn, background: T.blueSoft, color: T.blue }}>
                {t.assignee_name ? "Sorumluyu değiştir" : "Sorumlu ata"}
              </button>
            )
          )}
        </div>
      </div>

      {/* Yorumlar */}
      <div style={S.card}>
        <div style={S.h2}>Notlar ve fotoğraflar</div>
        <div style={{ margin: "12px 0" }}>
          {yorumlar.length === 0 ? (
            <div style={{ fontSize: 13, color: T.faint, padding: "10px 0" }}>Not yok.</div>
          ) : yorumlar.map(c => (
            <div key={c.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 13.5, color: T.ink }}>{c.author}</span>
                <span style={{ fontSize: 12, color: T.faint }}>{new Date(c.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {c.body && <div style={{ fontSize: 14, color: T.ink, marginTop: 3 }}>{c.body}</div>}
              {c.file_url && (
                <a href={c.file_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 13, color: T.blue, textDecoration: "none", background: T.blueSoft, padding: "6px 12px", borderRadius: 8 }}>
                  📎 {c.file_name || "dosya"}
                </a>
              )}
            </div>
          ))}
        </div>
        <textarea style={{ ...S.input, height: 60, resize: "vertical" }} placeholder="Not ekleyin…" value={metin} onChange={e => setMetin(e.target.value)} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" onChange={e => setDosya(e.target.files?.[0] || null)} style={{ fontSize: 13, flex: 1, minWidth: 150 }} />
          <button onClick={yorumEkle} disabled={(!metin.trim() && !dosya) || busy} style={{ ...S.btn, ...S.btnGreen, opacity: ((!metin.trim() && !dosya) || busy) ? 0.4 : 1 }}>Gönder</button>
        </div>
      </div>

      {/* Geçmiş */}
      {gecmis.length > 0 && (
        <div style={S.card}>
          <div style={S.h2}>İşlem geçmişi</div>
          <div style={{ marginTop: 10 }}>
            {gecmis.slice().reverse().map(h => (
              <div key={h.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13, flexWrap: "wrap" }}>
                <span style={S.tag("#eef0ef", T.sub)}>{h.action}</span>
                <span style={{ color: T.ink, flex: 1, minWidth: 120 }}>{h.detail}</span>
                <span style={{ color: T.faint, fontSize: 12 }}>{h.actor} · {new Date(h.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── PERFORMANS RAPORU ── */
function ArizaPerformans({ incidents, depts, staff, onBack }) {
  const [gun, setGun] = useState(30);
  const [excelBusy, setExcelBusy] = useState(false);

  const sinir = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - gun); return d; }, [gun]);
  const kapsam = incidents.filter(t => new Date(t.created_at) >= sinir);
  const kapanan = kapsam.filter(t => t.status === "kapandi");

  const ort = (dizi) => dizi.length ? dizi.reduce((a, b) => a + b, 0) / dizi.length : null;
  const yanitlar = kapsam.map(t => arizaMetrik(t).yanit).filter(x => x !== null);
  const cozumler = kapanan.map(t => arizaMetrik(t).cozum).filter(x => x !== null);
  const slaUygun = kapanan.filter(t => arizaMetrik(t).slaUygun).length;
  const slaOran = kapanan.length ? Math.round((slaUygun / kapanan.length) * 100) : null;
  const ilkSeferde = kapanan.filter(t => !t.reopened_count).length;
  const ilkSeferOran = kapanan.length ? Math.round((ilkSeferde / kapanan.length) * 100) : null;

  /* Departman performansı */
  const deptPerf = [...new Set(kapsam.map(t => t.assigned_dept).filter(Boolean))].map(d => {
    const m = kapsam.filter(t => t.assigned_dept === d);
    const mk = m.filter(t => t.status === "kapandi");
    const c = mk.map(t => arizaMetrik(t).cozum).filter(x => x !== null);
    const uygun = mk.filter(t => arizaMetrik(t).slaUygun).length;
    return { ad: d, toplam: m.length, kapanan: mk.length, acik: m.length - mk.length,
      ortCozum: ort(c), sla: mk.length ? Math.round((uygun / mk.length) * 100) : null };
  }).sort((a, b) => b.toplam - a.toplam);

  /* Kişi performansı */
  const kisiPerf = [...new Set(kapsam.map(t => t.assignee_name).filter(Boolean))].map(k => {
    const m = kapsam.filter(t => t.assignee_name === k);
    const mk = m.filter(t => t.status === "kapandi");
    const c = mk.map(t => arizaMetrik(t).cozum).filter(x => x !== null);
    const y = m.map(t => arizaMetrik(t).yanit).filter(x => x !== null);
    const uygun = mk.filter(t => arizaMetrik(t).slaUygun).length;
    return { ad: k, toplam: m.length, kapanan: mk.length, ortYanit: ort(y), ortCozum: ort(c),
      sla: mk.length ? Math.round((uygun / mk.length) * 100) : null };
  }).sort((a, b) => b.toplam - a.toplam);

  /* Kategori dağılımı */
  const katDagilim = [...new Set(kapsam.map(t => t.category).filter(Boolean))].map(c => ({
    name: c, value: kapsam.filter(t => t.category === c).length,
  })).sort((a, b) => b.value - a.value);

  /* En çok arıza çıkan bölgeler */
  const bolgeler = [...new Set(kapsam.map(t => t.zone).filter(Boolean))].map(z => ({
    name: z, value: kapsam.filter(t => t.zone === z).length,
  })).sort((a, b) => b.value - a.value).slice(0, 8);

  const excelAktar = async () => {
    setExcelBusy(true);
    await stilliExcelIndir([
      {
        ad: "Özet", baslik: "Arıza Yönetimi · Performans Özeti",
        basliklar: ["Gösterge", "Değer"],
        satirlar: [
          ["Dönem", `Son ${gun} gün`],
          ["Toplam arıza", kapsam.length],
          ["Kapatılan", kapanan.length],
          ["Açık kalan", kapsam.length - kapanan.length],
          ["Ortalama kabul süresi", sureMetni(ort(yanitlar))],
          ["Ortalama çözüm süresi", sureMetni(ort(cozumler))],
          ["SLA uyum oranı", slaOran !== null ? `%${slaOran}` : "—"],
          ["İlk seferde çözüm", ilkSeferOran !== null ? `%${ilkSeferOran}` : "—"],
        ],
      },
      {
        ad: "Departman", baslik: "Departman Performansı",
        basliklar: ["Departman", "Toplam", "Kapatılan", "Açık", "Ort. çözüm", "SLA uyum %"],
        sayiSutunlari: [1, 2, 3, 5],
        vurguSatir: (r) => r[5] !== "—" && Number(r[5]) < 70,
        satirlar: deptPerf.map(d => [d.ad, d.toplam, d.kapanan, d.acik, sureMetni(d.ortCozum), d.sla ?? "—"]),
      },
      {
        ad: "Personel", baslik: "Personel Performansı",
        basliklar: ["Personel", "Üstlendiği", "Kapattığı", "Ort. kabul", "Ort. çözüm", "SLA uyum %"],
        sayiSutunlari: [1, 2, 5],
        satirlar: kisiPerf.map(k => [k.ad, k.toplam, k.kapanan, sureMetni(k.ortYanit), sureMetni(k.ortCozum), k.sla ?? "—"]),
      },
      {
        ad: "Arıza Dökümü", baslik: "Arıza Kayıtları",
        basliklar: ["No", "Tarih", "Bölge", "Kategori", "Öncelik", "Durum", "Departman", "Sorumlu",
          "Kabul (dk)", "Çözüm (dk)", "SLA", "Açıklama", "Yapılan işlem"],
        sayiSutunlari: [8, 9],
        vurguSatir: (r) => r[10] === "AŞIM",
        satirlar: kapsam.slice().reverse().map(t => {
          const mm = arizaMetrik(t);
          return [t.ticket_no, trDate(t.created_at), t.zone, t.category || "", tOncelik(t.severity).label,
            tDurum(t.status).label, t.assigned_dept || "", t.assignee_name || "",
            mm.yanit !== null ? Math.round(mm.yanit) : "", mm.cozum !== null ? Math.round(mm.cozum) : "",
            mm.slaUygun ? "UYGUN" : "AŞIM",
            (t.description || "").replace(/[\r\n]/g, " "), (t.resolution_note || "").replace(/[\r\n]/g, " ")];
        }),
      },
    ], "COP31_Ariza_Performans");
    setExcelBusy(false);
  };

  const KART = ({ l, v, alt, renk }) => (
    <div style={{ ...S.card, marginBottom: 0, padding: 16, borderTop: `3px solid ${renk}` }}>
      <div style={{ fontSize: 11.5, color: T.sub, fontWeight: 600, marginBottom: 6 }}>{l}</div>
      <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 23, fontWeight: 800, color: T.ink }}>{v}</div>
      {alt && <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{alt}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={onBack} style={{ ...S.btn, ...S.btnGhost }}>← Arıza listesi</button>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          {[7, 30, 90].map(g => (
            <button key={g} onClick={() => setGun(g)} style={{
              ...S.btn, padding: "8px 14px", fontSize: 12.5,
              background: gun === g ? T.green : "#fbfcfb", color: gun === g ? "#fff" : T.sub,
              border: `1.5px solid ${gun === g ? T.green : T.line}`,
            }}>{g} gün</button>
          ))}
          <button onClick={excelAktar} disabled={excelBusy}
            style={{ ...S.btn, padding: "8px 14px", fontSize: 12.5, background: T.greenSoft, color: T.green, opacity: excelBusy ? 0.5 : 1 }}>
            {excelBusy ? "Hazırlanıyor…" : "⤓ Excel"}
          </button>
        </div>
      </div>

      {kapsam.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 50, color: T.faint }}>
          Bu dönemde arıza kaydı yok.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
            {KART({ l: "Toplam arıza", v: kapsam.length, alt: `${kapanan.length} kapatıldı`, renk: T.blue })}
            {KART({ l: "Ort. kabul süresi", v: sureMetni(ort(yanitlar)), alt: "bildirimden üstlenmeye", renk: T.amber })}
            {KART({ l: "Ort. çözüm süresi", v: sureMetni(ort(cozumler)), alt: "bildirimden çözüme", renk: T.green })}
            {KART({ l: "SLA uyum", v: slaOran !== null ? `%${slaOran}` : "—", alt: "hedef sürede biten", renk: (slaOran ?? 100) >= 80 ? T.green : T.red })}
            {KART({ l: "İlk seferde çözüm", v: ilkSeferOran !== null ? `%${ilkSeferOran}` : "—", alt: "yeniden açılmayan", renk: T.blue })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            {katDagilim.length > 0 && (
              <div style={S.card}>
                <div style={S.h2}>Arıza türü dağılımı</div>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={katDagilim} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: T.sub }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: T.ink }} width={130} />
                    <Tooltip contentStyle={S.tooltip} />
                    <Bar dataKey="value" fill={T.blue} radius={[0, 5, 5, 0]} name="Adet" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {bolgeler.length > 0 && (
              <div style={S.card}>
                <div style={S.h2}>En çok arıza çıkan bölgeler</div>
                <div style={S.sub}>Tekrar eden noktalar kalıcı çözüm gerektirebilir</div>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={bolgeler}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.sub }} />
                    <YAxis tick={{ fontSize: 11, fill: T.sub }} allowDecimals={false} />
                    <Tooltip contentStyle={S.tooltip} />
                    <Bar dataKey="value" fill={T.amber} radius={[5, 5, 0, 0]} name="Arıza" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {deptPerf.length > 0 && (
            <div style={S.card}>
              <div style={S.h2}>Departman performansı</div>
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
                  <thead><tr style={{ borderBottom: `2px solid ${T.line}` }}>
                    {["Departman", "Toplam", "Kapatılan", "Açık", "Ort. çözüm", "SLA uyum"].map((h, i) => (
                      <th key={h} style={{ padding: "9px 8px", textAlign: i === 0 ? "left" : "center", color: T.sub, fontSize: 11.5, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {deptPerf.map(d => (
                      <tr key={d.ad} style={{ borderBottom: `1px solid ${T.line}` }}>
                        <td style={{ padding: "9px 8px", fontWeight: 600, color: T.ink }}>{d.ad}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center" }}>{d.toplam}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center", color: T.green, fontWeight: 600 }}>{d.kapanan}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center", color: d.acik > 0 ? T.amber : T.faint }}>{d.acik}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center" }}>{sureMetni(d.ortCozum)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center" }}>
                          {d.sla !== null ? <span style={S.tag(d.sla >= 80 ? T.greenSoft : d.sla >= 60 ? T.amberSoft : T.redSoft, d.sla >= 80 ? T.green : d.sla >= 60 ? T.amber : T.red)}>%{d.sla}</span> : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {kisiPerf.length > 0 && (
            <div style={S.card}>
              <div style={S.h2}>Personel performansı</div>
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                  <thead><tr style={{ borderBottom: `2px solid ${T.line}` }}>
                    {["Personel", "Üstlendiği", "Kapattığı", "Ort. kabul", "Ort. çözüm", "SLA uyum"].map((h, i) => (
                      <th key={h} style={{ padding: "9px 8px", textAlign: i === 0 ? "left" : "center", color: T.sub, fontSize: 11.5, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {kisiPerf.map(k => (
                      <tr key={k.ad} style={{ borderBottom: `1px solid ${T.line}` }}>
                        <td style={{ padding: "9px 8px", fontWeight: 600, color: T.ink }}>{k.ad}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center" }}>{k.toplam}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center", color: T.green, fontWeight: 600 }}>{k.kapanan}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center" }}>{sureMetni(k.ortYanit)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center" }}>{sureMetni(k.ortCozum)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "center" }}>
                          {k.sla !== null ? <span style={S.tag(k.sla >= 80 ? T.greenSoft : k.sla >= 60 ? T.amberSoft : T.redSoft, k.sla >= 80 ? T.green : k.sla >= 60 ? T.amber : T.red)}>%{k.sla}</span> : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════ PERSONEL (yalnız yönetici) ═══════════ */
function Personnel({ user, staff, roles = [], depts = [], shifts = [], cleanLogs, reload }) {
  const mobil = useIsMobile();
  const shiftNames = shifts.length > 0 ? shifts.map(x => x.name) : FALLBACK_SHIFTS;
  const firstShift = shiftNames[0] || "Tam gün";
  const roleNames = roles.length > 0 ? roles.map(r => r.name) : FALLBACK_ROLES;
  const deptNames = depts.map(d => d.name);
  const firstRole = roleNames[0] || "Temizlik";

  const [view, setView] = useState("ekip");        // ekip | tanimlar
  const [showForm, setShowForm] = useState(false); // yeni personel paneli
  const [q, setQ] = useState("");
  const [fDept, setFDept] = useState("hepsi");
  const [fRole, setFRole] = useState("hepsi");
  const [editId, setEditId] = useState(null);
  const [expandId, setExpandId] = useState(null);  // ekran listesini açan satır

  const blank = { name: "", username: "", role: firstRole, department: "", manager_id: "", shift: firstShift, phone: "", email: "", sifre: "", is_admin: false, perms: ROLE_TABS[firstRole] || [] };
  const [f, setF] = useState(blank);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [e_, setE_] = useState({});
  const setE = (k, v) => setE_(p => ({ ...p, [k]: v }));

  const shown = staff
    .filter(s => staffMatches(s, fDept, fRole))
    .filter(s => {
      const ara = q.trim().toLowerCase();
      if (!ara) return true;
      return s.name.toLowerCase().includes(ara) || (s.username || "").toLowerCase().includes(ara);
    });

  const [busyAdd, setBusyAdd] = useState(false);
  const [addHata, setAddHata] = useState("");
  const [busyEdit, setBusyEdit] = useState(false);
  const [editHata, setEditHata] = useState("");
  const [sifirlaKisi, setSifirlaKisi] = useState(null);  // şifresi sıfırlanacak personel
  const [sifirlaSifre, setSifirlaSifre] = useState("");
  const [sifirlaMsg, setSifirlaMsg] = useState("");
  const [sifirlaBusy, setSifirlaBusy] = useState(false);

  const sifreSifirla = async () => {
    if (!sifirlaKisi || sifirlaSifre.length < MIN_SIFRE) return;
    setSifirlaBusy(true); setSifirlaMsg("");
    const r = await yoneticiSifreSifirla(sifirlaKisi.email, sifirlaSifre);
    setSifirlaBusy(false);
    if (r.hata) { setSifirlaMsg(r.hata); return; }
    setSifirlaMsg("✓ Şifre güncellendi. Yeni şifreyi personele iletin.");
  };

  const add = async () => {
    if (!f.name.trim() || !f.username.trim() || !f.email.trim() || (f.sifre || "").length < MIN_SIFRE || busyAdd) return;
    setBusyAdd(true); setAddHata("");
    const musait = await kullaniciAdiMusait(f.username);
    if (!musait) { setAddHata("Bu kullanıcı adı zaten kullanılıyor."); setBusyAdd(false); return; }
    // 1) Giriş hesabı oluştur (şifre Supabase'de şifreli saklanır)
    const hesap = await hesapOlustur(f.email, f.sifre);
    if (hesap.hata) { setAddHata(hesap.hata); setBusyAdd(false); return; }
    // 2) Personel kaydını oluştur
    const { perms, sifre, ...rest } = f;
    await insertRow("staff", {
      ...rest, name: f.name.trim(), username: f.username.trim().toLowerCase(),
      email: f.email.trim().toLowerCase(), manager_id: f.manager_id || null,
      auth_id: hesap.id, permissions: JSON.stringify(perms || []),
    }, user.name);
    setF(blank); setShowForm(false); setBusyAdd(false); reload();
  };

  const startEdit = (s) => {
    let perms = [];
    try { perms = s.permissions ? JSON.parse(s.permissions) : []; } catch { perms = []; }
    if (!perms.length) perms = ROLE_TABS[s.role] || [];
    setEditId(s.id); setExpandId(null); setEditHata("");
    setE_({ name: s.name, username: s.username || "", role: s.role, department: s.department || "", manager_id: s.manager_id || "", shift: s.shift,
      phone: s.phone || "", email: s.email || "", sifre: "", is_admin: !!s.is_admin, perms,
      _hesapVar: !!(s.email && s.auth_id) });
  };
  const cancelEdit = () => { setEditId(null); setE_({}); setEditHata(""); };

  const saveEdit = async (s) => {
    if (!e_.name?.trim() || busyEdit) return;
    const hesapVar = !!(s.email && s.auth_id);
    setBusyEdit(true); setEditHata("");

    let auth_id = s.auth_id || null;
    let email = s.email || null;

    // Giriş hesabı yoksa ve e-posta+şifre girildiyse hesabı şimdi oluştur
    if (!hesapVar && (e_.email || "").trim()) {
      if ((e_.sifre || "").length < MIN_SIFRE) {
        setEditHata(`Giriş hesabı için şifre en az ${MIN_SIFRE} karakter olmalı.`);
        setBusyEdit(false); return;
      }
      const hesap = await hesapOlustur(e_.email, e_.sifre);
      if (hesap.hata) { setEditHata(hesap.hata); setBusyEdit(false); return; }
      auth_id = hesap.id;
      email = e_.email.trim().toLowerCase();
    }

    if (e_.username?.trim()) {
      const musait = await kullaniciAdiMusait(e_.username, s.id);
      if (!musait) { setEditHata("Bu kullanıcı adı zaten kullanılıyor."); setBusyEdit(false); return; }
    }
    await updateRow("staff", s.id, {
      name: e_.name.trim(), username: (e_.username || "").trim().toLowerCase() || null,
      role: e_.role, department: e_.department || null, manager_id: e_.manager_id || null, shift: e_.shift,
      phone: e_.phone || null, email, auth_id, is_admin: e_.is_admin,
      permissions: JSON.stringify(e_.perms || []),
    }, user.name);
    setBusyEdit(false);
    cancelEdit(); reload();
  };

  /* Bir departmana ait unvanlar. Departmanı boş bırakılmış unvanlar
     "genel" sayılır ve her departmanda görünür. */
  const rolesForDept = (deptName) => {
    if (roles.length === 0) return FALLBACK_ROLES;
    if (!deptName) return roles.map(r => r.name);
    return roles.filter(r => !r.department || r.department === deptName).map(r => r.name);
  };

  /* Departman değişince, seçili unvan o departmana ait değilse temizle */
  const deptChanged = (which, newDept) => {
    const valid = rolesForDept(newDept);
    if (which === "new") setF(p => ({ ...p, department: newDept, role: valid.includes(p.role) ? p.role : "" }));
    else setE_(p => ({ ...p, department: newDept, role: valid.includes(p.role) ? p.role : "" }));
  };

  const roleChanged = (which, newRole) => {
    const suggested = ROLE_TABS[newRole] || [];
    if (which === "new") setF(p => ({ ...p, role: newRole, perms: suggested }));
    else setE_(p => ({ ...p, role: newRole, perms: suggested }));
  };
  const togglePerm = (which, id) => {
    const cur = which === "new" ? (f.perms || []) : (e_.perms || []);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    if (which === "new") setF(p => ({ ...p, perms: next })); else setE_(p => ({ ...p, perms: next }));
  };

  const renderPermPicker = ({ which, isAdmin, perms }) => isAdmin ? (
    <div style={{ fontSize: 12.5, color: T.blue, background: T.blueSoft, borderRadius: 9, padding: 10, marginBottom: 12 }}>
      Yönetici tüm ekranları görür — ayrı seçim gerekmez.
    </div>
  ) : (
    <div style={{ marginBottom: 12 }}>
      <label style={S.label}>Göreceği ekranlar</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 5 }}>
        {ALL_TABS.filter(t => !t.admin).map(t => {
          const on = (perms || []).includes(t.id);
          return (
            <button key={t.id} type="button" onClick={() => togglePerm(which, t.id)} title={t.desc} style={{
              ...S.btn, padding: "7px 9px", fontSize: 12, textAlign: "left",
              background: on ? T.greenSoft : "#fbfcfb", color: on ? T.green : T.sub,
              border: `1.5px solid ${on ? T.green : T.line}`, fontWeight: on ? 700 : 500,
            }}>{on ? "✓ " : ""}{t.label}</button>
          );
        })}
      </div>
      {(perms || []).length === 0 && <div style={{ fontSize: 11.5, color: T.amber, marginTop: 5 }}>En az bir ekran seçin.</div>}
    </div>
  );

  /* Ortak form alanları (yeni + düzenle) */
  const renderFormFields = ({ which, v, onChange, compact }) => (
    <>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "1fr", gap: 10 }}>
        <div style={{ gridColumn: compact ? "1 / -1" : "auto" }}>
          <label style={S.label}>Ad Soyad</label>
          <input style={S.input} placeholder="Ayşe Yılmaz" value={v.name}
            onChange={e => {
              onChange("name", e.target.value);
              // Kullanıcı adı elle değiştirilmediyse isimden otomatik öner
              if (which === "new" && !v._kaOzel) onChange("username", kullaniciAdiOner(e.target.value));
            }} />
        </div>
        <div>
          <label style={S.label}>Kullanıcı adı <span style={{ color: T.red }}>*</span></label>
          <input style={S.input} autoCapitalize="none" spellCheck={false} placeholder="ayse.yilmaz"
            value={v.username || ""}
            onChange={e => {
              onChange("username", e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""));
              onChange("_kaOzel", true);
            }} />
          <div style={{ fontSize: 11, color: T.faint, marginTop: -8, marginBottom: 10 }}>
            Personel sisteme bu adla giriş yapar.
          </div>
        </div>
        <div>
          <label style={S.label}>Departman</label>
          <select style={S.input} value={v.department || ""} onChange={e => deptChanged(which, e.target.value)}>
            <option value="">— Seçilmedi —</option>
            {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Görev / Unvan</label>
          <select style={S.input} value={v.role || ""} onChange={e => roleChanged(which, e.target.value)}
            disabled={deptNames.length > 0 && !v.department}>
            <option value="">{deptNames.length > 0 && !v.department ? "Önce departman seçin" : "— Seçin —"}</option>
            {rolesForDept(v.department).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {v.department && rolesForDept(v.department).length === 0 && (
            <div style={{ fontSize: 11.5, color: T.amber, marginTop: -8, marginBottom: 10 }}>
              Bu departmanda tanımlı unvan yok. "Görev &amp; Departman tanımları"ndan ekleyin.
            </div>
          )}
        </div>
        <div>
          <label style={S.label}>Vardiya</label>
          <select style={S.input} value={v.shift} onChange={e => onChange("shift", e.target.value)}>
            {shiftNames.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Bağlı olduğu yönetici</label>
          <select style={S.input} value={v.manager_id || ""} onChange={e => onChange("manager_id", e.target.value)}>
            <option value="">— Yok (en üst kademe) —</option>
            {staff.filter(x => x.id !== editId).map(x => (
              <option key={x.id} value={x.id}>{x.name}{x.role ? ` · ${x.role}` : ""}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: T.faint, marginTop: -8, marginBottom: 10 }}>
            Yönetici, astlarına görev atayabilir.
          </div>
        </div>
        <div>
          <label style={S.label}>
            E-posta {(which === "new" || !v._hesapVar) && <span style={{ color: T.red }}>*</span>}
          </label>
          <input style={S.input} type="email" autoComplete="off" placeholder="ornek@sirket.com"
            value={v.email} onChange={e => onChange("email", e.target.value)}
            disabled={which === "edit" && v._hesapVar}
            title={which === "edit" && v._hesapVar ? "Giriş e-postası değiştirilemez" : ""} />
          {which === "edit" && v._hesapVar && (
            <div style={{ fontSize: 11, color: T.faint, marginTop: -8, marginBottom: 10 }}>Giriş e-postası değiştirilemez.</div>
          )}
        </div>
        {(which === "new" || !v._hesapVar) && (
          <div>
            <label style={S.label}>Şifre <span style={{ color: T.red }}>*</span></label>
            <input style={S.input} type="password" autoComplete="new-password" placeholder={`En az ${MIN_SIFRE} karakter`}
              value={v.sifre || ""} onChange={e => onChange("sifre", e.target.value)} />
            {(v.sifre || "").length > 0 && (v.sifre || "").length < MIN_SIFRE && (
              <div style={{ fontSize: 11.5, color: T.amber, marginTop: -8, marginBottom: 10 }}>
                Şifre en az {MIN_SIFRE} karakter olmalı.
              </div>
            )}
          </div>
        )}
        <div>
          <label style={S.label}>Telefon</label>
          <input style={S.input} placeholder="05xx…" value={v.phone} onChange={e => onChange("phone", e.target.value)} />
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.sub, margin: "4px 0 12px", cursor: "pointer" }}>
        <input type="checkbox" checked={v.is_admin} onChange={e => onChange("is_admin", e.target.checked)} />
        Yönetici yetkisi (tüm ekranları görür)
      </label>
      {renderPermPicker({ which, isAdmin: v.is_admin, perms: v.perms })}
    </>
  );

  return (
    <div>
      {/* Şifre sıfırlama penceresi */}
      {sifirlaKisi && (
        <div onClick={() => setSifirlaKisi(null)} style={{ position: "fixed", inset: 0, background: "rgba(22,36,29,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...S.card, maxWidth: 400, width: "100%", marginBottom: 0 }}>
            <div style={S.h2}>Şifre sıfırla</div>
            <div style={{ fontSize: 13, color: T.sub, marginBottom: 14, lineHeight: 1.6 }}>
              <b>{sifirlaKisi.name}</b> için yeni bir şifre belirleyin.<br />
              <span style={{ color: T.faint, fontSize: 12.5 }}>{sifirlaKisi.email}</span>
            </div>
            <label style={S.label}>Yeni şifre</label>
            <input style={S.input} type="text" autoComplete="off" placeholder={`En az ${MIN_SIFRE} karakter`}
              value={sifirlaSifre} onChange={e => { setSifirlaSifre(e.target.value); setSifirlaMsg(""); }}
              onKeyDown={e => e.key === "Enter" && sifreSifirla()} />
            <button onClick={() => setSifirlaSifre(Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6).toUpperCase())}
              style={{ ...S.btn, ...S.btnGhost, fontSize: 12.5, padding: "8px 14px", marginBottom: 12 }}>
              Rastgele şifre üret
            </button>
            {sifirlaMsg && (
              <div style={{ fontSize: 13, marginBottom: 12, padding: 11, borderRadius: 9, lineHeight: 1.5,
                background: sifirlaMsg.startsWith("✓") ? T.greenSoft : T.redSoft,
                color: sifirlaMsg.startsWith("✓") ? T.green : T.red }}>
                {sifirlaMsg}
                {sifirlaMsg.startsWith("✓") && (
                  <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 15, fontWeight: 700, background: "#fff", padding: "8px 10px", borderRadius: 7, color: T.ink, wordBreak: "break-all" }}>
                    {sifirlaSifre}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={sifreSifirla} disabled={sifirlaBusy || sifirlaSifre.length < MIN_SIFRE}
                style={{ ...S.btn, ...S.btnGreen, flex: 1, opacity: (sifirlaBusy || sifirlaSifre.length < MIN_SIFRE) ? 0.4 : 1 }}>
                {sifirlaBusy ? "Güncelleniyor…" : "Şifreyi güncelle"}
              </button>
              <button onClick={() => { setSifirlaKisi(null); setSifirlaSifre(""); setSifirlaMsg(""); }} style={{ ...S.btn, ...S.btnGhost }}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Üst sekme: Ekip / Tanımlar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[{ id: "ekip", label: `Ekip (${staff.length})` }, { id: "tanimlar", label: "Görev & Departman tanımları" }].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            ...S.btn, padding: "9px 16px", fontSize: 13.5,
            background: view === v.id ? T.green : "#fbfcfb", color: view === v.id ? "#fff" : T.sub,
            border: `1.5px solid ${view === v.id ? T.green : T.line}`,
          }}>{v.label}</button>
        ))}
        {view === "ekip" && (
          <button onClick={() => { setShowForm(s => !s); setEditId(null); }} style={{ ...S.btn, ...S.btnGreen, marginLeft: "auto" }}>
            {showForm ? "× Kapat" : "+ Yeni personel"}
          </button>
        )}
      </div>

      {view === "tanimlar" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
          <LookupManager user={user} reload={reload} staff={staff} table="departments" items={depts}
            title="1. Departman" hint="Ekip birimleri (örn: Lojistik, Operasyon)."
            placeholder="Örn: Lojistik" usedBy={(s, n) => s.department === n}
            usedMsg="departmanı bazı personelde kullanılıyor. Önce o kişilerin departmanını değiştirin." />
          <LookupManager user={user} reload={reload} staff={staff} table="job_roles" items={roles.filter(r => r.id)}
            title="2. Görev / Unvan" hint="Unvanları departmana bağlayın. Yukarıdan departman seçerek listeyi daraltabilirsiniz."
            placeholder="Örn: Vinç Operatörü" usedBy={(s, n) => s.role === n}
            usedMsg="görevi bazı personelde kullanılıyor. Önce o kişilerin görevini değiştirin."
            depts={depts} withDept />
          <LookupManager user={user} reload={reload} staff={staff} table="shifts" items={shifts}
            title="3. Vardiya" hint="Çalışma saatleri (örn: Sabah 08-17)."
            placeholder="Örn: Sabah (08-17)" usedBy={(s, n) => s.shift === n}
            usedMsg="vardiyası bazı personelde kullanılıyor. Önce o kişilerin vardiyasını değiştirin." />
        </div>
      ) : (
        <>
          {/* Yeni personel paneli (katlanır) */}
          {showForm && (
            <div style={{ ...S.card, borderColor: T.green }}>
              <div style={S.h2}>Yeni personel</div>
              <div style={S.sub}>Personel bu e-posta ve şifreyle giriş yapar. Şifre en az {MIN_SIFRE} karakter olmalıdır.</div>
              {renderFormFields({ which: "new", v: f, onChange: set, compact: true })}
              {addHata && (
                <div style={{ background: T.redSoft, color: T.red, borderRadius: 9, padding: 11, fontSize: 13, marginBottom: 12 }}>{addHata}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={add} disabled={busyAdd || !f.name.trim() || !f.username.trim() || !f.email.trim() || (f.sifre || "").length < MIN_SIFRE || (!f.is_admin && (f.perms || []).length === 0)}
                  style={{ ...S.btn, ...S.btnGreen, opacity: (busyAdd || !f.name.trim() || !f.username.trim() || !f.email.trim() || (f.sifre || "").length < MIN_SIFRE || (!f.is_admin && (f.perms || []).length === 0)) ? 0.4 : 1 }}>
                  {busyAdd ? "Oluşturuluyor…" : "Personeli ekle"}
                </button>
                <button onClick={() => { setShowForm(false); setF(blank); setAddHata(""); }} style={{ ...S.btn, ...S.btnGhost }}>İptal</button>
              </div>
            </div>
          )}

          {/* Arama + filtre */}
          <div style={{ ...S.card, padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...S.input, marginBottom: 0, flex: 1, minWidth: 160, padding: "8px 11px", fontSize: 13 }}
              placeholder="İsim ara…" value={q} onChange={e => setQ(e.target.value)} />
            {deptNames.length > 0 && (
              <select style={{ ...S.input, marginBottom: 0, width: "auto", minWidth: 150, padding: "8px 11px", fontSize: 13 }} value={fDept} onChange={e => setFDept(e.target.value)}>
                <option value="hepsi">Tüm departmanlar</option>
                {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
                <option value="__yok">— Departmansız —</option>
              </select>
            )}
            <select style={{ ...S.input, marginBottom: 0, width: "auto", minWidth: 140, padding: "8px 11px", fontSize: 13 }} value={fRole} onChange={e => setFRole(e.target.value)}>
              <option value="hepsi">Tüm görevler</option>
              {roleNames.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {(q || fDept !== "hepsi" || fRole !== "hepsi") && (
              <button onClick={() => { setQ(""); setFDept("hepsi"); setFRole("hepsi"); }} style={{ ...S.btn, padding: "8px 13px", fontSize: 12.5, ...S.btnGhost }}>Temizle</button>
            )}
            <span style={{ fontSize: 12, color: T.faint, marginLeft: "auto" }}>{shown.length} / {staff.length} personel</span>
          </div>

          {/* Ekip listesi */}
          <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
            {shown.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: T.faint, fontSize: 13.5 }}>Kayıt bulunamadı.</div>
            ) : mobil ? (
              /* ── MOBİL: kart görünümü ── */
              <div>
                {shown.map(s => {
                  const tabs = s.is_admin ? ["Tümü"] : allowedTabsFor(s).map(id => ALL_TABS.find(t => t.id === id)?.label).filter(Boolean);
                  const isEditing = editId === s.id;
                  return (
                    <div key={s.id} style={{ padding: 14, borderBottom: `1px solid ${T.line}`, background: isEditing ? "#fafbfa" : "transparent" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 9, background: s.is_admin ? T.blueSoft : T.greenSoft, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 13, color: s.is_admin ? T.blue : T.green, flexShrink: 0 }}>
                          {s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{s.name}</div>
                          {s.username && <div style={{ fontSize: 11.5, color: T.faint, fontFamily: "monospace" }}>@{s.username}</div>}
                          <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{s.role}</div>
                          {s.department && <div style={{ fontSize: 12, color: T.faint }}>{s.department}</div>}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                            {s.is_admin && <span style={S.tag(T.blueSoft, T.blue)}>Yönetici</span>}
                            <span style={S.tag("#eef0ef", T.sub)}>{s.shift}</span>
                            <span style={S.tag(T.greenSoft, T.green)}>{s.is_admin ? "Tüm ekranlar" : `${tabs.length} ekran`}</span>
                            {!(s.email && s.auth_id) && <span style={S.tag(T.amberSoft, T.amber)}>⚠ giriş yok</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                        <button onClick={() => isEditing ? cancelEdit() : startEdit(s)}
                          style={{ ...S.btn, padding: "9px 14px", fontSize: 13, background: T.blueSoft, color: T.blue, flex: 1 }}>
                          {isEditing ? "Kapat" : "Düzenle"}
                        </button>
                        {s.email && s.auth_id && (
                          <button onClick={() => { setSifirlaKisi(s); setSifirlaSifre(""); setSifirlaMsg(""); }}
                            style={{ ...S.btn, padding: "9px 14px", fontSize: 13, background: T.amberSoft, color: T.amber }}>Şifre</button>
                        )}
                        {s.id !== user.id && (
                          <>
                            <button onClick={async () => { if (window.confirm(`"${s.name}" pasifleştirilsin mi?`)) { await deactivateRow("staff", s.id, user.name); reload(); } }}
                              style={{ ...S.btn, padding: "9px 14px", fontSize: 13, background: "#eef0ef", color: T.sub }}>Pasif</button>
                            <button onClick={async () => { if (window.confirm(`"${s.name}" personel kaydı ve tüm bilgileri KALICI silinecek.\n\nBu işlem geri alınamaz. Devam edilsin mi?`)) { await hardDeleteRow("staff", s.id, user.name); reload(); } }}
                              style={{ ...S.btn, padding: "9px 14px", fontSize: 13, background: T.red, color: "#fff" }}>Sil</button>
                          </>
                        )}
                      </div>
                      {isEditing && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `2px solid ${T.green}` }}>
                          {!e_._hesapVar && (
                            <div style={{ background: T.amberSoft, color: "#7a5c17", borderRadius: 9, padding: 11, fontSize: 12.5, marginBottom: 14, lineHeight: 1.55 }}>
                              Bu personelin <b>giriş hesabı yok</b>. E-posta ve şifre girip kaydederseniz giriş yapabilir.
                            </div>
                          )}
                          {renderFormFields({ which: "edit", v: e_, onChange: setE, compact: false })}
                          {editHata && <div style={{ background: T.redSoft, color: T.red, borderRadius: 9, padding: 11, fontSize: 13, marginBottom: 12 }}>{editHata}</div>}
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEdit(s)} disabled={busyEdit || !e_.name?.trim()}
                              style={{ ...S.btn, ...S.btnGreen, flex: 1, opacity: (busyEdit || !e_.name?.trim()) ? 0.4 : 1 }}>
                              {busyEdit ? "Kaydediliyor…" : "Kaydet"}
                            </button>
                            <button onClick={cancelEdit} style={{ ...S.btn, ...S.btnGhost }}>İptal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 13, tableLayout: "auto" }}>
                  <thead>
                    <tr style={{ background: "#fafbfa", borderBottom: `2px solid ${T.line}` }}>
                      {["Personel", "Görev", "Departman", "Vardiya", "Ekran", "Kayıt", "İşlem"].map((h, i) => (
                        <th key={h + i} style={{ padding: "11px 12px", textAlign: i === 0 ? "left" : i === 6 ? "right" : i >= 4 ? "center" : "left", color: T.sub, fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap", width: i === 6 ? 230 : i === 4 || i === 5 ? 90 : "auto" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(s => {
                      const tabs = s.is_admin ? ["Tümü"] : allowedTabsFor(s).map(id => ALL_TABS.find(t => t.id === id)?.label).filter(Boolean);
                      const isEditing = editId === s.id;
                      return (
                        <>
                          <tr key={s.id} style={{ borderBottom: `1px solid ${T.line}`, background: isEditing ? T.greenSoft : "transparent" }}>
                            <td style={{ padding: "11px 12px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.is_admin ? T.blueSoft : T.greenSoft, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 12, color: s.is_admin ? T.blue : T.green, flexShrink: 0 }}>
                                  {s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, color: T.ink, whiteSpace: "nowrap" }}>{s.name}</div>
                                  {s.username && <div style={{ fontSize: 11, color: T.faint, fontFamily: "monospace" }}>@{s.username}</div>}
                                  {s.is_admin && <div style={{ fontSize: 11, color: T.blue, fontWeight: 600 }}>Yönetici</div>}
                                  {!(s.email && s.auth_id) && (
                                    <div style={{ fontSize: 10.5, color: T.amber, fontWeight: 600 }}>⚠ giriş hesabı yok</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "11px 12px", color: T.sub, whiteSpace: "nowrap" }}>{s.role}</td>
                            <td style={{ padding: "11px 12px", color: T.sub, whiteSpace: "nowrap" }}>
                              {s.department || <span style={{ color: T.faint }}>—</span>}
                              {(() => {
                                const yon = staff.find(x => x.id === s.manager_id);
                                const astSayi = staff.filter(x => x.manager_id === s.id).length;
                                return (
                                  <div style={{ fontSize: 10.5, color: T.faint }}>
                                    {yon ? `▲ ${yon.name}` : ""}{yon && astSayi ? " · " : ""}{astSayi ? `▼ ${astSayi} ast` : ""}
                                  </div>
                                );
                              })()}
                            </td>
                            <td style={{ padding: "11px 12px", color: T.sub, whiteSpace: "nowrap", fontSize: 12.5 }}>{s.shift}</td>
                            <td style={{ padding: "11px 12px", textAlign: "center" }}>
                              <button onClick={() => setExpandId(expandId === s.id ? null : s.id)} title={tabs.join(", ")}
                                style={{ ...S.btn, padding: "4px 10px", fontSize: 11.5, background: s.is_admin ? T.blueSoft : "#eef0ef", color: s.is_admin ? T.blue : T.sub, whiteSpace: "nowrap" }}>
                                {s.is_admin ? "Tümü" : `${tabs.length} ekran`} ▾
                              </button>
                            </td>
                            <td style={{ padding: "11px 12px", textAlign: "center", fontFamily: "'Sora', sans-serif", fontWeight: 700, color: T.green }}>
                              {cleanLogs.filter(c => c.staff_id === s.id).length}
                            </td>
                            <td style={{ padding: "11px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <button onClick={() => isEditing ? cancelEdit() : startEdit(s)}
                                style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.blueSoft, color: T.blue, marginRight: 5 }}>
                                {isEditing ? "Kapat" : "Düzenle"}
                              </button>
                              {s.email && s.auth_id && (
                                <button onClick={() => { setSifirlaKisi(s); setSifirlaSifre(""); setSifirlaMsg(""); }}
                                  title="Şifresini sıfırla" style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.amberSoft, color: T.amber, marginRight: 5 }}>
                                  Şifre
                                </button>
                              )}
                              {s.id !== user.id && (
                                <>
                                  <button onClick={async () => { if (window.confirm(`"${s.name}" pasifleştirilsin mi?`)) { await deactivateRow("staff", s.id, user.name); reload(); } }}
                                    style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: "#eef0ef", color: T.sub, marginRight: 5 }}>Pasif</button>
                                  {DENEME_MODU && (
                                    <button onClick={async () => { if (window.confirm(`"${s.name}" personel kaydı ve tüm bilgileri KALICI silinecek.\n\nBu işlem geri alınamaz. Devam edilsin mi?`)) { await hardDeleteRow("staff", s.id, user.name); reload(); } }}
                                      style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.red, color: "#fff" }}>Sil</button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>

                          {/* Ekran listesi (katlanır) */}
                          {expandId === s.id && !isEditing && (
                            <tr key={s.id + "-x"} style={{ borderBottom: `1px solid ${T.line}`, background: "#fafbfa" }}>
                              <td colSpan={7} style={{ padding: "10px 14px" }}>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                  <span style={{ fontSize: 11.5, color: T.faint, fontWeight: 600, marginRight: 4 }}>GÖRDÜĞÜ EKRANLAR:</span>
                                  {tabs.map(t => <span key={t} style={S.tag(T.greenSoft, T.green)}>{t}</span>)}
                                  {s.email && <span style={{ fontSize: 12, color: T.sub, marginLeft: "auto" }}>✉ {s.email}</span>}
                                  {s.phone && <span style={{ fontSize: 12, color: T.sub }}>☎ {s.phone}</span>}
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Düzenleme satırı */}
                          {isEditing && (
                            <tr key={s.id + "-e"} style={{ borderBottom: `2px solid ${T.green}`, background: "#fafbfa" }}>
                              <td colSpan={7} style={{ padding: 18 }}>
                                <div style={{ maxWidth: 720 }}>
                                  {!e_._hesapVar && (
                                    <div style={{ background: T.amberSoft, color: "#7a5c17", borderRadius: 9, padding: 11, fontSize: 12.5, marginBottom: 14, lineHeight: 1.55 }}>
                                      Bu personelin <b>giriş hesabı yok</b>. E-posta ve şifre girip kaydederseniz
                                      giriş hesabı oluşturulur ve sisteme girebilir. Boş bırakırsanız yalnız bilgileri güncellenir.
                                    </div>
                                  )}
                                  {renderFormFields({ which: "edit", v: e_, onChange: setE, compact: true })}
                                  {editHata && (
                                    <div style={{ background: T.redSoft, color: T.red, borderRadius: 9, padding: 11, fontSize: 13, marginBottom: 12 }}>{editHata}</div>
                                  )}
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => saveEdit(s)} disabled={busyEdit || !e_.name?.trim()}
                                      style={{ ...S.btn, ...S.btnGreen, opacity: (busyEdit || !e_.name?.trim()) ? 0.4 : 1 }}>
                                      {busyEdit ? "Kaydediliyor…" : "Kaydet"}
                                    </button>
                                    <button onClick={cancelEdit} style={{ ...S.btn, ...S.btnGhost }}>İptal</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </>
      )}
    </div>
  );
}


/* ═══════════ QR KODLAR ═══════════ */
function QRManager({ zones = [] }) {
  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={S.h2}>Bölge QR kodları</div>
            <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.65 }}>
              Her bölge için otomatik QR kod üretilir. Yazdırıp alan girişlerine asın. Personel telefonla
              okuttuğunda sistem o bölge seçili açılır; kendi PIN'i ile giriş yaptığı için kayıt otomatik onun adına oluşur.
              Yeni bölge eklemek için <b>Bölgeler</b> sekmesini kullanın — QR kod anında burada görünür.
            </div>
          </div>
          {zones.length > 0 && <button onClick={() => window.print()} style={{ ...S.btn, ...S.btnGreen, flexShrink: 0 }}>Tümünü yazdır</button>}
        </div>
      </div>
      {zones.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 40, color: T.faint }}>
          Henüz bölge yok. <b>Bölgeler</b> sekmesinden bölge ekleyin, QR kodlar otomatik oluşsun.
        </div>
      ) : (
        <div className="print-area" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
          {zones.map(z => (
            <div key={z.id} style={{ ...S.card, marginBottom: 0, textAlign: "center", pageBreakInside: "avoid" }}>
              <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 15, color: T.ink }}>{z.name}</div>
              <div style={{ fontSize: 12, color: T.sub, marginBottom: 14 }}>{z.id}{z.area ? ` · ${z.area}` : ""}</div>
              <div style={{ background: "#fff", display: "inline-block", padding: 12, borderRadius: 12, border: `1px solid ${T.line}` }}>
                <QRCodeSVG value={`${APP_URL}/?zone=${z.id}`} size={150} level="M" fgColor={T.ink} />
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: T.green }}>Temizlik kaydı için okutun</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════ BÖLGE YÖNETİMİ (yalnız yönetici) ═══════════ */
function ZonesManager({ user, zones = [], cleanLogs, wasteLogs, reload }) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editArea, setEditArea] = useState("");

  // Sıradaki bölge kodunu otomatik üret: Z01, Z02 …
  const nextCode = useMemo(() => {
    const nums = zones.map(z => parseInt(String(z.code || "").replace(/\D/g, ""), 10)).filter(n => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 0;
    return "Z" + String(max + 1).padStart(2, "0");
  }, [zones]);

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    await insertRow("zones", { code: nextCode, name: name.trim(), area: area.trim() || null }, user.name);
    setName(""); setArea(""); setBusy(false); reload();
  };

  const startEdit = (z) => { setEditId(z.id); setEditName(z.name); setEditArea(z.area || ""); };
  const cancelEdit = () => { setEditId(null); setEditName(""); setEditArea(""); };
  const saveEdit = async (z) => {
    if (!editName.trim()) return;
    await updateRow("zones", z.dbId || z.id, { name: editName.trim(), area: editArea.trim() || null }, user.name);
    cancelEdit(); reload();
  };

  const remove = async (z) => {
    const used = cleanLogs.some(c => c.zone === z.id) || wasteLogs.some(w => w.zone === z.id);
    const msg = used
      ? `"${z.name}" bölgesinde kayıtlar var. Bölge pasifleştirilecek (kayıtlar korunur, listelerden kalkar). Devam edilsin mi?`
      : `"${z.name}" bölgesi kaldırılsın mı?`;
    if (!window.confirm(msg)) return;
    await deactivateRow("zones", z.dbId || z.id, user.name);
    reload();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.h2}>Yeni bölge ekle</div>
        <div style={S.sub}>Kod otomatik atanır ({nextCode}). Eklediğiniz an QR kodu oluşur.</div>
        <label style={S.label}>Bölge adı</label>
        <input style={S.input} placeholder="Örn: B2 Sergi Holü" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()} />
        <label style={S.label}>Alan / m² (isteğe bağlı)</label>
        <input style={S.input} placeholder="Örn: 1.500 m²" value={area} onChange={e => setArea(e.target.value)} />
        <button onClick={add} disabled={!name.trim() || busy} style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: (!name.trim() || busy) ? 0.4 : 1 }}>
          {busy ? "Ekleniyor…" : `Bölge ekle (${nextCode})`}
        </button>
        {!isOnline && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: T.amber, background: T.amberSoft, borderRadius: 10, padding: 12 }}>
            Yerel modda bölgeler kalıcı kaydedilmez. Merkezi mod için schema_zones.sql çalıştırılmalı.
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.h2}>Bölgeler ({zones.length})</div>
        {zones.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>Henüz bölge yok.</div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {zones.map(z => (
              <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ background: "#fff", padding: 5, borderRadius: 8, border: `1px solid ${T.line}`, flexShrink: 0 }}>
                  <QRCodeSVG value={`${APP_URL}/?zone=${z.id}`} size={44} level="M" fgColor={T.ink} />
                </div>
                {editId === z.id ? (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input style={{ ...S.input, marginBottom: 6, padding: "7px 10px" }} value={editName} onChange={e => setEditName(e.target.value)}
                      placeholder="Bölge adı" onKeyDown={e => e.key === "Enter" && saveEdit(z)} autoFocus />
                    <input style={{ ...S.input, marginBottom: 0, padding: "7px 10px" }} value={editArea} onChange={e => setEditArea(e.target.value)}
                      placeholder="Alan / m²" onKeyDown={e => e.key === "Enter" && saveEdit(z)} />
                  </div>
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5, color: T.ink }}>{z.name}</div>
                    <div style={{ fontSize: 12.5, color: T.sub }}>{z.code}{z.area ? ` · ${z.area}` : ""}</div>
                  </div>
                )}
                {editId === z.id ? (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => saveEdit(z)} style={{ ...S.btn, padding: "7px 12px", fontSize: 12, ...S.btnGreen }}>Kaydet</button>
                    <button onClick={cancelEdit} style={{ ...S.btn, padding: "7px 12px", fontSize: 12, ...S.btnGhost }}>İptal</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => startEdit(z)} style={{ ...S.btn, padding: "7px 12px", fontSize: 12, background: T.blueSoft, color: T.blue }}>Düzenle</button>
                    <button onClick={() => remove(z)} style={{ ...S.btn, padding: "7px 12px", fontSize: 12, background: T.redSoft, color: T.red }}>Kaldır</button>
                    {DENEME_MODU && (
                      <button title="Kalıcı sil (deneme modu)" onClick={async () => { if (window.confirm(`"${z.name}" bölgesi ve QR kodu KALICI silinecek.\n\nBu işlem geri alınamaz. Devam edilsin mi?`)) { await hardDeleteRow("zones", z.dbId || z.id, user.name); reload(); } }}
                        style={{ ...S.btn, padding: "7px 12px", fontSize: 12, background: T.red, color: "#fff" }}>Sil</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════ HEDEFLER (ISO 20121) ═══════════ */
function Targets({ user, targets, reload }) {
  const [yedekBusy, setYedekBusy] = useState(false);

  /* Tüm veriyi tek JSON dosyası olarak indir (elle yedek) */
  const yedekAl = async () => {
    setYedekBusy(true);
    try {
      const tablolar = ["staff", "zones", "job_roles", "departments", "clean_logs",
        "waste_logs", "incidents", "assignments", "targets", "tasks", "task_comments"];
      const yedek = { _tarih: new Date().toISOString(), _alan: user.name, _surum: "cop31-v1" };
      for (const t of tablolar) yedek[t] = await fetchAll(t);
      const blob = new Blob([JSON.stringify(yedek, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `cop31_yedek_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
      a.click();
    } catch (e) {
      alert("Yedek alınamadı: " + e.message);
    }
    setYedekBusy(false);
  };

  const [vals, setVals] = useState({});
  useEffect(() => {
    setVals(Object.fromEntries(targets.map(t => [t.key, t.value])));
  }, [targets]);

  const save = async (t) => {
    await updateRow("targets", t.id, { value: parseFloat(vals[t.key]) || 0 }, user.name);
    reload();
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={S.card}>
        <div style={S.h2}>Sürdürülebilirlik hedefleri</div>
        <div style={S.sub}>ISO 20121 hedef–gerçekleşen takibi. Dashboard bu değerlerle karşılaştırır ve aşımda uyarır.</div>
        {targets.length === 0 ? (
          <div style={{ fontSize: 13.5, color: T.sub, background: T.amberSoft, borderRadius: 10, padding: 14 }}>
            Hedefler yalnız merkezi modda düzenlenir. Supabase kurulumunu tamamlayın (KURULUM.md).
          </div>
        ) : targets.map(t => (
          <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>{t.label}</label>
              <input style={S.input} type="number" value={vals[t.key] ?? ""} onChange={e => setVals(p => ({ ...p, [t.key]: e.target.value }))} />
            </div>
            <button onClick={() => save(t)} style={{ ...S.btn, ...S.btnGhost, marginBottom: 14 }}>Kaydet</button>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, borderTop: `3px solid ${T.blue}` }}>
        <div style={S.h2}>Veri yedeği</div>
        <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, marginBottom: 14 }}>
          Tüm kayıtları (personel, bölge, temizlik, atık, olay, görev, yorum) tek bir dosya olarak indirir.
          Sunucudaki otomatik yedeğe ek olarak, önemli günlerde elle de yedek almanız önerilir.
          Dosyayı bilgisayarınızda veya bulutta saklayın.
        </div>
        <button onClick={yedekAl} disabled={yedekBusy} style={{ ...S.btn, ...S.btnGreen, opacity: yedekBusy ? 0.5 : 1 }}>
          {yedekBusy ? "Hazırlanıyor…" : "Yedek indir (JSON)"}
        </button>
      </div>

      <div style={{ ...S.card, fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>
        Karbon faktörleri: geri dönüşüm {EMISSION["Geri Dönüşüm Tesisi"]}, kompost {EMISSION["Kompost Alanı"]}, depolama {EMISSION["Düzenli Depolama"]} kg CO₂e/kg;
        taşıma {EMISSION.TRANSPORT_PER_TON_KM} kg CO₂e/ton-km. Resmî raporlamada ulusal faktörlerle doğrulanmalıdır.
      </div>
    </div>
  );
}

/* ═══════════ GÖREV / UNVAN YÖNETİMİ (yalnız yönetici) ═══════════ */
/* Görev ve departman için ortak ekle/düzenle/sil bileşeni */
function LookupManager({ user, reload, staff, table, items, title, hint, placeholder, usedBy, usedMsg, depts = [], withDept }) {
  const [name, setName] = useState("");
  const [dept, setDept] = useState("__hepsi");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDept, setEditDept] = useState("");
  const [openDept, setOpenDept] = useState(null); // gruplama açma/kapama

  const add = async () => {
    if (!name.trim() || busy) return;
    if (items.some(r => r.name.toLowerCase() === name.trim().toLowerCase())) { alert("Bu kayıt zaten var."); return; }
    if (withDept && dept === "__hepsi") { alert("Önce yukarıdan bir departman seçin (veya 'Genel')."); return; }
    setBusy(true);
    await insertRow(table, withDept ? { name: name.trim(), department: dept || null } : { name: name.trim() }, user.name);
    setName(""); setBusy(false); reload();
  };
  const startEdit = (r) => { setEditId(r.id); setEditName(r.name); setEditDept(r.department || ""); };
  const cancelEdit = () => { setEditId(null); setEditName(""); setEditDept(""); };
  const saveEdit = async (r) => {
    if (!editName.trim()) return;
    await updateRow(table, r.id, withDept ? { name: editName.trim(), department: editDept || null } : { name: editName.trim() }, user.name);
    cancelEdit(); reload();
  };
  const remove = async (r) => {
    if (staff.some(s => usedBy(s, r.name))) { alert(`"${r.name}" ${usedMsg}`); return; }
    if (!window.confirm(`"${r.name}" silinsin mi?`)) return;
    await deactivateRow(table, r.id, user.name);
    reload();
  };

  const row = (r) => {
    const count = staff.filter(s => usedBy(s, r.name)).length;
    return (
      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
        {editId === r.id ? (
          <>
            <div style={{ flex: 1 }}>
              <input style={{ ...S.input, marginBottom: withDept ? 6 : 0, padding: "7px 10px" }} value={editName}
                onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(r)} autoFocus />
              {withDept && (
                <select style={{ ...S.input, marginBottom: 0, padding: "7px 10px", fontSize: 13 }} value={editDept} onChange={e => setEditDept(e.target.value)}>
                  <option value="">— Tüm departmanlar (genel) —</option>
                  {depts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              )}
            </div>
            <button onClick={() => saveEdit(r)} style={{ ...S.btn, padding: "7px 11px", fontSize: 12, ...S.btnGreen }}>Kaydet</button>
            <button onClick={cancelEdit} style={{ ...S.btn, padding: "7px 11px", fontSize: 12, ...S.btnGhost }}>İptal</button>
          </>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: T.ink }}>{r.name}</div>
              <div style={{ fontSize: 11.5, color: T.faint }}>
                {count} personel
                {withDept && (r.department
                  ? <span style={{ color: T.green }}> · {r.department}</span>
                  : <span style={{ color: T.amber }}> · genel</span>)}
              </div>
            </div>
            <button onClick={() => startEdit(r)} style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.blueSoft, color: T.blue }}>Düzenle</button>
            <button onClick={() => remove(r)} style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.redSoft, color: T.red }}>Sil</button>
          </>
        )}
      </div>
    );
  };

  /* Unvanları departmana göre grupla (okunaklı olsun) */
  const groups = withDept ? (() => {
    const g = [];
    if (dept === "__hepsi") {
      depts.forEach(d => {
        const list = items.filter(r => r.department === d.name);
        if (list.length) g.push({ key: d.name, label: d.name, list });
      });
      const genel = items.filter(r => !r.department);
      if (genel.length) g.push({ key: "__genel", label: "Genel (tüm departmanlar)", list: genel });
    } else if (dept === "") {
      const genel = items.filter(r => !r.department);
      g.push({ key: "__genel", label: "Genel (tüm departmanlar)", list: genel });
    } else {
      const list = items.filter(r => r.department === dept);
      g.push({ key: dept, label: dept, list });
      const genel = items.filter(r => !r.department);
      if (genel.length) g.push({ key: "__genel", label: "Genel (her departmanda görünür)", list: genel });
    }
    return g;
  })() : null;

  return (
    <div style={S.card}>
      <div style={S.h2}>{title}</div>
      <div style={S.sub}>{hint}</div>

      {withDept && (
        <>
          <label style={S.label}>Departman</label>
          <select style={{ ...S.input, fontSize: 13, marginBottom: 8 }} value={dept} onChange={e => setDept(e.target.value)}>
            <option value="__hepsi">Tümünü göster</option>
            {depts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
            <option value="">Genel (tüm departmanlarda görünür)</option>
          </select>
          <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 10, marginTop: -4 }}>
            {dept === "__hepsi"
              ? "Tüm unvanlar listeleniyor. Eklemek için önce departman seçin."
              : dept === ""
                ? "Eklenecek unvan tüm departmanlarda görünecek."
                : `Eklenecek unvan "${dept}" departmanına bağlanacak.`}
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input style={{ ...S.input, marginBottom: 0 }} placeholder={placeholder} value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button onClick={add} disabled={!name.trim() || busy} style={{ ...S.btn, ...S.btnGreen, flexShrink: 0, opacity: (!name.trim() || busy) ? 0.4 : 1 }}>
          Ekle
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>Henüz kayıt yok.</div>
      ) : withDept ? (
        groups.every(g => g.list.length === 0) ? (
          <div style={{ padding: "18px 0", textAlign: "center", color: T.faint, fontSize: 13 }}>
            Bu departmanda tanımlı unvan yok. Yukarıdan ekleyebilirsiniz.
          </div>
        ) : groups.filter(g => g.list.length > 0).map(g => (
          <div key={g.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: g.key === "__genel" ? T.amber : T.green, textTransform: "uppercase", letterSpacing: 0.4, padding: "8px 0 2px", borderTop: `1px solid ${T.line}` }}>
              {g.label} ({g.list.length})
            </div>
            {g.list.map(row)}
          </div>
        ))
      ) : items.map(row)}
    </div>
  );
}

/* ═══════════ İŞ TAKİBİ (GÖREV YÖNETİMİ) ═══════════ */
const PRIORITIES = [
  { id: "dusuk", label: "Düşük", color: "#2f6fb2" },
  { id: "orta", label: "Orta", color: "#b07d1e" },
  { id: "yuksek", label: "Yüksek", color: "#b03030" },
];
/* Onay akışı: yapilacak → devam → onay_bekliyor → tamamlandi
   Yönetici onay_bekliyor'u "tamamlandi" yapar ya da "revize" ile geri çevirir. */
const STATUSES = [
  { id: "yapilacak", label: "Yapılacak", color: "#5c6b63", soft: "#eef0ef" },
  { id: "devam", label: "Devam ediyor", color: "#b07d1e", soft: "#faf3e3" },
  { id: "onay_bekliyor", label: "Onay bekliyor", color: "#2f6fb2", soft: "#e9f1f9" },
  { id: "revize", label: "Revize gerekli", color: "#b03030", soft: "#fbeaea" },
  { id: "tamamlandi", label: "Tamamlandı", color: "#1e6b45", soft: "#e6f2ec" },
];
const statOf = (id) => STATUSES.find(s => s.id === id) || STATUSES[0];
const priOf = (id) => PRIORITIES.find(p => p.id === id) || PRIORITIES[1];
const parseCl = (s) => { try { return JSON.parse(s || "[]"); } catch { return []; } };

function TaskManager({ user, staff, tasks, roles = [], depts = [], reload }) {
  const isAdmin = user.is_admin;
  const mobil = useIsMobile();
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("acik");
  const [dept, setDept] = useState("hepsi");
  const [role, setRole] = useState("hepsi");
  const [ara, setAra] = useState("");
  const [sirala, setSirala] = useState("yeni");     // yeni | termin | oncelik | kisi
  const [gorunum, setGorunum] = useState("liste");  // liste | pano

  const staffIds = useMemo(() => new Set(
    staff.filter(s => staffMatches(s, dept, role)).map(s => s.id)
  ), [staff, dept, role]);
  const filtering = dept !== "hepsi" || role !== "hepsi";

  useEffect(() => {
    (async () => {
      const mine = tasks.filter(t => t.assignee_id === user.id && !t.seen);
      if (mine.length) { for (const t of mine) await updateRow("tasks", t.id, { seen: true }, user.name); reload(); }
    })();
  }, []); // eslint-disable-line

  const today0 = new Date(new Date().toDateString());

  const temel = (isAdmin ? tasks : tasks.filter(t => t.assignee_id === user.id || t.assigned_by === user.name))
    .filter(t => !filtering || staffIds.has(t.assignee_id))
    .filter(t => {
      const q = ara.trim().toLowerCase();
      if (!q) return true;
      return (t.title || "").toLowerCase().includes(q)
        || (t.description || "").toLowerCase().includes(q)
        || (t.assignee_name || "").toLowerCase().includes(q);
    });

  const siralaFn = (a, b) => {
    if (sirala === "termin") {
      if (!a.due_date) return 1; if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    }
    if (sirala === "oncelik") {
      const w = { yuksek: 0, orta: 1, dusuk: 2 };
      return (w[a.priority] ?? 1) - (w[b.priority] ?? 1);
    }
    if (sirala === "kisi") return (a.assignee_name || "").localeCompare(b.assignee_name || "", "tr");
    return new Date(b.created_at) - new Date(a.created_at);
  };

  const visible = temel
    .filter(t => filter === "acik" ? t.status !== "tamamlandi" : filter === "hepsi" ? true : t.status === filter)
    .slice().sort(siralaFn);

  /* ── Biçimli Excel çıktısı (çok sekmeli) ── */
  const [excelBusy, setExcelBusy] = useState(false);
  const exceleAktar = async () => {
    setExcelBusy(true);
    const liste = temel.slice().sort(siralaFn);

    const gecikmeGun = (t) => (t.due_date && t.status !== "tamamlandi" && new Date(t.due_date) < today0)
      ? Math.ceil((today0 - new Date(t.due_date)) / 86400000) : 0;

    /* 1. sekme — görev dökümü */
    const gorevSekmesi = {
      ad: "Görevler",
      baslik: "COP31 · Görev Takip Raporu",
      basliklar: ["Görev", "Açıklama", "Atayan", "Sorumlu", "Departman", "Durum", "Öncelik",
        "Oluşturma", "Termin", "Gecikme (gün)", "İlerleme", "Devir", "Tamamlanma", "Onaylayan", "Revize notu"],
      sayiSutunlari: [9, 11],
      vurguSatir: (r) => Number(r[9]) > 0,
      satirlar: liste.map(t => {
        const c = parseCl(t.checklist);
        return [
          t.title || "",
          (t.description || "").replace(/[\r\n]/g, " "),
          t.assigned_by || "",
          t.assignee_name || "",
          t.department || "",
          statOf(t.status).label,
          priOf(t.priority).label,
          trDate(t.created_at),
          t.due_date ? new Date(t.due_date).toLocaleDateString("tr-TR") : "",
          gecikmeGun(t),
          c.length ? `${c.filter(i => i.done).length}/${c.length}` : "",
          t.reassign_count || 0,
          t.approved_at ? new Date(t.approved_at).toLocaleDateString("tr-TR") : "",
          t.approved_by || "",
          (t.reject_note || "").replace(/[\r\n]/g, " "),
        ];
      }),
      altBilgi: `Toplam ${liste.length} görev · ${liste.filter(t => t.status === "tamamlandi").length} tamamlandı · ${liste.filter(t => gecikmeGun(t) > 0).length} geciken`,
    };

    /* 2. sekme — kişi bazlı özet */
    const kisiler = [...new Set(liste.map(t => t.assignee_name).filter(Boolean))];
    const kisiSekmesi = {
      ad: "Kişi Özeti",
      baslik: "Kişi Bazlı Görev Özeti",
      basliklar: ["Personel", "Departman", "Toplam", "Yapılacak", "Devam", "Onay bekleyen", "Tamamlanan", "Geciken", "Başarı %"],
      sayiSutunlari: [2, 3, 4, 5, 6, 7, 8],
      vurguSatir: (r) => Number(r[7]) > 0,
      satirlar: kisiler.map(ad => {
        const m = liste.filter(t => t.assignee_name === ad);
        const tamam = m.filter(t => t.status === "tamamlandi").length;
        return [
          ad,
          m[0]?.department || "",
          m.length,
          m.filter(t => t.status === "yapilacak").length,
          m.filter(t => t.status === "devam").length,
          m.filter(t => t.status === "onay_bekliyor").length,
          tamam,
          m.filter(t => gecikmeGun(t) > 0).length,
          m.length ? Math.round((tamam / m.length) * 100) : 0,
        ];
      }).sort((a, b) => b[2] - a[2]),
    };

    /* 3. sekme — departman özeti */
    const deptler = [...new Set(liste.map(t => t.department).filter(Boolean))];
    const deptSekmesi = deptler.length ? {
      ad: "Departman Özeti",
      baslik: "Departman Bazlı Görev Özeti",
      basliklar: ["Departman", "Toplam görev", "Tamamlanan", "Açık", "Geciken", "Başarı %"],
      sayiSutunlari: [1, 2, 3, 4, 5],
      vurguSatir: (r) => Number(r[4]) > 0,
      satirlar: deptler.map(d => {
        const m = liste.filter(t => t.department === d);
        const tamam = m.filter(t => t.status === "tamamlandi").length;
        return [d, m.length, tamam, m.length - tamam, m.filter(t => gecikmeGun(t) > 0).length,
          m.length ? Math.round((tamam / m.length) * 100) : 0];
      }).sort((a, b) => b[1] - a[1]),
    } : null;

    const sekmeler = [gorevSekmesi, kisiSekmesi, ...(deptSekmesi ? [deptSekmesi] : [])];
    await stilliExcelIndir(sekmeler, "COP31_Gorev_Raporu");
    setExcelBusy(false);
  };

  if (openId) {
    const t = tasks.find(x => x.id === openId);
    if (!t) { setOpenId(null); return null; }
    return <TaskDetail task={t} user={user} isAdmin={isAdmin} staff={staff} onBack={() => setOpenId(null)} reload={reload} />;
  }

  /* Tek görev satırı */
  const satir = (t) => {
    const st = statOf(t.status), pr = priOf(t.priority);
    const cl = parseCl(t.checklist);
    const done = cl.filter(i => i.done).length;
    const overdue = t.due_date && t.status !== "tamamlandi" && new Date(t.due_date) < today0;
    return (
      <div key={t.id} onClick={() => setOpenId(t.id)} style={{ padding: "13px 0", borderBottom: `1px solid ${T.line}`, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={S.tag(st.soft, st.color)}>{st.label}</span>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: T.ink, flex: 1, minWidth: 140 }}>{t.title}</span>
          <span style={S.tag(pr.color + "1a", pr.color)}>{pr.label}</span>
          {t.assigned_by === user.name && (
            <button onClick={async (e) => {
              e.stopPropagation();
              if (!window.confirm(`"${t.title}" görevi, yorumları ve ekleriyle birlikte KALICI silinecek.\n\nBu işlem geri alınamaz. Devam edilsin mi?`)) return;
              await hardDeleteRow("tasks", t.id, user.name); reload();
            }} title="Bu görevi siz atadınız — silebilirsiniz"
              style={{ ...S.btn, padding: "4px 10px", fontSize: 11.5, background: T.redSoft, color: T.red, minHeight: 0 }}>Sil</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 12.5, color: T.sub, alignItems: "center" }}>
          <span>→ {t.assignee_name}</span>
          {t.department && <span style={{ color: T.faint }}>{t.department}</span>}
          {cl.length > 0 && <span>☑ {done}/{cl.length}</span>}
          {t.reassign_count > 0 && <span style={{ color: T.faint }}>↪ {t.reassign_count}</span>}
          {t.due_date && <span style={{ color: overdue ? T.red : T.faint, fontWeight: overdue ? 700 : 400 }}>
            Termin: {new Date(t.due_date).toLocaleDateString("tr-TR")}{overdue ? " (gecikti)" : ""}
          </span>}
          <span style={{ marginLeft: "auto", color: T.blue, fontWeight: 600 }}>Aç →</span>
        </div>
      </div>
    );
  };

  /* Kanban panosu */
  const pano = () => (
    <div style={{ display: "grid", gridTemplateColumns: mobil ? "1fr" : "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
      {STATUSES.map(s => {
        const liste = temel.filter(t => t.status === s.id).sort(siralaFn);
        return (
          <div key={s.id} style={{ background: "#fafbfa", borderRadius: 12, border: `1px solid ${T.line}`, padding: 10, minHeight: 120 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{s.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: T.faint }}>{liste.length}</span>
            </div>
            {liste.length === 0 ? (
              <div style={{ fontSize: 12, color: T.faint, textAlign: "center", padding: "14px 0" }}>—</div>
            ) : liste.map(t => {
              const pr = priOf(t.priority);
              const overdue = t.due_date && t.status !== "tamamlandi" && new Date(t.due_date) < today0;
              return (
                <div key={t.id} onClick={() => setOpenId(t.id)} style={{
                  background: T.surface, borderRadius: 9, border: `1px solid ${T.line}`,
                  padding: 10, marginBottom: 8, cursor: "pointer", borderLeft: `3px solid ${pr.color}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.4 }}>{t.title}</div>
                  <div style={{ fontSize: 11.5, color: T.sub, marginTop: 5 }}>{t.assignee_name}</div>
                  {t.due_date && (
                    <div style={{ fontSize: 11, color: overdue ? T.red : T.faint, marginTop: 3, fontWeight: overdue ? 700 : 400 }}>
                      {new Date(t.due_date).toLocaleDateString("tr-TR")}{overdue ? " ⚠" : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      {isAdmin && (
        <FilterBar depts={depts} roles={roles} dept={dept} setDept={setDept} role={role} setRole={setRole}
          note={filtering ? `${visible.length} görev gösteriliyor` : null} />
      )}
      <div style={{ display: "grid", gridTemplateColumns: (isAdmin && !mobil) ? "minmax(300px, 380px) 1fr" : "1fr", gap: 16, alignItems: "start" }}>
        {isAdmin && <NewTaskForm user={user} staff={staff} roles={roles} depts={depts} reload={reload} />}

        <div style={S.card}>
          {/* Başlık + araçlar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={S.h2}>{isAdmin ? "Tüm görevler" : "Görevlerim"}</div>
              <div style={{ fontSize: 13, color: T.sub }}>{visible.length} görev</div>
            </div>
            <button onClick={() => setGorunum(g => g === "liste" ? "pano" : "liste")}
              style={{ ...S.btn, padding: "8px 13px", fontSize: 12.5, ...S.btnGhost }}>
              {gorunum === "liste" ? "▦ Pano" : "☰ Liste"}
            </button>
            <button onClick={exceleAktar} disabled={excelBusy} title="Biçimli Excel raporu indir"
              style={{ ...S.btn, padding: "8px 13px", fontSize: 12.5, background: T.greenSoft, color: T.green, opacity: excelBusy ? 0.5 : 1 }}>
              {excelBusy ? "Hazırlanıyor…" : "⤓ Excel"}
            </button>
          </div>

          {/* Arama + sıralama */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input style={{ ...S.input, marginBottom: 0, flex: 1, minWidth: 150, padding: "9px 12px", fontSize: 14 }}
              placeholder="Görev ara…" value={ara} onChange={e => setAra(e.target.value)} />
            <select style={{ ...S.input, marginBottom: 0, width: "auto", minWidth: 150, padding: "9px 12px", fontSize: 13.5 }}
              value={sirala} onChange={e => setSirala(e.target.value)}>
              <option value="yeni">En yeni</option>
              <option value="termin">Termine göre</option>
              <option value="oncelik">Önceliğe göre</option>
              <option value="kisi">Kişiye göre</option>
            </select>
          </div>

          {/* Durum sekmeleri */}
          {gorunum === "liste" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
              {[{ id: "acik", label: "Açık" }, { id: "hepsi", label: "Hepsi" }, ...STATUSES].map(s => (
                <button key={s.id} onClick={() => setFilter(s.id)} style={{
                  ...S.btn, padding: "6px 11px", fontSize: 12, minHeight: 0,
                  background: filter === s.id ? T.green : "#fbfcfb",
                  color: filter === s.id ? "#fff" : T.sub,
                  border: `1.5px solid ${filter === s.id ? T.green : T.line}`,
                }}>{s.label}</button>
              ))}
            </div>
          )}

          {gorunum === "pano" ? pano() : (
            visible.length === 0 ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>
                {ara ? "Aramanıza uyan görev yok." : isAdmin ? "Görev yok." : "Size atanmış görev yok."}
              </div>
            ) : visible.map(satir)
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Yeni görev formu (kontrol listesi dahil) ── */
function NewTaskForm({ user, staff, roles = [], depts = [], reload }) {
  const [f, setF] = useState({ title: "", description: "", assignee_id: "", due_date: "", priority: "orta" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [pickDept, setPickDept] = useState("hepsi");
  const [steps, setSteps] = useState([]);
  const [stepText, setStepText] = useState("");
  const [busy, setBusy] = useState(false);

  /* Kime atayabilir: yönetici herkese, diğerleri astlarına ve
     kendi departmanındaki kişilere */
  const yetkili = atanabilirKisiler(staff, user);
  const candidates = yetkili.filter(s => pickDept === "hepsi" || s.department === pickDept);

  const addStep = () => { if (stepText.trim()) { setSteps(p => [...p, { text: stepText.trim(), done: false }]); setStepText(""); } };

  const create = async () => {
    if (!f.title.trim() || !f.assignee_id || busy) return;
    setBusy(true);
    const p = staff.find(s => s.id === f.assignee_id);
    const row = {
      title: f.title.trim(), description: f.description.trim() || null,
      assignee_id: f.assignee_id, assignee_name: p?.name || "", assigned_by: user.name,
      department: p?.department || null,
      due_date: f.due_date || null, priority: f.priority, status: "yapilacak",
      checklist: JSON.stringify(steps), notify_email: p?.email || null, seen: false, notified: false,
    };
    const saved = await insertRow("tasks", row, user.name);
    if (saved?.id) await gecmiseYaz(saved.id, user.name, "OLUŞTURMA", `${p?.name || ""} kişisine atandı`);
    if (p?.email) {
      const ok = await sendTaskEmail({ to: p.email, name: p.name, title: row.title, due: row.due_date, priority: row.priority, assignedBy: user.name });
      if (ok && saved?.id) await updateRow("tasks", saved.id, { notified: true }, user.name);
    }
    setF({ title: "", description: "", assignee_id: "", due_date: "", priority: "orta" });
    setSteps([]); setBusy(false); reload();
  };

  return (
    <div style={S.card}>
      <div style={S.h2}>Yeni görev ata</div>
      <div style={S.sub}>Atanınca kişiye bildirim gider. Alt adımlar (kontrol listesi) ekleyebilirsiniz.</div>
      <label style={S.label}>Başlık</label>
      <input style={S.input} placeholder="Örn: Z04 yemek alanı denetimi" value={f.title} onChange={e => set("title", e.target.value)} />
      <label style={S.label}>Açıklama</label>
      <textarea style={{ ...S.input, height: 64, resize: "vertical" }} placeholder="Detay / talimat…" value={f.description} onChange={e => set("description", e.target.value)} />
      <label style={S.label}>Kime</label>
      {depts.length > 0 && (
        <select style={{ ...S.input, marginBottom: 8, fontSize: 13 }} value={pickDept} onChange={e => { setPickDept(e.target.value); set("assignee_id", ""); }}>
          <option value="hepsi">Tüm departmanlar</option>
          {depts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
      )}
      <select style={S.input} value={f.assignee_id} onChange={e => set("assignee_id", e.target.value)}>
        <option value="">Personel seçin</option>
        {candidates.map(s => <option key={s.id} value={s.id}>{s.name} — {s.role}{s.department ? ` · ${s.department}` : ""}</option>)}
      </select>
      {candidates.length === 0 && (
        <div style={{ fontSize: 12, color: T.amber, marginTop: -8, marginBottom: 12 }}>
          Görev atayabileceğiniz kişi yok. Personel ekranından size bağlı astlar tanımlanmalı.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={S.label}>Termin</label>
          <input style={S.input} type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Öncelik</label>
          <select style={S.input} value={f.priority} onChange={e => set("priority", e.target.value)}>
            {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <label style={S.label}>Kontrol listesi (alt adımlar)</label>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.ink, padding: "4px 0" }}>
          <span style={{ color: T.faint }}>{i + 1}.</span>
          <span style={{ flex: 1 }}>{s.text}</span>
          <button onClick={() => setSteps(p => p.filter((_, j) => j !== i))} style={{ ...S.btn, padding: "2px 8px", fontSize: 11, background: T.redSoft, color: T.red }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <input style={{ ...S.input, marginBottom: 0 }} placeholder="Adım ekle…" value={stepText}
          onChange={e => setStepText(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addStep())} />
        <button onClick={addStep} style={{ ...S.btn, ...S.btnGhost, flexShrink: 0 }}>Ekle</button>
      </div>

      <button onClick={create} disabled={!f.title.trim() || !f.assignee_id || busy}
        style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: (!f.title.trim() || !f.assignee_id || busy) ? 0.4 : 1 }}>
        {busy ? "Atanıyor…" : "Görevi ata"}
      </button>
    </div>
  );
}

/* ── Görev detayı: kontrol listesi, dosya, yorum, onay ── */
function TaskDetail({ task, user, isAdmin, staff = [], onBack, reload }) {
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [devretAcik, setDevretAcik] = useState(false);
  const [devretKisi, setDevretKisi] = useState("");
  const [devretNot, setDevretNot] = useState("");
  const [gecmisAcik, setGecmisAcik] = useState(false);
  const st = statOf(task.status), pr = priOf(task.priority);
  const cl = parseCl(task.checklist);
  const mine = task.assignee_id === user.id;
  const atayan = task.assigned_by === user.name;
  /* Termin ve önceliği: atanan kişi, atayan veya yönetici değiştirebilir */
  const duzenleyebilir = mine || atayan || isAdmin;

  const loadAll = async () => {
    const [c, h] = await Promise.all([fetchAll("task_comments"), fetchAll("task_history")]);
    setComments(c.filter(x => x.task_id === task.id && x.active !== false));
    setHistory(h.filter(x => x.task_id === task.id));
  };
  useEffect(() => { loadAll(); }, [task.id]); // eslint-disable-line

  const toggleStep = async (i) => {
    if (!mine && !isAdmin) return;
    const next = cl.map((s, j) => j === i ? { ...s, done: !s.done } : s);
    await updateRow("tasks", task.id, { checklist: JSON.stringify(next) }, user.name);
    reload();
  };

  const addComment = async () => {
    if ((!body.trim() && !file) || busy) return;
    setBusy(true);
    let file_url = null, file_name = null;
    if (file) { const up = await uploadFile(file); if (up) { file_url = up.url; file_name = up.name; } }
    await insertRow("task_comments", { task_id: task.id, author: user.name, is_admin: isAdmin, body: body.trim() || null, file_url, file_name }, user.name);
    setBody(""); setFile(null); setBusy(false); loadAll();
  };

  const changeStatus = async (status, extra = {}) => {
    await updateRow("tasks", task.id, { status, ...extra }, user.name);
    await gecmiseYaz(task.id, user.name, "DURUM", `${statOf(task.status).label} → ${statOf(status).label}`);
    reload(); loadAll();
  };

  /* Termin değiştir */
  const terminDegistir = async (yeni) => {
    const eski = task.due_date ? new Date(task.due_date).toLocaleDateString("tr-TR") : "yok";
    const yeniStr = yeni ? new Date(yeni).toLocaleDateString("tr-TR") : "yok";
    await updateRow("tasks", task.id, { due_date: yeni || null }, user.name);
    await gecmiseYaz(task.id, user.name, "TERMİN", `${eski} → ${yeniStr}`);
    reload(); loadAll();
  };

  /* Öncelik değiştir */
  const oncelikDegistir = async (yeni) => {
    await updateRow("tasks", task.id, { priority: yeni }, user.name);
    await gecmiseYaz(task.id, user.name, "ÖNCELİK", `${priOf(task.priority).label} → ${priOf(yeni).label}`);
    reload(); loadAll();
  };

  /* İşi devret (paslama) */
  const devret = async () => {
    if (!devretKisi) return;
    const p = staff.find(s => s.id === devretKisi);
    if (!p) return;
    setBusy(true);
    await updateRow("tasks", task.id, {
      assignee_id: p.id, assignee_name: p.name,
      department: p.department || task.department,
      notify_email: p.email || null, seen: false,
      reassign_count: (task.reassign_count || 0) + 1,
      original_assignee: task.original_assignee || task.assignee_name,
    }, user.name);
    await gecmiseYaz(task.id, user.name, "DEVİR", `${task.assignee_name} → ${p.name}${devretNot ? ` (${devretNot})` : ""}`);
    if (devretNot.trim()) {
      await insertRow("task_comments", { task_id: task.id, author: user.name, is_admin: isAdmin,
        body: `İş ${p.name} kişisine devredildi. Not: ${devretNot.trim()}` }, user.name);
    }
    if (p.email) {
      await sendTaskEmail({ to: p.email, name: p.name, title: task.title, due: task.due_date, priority: task.priority, assignedBy: user.name });
    }
    setDevretAcik(false); setDevretKisi(""); setDevretNot(""); setBusy(false);
    reload(); loadAll();
  };

  const sendForApproval = () => changeStatus("onay_bekliyor");
  const approve = async () => {
    await updateRow("tasks", task.id, { status: "tamamlandi", approved_by: user.name, approved_at: new Date().toISOString(), reject_note: null }, user.name);
    await gecmiseYaz(task.id, user.name, "ONAY", "Görev onaylandı ve tamamlandı");
    reload(); loadAll();
  };
  const reject = async () => {
    const note = window.prompt("Revize gerekçesi (personele iletilecek):");
    if (note === null) return;
    await updateRow("tasks", task.id, { status: "revize", reject_note: note || "Revize gerekli" }, user.name);
    await gecmiseYaz(task.id, user.name, "REVİZE", note || "Revize gerekli");
    reload(); loadAll();
  };

  /* Devredilebilecek kişiler: aynı departman + astlar (yönetici herkese) */
  const devirAdaylari = atanabilirKisiler(staff, user).filter(s => s.id !== task.assignee_id);

  const overdue = task.due_date && task.status !== "tamamlandi" && new Date(task.due_date) < new Date(new Date().toDateString());

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ ...S.btn, ...S.btnGhost }}>← Görev listesi</button>
        {atayan && (
          <>
            <button onClick={async () => {
              if (!window.confirm(`"${task.title}" görevi listeden kaldırılacak.\n\nKayıt saklanır. Devam edilsin mi?`)) return;
              await deactivateRow("tasks", task.id, user.name); reload(); onBack();
            }} style={{ ...S.btn, padding: "12px 16px", fontSize: 13.5, background: "#eef0ef", color: T.sub, marginLeft: "auto" }}>Kaldır</button>
            <button onClick={async () => {
              if (!window.confirm(`"${task.title}" görevi, yorumları ve ekleriyle birlikte KALICI silinecek.\n\nBu işlem geri alınamaz. Devam edilsin mi?`)) return;
              await hardDeleteRow("tasks", task.id, user.name); reload(); onBack();
            }} style={{ ...S.btn, padding: "12px 16px", fontSize: 13.5, background: T.red, color: "#fff" }}>Kalıcı sil</button>
          </>
        )}
      </div>

      {/* Başlık kartı */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={S.tag(st.soft, st.color)}>{st.label}</span>
          {task.reassign_count > 0 && <span style={S.tag("#eef0ef", T.sub)}>↪ {task.reassign_count} kez devredildi</span>}
        </div>
        <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 19, fontWeight: 800, color: T.ink }}>{task.title}</div>
        {task.description && <div style={{ fontSize: 14, color: T.sub, marginTop: 6, lineHeight: 1.6 }}>{task.description}</div>}
        <div style={{ fontSize: 12.5, color: T.faint, marginTop: 10 }}>
          Atayan: <b style={{ color: T.sub }}>{task.assigned_by}</b> · Sorumlu: <b style={{ color: T.sub }}>{task.assignee_name}</b>
          {task.original_assignee && task.original_assignee !== task.assignee_name && <> · İlk atanan: {task.original_assignee}</>}
          {task.approved_by && <> · Onaylayan: {task.approved_by}</>}
        </div>
        {task.status === "revize" && task.reject_note && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: T.redSoft, color: T.red, fontSize: 13 }}>
            <b>Revize notu:</b> {task.reject_note}
          </div>
        )}
      </div>

      {/* Termin / öncelik / devir */}
      <div style={S.card}>
        <div style={S.h2}>Görev bilgileri</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginTop: 12 }}>
          <div>
            <label style={S.label}>Termin {overdue && <span style={{ color: T.red }}>(gecikti)</span>}</label>
            <input type="date" style={{ ...S.input, marginBottom: 0, borderColor: overdue ? T.red : T.line }}
              value={task.due_date ? String(task.due_date).slice(0, 10) : ""}
              disabled={!duzenleyebilir || task.status === "tamamlandi"}
              onChange={e => terminDegistir(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Öncelik</label>
            <select style={{ ...S.input, marginBottom: 0 }} value={task.priority}
              disabled={!duzenleyebilir || task.status === "tamamlandi"}
              onChange={e => oncelikDegistir(e.target.value)}>
              {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Sorumlu</label>
            {devretAcik ? (
              <select style={{ ...S.input, marginBottom: 0 }} value={devretKisi} onChange={e => setDevretKisi(e.target.value)} autoFocus>
                <option value="">Kime devredilecek?</option>
                {devirAdaylari.map(s => <option key={s.id} value={s.id}>{s.name}{s.department ? ` · ${s.department}` : ""}</option>)}
              </select>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ ...S.input, marginBottom: 0, flex: 1, display: "flex", alignItems: "center", background: "#f4f6f5" }}>{task.assignee_name}</div>
                {(mine || atayan || isAdmin) && task.status !== "tamamlandi" && (
                  <button onClick={() => setDevretAcik(true)} title="Görevi başka birine devret"
                    style={{ ...S.btn, padding: "11px 14px", fontSize: 13, background: T.blueSoft, color: T.blue }}>Devret</button>
                )}
              </div>
            )}
          </div>
        </div>

        {devretAcik && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: T.blueSoft }}>
            <label style={S.label}>Devir notu (isteğe bağlı)</label>
            <input style={{ ...S.input, marginBottom: 10 }} placeholder="Neden devrediliyor?" value={devretNot} onChange={e => setDevretNot(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={devret} disabled={!devretKisi || busy} style={{ ...S.btn, ...S.btnGreen, opacity: (!devretKisi || busy) ? 0.4 : 1 }}>
                {busy ? "Devrediliyor…" : "Devret"}
              </button>
              <button onClick={() => { setDevretAcik(false); setDevretKisi(""); setDevretNot(""); }} style={{ ...S.btn, ...S.btnGhost }}>İptal</button>
            </div>
            {devirAdaylari.length === 0 && (
              <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8 }}>
                Devredebileceğiniz kişi yok. Aynı departmanda veya astınızda kayıtlı personel bulunmuyor.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kontrol listesi */}
      {cl.length > 0 && (
        <div style={S.card}>
          <div style={S.h2}>Kontrol listesi ({cl.filter(i => i.done).length}/{cl.length})</div>
          <div style={{ height: 6, background: "#eef0ef", borderRadius: 3, overflow: "hidden", margin: "8px 0 14px" }}>
            <div style={{ width: `${cl.length ? (cl.filter(i => i.done).length / cl.length) * 100 : 0}%`, height: "100%", background: T.green }} />
          </div>
          {cl.map((s, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", fontSize: 14, color: s.done ? T.faint : T.ink, cursor: (mine || isAdmin) ? "pointer" : "default", textDecoration: s.done ? "line-through" : "none" }}>
              <input type="checkbox" checked={s.done} onChange={() => toggleStep(i)} disabled={!mine && !isAdmin} />
              {s.text}
            </label>
          ))}
        </div>
      )}

      {/* Durum aksiyonları */}
      <div style={S.card}>
        <div style={S.h2}>Durum</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {mine && !isAdmin && (
            <>
              {task.status === "yapilacak" && <button onClick={() => changeStatus("devam")} style={{ ...S.btn, background: STATUSES[1].color, color: "#fff" }}>Başla (devam)</button>}
              {(task.status === "devam" || task.status === "revize") && <button onClick={sendForApproval} style={{ ...S.btn, ...S.btnGreen }}>Bitti — onaya gönder</button>}
              {task.status === "onay_bekliyor" && <span style={{ fontSize: 13.5, color: T.blue }}>Yönetici onayı bekleniyor…</span>}
              {task.status === "tamamlandi" && <span style={{ fontSize: 13.5, color: T.green, fontWeight: 600 }}>✓ Tamamlandı ve onaylandı</span>}
            </>
          )}
          {isAdmin && (
            <>
              {task.status === "onay_bekliyor" ? (
                <>
                  <button onClick={approve} style={{ ...S.btn, ...S.btnGreen }}>Onayla (tamamlandı)</button>
                  <button onClick={reject} style={{ ...S.btn, ...S.btnRed }}>Revize iste</button>
                </>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {STATUSES.filter(s => s.id !== "onay_bekliyor").map(s => (
                    <button key={s.id} onClick={() => changeStatus(s.id)} style={{
                      ...S.btn, padding: "7px 12px", fontSize: 12.5,
                      background: task.status === s.id ? s.color : s.soft, color: task.status === s.id ? "#fff" : s.color,
                    }}>{s.label}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Yorumlar + dosyalar */}
      <div style={S.card}>
        <div style={S.h2}>Yorumlar ve dosyalar</div>
        <div style={{ margin: "12px 0" }}>
          {comments.length === 0 ? (
            <div style={{ fontSize: 13, color: T.faint, padding: "10px 0" }}>Henüz yorum yok.</div>
          ) : comments.map(c => (
            <div key={c.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 13.5, color: c.is_admin ? T.blue : T.ink }}>{c.author}{c.is_admin ? " · Yönetici" : ""}</span>
                <span style={{ fontSize: 12, color: T.faint }}>{new Date(c.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {c.body && <div style={{ fontSize: 14, color: T.ink, marginTop: 3 }}>{c.body}</div>}
              {c.file_url && (
                <a href={c.file_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 13, color: T.blue, textDecoration: "none", background: T.blueSoft, padding: "6px 12px", borderRadius: 8 }}>
                  📎 {c.file_name || "dosya"}
                </a>
              )}
            </div>
          ))}
        </div>

        <textarea style={{ ...S.input, height: 64, resize: "vertical" }} placeholder="Yorum yazın…" value={body} onChange={e => setBody(e.target.value)} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13, flex: 1, minWidth: 160 }} />
          <button onClick={addComment} disabled={(!body.trim() && !file) || busy} style={{ ...S.btn, ...S.btnGreen, opacity: ((!body.trim() && !file) || busy) ? 0.4 : 1 }}>
            {busy ? "Gönderiliyor…" : "Gönder"}
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 8 }}>
          Fotoğraflar otomatik küçültülür. Belge (PDF/Word/Excel) en fazla {FILE_LIMITS.DOC_MAX_MB} MB.
        </div>
      </div>

      {/* İşlem geçmişi */}
      <div style={S.card}>
        <div onClick={() => setGecmisAcik(v => !v)} style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
          <div style={{ flex: 1 }}>
            <div style={S.h2}>İşlem geçmişi ({history.length})</div>
            <div style={{ fontSize: 12.5, color: T.sub }}>Görevde kim ne zaman ne değiştirdi</div>
          </div>
          <span style={{ color: T.blue, fontSize: 13, fontWeight: 600 }}>{gecmisAcik ? "Gizle ▲" : "Göster ▼"}</span>
        </div>
        {gecmisAcik && (
          <div style={{ marginTop: 12 }}>
            {history.length === 0 ? (
              <div style={{ fontSize: 13, color: T.faint, padding: "10px 0" }}>Kayıt yok.</div>
            ) : history.slice().reverse().map(h => (
              <div key={h.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13, flexWrap: "wrap" }}>
                <span style={S.tag("#eef0ef", T.sub)}>{h.action}</span>
                <span style={{ color: T.ink, flex: 1, minWidth: 120 }}>{h.detail}</span>
                <span style={{ color: T.faint, fontSize: 12 }}>{h.actor} · {new Date(h.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


/* ═══════════ İŞ ANALİZİ (GÖREV DASHBOARD) ═══════════ */
function TaskAnalytics({ user, staff, tasks = [], depts = [], roles = [] }) {
  const isAdmin = user.is_admin;
  const [range, setRange] = useState(30); // gün
  const [dept, setDept] = useState("hepsi");
  const [role, setRole] = useState("hepsi");

  // Filtreye uyan personel kimlikleri
  const staffIds = useMemo(() => new Set(
    staff.filter(s => staffMatches(s, dept, role)).map(s => s.id)
  ), [staff, dept, role]);
  const filtering = dept !== "hepsi" || role !== "hepsi";

  // Yönetici hepsini, personel kendi görevlerini analiz eder
  const scope = (isAdmin ? tasks : tasks.filter(t => t.assignee_id === user.id))
    .filter(t => !filtering || staffIds.has(t.assignee_id));

  const cutoff = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - range); d.setHours(0, 0, 0, 0); return d;
  }, [range]);
  const inRange = scope.filter(t => new Date(t.created_at) >= cutoff);

  const today0 = new Date(new Date().toDateString());

  /* ── Temel sayımlar ── */
  const total = scope.length;
  const byStatus = STATUSES.map(s => ({
    id: s.id, name: s.label, value: scope.filter(t => t.status === s.id).length, color: s.color,
  }));
  const done = byStatus.find(s => s.id === "tamamlandi")?.value || 0;
  const waiting = byStatus.find(s => s.id === "onay_bekliyor")?.value || 0;
  const revize = byStatus.find(s => s.id === "revize")?.value || 0;
  const open = total - done;
  const completionRate = total ? Math.round((done / total) * 100) : 0;
  const overdue = scope.filter(t => t.due_date && t.status !== "tamamlandi" && new Date(t.due_date) < today0).length;

  /* ── Ortalama tamamlanma süresi (gün) ── */
  const finished = scope.filter(t => t.status === "tamamlandi" && t.approved_at);
  const avgDays = finished.length
    ? (finished.reduce((s, t) => s + (new Date(t.approved_at) - new Date(t.created_at)) / 86400000, 0) / finished.length)
    : null;

  /* ── Zaman serisi: günlük açılan vs tamamlanan ── */
  const series = useMemo(() => {
    const days = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const key = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
      const acilan = scope.filter(t => new Date(t.created_at).toDateString() === d.toDateString()).length;
      const kapanan = scope.filter(t => t.approved_at && new Date(t.approved_at).toDateString() === d.toDateString()).length;
      days.push({ gun: key, acilan, kapanan });
    }
    return range > 31 ? days.filter((_, i) => i % 2 === 0) : days;
  }, [scope, range]);

  /* ── Kümülatif birikim (açık iş yükü trendi) ── */
  const cumulative = useMemo(() => {
    let openCount = 0;
    return series.map(d => { openCount += d.acilan - d.kapanan; return { gun: d.gun, birikim: Math.max(0, openCount) }; });
  }, [series]);

  /* ── Öncelik dağılımı ── */
  const byPriority = PRIORITIES.map(p => ({
    name: p.label, color: p.color,
    toplam: scope.filter(t => t.priority === p.id).length,
    acik: scope.filter(t => t.priority === p.id && t.status !== "tamamlandi").length,
  })).filter(p => p.toplam > 0);

  /* ── Kişi bazlı performans ── */
  const byPerson = staff.filter(s => staffMatches(s, dept, role)).map(s => {
    const mine = scope.filter(t => t.assignee_id === s.id);
    const md = mine.filter(t => t.status === "tamamlandi").length;
    const mo = mine.filter(t => t.due_date && t.status !== "tamamlandi" && new Date(t.due_date) < today0).length;
    return {
      name: s.name.split(" ")[0], full: s.name, toplam: mine.length, tamamlanan: md,
      acik: mine.length - md, geciken: mo,
      oran: mine.length ? Math.round((md / mine.length) * 100) : 0,
    };
  }).filter(p => p.toplam > 0).sort((a, b) => b.toplam - a.toplam);

  /* ── Yaklaşan terminler (7 gün) ── */
  const upcoming = scope.filter(t => {
    if (!t.due_date || t.status === "tamamlandi") return false;
    const d = new Date(t.due_date); const diff = (d - today0) / 86400000;
    return diff >= 0 && diff <= 7;
  }).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  /* ── Kontrol listesi ilerlemesi ── */
  const withCl = scope.filter(t => parseCl(t.checklist).length > 0);
  const clProgress = withCl.length ? Math.round(
    withCl.reduce((s, t) => { const c = parseCl(t.checklist); return s + (c.filter(i => i.done).length / c.length); }, 0) / withCl.length * 100
  ) : null;

  /* ── Revize oranı (ilk seferde onaylanma kalitesi) ── */
  const everRevised = scope.filter(t => t.reject_note).length;
  const revizeOrani = total ? Math.round((everRevised / total) * 100) : 0;

  const renderKPI = ({ label, value, unit, accent, hint }) => (
    <div style={{ ...S.card, marginBottom: 0, padding: 16, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11.5, color: T.sub, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 26, fontWeight: 800, color: T.ink, lineHeight: 1 }}>
        {value}<span style={{ fontSize: 12, fontWeight: 500, color: T.faint, marginLeft: 4 }}>{unit}</span>
      </div>
      {hint && <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>{hint}</div>}
    </div>
  );

  if (total === 0) {
    return (
      <div>
        {isAdmin && <FilterBar depts={depts} roles={roles} dept={dept} setDept={setDept} role={role} setRole={setRole} />}
        <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 17, fontWeight: 700, color: T.ink, marginBottom: 8 }}>
            {filtering ? "Bu filtreye uyan görev yok" : "Henüz analiz edilecek görev yok"}
          </div>
          <div style={{ fontSize: 13.5, color: T.sub }}>
            {filtering ? "Filtreyi değiştirin veya temizleyin." : "İş Takibi sekmesinden görev atandıkça buradaki grafikler dolacak."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {isAdmin && (
        <FilterBar depts={depts} roles={roles} dept={dept} setDept={setDept} role={role} setRole={setRole}
          note={filtering ? `${staffIds.size} personel · ${scope.length} görev` : null} />
      )}

      {/* Zaman aralığı */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: T.sub, fontWeight: 600, marginRight: 4 }}>Dönem:</span>
        {[7, 14, 30, 90].map(d => (
          <button key={d} onClick={() => setRange(d)} style={{
            ...S.btn, padding: "7px 14px", fontSize: 12.5,
            background: range === d ? T.green : "#fbfcfb",
            color: range === d ? "#fff" : T.sub,
            border: `1.5px solid ${range === d ? T.green : T.line}`,
          }}>{d} gün</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, color: T.faint }}>
          {isAdmin ? "Tüm ekip" : "Kendi görevleriniz"} · {inRange.length} görev bu dönemde açıldı
        </span>
      </div>

      {/* KPI'lar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        {renderKPI({ label: "Toplam görev", value: total, unit: "", accent: T.blue })}
        {renderKPI({ label: "Tamamlanan", value: done, unit: "", accent: T.green, hint: `%${completionRate} tamamlanma` })}
        {renderKPI({ label: "Açık görev", value: open, unit: "", accent: T.amber })}
        {renderKPI({ label: "Onay bekleyen", value: waiting, unit: "", accent: waiting > 0 ? T.blue : T.faint })}
        {renderKPI({ label: "Geciken", value: overdue, unit: "", accent: overdue > 0 ? T.red : T.faint })}
        {renderKPI({ label: "Ort. tamamlanma", value: avgDays !== null ? avgDays.toFixed(1) : "—", unit: avgDays !== null ? "gün" : "", accent: T.green })}
      </div>

      {/* Tamamlanma çubuğu */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={S.h2}>Genel ilerleme</div>
            <div style={{ fontSize: 12.5, color: T.sub }}>{done} / {total} görev tamamlandı</div>
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 24, color: completionRate >= 70 ? T.green : completionRate >= 40 ? T.amber : T.red }}>%{completionRate}</div>
        </div>
        <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "#eef0ef" }}>
          {byStatus.filter(s => s.value > 0).map(s => (
            <div key={s.id} title={`${s.name}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
          {byStatus.filter(s => s.value > 0).map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.sub }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
              {s.name}: <b style={{ color: T.ink }}>{s.value}</b>
            </div>
          ))}
        </div>
      </div>

      {/* Trend: açılan vs kapanan */}
      <div style={S.card}>
        <div style={S.h2}>Açılan / tamamlanan görev trendi</div>
        <div style={S.sub}>Son {range} gün</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
            <XAxis dataKey="gun" tick={{ fontSize: 10.5, fill: T.sub }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: T.sub }} allowDecimals={false} />
            <Tooltip contentStyle={S.tooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="acilan" fill={T.blue} name="Açılan" radius={[4, 4, 0, 0]} />
            <Bar dataKey="kapanan" fill={T.green} name="Tamamlanan" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 16 }}>
        {/* Durum dağılımı */}
        <div style={S.card}>
          <div style={S.h2}>Durum dağılımı</div>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={byStatus.filter(s => s.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78} innerRadius={46} paddingAngle={2}>
                {byStatus.filter(s => s.value > 0).map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={S.tooltip} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Açık iş yükü birikimi */}
        <div style={S.card}>
          <div style={S.h2}>Açık iş yükü birikimi</div>
          <div style={S.sub}>Yükselen çizgi = işler birikiyor</div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={cumulative}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
              <XAxis dataKey="gun" tick={{ fontSize: 10.5, fill: T.sub }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: T.sub }} allowDecimals={false} />
              <Tooltip contentStyle={S.tooltip} />
              <Area type="monotone" dataKey="birikim" stroke={T.amber} fill={T.amber} fillOpacity={0.18} strokeWidth={2} name="Açık görev" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Öncelik */}
        {byPriority.length > 0 && (
          <div style={S.card}>
            <div style={S.h2}>Öncelik dağılımı</div>
            <div style={S.sub}>Toplam ve hâlâ açık olanlar</div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={byPriority}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: T.sub }} />
                <YAxis tick={{ fontSize: 11, fill: T.sub }} allowDecimals={false} />
                <Tooltip contentStyle={S.tooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="toplam" fill={T.blue} name="Toplam" radius={[4, 4, 0, 0]} />
                <Bar dataKey="acik" fill={T.red} name="Açık" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Kalite göstergeleri */}
        <div style={S.card}>
          <div style={S.h2}>Kalite göstergeleri</div>
          <div style={{ marginTop: 12 }}>
            {[
              { l: "İlk seferde onaylanma", v: `%${100 - revizeOrani}`, hint: `${everRevised} görev revize istendi`, c: revizeOrani < 20 ? T.green : revizeOrani < 40 ? T.amber : T.red },
              { l: "Kontrol listesi ilerlemesi", v: clProgress !== null ? `%${clProgress}` : "—", hint: `${withCl.length} görevde alt adım var`, c: T.blue },
              { l: "Onay bekleyen", v: waiting, hint: waiting > 0 ? "Yönetici incelemesi gerekiyor" : "Bekleyen yok", c: waiting > 0 ? T.blue : T.faint },
              { l: "Revize aşamasında", v: revize, hint: revize > 0 ? "Personelde düzeltme bekliyor" : "Yok", c: revize > 0 ? T.red : T.faint },
              { l: "Geciken görev", v: overdue, hint: overdue > 0 ? "Termin aşıldı" : "Gecikme yok", c: overdue > 0 ? T.red : T.green },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 600 }}>{r.l}</div>
                  <div style={{ fontSize: 11.5, color: T.faint }}>{r.hint}</div>
                </div>
                <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 18, color: r.c }}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Departman karşılaştırması */}
      {isAdmin && depts.length > 0 && (() => {
        const byDept = depts.map(d => {
          const ids = new Set(staff.filter(s => s.department === d.name).map(s => s.id));
          const list = (isAdmin ? tasks : []).filter(t => ids.has(t.assignee_id));
          const dn = list.filter(t => t.status === "tamamlandi").length;
          const gec = list.filter(t => t.due_date && t.status !== "tamamlandi" && new Date(t.due_date) < today0).length;
          return {
            name: d.name, toplam: list.length, tamamlanan: dn, acik: list.length - dn, geciken: gec,
            oran: list.length ? Math.round((dn / list.length) * 100) : 0,
            kisi: staff.filter(s => s.department === d.name).length,
          };
        }).filter(d => d.toplam > 0 || d.kisi > 0);
        if (byDept.length === 0) return null;
        return (
          <div style={S.card}>
            <div style={S.h2}>Departman karşılaştırması</div>
            <div style={S.sub}>Hangi departman ne kadar iş üstlendi ve bitirdi</div>
            <ResponsiveContainer width="100%" height={Math.max(180, byDept.length * 48)}>
              <BarChart data={byDept} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                <XAxis type="number" tick={{ fontSize: 11, fill: T.sub }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: T.ink }} width={120} />
                <Tooltip contentStyle={S.tooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tamamlanan" stackId="a" fill={T.green} name="Tamamlanan" />
                <Bar dataKey="acik" stackId="a" fill={T.amber} name="Açık" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${T.line}` }}>
                    {["Departman", "Personel", "Görev", "Tamamlanan", "Geciken", "Başarı"].map(h => (
                      <th key={h} style={{ padding: "8px 6px", textAlign: h === "Departman" ? "left" : "center", color: T.sub, fontWeight: 600, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byDept.map(d => (
                    <tr key={d.name} style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td style={{ padding: "9px 6px", fontWeight: 600, color: T.ink }}>{d.name}</td>
                      <td style={{ padding: "9px 6px", textAlign: "center" }}>{d.kisi}</td>
                      <td style={{ padding: "9px 6px", textAlign: "center" }}>{d.toplam}</td>
                      <td style={{ padding: "9px 6px", textAlign: "center", color: T.green, fontWeight: 600 }}>{d.tamamlanan}</td>
                      <td style={{ padding: "9px 6px", textAlign: "center", color: d.geciken > 0 ? T.red : T.faint, fontWeight: d.geciken > 0 ? 700 : 400 }}>{d.geciken}</td>
                      <td style={{ padding: "9px 6px", textAlign: "center" }}>
                        <span style={S.tag(d.oran >= 70 ? T.greenSoft : d.oran >= 40 ? T.amberSoft : T.redSoft, d.oran >= 70 ? T.green : d.oran >= 40 ? T.amber : T.red)}>%{d.oran}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Kişi bazlı performans */}
      {isAdmin && byPerson.length > 0 && (
        <div style={S.card}>
          <div style={S.h2}>Kişi bazlı iş yükü ve performans</div>
          <div style={S.sub}>Kime kaç görev atandı, ne kadarı tamamlandı</div>
          <ResponsiveContainer width="100%" height={Math.max(180, byPerson.length * 42)}>
            <BarChart data={byPerson} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
              <XAxis type="number" tick={{ fontSize: 11, fill: T.sub }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: T.ink }} width={90} />
              <Tooltip contentStyle={S.tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="tamamlanan" stackId="a" fill={T.green} name="Tamamlanan" radius={[0, 0, 0, 0]} />
              <Bar dataKey="acik" stackId="a" fill={T.amber} name="Açık" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div style={{ marginTop: 14, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.line}` }}>
                  {["Personel", "Toplam", "Tamamlanan", "Açık", "Geciken", "Başarı"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: h === "Personel" ? "left" : "center", color: T.sub, fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byPerson.map(p => (
                  <tr key={p.full} style={{ borderBottom: `1px solid ${T.line}` }}>
                    <td style={{ padding: "9px 6px", fontWeight: 600, color: T.ink }}>{p.full}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center" }}>{p.toplam}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center", color: T.green, fontWeight: 600 }}>{p.tamamlanan}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center", color: T.amber }}>{p.acik}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center", color: p.geciken > 0 ? T.red : T.faint, fontWeight: p.geciken > 0 ? 700 : 400 }}>{p.geciken}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center" }}>
                      <span style={S.tag(p.oran >= 70 ? T.greenSoft : p.oran >= 40 ? T.amberSoft : T.redSoft, p.oran >= 70 ? T.green : p.oran >= 40 ? T.amber : T.red)}>%{p.oran}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Yaklaşan terminler */}
      <div style={S.card}>
        <div style={S.h2}>Yaklaşan terminler (7 gün)</div>
        {upcoming.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>Önümüzdeki 7 günde termini dolan görev yok.</div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {upcoming.map(t => {
              const days = Math.ceil((new Date(t.due_date) - today0) / 86400000);
              const pr = priOf(t.priority), st = statOf(t.status);
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.line}`, flexWrap: "wrap" }}>
                  <span style={S.tag(days === 0 ? T.redSoft : days <= 2 ? T.amberSoft : T.blueSoft, days === 0 ? T.red : days <= 2 ? T.amber : T.blue)}>
                    {days === 0 ? "Bugün" : `${days} gün`}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: T.ink, flex: 1, minWidth: 130 }}>{t.title}</span>
                  {isAdmin && <span style={{ fontSize: 12.5, color: T.sub }}>{t.assignee_name}</span>}
                  <span style={S.tag(st.soft, st.color)}>{st.label}</span>
                  <span style={S.tag(pr.color + "1a", pr.color)}>{pr.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Geciken görevler */}
      {overdue > 0 && (
        <div style={{ ...S.card, background: T.redSoft, borderColor: "#e5b8b8" }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 15, color: T.red, marginBottom: 8 }}>Geciken görevler ({overdue})</div>
          {scope.filter(t => t.due_date && t.status !== "tamamlandi" && new Date(t.due_date) < today0)
            .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
            .map(t => {
              const late = Math.ceil((today0 - new Date(t.due_date)) / 86400000);
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #eccfcf", flexWrap: "wrap", fontSize: 13.5 }}>
                  <span style={{ fontWeight: 700, color: T.red, minWidth: 70 }}>{late} gün geç</span>
                  <span style={{ flex: 1, minWidth: 130, color: T.ink }}>{t.title}</span>
                  {isAdmin && <span style={{ color: T.sub, fontSize: 12.5 }}>{t.assignee_name}</span>}
                  <span style={S.tag(statOf(t.status).soft, statOf(t.status).color)}>{statOf(t.status).label}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/* ═══════════ RAPOR ═══════════ */
function Report({ user, staff, cleanLogs, wasteLogs, incidents, targets, tasks = [], depts = [], roles = [] }) {
  const [dept, setDept] = useState("hepsi");
  const [role, setRole] = useState("hepsi");
  const filtering = dept !== "hepsi" || role !== "hepsi";
  const names = useMemo(() => new Set(staff.filter(s => staffMatches(s, dept, role)).map(s => s.name)), [staff, dept, role]);
  const ids = useMemo(() => new Set(staff.filter(s => staffMatches(s, dept, role)).map(s => s.id)), [staff, dept, role]);

  // Filtre uygulanmışsa yalnız o personelin kayıtları
  cleanLogs = filtering ? cleanLogs.filter(c => names.has(c.staff_name)) : cleanLogs;
  wasteLogs = filtering ? wasteLogs.filter(w => names.has(w.staff_name)) : wasteLogs;
  incidents = filtering ? incidents.filter(i => names.has(i.staff_name)) : incidents;
  const scopedTasks = filtering ? tasks.filter(t => ids.has(t.assignee_id)) : tasks;
  const shownStaff = staff.filter(s => staffMatches(s, dept, role));

  const totalWaste = wasteLogs.reduce((s, w) => s + Number(w.amount), 0);
  const recycled = wasteLogs.filter(w => w.destination === "Geri Dönüşüm Tesisi").reduce((s, w) => s + Number(w.amount), 0);
  const carbon = wasteLogs.reduce((s, w) => s + carbonOf(w), 0);
  const tRate = targets.find(t => t.key === "recycle_rate")?.value ?? 75;
  const rate = totalWaste > 0 ? Math.round((recycled / totalWaste) * 100) : 0;

  const rows = [
    ["Rapor tarihi", new Date().toLocaleDateString("tr-TR")],
    ["Toplam temizlik kaydı", cleanLogs.length],
    ["Kayıtlı personel", shownStaff.length],
    ["Toplam atık", `${totalWaste.toLocaleString("tr-TR")} kg`],
    ["Geri dönüşüme gönderilen", `${recycled.toLocaleString("tr-TR")} kg`],
    ["Geri dönüşüm oranı / hedef", totalWaste > 0 ? `%${rate} / %${tRate}` : "—"],
    ["Toplam karbon ayak izi", `${carbon.toFixed(1)} kg CO₂e`],
    ["Fotoğraflı (kanıtlı) atık kaydı", wasteLogs.filter(w => w.photo_url).length],
    ["UATF'li tehlikeli atık kaydı", wasteLogs.filter(w => w.uatf_no).length],
    ["Toplam arıza / açık", `${incidents.length} / ${incidents.filter(i => !["kapandi", "iptal"].includes(i.status)).length}`],
    ["Görev (toplam / tamamlanan)", `${scopedTasks.length} / ${scopedTasks.filter(t => t.status === "tamamlandi").length}`],
  ];

  const [repBusy, setRepBusy] = useState(false);
  const exportCSV = async () => {
    setRepBusy(true);

    const ozetSekmesi = {
      ad: "Özet",
      baslik: "COP31 · Atık Yönetimi Özet Raporu",
      basliklar: ["Gösterge", "Değer"],
      satirlar: rows.map(([k, v]) => [k, String(v)]),
    };

    const temizlikSekmesi = cleanLogs.length ? {
      ad: "Temizlik",
      baslik: "Temizlik Kayıtları",
      basliklar: ["Tarih", "Saat", "Bölge", "Personel", "İşlem", "Not"],
      satirlar: cleanLogs.slice().reverse().map(c => [
        trDate(c.created_at), trTime(c.created_at), c.zone, c.staff_name || "", c.action, c.notes || "",
      ]),
    } : null;

    const atikSekmesi = wasteLogs.length ? {
      ad: "Atık",
      baslik: "Atık Kayıtları",
      basliklar: ["Tarih", "Saat", "Bölge", "Personel", "Tür", "Miktar (kg)", "Gönderim yeri",
        "UATF no", "Tesis lisans", "Mesafe (km)", "CO2e (kg)", "Kanıt"],
      sayiSutunlari: [5, 9, 10],
      satirlar: wasteLogs.slice().reverse().map(w => [
        trDate(w.created_at), trTime(w.created_at), w.zone, w.staff_name || "",
        WASTE_TYPES.find(t => t.id === w.type)?.name || w.type,
        Number(w.amount) || 0, w.destination,
        w.uatf_no || "", w.facility_license || "", Number(w.km) || 0,
        Number(carbonOf(w).toFixed(2)), w.photo_url ? "var" : "",
      ]),
      altBilgi: `Toplam ${wasteLogs.reduce((a, w) => a + Number(w.amount), 0).toLocaleString("tr-TR")} kg · ${wasteLogs.reduce((a, w) => a + carbonOf(w), 0).toFixed(1)} kg CO2e`,
    } : null;

    const olaySekmesi = incidents.length ? {
      ad: "Olaylar",
      baslik: "Olay Bildirimleri",
      basliklar: ["Tarih", "Saat", "Bölge", "Bildiren", "Önem", "Açıklama", "Durum"],
      vurguSatir: (r) => !["Kapatıldı", "İptal"].includes(r[6]),
      satirlar: incidents.slice().reverse().map(i => [
        trDate(i.created_at), trTime(i.created_at), i.zone, i.staff_name || "",
        tOncelik(i.severity).label, i.description, tDurum(i.status).label,
      ]),
    } : null;

    const gorevSekmesi = scopedTasks.length ? {
      ad: "Görevler",
      baslik: "Görev Kayıtları",
      basliklar: ["Görev", "Atayan", "Sorumlu", "Departman", "Durum", "Öncelik", "Oluşturma", "Termin"],
      satirlar: scopedTasks.slice().reverse().map(t => [
        t.title, t.assigned_by || "", t.assignee_name || "", t.department || "",
        statOf(t.status).label, priOf(t.priority).label,
        trDate(t.created_at), t.due_date ? new Date(t.due_date).toLocaleDateString("tr-TR") : "",
      ]),
    } : null;

    const sekmeler = [ozetSekmesi, temizlikSekmesi, atikSekmesi, olaySekmesi, gorevSekmesi].filter(Boolean);
    await stilliExcelIndir(sekmeler, "COP31_Atik_Raporu");
    setRepBusy(false);
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <FilterBar depts={depts} roles={roles} dept={dept} setDept={setDept} role={role} setRole={setRole}
        note={filtering ? `${shownStaff.length} personel kapsamda` : null} />
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={S.h2}>Günlük özet rapor</div>
            <div style={{ fontSize: 13, color: T.sub }}>UNFCCC sürdürülebilirlik formatına uygun; CSV tüm ham veriyi içerir.</div>
          </div>
          <button onClick={exportCSV} disabled={repBusy} style={{ ...S.btn, background: T.greenSoft, color: T.green, opacity: repBusy ? 0.5 : 1 }}>{repBusy ? "Hazırlanıyor…" : "⤓ Excel'e aktar"}</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <tbody>
            {rows.map(([k, v], i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
                <td style={{ padding: "11px 0", fontSize: 13.5, color: T.sub }}>{k}</td>
                <td style={{ padding: "11px 0", fontSize: 14.5, fontWeight: 700, color: T.ink, textAlign: "right", fontFamily: "'Sora', sans-serif" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── ARIZA KATEGORİ YÖNETİMİ (departman yönlendirme + SLA) ── */
function ArizaKategoriYonetimi({ user, cats = [], depts = [], reload }) {
  const [ad, setAd] = useState("");
  const [dept, setDept] = useState("");
  const [yanit, setYanit] = useState("30");
  const [cozum, setCozum] = useState("240");
  const [busy, setBusy] = useState(false);
  const [duzId, setDuzId] = useState(null);
  const [duz, setDuz] = useState({});

  const ekle = async () => {
    if (!ad.trim() || busy) return;
    if (cats.some(c => c.name.toLowerCase() === ad.trim().toLowerCase())) { alert("Bu kategori zaten var."); return; }
    setBusy(true);
    await insertRow("ticket_categories", {
      name: ad.trim(), department: dept || null,
      sla_response_min: parseInt(yanit) || 30, sla_resolve_min: parseInt(cozum) || 240,
    }, user.name);
    setAd(""); setBusy(false); reload();
  };

  const kaydet = async (c) => {
    if (!duz.name?.trim()) return;
    await updateRow("ticket_categories", c.id, {
      name: duz.name.trim(), department: duz.department || null,
      sla_response_min: parseInt(duz.sla_response_min) || 30,
      sla_resolve_min: parseInt(duz.sla_resolve_min) || 240,
    }, user.name);
    setDuzId(null); reload();
  };

  const sil = async (c) => {
    if (!window.confirm(`"${c.name}" kategorisi silinsin mi?`)) return;
    await deactivateRow("ticket_categories", c.id, user.name);
    reload();
  };

  if (!isOnline) return null;

  return (
    <div style={S.card}>
      <div style={S.h2}>4. Arıza türleri</div>
      <div style={S.sub}>Arıza bildirildiğinde otomatik hangi departmana düşeceğini ve hedef süreleri belirler.</div>

      <input style={S.input} placeholder="Örn: Klima arızası" value={ad} onChange={e => setAd(e.target.value)}
        onKeyDown={e => e.key === "Enter" && ekle()} />
      <select style={S.input} value={dept} onChange={e => setDept(e.target.value)}>
        <option value="">— Departman atanmadı —</option>
        {depts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={S.label}>Kabul hedefi (dk)</label>
          <input style={S.input} type="number" value={yanit} onChange={e => setYanit(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Çözüm hedefi (dk)</label>
          <input style={S.input} type="number" value={cozum} onChange={e => setCozum(e.target.value)} />
        </div>
      </div>
      <button onClick={ekle} disabled={!ad.trim() || busy} style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: (!ad.trim() || busy) ? 0.4 : 1 }}>
        Kategori ekle
      </button>

      <div style={{ marginTop: 14 }}>
        {cats.length === 0 ? (
          <div style={{ padding: "16px 0", textAlign: "center", color: T.faint, fontSize: 13 }}>Kategori yok.</div>
        ) : cats.map(c => (
          <div key={c.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
            {duzId === c.id ? (
              <div>
                <input style={{ ...S.input, marginBottom: 6, padding: "7px 10px" }} value={duz.name}
                  onChange={e => setDuz(p => ({ ...p, name: e.target.value }))} autoFocus />
                <select style={{ ...S.input, marginBottom: 6, padding: "7px 10px", fontSize: 13 }} value={duz.department || ""}
                  onChange={e => setDuz(p => ({ ...p, department: e.target.value }))}>
                  <option value="">— Departman yok —</option>
                  {depts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <input style={{ ...S.input, marginBottom: 0, padding: "7px 10px" }} type="number" value={duz.sla_response_min}
                    onChange={e => setDuz(p => ({ ...p, sla_response_min: e.target.value }))} placeholder="Kabul dk" />
                  <input style={{ ...S.input, marginBottom: 0, padding: "7px 10px" }} type="number" value={duz.sla_resolve_min}
                    onChange={e => setDuz(p => ({ ...p, sla_resolve_min: e.target.value }))} placeholder="Çözüm dk" />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => kaydet(c)} style={{ ...S.btn, padding: "7px 12px", fontSize: 12, ...S.btnGreen }}>Kaydet</button>
                  <button onClick={() => setDuzId(null)} style={{ ...S.btn, padding: "7px 12px", fontSize: 12, ...S.btnGhost }}>İptal</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: T.ink }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: T.faint }}>
                    {c.department ? <span style={{ color: T.green }}>{c.department}</span> : <span style={{ color: T.amber }}>departman yok</span>}
                    {" · "}kabul {c.sla_response_min} dk · çözüm {c.sla_resolve_min} dk
                  </div>
                </div>
                <button onClick={() => { setDuzId(c.id); setDuz({ name: c.name, department: c.department || "", sla_response_min: c.sla_response_min, sla_resolve_min: c.sla_resolve_min }); }}
                  style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.blueSoft, color: T.blue }}>Düzenle</button>
                <button onClick={() => sil(c)} style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.redSoft, color: T.red }}>Sil</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   STOK / MALZEME YÖNETİMİ
   Anlık stok, hareketlerden hesaplanır. Depo ve her bölge
   ayrı stok noktasıdır; tüketim bölge bazında izlenir.
   ═══════════════════════════════════════════════════════ */

const DEPO = "DEPO";

const HAREKET = [
  { id: "giris",    label: "Mal kabul",  yon: "+", renk: "#1e6b45", soft: "#e6f2ec", aciklama: "Tedarikçiden depoya giriş" },
  { id: "transfer", label: "Sevk",       yon: "→", renk: "#2f6fb2", soft: "#e9f1f9", aciklama: "Depodan bölgeye gönderim" },
  { id: "tuketim",  label: "Tüketim",    yon: "−", renk: "#b07d1e", soft: "#faf3e3", aciklama: "Bölgede kullanım" },
  { id: "iade",     label: "İade",       yon: "←", renk: "#2a9d8f", soft: "#e4f4f2", aciklama: "Bölgeden depoya geri" },
  { id: "fire",     label: "Fire / zayi", yon: "−", renk: "#b03030", soft: "#fbeaea", aciklama: "Kayıp, hasar, son kullanma" },
  { id: "sayim",    label: "Sayım düzeltme", yon: "±", renk: "#6c757d", soft: "#eef0ef", aciklama: "Fiili sayım farkı" },
];
const hrk = (id) => HAREKET.find(h => h.id === id) || HAREKET[0];

/* Bir malzemenin belirli lokasyondaki bakiyesi */
function bakiye(moves, itemId, loc) {
  let b = 0;
  for (const m of moves) {
    if (m.item_id !== itemId) continue;
    if (m.to_loc === loc) b += Number(m.qty) || 0;
    if (m.from_loc === loc) b -= Number(m.qty) || 0;
  }
  return b;
}

/* Malzemenin tüm lokasyonlardaki toplamı */
function toplamStok(moves, itemId) {
  let b = 0;
  for (const m of moves) {
    if (m.item_id !== itemId) continue;
    if (m.to_loc) b += Number(m.qty) || 0;
    if (m.from_loc) b -= Number(m.qty) || 0;
  }
  return b;
}

/* Sayıyı okunaklı biçimde göster */
const sayi = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? v.toLocaleString("tr-TR") : v.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
};

function StokYonetimi({ user, zones = [], stockItems = [], stockMoves = [], reload }) {
  const mobil = useIsMobile();
  const isAdmin = user.is_admin;
  const [gorunum, setGorunum] = useState("durum");  // durum | hareket | bolge | analiz | tanim
  const [ara, setAra] = useState("");

  const aktifMoves = stockMoves.filter(m => m.active !== false);
  const noktalar = [{ id: DEPO, ad: "Ana Depo" }, ...zones.map(z => ({ id: z.id, ad: z.name }))];

  /* Her malzeme için özet */
  const ozet = stockItems.map(it => {
    const depo = bakiye(aktifMoves, it.id, DEPO);
    const toplam = toplamStok(aktifMoves, it.id);
    const sahada = toplam - depo;
    const kritik = Number(it.min_level) > 0 && depo <= Number(it.min_level);
    return { ...it, depo, sahada, toplam, kritik };
  }).filter(it => {
    const q = ara.trim().toLowerCase();
    if (!q) return true;
    return it.name.toLowerCase().includes(q) || (it.category || "").toLowerCase().includes(q) || (it.code || "").toLowerCase().includes(q);
  });

  const kritikler = ozet.filter(i => i.kritik);
  const bugunTuketim = aktifMoves.filter(m => m.move_type === "tuketim" && isToday(m.created_at));
  const bugunSevk = aktifMoves.filter(m => m.move_type === "transfer" && isToday(m.created_at));

  const SEKME = [
    { id: "durum",   label: "Stok durumu" },
    { id: "hareket", label: "Hareket girişi" },
    { id: "bolge",   label: "Bölge stokları" },
    { id: "analiz",  label: "Tüketim analizi" },
    ...(isAdmin ? [{ id: "tanim", label: "Malzeme tanımları" }] : []),
  ];

  return (
    <div>
      {/* Özet kartları */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
        {[
          { l: "Malzeme çeşidi", v: stockItems.length, c: T.blue },
          { l: "Kritik seviye", v: kritikler.length, c: kritikler.length > 0 ? T.red : T.green },
          { l: "Bugün sevk", v: bugunSevk.length, c: T.amber },
          { l: "Bugün tüketim", v: bugunTuketim.length, c: T.green },
        ].map(k => (
          <div key={k.l} style={{ ...S.card, marginBottom: 0, padding: 16, borderTop: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 11.5, color: T.sub, fontWeight: 600, marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 26, fontWeight: 800, color: T.ink }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Kritik uyarı */}
      {kritikler.length > 0 && (
        <div style={{ ...S.card, background: T.redSoft, borderColor: "#e5b8b8" }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 15, color: T.red, marginBottom: 8 }}>
            ⚠ Kritik seviyedeki malzemeler
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {kritikler.map(i => (
              <span key={i.id} style={{ ...S.tag("#fff", T.red), border: `1px solid #e5b8b8` }}>
                {i.name}: <b>{sayi(i.depo)} {i.unit}</b> (min {sayi(i.min_level)})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sekmeler */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {SEKME.map(v => (
          <button key={v.id} onClick={() => setGorunum(v.id)} style={{
            ...S.btn, padding: "9px 15px", fontSize: 13.5,
            background: gorunum === v.id ? T.green : "#fbfcfb",
            color: gorunum === v.id ? "#fff" : T.sub,
            border: `1.5px solid ${gorunum === v.id ? T.green : T.line}`,
          }}>{v.label}</button>
        ))}
      </div>

      {gorunum === "durum" && (
        <StokDurum ozet={ozet} ara={ara} setAra={setAra} mobil={mobil} moves={aktifMoves} />
      )}
      {gorunum === "hareket" && (
        <StokHareket user={user} items={stockItems} moves={aktifMoves} noktalar={noktalar} reload={reload} isAdmin={isAdmin} mobil={mobil} />
      )}
      {gorunum === "bolge" && (
        <BolgeStok items={stockItems} moves={aktifMoves} zones={zones} mobil={mobil} />
      )}
      {gorunum === "analiz" && (
        <TuketimAnaliz items={stockItems} moves={aktifMoves} zones={zones} />
      )}
      {gorunum === "tanim" && isAdmin && (
        <MalzemeTanim user={user} items={stockItems} reload={reload} />
      )}
    </div>
  );
}

/* ── 1) STOK DURUMU ── */
function StokDurum({ ozet, ara, setAra, mobil, moves }) {
  const [excelBusy, setExcelBusy] = useState(false);

  const excelAktar = async () => {
    setExcelBusy(true);
    await stilliExcelIndir([{
      ad: "Stok Durumu", baslik: "COP31 · Stok Durum Raporu",
      basliklar: ["Kod", "Malzeme", "Kategori", "Birim", "Depo", "Sahada", "Toplam", "Kritik seviye", "Durum"],
      sayiSutunlari: [4, 5, 6, 7],
      vurguSatir: (r) => r[8] === "KRİTİK",
      satirlar: ozet.map(i => [i.code || "", i.name, i.category || "", i.unit,
        i.depo, i.sahada, i.toplam, i.min_level || 0, i.kritik ? "KRİTİK" : "Normal"]),
      altBilgi: `${ozet.length} malzeme · ${ozet.filter(i => i.kritik).length} kritik seviyede`,
    }], "COP31_Stok_Durumu");
    setExcelBusy(false);
  };

  return (
    <div style={S.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={S.h2}>Stok durumu</div>
          <div style={{ fontSize: 13, color: T.sub }}>{ozet.length} malzeme</div>
        </div>
        <input style={{ ...S.input, marginBottom: 0, width: mobil ? "100%" : 200, padding: "9px 12px", fontSize: 14 }}
          placeholder="Malzeme ara…" value={ara} onChange={e => setAra(e.target.value)} />
        <button onClick={excelAktar} disabled={excelBusy}
          style={{ ...S.btn, padding: "8px 13px", fontSize: 12.5, background: T.greenSoft, color: T.green, opacity: excelBusy ? 0.5 : 1 }}>
          {excelBusy ? "Hazırlanıyor…" : "⤓ Excel"}
        </button>
      </div>

      {ozet.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: T.faint, fontSize: 13.5 }}>Malzeme bulunamadı.</div>
      ) : mobil ? (
        <div>
          {ozet.map(i => (
            <div key={i.id} style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 14.5, color: T.ink, flex: 1 }}>{i.name}</span>
                {i.kritik && <span style={S.tag(T.redSoft, T.red)}>kritik</span>}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 13 }}>
                <span style={{ color: T.sub }}>Depo: <b style={{ color: i.kritik ? T.red : T.ink }}>{sayi(i.depo)} {i.unit}</b></span>
                <span style={{ color: T.sub }}>Sahada: <b style={{ color: T.ink }}>{sayi(i.sahada)}</b></span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr style={{ background: "#fafbfa", borderBottom: `2px solid ${T.line}` }}>
                {["Malzeme", "Kategori", "Depo", "Sahada", "Toplam", "Min.", "Durum"].map((h, i) => (
                  <th key={h} style={{ padding: "11px 12px", textAlign: i <= 1 ? "left" : "center", color: T.sub, fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ozet.map(i => (
                <tr key={i.id} style={{ borderBottom: `1px solid ${T.line}`, background: i.kritik ? T.redSoft : "transparent" }}>
                  <td style={{ padding: "11px 12px", fontWeight: 600, color: T.ink }}>
                    {i.name}
                    {i.code && <div style={{ fontSize: 11, color: T.faint, fontFamily: "monospace" }}>{i.code}</div>}
                  </td>
                  <td style={{ padding: "11px 12px", color: T.sub }}>{i.category || "—"}</td>
                  <td style={{ padding: "11px 12px", textAlign: "center", fontWeight: 700, color: i.kritik ? T.red : T.ink }}>
                    {sayi(i.depo)} <span style={{ fontSize: 11, color: T.faint, fontWeight: 400 }}>{i.unit}</span>
                  </td>
                  <td style={{ padding: "11px 12px", textAlign: "center", color: T.sub }}>{sayi(i.sahada)}</td>
                  <td style={{ padding: "11px 12px", textAlign: "center", fontWeight: 600, color: T.ink }}>{sayi(i.toplam)}</td>
                  <td style={{ padding: "11px 12px", textAlign: "center", color: T.faint }}>{sayi(i.min_level)}</td>
                  <td style={{ padding: "11px 12px", textAlign: "center" }}>
                    <span style={S.tag(i.kritik ? "#fff" : T.greenSoft, i.kritik ? T.red : T.green)}>
                      {i.kritik ? "Kritik" : "Normal"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── 2) HAREKET GİRİŞİ ── */
function StokHareket({ user, items, moves, noktalar, reload, isAdmin, mobil }) {
  const [tip, setTip] = useState("tuketim");
  const [f, setF] = useState({ item_id: "", qty: "", from_loc: "", to_loc: "", note: "", doc_no: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [mesaj, setMesaj] = useState("");

  const h = hrk(tip);
  const secili = items.find(i => i.id === f.item_id);

  /* Hareket tipine göre hangi alanlar gerekli */
  const kaynakGerek = ["transfer", "tuketim", "iade", "fire"].includes(tip);
  const hedefGerek  = ["giris", "transfer", "iade"].includes(tip);

  /* Kaynak lokasyondaki mevcut bakiye */
  const mevcut = f.item_id && f.from_loc ? bakiye(moves, f.item_id, f.from_loc) : null;
  const yetersiz = mevcut !== null && Number(f.qty) > mevcut && tip !== "sayim";

  useEffect(() => {
    /* Tip değişince varsayılan lokasyonları ayarla */
    if (tip === "giris")    setF(p => ({ ...p, from_loc: "", to_loc: DEPO }));
    if (tip === "transfer") setF(p => ({ ...p, from_loc: DEPO, to_loc: "" }));
    if (tip === "tuketim")  setF(p => ({ ...p, from_loc: "", to_loc: "" }));
    if (tip === "iade")     setF(p => ({ ...p, from_loc: "", to_loc: DEPO }));
    if (tip === "fire")     setF(p => ({ ...p, from_loc: "", to_loc: "" }));
  }, [tip]);

  const gecerli = f.item_id && Number(f.qty) > 0
    && (!kaynakGerek || f.from_loc) && (!hedefGerek || f.to_loc) && !yetersiz;

  const kaydet = async () => {
    if (!gecerli || busy) return;
    setBusy(true);
    await insertRow("stock_moves", {
      item_id: f.item_id, item_name: secili?.name || "",
      move_type: tip, qty: Number(f.qty), unit: secili?.unit || "",
      from_loc: kaynakGerek ? f.from_loc : null,
      to_loc: hedefGerek ? f.to_loc : null,
      note: f.note || null, doc_no: f.doc_no || null, staff_name: user.name,
    }, user.name);
    setF(p => ({ ...p, item_id: "", qty: "", note: "", doc_no: "" }));
    setBusy(false); setMesaj("✓ Hareket kaydedildi");
    setTimeout(() => setMesaj(""), 2500);
    reload();
  };

  const sonHareketler = moves.slice(-15).reverse();

  return (
    <div style={{ display: "grid", gridTemplateColumns: mobil ? "1fr" : "minmax(320px, 420px) 1fr", gap: 16, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.h2}>Stok hareketi</div>
        <div style={S.sub}>{h.aciklama}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6, marginBottom: 14 }}>
          {HAREKET.filter(x => isAdmin || !["giris", "sayim"].includes(x.id)).map(x => (
            <button key={x.id} onClick={() => setTip(x.id)} style={{
              ...S.btn, padding: "10px 8px", fontSize: 12.5,
              background: tip === x.id ? x.renk : "#fbfcfb",
              color: tip === x.id ? "#fff" : T.sub,
              border: `1.5px solid ${tip === x.id ? x.renk : T.line}`,
            }}>{x.label}</button>
          ))}
        </div>

        <label style={S.label}>Malzeme <span style={{ color: T.red }}>*</span></label>
        <select style={S.input} value={f.item_id} onChange={e => set("item_id", e.target.value)}>
          <option value="">Seçin</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
        </select>

        {kaynakGerek && (
          <>
            <label style={S.label}>Nereden <span style={{ color: T.red }}>*</span></label>
            <select style={S.input} value={f.from_loc} onChange={e => set("from_loc", e.target.value)}>
              <option value="">Seçin</option>
              {noktalar.map(n => <option key={n.id} value={n.id}>{n.id === DEPO ? n.ad : `${n.id} — ${n.ad}`}</option>)}
            </select>
          </>
        )}

        {hedefGerek && (
          <>
            <label style={S.label}>Nereye <span style={{ color: T.red }}>*</span></label>
            <select style={S.input} value={f.to_loc} onChange={e => set("to_loc", e.target.value)}>
              <option value="">Seçin</option>
              {noktalar.map(n => <option key={n.id} value={n.id}>{n.id === DEPO ? n.ad : `${n.id} — ${n.ad}`}</option>)}
            </select>
          </>
        )}

        <label style={S.label}>Miktar <span style={{ color: T.red }}>*</span> {secili && <span style={{ color: T.faint }}>({secili.unit})</span>}</label>
        <input style={{ ...S.input, borderColor: yetersiz ? T.red : T.line }} type="number" min="0" step="0.01"
          placeholder="0" value={f.qty} onChange={e => set("qty", e.target.value)} />
        {mevcut !== null && (
          <div style={{ fontSize: 12, color: yetersiz ? T.red : T.faint, marginTop: -9, marginBottom: 12 }}>
            Seçilen noktadaki mevcut: <b>{sayi(mevcut)} {secili?.unit}</b>
            {yetersiz && " — yetersiz stok!"}
          </div>
        )}

        {tip === "giris" && (
          <>
            <label style={S.label}>İrsaliye / fatura no</label>
            <input style={S.input} placeholder="Örn: A-2026/1451" value={f.doc_no} onChange={e => set("doc_no", e.target.value)} />
          </>
        )}

        <label style={S.label}>Not</label>
        <input style={S.input} placeholder="İsteğe bağlı açıklama" value={f.note} onChange={e => set("note", e.target.value)} />

        <button onClick={kaydet} disabled={!gecerli || busy}
          style={{ ...S.btn, background: h.renk, color: "#fff", width: "100%", opacity: (!gecerli || busy) ? 0.4 : 1 }}>
          {busy ? "Kaydediliyor…" : `${h.label} kaydet`}
        </button>
        {mesaj && (
          <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: T.greenSoft, color: T.green, fontSize: 13.5, textAlign: "center", fontWeight: 600 }}>
            {mesaj}
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.h2}>Son hareketler</div>
        <div style={{ marginTop: 10 }}>
          {sonHareketler.length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>Hareket yok.</div>
          ) : sonHareketler.map(m => {
            const hh = hrk(m.move_type);
            return (
              <div key={m.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={S.tag(hh.soft, hh.renk)}>{hh.label}</span>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: T.ink, flex: 1, minWidth: 120 }}>{m.item_name}</span>
                  <span style={{ fontWeight: 700, color: hh.renk }}>{hh.yon} {sayi(m.qty)} {m.unit}</span>
                  {isAdmin && (
                    <button onClick={async () => {
                      if (!window.confirm(`Bu hareket geri alınacak:\n${hh.label} · ${m.item_name} · ${sayi(m.qty)} ${m.unit}\n\nStok bakiyesi düzelir. Devam edilsin mi?`)) return;
                      await deactivateRow("stock_moves", m.id, user.name); reload();
                    }} title="Hareketi geri al" style={{ ...S.btn, padding: "3px 9px", fontSize: 11, background: T.redSoft, color: T.red, minHeight: 0 }}>Geri al</button>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>
                  {m.from_loc && <>{m.from_loc === DEPO ? "Depo" : m.from_loc}</>}
                  {m.from_loc && m.to_loc && " → "}
                  {m.to_loc && <>{m.to_loc === DEPO ? "Depo" : m.to_loc}</>}
                  {m.doc_no && ` · ${m.doc_no}`}
                  {m.note && ` · ${m.note}`}
                  <span style={{ color: T.faint }}> · {m.staff_name} · {trDate(m.created_at)} {trTime(m.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── 3) BÖLGE STOKLARI (matris) ── */
function BolgeStok({ items, moves, zones, mobil }) {
  const [excelBusy, setExcelBusy] = useState(false);
  /* Sadece hareket görmüş malzemeler gösterilsin */
  const aktifItems = items.filter(i => moves.some(m => m.item_id === i.id));

  const excelAktar = async () => {
    setExcelBusy(true);
    await stilliExcelIndir([{
      ad: "Bölge Stokları", baslik: "Bölge Bazlı Stok Dağılımı",
      basliklar: ["Malzeme", "Birim", "Depo", ...zones.map(z => z.id), "Toplam"],
      sayiSutunlari: [2, ...zones.map((_, i) => i + 3), zones.length + 3],
      satirlar: aktifItems.map(i => [
        i.name, i.unit, bakiye(moves, i.id, DEPO),
        ...zones.map(z => bakiye(moves, i.id, z.id)),
        toplamStok(moves, i.id),
      ]),
      altBilgi: zones.map(z => `${z.id} = ${z.name}`).join(" · "),
    }], "COP31_Bolge_Stoklari");
    setExcelBusy(false);
  };

  return (
    <div style={S.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={S.h2}>Bölge stokları</div>
          <div style={{ fontSize: 13, color: T.sub }}>Hangi bölgede ne kadar malzeme var</div>
        </div>
        <button onClick={excelAktar} disabled={excelBusy}
          style={{ ...S.btn, padding: "8px 13px", fontSize: 12.5, background: T.greenSoft, color: T.green, opacity: excelBusy ? 0.5 : 1 }}>
          {excelBusy ? "Hazırlanıyor…" : "⤓ Excel"}
        </button>
      </div>

      {aktifItems.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: T.faint, fontSize: 13.5 }}>
          Henüz stok hareketi yok. "Hareket girişi" sekmesinden mal kabul ve sevk yapın.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 200 + zones.length * 70 }}>
            <thead>
              <tr style={{ background: "#fafbfa", borderBottom: `2px solid ${T.line}` }}>
                <th style={{ padding: "10px 12px", textAlign: "left", color: T.sub, fontSize: 11.5, fontWeight: 600, position: "sticky", left: 0, background: "#fafbfa" }}>Malzeme</th>
                <th style={{ padding: "10px 8px", textAlign: "center", color: T.green, fontSize: 11.5, fontWeight: 700 }}>DEPO</th>
                {zones.map(z => (
                  <th key={z.id} title={z.name} style={{ padding: "10px 8px", textAlign: "center", color: T.sub, fontSize: 11.5, fontWeight: 600 }}>{z.id}</th>
                ))}
                <th style={{ padding: "10px 8px", textAlign: "center", color: T.ink, fontSize: 11.5, fontWeight: 700 }}>Toplam</th>
              </tr>
            </thead>
            <tbody>
              {aktifItems.map(i => {
                const depo = bakiye(moves, i.id, DEPO);
                const kritik = Number(i.min_level) > 0 && depo <= Number(i.min_level);
                return (
                  <tr key={i.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: T.ink, position: "sticky", left: 0, background: "#fff" }}>
                      {i.name}
                      <span style={{ fontSize: 11, color: T.faint, fontWeight: 400 }}> ({i.unit})</span>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: kritik ? T.red : T.green, background: kritik ? T.redSoft : T.greenSoft }}>
                      {sayi(depo)}
                    </td>
                    {zones.map(z => {
                      const b = bakiye(moves, i.id, z.id);
                      return (
                        <td key={z.id} style={{ padding: "10px 8px", textAlign: "center", color: b > 0 ? T.ink : T.faint, fontWeight: b > 0 ? 600 : 400 }}>
                          {b > 0 ? sayi(b) : "—"}
                        </td>
                      );
                    })}
                    <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: T.ink, background: "#fafbfa" }}>
                      {sayi(toplamStok(moves, i.id))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── 4) TÜKETİM ANALİZİ ── */
function TuketimAnaliz({ items, moves, zones }) {
  const [gun, setGun] = useState(30);
  const [excelBusy, setExcelBusy] = useState(false);

  const sinir = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - gun); d.setHours(0, 0, 0, 0); return d; }, [gun]);
  const tuketim = moves.filter(m => m.move_type === "tuketim" && new Date(m.created_at) >= sinir);
  const fire = moves.filter(m => m.move_type === "fire" && new Date(m.created_at) >= sinir);

  /* Günlük trend */
  const gunluk = useMemo(() => {
    const liste = [];
    for (let i = gun - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const etiket = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
      const gunHareket = tuketim.filter(m => new Date(m.created_at).toDateString() === d.toDateString());
      liste.push({ gun: etiket, adet: gunHareket.length, miktar: gunHareket.reduce((a, m) => a + Number(m.qty), 0) });
    }
    return gun > 31 ? liste.filter((_, i) => i % 2 === 0) : liste;
  }, [tuketim, gun]);

  /* Malzeme bazlı tüketim */
  const malzemeBazli = items.map(i => {
    const t = tuketim.filter(m => m.item_id === i.id);
    const f = fire.filter(m => m.item_id === i.id);
    const toplam = t.reduce((a, m) => a + Number(m.qty), 0);
    return {
      name: i.name, unit: i.unit, toplam,
      gunlukOrt: gun ? toplam / gun : 0,
      fireToplam: f.reduce((a, m) => a + Number(m.qty), 0),
      mevcut: bakiye(moves, i.id, DEPO),
      /* Kalan gün tahmini */
      kalanGun: (toplam / gun) > 0 ? Math.floor(bakiye(moves, i.id, DEPO) / (toplam / gun)) : null,
    };
  }).filter(x => x.toplam > 0).sort((a, b) => b.toplam - a.toplam);

  /* Bölge bazlı tüketim */
  const bolgeBazli = zones.map(z => {
    const t = tuketim.filter(m => m.from_loc === z.id);
    return { name: z.id, tam: z.name, adet: t.length, miktar: t.reduce((a, m) => a + Number(m.qty), 0) };
  }).filter(x => x.miktar > 0).sort((a, b) => b.miktar - a.miktar);

  const excelAktar = async () => {
    setExcelBusy(true);
    await stilliExcelIndir([
      {
        ad: "Malzeme Tüketimi", baslik: `Malzeme Tüketim Analizi · Son ${gun} gün`,
        basliklar: ["Malzeme", "Birim", "Toplam tüketim", "Günlük ortalama", "Fire", "Depo mevcut", "Tahmini yeterlilik (gün)"],
        sayiSutunlari: [2, 3, 4, 5, 6],
        vurguSatir: (r) => r[6] !== "—" && Number(r[6]) < 7,
        satirlar: malzemeBazli.map(m => [m.name, m.unit, Number(m.toplam.toFixed(2)),
          Number(m.gunlukOrt.toFixed(2)), Number(m.fireToplam.toFixed(2)), m.mevcut,
          m.kalanGun !== null ? m.kalanGun : "—"]),
      },
      {
        ad: "Bölge Tüketimi", baslik: `Bölge Bazlı Tüketim · Son ${gun} gün`,
        basliklar: ["Bölge", "Bölge adı", "Hareket sayısı", "Toplam miktar"],
        sayiSutunlari: [2, 3],
        satirlar: bolgeBazli.map(b => [b.name, b.tam, b.adet, Number(b.miktar.toFixed(2))]),
      },
      {
        ad: "Tüketim Dökümü", baslik: "Tüketim Hareketleri",
        basliklar: ["Tarih", "Saat", "Malzeme", "Bölge", "Miktar", "Birim", "Kaydeden", "Not"],
        sayiSutunlari: [4],
        satirlar: tuketim.slice().reverse().map(m => [trDate(m.created_at), trTime(m.created_at),
          m.item_name, m.from_loc || "", Number(m.qty), m.unit || "", m.staff_name || "", m.note || ""]),
      },
    ], "COP31_Tuketim_Analizi");
    setExcelBusy(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: T.sub, fontWeight: 600 }}>Dönem:</span>
        {[7, 30, 90].map(g => (
          <button key={g} onClick={() => setGun(g)} style={{
            ...S.btn, padding: "8px 14px", fontSize: 12.5,
            background: gun === g ? T.green : "#fbfcfb", color: gun === g ? "#fff" : T.sub,
            border: `1.5px solid ${gun === g ? T.green : T.line}`,
          }}>{g} gün</button>
        ))}
        <button onClick={excelAktar} disabled={excelBusy}
          style={{ ...S.btn, padding: "8px 14px", fontSize: 12.5, background: T.greenSoft, color: T.green, marginLeft: "auto", opacity: excelBusy ? 0.5 : 1 }}>
          {excelBusy ? "Hazırlanıyor…" : "⤓ Excel"}
        </button>
      </div>

      {tuketim.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 50, color: T.faint }}>
          Bu dönemde tüketim kaydı yok.
        </div>
      ) : (
        <>
          <div style={S.card}>
            <div style={S.h2}>Günlük tüketim trendi</div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={gunluk}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                <XAxis dataKey="gun" tick={{ fontSize: 10.5, fill: T.sub }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: T.sub }} />
                <Tooltip contentStyle={S.tooltip} />
                <Area type="monotone" dataKey="miktar" stroke={T.green} fill={T.green} fillOpacity={0.15} strokeWidth={2} name="Tüketim" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            <div style={S.card}>
              <div style={S.h2}>En çok tüketilen malzemeler</div>
              <ResponsiveContainer width="100%" height={Math.max(200, Math.min(malzemeBazli.length, 8) * 34)}>
                <BarChart data={malzemeBazli.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: T.sub }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: T.ink }} width={140} />
                  <Tooltip contentStyle={S.tooltip} />
                  <Bar dataKey="toplam" fill={T.blue} radius={[0, 5, 5, 0]} name="Tüketim" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {bolgeBazli.length > 0 && (
              <div style={S.card}>
                <div style={S.h2}>Bölge bazlı tüketim</div>
                <ResponsiveContainer width="100%" height={Math.max(200, Math.min(bolgeBazli.length, 8) * 34)}>
                  <BarChart data={bolgeBazli.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.sub }} />
                    <YAxis tick={{ fontSize: 11, fill: T.sub }} />
                    <Tooltip contentStyle={S.tooltip} formatter={(v, n, p) => [sayi(v), p?.payload?.tam || "Tüketim"]} />
                    <Bar dataKey="miktar" fill={T.amber} radius={[5, 5, 0, 0]} name="Miktar" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={S.h2}>Tüketim ve yeterlilik</div>
            <div style={S.sub}>Mevcut stok, bu tüketim hızıyla kaç gün yeter</div>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
                <thead>
                  <tr style={{ background: "#fafbfa", borderBottom: `2px solid ${T.line}` }}>
                    {["Malzeme", "Toplam tüketim", "Günlük ort.", "Fire", "Depo mevcut", "Yeterlilik"].map((h, i) => (
                      <th key={h} style={{ padding: "10px 10px", textAlign: i === 0 ? "left" : "center", color: T.sub, fontSize: 11.5, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {malzemeBazli.map(m => {
                    const az = m.kalanGun !== null && m.kalanGun < 7;
                    return (
                      <tr key={m.name} style={{ borderBottom: `1px solid ${T.line}`, background: az ? T.redSoft : "transparent" }}>
                        <td style={{ padding: "10px", fontWeight: 600, color: T.ink }}>{m.name}</td>
                        <td style={{ padding: "10px", textAlign: "center" }}>{sayi(m.toplam)} <span style={{ fontSize: 11, color: T.faint }}>{m.unit}</span></td>
                        <td style={{ padding: "10px", textAlign: "center", color: T.sub }}>{sayi(m.gunlukOrt.toFixed(1))}</td>
                        <td style={{ padding: "10px", textAlign: "center", color: m.fireToplam > 0 ? T.red : T.faint }}>{m.fireToplam > 0 ? sayi(m.fireToplam) : "—"}</td>
                        <td style={{ padding: "10px", textAlign: "center", fontWeight: 600 }}>{sayi(m.mevcut)}</td>
                        <td style={{ padding: "10px", textAlign: "center" }}>
                          {m.kalanGun !== null ? (
                            <span style={S.tag(az ? "#fff" : T.greenSoft, az ? T.red : T.green)}>
                              ~{m.kalanGun} gün
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── 5) MALZEME TANIMLARI ── */
function MalzemeTanim({ user, items, reload }) {
  const BIRIMLER = ["adet", "kg", "lt", "koli", "paket", "kutu", "rulo", "metre"];
  const [f, setF] = useState({ name: "", code: "", category: "", unit: "adet", min_level: "", unit_cost: "", supplier: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [duzId, setDuzId] = useState(null);
  const [duz, setDuz] = useState({});

  const ekle = async () => {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    await insertRow("stock_items", {
      name: f.name.trim(), code: f.code || null, category: f.category || null,
      unit: f.unit, min_level: Number(f.min_level) || 0,
      unit_cost: f.unit_cost ? Number(f.unit_cost) : null, supplier: f.supplier || null,
    }, user.name);
    setF({ name: "", code: "", category: "", unit: "adet", min_level: "", unit_cost: "", supplier: "" });
    setBusy(false); reload();
  };

  const kaydet = async (i) => {
    if (!duz.name?.trim()) return;
    await updateRow("stock_items", i.id, {
      name: duz.name.trim(), code: duz.code || null, category: duz.category || null,
      unit: duz.unit, min_level: Number(duz.min_level) || 0,
      unit_cost: duz.unit_cost ? Number(duz.unit_cost) : null, supplier: duz.supplier || null,
    }, user.name);
    setDuzId(null); reload();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.h2}>Yeni malzeme</div>
        <div style={S.sub}>Kritik seviye belirlerseniz stok azalınca uyarı alırsınız.</div>
        <label style={S.label}>Malzeme adı <span style={{ color: T.red }}>*</span></label>
        <input style={S.input} placeholder="Örn: Çöp poşeti 80x110" value={f.name} onChange={e => set("name", e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={S.label}>Stok kodu</label>
            <input style={S.input} placeholder="Örn: SRF-001" value={f.code} onChange={e => set("code", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Kategori</label>
            <input style={S.input} placeholder="Sarf / Temizlik…" value={f.category} onChange={e => set("category", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Birim</label>
            <select style={S.input} value={f.unit} onChange={e => set("unit", e.target.value)}>
              {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Kritik seviye</label>
            <input style={S.input} type="number" min="0" placeholder="0" value={f.min_level} onChange={e => set("min_level", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Birim maliyet (₺)</label>
            <input style={S.input} type="number" min="0" step="0.01" placeholder="0,00" value={f.unit_cost} onChange={e => set("unit_cost", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Tedarikçi</label>
            <input style={S.input} placeholder="İsteğe bağlı" value={f.supplier} onChange={e => set("supplier", e.target.value)} />
          </div>
        </div>
        <button onClick={ekle} disabled={!f.name.trim() || busy} style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: (!f.name.trim() || busy) ? 0.4 : 1 }}>
          Malzeme ekle
        </button>
      </div>

      <div style={S.card}>
        <div style={S.h2}>Malzemeler ({items.length})</div>
        <div style={{ marginTop: 10 }}>
          {items.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>Malzeme yok.</div>
          ) : items.map(i => (
            <div key={i.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
              {duzId === i.id ? (
                <div>
                  <input style={{ ...S.input, marginBottom: 6, padding: "7px 10px" }} value={duz.name}
                    onChange={e => setDuz(p => ({ ...p, name: e.target.value }))} autoFocus />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                    <input style={{ ...S.input, marginBottom: 0, padding: "7px 10px" }} value={duz.category || ""}
                      onChange={e => setDuz(p => ({ ...p, category: e.target.value }))} placeholder="Kategori" />
                    <select style={{ ...S.input, marginBottom: 0, padding: "7px 10px" }} value={duz.unit}
                      onChange={e => setDuz(p => ({ ...p, unit: e.target.value }))}>
                      {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <input style={{ ...S.input, marginBottom: 0, padding: "7px 10px" }} type="number" value={duz.min_level ?? ""}
                      onChange={e => setDuz(p => ({ ...p, min_level: e.target.value }))} placeholder="Kritik seviye" />
                    <input style={{ ...S.input, marginBottom: 0, padding: "7px 10px" }} type="number" step="0.01" value={duz.unit_cost ?? ""}
                      onChange={e => setDuz(p => ({ ...p, unit_cost: e.target.value }))} placeholder="Birim maliyet" />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => kaydet(i)} style={{ ...S.btn, padding: "7px 12px", fontSize: 12, ...S.btnGreen }}>Kaydet</button>
                    <button onClick={() => setDuzId(null)} style={{ ...S.btn, padding: "7px 12px", fontSize: 12, ...S.btnGhost }}>İptal</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: T.ink }}>{i.name}</div>
                    <div style={{ fontSize: 11.5, color: T.faint }}>
                      {i.code ? `${i.code} · ` : ""}{i.category || "kategorisiz"} · {i.unit}
                      {Number(i.min_level) > 0 && ` · min ${sayi(i.min_level)}`}
                      {i.unit_cost && ` · ${sayi(i.unit_cost)} ₺`}
                    </div>
                  </div>
                  <button onClick={() => { setDuzId(i.id); setDuz({ ...i }); }}
                    style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.blueSoft, color: T.blue }}>Düzenle</button>
                  <button onClick={async () => {
                    if (!window.confirm(`"${i.name}" malzemesi listeden kaldırılacak.\n\nGeçmiş hareketleri korunur. Devam edilsin mi?`)) return;
                    await deactivateRow("stock_items", i.id, user.name); reload();
                  }} style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.redSoft, color: T.red }}>Sil</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

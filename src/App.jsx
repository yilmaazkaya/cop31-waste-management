import { useState, useEffect, useMemo, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend, AreaChart, Area, LineChart, Line } from "recharts";
import { supa, isOnline, fetchAll, insertRow, updateRow, deactivateRow, hardDeleteRow, uploadPhoto, uploadFile, storageUsage, FILE_LIMITS, carbonOf, EMISSION, sendTaskEmail } from "./supa.js";

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
const SHIFTS = ["Sabah (06-14)", "Öğle (14-22)", "Gece (22-06)", "Tam gün"];

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
  { id: "gorev",     label: "Görevler",    desc: "Bölge sorumlulukları, SLA" },
  { id: "olay",      label: "Olaylar",     desc: "Sorun bildirimi" },
  { id: "rapor",     label: "Rapor",       desc: "Özet + CSV dışa aktarım" },
  { id: "personel",  label: "Personel",    desc: "Ekip yönetimi", admin: true },
  { id: "unvan",     label: "Görev & Departman", desc: "Unvan ve departmanları yönet", admin: true },
  { id: "bolge",     label: "Bölgeler",    desc: "Bölge ekle/düzenle", admin: true },
  { id: "qr",        label: "QR kodlar",   desc: "QR üret ve yazdır", admin: true },
  { id: "hedef",     label: "Hedefler",    desc: "ISO 20121 hedefleri", admin: true },
];

const ROLE_TABS = {
  "Temizlik":       ["saha", "istakip"],
  "Atık Toplama":   ["atik", "istakip"],
  "Araç Sürücü":    ["atik", "istakip"],
  "Denetim":        ["dashboard", "istakip", "isanaliz", "olay", "gorev", "rapor"],
  "Saha Sorumlusu": ["dashboard", "istakip", "isanaliz", "saha", "atik", "gorev", "olay", "rapor"],
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
const S = {
  card: { background: T.surface, borderRadius: 14, border: `1px solid ${T.line}`, padding: 22, marginBottom: 16 },
  h2: { fontFamily: "'Sora', sans-serif", fontSize: 17, fontWeight: 700, color: T.ink, marginBottom: 4 },
  sub: { fontSize: 13, color: T.sub, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 600, color: T.sub, marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: 0.4 },
  input: { width: "100%", padding: "11px 13px", borderRadius: 10, border: `1.5px solid ${T.line}`, background: "#fbfcfb", color: T.ink, fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box", fontFamily: "'Inter', sans-serif" },
  btn: { padding: "12px 22px", borderRadius: 10, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Inter', sans-serif" },
  btnGreen: { background: T.green, color: "#fff" },
  btnGhost: { background: "transparent", color: T.sub, border: `1.5px solid ${T.line}` },
  btnRed: { background: T.red, color: "#fff" },
  tag: (bg, fg) => ({ display: "inline-block", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: bg, color: fg }),
  tooltip: { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 12.5, boxShadow: "0 4px 16px rgba(22,36,29,.08)" },
};

/* ═══════════ KÖK: GİRİŞ + UYGULAMA ═══════════ */
export default function Root() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("cop31_user")); } catch { return null; }
  });
  const login = (u) => { sessionStorage.setItem("cop31_user", JSON.stringify(u)); setUser(u); };
  const logout = () => { sessionStorage.removeItem("cop31_user"); setUser(null); };
  return user ? <App user={user} logout={logout} /> : <Login onLogin={login} />;
}

/* ═══════════ GİRİŞ EKRANI ═══════════ */
function Login({ onLogin }) {
  const [staffList, setStaffList] = useState([]);
  const [sel, setSel] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll("staff").then(s => { setStaffList(s.filter(x => x.active !== false)); setLoading(false); });
  }, []);

  const tryLogin = () => {
    const u = staffList.find(s => s.id === sel);
    if (!u) return setErr("Personel seçin.");
    if ((u.pin || "0000") !== pin) return setErr("PIN hatalı.");
    onLogin({ id: u.id, name: u.name, role: u.role, is_admin: !!u.is_admin, permissions: u.permissions || null });
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ ...S.card, maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: T.green, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 20, margin: "0 auto 14px" }}>31</div>
        <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 20, color: T.ink }}>COP31 Atık Yönetimi</div>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 22 }}>Antalya · Kasım 2026</div>

        {loading ? (
          <div style={{ color: T.faint, padding: 20 }}>Yükleniyor…</div>
        ) : staffList.length === 0 ? (
          <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6, textAlign: "left", background: T.amberSoft, borderRadius: 10, padding: 14 }}>
            Sistemde kayıtlı personel yok. {isOnline
              ? "Supabase'de schema.sql çalıştırıldığında 'Yönetici' hesabı (PIN: 1907) otomatik oluşur."
              : "Yerel modda ilk giriş için aşağıdan 'Yerel yönetici olarak devam et' seçin."}
            {!isOnline && (
              <button onClick={() => onLogin({ id: "local-admin", name: "Yerel Yönetici", role: "Saha Sorumlusu", is_admin: true })}
                style={{ ...S.btn, ...S.btnGreen, width: "100%", marginTop: 12 }}>
                Yerel yönetici olarak devam et
              </button>
            )}
          </div>
        ) : (
          <>
            <select style={S.input} value={sel} onChange={e => { setSel(e.target.value); setErr(""); }}>
              <option value="">Adınızı seçin</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name} — {s.role}</option>)}
            </select>
            <input style={{ ...S.input, textAlign: "center", letterSpacing: 8, fontSize: 20 }} type="password" inputMode="numeric" maxLength={4}
              placeholder="PIN" value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && tryLogin()} />
            {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <button onClick={tryLogin} style={{ ...S.btn, ...S.btnGreen, width: "100%" }}>Giriş yap</button>
          </>
        )}

        <div style={{ marginTop: 18, fontSize: 11.5, color: T.faint }}>
          {isOnline ? "● Merkezi veritabanına bağlı" : "○ Yerel mod — Supabase bağlı değil (kurulum: KURULUM.md)"}
        </div>
      </div>
    </div>
  );
}

/* ═══════════ ANA UYGULAMA ═══════════ */
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
  const [qrZone, setQrZone] = useState(null);

  const reload = useCallback(async () => {
    const [s, c, w, i, a, t, z, tk, jr, dp] = await Promise.all([
      fetchAll("staff"), fetchAll("clean_logs"), fetchAll("waste_logs"),
      fetchAll("incidents"), fetchAll("assignments"), fetchAll("targets"),
      fetchAll("zones"), fetchAll("tasks"), fetchAll("job_roles"), fetchAll("departments"),
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

  const ctx = { user, staff, zones, tasks, roles, depts, cleanLogs, wasteLogs, incidents, assignments, targets, reload, qrZone };

  // Kullanıcının erişimi olmayan bir sekmedeyse ilk izinli sekmeye düş
  useEffect(() => {
    if (!allowed.includes(tab)) setTab(allowed[0] || "saha");
  }, [tab, user.role, user.is_admin]); // eslint-disable-line

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex" }}>
      {/* SOL KENAR ÇUBUĞU */}
      <aside style={{
        width: 220, background: T.surface, borderRight: `1px solid ${T.line}`,
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 16px", borderBottom: `1px solid ${T.line}` }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: T.green, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>31</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 13.5, color: T.ink, lineHeight: 1.15 }}>COP31 Atık</div>
            <div style={{ fontSize: 10.5, color: T.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isOnline ? "● Merkezi" : "○ Yerel"} · {user.name}</div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: 10, overflowY: "auto", flex: 1 }}>
          {NAV.map(n => {
            const badge = n.id === "istakip"
              ? tasks.filter(t => t.assignee_id === user.id && !t.seen && t.status !== "tamamlandi").length
              : 0;
            return (
              <button key={n.id} onClick={() => setTab(n.id)} style={{
                ...S.btn, padding: "10px 14px", fontSize: 13.5, textAlign: "left",
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
          <button onClick={logout} title="Oturumu kapat" style={{
            ...S.btn, padding: "10px 14px", fontSize: 13.5, textAlign: "left", width: "100%",
            background: "transparent", color: T.faint,
          }}>← Çıkış</button>
        </div>
      </aside>

      {/* İÇERİK */}
      <main style={{ flex: 1, minWidth: 0, maxWidth: 1000, margin: "0 auto", padding: "26px 20px 60px" }}>
        {allowed.includes(tab) && (<>
          {tab === "dashboard" && <Dashboard {...ctx} />}
          {tab === "istakip" && <TaskManager {...ctx} />}
          {tab === "isanaliz" && <TaskAnalytics {...ctx} />}
          {tab === "saha" && <FieldEntry {...ctx} />}
          {tab === "atik" && <WasteEntry {...ctx} />}
          {tab === "gorev" && <Assignments {...ctx} />}
          {tab === "olay" && <Incidents {...ctx} />}
          {tab === "rapor" && <Report {...ctx} />}
          {tab === "personel" && user.is_admin && <Personnel {...ctx} />}
          {tab === "unvan" && user.is_admin && <RolesManager {...ctx} />}
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
  const openInc = incidents.filter(i => i.status === "Açık").length;

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
          <div style={S.h2}>Son atık kayıtları</div>
          <div style={{ marginTop: 10 }}>
            {wasteLogs.slice(-10).reverse().map(l => {
              const wt = WASTE_TYPES.find(t => t.id === l.type);
              return (
                <div key={l.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={S.tag(wt.color + "1a", wt.color)}>{wt.name}</span>
                    <span style={{ fontWeight: 700, color: T.ink }}>{l.amount} kg</span>
                    <span style={{ color: T.sub }}>{l.zone} → {l.destination}</span>
                    {l.photo_url && <a href={l.photo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.blue }}>📷 kanıt</a>}
                    <span style={{ marginLeft: "auto", color: T.faint, fontSize: 12.5 }}>{trDate(l.created_at)} {trTime(l.created_at)}</span>
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
function Incidents({ user, zones = [], incidents, reload }) {
  const [zone, setZone] = useState("");
  const [severity, setSeverity] = useState("low");
  const [desc, setDesc] = useState("");
  const SEV = {
    low: { label: "Düşük", color: T.blue, soft: T.blueSoft },
    medium: { label: "Orta", color: T.amber, soft: T.amberSoft },
    high: { label: "Yüksek", color: T.red, soft: T.redSoft },
  };

  const submit = async () => {
    if (!zone || !desc.trim()) return;
    await insertRow("incidents", { zone, severity, description: desc.trim(), status: "Açık", staff_name: user.name }, user.name);
    setDesc(""); reload();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.h2}>Olay bildir</div>
        <div style={S.sub}>Dökülme, arıza, taşma veya güvenlik sorunları.</div>
        <label style={S.label}>Bölge</label>
        <select style={S.input} value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">Seçin</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
        </select>
        <label style={S.label}>Önem</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {Object.entries(SEV).map(([k, v]) => (
            <button key={k} onClick={() => setSeverity(k)} style={{
              ...S.btn, flex: 1, padding: "10px 8px", fontSize: 13,
              background: severity === k ? v.color : "#fbfcfb",
              color: severity === k ? "#fff" : T.sub,
              border: `1.5px solid ${severity === k ? v.color : T.line}`,
            }}>{v.label}</button>
          ))}
        </div>
        <label style={S.label}>Açıklama</label>
        <textarea style={{ ...S.input, height: 90, resize: "vertical" }} placeholder="Ne oldu?" value={desc} onChange={e => setDesc(e.target.value)} />
        <button onClick={submit} disabled={!zone || !desc.trim()} style={{ ...S.btn, ...S.btnRed, width: "100%", opacity: (!zone || !desc.trim()) ? 0.4 : 1 }}>Bildir</button>
      </div>

      <div style={S.card}>
        <div style={S.h2}>Olay listesi ({incidents.length})</div>
        {incidents.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>Açık olay yok.</div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {incidents.slice().reverse().map(i => (
              <div key={i.id} style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={S.tag(SEV[i.severity].soft, SEV[i.severity].color)}>{SEV[i.severity].label}</span>
                  <span style={{ fontSize: 13, color: T.sub }}>{i.zone} · {i.staff_name}</span>
                  <span style={{ marginLeft: "auto" }}>
                    {i.status === "Açık" ? (
                      <button onClick={async () => { await updateRow("incidents", i.id, { status: "Kapatıldı" }, user.name); reload(); }}
                        style={{ ...S.btn, padding: "5px 12px", fontSize: 12, background: T.greenSoft, color: T.green }}>Kapat</button>
                    ) : <span style={S.tag("#eef0ef", T.faint)}>Kapatıldı</span>}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: T.ink, marginTop: 6 }}>{i.description}</div>
                <div style={{ fontSize: 12, color: T.faint, marginTop: 3 }}>{trDate(i.created_at)} {trTime(i.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════ PERSONEL (yalnız yönetici) ═══════════ */
function Personnel({ user, staff, roles = [], depts = [], cleanLogs, reload }) {
  const roleNames = roles.length > 0 ? roles.map(r => r.name) : FALLBACK_ROLES;
  const deptNames = depts.map(d => d.name);
  const firstRole = roleNames[0] || "Temizlik";
  const [f, setF] = useState({ name: "", role: firstRole, department: "", shift: SHIFTS[0], phone: "", email: "", pin: "", is_admin: false, perms: ROLE_TABS[firstRole] || [] });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [editId, setEditId] = useState(null);
  const [e_, setE_] = useState({});
  const setE = (k, v) => setE_(p => ({ ...p, [k]: v }));
  const [fDept, setFDept] = useState("hepsi");
  const [fRole, setFRole] = useState("hepsi");
  const shown = staff.filter(s => staffMatches(s, fDept, fRole));

  const add = async () => {
    if (!f.name.trim() || f.pin.length !== 4) return;
    const { perms, ...rest } = f;
    await insertRow("staff", { ...rest, name: f.name.trim(), permissions: JSON.stringify(perms || []) }, user.name);
    setF({ name: "", role: firstRole, department: "", shift: SHIFTS[0], phone: "", email: "", pin: "", is_admin: false, perms: ROLE_TABS[firstRole] || [] });
    reload();
  };

  const startEdit = (s) => {
    let perms = [];
    try { perms = s.permissions ? JSON.parse(s.permissions) : []; } catch { perms = []; }
    if (!perms.length) perms = ROLE_TABS[s.role] || [];
    setEditId(s.id);
    setE_({ name: s.name, role: s.role, department: s.department || "", shift: s.shift, phone: s.phone || "", email: s.email || "", pin: s.pin || "", is_admin: !!s.is_admin, perms });
  };
  const cancelEdit = () => { setEditId(null); setE_({}); };
  const saveEdit = async (s) => {
    if (!e_.name?.trim() || (e_.pin || "").length !== 4) return;
    await updateRow("staff", s.id, {
      name: e_.name.trim(), role: e_.role, department: e_.department || null, shift: e_.shift, phone: e_.phone || null, email: e_.email || null,
      pin: e_.pin, is_admin: e_.is_admin, permissions: JSON.stringify(e_.perms || []),
    }, user.name);
    cancelEdit(); reload();
  };

  /* Rol değişince önerilen ekranları otomatik işaretle (kullanıcı sonra değiştirebilir) */
  const roleChanged = (which, newRole) => {
    const suggested = ROLE_TABS[newRole] || [];
    if (which === "new") setF(p => ({ ...p, role: newRole, perms: suggested }));
    else setE_(p => ({ ...p, role: newRole, perms: suggested }));
  };

  const togglePerm = (which, id) => {
    const cur = which === "new" ? (f.perms || []) : (e_.perms || []);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    if (which === "new") setF(p => ({ ...p, perms: next }));
    else setE_(p => ({ ...p, perms: next }));
  };

  /* Ekran seçim kutuları (yönetici işaretliyse gizlenir — o zaten her şeyi görür) */
  const PermPicker = ({ which, isAdmin, perms }) => isAdmin ? (
    <div style={{ fontSize: 12.5, color: T.blue, background: T.blueSoft, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      Yönetici tüm ekranları görür — ayrı seçim gerekmez.
    </div>
  ) : (
    <div style={{ marginBottom: 12 }}>
      <label style={S.label}>Göreceği ekranlar</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
        {ALL_TABS.filter(t => !t.admin).map(t => {
          const on = (perms || []).includes(t.id);
          return (
            <button key={t.id} type="button" onClick={() => togglePerm(which, t.id)} title={t.desc} style={{
              ...S.btn, padding: "8px 10px", fontSize: 12.5, textAlign: "left",
              background: on ? T.greenSoft : "#fbfcfb",
              color: on ? T.green : T.sub,
              border: `1.5px solid ${on ? T.green : T.line}`,
              fontWeight: on ? 700 : 500,
            }}>{on ? "✓ " : ""}{t.label}</button>
          );
        })}
      </div>
      {(perms || []).length === 0 && (
        <div style={{ fontSize: 12, color: T.amber, marginTop: 6 }}>En az bir ekran seçin.</div>
      )}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.h2}>Yeni personel</div>
        <div style={S.sub}>PIN 4 haneli olmalı — personel bu kodla giriş yapar.</div>
        <label style={S.label}>Ad Soyad</label>
        <input style={S.input} placeholder="Ayşe Yılmaz" value={f.name} onChange={e => set("name", e.target.value)} />
        <label style={S.label}>Görev</label>
        <select style={S.input} value={f.role} onChange={e => roleChanged("new", e.target.value)}>
          {roleNames.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label style={S.label}>Departman</label>
        <select style={S.input} value={f.department} onChange={e => set("department", e.target.value)}>
          <option value="">— Seçilmedi —</option>
          {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <label style={S.label}>Vardiya</label>
        <select style={S.input} value={f.shift} onChange={e => set("shift", e.target.value)}>
          {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={S.label}>Telefon</label>
            <input style={S.input} placeholder="05xx…" value={f.phone} onChange={e => set("phone", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>PIN (4 hane)</label>
            <input style={S.input} maxLength={4} inputMode="numeric" placeholder="****" value={f.pin} onChange={e => set("pin", e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <label style={S.label}>E-posta (görev bildirimi için)</label>
        <input style={S.input} type="email" placeholder="ornek@eposta.com" value={f.email || ""} onChange={e => set("email", e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.sub, marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={f.is_admin} onChange={e => set("is_admin", e.target.checked)} />
          Yönetici yetkisi (tüm ekranları görür)
        </label>
        <PermPicker which="new" isAdmin={f.is_admin} perms={f.perms} />
        <button onClick={add} disabled={!f.name.trim() || f.pin.length !== 4 || (!f.is_admin && (f.perms || []).length === 0)}
          style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: (!f.name.trim() || f.pin.length !== 4 || (!f.is_admin && (f.perms || []).length === 0)) ? 0.4 : 1 }}>Ekle</button>
      </div>

      <div style={S.card}>
        <div style={S.h2}>Ekip ({shown.length}{shown.length !== staff.length ? ` / ${staff.length}` : ""})</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 4px" }}>
          {deptNames.length > 0 && (
            <select style={{ ...S.input, marginBottom: 0, width: "auto", minWidth: 150, padding: "7px 10px", fontSize: 13 }} value={fDept} onChange={e => setFDept(e.target.value)}>
              <option value="hepsi">Tüm departmanlar</option>
              {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
              <option value="__yok">— Departmansız —</option>
            </select>
          )}
          <select style={{ ...S.input, marginBottom: 0, width: "auto", minWidth: 140, padding: "7px 10px", fontSize: 13 }} value={fRole} onChange={e => setFRole(e.target.value)}>
            <option value="hepsi">Tüm görevler</option>
            {roleNames.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {(fDept !== "hepsi" || fRole !== "hepsi") && (
            <button onClick={() => { setFDept("hepsi"); setFRole("hepsi"); }} style={{ ...S.btn, padding: "7px 12px", fontSize: 12.5, ...S.btnGhost }}>Temizle</button>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          {shown.map(s => (
            <div key={s.id} style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
              {editId === s.id ? (
                <div>
                  <input style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} value={e_.name} onChange={ev => setE("name", ev.target.value)} placeholder="Ad Soyad" autoFocus />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} value={e_.role} onChange={ev => roleChanged("edit", ev.target.value)}>
                      {roleNames.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} value={e_.shift} onChange={ev => setE("shift", ev.target.value)}>
                      {SHIFTS.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                  <select style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} value={e_.department || ""} onChange={ev => setE("department", ev.target.value)}>
                    <option value="">— Departman seçilmedi —</option>
                    {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} value={e_.phone} onChange={ev => setE("phone", ev.target.value)} placeholder="Telefon" />
                    <input style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} maxLength={4} inputMode="numeric" value={e_.pin} onChange={ev => setE("pin", ev.target.value.replace(/\D/g, ""))} placeholder="PIN (4 hane)" />
                  </div>
                  <input style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} type="email" value={e_.email} onChange={ev => setE("email", ev.target.value)} placeholder="E-posta (görev bildirimi)" />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.sub, marginBottom: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={e_.is_admin} onChange={ev => setE("is_admin", ev.target.checked)} />
                    Yönetici yetkisi
                  </label>
                  <PermPicker which="edit" isAdmin={e_.is_admin} perms={e_.perms} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => saveEdit(s)} style={{ ...S.btn, padding: "8px 14px", fontSize: 12.5, ...S.btnGreen }}>Kaydet</button>
                    <button onClick={cancelEdit} style={{ ...S.btn, padding: "8px 14px", fontSize: 12.5, ...S.btnGhost }}>İptal</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: s.is_admin ? T.blueSoft : T.greenSoft, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sora', sans-serif", fontWeight: 700, color: s.is_admin ? T.blue : T.green, flexShrink: 0 }}>
                    {s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5, color: T.ink }}>{s.name}{s.is_admin ? " · Yönetici" : ""}</div>
                    <div style={{ fontSize: 12.5, color: T.sub }}>{s.role}{s.department ? ` · ${s.department}` : ""} · {s.shift}{s.phone ? ` · ${s.phone}` : ""}</div>
                    <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>
                      Ekranlar: {s.is_admin ? "Tümü" : allowedTabsFor(s).map(id => ALL_TABS.find(t => t.id === id)?.label).filter(Boolean).join(", ") || "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 17, color: T.green }}>
                      {cleanLogs.filter(c => c.staff_id === s.id).length}
                    </div>
                    <div style={{ fontSize: 10.5, color: T.faint }}>kayıt</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => startEdit(s)} style={{ ...S.btn, padding: "7px 12px", fontSize: 12, background: T.blueSoft, color: T.blue }}>Düzenle</button>
                    {s.id !== user.id && (
                      <button onClick={async () => { if (window.confirm(`"${s.name}" pasifleştirilsin mi?`)) { await deactivateRow("staff", s.id, user.name); reload(); } }}
                        style={{ ...S.btn, padding: "7px 12px", fontSize: 12, background: T.redSoft, color: T.red }}>Pasifleştir</button>
                    )}
                    {DENEME_MODU && s.id !== user.id && (
                      <button title="Kalıcı sil (deneme modu)" onClick={async () => { if (window.confirm(`"${s.name}" KALICI olarak silinsin mi? Bu geri alınamaz.`)) { await hardDeleteRow("staff", s.id, user.name); reload(); } }}
                        style={{ ...S.btn, padding: "7px 12px", fontSize: 12, background: T.red, color: "#fff" }}>Sil</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {DENEME_MODU && (
        <div style={{ ...S.card, gridColumn: "1 / -1", background: T.redSoft, borderColor: "#e5b8b8" }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 15, color: T.red, marginBottom: 4 }}>Deneme verisini temizle</div>
          <div style={{ fontSize: 13, color: "#7a2020", marginBottom: 14, lineHeight: 1.6 }}>
            Tüm temizlik, atık, olay, görev ve bölge kayıtlarını ve <b>kendiniz hariç</b> personeli KALICI olarak siler.
            Canlıya geçmeden önce sistemi sıfırlamak için kullanın. Bu işlem geri alınamaz.
          </div>
          <button onClick={async () => {
            if (!window.confirm("TÜM deneme verisi kalıcı silinecek (kendiniz hariç). Emin misiniz?")) return;
            if (!window.confirm("Son onay: bu işlem GERİ ALINAMAZ. Devam?")) return;
            for (const tbl of ["clean_logs", "waste_logs", "incidents", "assignments", "zones"]) {
              const rows = await fetchAll(tbl);
              for (const r of rows) await hardDeleteRow(tbl, r.id, user.name);
            }
            const people = await fetchAll("staff");
            for (const p of people) if (p.id !== user.id) await hardDeleteRow("staff", p.id, user.name);
            alert("Deneme verisi temizlendi.");
            reload();
          }} style={{ ...S.btn, background: T.red, color: "#fff" }}>
            Tüm deneme verisini sil
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════ QR ═══════════ */
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
        <div className="print-area" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
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
                      <button title="Kalıcı sil (deneme modu)" onClick={async () => { if (window.confirm(`"${z.name}" bölgesi KALICI silinsin mi? Geri alınamaz.`)) { await hardDeleteRow("zones", z.dbId || z.id, user.name); reload(); } }}
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
      <div style={{ ...S.card, fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>
        Karbon faktörleri: geri dönüşüm {EMISSION["Geri Dönüşüm Tesisi"]}, kompost {EMISSION["Kompost Alanı"]}, depolama {EMISSION["Düzenli Depolama"]} kg CO₂e/kg;
        taşıma {EMISSION.TRANSPORT_PER_TON_KM} kg CO₂e/ton-km. Resmî raporlamada ulusal faktörlerle doğrulanmalıdır.
      </div>
    </div>
  );
}

/* ═══════════ GÖREV / UNVAN YÖNETİMİ (yalnız yönetici) ═══════════ */
function RolesManager({ user, roles = [], depts = [], staff, reload }) {
  if (!isOnline) {
    return (
      <div style={{ ...S.card, maxWidth: 560, margin: "0 auto" }}>
        <div style={S.h2}>Görev & Departman yönetimi</div>
        <div style={{ fontSize: 13.5, color: T.amber, background: T.amberSoft, borderRadius: 10, padding: 14 }}>
          Yalnız merkezi modda yönetilir. Supabase'de schema_roles.sql ve schema_departments.sql çalıştırılmalı.
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      <LookupManager
        user={user} reload={reload} staff={staff}
        table="job_roles" items={roles.filter(r => r.id)}
        title="Görev / Unvan" hint="Personele atanacak unvanlar (örn: Vinç Operatörü, Güvenlik)."
        placeholder="Örn: Vinç Operatörü" usedBy={(s, name) => s.role === name}
        usedMsg="görevi bazı personelde kullanılıyor. Önce o kişilerin görevini değiştirin."
      />
      <LookupManager
        user={user} reload={reload} staff={staff}
        table="departments" items={depts}
        title="Departman" hint="Ekip birimleri (örn: Lojistik, Çevre & Denetim). Filtrelemede kullanılır."
        placeholder="Örn: Lojistik" usedBy={(s, name) => s.department === name}
        usedMsg="departmanı bazı personelde kullanılıyor. Önce o kişilerin departmanını değiştirin."
      />
    </div>
  );
}

/* Görev ve departman için ortak ekle/düzenle/sil bileşeni */
function LookupManager({ user, reload, staff, table, items, title, hint, placeholder, usedBy, usedMsg }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

  const add = async () => {
    if (!name.trim() || busy) return;
    if (items.some(r => r.name.toLowerCase() === name.trim().toLowerCase())) { alert("Bu kayıt zaten var."); return; }
    setBusy(true);
    await insertRow(table, { name: name.trim() }, user.name);
    setName(""); setBusy(false); reload();
  };
  const startEdit = (r) => { setEditId(r.id); setEditName(r.name); };
  const cancelEdit = () => { setEditId(null); setEditName(""); };
  const saveEdit = async (r) => {
    if (!editName.trim()) return;
    await updateRow(table, r.id, { name: editName.trim() }, user.name);
    cancelEdit(); reload();
  };
  const remove = async (r) => {
    if (staff.some(s => usedBy(s, r.name))) { alert(`"${r.name}" ${usedMsg}`); return; }
    if (!window.confirm(`"${r.name}" silinsin mi?`)) return;
    await deactivateRow(table, r.id, user.name);
    reload();
  };

  return (
    <div style={S.card}>
      <div style={S.h2}>{title}</div>
      <div style={S.sub}>{hint}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input style={{ ...S.input, marginBottom: 0 }} placeholder={placeholder} value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button onClick={add} disabled={!name.trim() || busy} style={{ ...S.btn, ...S.btnGreen, flexShrink: 0, opacity: (!name.trim() || busy) ? 0.4 : 1 }}>
          Ekle
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>Henüz kayıt yok.</div>
      ) : items.map(r => {
        const count = staff.filter(s => usedBy(s, r.name)).length;
        return (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
            {editId === r.id ? (
              <>
                <input style={{ ...S.input, marginBottom: 0, padding: "7px 10px", flex: 1 }} value={editName}
                  onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(r)} autoFocus />
                <button onClick={() => saveEdit(r)} style={{ ...S.btn, padding: "7px 11px", fontSize: 12, ...S.btnGreen }}>Kaydet</button>
                <button onClick={cancelEdit} style={{ ...S.btn, padding: "7px 11px", fontSize: 12, ...S.btnGhost }}>İptal</button>
              </>
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: T.ink }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: T.faint }}>{count} personel</div>
                </div>
                <button onClick={() => startEdit(r)} style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.blueSoft, color: T.blue }}>Düzenle</button>
                <button onClick={() => remove(r)} style={{ ...S.btn, padding: "6px 11px", fontSize: 12, background: T.redSoft, color: T.red }}>Sil</button>
              </>
            )}
          </div>
        );
      })}
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
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("acik");
  const [dept, setDept] = useState("hepsi");
  const [role, setRole] = useState("hepsi");

  const staffIds = useMemo(() => new Set(
    staff.filter(s => staffMatches(s, dept, role)).map(s => s.id)
  ), [staff, dept, role]);
  const filtering = dept !== "hepsi" || role !== "hepsi";

  // Ekranı açınca kendine atanan görülmemişleri "görüldü" işaretle
  useEffect(() => {
    (async () => {
      const mine = tasks.filter(t => t.assignee_id === user.id && !t.seen);
      if (mine.length) { for (const t of mine) await updateRow("tasks", t.id, { seen: true }, user.name); reload(); }
    })();
  }, []); // eslint-disable-line

  const mineOrAll = (isAdmin ? tasks : tasks.filter(t => t.assignee_id === user.id))
    .filter(t => !filtering || staffIds.has(t.assignee_id));
  const visible = mineOrAll.filter(t => {
    if (filter === "acik") return t.status !== "tamamlandi";
    if (filter === "hepsi") return true;
    return t.status === filter;
  }).slice().reverse();

  if (openId) {
    const t = tasks.find(x => x.id === openId);
    if (!t) { setOpenId(null); return null; }
    return <TaskDetail task={t} user={user} isAdmin={isAdmin} onBack={() => setOpenId(null)} reload={reload} />;
  }

  return (
    <div>
      {isAdmin && (
        <FilterBar depts={depts} roles={roles} dept={dept} setDept={setDept} role={role} setRole={setRole}
          note={filtering ? `${visible.length} görev gösteriliyor` : null} />
      )}
      <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "minmax(300px, 380px) 1fr" : "1fr", gap: 16, alignItems: "start" }}>
        {isAdmin && <NewTaskForm user={user} staff={staff} roles={roles} depts={depts} reload={reload} />}

      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={S.h2}>{isAdmin ? "Tüm görevler" : "Bana atanan görevler"}</div>
            <div style={{ fontSize: 13, color: T.sub }}>{visible.length} görev</div>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[{ id: "acik", label: "Açık" }, { id: "hepsi", label: "Hepsi" }, ...STATUSES].map(s => (
              <button key={s.id} onClick={() => setFilter(s.id)} style={{
                ...S.btn, padding: "6px 11px", fontSize: 12,
                background: filter === s.id ? T.green : "#fbfcfb",
                color: filter === s.id ? "#fff" : T.sub,
                border: `1.5px solid ${filter === s.id ? T.green : T.line}`,
              }}>{s.label}</button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>
            {isAdmin ? "Görev yok." : "Size atanmış görev yok."}
          </div>
        ) : visible.map(t => {
          const st = statOf(t.status), pr = priOf(t.priority);
          const cl = parseCl(t.checklist);
          const done = cl.filter(i => i.done).length;
          const overdue = t.due_date && t.status !== "tamamlandi" && new Date(t.due_date) < new Date(new Date().toDateString());
          return (
            <div key={t.id} onClick={() => setOpenId(t.id)} style={{ padding: "13px 0", borderBottom: `1px solid ${T.line}`, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={S.tag(st.soft, st.color)}>{st.label}</span>
                <span style={{ fontWeight: 700, fontSize: 14.5, color: T.ink, flex: 1, minWidth: 140 }}>{t.title}</span>
                <span style={S.tag(pr.color + "1a", pr.color)}>{pr.label}</span>
                {DENEME_MODU && isAdmin && (
                  <button onClick={async (e) => { e.stopPropagation(); if (window.confirm(`"${t.title}" KALICI silinsin mi?`)) { await hardDeleteRow("tasks", t.id, user.name); reload(); } }}
                    title="Kalıcı sil" style={{ ...S.btn, padding: "4px 10px", fontSize: 11.5, background: T.red, color: "#fff" }}>Sil</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 12.5, color: T.sub, alignItems: "center" }}>
                {isAdmin && <span>→ {t.assignee_name}</span>}
                {cl.length > 0 && <span>☑ {done}/{cl.length}</span>}
                {t.due_date && <span style={{ color: overdue ? T.red : T.faint, fontWeight: overdue ? 700 : 400 }}>Termin: {new Date(t.due_date).toLocaleDateString("tr-TR")}{overdue ? " (gecikti)" : ""}</span>}
                <span style={{ marginLeft: "auto", color: T.blue, fontWeight: 600 }}>Aç →</span>
              </div>
            </div>
          );
        })}
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

  const candidates = staff.filter(s => pickDept === "hepsi" || s.department === pickDept);

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
function TaskDetail({ task, user, isAdmin, onBack, reload }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const st = statOf(task.status), pr = priOf(task.priority);
  const cl = parseCl(task.checklist);
  const mine = task.assignee_id === user.id;

  const loadComments = async () => {
    const all = await fetchAll("task_comments");
    setComments(all.filter(c => c.task_id === task.id && c.active !== false));
  };
  useEffect(() => { loadComments(); }, [task.id]); // eslint-disable-line

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
    setBody(""); setFile(null); setBusy(false); loadComments();
  };

  const changeStatus = async (status, extra = {}) => { await updateRow("tasks", task.id, { status, ...extra }, user.name); reload(); };

  const sendForApproval = () => changeStatus("onay_bekliyor");
  const approve = () => changeStatus("tamamlandi", { approved_by: user.name, approved_at: new Date().toISOString(), reject_note: null });
  const reject = () => { const note = window.prompt("Revize gerekçesi (personele iletilecek):"); if (note !== null) changeStatus("revize", { reject_note: note || "Revize gerekli" }); };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={onBack} style={{ ...S.btn, ...S.btnGhost }}>← Görev listesi</button>
        {isAdmin && (
          <button onClick={async () => { if (window.confirm(`"${task.title}" görevi kaldırılsın mı? (listeden kalkar, kayıt korunur)`)) { await deactivateRow("tasks", task.id, user.name); reload(); onBack(); } }}
            style={{ ...S.btn, padding: "12px 16px", fontSize: 13.5, background: T.redSoft, color: T.red, marginLeft: "auto" }}>Kaldır</button>
        )}
        {DENEME_MODU && isAdmin && (
          <button title="Kalıcı sil (deneme modu)" onClick={async () => { if (window.confirm(`"${task.title}" görevi KALICI silinsin mi? Yorumlar dahil geri alınamaz.`)) { await hardDeleteRow("tasks", task.id, user.name); reload(); onBack(); } }}
            style={{ ...S.btn, padding: "12px 16px", fontSize: 13.5, background: T.red, color: "#fff" }}>Kalıcı sil</button>
        )}
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={S.tag(st.soft, st.color)}>{st.label}</span>
          <span style={S.tag(pr.color + "1a", pr.color)}>{pr.label}</span>
          {task.due_date && <span style={{ fontSize: 12.5, color: T.sub }}>Termin: {new Date(task.due_date).toLocaleDateString("tr-TR")}</span>}
        </div>
        <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 19, fontWeight: 800, color: T.ink }}>{task.title}</div>
        {task.description && <div style={{ fontSize: 14, color: T.sub, marginTop: 6, lineHeight: 1.6 }}>{task.description}</div>}
        <div style={{ fontSize: 12.5, color: T.faint, marginTop: 8 }}>
          Atayan: {task.assigned_by} · Atanan: {task.assignee_name}
          {task.approved_by && ` · Onaylayan: ${task.approved_by}`}
        </div>
        {task.status === "revize" && task.reject_note && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: T.redSoft, color: T.red, fontSize: 13 }}>
            <b>Revize notu:</b> {task.reject_note}
          </div>
        )}
      </div>

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

      {/* Durum / onay aksiyonları */}
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
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13, flex: 1 }} />
          <button onClick={addComment} disabled={(!body.trim() && !file) || busy} style={{ ...S.btn, ...S.btnGreen, opacity: ((!body.trim() && !file) || busy) ? 0.4 : 1 }}>
            {busy ? "Gönderiliyor…" : "Gönder"}
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 8 }}>
          Fotoğraflar otomatik küçültülür. Belge (PDF/Word/Excel) en fazla {FILE_LIMITS.DOC_MAX_MB} MB.
        </div>
        {!isOnline && <div style={{ fontSize: 12, color: T.amber, marginTop: 8 }}>Yerel modda dosya yüklenmez (Supabase gerekli).</div>}
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

  const KPI = ({ label, value, unit, accent, hint }) => (
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
        <KPI label="Toplam görev" value={total} unit="" accent={T.blue} />
        <KPI label="Tamamlanan" value={done} unit="" accent={T.green} hint={`%${completionRate} tamamlanma`} />
        <KPI label="Açık görev" value={open} unit="" accent={T.amber} />
        <KPI label="Onay bekleyen" value={waiting} unit="" accent={waiting > 0 ? T.blue : T.faint} />
        <KPI label="Geciken" value={overdue} unit="" accent={overdue > 0 ? T.red : T.faint} />
        <KPI label="Ort. tamamlanma" value={avgDays !== null ? avgDays.toFixed(1) : "—"} unit={avgDays !== null ? "gün" : ""} accent={T.green} />
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
    ["Toplam olay / açık", `${incidents.length} / ${incidents.filter(i => i.status === "Açık").length}`],
    ["Görev (toplam / tamamlanan)", `${scopedTasks.length} / ${scopedTasks.filter(t => t.status === "tamamlandi").length}`],
  ];

  const exportCSV = () => {
    let csv = "\uFEFFTip;Tarih;Saat;Bölge;Personel;Detay;Miktar;UATF;Lisans;km;CO2e(kg);Fotoğraf\n";
    cleanLogs.forEach(c => { csv += `Temizlik;${trDate(c.created_at)};${trTime(c.created_at)};${c.zone};${c.staff_name};${c.action} ${c.notes || ""};;;;;;\n`; });
    wasteLogs.forEach(w => {
      csv += `Atık;${trDate(w.created_at)};${trTime(w.created_at)};${w.zone};${w.staff_name || ""};${WASTE_TYPES.find(t => t.id === w.type)?.name} → ${w.destination};${w.amount};${w.uatf_no || ""};${w.facility_license || ""};${w.km || 0};${carbonOf(w).toFixed(3)};${w.photo_url || ""}\n`;
    });
    incidents.forEach(i => { csv += `Olay;${trDate(i.created_at)};${trTime(i.created_at)};${i.zone};${i.staff_name || ""};${i.description};;;;;;${i.status}\n`; });
    scopedTasks.forEach(t => { csv += `Görev;${trDate(t.created_at)};${trTime(t.created_at)};${t.department || ""};${t.assignee_name || ""};${t.title};;;;;;${statOf(t.status).label}\n`; });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cop31_rapor_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
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
          <button onClick={exportCSV} style={{ ...S.btn, ...S.btnGhost }}>Excel'e aktar (CSV)</button>
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

import { useState, useEffect, useMemo, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";
import { supa, isOnline, fetchAll, insertRow, updateRow, deactivateRow, uploadPhoto, carbonOf, EMISSION } from "./supa.js";

/* ═══════════ SABİTLER ═══════════ */
const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

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
const ROLES = ["Temizlik", "Atık Toplama", "Denetim", "Araç Sürücü", "Saha Sorumlusu"];
const SHIFTS = ["Sabah (06-14)", "Öğle (14-22)", "Gece (22-06)", "Tam gün"];

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
    onLogin({ id: u.id, name: u.name, role: u.role, is_admin: !!u.is_admin });
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
  const [qrZone, setQrZone] = useState(null);

  const reload = useCallback(async () => {
    const [s, c, w, i, a, t, z] = await Promise.all([
      fetchAll("staff"), fetchAll("clean_logs"), fetchAll("waste_logs"),
      fetchAll("incidents"), fetchAll("assignments"), fetchAll("targets"), fetchAll("zones"),
    ]);
    setStaff(s.filter(x => x.active !== false));
    setCleanLogs(c.filter(x => x.active !== false));
    setWasteLogs(w.filter(x => x.active !== false));
    setIncidents(i.filter(x => x.active !== false));
    setAssignments(a.filter(x => x.active !== false));
    setTargets(t);
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

  const NAV = [
    { id: "dashboard", label: "Genel durum" },
    { id: "saha", label: "Saha kaydı" },
    { id: "atik", label: "Atık girişi" },
    { id: "gorev", label: "Görevler" },
    { id: "olay", label: "Olaylar" },
    { id: "rapor", label: "Rapor" },
    ...(user.is_admin ? [
      { id: "personel", label: "Personel" },
      { id: "bolge", label: "Bölgeler" },
      { id: "qr", label: "QR kodlar" },
      { id: "hedef", label: "Hedefler" },
    ] : []),
  ];

  const ctx = { user, staff, zones, cleanLogs, wasteLogs, incidents, assignments, targets, reload, qrZone };

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
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{
              ...S.btn, padding: "10px 14px", fontSize: 13.5, textAlign: "left",
              background: tab === n.id ? T.greenSoft : "transparent",
              color: tab === n.id ? T.green : T.sub, fontWeight: tab === n.id ? 700 : 500,
            }}>{n.label}</button>
          ))}
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
        {tab === "dashboard" && <Dashboard {...ctx} />}
        {tab === "saha" && <FieldEntry {...ctx} />}
        {tab === "atik" && <WasteEntry {...ctx} />}
        {tab === "gorev" && <Assignments {...ctx} />}
        {tab === "olay" && <Incidents {...ctx} />}
        {tab === "rapor" && <Report {...ctx} />}
        {tab === "personel" && user.is_admin && <Personnel {...ctx} />}
        {tab === "bolge" && user.is_admin && <ZonesManager {...ctx} />}
        {tab === "qr" && user.is_admin && <QRManager {...ctx} />}
        {tab === "hedef" && user.is_admin && <Targets {...ctx} />}
      </main>
    </div>
  );
}

/* ═══════════ GENEL DURUM ═══════════ */
function Dashboard({ zones = [], cleanLogs, wasteLogs, incidents, targets, assignments }) {
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
function Personnel({ user, staff, cleanLogs, reload }) {
  const [f, setF] = useState({ name: "", role: ROLES[0], shift: SHIFTS[0], phone: "", pin: "", is_admin: false });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [editId, setEditId] = useState(null);
  const [e_, setE_] = useState({});
  const setE = (k, v) => setE_(p => ({ ...p, [k]: v }));

  const add = async () => {
    if (!f.name.trim() || f.pin.length !== 4) return;
    await insertRow("staff", { ...f, name: f.name.trim() }, user.name);
    setF({ name: "", role: ROLES[0], shift: SHIFTS[0], phone: "", pin: "", is_admin: false });
    reload();
  };

  const startEdit = (s) => { setEditId(s.id); setE_({ name: s.name, role: s.role, shift: s.shift, phone: s.phone || "", pin: s.pin || "", is_admin: !!s.is_admin }); };
  const cancelEdit = () => { setEditId(null); setE_({}); };
  const saveEdit = async (s) => {
    if (!e_.name?.trim() || (e_.pin || "").length !== 4) return;
    await updateRow("staff", s.id, { name: e_.name.trim(), role: e_.role, shift: e_.shift, phone: e_.phone || null, pin: e_.pin, is_admin: e_.is_admin }, user.name);
    cancelEdit(); reload();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.h2}>Yeni personel</div>
        <div style={S.sub}>PIN 4 haneli olmalı — personel bu kodla giriş yapar.</div>
        <label style={S.label}>Ad Soyad</label>
        <input style={S.input} placeholder="Ayşe Yılmaz" value={f.name} onChange={e => set("name", e.target.value)} />
        <label style={S.label}>Görev</label>
        <select style={S.input} value={f.role} onChange={e => set("role", e.target.value)}>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
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
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.sub, marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={f.is_admin} onChange={e => set("is_admin", e.target.checked)} />
          Yönetici yetkisi (personel/QR/hedef ekranlarını görür)
        </label>
        <button onClick={add} disabled={!f.name.trim() || f.pin.length !== 4}
          style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: (!f.name.trim() || f.pin.length !== 4) ? 0.4 : 1 }}>Ekle</button>
      </div>

      <div style={S.card}>
        <div style={S.h2}>Ekip ({staff.length})</div>
        <div style={{ marginTop: 10 }}>
          {staff.map(s => (
            <div key={s.id} style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
              {editId === s.id ? (
                <div>
                  <input style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} value={e_.name} onChange={ev => setE("name", ev.target.value)} placeholder="Ad Soyad" autoFocus />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} value={e_.role} onChange={ev => setE("role", ev.target.value)}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} value={e_.shift} onChange={ev => setE("shift", ev.target.value)}>
                      {SHIFTS.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} value={e_.phone} onChange={ev => setE("phone", ev.target.value)} placeholder="Telefon" />
                    <input style={{ ...S.input, marginBottom: 8, padding: "7px 10px" }} maxLength={4} inputMode="numeric" value={e_.pin} onChange={ev => setE("pin", ev.target.value.replace(/\D/g, ""))} placeholder="PIN (4 hane)" />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.sub, marginBottom: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={e_.is_admin} onChange={ev => setE("is_admin", ev.target.checked)} />
                    Yönetici yetkisi
                  </label>
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
                    <div style={{ fontSize: 12.5, color: T.sub }}>{s.role} · {s.shift}{s.phone ? ` · ${s.phone}` : ""}</div>
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
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
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

/* ═══════════ RAPOR ═══════════ */
function Report({ staff, cleanLogs, wasteLogs, incidents, targets }) {
  const totalWaste = wasteLogs.reduce((s, w) => s + Number(w.amount), 0);
  const recycled = wasteLogs.filter(w => w.destination === "Geri Dönüşüm Tesisi").reduce((s, w) => s + Number(w.amount), 0);
  const carbon = wasteLogs.reduce((s, w) => s + carbonOf(w), 0);
  const tRate = targets.find(t => t.key === "recycle_rate")?.value ?? 75;
  const rate = totalWaste > 0 ? Math.round((recycled / totalWaste) * 100) : 0;

  const rows = [
    ["Rapor tarihi", new Date().toLocaleDateString("tr-TR")],
    ["Toplam temizlik kaydı", cleanLogs.length],
    ["Kayıtlı personel", staff.length],
    ["Toplam atık", `${totalWaste.toLocaleString("tr-TR")} kg`],
    ["Geri dönüşüme gönderilen", `${recycled.toLocaleString("tr-TR")} kg`],
    ["Geri dönüşüm oranı / hedef", totalWaste > 0 ? `%${rate} / %${tRate}` : "—"],
    ["Toplam karbon ayak izi", `${carbon.toFixed(1)} kg CO₂e`],
    ["Fotoğraflı (kanıtlı) atık kaydı", wasteLogs.filter(w => w.photo_url).length],
    ["UATF'li tehlikeli atık kaydı", wasteLogs.filter(w => w.uatf_no).length],
    ["Toplam olay / açık", `${incidents.length} / ${incidents.filter(i => i.status === "Açık").length}`],
  ];

  const exportCSV = () => {
    let csv = "\uFEFFTip;Tarih;Saat;Bölge;Personel;Detay;Miktar;UATF;Lisans;km;CO2e(kg);Fotoğraf\n";
    cleanLogs.forEach(c => { csv += `Temizlik;${trDate(c.created_at)};${trTime(c.created_at)};${c.zone};${c.staff_name};${c.action} ${c.notes || ""};;;;;;\n`; });
    wasteLogs.forEach(w => {
      csv += `Atık;${trDate(w.created_at)};${trTime(w.created_at)};${w.zone};${w.staff_name || ""};${WASTE_TYPES.find(t => t.id === w.type)?.name} → ${w.destination};${w.amount};${w.uatf_no || ""};${w.facility_license || ""};${w.km || 0};${carbonOf(w).toFixed(3)};${w.photo_url || ""}\n`;
    });
    incidents.forEach(i => { csv += `Olay;${trDate(i.created_at)};${trTime(i.created_at)};${i.zone};${i.staff_name || ""};${i.description};;;;;;${i.status}\n`; });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cop31_rapor_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
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

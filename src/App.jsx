import { useState, useEffect, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend, AreaChart, Area } from "recharts";

/* ═══════════ SABİTLER ═══════════ */
const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

const DEFAULT_ZONES = [
  { id: "Z01", name: "Ana Konferans Salonu", area: "4.200 m²" },
  { id: "Z02", name: "Sergi Alanı A", area: "2.800 m²" },
  { id: "Z03", name: "Sergi Alanı B", area: "2.400 m²" },
  { id: "Z04", name: "Yemek Alanı", area: "1.600 m²" },
  { id: "Z05", name: "Medya Merkezi", area: "1.200 m²" },
  { id: "Z06", name: "VIP Lounge", area: "800 m²" },
  { id: "Z07", name: "Dış Alan / Bahçe", area: "5.000 m²" },
  { id: "Z08", name: "Otopark & Transfer", area: "3.500 m²" },
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

/* ═══════════ YARDIMCILAR ═══════════ */
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const today = () => new Date().toLocaleDateString("tr-TR");

function useStored(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

/* ═══════════ TASARIM SİSTEMİ ═══════════ */
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

/* ═══════════ ANA UYGULAMA ═══════════ */
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [zones] = useState(DEFAULT_ZONES);
  const [staff, setStaff] = useStored("cop31_staff", []);
  const [cleanLogs, setCleanLogs] = useStored("cop31_clean", []);
  const [wasteLogs, setWasteLogs] = useStored("cop31_waste", []);
  const [incidents, setIncidents] = useStored("cop31_incidents", []);

  // QR ile gelen bölge parametresi (?zone=Z01)
  const [qrZone, setQrZone] = useState(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("zone");
    if (p && DEFAULT_ZONES.some(z => z.id === p)) {
      setQrZone(p);
      setTab("saha");
    }
  }, []);

  const NAV = [
    { id: "dashboard", label: "Genel durum" },
    { id: "saha", label: "Saha kaydı" },
    { id: "atik", label: "Atık girişi" },
    { id: "personel", label: "Personel" },
    { id: "qr", label: "QR kodlar" },
    { id: "olay", label: "Olaylar" },
    { id: "rapor", label: "Rapor" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      {/* ÜST BAR */}
      <header style={{ background: T.surface, borderBottom: `1px solid ${T.line}`, padding: "0 20px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 18, height: 62 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: T.green, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 13 }}>31</div>
            <div>
              <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ink, lineHeight: 1.15 }}>COP31 Atık Yönetimi</div>
              <div style={{ fontSize: 11, color: T.faint }}>Antalya · Kasım 2026</div>
            </div>
          </div>
          <nav style={{ display: "flex", gap: 2, overflowX: "auto", marginLeft: "auto" }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setTab(n.id)} style={{
                ...S.btn, padding: "9px 14px", fontSize: 13.5, whiteSpace: "nowrap",
                background: tab === n.id ? T.greenSoft : "transparent",
                color: tab === n.id ? T.green : T.sub,
                fontWeight: tab === n.id ? 700 : 500,
              }}>{n.label}</button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 20px 60px" }}>
        {tab === "dashboard" && <Dashboard {...{ zones, staff, cleanLogs, wasteLogs, incidents }} />}
        {tab === "saha" && <FieldEntry {...{ zones, staff, cleanLogs, setCleanLogs, qrZone, setQrZone }} />}
        {tab === "atik" && <WasteEntry {...{ zones, wasteLogs, setWasteLogs }} />}
        {tab === "personel" && <Personnel {...{ staff, setStaff, cleanLogs }} />}
        {tab === "qr" && <QRManager zones={zones} />}
        {tab === "olay" && <Incidents {...{ zones, incidents, setIncidents }} />}
        {tab === "rapor" && <Report {...{ zones, staff, cleanLogs, wasteLogs, incidents }} />}
      </main>
    </div>
  );
}

/* ═══════════ GENEL DURUM ═══════════ */
function Dashboard({ zones, staff, cleanLogs, wasteLogs, incidents }) {
  const totalWaste = wasteLogs.reduce((s, w) => s + w.amount, 0);
  const recycled = wasteLogs.filter(w => w.destination === "Geri Dönüşüm Tesisi").reduce((s, w) => s + w.amount, 0);
  const rate = totalWaste > 0 ? Math.round((recycled / totalWaste) * 100) : 0;
  const openIncidents = incidents.filter(i => i.status === "Açık").length;

  const byType = WASTE_TYPES.map(t => ({
    name: t.name, value: wasteLogs.filter(w => w.type === t.id).reduce((s, w) => s + w.amount, 0), color: t.color,
  })).filter(d => d.value > 0);

  const byZone = zones.map(z => ({
    name: z.id,
    temizlik: cleanLogs.filter(c => c.zone === z.id).length,
    atik: wasteLogs.filter(w => w.zone === z.id).reduce((s, w) => s + w.amount, 0),
  })).filter(d => d.temizlik > 0 || d.atik > 0);

  const kpis = [
    { label: "Bugünkü temizlik kaydı", value: cleanLogs.filter(c => c.date === today()).length, unit: "kayıt", accent: T.green },
    { label: "Toplam atık", value: totalWaste.toLocaleString("tr-TR"), unit: "kg", accent: T.amber },
    { label: "Geri dönüşüm oranı", value: rate, unit: "%", accent: T.blue },
    { label: "Açık olay", value: openIncidents, unit: "bildirim", accent: openIncidents > 0 ? T.red : T.faint },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 18 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...S.card, marginBottom: 0, padding: 18, borderTop: `3px solid ${k.accent}` }}>
            <div style={{ fontSize: 12, color: T.sub, fontWeight: 600, marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 30, fontWeight: 800, color: T.ink, lineHeight: 1 }}>
              {k.value}<span style={{ fontSize: 13, fontWeight: 500, color: T.faint, marginLeft: 6 }}>{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {(cleanLogs.length === 0 && wasteLogs.length === 0) ? (
        <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 17, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Sisteme hoş geldiniz</div>
          <div style={{ fontSize: 13.5, color: T.sub, maxWidth: 420, margin: "0 auto", lineHeight: 1.65 }}>
            Başlamak için önce <b>Personel</b> sekmesinden ekibinizi ekleyin, ardından <b>QR kodlar</b> sekmesinden bölge kodlarını yazdırıp alanlara asın.
            Personel QR okuttuğunda kayıtlar burada görünecek.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
          {byType.length > 0 && (
            <div style={S.card}>
              <div style={S.h2}>Atık türü dağılımı</div>
              <div style={S.sub}>Toplam {totalWaste.toLocaleString("tr-TR")} kg</div>
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
          )}
          {byZone.length > 0 && (
            <div style={S.card}>
              <div style={S.h2}>Bölge aktivitesi</div>
              <div style={S.sub}>Temizlik sayısı ve atık miktarı</div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={byZone}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.sub }} />
                  <YAxis tick={{ fontSize: 11, fill: T.sub }} />
                  <Tooltip contentStyle={S.tooltip} />
                  <Bar dataKey="temizlik" fill={T.green} name="Temizlik" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="atik" fill={T.amber} name="Atık (kg)" radius={[5, 5, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════ SAHA KAYDI (QR sonrası ekran) ═══════════ */
function FieldEntry({ zones, staff, cleanLogs, setCleanLogs, qrZone, setQrZone }) {
  const [zone, setZone] = useState(qrZone || "");
  const [person, setPerson] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => { if (qrZone) setZone(qrZone); }, [qrZone]);

  const zoneObj = zones.find(z => z.id === zone);
  const cleaners = staff.filter(s => s.role === "Temizlik" || s.role === "Saha Sorumlusu");

  const log = (action) => {
    if (!zone || !person) return;
    const p = staff.find(s => s.id === person);
    setCleanLogs(prev => [...prev, { id: genId(), zone, staff: p?.name || person, staffId: person, action, notes, time: now(), date: today() }]);
    setDone(action);
    setNotes("");
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
        <div style={S.sub}>Alanı temizlemeye başlarken "Giriş", bitirince "Çıkış" kaydı oluşturun.</div>

        {!qrZone && (
          <>
            <label style={S.label}>Bölge</label>
            <select style={S.input} value={zone} onChange={e => setZone(e.target.value)}>
              <option value="">Seçin</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
            </select>
          </>
        )}

        <label style={S.label}>Personel</label>
        {cleaners.length === 0 ? (
          <div style={{ ...S.card, background: T.amberSoft, borderColor: "#e5d5ab", padding: 14, fontSize: 13, color: "#7a5c17" }}>
            Henüz personel eklenmemiş. Önce <b>Personel</b> sekmesinden ekip üyelerini ekleyin.
          </div>
        ) : (
          <select style={S.input} value={person} onChange={e => setPerson(e.target.value)}>
            <option value="">Seçin</option>
            {cleaners.map(s => <option key={s.id} value={s.id}>{s.name} — {s.shift}</option>)}
          </select>
        )}

        <label style={S.label}>Not (isteğe bağlı)</label>
        <input style={S.input} placeholder="Örn: Konteyner %80 dolu" value={notes} onChange={e => setNotes(e.target.value)} />

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => log("Giriş")} disabled={!zone || !person}
            style={{ ...S.btn, ...S.btnGreen, flex: 1, opacity: (!zone || !person) ? 0.4 : 1 }}>
            Giriş kaydı
          </button>
          <button onClick={() => log("Çıkış")} disabled={!zone || !person}
            style={{ ...S.btn, flex: 1, background: T.ink, color: "#fff", opacity: (!zone || !person) ? 0.4 : 1 }}>
            Çıkış kaydı
          </button>
        </div>

        {done && (
          <div style={{ marginTop: 14, padding: 13, borderRadius: 10, background: T.greenSoft, color: T.green, fontWeight: 600, fontSize: 14, textAlign: "center" }}>
            ✓ {done} kaydı oluşturuldu — {now()}
          </div>
        )}
      </div>

      {cleanLogs.length > 0 && (
        <div style={S.card}>
          <div style={S.h2}>Son kayıtlar</div>
          <div style={{ marginTop: 10 }}>
            {cleanLogs.slice(-10).reverse().map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
                <span style={S.tag(l.action === "Giriş" ? T.blueSoft : T.greenSoft, l.action === "Giriş" ? T.blue : T.green)}>{l.action}</span>
                <span style={{ fontWeight: 600, color: T.ink }}>{l.staff}</span>
                <span style={{ color: T.sub }}>{l.zone}</span>
                <span style={{ marginLeft: "auto", color: T.faint, fontSize: 12.5 }}>{l.date} {l.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ ATIK GİRİŞİ ═══════════ */
function WasteEntry({ zones, wasteLogs, setWasteLogs }) {
  const [zone, setZone] = useState("");
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const [dest, setDest] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [done, setDone] = useState(false);

  const submit = () => {
    if (!zone || !type || !amount || !dest) return;
    setWasteLogs(prev => [...prev, { id: genId(), zone, type, amount: parseFloat(amount), destination: dest, vehicle, time: now(), date: today() }]);
    setAmount(""); setType(""); setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={S.card}>
        <div style={S.h2}>Atık girişi</div>
        <div style={S.sub}>Toplanan atığın türünü, miktarını ve gönderildiği yeri kaydedin.</div>

        <label style={S.label}>Kaynak bölge</label>
        <select style={S.input} value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">Seçin</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
        </select>

        <label style={S.label}>Atık türü</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 14 }}>
          {WASTE_TYPES.map(t => (
            <button key={t.id} onClick={() => setType(t.id)} style={{
              ...S.btn, padding: "10px 8px", fontSize: 12.5,
              background: type === t.id ? t.color : "#fbfcfb",
              color: type === t.id ? "#fff" : T.sub,
              border: `1.5px solid ${type === t.id ? t.color : T.line}`,
            }}>{t.name}</button>
          ))}
        </div>

        <label style={S.label}>Miktar (kg)</label>
        <input style={S.input} type="number" min="0" placeholder="Örn: 45" value={amount} onChange={e => setAmount(e.target.value)} />

        <label style={S.label}>Gönderim yeri</label>
        <select style={S.input} value={dest} onChange={e => setDest(e.target.value)}>
          <option value="">Seçin</option>
          {DESTINATIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <label style={S.label}>Araç plakası (isteğe bağlı)</label>
        <input style={S.input} placeholder="07 ABC 123" value={vehicle} onChange={e => setVehicle(e.target.value)} />

        <button onClick={submit} disabled={!zone || !type || !amount || !dest}
          style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: (!zone || !type || !amount || !dest) ? 0.4 : 1 }}>
          Kaydet
        </button>

        {done && (
          <div style={{ marginTop: 14, padding: 13, borderRadius: 10, background: T.greenSoft, color: T.green, fontWeight: 600, fontSize: 14, textAlign: "center" }}>
            ✓ Atık kaydı oluşturuldu
          </div>
        )}
      </div>

      {wasteLogs.length > 0 && (
        <div style={S.card}>
          <div style={S.h2}>Son atık kayıtları</div>
          <div style={{ marginTop: 10 }}>
            {wasteLogs.slice(-10).reverse().map(l => {
              const wt = WASTE_TYPES.find(t => t.id === l.type);
              return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13.5, flexWrap: "wrap" }}>
                  <span style={S.tag(wt.color + "1a", wt.color)}>{wt.name}</span>
                  <span style={{ fontWeight: 700, color: T.ink }}>{l.amount} kg</span>
                  <span style={{ color: T.sub }}>{l.zone} → {l.destination}</span>
                  <span style={{ marginLeft: "auto", color: T.faint, fontSize: 12.5 }}>{l.date} {l.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ PERSONEL YÖNETİMİ ═══════════ */
function Personnel({ staff, setStaff, cleanLogs }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [shift, setShift] = useState(SHIFTS[0]);
  const [phone, setPhone] = useState("");

  const add = () => {
    if (!name.trim()) return;
    setStaff(prev => [...prev, { id: genId(), name: name.trim(), role, shift, phone, added: today() }]);
    setName(""); setPhone("");
  };

  const remove = (id) => setStaff(prev => prev.filter(s => s.id !== id));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.h2}>Yeni personel ekle</div>
        <div style={S.sub}>Ekip üyelerini buradan sisteme kaydedin.</div>

        <label style={S.label}>Ad Soyad</label>
        <input style={S.input} placeholder="Örn: Ayşe Yılmaz" value={name} onChange={e => setName(e.target.value)} />

        <label style={S.label}>Görev</label>
        <select style={S.input} value={role} onChange={e => setRole(e.target.value)}>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <label style={S.label}>Vardiya</label>
        <select style={S.input} value={shift} onChange={e => setShift(e.target.value)}>
          {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label style={S.label}>Telefon (isteğe bağlı)</label>
        <input style={S.input} placeholder="05xx xxx xx xx" value={phone} onChange={e => setPhone(e.target.value)} />

        <button onClick={add} disabled={!name.trim()} style={{ ...S.btn, ...S.btnGreen, width: "100%", opacity: !name.trim() ? 0.4 : 1 }}>
          Personeli ekle
        </button>
      </div>

      <div style={S.card}>
        <div style={S.h2}>Ekip ({staff.length})</div>
        {staff.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: T.faint, fontSize: 13.5 }}>
            Henüz personel eklenmedi. Soldaki formu kullanın.
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {staff.map(s => {
              const count = cleanLogs.filter(c => c.staffId === s.id).length;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: T.greenSoft, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sora', sans-serif", fontWeight: 700, color: T.green, flexShrink: 0 }}>
                    {s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5, color: T.ink }}>{s.name}</div>
                    <div style={{ fontSize: 12.5, color: T.sub }}>{s.role} · {s.shift}{s.phone ? ` · ${s.phone}` : ""}</div>
                  </div>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 17, color: T.green }}>{count}</div>
                    <div style={{ fontSize: 10.5, color: T.faint }}>kayıt</div>
                  </div>
                  <button onClick={() => remove(s.id)} title="Personeli sil"
                    style={{ ...S.btn, padding: "7px 12px", fontSize: 12, background: T.redSoft, color: T.red }}>
                    Sil
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════ QR KOD YÖNETİMİ ═══════════ */
function QRManager({ zones }) {
  const [printing, setPrinting] = useState(false);

  const doPrint = () => {
    setPrinting(true);
    setTimeout(() => { window.print(); setPrinting(false); }, 200);
  };

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={S.h2}>Bölge QR kodları</div>
            <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.65 }}>
              Her bölgenin kendi QR kodu vardır. Bu sayfayı yazdırıp kodları ilgili alanların girişine asın.
              Personel telefon kamerasıyla kodu okuttuğunda sistem otomatik olarak açılır ve <b>o bölge seçili gelir</b> —
              tek yapması gereken adını seçip "Giriş" düğmesine basmaktır.
            </div>
          </div>
          <button onClick={doPrint} style={{ ...S.btn, ...S.btnGreen, flexShrink: 0 }}>
            Tümünü yazdır
          </button>
        </div>
      </div>

      <div className="print-area" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {zones.map(z => (
          <div key={z.id} style={{ ...S.card, marginBottom: 0, textAlign: "center", pageBreakInside: "avoid" }}>
            <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 15, color: T.ink }}>{z.name}</div>
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 14 }}>{z.id} · {z.area}</div>
            <div style={{ background: "#fff", display: "inline-block", padding: 12, borderRadius: 12, border: `1px solid ${T.line}` }}>
              <QRCodeSVG value={`${APP_URL}/?zone=${z.id}`} size={150} level="M" fgColor={T.ink} />
            </div>
            <div style={{ fontSize: 11, color: T.faint, marginTop: 12, wordBreak: "break-all" }}>{APP_URL}/?zone={z.id}</div>
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: T.green }}>Temizlik kaydı için okutun</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════ OLAYLAR ═══════════ */
function Incidents({ zones, incidents, setIncidents }) {
  const [zone, setZone] = useState("");
  const [severity, setSeverity] = useState("low");
  const [desc, setDesc] = useState("");

  const SEV = {
    low: { label: "Düşük", color: T.blue, soft: T.blueSoft },
    medium: { label: "Orta", color: T.amber, soft: T.amberSoft },
    high: { label: "Yüksek", color: T.red, soft: T.redSoft },
  };

  const submit = () => {
    if (!zone || !desc.trim()) return;
    setIncidents(prev => [...prev, { id: genId(), zone, severity, description: desc.trim(), time: now(), date: today(), status: "Açık" }]);
    setDesc("");
  };

  const close = (id) => setIncidents(prev => prev.map(i => i.id === id ? { ...i, status: "Kapatıldı" } : i));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.h2}>Olay bildir</div>
        <div style={S.sub}>Dökülme, arıza, taşma veya güvenlik sorunlarını kaydedin.</div>

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

        <button onClick={submit} disabled={!zone || !desc.trim()}
          style={{ ...S.btn, ...S.btnRed, width: "100%", opacity: (!zone || !desc.trim()) ? 0.4 : 1 }}>
          Bildir
        </button>
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
                  <span style={{ fontSize: 13, color: T.sub }}>{i.zone}</span>
                  <span style={{ marginLeft: "auto" }}>
                    {i.status === "Açık" ? (
                      <button onClick={() => close(i.id)} style={{ ...S.btn, padding: "5px 12px", fontSize: 12, background: T.greenSoft, color: T.green }}>
                        Kapat
                      </button>
                    ) : (
                      <span style={S.tag("#eef0ef", T.faint)}>Kapatıldı</span>
                    )}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: T.ink, marginTop: 6 }}>{i.description}</div>
                <div style={{ fontSize: 12, color: T.faint, marginTop: 3 }}>{i.date} {i.time}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════ RAPOR ═══════════ */
function Report({ zones, staff, cleanLogs, wasteLogs, incidents }) {
  const totalWaste = wasteLogs.reduce((s, w) => s + w.amount, 0);
  const byDest = DESTINATIONS.map(d => ({
    name: d, value: wasteLogs.filter(w => w.destination === d).reduce((s, w) => s + w.amount, 0),
  })).filter(x => x.value > 0);
  const recycled = byDest.find(d => d.name === "Geri Dönüşüm Tesisi")?.value || 0;

  const rows = [
    ["Rapor tarihi", today()],
    ["Toplam temizlik kaydı", cleanLogs.length],
    ["Kayıtlı personel", staff.length],
    ["Toplam atık", `${totalWaste.toLocaleString("tr-TR")} kg`],
    ["Geri dönüşüme gönderilen", `${recycled.toLocaleString("tr-TR")} kg`],
    ["Geri dönüşüm oranı", totalWaste > 0 ? `%${Math.round((recycled / totalWaste) * 100)}` : "—"],
    ["Toplam olay bildirimi", incidents.length],
    ["Açık olay", incidents.filter(i => i.status === "Açık").length],
    ["Aktif bölge sayısı", new Set([...cleanLogs.map(c => c.zone), ...wasteLogs.map(w => w.zone)]).size],
  ];

  const exportCSV = () => {
    let csv = "\uFEFFTip;Tarih;Saat;Bölge;Detay;Miktar/İşlem\n";
    cleanLogs.forEach(c => { csv += `Temizlik;${c.date};${c.time};${c.zone};${c.staff};${c.action}\n`; });
    wasteLogs.forEach(w => { csv += `Atık;${w.date};${w.time};${w.zone};${WASTE_TYPES.find(t => t.id === w.type)?.name} → ${w.destination};${w.amount} kg\n`; });
    incidents.forEach(i => { csv += `Olay;${i.date};${i.time};${i.zone};${i.description};${i.status}\n`; });
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
            <div style={{ fontSize: 13, color: T.sub }}>UNFCCC sürdürülebilirlik raporlama formatına uygun özet.</div>
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

      {byDest.length > 0 && (
        <div style={S.card}>
          <div style={S.h2}>Hedefe göre atık dağılımı</div>
          <ResponsiveContainer width="100%" height={Math.max(140, byDest.length * 52)}>
            <BarChart data={byDest} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
              <XAxis type="number" tick={{ fontSize: 11, fill: T.sub }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11.5, fill: T.ink }} width={140} />
              <Tooltip contentStyle={S.tooltip} formatter={v => [`${v} kg`]} />
              <Bar dataKey="value" fill={T.green} radius={[0, 6, 6, 0]} barSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

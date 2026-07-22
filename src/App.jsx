import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";

const ZONES = [
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
  { id: "plastic", name: "Plastik", color: "#e74c3c", icon: "♻" },
  { id: "paper", name: "Kağıt/Karton", color: "#3498db", icon: "📄" },
  { id: "organic", name: "Organik", color: "#27ae60", icon: "🍂" },
  { id: "glass", name: "Cam", color: "#9b59b6", icon: "🫙" },
  { id: "metal", name: "Metal", color: "#f39c12", icon: "🔩" },
  { id: "electronic", name: "Elektronik", color: "#1abc9c", icon: "🔌" },
  { id: "hazardous", name: "Tehlikeli", color: "#c0392b", icon: "⚠" },
  { id: "mixed", name: "Karışık", color: "#7f8c8d", icon: "🗑" },
];

const DESTINATIONS = ["Geri Dönüşüm Tesisi", "Kompost Alanı", "Düzenli Depolama", "Tehlikeli Atık Deposu", "Geçici Depo"];

const STAFF = [
  { id: "P001", name: "Ahmet Yılmaz", role: "Temizlik", shift: "Sabah" },
  { id: "P002", name: "Fatma Demir", role: "Temizlik", shift: "Sabah" },
  { id: "P003", name: "Mehmet Kaya", role: "Atık Toplama", shift: "Sabah" },
  { id: "P004", name: "Ayşe Çelik", role: "Temizlik", shift: "Öğle" },
  { id: "P005", name: "Ali Şahin", role: "Atık Toplama", shift: "Öğle" },
  { id: "P006", name: "Zeynep Arslan", role: "Denetim", shift: "Tam gün" },
  { id: "P007", name: "Hasan Öztürk", role: "Araç Sürücü", shift: "Sabah" },
  { id: "P008", name: "Elif Aydın", role: "Temizlik", shift: "Akşam" },
];

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function now() { return new Date().toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function today() { return new Date().toLocaleDateString("tr-TR"); }

const S = {
  page: { fontFamily: "'Inter', system-ui, sans-serif", background: "#0c1220", color: "#e2e8f0", minHeight: "100vh", padding: "12px" },
  card: { background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 12, border: "1px solid #334155" },
  label: { fontSize: 11, color: "#64748b", marginBottom: 4, display: "block" },
  select: { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, marginBottom: 10, outline: "none" },
  input: { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, marginBottom: 10, outline: "none", boxSizing: "border-box" },
  btn: { padding: "10px 20px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.2s" },
  btnP: { background: "#0ea5e9", color: "#fff" },
  btnS: { background: "#334155", color: "#94a3b8" },
  btnD: { background: "#dc2626", color: "#fff" },
  tag: { display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  stat: { flex: 1, minWidth: 100, textAlign: "center", background: "#0f172a", borderRadius: 10, padding: 12 },
};

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [cleanLogs, setCleanLogs] = useState([]);
  const [wasteLogs, setWasteLogs] = useState([]);
  const [incidents, setIncidents] = useState([]);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "qr", label: "QR Temizlik", icon: "📱" },
    { id: "waste", label: "Atık Kaydı", icon: "🗑" },
    { id: "incident", label: "Olay Bildir", icon: "⚠" },
    { id: "staff", label: "Personel", icon: "👷" },
    { id: "reports", label: "Raporlar", icon: "📋" },
  ];

  return (
    <div style={S.page}>
      <header style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#0ea5e9", textTransform: "uppercase" }}>COP31 Antalya 2026</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "4px 0", background: "linear-gradient(135deg, #0ea5e9, #10b981)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Atık yönetim sistemi
        </h1>
      </header>

      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            ...S.btn, padding: "8px 12px", fontSize: 12, flexShrink: 0,
            background: tab === t.id ? "#0ea5e9" : "#1e293b",
            color: tab === t.id ? "#fff" : "#94a3b8",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard cleanLogs={cleanLogs} wasteLogs={wasteLogs} incidents={incidents} />}
      {tab === "qr" && <QRClean logs={cleanLogs} setLogs={setCleanLogs} />}
      {tab === "waste" && <WasteEntry logs={wasteLogs} setLogs={setWasteLogs} />}
      {tab === "incident" && <IncidentReport incidents={incidents} setIncidents={setIncidents} />}
      {tab === "staff" && <StaffPanel cleanLogs={cleanLogs} />}
      {tab === "reports" && <Reports cleanLogs={cleanLogs} wasteLogs={wasteLogs} incidents={incidents} />}
    </div>
  );
}

/* ─── DASHBOARD ─── */
function Dashboard({ cleanLogs, wasteLogs, incidents }) {
  const totalWaste = wasteLogs.reduce((s, w) => s + w.amount, 0);
  const recycled = wasteLogs.filter(w => w.destination === "Geri Dönüşüm Tesisi").reduce((s, w) => s + w.amount, 0);
  const rate = totalWaste > 0 ? Math.round((recycled / totalWaste) * 100) : 0;

  const byType = WASTE_TYPES.map(t => ({
    name: t.name, value: wasteLogs.filter(w => w.type === t.id).reduce((s, w) => s + w.amount, 0), color: t.color
  })).filter(d => d.value > 0);

  const byZone = ZONES.map(z => ({
    name: z.id, cleanCount: cleanLogs.filter(c => c.zone === z.id).length, waste: wasteLogs.filter(w => w.zone === z.id).reduce((s, w) => s + w.amount, 0)
  })).filter(d => d.cleanCount > 0 || d.waste > 0);

  return (
    <div>
      <div style={S.row}>
        <div style={S.stat}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0ea5e9" }}>{cleanLogs.length}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>Temizlik kaydı</div>
        </div>
        <div style={S.stat}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>{totalWaste} kg</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>Toplam atık</div>
        </div>
        <div style={S.stat}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#10b981" }}>{rate}%</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>Geri dönüşüm</div>
        </div>
        <div style={S.stat}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#ef4444" }}>{incidents.length}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>Olay bildirimi</div>
        </div>
      </div>

      {byType.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Atık türü dağılımı</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} label={({ name, value }) => `${name}: ${value}kg`} style={{ fontSize: 10 }}>
                {byType.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {byZone.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Bölge bazlı aktivite</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byZone}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="cleanCount" fill="#0ea5e9" name="Temizlik" radius={[4, 4, 0, 0]} />
              <Bar dataKey="waste" fill="#f59e0b" name="Atık (kg)" radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {cleanLogs.length === 0 && wasteLogs.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#475569" }}>
          Henüz veri girilmedi. "QR Temizlik" veya "Atık Kaydı" sekmelerinden veri girişi yapın.
        </div>
      )}

      {/* Son aktiviteler */}
      {(cleanLogs.length > 0 || wasteLogs.length > 0) && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Son aktiviteler</div>
          {[...cleanLogs.map(c => ({ ...c, _type: "clean" })), ...wasteLogs.map(w => ({ ...w, _type: "waste" }))].slice(-8).reverse().map(item => (
            <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1a2332", fontSize: 12 }}>
              <span style={{ ...S.tag, background: item._type === "clean" ? "#0ea5e920" : "#f59e0b20", color: item._type === "clean" ? "#0ea5e9" : "#f59e0b" }}>
                {item._type === "clean" ? "Temizlik" : "Atık"}
              </span>
              <span style={{ color: "#94a3b8" }}>{item.zone}</span>
              <span style={{ flex: 1, color: "#cbd5e1" }}>
                {item._type === "clean" ? `${item.staff} — ${item.action}` : `${item.amount}kg ${WASTE_TYPES.find(t => t.id === item.type)?.name}`}
              </span>
              <span style={{ color: "#475569" }}>{item.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── QR CLEAN ─── */
function QRClean({ logs, setLogs }) {
  const [zone, setZone] = useState("");
  const [staff, setStaff] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(null);
  const [notes, setNotes] = useState("");

  const simulateScan = () => {
    setScanning(true);
    setTimeout(() => {
      const z = ZONES[Math.floor(Math.random() * ZONES.length)];
      setScanned(z);
      setZone(z.id);
      setScanning(false);
    }, 1200);
  };

  const logEntry = (action) => {
    if (!zone || !staff) return;
    setLogs(prev => [...prev, { id: genId(), zone, staff: STAFF.find(s => s.id === staff)?.name || staff, action, notes, time: now(), date: today() }]);
    setNotes("");
    setScanned(null);
    setZone("");
  };

  return (
    <div>
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>QR kod ile alan kaydı</div>

        <label style={S.label}>Personel</label>
        <select style={S.select} value={staff} onChange={e => setStaff(e.target.value)}>
          <option value="">Personel seçin</option>
          {STAFF.filter(s => s.role === "Temizlik").map(s => <option key={s.id} value={s.id}>{s.name} ({s.shift})</option>)}
        </select>

        <button onClick={simulateScan} disabled={scanning} style={{ ...S.btn, ...S.btnP, width: "100%", marginBottom: 12, padding: 16, fontSize: 16 }}>
          {scanning ? "⏳ QR okunuyor..." : "📷 QR kod tara"}
        </button>

        {scanned && (
          <div style={{ background: "#10b98115", border: "1px solid #10b98140", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>QR okundu</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", margin: "4px 0" }}>{scanned.name}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Bölge: {scanned.id} · Alan: {scanned.area}</div>
          </div>
        )}

        {!scanned && (
          <>
            <label style={S.label}>veya manuel bölge seçin</label>
            <select style={S.select} value={zone} onChange={e => setZone(e.target.value)}>
              <option value="">Bölge seçin</option>
              {ZONES.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
            </select>
          </>
        )}

        <label style={S.label}>Not (opsiyonel)</label>
        <input style={S.input} placeholder="Ek bilgi..." value={notes} onChange={e => setNotes(e.target.value)} />

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => logEntry("Giriş — temizlik başladı")} disabled={!zone || !staff} style={{ ...S.btn, ...S.btnP, flex: 1, opacity: (!zone || !staff) ? 0.4 : 1 }}>
            ✅ Giriş yap
          </button>
          <button onClick={() => logEntry("Çıkış — temizlik tamamlandı")} disabled={!zone || !staff} style={{ ...S.btn, background: "#10b981", color: "#fff", flex: 1, opacity: (!zone || !staff) ? 0.4 : 1 }}>
            🏁 Çıkış yap
          </button>
        </div>
      </div>

      {logs.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Temizlik kayıtları ({logs.length})</div>
          {logs.slice().reverse().map(l => (
            <div key={l.id} style={{ padding: "8px 0", borderBottom: "1px solid #1a2332", fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{l.staff}</span>
                <span style={{ color: "#475569" }}>{l.time}</span>
              </div>
              <div style={{ color: "#94a3b8", marginTop: 2 }}>
                {ZONES.find(z => z.id === l.zone)?.name || l.zone} · {l.action}
              </div>
              {l.notes && <div style={{ color: "#64748b", fontStyle: "italic", marginTop: 2 }}>{l.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── WASTE ENTRY ─── */
function WasteEntry({ logs, setLogs }) {
  const [zone, setZone] = useState("");
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const [dest, setDest] = useState("");
  const [vehicle, setVehicle] = useState("");

  const submit = () => {
    if (!zone || !type || !amount || !dest) return;
    setLogs(prev => [...prev, { id: genId(), zone, type, amount: parseFloat(amount), destination: dest, vehicle, time: now(), date: today() }]);
    setAmount("");
    setType("");
  };

  return (
    <div>
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Atık kaydı oluştur</div>

        <label style={S.label}>Bölge</label>
        <select style={S.select} value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">Bölge seçin</option>
          {ZONES.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
        </select>

        <label style={S.label}>Atık türü</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {WASTE_TYPES.map(t => (
            <button key={t.id} onClick={() => setType(t.id)} style={{
              ...S.btn, padding: "6px 12px", fontSize: 12,
              background: type === t.id ? t.color + "30" : "#0f172a",
              color: type === t.id ? t.color : "#94a3b8",
              border: `1px solid ${type === t.id ? t.color : "#334155"}`,
            }}>{t.icon} {t.name}</button>
          ))}
        </div>

        <label style={S.label}>Miktar (kg)</label>
        <input style={S.input} type="number" placeholder="Örn: 45" value={amount} onChange={e => setAmount(e.target.value)} />

        <label style={S.label}>Gönderim yeri</label>
        <select style={S.select} value={dest} onChange={e => setDest(e.target.value)}>
          <option value="">Hedef seçin</option>
          {DESTINATIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <label style={S.label}>Araç plakası (opsiyonel)</label>
        <input style={S.input} placeholder="Örn: 07 ABC 123" value={vehicle} onChange={e => setVehicle(e.target.value)} />

        <button onClick={submit} disabled={!zone || !type || !amount || !dest} style={{ ...S.btn, ...S.btnP, width: "100%", opacity: (!zone || !type || !amount || !dest) ? 0.4 : 1 }}>
          Atık kaydını kaydet
        </button>
      </div>

      {logs.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Atık kayıtları ({logs.length})</div>
          {logs.slice().reverse().map(l => {
            const wt = WASTE_TYPES.find(t => t.id === l.type);
            return (
              <div key={l.id} style={{ padding: "8px 0", borderBottom: "1px solid #1a2332", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ ...S.tag, background: wt.color + "20", color: wt.color }}>{wt.icon} {wt.name}</span>
                  <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{l.amount} kg</span>
                </div>
                <div style={{ color: "#94a3b8", marginTop: 4 }}>
                  {ZONES.find(z => z.id === l.zone)?.name} → {l.destination}
                </div>
                <div style={{ color: "#475569", marginTop: 2 }}>{l.time} {l.vehicle && `· Araç: ${l.vehicle}`}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── INCIDENT ─── */
function IncidentReport({ incidents, setIncidents }) {
  const [zone, setZone] = useState("");
  const [severity, setSeverity] = useState("low");
  const [desc, setDesc] = useState("");

  const submit = () => {
    if (!zone || !desc) return;
    setIncidents(prev => [...prev, { id: genId(), zone, severity, description: desc, time: now(), date: today(), status: "Açık" }]);
    setDesc("");
  };

  const sevColors = { low: "#3b82f6", medium: "#f59e0b", high: "#ef4444", critical: "#dc2626" };
  const sevLabels = { low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Kritik" };

  return (
    <div>
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Olay / sorun bildirimi</div>

        <label style={S.label}>Bölge</label>
        <select style={S.select} value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">Bölge seçin</option>
          {ZONES.map(z => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
        </select>

        <label style={S.label}>Önem derecesi</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {Object.entries(sevLabels).map(([k, v]) => (
            <button key={k} onClick={() => setSeverity(k)} style={{
              ...S.btn, flex: 1, padding: "8px 6px", fontSize: 12,
              background: severity === k ? sevColors[k] + "25" : "#0f172a",
              color: severity === k ? sevColors[k] : "#64748b",
              border: `1px solid ${severity === k ? sevColors[k] : "#334155"}`,
            }}>{v}</button>
          ))}
        </div>

        <label style={S.label}>Açıklama</label>
        <textarea style={{ ...S.input, height: 80, resize: "vertical" }} placeholder="Olayı açıklayın..." value={desc} onChange={e => setDesc(e.target.value)} />

        <button onClick={submit} disabled={!zone || !desc} style={{ ...S.btn, ...S.btnD, width: "100%", opacity: (!zone || !desc) ? 0.4 : 1 }}>
          Olay bildir
        </button>
      </div>

      {incidents.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Olay geçmişi</div>
          {incidents.slice().reverse().map(i => (
            <div key={i.id} style={{ padding: "8px 0", borderBottom: "1px solid #1a2332", fontSize: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ ...S.tag, background: sevColors[i.severity] + "20", color: sevColors[i.severity] }}>{sevLabels[i.severity]}</span>
                <span style={{ color: "#94a3b8" }}>{ZONES.find(z => z.id === i.zone)?.name}</span>
                <span style={{ ...S.tag, background: "#0ea5e920", color: "#0ea5e9", marginLeft: "auto" }}>{i.status}</span>
              </div>
              <div style={{ color: "#e2e8f0", marginTop: 4 }}>{i.description}</div>
              <div style={{ color: "#475569", marginTop: 2 }}>{i.time}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── STAFF ─── */
function StaffPanel({ cleanLogs }) {
  return (
    <div>
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Personel listesi</div>
        {STAFF.map(s => {
          const logs = cleanLogs.filter(c => c.staff === s.name);
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1a2332" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0ea5e920", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#0ea5e9", fontWeight: 600, flexShrink: 0 }}>
                {s.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{s.role} · {s.shift} vardiyası</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0ea5e9" }}>{logs.length}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>kayıt</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── REPORTS ─── */
function Reports({ cleanLogs, wasteLogs, incidents }) {
  const totalWaste = wasteLogs.reduce((s, w) => s + w.amount, 0);
  const recycled = wasteLogs.filter(w => w.destination === "Geri Dönüşüm Tesisi").reduce((s, w) => s + w.amount, 0);
  const composted = wasteLogs.filter(w => w.destination === "Kompost Alanı").reduce((s, w) => s + w.amount, 0);
  const landfill = wasteLogs.filter(w => w.destination === "Düzenli Depolama").reduce((s, w) => s + w.amount, 0);

  const destData = DESTINATIONS.map(d => ({
    name: d.replace(" Tesisi", "").replace(" Alanı", "").replace(" Deposu", ""),
    value: wasteLogs.filter(w => w.destination === d).reduce((s, w) => s + w.amount, 0)
  })).filter(d => d.value > 0);

  return (
    <div>
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Özet rapor — {today()}</div>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <tbody>
            {[
              ["Toplam temizlik kaydı", cleanLogs.length],
              ["Toplam atık miktarı", `${totalWaste} kg`],
              ["Geri dönüşüme gönderilen", `${recycled} kg`],
              ["Kompostlanan", `${composted} kg`],
              ["Düzenli depolamaya giden", `${landfill} kg`],
              ["Geri dönüşüm oranı", totalWaste > 0 ? `${Math.round((recycled / totalWaste) * 100)}%` : "—"],
              ["Olay bildirimi sayısı", incidents.length],
              ["Aktif personel", new Set(cleanLogs.map(c => c.staff)).size],
              ["Kapsanan bölge sayısı", new Set([...cleanLogs.map(c => c.zone), ...wasteLogs.map(w => w.zone)]).size],
            ].map(([label, val], i) => (
              <tr key={i} style={{ borderBottom: "1px solid #1a2332" }}>
                <td style={{ padding: "6px 0", color: "#94a3b8" }}>{label}</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "#e2e8f0" }}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {destData.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>Hedefe göre atık dağılımı</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={destData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} width={80} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" fill="#0ea5e9" name="kg" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ ...S.card, textAlign: "center", color: "#475569", fontSize: 12 }}>
        Bu rapor UNFCCC sürdürülebilirlik rapor formatına uygun olarak oluşturulmuştur.
        Resmi rapor için tüm verilerin tamamlanması gerekmektedir.
      </div>
    </div>
  );
}

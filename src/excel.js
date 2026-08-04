/* ═══════════════════════════════════════════════════════
   ORTAK STİLLİ EXCEL AKTARIMI
   Renkli başlık, kenarlık, sayı/tarih formatı, otomatik sütun
   genişliği, dondurulmuş başlık satırı ve TOPLAM vurgusu içerir.
   Kütüphane (xlsx-js-style) CDN'den ilk kullanımda yüklenir.
   ═══════════════════════════════════════════════════════ */

const CDN = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
let _yukleniyor = null;

/* Kütüphaneyi bir kez yükler */
function kutuphaneYukle() {
  if (typeof window !== "undefined" && window.XLSX) return Promise.resolve(window.XLSX);
  if (_yukleniyor) return _yukleniyor;
  _yukleniyor = new Promise((coz, hata) => {
    const s = document.createElement("script");
    s.src = CDN;
    s.onload = () => window.XLSX ? coz(window.XLSX) : hata(new Error("Kütüphane yüklendi ama bulunamadı"));
    s.onerror = () => hata(new Error("Excel kütüphanesi indirilemedi (internet bağlantısını kontrol edin)"));
    document.head.appendChild(s);
  });
  return _yukleniyor;
}

/* ── Renk paleti (uygulamayla uyumlu) ── */
const RENK = {
  baslik:    "1E6B45",  // koyu yeşil
  baslikYazi:"FFFFFF",
  altBaslik: "E6F2EC",
  toplam:    "DCFCE7",
  cizgi:     "D9E2DD",
  uyari:     "FBEAEA",
  uyariYazi: "B03030",
  soluk:     "F7F9F8",
};

const kenar = {
  top:    { style: "thin", color: { rgb: RENK.cizgi } },
  bottom: { style: "thin", color: { rgb: RENK.cizgi } },
  left:   { style: "thin", color: { rgb: RENK.cizgi } },
  right:  { style: "thin", color: { rgb: RENK.cizgi } },
};

/* Sütun genişliğini içeriğe göre hesaplar */
function sutunGenislikleri(satirlar, enAz = 10, enCok = 55) {
  const gen = [];
  satirlar.forEach(satir => {
    (satir || []).forEach((h, i) => {
      const metin = h === null || h === undefined ? "" : String(h);
      const uzunluk = Math.max(...metin.split("\n").map(p => p.length));
      gen[i] = Math.max(gen[i] || enAz, Math.min(uzunluk + 3, enCok));
    });
  });
  return gen.map(w => ({ wch: w }));
}

/**
 * Biçimli Excel dosyası indirir.
 *
 * @param {Array} sekmeler  [{ ad, basliklar:[], satirlar:[[]], sayiSutunlari:[], tarihSutunlari:[], vurguSatir:(satir)=>bool, baslik }]
 * @param {string} dosyaAdi  uzantısız
 */
export async function stilliExcelIndir(sekmeler, dosyaAdi = "rapor") {
  let XLSX;
  try {
    XLSX = await kutuphaneYukle();
  } catch (e) {
    alert(e.message);
    return false;
  }

  const wb = XLSX.utils.book_new();

  sekmeler.forEach(sekme => {
    const { ad, basliklar = [], satirlar = [], sayiSutunlari = [], vurguSatir, baslik, altBilgi } = sekme;

    const veri = [];
    let ofset = 0;

    // Üst başlık (rapor adı + tarih)
    if (baslik) {
      veri.push([baslik]);
      veri.push([`Oluşturma: ${new Date().toLocaleString("tr-TR")}`]);
      veri.push([]);
      ofset = 3;
    }

    veri.push(basliklar);
    satirlar.forEach(r => veri.push(r));

    if (altBilgi) { veri.push([]); veri.push([altBilgi]); }

    const ws = XLSX.utils.aoa_to_sheet(veri);
    const basSatir = ofset;             // başlık satırının indeksi
    const sonSatir = ofset + satirlar.length;
    const sutunSayisi = basliklar.length;

    // ── Üst başlık stili ──
    if (baslik) {
      const a1 = XLSX.utils.encode_cell({ r: 0, c: 0 });
      if (ws[a1]) ws[a1].s = { font: { bold: true, sz: 14, color: { rgb: RENK.baslik } } };
      const a2 = XLSX.utils.encode_cell({ r: 1, c: 0 });
      if (ws[a2]) ws[a2].s = { font: { sz: 9, color: { rgb: "8B988F" } } };
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, sutunSayisi - 1) } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, sutunSayisi - 1) } },
      ];
    }

    // ── Başlık satırı ──
    for (let c = 0; c < sutunSayisi; c++) {
      const ref = XLSX.utils.encode_cell({ r: basSatir, c });
      if (!ws[ref]) continue;
      ws[ref].s = {
        font: { bold: true, sz: 11, color: { rgb: RENK.baslikYazi } },
        fill: { fgColor: { rgb: RENK.baslik } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: kenar,
      };
    }

    // ── Veri satırları ──
    for (let r = basSatir + 1; r <= sonSatir; r++) {
      const satirVerisi = satirlar[r - basSatir - 1] || [];
      const vurgu = typeof vurguSatir === "function" ? vurguSatir(satirVerisi) : false;
      const zebra = (r - basSatir) % 2 === 0;

      for (let c = 0; c < sutunSayisi; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!ws[ref]) { ws[ref] = { t: "s", v: "" }; }
        const sayisal = sayiSutunlari.includes(c);
        ws[ref].s = {
          font: { sz: 10.5, bold: !!vurgu, color: { rgb: vurgu ? RENK.uyariYazi : "16241D" } },
          fill: { fgColor: { rgb: vurgu ? RENK.uyari : (zebra ? RENK.soluk : "FFFFFF") } },
          alignment: { horizontal: sayisal ? "right" : "left", vertical: "center", wrapText: c === 1 },
          border: kenar,
          ...(sayisal ? { numFmt: "#,##0" } : {}),
        };
      }
    }

    // ── Sütun genişlikleri + dondurma ──
    ws["!cols"] = sutunGenislikleri([basliklar, ...satirlar]);
    ws["!freeze"] = { xSplit: 0, ySplit: basSatir + 1 };
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range(
        { r: basSatir, c: 0 },
        { r: Math.max(basSatir, sonSatir), c: Math.max(0, sutunSayisi - 1) }
      ),
    };
    ws["!rows"] = [];
    ws["!rows"][basSatir] = { hpt: 28 };

    XLSX.utils.book_append_sheet(wb, ws, (ad || "Sayfa").slice(0, 31));
  });

  const tarih = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${dosyaAdi}_${tarih}.xlsx`);
  return true;
}

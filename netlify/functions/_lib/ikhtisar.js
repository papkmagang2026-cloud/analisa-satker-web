// ============================================================
// PORT DARI DashboardIkhtisar.gs -- getDashboardIkhtisar(). Mencakup:
// peringkat rasio antar satker, akun perhatian khusus, strip ringkasan +
// sorotan. Modul Persediaan (stock opname) BELUM diport -- kartunya
// otomatis disembunyikan (sama seperti perilaku typeof-guard di Apps
// Script versi lama sebelum modul itu terpasang).
// ============================================================

const { getSheetValues } = require('./googleSheets');
const { normalizeKodeAkun_, readDatabaseDariSheet_, getDaftarTahunTersedia_ } = require('./database');
const { computeRasioComponents_, collectManualRasioGroups_, rasioMetaUntukIkhtisar_ } = require('./rasio');

const SHEET_PENGATURAN_AKUN_KHUSUS = 'Pengaturan_Akun_Khusus';

const AKUN_KHUSUS_LIST_DEFAULT = [
  { kode: '136111', label: 'Konstruksi Dalam Pengerjaan' },
  { kode: '138111', label: 'Aset Konsesi Jasa - Partisipasi Pemerintah' },
  { kode: '138121', label: 'Aset Konsesi Jasa - Partisipasi Mitra' },
  { kode: '138131', label: 'Aset Konsesi Jasa - Partisipasi Mitra Dalam Pengerjaan' },
  { kode: '138311', label: 'Properti Investasi' },
  { kode: '138313', label: 'Properti Investasi Dalam Pengerjaan' },
  { kode: '135111', label: 'Aset Tetap Renovasi' },
  { kode: '135220', label: 'Aset Tetap Renovasi - BLU' },
  { kode: '161111', label: 'Kemitraan dengan Pihak Ketiga' },
  { kode: '151211', label: 'Aset Konsesi Jasa' },
  { kode: '161221', label: 'Konstruksi Dalam Pengerjaan - Konsesi Jasa' },
  { kode: '117120', label: 'Persediaan Bahan untuk Dijual/Diserahkan kepada Masyarakat/Pemda' }
];

/** Setara getAkunKhususList_() -- baca sheet Pengaturan_Akun_Khusus, fallback ke daftar default kalau sheet belum ada. */
async function getAkunKhususList_() {
  let values;
  try {
    values = await getSheetValues(SHEET_PENGATURAN_AKUN_KHUSUS);
  } catch (e) {
    values = null;
  }
  if (!values || values.length < 2) {
    return AKUN_KHUSUS_LIST_DEFAULT.map((x) => ({ kode: normalizeKodeAkun_(x.kode), label: x.label }));
  }
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row) continue;
    const kodeRaw = String(row[0] || '').trim();
    if (!kodeRaw) continue;
    const label = String(row[1] || '').trim();
    out.push({ kode: normalizeKodeAkun_(kodeRaw), label: label || kodeRaw });
  }
  return out;
}

/** Setara getDashboardIkhtisar() di DashboardIkhtisar.gs (tanpa modul Persediaan & tanpa growth tahun sebelumnya untuk tahap ini). */
async function getDashboardIkhtisar(allRows, refMap) {
  const neracaAll = allRows.filter((row) => row.kodeTransaksi === '0.0' && row.tipe === 'AKRUAL');
  if (neracaAll.length === 0) return { isEmpty: true };

  const bySatker = {}, namaBySatker = {}, orderSatker = [];
  neracaAll.forEach((row) => {
    const kode = String(row.kodeSatker).trim();
    if (!kode) return;
    if (!bySatker[kode]) { bySatker[kode] = []; orderSatker.push(kode); namaBySatker[kode] = row.namaSatker; }
    bySatker[kode].push(row);
  });

  const manualGroups = collectManualRasioGroups_(refMap);
  const allRasioKeys = ['AsetTetap', 'PiutangJP', 'PiutangJPanjang', 'AsetTidakDigunakan', ...manualGroups];

  // ---- 1) PERINGKAT RASIO ANTAR SATKER ----
  const rasioPerSatker = {};
  orderSatker.forEach((kode) => { rasioPerSatker[kode] = computeRasioComponents_(bySatker[kode], refMap, manualGroups); });

  const rasioRanking = allRasioKeys.map((key) => {
    const meta = rasioMetaUntukIkhtisar_(key, refMap);
    const list = [];
    orderSatker.forEach((kode) => {
      const comp = rasioPerSatker[kode][key];
      if (!comp || comp.pokok <= 0) return;
      const persentase = (comp.kontra / comp.pokok) * 100;
      list.push({ kodeSatker: kode, namaSatker: namaBySatker[kode], pokok: comp.pokok, kontra: comp.kontra, persentase, growthPersentase: null });
    });
    list.sort((a, b) => b.persentase - a.persentase);
    return { key, label: meta.label, subLabel: meta.subLabel, labelPokok: meta.labelPokok, labelKontra: meta.labelKontra, jumlahSatkerAda: list.length, satkerList: list };
  });

  // ---- 2) AKUN PERHATIAN KHUSUS ----
  const akunKhususDaftar = await getAkunKhususList_();
  const akunKhususList = akunKhususDaftar.map((def) => {
    const list = [];
    orderSatker.forEach((kode) => {
      let total = 0;
      bySatker[kode].forEach((row) => { if (normalizeKodeAkun_(row.kodeAkun) === def.kode) total += Math.abs(row.nilaiAudited); });
      if (total !== 0) list.push({ kodeSatker: kode, namaSatker: namaBySatker[kode], nilai: total });
    });
    list.sort((a, b) => b.nilai - a.nilai);
    const totalSemua = list.reduce((s, x) => s + x.nilai, 0);
    const namaResmi = (refMap[def.kode] && refMap[def.kode].nama) ? refMap[def.kode].nama : def.label;
    return {
      kode: def.kode, label: def.label, namaResmi, totalSemuaSatker: totalSemua,
      jumlahSatkerAda: list.length, mode: list.length === 0 ? 'kosong' : (list.length === 1 ? 'single' : 'ranking'), satkerList: list
    };
  });

  // ---- 3) STRIP RINGKASAN + SOROTAN ----
  const aboveCount = {}, totalRasioCount = {}, sumExcess = {};
  orderSatker.forEach((kode) => { aboveCount[kode] = 0; totalRasioCount[kode] = 0; sumExcess[kode] = 0; });
  rasioRanking.forEach((r) => {
    if (!r.satkerList.length) return;
    const mean = r.satkerList.reduce((s, x) => s + x.persentase, 0) / r.satkerList.length;
    r.satkerList.forEach((x) => {
      totalRasioCount[x.kodeSatker]++;
      if (x.persentase > mean) { aboveCount[x.kodeSatker]++; sumExcess[x.kodeSatker] += (x.persentase - mean); }
    });
  });

  let perluPerhatian = 0, diBawahRataRata = 0, sorotan = null;
  orderSatker.forEach((kode) => {
    if (totalRasioCount[kode] === 0) return;
    if (aboveCount[kode] >= 2) perluPerhatian++;
    else if (aboveCount[kode] === 0) diBawahRataRata++;
    if (aboveCount[kode] >= 2 && (!sorotan || aboveCount[kode] > sorotan.aboveCount || (aboveCount[kode] === sorotan.aboveCount && sumExcess[kode] > sorotan.sumExcess))) {
      sorotan = { kodeSatker: kode, namaSatker: namaBySatker[kode], aboveCount: aboveCount[kode], totalRasioCount: totalRasioCount[kode], sumExcess: sumExcess[kode] };
    }
  });

  let totalAsetDiperiksa = 0;
  neracaAll.forEach((row) => {
    const kode6 = normalizeKodeAkun_(row.kodeAkun);
    if (kode6 && kode6.charAt(0) === '1') totalAsetDiperiksa += row.nilaiAudited;
  });

  const ringkasanStrip = { jumlahSatker: orderSatker.length, perluPerhatian, diBawahRataRata, totalAsetDiperiksa, sorotan };

  return {
    isEmpty: false,
    jumlahSatker: orderSatker.length,
    rasioRanking,
    akunKhususList,
    penyesuaianPersediaan: { isEmpty: true, label: '', subLabel: '', deskripsi: '', satkerList: [] },
    penyesuaianPersediaanPerKategori: [],
    ringkasanStrip
  };
}

module.exports = { getDashboardIkhtisar };

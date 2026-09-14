// ============================================================
// PORT DARI LaporanKeuangan.gs -- getLaporanOperasional, getLaporanRealisasiAnggaran,
// getNeraca. Logika pengelompokan & tanda +/- SAMA PERSIS dengan Apps
// Script. Tahap ini BELUM menyertakan kolom "Tahun Sebelumnya"/Growth
// (bisa ditambahkan di tahap berikutnya kalau perlu).
// ============================================================

const { normalizeKodeAkun_ } = require('./database');
const { neracaSignInfo_ } = require('./rasio');

const GROUP_DIGIT_LEVEL_KELOMPOK = 2;
const GROUP_DIGIT_LEVEL_SUB = 4;

function loSignInfo_(kodeAkun) {
  const d = String(kodeAkun).charAt(0);
  if (d === '4') return { sisi: 'PENDAPATAN', negate: true };
  if (d === '5') return { sisi: 'BEBAN', negate: false };
  return null;
}

function classifyByAutoDigit_(kodeAkun, refMap, digitLevel) {
  const kode6 = normalizeKodeAkun_(kodeAkun);
  const L = Math.max(1, Math.min(6, digitLevel));
  const candidate = kode6.substring(0, L) + '0'.repeat(6 - L);
  const info = refMap[candidate];
  if (info && info.nama) return { nama: info.nama, urutan: parseInt(candidate, 10) || 0 };
  const self = refMap[kode6];
  const namaSendiri = self && self.nama ? self.nama : String(kodeAkun);
  return { nama: namaSendiri, urutan: parseInt(kode6, 10) || 0 };
}

/** Setara classifyAccountGeneric_ (mode 'auto') -- ikuti tag manual dulu (kolom M-P), baru fallback ke auto-grouping. */
function classifyAccountGeneric_(kodeAkun, refMap) {
  const kode6 = normalizeKodeAkun_(kodeAkun);
  for (let k = 6; k >= 1; k--) {
    const candidate = kode6.substring(0, k) + '0'.repeat(6 - k);
    const info = refMap[candidate];
    if (info && info.isTagged) {
      return { kelompok: info.kelompok, subKelompok: info.subKelompokOverride || info.nama, urutanKelompok: info.urutanKelompok, urutanSub: info.urutanSub };
    }
  }
  const subAuto = classifyByAutoDigit_(kodeAkun, refMap, GROUP_DIGIT_LEVEL_SUB);
  const kelAuto = classifyByAutoDigit_(kodeAkun, refMap, GROUP_DIGIT_LEVEL_KELOMPOK);
  return { kelompok: kelAuto.nama, subKelompok: subAuto.nama, urutanKelompok: kelAuto.urutan, urutanSub: subAuto.urutan };
}

function buildAkunItems_(rows, refMap, negateFn) {
  const agg = {};
  rows.forEach((row) => {
    const cls = classifyAccountGeneric_(row.kodeAkun, refMap);
    if (!cls) return;
    const key = cls.kelompok + '|||' + cls.subKelompok + '|||' + row.kodeAkun;
    if (!agg[key]) {
      agg[key] = { kelompok: cls.kelompok, sub: cls.subKelompok, urutanKelompok: cls.urutanKelompok, urutanSub: cls.urutanSub, kodeAkun: row.kodeAkun, label: row.uraianAkun || row.kodeAkun, total: 0 };
    }
    agg[key].total += row.nilaiAudited;
  });
  Object.keys(agg).forEach((k) => { if (negateFn(agg[k])) agg[k].total = -agg[k].total; });
  const items = Object.keys(agg).map((k) => agg[k]).filter((it) => it.total !== 0);
  items.sort((a, b) => {
    if (a.urutanKelompok !== b.urutanKelompok) return a.urutanKelompok - b.urutanKelompok;
    if (a.urutanSub !== b.urutanSub) return a.urutanSub - b.urutanSub;
    return a.kodeAkun.localeCompare(b.kodeAkun);
  });
  return items;
}

function buildSubgroupsFor_(items, kelompokName) {
  const filtered = items.filter((it) => it.kelompok === kelompokName);
  const subMap = {}, order = [];
  filtered.forEach((it) => {
    if (!subMap[it.sub]) { subMap[it.sub] = { label: it.sub, accounts: [], subtotal: 0 }; order.push(it.sub); }
    subMap[it.sub].accounts.push({ label: it.label, value: it.total });
    subMap[it.sub].subtotal += it.total;
  });
  return order.map((s) => subMap[s]);
}
function sumSubgroups_(subgroups) { return subgroups.reduce((s, sg) => s + sg.subtotal, 0); }

function buildGroupsFromItems_(items, signFn) {
  const kelompokOrder = [], kelompokUrutan = {};
  items.forEach((it) => {
    if (kelompokUrutan[it.kelompok] === undefined) { kelompokUrutan[it.kelompok] = it.urutanKelompok; kelompokOrder.push(it.kelompok); }
  });
  kelompokOrder.sort((a, b) => kelompokUrutan[a] - kelompokUrutan[b]);
  return kelompokOrder.map((namaKelompok) => {
    const subgroups = buildSubgroupsFor_(items, namaKelompok);
    const subtotal = sumSubgroups_(subgroups);
    const g = { title: namaKelompok, subgroups, subtotalLabel: 'Jumlah ' + namaKelompok, subtotal };
    if (signFn) {
      const sampleItem = items.filter((it) => it.kelompok === namaKelompok)[0];
      const s = sampleItem ? signFn(sampleItem.kodeAkun) : null;
      g.sisi = s ? s.sisi : null;
    }
    return g;
  });
}

function headerInfoFrom_(rows, kodeSatker) {
  const headerInfo = { nama: '', klBa: '', kodeBaes1: '', kodeSatker };
  const found = rows[0];
  if (found) { headerInfo.nama = found.namaSatker; headerInfo.klBa = found.klBa; headerInfo.kodeBaes1 = found.kodeBaes1; headerInfo.kodeSatker = found.kodeSatker; }
  return headerInfo;
}

function getDiagnostikGeneric_(allRows) {
  const tipeSet = {}, ktSet = {};
  allRows.forEach((r) => { tipeSet[r.tipe] = (tipeSet[r.tipe] || 0) + 1; ktSet[r.kodeTransaksi] = (ktSet[r.kodeTransaksi] || 0) + 1; });
  return { totalBaris: allRows.length, nilaiTipeDitemukan: tipeSet, nilaiKodeTransaksiDitemukan: ktSet };
}

/** Setara getLaporanOperasional(kodeSatker) -- allRows dari sheet Database, refMap dari Referensi_Akun_Akrual. */
function getLaporanOperasional(kodeSatker, allRows, refMap) {
  kodeSatker = String(kodeSatker || '').trim();
  const loRows = allRows.filter((row) => row.kodeTransaksi === '3.0' && row.tipe === 'AKRUAL' && String(row.kodeSatker).trim() === kodeSatker);
  if (loRows.length === 0) return { isEmpty: true, diagnostik: getDiagnostikGeneric_(allRows) };

  const negateFn = (it) => { const s = loSignInfo_(it.kodeAkun); return s ? s.negate : false; };
  const items = buildAkunItems_(loRows, refMap, negateFn);
  const groups = buildGroupsFromItems_(items, loSignInfo_);

  let totalPendapatan = 0, totalBeban = 0;
  items.forEach((it) => {
    const s = loSignInfo_(it.kodeAkun);
    if (!s) return;
    if (s.sisi === 'PENDAPATAN') totalPendapatan += it.total; else totalBeban += it.total;
  });
  const surplusDefisitLO = totalPendapatan - totalBeban;

  return {
    isEmpty: false, headerInfo: headerInfoFrom_(loRows, kodeSatker), groups,
    adaTahunSebelumnya: false, labelTahunSebelumnya: null,
    totalPendapatan, totalBeban, surplusDefisitLO
  };
}

/** Setara getLaporanRealisasiAnggaran(kodeSatker) -- allRows dari sheet Database, refMap dari Referensi_Akun_Kas. */
function getLaporanRealisasiAnggaran(kodeSatker, allRows, refMapKas) {
  kodeSatker = String(kodeSatker || '').trim();
  const lraRows = allRows.filter((row) => row.kodeTransaksi === '3.0' && row.tipe === 'KAS' && String(row.kodeSatker).trim() === kodeSatker);
  if (lraRows.length === 0) return { isEmpty: true, diagnostik: getDiagnostikGeneric_(allRows) };

  const negateFn = (it) => { const s = loSignInfo_(it.kodeAkun); return s ? s.negate : false; };
  const items = buildAkunItems_(lraRows, refMapKas, negateFn);
  const groups = buildGroupsFromItems_(items, loSignInfo_);

  let totalPendapatan = 0, totalBelanja = 0;
  items.forEach((it) => {
    const s = loSignInfo_(it.kodeAkun);
    if (!s) return;
    if (s.sisi === 'PENDAPATAN') totalPendapatan += it.total; else totalBelanja += it.total;
  });
  const surplusDefisitLRA = totalPendapatan - totalBelanja;

  return {
    isEmpty: false, headerInfo: headerInfoFrom_(lraRows, kodeSatker), groups,
    adaTahunSebelumnya: false, labelTahunSebelumnya: null,
    totalPendapatan, totalBelanja, surplusDefisitLRA
  };
}

/** Setara getNeraca(kodeSatker) -- allRows dari sheet Database, refMap dari Referensi_Akun_Akrual. */
function getNeraca(kodeSatker, allRows, refMap) {
  kodeSatker = String(kodeSatker || '').trim();
  const neracaRows = allRows.filter((row) => row.kodeTransaksi === '0.0' && row.tipe === 'AKRUAL' && String(row.kodeSatker).trim() === kodeSatker);
  if (neracaRows.length === 0) return { isEmpty: true, diagnostik: getDiagnostikGeneric_(allRows) };

  const negateFn = (it) => { const s = neracaSignInfo_(it.kodeAkun); return s ? s.negate : false; };
  const items = buildAkunItems_(neracaRows, refMap, negateFn);
  const groups = buildGroupsFromItems_(items, neracaSignInfo_);
  groups.forEach((g) => { if (!g.sisi) g.sisi = 'ASET'; });

  let totalAset = 0, totalKewajibanDanEkuitas = 0;
  items.forEach((it) => {
    const s = neracaSignInfo_(it.kodeAkun);
    if (!s) return;
    if (s.sisi === 'ASET') totalAset += it.total; else totalKewajibanDanEkuitas += it.total;
  });

  const loResult = getLaporanOperasional(kodeSatker, allRows, refMap);
  const surplusDefisitLO = (loResult && !loResult.isEmpty) ? loResult.surplusDefisitLO : 0;

  if (surplusDefisitLO !== 0) {
    groups.push({
      title: 'Penyesuaian Ekuitas',
      subgroups: [{ label: 'Surplus/Defisit LO Tahun Berjalan', accounts: [{ label: 'Surplus/Defisit LO', value: surplusDefisitLO }], subtotal: surplusDefisitLO }],
      subtotalLabel: 'Jumlah Penyesuaian Ekuitas', subtotal: surplusDefisitLO, sisi: 'KEWAJIBAN_EKUITAS'
    });
    totalKewajibanDanEkuitas += surplusDefisitLO;
  }

  const selisih = totalAset - totalKewajibanDanEkuitas;

  return {
    isEmpty: false, headerInfo: headerInfoFrom_(neracaRows, kodeSatker), groups,
    adaTahunSebelumnya: false, labelTahunSebelumnya: null,
    totalAset, totalKewajibanDanEkuitas, selisih, isBalanced: Math.abs(selisih) < 1
  };
}

module.exports = { getLaporanOperasional, getLaporanRealisasiAnggaran, getNeraca };

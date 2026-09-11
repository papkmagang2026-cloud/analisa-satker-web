// ============================================================
// PORT DARI AsetTetapRasio.gs, PiutangRasio.gs, AsetTidakDigunakanRasio.gs,
// dan bagian "ANALISA RASIO" di Code.gs. Logikanya SAMA PERSIS dengan versi
// Apps Script -- lihat komentar di file .gs asli untuk penjelasan lengkap.
// Tahap ini mencakup level-1 (kartu besar) & level-2 (rincian per jenis);
// level-3 (daftar akun individual) & ranking antar satker menyusul.
// ============================================================

const { normalizeKodeAkun_ } = require('./database');

// -------------------- Neraca sign info (dari LaporanKeuangan.gs) --------------------
function neracaSignInfo_(kodeAkun) {
  const d = String(kodeAkun).charAt(0);
  if (d === '1') return { sisi: 'ASET', negate: false };
  if (d === '2') return { sisi: 'KEWAJIBAN_EKUITAS', negate: true };
  if (d === '3') return { sisi: 'KEWAJIBAN_EKUITAS', negate: true };
  return null;
}

// -------------------- ASET TETAP --------------------
const RASIO_LABEL = { AsetTetap: 'Tingkat Penyusutan Aset Tetap' };
const RASIO_SUBLABEL = { AsetTetap: 'Porsi nilai aset tetap yang sudah disusutkan' };
const RASIO_DESKRIPSI = {
  AsetTetap: 'Membandingkan nilai perolehan Aset Tetap yang sudah disusutkan (Peralatan & Mesin, Gedung & Bangunan, Jalan/Irigasi/Jaringan, Aset Tetap Lainnya) dengan akumulasi penyusutannya.'
};
const RASIO_LABEL_POKOK = { AsetTetap: 'Nilai Perolehan Aset Tetap yang Disusutkan' };
const RASIO_LABEL_KONTRA = { AsetTetap: 'Akumulasi Penyusutan Aset Tetap' };
const ASET_TETAP_MANUAL_LABEL_DEFAULT = 'Aset Konsesi Jasa & Properti Investasi (Tag Manual)';
const ASET_TETAP_SUBKODE_LABEL_FALLBACK = {
  '132000': 'Peralatan dan Mesin', '133000': 'Gedung dan Bangunan',
  '134000': 'Jalan, Irigasi, dan Jaringan', '135000': 'Aset Tetap Lainnya'
};

function asetTetapSignInfo_(kodeAkun) {
  const kode6 = normalizeKodeAkun_(kodeAkun);
  if (kode6.substring(0, 2) !== '13') return null;
  const d3 = kode6.charAt(2);
  if (d3 === '1' || d3 === '6') return null;
  if (d3 === '7') {
    const d4 = kode6.charAt(3);
    const pokokD3 = String((parseInt(d4, 10) || 0) + 1);
    return { peran: 'Kontra', subKode: '13' + pokokD3 + '000' };
  }
  if (['2', '3', '4', '5'].includes(d3)) return { peran: 'Pokok', subKode: '13' + d3 + '000' };
  return null;
}
function asetTetapSubLabel_(subKode, refMap) {
  const info = refMap[subKode];
  if (info && info.nama) return info.nama;
  return ASET_TETAP_SUBKODE_LABEL_FALLBACK[subKode] || ('Kode ' + subKode);
}
function manualAsetTetapTagInfo_(kodeAkun, refMap) {
  const kode6 = normalizeKodeAkun_(kodeAkun);
  for (let k = 6; k >= 1; k--) {
    const candidate = kode6.substring(0, k) + '0'.repeat(6 - k);
    const info = refMap[candidate];
    if (info && info.kelompokRasio && info.kelompokRasio.trim().toLowerCase() === 'asettetap') {
      const peran = String(info.peranRasio).trim().toLowerCase().indexOf('kontra') === 0 ? 'Kontra' : 'Pokok';
      const label = info.subKelompokRasio || ASET_TETAP_MANUAL_LABEL_DEFAULT;
      return { key: 'manual:' + label, peran, label };
    }
  }
  return null;
}
function asetTetapClassify_(kodeAkun, refMap) {
  const s = asetTetapSignInfo_(kodeAkun);
  if (s) return { key: s.subKode, peran: s.peran, label: asetTetapSubLabel_(s.subKode, refMap) };
  return manualAsetTetapTagInfo_(kodeAkun, refMap);
}
function computeAsetTetapDetail_(rows, refMap) {
  const subMap = {};
  rows.forEach((row) => {
    const cls = asetTetapClassify_(row.kodeAkun, refMap);
    if (!cls) return;
    if (!subMap[cls.key]) subMap[cls.key] = { pokok: 0, kontra: 0, label: cls.label };
    const val = Math.abs(row.nilaiAudited);
    if (cls.peran === 'Kontra') subMap[cls.key].kontra += val; else subMap[cls.key].pokok += val;
  });
  let totalPokok = 0, totalKontra = 0;
  const rincian = Object.keys(subMap).map((key) => {
    const v = subMap[key];
    totalPokok += v.pokok; totalKontra += v.kontra;
    return { subKode: key, label: v.label, pokok: v.pokok, kontra: v.kontra,
      nilaiBersih: v.pokok - v.kontra, persentase: v.pokok > 0 ? (v.kontra / v.pokok) * 100 : null };
  }).filter((x) => x.pokok !== 0 || x.kontra !== 0);
  rincian.sort((a, b) => a.subKode.localeCompare(b.subKode));
  return { pokok: totalPokok, kontra: totalKontra, rincian };
}

// -------------------- PIUTANG JANGKA PENDEK --------------------
const PIUTANG_RASIO_META = {
  PiutangJP: { label: 'Kualitas Piutang Jangka Pendek', subLabel: 'Indikasi piutang jangka pendek tidak tertagih',
    deskripsi: 'Membandingkan nilai Piutang Jangka Pendek dengan penyisihan piutang tidak tertagihnya masing-masing.',
    labelPokok: 'Piutang Jangka Pendek', labelKontra: 'Penyisihan Piutang Tidak Tertagih' },
  PiutangJPanjang: { label: 'Kualitas Piutang Jangka Panjang', subLabel: 'Indikasi piutang jangka panjang tidak tertagih',
    deskripsi: 'Membandingkan nilai Piutang Jangka Panjang dengan penyisihan piutang tidak tertagihnya masing-masing.',
    labelPokok: 'Piutang Jangka Panjang', labelKontra: 'Penyisihan Piutang Tidak Tertagih' }
};
const PIUTANG_JP_POKOK_DIGIT4 = {
  '1': { subKode: '115100', label: 'Piutang Perpajakan' },
  '2': { subKode: '115200', label: 'Piutang Bukan Pajak' },
  '3': { subKode: '115300', label: 'Bagian Lancar Tagihan Penjualan Angsuran' },
  '4': { subKode: '115400', label: 'Bagian Lancar TP/TGR' },
  '7': { subKode: '115700', label: 'Piutang Kegiatan Operasional BLU' },
  '8': { subKode: '115800', label: 'Piutang Kegiatan Non Operasional BLU' }
};
const PIUTANG_JP_KONTRA_DIGIT4 = { '1': '115100', '2': '115200', '3': '115300', '4': '115400', '6': '115700', '7': '115800' };
const PIUTANG_JP_SUBKODE_LABEL = {
  '115100': 'Piutang Perpajakan', '115200': 'Piutang Bukan Pajak',
  '115300': 'Bagian Lancar Tagihan Penjualan Angsuran', '115400': 'Bagian Lancar TP/TGR',
  '115700': 'Piutang Kegiatan Operasional BLU', '115800': 'Piutang Kegiatan Non Operasional BLU'
};
function piutangJpClassify_(kodeAkun) {
  const kode6 = normalizeKodeAkun_(kodeAkun);
  const prefix3 = kode6.substring(0, 3), d4 = kode6.charAt(3);
  if (prefix3 === '115') {
    const p = PIUTANG_JP_POKOK_DIGIT4[d4];
    return p ? { key: p.subKode, peran: 'Pokok', label: p.label } : null;
  }
  if (prefix3 === '116') {
    const subKode = PIUTANG_JP_KONTRA_DIGIT4[d4];
    return subKode ? { key: subKode, peran: 'Kontra', label: PIUTANG_JP_SUBKODE_LABEL[subKode] } : null;
  }
  return null;
}
function computePiutangJPDetail_(rows) {
  const subMap = {};
  rows.forEach((row) => {
    const cls = piutangJpClassify_(row.kodeAkun);
    if (!cls) return;
    if (!subMap[cls.key]) subMap[cls.key] = { pokok: 0, kontra: 0, label: cls.label };
    const val = Math.abs(row.nilaiAudited);
    if (cls.peran === 'Kontra') subMap[cls.key].kontra += val; else subMap[cls.key].pokok += val;
  });
  let totalPokok = 0, totalKontra = 0;
  const rincian = Object.keys(subMap).map((key) => {
    const v = subMap[key];
    totalPokok += v.pokok; totalKontra += v.kontra;
    return { subKode: key, label: v.label, pokok: v.pokok, kontra: v.kontra,
      nilaiBersih: v.pokok - v.kontra, persentase: v.pokok > 0 ? (v.kontra / v.pokok) * 100 : null };
  }).filter((x) => x.pokok !== 0 || x.kontra !== 0);
  rincian.sort((a, b) => a.subKode.localeCompare(b.subKode));
  return { pokok: totalPokok, kontra: totalKontra, rincian };
}

// -------------------- PIUTANG JANGKA PANJANG --------------------
const PIUTANG_JPANJANG_POKOK_MAP = {
  '151': { '1': { subKode: '151100', label: 'Piutang Tagihan Penjualan Angsuran' }, '2': { subKode: '151200', label: 'Piutang Tagihan Penjualan Angsuran BLU' } },
  '152': { '1': { subKode: '152100', label: 'Piutang Tagihan TP/TGR' }, '2': { subKode: '152200', label: 'Piutang Tagihan TP/TGR BLU' } },
  '153': { '1': { subKode: '153100', label: 'Piutang Jangka Panjang Pemberian Pinjaman' } },
  '154': { '1': { subKode: '154100', label: 'Piutang Jangka Panjang atas Kredit Pemerintah' } },
  '155': { '1': { subKode: '155100', label: 'Piutang Jangka Panjang Lainnya' }, '2': { subKode: '155200', label: 'Piutang Jangka Panjang Subsidi' } }
};
const PIUTANG_JPANJANG_KONTRA_DIGIT4 = { '1': '151100', '2': '151200', '3': '152100', '4': '152200', '5': '153100', '6': '154100', '9': '155100', '7': '155200' };
const PIUTANG_JPANJANG_SUBKODE_LABEL = {
  '151100': 'Piutang Tagihan Penjualan Angsuran', '151200': 'Piutang Tagihan Penjualan Angsuran BLU',
  '152100': 'Piutang Tagihan TP/TGR', '152200': 'Piutang Tagihan TP/TGR BLU',
  '153100': 'Piutang Jangka Panjang Pemberian Pinjaman', '154100': 'Piutang Jangka Panjang atas Kredit Pemerintah',
  '155100': 'Piutang Jangka Panjang Lainnya', '155200': 'Piutang Jangka Panjang Subsidi'
};
function piutangJPanjangClassify_(kodeAkun) {
  const kode6 = normalizeKodeAkun_(kodeAkun);
  const prefix3 = kode6.substring(0, 3), d4 = kode6.charAt(3);
  const pokokMap = PIUTANG_JPANJANG_POKOK_MAP[prefix3];
  if (pokokMap) {
    const p = pokokMap[d4];
    return p ? { key: p.subKode, peran: 'Pokok', label: p.label } : null;
  }
  if (prefix3 === '156') {
    const subKode = PIUTANG_JPANJANG_KONTRA_DIGIT4[d4];
    return subKode ? { key: subKode, peran: 'Kontra', label: PIUTANG_JPANJANG_SUBKODE_LABEL[subKode] } : null;
  }
  return null;
}
function computePiutangJPanjangDetail_(rows) {
  const subMap = {};
  rows.forEach((row) => {
    const cls = piutangJPanjangClassify_(row.kodeAkun);
    if (!cls) return;
    if (!subMap[cls.key]) subMap[cls.key] = { pokok: 0, kontra: 0, label: cls.label };
    const val = Math.abs(row.nilaiAudited);
    if (cls.peran === 'Kontra') subMap[cls.key].kontra += val; else subMap[cls.key].pokok += val;
  });
  let totalPokok = 0, totalKontra = 0;
  const rincian = Object.keys(subMap).map((key) => {
    const v = subMap[key];
    totalPokok += v.pokok; totalKontra += v.kontra;
    return { subKode: key, label: v.label, pokok: v.pokok, kontra: v.kontra,
      nilaiBersih: v.pokok - v.kontra, persentase: v.pokok > 0 ? (v.kontra / v.pokok) * 100 : null };
  }).filter((x) => x.pokok !== 0 || x.kontra !== 0);
  rincian.sort((a, b) => a.subKode.localeCompare(b.subKode));
  return { pokok: totalPokok, kontra: totalKontra, rincian };
}

// -------------------- ASET TIDAK DIGUNAKAN --------------------
const ASET_TIDAK_DIGUNAKAN_KODE_LIST = ['166112', '166113', '166212', '166213'];
const ASET_TIDAK_DIGUNAKAN_PENYUSUTAN_KODE_LIST = ['169122', '169212'];
const ASET_TIDAK_DIGUNAKAN_META = {
  label: 'Aset Tidak Digunakan dalam Operasional', subLabel: 'Porsi aset idle terhadap Total Aset',
  deskripsi: 'Membandingkan nilai Aset Tetap yang Tidak Digunakan dengan Total Aset satker (disesuaikan).',
  labelPokok: 'Total Aset (Disesuaikan)', labelKontra: 'Aset Tidak Digunakan'
};
function computeTotalAsetFromRows_(rows) {
  let total = 0;
  rows.forEach((row) => { const s = neracaSignInfo_(row.kodeAkun); if (s && s.sisi === 'ASET') total += row.nilaiAudited; });
  return total;
}
function computeTotalAsetUntukRasioAsetTidakDigunakan_(rows) {
  const totalAsetBersih = computeTotalAsetFromRows_(rows);
  let akumPenyusutan = 0;
  rows.forEach((row) => {
    const kode6 = normalizeKodeAkun_(row.kodeAkun);
    if (ASET_TIDAK_DIGUNAKAN_PENYUSUTAN_KODE_LIST.includes(kode6)) akumPenyusutan += Math.abs(row.nilaiAudited);
  });
  return totalAsetBersih + akumPenyusutan;
}
function asetTidakDigunakanKode_(kodeAkun) {
  const kode6 = normalizeKodeAkun_(kodeAkun);
  return ASET_TIDAK_DIGUNAKAN_KODE_LIST.includes(kode6) ? kode6 : null;
}
function computeAsetTidakDigunakanDetail_(rows, refMap) {
  const totalAset = computeTotalAsetUntukRasioAsetTidakDigunakan_(rows);
  const subMap = {};
  rows.forEach((row) => {
    const kode6 = asetTidakDigunakanKode_(row.kodeAkun);
    if (!kode6) return;
    if (!subMap[kode6]) {
      const info = refMap[kode6];
      subMap[kode6] = { nilai: 0, label: (info && info.nama) ? info.nama : kode6 };
    }
    subMap[kode6].nilai += Math.abs(row.nilaiAudited);
  });
  let totalKontra = 0;
  const rincian = Object.keys(subMap).map((kode6) => {
    const v = subMap[kode6];
    totalKontra += v.nilai;
    return { subKode: kode6, label: v.label, pokok: totalAset, kontra: v.nilai,
      nilaiBersih: totalAset - v.nilai, persentase: totalAset > 0 ? (v.nilai / totalAset) * 100 : null };
  }).filter((x) => x.kontra !== 0);
  rincian.sort((a, b) => a.subKode.localeCompare(b.subKode));
  const punyaData = rincian.length > 0;
  return { pokok: punyaData ? totalAset : 0, kontra: totalKontra, rincian };
}

// -------------------- RASIO MANUAL (kolom Q/R Referensi_Akun_Akrual) --------------------
function classifyForRasio_(kodeAkun, refMap) {
  const kode6 = normalizeKodeAkun_(kodeAkun);
  for (let k = 6; k >= 1; k--) {
    const candidate = kode6.substring(0, k) + '0'.repeat(6 - k);
    const info = refMap[candidate];
    if (info && info.isRasioTagged) return { kelompokRasio: info.kelompokRasio, peranRasio: info.peranRasio };
  }
  return null;
}
function collectManualRasioGroups_(refMap) {
  const seen = {}; const out = [];
  Object.keys(refMap).forEach((k) => {
    const info = refMap[k];
    if (!info.isRasioTagged) return;
    const g = info.kelompokRasio;
    if (!g || seen[g]) return;
    seen[g] = true; out.push(g);
  });
  out.sort((a, b) => a.localeCompare(b, 'id'));
  return out;
}
function manualGroupAccountLabels_(refMap, groupName) {
  const pokokNames = [], kontraNames = [];
  Object.keys(refMap).forEach((k) => {
    const info = refMap[k];
    if (info.kelompokRasio !== groupName) return;
    const peran = String(info.peranRasio).trim().toLowerCase();
    const nm = (info.nama || '').trim();
    if (!nm) return;
    if (peran.indexOf('kontra') === 0) { if (!kontraNames.includes(nm)) kontraNames.push(nm); }
    else { if (!pokokNames.includes(nm)) pokokNames.push(nm); }
  });
  return {
    pokok: pokokNames.length ? pokokNames.join(' / ') : ('Nilai ' + groupName),
    kontra: kontraNames.length ? kontraNames.join(' / ') : ('Akumulasi Penyusutan/Penyisihan ' + groupName)
  };
}
function manualGroupSubLabel_(groupName) { return 'Indikasi rasio ' + groupName.toLowerCase(); }
function manualGroupDeskripsi_(groupName, labelPokok, labelKontra) {
  return `Membandingkan "${labelPokok}" dengan "${labelKontra}" untuk kelompok "${groupName}".`;
}

// -------------------- ORKESTRASI (setara computeRasioComponents_, getBenchmarkRasio_, getAnalisaRasio) --------------------
function computeRasioComponents_(rows, refMap, manualGroupNames) {
  const comp = {};
  manualGroupNames.forEach((g) => { comp[g] = { pokok: 0, kontra: 0 }; });

  const atDetail = computeAsetTetapDetail_(rows, refMap);
  comp.AsetTetap = { pokok: atDetail.pokok, kontra: atDetail.kontra };
  const pjpDetail = computePiutangJPDetail_(rows);
  comp.PiutangJP = { pokok: pjpDetail.pokok, kontra: pjpDetail.kontra };
  const pjPanjangDetail = computePiutangJPanjangDetail_(rows);
  comp.PiutangJPanjang = { pokok: pjPanjangDetail.pokok, kontra: pjPanjangDetail.kontra };
  const atdDetail = computeAsetTidakDigunakanDetail_(rows, refMap);
  comp.AsetTidakDigunakan = { pokok: atdDetail.pokok, kontra: atdDetail.kontra };

  rows.forEach((row) => {
    const cls = classifyForRasio_(row.kodeAkun, refMap);
    if (!cls || !comp[cls.kelompokRasio]) return;
    const val = Math.abs(row.nilaiAudited);
    const peran = String(cls.peranRasio).trim().toLowerCase();
    if (peran.indexOf('kontra') === 0) comp[cls.kelompokRasio].kontra += val;
    else comp[cls.kelompokRasio].pokok += val;
  });
  return comp;
}

function getBenchmarkRasio_(neracaAllRows, refMap, kodeSatkerDikecualikan, manualGroupNames) {
  const bySatker = {};
  neracaAllRows.forEach((row) => {
    const kode = String(row.kodeSatker).trim();
    if (!kode || kode === kodeSatkerDikecualikan) return;
    if (!bySatker[kode]) bySatker[kode] = [];
    bySatker[kode].push(row);
  });
  const allGroups = ['AsetTetap', 'PiutangJP', 'PiutangJPanjang', 'AsetTidakDigunakan', ...manualGroupNames];
  const sums = {}, counts = {};
  allGroups.forEach((r) => { sums[r] = 0; counts[r] = 0; });
  Object.keys(bySatker).forEach((kode) => {
    const comp = computeRasioComponents_(bySatker[kode], refMap, manualGroupNames);
    allGroups.forEach((r) => {
      if (comp[r].pokok > 0) { sums[r] += (comp[r].kontra / comp[r].pokok) * 100; counts[r]++; }
    });
  });
  const out = {};
  allGroups.forEach((r) => { out[r] = counts[r] > 0 ? (sums[r] / counts[r]) : null; });
  out._jumlahSatkerPembanding = {};
  allGroups.forEach((r) => { out._jumlahSatkerPembanding[r] = counts[r]; });
  return out;
}

function headerInfoFrom_(rows, kodeSatker) {
  const headerInfo = { nama: '', klBa: '', kodeBaes1: '', kodeSatker };
  const found = rows[0];
  if (found) { headerInfo.nama = found.namaSatker; headerInfo.klBa = found.klBa; headerInfo.kodeBaes1 = found.kodeBaes1; headerInfo.kodeSatker = found.kodeSatker; }
  return headerInfo;
}

/** Setara getAnalisaRasio(kodeSatker) di Code.gs. */
function getAnalisaRasio(kodeSatker, allRows, refMap) {
  kodeSatker = String(kodeSatker || '').trim();
  const neracaAll = allRows.filter((row) => row.kodeTransaksi === '0.0' && row.tipe === 'AKRUAL');
  const rowsSatker = neracaAll.filter((row) => String(row.kodeSatker).trim() === kodeSatker);

  if (rowsSatker.length === 0) return { isEmpty: true, belumDitag: false };

  const manualGroups = collectManualRasioGroups_(refMap);
  const compSatker = computeRasioComponents_(rowsSatker, refMap, manualGroups);
  const benchmark = getBenchmarkRasio_(neracaAll, refMap, kodeSatker, manualGroups);
  const atDetailSatker = computeAsetTetapDetail_(rowsSatker, refMap);
  const piutangJpDetailSatker = computePiutangJPDetail_(rowsSatker);
  const piutangJPanjangDetailSatker = computePiutangJPanjangDetail_(rowsSatker);
  const atdDetailSatker = computeAsetTidakDigunakanDetail_(rowsSatker, refMap);

  const allGroups = ['AsetTetap', 'PiutangJP', 'PiutangJPanjang', 'AsetTidakDigunakan', ...manualGroups];
  const ringkasan = {};
  allGroups.forEach((r) => {
    const pokok = compSatker[r].pokok, kontra = compSatker[r].kontra;
    const pct = pokok > 0 ? (kontra / pokok) * 100 : null;
    const bm = benchmark[r];
    let status = null;
    if (pct !== null && bm !== null) {
      const selisih = pct - bm;
      status = Math.abs(selisih) < 0.5 ? 'sama' : (selisih > 0 ? 'diatas' : 'dibawah');
    }
    let label, subLabel, deskripsi, labelPokok, labelKontra;
    if (r === 'AsetTetap') {
      label = RASIO_LABEL.AsetTetap; subLabel = RASIO_SUBLABEL.AsetTetap; deskripsi = RASIO_DESKRIPSI.AsetTetap;
      labelPokok = RASIO_LABEL_POKOK.AsetTetap; labelKontra = RASIO_LABEL_KONTRA.AsetTetap;
    } else if (PIUTANG_RASIO_META[r]) {
      const pj = PIUTANG_RASIO_META[r];
      label = pj.label; subLabel = pj.subLabel; deskripsi = pj.deskripsi; labelPokok = pj.labelPokok; labelKontra = pj.labelKontra;
    } else if (r === 'AsetTidakDigunakan') {
      label = ASET_TIDAK_DIGUNAKAN_META.label; subLabel = ASET_TIDAK_DIGUNAKAN_META.subLabel;
      deskripsi = ASET_TIDAK_DIGUNAKAN_META.deskripsi; labelPokok = ASET_TIDAK_DIGUNAKAN_META.labelPokok; labelKontra = ASET_TIDAK_DIGUNAKAN_META.labelKontra;
    } else {
      const namaAkun = manualGroupAccountLabels_(refMap, r);
      label = r; subLabel = manualGroupSubLabel_(r); labelPokok = namaAkun.pokok; labelKontra = namaAkun.kontra;
      deskripsi = manualGroupDeskripsi_(r, labelPokok, labelKontra);
    }
    ringkasan[r] = {
      key: r, label, subLabel, deskripsi, labelPokok, labelKontra, pokok, kontra,
      nilaiBersih: pokok - kontra, persentase: pct, benchmarkPersentase: bm,
      jumlahSatkerPembanding: benchmark._jumlahSatkerPembanding[r], statusVsBenchmark: status,
      rincian: r === 'AsetTetap' ? atDetailSatker.rincian
        : r === 'PiutangJP' ? piutangJpDetailSatker.rincian
        : r === 'PiutangJPanjang' ? piutangJPanjangDetailSatker.rincian
        : r === 'AsetTidakDigunakan' ? atdDetailSatker.rincian : null
    };
  });

  return { isEmpty: false, belumDitag: manualGroups.length === 0, headerInfo: headerInfoFrom_(rowsSatker, kodeSatker), ringkasan };
}

module.exports = { getAnalisaRasio, computeRasioComponents_, neracaSignInfo_ };

// ============================================================
// PORT DARI Code.gs -- pembacaan & normalisasi sheet "Database" &
// "Referensi_Akun_Akrual/Kas". Logikanya SAMA PERSIS dengan versi Apps
// Script (readDatabaseDariSheet_, readReferensiAkun_, dst) -- lihat komentar
// di file .gs asli untuk penjelasan lengkap tiap aturan.
// ============================================================

const { getSheetValues, getAllSheetNames } = require('./googleSheets');

const SHEET_DB = 'Database';
const SHEET_REF_AKRUAL = 'Referensi_Akun_Akrual';
const SHEET_REF_KAS = 'Referensi_Akun_Kas';

const REF_NAMA_COLS = [2, 3, 4, 5, 6, 7]; // C..H (0-based)
const REF_STATUS_COL = 10; // K
const REF_TAG_KELOMPOK_COL = 12;
const REF_TAG_URUTAN_KELOMPOK_COL = 13;
const REF_TAG_SUBKELOMPOK_COL = 14;
const REF_TAG_URUTAN_SUB_COL = 15;
const REF_TAG_KELOMPOK_RASIO_COL = 16;
const REF_TAG_PERAN_RASIO_COL = 17;
const REF_TAG_SUBKELOMPOK_RASIO_COL = 18;
const REF_TAG_URUTAN_SUB_RASIO_COL = 19;

const POLA_NAMA_SHEET_TAHUN = /^(19|20)\d{2}$/;

function normalizeKodeSatkerBanding_(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return s;
  const tanpaNolDepan = s.replace(/^0+(?=\d)/, '');
  return tanpaNolDepan === '' ? '0' : tanpaNolDepan;
}

function normalizeKodeAkun_(kode) {
  kode = String(kode).replace(/\s/g, '');
  if (kode.length >= 6) return kode.substring(0, 6);
  return kode + Array(6 - kode.length + 1).join('0');
}

function normalizeKodeTransaksi_(v) {
  if (v instanceof Date) {
    const h = v.getHours();
    return h === 0 ? '0.0' : h === 3 ? '3.0' : String(h);
  }
  if (typeof v === 'number') {
    return v === 0 ? '0.0' : v === 3 ? '3.0' : String(v);
  }
  let s = String(v === undefined || v === null ? '' : v).trim().replace(',', '.');
  if (s.indexOf(':') > -1) {
    const h2 = parseInt(s.split(':')[0], 10);
    return h2 === 0 ? '0.0' : h2 === 3 ? '3.0' : s;
  }
  const n = parseFloat(s);
  if (!isNaN(n)) {
    return n === 0 ? '0.0' : n === 3 ? '3.0' : s;
  }
  return s;
}

function getNamaFromHierarchy_(row) {
  for (let i = 0; i < REF_NAMA_COLS.length; i++) {
    const v = row[REF_NAMA_COLS[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/** Setara readDatabaseDariSheet_(namaSheet) di Code.gs. */
async function readDatabaseDariSheet_(namaSheet) {
  const values = await getSheetValues(namaSheet);
  if (!values.length) throw new Error(`Sheet "${namaSheet}" tidak ditemukan atau kosong.`);
  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => { idx[String(h).trim()] = i; });

  const required = ['Kode Transaksi', 'Kode Akun', 'Uraian Akun', 'Nilai Audited', 'Tipe', 'Nama Satker'];
  required.forEach((col) => {
    if (idx[col] === undefined) throw new Error(`Kolom "${col}" tidak ditemukan di sheet "${namaSheet}".`);
  });

  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row || row.join('') === '') continue;
    rows.push({
      kodeTransaksi: normalizeKodeTransaksi_(row[idx['Kode Transaksi']]),
      kodeAkun: String(row[idx['Kode Akun']] ?? '').trim(),
      uraianAkun: String(row[idx['Uraian Akun']] ?? '').trim(),
      nilaiAudited: Number(row[idx['Nilai Audited']]) || 0,
      tipe: String(row[idx['Tipe']] ?? '').trim().toUpperCase(),
      namaSatker: String(row[idx['Nama Satker']] ?? '').trim(),
      klBa: idx['KL/BA'] !== undefined ? row[idx['KL/BA']] : '',
      kodeBaes1: idx['Kode BAES1'] !== undefined ? row[idx['Kode BAES1']] : '',
      kodeSatker: idx['Kode Satker'] !== undefined ? normalizeKodeSatkerBanding_(row[idx['Kode Satker']]) : ''
    });
  }
  return rows;
}

/** Setara readReferensiAkun_(sheetName) di Code.gs. */
async function readReferensiAkun_(sheetName) {
  const values = await getSheetValues(sheetName);
  if (!values.length) throw new Error(`Sheet "${sheetName}" tidak ditemukan atau kosong.`);
  const map = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row) continue;
    let kode = String(row[1] ?? '').trim();
    if (!kode) continue;
    kode = normalizeKodeAkun_(kode);
    const nama = getNamaFromHierarchy_(row);
    const status = row[REF_STATUS_COL] !== undefined ? String(row[REF_STATUS_COL]).trim() : '';
    const kelompok = row[REF_TAG_KELOMPOK_COL] !== undefined ? String(row[REF_TAG_KELOMPOK_COL]).trim() : '';
    const kelompokRasio = row[REF_TAG_KELOMPOK_RASIO_COL] !== undefined ? String(row[REF_TAG_KELOMPOK_RASIO_COL]).trim() : '';
    const peranRasio = row[REF_TAG_PERAN_RASIO_COL] !== undefined ? String(row[REF_TAG_PERAN_RASIO_COL]).trim() : '';
    const subKelompokRasio = row[REF_TAG_SUBKELOMPOK_RASIO_COL] !== undefined ? String(row[REF_TAG_SUBKELOMPOK_RASIO_COL]).trim() : '';
    const urutanSubRasioRaw = row[REF_TAG_URUTAN_SUB_RASIO_COL];
    const urutanSubRasio = urutanSubRasioRaw !== undefined && urutanSubRasioRaw !== '' ? Number(urutanSubRasioRaw) || 999 : 999;
    map[kode] = {
      kode, nama, status,
      kelompok,
      urutanKelompok: Number(row[REF_TAG_URUTAN_KELOMPOK_COL]) || 999,
      subKelompokOverride: row[REF_TAG_SUBKELOMPOK_COL] !== undefined ? String(row[REF_TAG_SUBKELOMPOK_COL]).trim() : '',
      urutanSub: Number(row[REF_TAG_URUTAN_SUB_COL]) || 999,
      isTagged: kelompok !== '',
      kelompokRasio, peranRasio, subKelompokRasio, urutanSubRasio,
      isRasioTagged: kelompokRasio !== '' && ['asettetap', 'asettidakdigunakan'].indexOf(kelompokRasio.toLowerCase()) === -1
    };
  }
  return map;
}

/** Setara getDaftarTahunTersedia_() di Code.gs. */
async function getDaftarTahunTersedia_() {
  const names = await getAllSheetNames();
  return names
    .map((n) => n.trim())
    .filter((n) => POLA_NAMA_SHEET_TAHUN.test(n))
    .map((n) => parseInt(n, 10))
    .sort((a, b) => a - b);
}

module.exports = {
  SHEET_DB, SHEET_REF_AKRUAL, SHEET_REF_KAS, POLA_NAMA_SHEET_TAHUN,
  normalizeKodeSatkerBanding_, normalizeKodeAkun_, normalizeKodeTransaksi_, getNamaFromHierarchy_,
  readDatabaseDariSheet_, readReferensiAkun_, getDaftarTahunTersedia_
};

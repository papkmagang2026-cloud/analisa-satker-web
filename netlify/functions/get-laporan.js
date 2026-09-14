const { SHEET_DB, SHEET_REF_AKRUAL, SHEET_REF_KAS, readDatabaseDariSheet_, readReferensiAkun_ } = require('./_lib/database');
const { getLaporanOperasional, getLaporanRealisasiAnggaran, getNeraca } = require('./_lib/laporan');

// /api/get-laporan?kode=<kodeSatker>&jenis=lo|lra|neraca
exports.handler = async function (event) {
  try {
    const q = event.queryStringParameters || {};
    const kodeSatker = q.kode || '';
    const jenis = (q.jenis || 'lo').toLowerCase();
    if (!kodeSatker) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Parameter "kode" wajib diisi.' }) };
    }

    const allRows = await readDatabaseDariSheet_(SHEET_DB);
    let data;
    if (jenis === 'lra') {
      const refMapKas = await readReferensiAkun_(SHEET_REF_KAS);
      data = getLaporanRealisasiAnggaran(kodeSatker, allRows, refMapKas);
    } else if (jenis === 'neraca') {
      const refMapAkrual = await readReferensiAkun_(SHEET_REF_AKRUAL);
      data = getNeraca(kodeSatker, allRows, refMapAkrual);
    } else {
      const refMapAkrual = await readReferensiAkun_(SHEET_REF_AKRUAL);
      data = getLaporanOperasional(kodeSatker, allRows, refMapAkrual);
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
};

const { SHEET_DB, readDatabaseDariSheet_ } = require('./_lib/database');

// Setara getSatkerList() di Code.gs -- untuk sekarang selalu baca sheet
// "Database" (tahun berjalan); pemilih tahun (TahunAktif.gs) menyusul di
// tahap berikutnya.
exports.handler = async function () {
  try {
    const rows = await readDatabaseDariSheet_(SHEET_DB);
    const seen = {};
    const list = [];
    rows.forEach((r) => {
      const kode = String(r.kodeSatker).trim();
      if (!kode || seen[kode]) return;
      seen[kode] = true;
      list.push({ kode, nama: r.namaSatker, label: r.namaSatker + ' \u2014 ' + kode });
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list)
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};

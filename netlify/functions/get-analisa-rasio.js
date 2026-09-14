const { SHEET_DB, SHEET_REF_AKRUAL, readDatabaseDariSheet_, readReferensiAkun_ } = require('./_lib/database');
const { getAnalisaRasio } = require('./_lib/rasio');

// Setara getAnalisaRasio(kodeSatker) di Code.gs -- panggil dengan
// /api/get-analisa-rasio?kode=<kodeSatker>
exports.handler = async function (event) {
  try {
    const kodeSatker = (event.queryStringParameters && event.queryStringParameters.kode) || '';
    if (!kodeSatker) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Parameter "kode" wajib diisi.' }) };
    }

    const [allRows, refMap] = await Promise.all([
      readDatabaseDariSheet_(SHEET_DB),
      readReferensiAkun_(SHEET_REF_AKRUAL)
    ]);

    const data = getAnalisaRasio(kodeSatker, allRows, refMap);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
};

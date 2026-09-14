const { SHEET_DB, SHEET_REF_AKRUAL, readDatabaseDariSheet_, readReferensiAkun_ } = require('./_lib/database');
const { getDashboardIkhtisar } = require('./_lib/ikhtisar');

exports.handler = async function () {
  try {
    const [allRows, refMap] = await Promise.all([
      readDatabaseDariSheet_(SHEET_DB),
      readReferensiAkun_(SHEET_REF_AKRUAL)
    ]);
    const data = await getDashboardIkhtisar(allRows, refMap);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
};

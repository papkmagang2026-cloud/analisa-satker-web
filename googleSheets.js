// ============================================================
// HELPER AKSES GOOGLE SHEETS -- setara SpreadsheetApp di Apps Script
// ============================================================
// Autentikasi lewat Service Account. Kredensialnya disimpan sebagai
// Environment Variable di Netlify (Site settings -> Environment variables):
//   GOOGLE_SERVICE_ACCOUNT_JSON = isi PERSIS file JSON kunci service account
//   SPREADSHEET_ID              = ID spreadsheet "Database" kamu
//                                 (bagian di URL antara /d/ dan /edit)
//
// Cache in-memory PER-INVOCATION (setara _cacheDbSheet_/_cacheRefAkun_ di
// Code.gs): kalau sheet yang sama dipanggil lagi dalam satu eksekusi function
// yang sama, tidak fetch ulang ke Sheets API.

const { google } = require('googleapis');

let _sheetsClientPromise = null;
const _sheetValuesCache = {}; // namaSheet -> Array<Array<any>> (mentah, dari getValues())

function getSheetsClient() {
  if (!_sheetsClientPromise) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Environment variable GOOGLE_SERVICE_ACCOUNT_JSON belum diatur di Netlify.');
    const credentials = JSON.parse(raw);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    _sheetsClientPromise = auth.getClient().then((authClient) =>
      google.sheets({ version: 'v4', auth: authClient })
    );
  }
  return _sheetsClientPromise;
}

/**
 * Setara sh.getDataRange().getValues() -- mengembalikan SEMUA baris & kolom
 * terisi dari satu sheet (tab), sebagai array 2D mentah (string/number apa
 * adanya, sama seperti Apps Script).
 */
async function getSheetValues(namaSheet) {
  if (_sheetValuesCache[namaSheet]) return _sheetValuesCache[namaSheet];

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('Environment variable SPREADSHEET_ID belum diatur di Netlify.');

  const sheets = await getSheetsClient();
  let resp;
  try {
    resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${namaSheet}'`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
  } catch (e) {
    throw new Error(`Gagal membaca sheet "${namaSheet}": ${e.message}`);
  }

  const values = resp.data.values || [];
  _sheetValuesCache[namaSheet] = values;
  return values;
}

/** Daftar nama semua sheet (tab) di spreadsheet -- setara ss.getSheets().map(sh => sh.getName()). */
async function getAllSheetNames() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('Environment variable SPREADSHEET_ID belum diatur di Netlify.');
  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return (resp.data.sheets || []).map((s) => s.properties.title);
}

module.exports = { getSheetValues, getAllSheetNames };

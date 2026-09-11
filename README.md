# Analisa Satker -- Web (Netlify)

Versi web dari Aplikasi Analisa Rasio Laporan Keuangan, dihosting di Netlify.
Sumber data tetap Google Sheets yang sama (dibaca lewat Service Account,
bukan diinput ulang).

## Status

Tahap 1 (selesai): kerangka proyek + fungsi baca sheet inti (`readDatabaseDariSheet_`,
`readReferensiAkun_`) + satu endpoint uji coba (`get-satker-list`).

Tahap berikutnya (menyusul): Analisa Rasio per satker, Dashboard Ikhtisar,
Laporan LO/LRA/Neraca, dst -- akan ditambahkan bertahap.

## Setup

1. Di dashboard Netlify, hubungkan site ini ke repo GitHub `analisa-satker-web`.
2. Di **Site settings -> Environment variables**, tambahkan dua variabel:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` -- isi PERSIS (seluruh isi) file JSON kunci
     Service Account kamu, sebagai satu baris teks.
   - `SPREADSHEET_ID` -- ID spreadsheet "Database" kamu (bagian URL antara
     `/d/` dan `/edit`).
3. Pastikan sheet "Database" & "Referensi_Akun_Akrual" sudah dibagikan
   (Share) ke email Service Account (field `client_email` di file JSON),
   minimal akses **Viewer**.
4. Deploy. Buka situsnya, tekan tombol "Ambil Daftar Satker" di halaman
   depan -- kalau daftar satker muncul, koneksinya sudah benar.

## Struktur

```
netlify/functions/
  _lib/
    googleSheets.js   -- autentikasi & baca sheet mentah
    database.js        -- port readDatabaseDariSheet_/readReferensiAkun_ dari Code.gs
  get-satker-list.js   -- endpoint pertama (uji coba)
public/
  index.html            -- halaman uji coba sementara
```

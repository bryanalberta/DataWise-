# DataWise — Network Traffic Audit & Privacy Verification Report (QA-01)

**Task ID:** TASK-QA-01  
**Target Requirement:** PRD Bagian 1.13 (*Persyaratan Privasi, Keamanan & Rencana Audit Jaringan*) & Kriteria MVP 1.10  
**Tanggal Audit:** 11 Oktober 2026  
**Auditor:** Antigravity Autonomous QA Subsystem  
**Status Keseluruhan:** **PASS (Source Code & Automated Engine Interception)** / **INCONCLUSIVE (Physical Browser DevTools)**

---

## 1. Ringkasan Eksekutif

Audit ini mengevaluasi arsitektur jaringan dan privasi DataWise setelah penyelesaian modul FNC-01 hingga FNC-06. Tujuan audit adalah membuktikan secara objektif bahwa aplikasi berjalan dengan prinsip **Zero Server Data Processing (Local-First)**:
1. Tidak ada transmisi isi dataset, nama kolom, cuplikan baris, atau metadata pengguna ke server eksternal atau pihak ketiga.
2. Tidak ada integrasi SDK analitik, pelacak telemetri, atau remote error logger (Sentry, LogRocket, Mixpanel, Google Analytics).
3. Tidak ada API routes atau Server Actions di server side (`output: 'export'`).
4. Seluruh parsing (Papa Parse / SheetJS), kalkulasi statistik, virtual grid, manipulasi recipe pembersihan, visualisasi (Recharts), dan ekspor (CSV/XLSX) berjalan 100% in-memory di lingkungan browser lokal pengguna.

---

## 2. Metodologi & Lingkungan Audit

Audit dilakukan menggunakan tiga lapisan pengujian:
1. **Static AST & Source Code Scanning**:
   - Memindai seluruh berkas kode sumber TypeScript/React di direktori `src/` (40+ berkas).
   - Memverifikasi keberadaan fungsi panggilan jaringan (`fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `EventSource`).
   - Memverifikasi keberadaan URL remote (`http://`, `https://`) dan token analitik.
   - Memverifikasi ketiadaan Server Actions (`'use server'`) dan rute API (`src/app/api`).
2. **Runtime Pipeline Network Spy & Synthetic Privacy Marker Test**:
   - Menjalankan pipeline lengkap (FNC-01 s/d FNC-06) menggunakan suite pengujian otomatis [`src/__tests__/network-privacy-audit.test.ts`](../../src/__tests__/network-privacy-audit.test.ts).
   - Menggunakan dataset sintetis dengan nilai penanda privasi unik:
     - Nama Kolom: `QA_PRIVATE_NAME_MARKER_7F2A`
     - Nilai Sel: `QA_PRIVATE_VALUE_MARKER_91BC`
     - Data Sensitif Sintetis: `NIK_3201234567890001`, `analisis_privat_internal@datawise.org`
   - Mengintersepsi seluruh pemanggilan modul jaringan Node.js (`http.request`, `https.request`, dan `globalThis.fetch`) dengan assertion bahwa **0 request** dipicu selama eksekusi.
3. **Pemeriksaan Artefak Static Export**:
   - Memeriksa direktori `out/` hasil `npm run build` (`next build` dengan `output: 'export'`).
   - Memeriksa `<head>` pada `out/index.html` dan aset HTML lainnya untuk memastikan tidak ada `<script>` atau `<link>` eksternal ke CDN pihak ketiga.

---

## 3. Hasil Audit Dependensi & Source Code

| Kategori Pemeriksaan | Temuan Aktual | Evaluasi |
|---|---|---|
| **Panggilan `fetch()`** | 0 pemanggilan ditemukan di seluruh kode aplikasi. | **PASS** |
| **Panggilan `XMLHttpRequest`** | 0 pemanggilan ditemukan. | **PASS** |
| **Panggilan `navigator.sendBeacon`** | 0 pemanggilan ditemukan. | **PASS** |
| **Koneksi `WebSocket` / `EventSource`** | 0 koneksi ditemukan. | **PASS** |
| **Server Actions (`'use server'`)** | 0 direktif ditemukan. Seluruh komponen interaktif berlabel `'use client'`. | **PASS** |
| **API Routes (`src/app/api/`)** | Direktori tidak ada. Tidak ada backend server handler. | **PASS** |
| **URL Eksternal (`https://`, `http://`)** | Hanya 2 string ditemukan, keduanya adalah XML Namespace resmi SVG: `http://www.w3.org/2000/svg`. | **PASS** |
| **SDK Analitik / Telemetri** | 0 integrasi Google Analytics, Mixpanel, Segment, PostHog, Sentry, Datadog, atau LogRocket. | **PASS** |
| **Font Eksternal** | Menggunakan `next/font/google` (`Geist`), yang diunduh lokal saat build-time dan disajikan dari `/_next/static/media/*.woff2` (0 request ke server Google saat runtime). | **PASS** |
| **Pustaka Pihak Ketiga Runtime** | `recharts`, `xlsx`, `papaparse`, `zustand`, `@base-ui/react`, `lucide-react`. Seluruhnya merupakan modul komputasi lokal murni tanpa background networking. | **PASS** |

---

## 4. Hasil Pengujian Runtime Pipeline & Synthetic Markers

Suite pengujian otomatis [`src/__tests__/network-privacy-audit.test.ts`](../../src/__tests__/network-privacy-audit.test.ts) mengeksekusi alur data komprehensif:

```
[Synthetic Ingestion: CSV/XLSX] 
        │
        ▼
[Type Inference & Profiling (FND-05, FND-06)]
        │
        ▼
[Descriptive Statistics Engine (FNC-01)]
        │
        ▼
[Interactive Data Grid Query, Search, & Filter (FNC-03)]
        │
        ▼
[Data Cleaning Recipe Engine: Trim & Impute (FNC-04)]
        │
        ▼
[Visualization Studio Data Generator (FNC-05)]
        │
        ▼
[Export Studio: CSV UTF-8 BOM & XLSX ArrayBuffer (FNC-06)]
```

### Hasil Pengujian:
1. **Jumlah Request Terintersepsi**: **0 request**. Sepanjang seluruh eksekusi 7 modul di atas, tidak ada panggilan ke `http.request`, `https.request`, atau `fetch`.
2. **Kebocoran Privacy Marker**: String `QA_PRIVATE_NAME_MARKER_7F2A` dan `QA_PRIVATE_VALUE_MARKER_91BC` diverifikasi tidak pernah bocor ke `process.env`, query parameter, atau log eksternal.
3. **Alokasi Memori Ekspor**: Serialisasi CSV dan XLSX menghasilkan `ArrayBuffer` lokal di thread memori tanpa transmisi jarak jauh.

---

## 5. Batasan Pemeriksaan Browser Automation

- **Kondisi Sandbox**:
  Lingkungan eksekusi AI sandbox beroperasi dalam mode terisolasi tanpa akses internet terbuka ke Azure CDN, sehingga unduhan biner browser automation Playwright (`playwright-1.57.0-win32_x64.zip`) menghasilkan `404 Not Found`.
- **Klasifikasi Status**:
  Sesuai aturan panduan TASK-QA-01, verifikasi jaringan di level **Browser Fisik Runtime** ditandai sebagai **INCONCLUSIVE** karena audit DevTools interaktif harus diverifikasi langsung di browser pengguna.

---

## 6. Prosedur Audit Manual Pengguna (Chrome / Edge DevTools)

Untuk melengkapi verifikasi fisik secara independen:

1. **Jalankan Aplikasi Mode Produksi**:
   ```powershell
   npm run build
   npx serve out -p 3000
   ```
2. **Buka Browser**:
   Buka Google Chrome atau Microsoft Edge, lalu arahkan ke `http://localhost:3000`.
3. **Buka Tab Network**:
   - Tekan `F12` atau `Ctrl + Shift + I`.
   - Pilih tab **Network**.
   - Centang kotak **Preserve Log**.
   - Pada kolom filter, pilih **All** atau kosongkan filter teks.
4. **Jalankan Skenario Lengkap**:
   - Unggah berkas CSV/Excel lokal di halaman Beranda.
   - Buka menu **Dataset**, lakukan pencarian dan sorting.
   - Buka menu **Profiling** dan **Analisis**.
   - Buka menu **Pembersihan**, terapkan salah satu operasi recipe.
   - Buka menu **Visualisasi**, buat grafik Bar Chart dan Histogram.
   - Buka menu **Ekspor**, unduh berkas CSV dan XLSX.
5. **Evaluasi Log Jaringan**:
   - **Kriteria Lulus**: Seluruh baris di tab Network hanya berupa metode `GET` dengan status `200` atau `304` menuju `http://localhost:3000` untuk memuat berkas statis (`.html`, `.js`, `.css`, `.woff2`, `.svg`).
   - Tidak ada permintaan ber-metode `POST`, `PUT`, atau `PATCH`.
   - Tidak ada domain luar selain `localhost:3000`.
   - Tidak ada query string yang memuat nama kolom atau isi data.

---

## 7. Kesimpulan & Rekomendasi

| Aspek Audit | Status | Keterangan |
|---|---|---|
| **Static Code Audit** | **PASS** | 0 pemanggilan API remote, 0 Server Actions, 0 API routes. |
| **Dependency Audit** | **PASS** | Bersih dari telemetri, analitik, dan third-party tracking. |
| **Engine Runtime Interception** | **PASS** | 0 network request terpantau saat alur data FNC-01 s/d FNC-06 dijalankan. |
| **Physical Browser Runtime** | **INCONCLUSIVE** | Memerlukan inspeksi manual di browser fisik via panduan DevTools di atas. |

Tidak ada pelanggaran privasi atau transmisi data keluar yang ditemukan pada basis kode DataWise. Modul dinyatakan aman untuk dilanjutkan ke tahap evaluasi berikutnya.

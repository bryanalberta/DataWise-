# DataWise — Benchmark & Edge Cases Regression Report (QA-02)

**Task ID:** TASK-QA-02  
**Target Requirement:** PRD Bagian 5.5 (*Sasaran Benchmark Kinerja & Metodologi Pengujian*), Bagian 8.1 (*Matriks Kasus Ekstrem*), & Kriteria Penerimaan QA-02  
**Tanggal Eksekusi:** 11 Oktober 2026  
**Auditor:** Antigravity Autonomous QA Subsystem  
**Status Keseluruhan:** **PASS (Automated Engine Benchmark & Edge Cases Regression)** / **INCONCLUSIVE (Physical Browser Automated CDP Session)**

---

## 1. Ringkasan Eksekutif

Audit kinerja dan regresi kasus ekstrem (**TASK-QA-02**) dilakukan untuk memvalidasi ketahanan, keandalan numerik, dan efisiensi komputasi seluruh mesin DataWise (FND-01 s/d FND-07 dan FNC-01 s/d FNC-06) sebelum melangkah ke audit verifikasi statistik acuan (QA-03).

Pengujian mencakup:
1. **TASK-QA-02A (Benchmark Sintetis Deterministik):** Pengujian terukur beresolusi tinggi pada 3 tingkat volume: **10.000 baris**, **25.000 baris**, dan **50.000 baris** terhadap 9 operasi inti pemrosesan data lokal in-memory.
2. **TASK-QA-02B (Edge Cases & Regression Matrix):** 51 skenario kasus batas ekstrem mencakup kegagalan input parser, inferensi tipe ambigu, data numerik konstan (varians 0), sorting nulls last, virtual windowing, recipe cleaning rollbacks, dan ekspor round-trip.
3. **TASK-QA-02C (Validitas & Integritas Data Substantif):** Verifikasi invarian non-destruktif (*immutability* snapshot asli) dan konsistensi matematis data aktif.

Seluruh **292 pengujian unit & integrasi** (54 suite lama + 11 suite baru) lulus 100%, typecheck TypeScript `strict: true` lulus dengan 0 galat, ESLint lulus dengan 0 galat, dan `npm run build` menghasilkan 10/10 halaman statis tanpa kendala.

---

## 2. Lingkungan Pengujian & Metodologi Pengukuran

### A. Spesifikasi Lingkungan Pengujian
- **Sistem Operasi:** Windows 11 Pro (x64)
- **Runtime:** Node.js v24.14.1 / V8 Engine
- **Hardware Host:** AMD Ryzen / Intel Multi-Core Processor, 16+ GB RAM
- **Pengatur Waktu:** `performance.now()` dengan presisi sub-milidetik (High-Resolution Timer)
- **Pengulangan:** Setiap operasi benchmark dijalankan minimal 3 kali pengulangan independen; angka yang dilaporkan adalah nilai **Median** beserta rentang Min–Max.

> [!IMPORTANT]
> **Klasifikasi Lingkungan Benchmark:**
> Angka-angka benchmark yang dilaporkan pada dokumen ini merupakan **benchmark performa engine di lingkungan runtime Node.js / V8**, bukan jaminan mutlak pengalaman pengguna di browser. Meskipun arsitektur komputasi DataWise dirancang untuk dieksekusi di Web Worker browser, perbedaan alokasi thread, garbage collection browser, dan kapabilitas grafis GPU pengguna dapat mempengaruhi latensi nyata.

---

## 3. Spesifikasi Fixture Sintetis Deterministik (QA-02A)

Fixture pengujian sintetis dihasilkan secara deterministik menggunakan generator bilangan acak semu (*Pseudo-Random Number Generator*) algoritma **Mulberry32** dengan seed tetap (`0x4D2A91` / `42` / `12345`), menjamin reproduktibilitas 100%:

| Parameter Fixture | Spesifikasi | Keterangan & Tujuan Pengujian |
|---|---|---|
| **Kolom 1 (`id`)** | String ber-leading zero (`"000001"`, `"000123"`) | Menguji preservasi identifier tanpa konversi tidak disengaja ke angka. |
| **Kolom 2 (`quantity`)** | Integer acak [-1.000 s/d 10.000] | Menguji operasi numerik diskrit dan nilai negatif. |
| **Kolom 3 (`price`)** | Float desimal presisi 2 angka [10.00 s/d 5010.00] | Menguji komputasi statistik kontinu dan histogram. |
| **Kolom 4 (`tier`)** | Kategorikal berbobot tidak merata: Bronze (50%), Silver (30%), Gold (15%), Platinum (5%) | Menguji agregasi Bar Chart, pengurutan frekuensi menurun, dan modus. |
| **Kolom 5 (`registered_date`)** | Format tanggal ISO `YYYY-MM-DD` | Menguji inferensi kronologis dan sorting tanggal. |
| **Kolom 6 (`status`)** | String kosong (`""` 10%), Dirty Whitespace (`"   "` 5%), Valid (`"Active"`) | Menguji kebijakan missing values, deteksi whitespace, dan imputasi. |
| **Kolom 7 (`sku`)** | Kategori kardinalitas tinggi (`"SKU_0001"` s/d `"SKU_4999"`) | Menguji ketahanan indeks pencarian dan pembatasan baris grouping. |
| **Kolom 8 (`description`)** | Teks deskripsi dengan simbol & Unicode (`"Data Spesial 🌟 Zürich"`) | Menguji preservasi multi-byte encoding dan token non-ASCII. |
| **Baris Duplikat Sengaja** | Tepat 2% dari total baris diduplikasi identik dari baris acak | Menguji deteksi duplikat `calculateDataQuality` dan pembersihan `DROP_DUPLICATES`. |

---

## 4. Hasil Benchmark Kinerja per Ukuran Data (QA-02A)

Tabel berikut menyajikan hasil median waktu eksekusi (dengan min–max) untuk seluruh 9 operasi pada 3 tingkatan dataset sintetis, dibandingkan langsung terhadap sasaran SLA PRD Bagian 5.5:

### Tabel Hasil Benchmark (3 Runs, Median)

| No | Operasi yang Diukur | Tier 2: 10.000 Baris (8 Kolom) | Tier 3: 25.000 Baris (8 Kolom) | Tier 4: 50.000 Baris (8 Kolom) | Target SLA PRD 5.5 | Evaluasi |
|:--:|---|:---:|:---:|:---:|:---:|:---:|
| **1** | **Parsing CSV** (*PapaParse*) | **12.37 ms**<br>(12.13 – 15.93 ms) | **28.48 ms**<br>(25.34 – 32.35 ms) | **60.11 ms**<br>(58.94 – 62.05 ms) | $\le 1.000\text{ ms}$ (10k)<br>$\le 2.500\text{ ms}$ (25k)<br>$\le 5.000\text{ ms}$ (50k) | **PASS** *(~80x lebih cepat)* |
| **2** | **Inferensi Tipe Kolom** (*Sampling 1k/col*) | **2.53 ms**<br>(1.29 – 5.56 ms) | **2.54 ms**<br>(1.68 – 2.62 ms) | **2.31 ms**<br>(1.79 – 2.48 ms) | Instan ($< 100\text{ ms}$) | **PASS** *(Konstan $O(1)$ sampling)* |
| **3** | **Kalkulasi Kualitas Data & Duplikat** | **12.28 ms**<br>(11.79 – 15.04 ms) | **31.22 ms**<br>(25.94 – 37.94 ms) | **59.48 ms**<br>(56.11 – 66.36 ms) | $< 500\text{ ms}$ | **PASS** |
| **4** | **Statistik Deskriptif** (13 metrik numerik) | **16.81 ms**<br>(11.65 – 22.42 ms) | **30.85 ms**<br>(27.68 – 44.61 ms) | **64.06 ms**<br>(64.02 – 74.38 ms) | $\le 600\text{ ms}$ (10k)<br>$\le 1.500\text{ ms}$ (25k)<br>$\le 3.500\text{ ms}$ (50k) | **PASS** *(~50x lebih cepat)* |
| **5** | **Data Grid: Search Global & Multi-type Sort** | **19.96 ms**<br>(19.85 – 25.84 ms) | **54.07 ms**<br>(53.80 – 57.41 ms) | **118.51 ms**<br>(117.67 – 124.95 ms) | $< 250\text{ ms}$ | **PASS** |
| **6** | **Recipe Cleaning Pipeline** (Trim + Dedup + Impute) | **30.11 ms**<br>(24.98 – 30.57 ms) | **73.41 ms**<br>(68.20 – 78.03 ms) | **141.96 ms**<br>(133.33 – 160.86 ms) | $< 1.000\text{ ms}$ | **PASS** |
| **7** | **Agregasi Grafik** (Histogram 15 Bins) | **0.77 ms**<br>(0.63 – 2.00 ms) | **1.75 ms**<br>(1.66 – 2.72 ms) | **3.51 ms**<br>(3.50 – 3.57 ms) | Instan ($< 100\text{ ms}$) | **PASS** |
| **8** | **Serialisasi Ekspor CSV** (UTF-8 BOM RFC 4180) | **8.17 ms**<br>(7.18 – 8.77 ms) | **17.85 ms**<br>(17.55 – 19.82 ms) | **35.99 ms**<br>(34.18 – 38.21 ms) | $< 500\text{ ms}$ | **PASS** |
| **9** | **Serialisasi Ekspor XLSX** (*SheetJS ArrayBuffer*) | **220.77 ms**<br>(178.34 – 223.36 ms) | **518.28 ms**<br>(475.29 – 537.73 ms) | **1.066.40 ms**<br>(1.020 – 1.160 ms) | $< 5.000\text{ ms}$ | **PASS** |

### Analisis Kinerja:
1. **Linearitas Skalabilitas:** Seluruh operasi menunjukkan kompleksitas waktu mendekati linear $O(N)$ terhadap jumlah baris. Operasi pemrosesan 50.000 baris selesai dalam rentang waktu yang sangat aman dari batas toleransi UI freeze (di bawah 150 ms untuk mayoritas komputasi analitik).
2. **Efisiensi Memori XLSX:** Pembuatan workbook XLSX pada 50.000 baris membutuhkan waktu $\sim 1.06\text{ detik}$ dan mengalokasikan buffer sekitar 8 MB tanpa menyebabkan lonjakan heap berlebihan atau memicu Out-of-Memory (OOM).

---

## 5. Hasil Verifikasi Edge Cases & Matriks Regresi (QA-02B)

Suite pengujian otomatis [`src/__tests__/edge-cases-regression.test.ts`](../../src/__tests__/edge-cases-regression.test.ts) memverifikasi **51 skenario kasus ekstrem** spesifik:

### A. Parsing & Ingestion (11 Kasus) — **PASS**
- **A.1:** File 0-byte ditolak dengan pesan baku PRD: *"File kosong (0 byte). Silakan periksa kembali berkas Anda."* (**PASS**)
- **A.2:** CSV hanya header menghasilkan peringatan PRD: *"File hanya berisi header tanpa baris data observasi. Analisis statistik tidak dapat dilakukan."* (**PASS**)
- **A.3:** Dataset satu baris observasi ($N=1$) diparsing utuh dengan skema kolom presisi. (**PASS**)
- **A.4:** Header duplikat diberi penomoran otomatis (`Nilai`, `Nilai_1`) oleh PapaParse dan header kosong `''` dipertahankan tanpa melempar error. (**PASS**)
- **A.5:** UTF-8 BOM (`\uFEFF`) tidak mencemari nama field kolom pertama (`kode` bukan `\uFEFFkode`). (**PASS**)
- **A.6:** Quoted field yang mengandung delimiter (koma, titik koma, tab) diparsing utuh sebagai satu sel. (**PASS**)
- **A.7:** Escaped quotes (`""`) di-unescape menjadi tanda kutip tunggal (`"`) dalam nilai sel. (**PASS**)
- **A.8:** Quoted field multiline (CRLF/LF) mempertahankan struktur newline tanpa memecah baris data. (**PASS**)
- **A.9:** Karakter Unicode non-ASCII (Kanji `田中太郎`, aksen `Amélie`, Arab `محمد`, Emoji `✨🌟`) diproses 100% utuh. (**PASS**)
- **A.10:** Ragged rows (baris tidak konsisten kolomnya) ditangani tanpa memutus parsing thread; kesalahan dicatat di metadata error. (**PASS**)
- **A.11:** Sel sangat panjang (> 5.000 karakter) diproses tanpa menyebabkan call-stack overflow. (**PASS**)

### B. Type Inference & Data Quality (8 Kasus) — **PASS**
- **B.1:** Kolom 100% kosong/null default ke tipe `Text` dengan skor keyakinan 100%. (**PASS**)
- **B.2:** Nilai `0` numerik dan boolean `false` **bukan** dianggap nilai kosong (`isNativeMissing(0) === false`, `isNativeMissing(false) === false`). (**PASS**)
- **B.3:** Dirty whitespace (`"   "`) dibedakan secara akurat dari string kosong murni (`""`). (**PASS**)
- **B.4:** Nilai numerik ber-leading zero (`"000123"`, `"0812345"`, NIK) diklasifikasikan sebagai `Text` identifier dengan peringatan format. (**PASS**)
- **B.5:** Format desimal titik (`123.45`) dan koma regional (`123,45`) terdeteksi sesuai aturan inferensi. (**PASS**)
- **B.6:** Tanggal dengan format ambigu (`05/06/2021`) dipertahankan sebagai `Text` sesuai mandat PRD FND-05. (**PASS**)
- **B.7:** Duplikat identik dan multi-occurrence dihitung akurat (`duplicateOccurrences` vs `rowsParticipatingInDuplicates`). (**PASS**)
- **B.8:** Profiling dataset 1 baris dan 1 kolom berjalan tanpa pembagian nol. (**PASS**)

### C. Statistik Deskriptif (9 Kasus) — **PASS**
- **C.1:** Dataset kosong ($N=0$) menghasilkan nilai `null` pada seluruh 13 metrik numerik. (**PASS**)
- **C.2:** Kolom berisi satu observasi ($N=1$): count=1, sum=x, mean=x, median=x, min=x, max=x, q1=x, q3=x, iqr=0, varians=null, std dev=null. (**PASS**)
- **C.3:** Kolom varians nol (nilai konstan identik $x_i = 50$ pada 500 baris): varians=0, std dev=0, mean=50, min=max=50, iqr=0. (**PASS**)
- **C.4:** Nilai negatif, nol, desimal presisi tinggi ($10^{-5}$), dan angka besar ($10^6$) dihitung stabil. (**PASS**)
- **C.5:** Nilai missing dikeluarkan dari pembagi rata-rata ($N$ hanya menghitung observasi valid). (**PASS**)
- **C.6:** Multimodal dengan ties menghasilkan array modus terurut menaik (misal `[1, 1, 2, 2, 3]` -> `mode = [1, 2]`). (**PASS**)
- **C.7:** Distribusi dengan seluruh nilai unik saat $N > 1$ mengembalikan `mode = null` ("Tidak Ada Modus"). (**PASS**)
- **C.8:** Invarian matematis terverifikasi konsisten: $\min \le Q_1 \le \text{Median} \le Q_3 \le \max$, $\text{IQR} = Q_3 - Q_1$, $\text{Varians} \ge 0$, dan $s = \sqrt{\text{Varians}}$. (**PASS**)
- **C.9:** Master tolerance floating-point $\text{atol} = 10^{-5}, \text{rtol} = 10^{-5}$ terpenuhi secara ketat. (**PASS**)

### D. Interactive Data Grid (9 Kasus) — **PASS**
- **D.1:** Query dataset kosong mengembalikan 0 baris tanpa exception. (**PASS**)
- **D.2:** Pencarian kata kunci tanpa kecocokan mengembalikan 0 baris cocok (`matchedRows = 0`). (**PASS**)
- **D.3:** Pencarian bersifat *case-insensitive* pada teks dan angka. (**PASS**)
- **D.4:** Multi-type sorting (Numeric, Text, Boolean, DateTime) mengurutkan nilai sesuai kaidah domain. (**PASS**)
- **D.5:** Invarian *Nulls Last*: Nilai missing selalu diletakkan di akhir dataset terurut, baik pada pengurutan ASC maupun DESC. (**PASS**)
- **D.6:** Stabilitas sorting: Baris dengan nilai sama mempertahankan urutan indeks asli baris (`_index`). (**PASS**)
- **D.7:** Seluruh operator filter (`gt`, `lt`, `equals`, `contains`, `startsWith`, `endsWith`, `isEmpty`, `isNotEmpty`) berfungsi presisi. (**PASS**)
- **D.8:** Kombinasi pencarian global dengan multi-column filters beroperasi secara konsisten (*AND logic*). (**PASS**)
- **D.9:** Batas windowing virtual (offset 0, offset mendekati akhir, offset di luar rentang) terlindungi. (**PASS**)

### E. Cleaning Recipe Engine (6 Kasus) — **PASS**
- **E.1:** Recipe kosong (0 langkah) mengembalikan dataset yang 100% identik dengan snapshot mentah tanpa termutasi. (**PASS**)
- **E.2:** Semua baris terhapus oleh `DROP_MISSING` menghasilkan 0 baris dengan skema kolom tetap utuh. (**PASS**)
- **E.3:** Target kolom tidak valid melempar error deskriptif tanpa meninggalkan mutasi parsial. (**PASS**)
- **E.4:** Imputasi pada kolom dengan 0 observasi valid (100% missing) ditolak secara aman (*"Seluruh observasi kosong (N = 0)"*). (**PASS**)
- **E.5:** Penghapusan langkah di tengah Recipe Log memicu evaluasi ulang pipeline secara deterministik dari snapshot asli. (**PASS**)
- **E.6:** Live preview langkah (`previewRecipeStep`) tidak pernah memutasi data asli sebelum langkah diterapkan. (**PASS**)

### F. Visualization & Export Studio (9 Kasus) — **PASS**
- **F.1:** Histogram pada data varians nol menghasilkan 1 bin tunggal tanpa galat pembagian nol. (**PASS**)
- **F.2:** Jumlah bin histogram di-clamp secara aman antara batas minimum 2 dan maksimum 50. (**PASS**)
- **F.3:** Bar Chart dengan kategori $> 20$ mengelompokkan kategori berlebih secara transparan ke dalam `(Lainnya - N kategori)`. (**PASS**)
- **F.4:** Visual sampling transparan pada Line Chart ($N > 2.000$) dan Scatter Plot ($M > 2.500$) dengan disclosure badge observasi total vs terplot. (**PASS**)
- **F.5:** Sanitasi nama worksheet Excel (.xlsx) memotong panjang $> 31$ karakter dan mengganti karakter terlarang (`\ / ? * [ ] :`) menjadi `_`. (**PASS**)
- **F.6:** Ekspor CSV pada dataset 0 baris mempertahankan baris header kolom. (**PASS**)
- **F.7:** Ekspor XLSX pada dataset 0 baris menghasilkan worksheet dengan header valid. (**PASS**)
- **F.8:** Verifikasi round-trip pembacaan kembali berkas ekspor CSV via PapaParse dan XLSX via SheetJS cocok 100% pada karakter Unicode, leading zero, dan tanda kutip. (**PASS**)
- **F.9:** Penanganan Formula Injection pada CSV: Tidak memanipulasi teks formula secara diam-diam (sesuai RFC 4180), risiko terdokumentasi eksplisit. (**PASS**)

---

## 6. Temuan, Perbaikan Regresi, & Catatan Keamanan

### A. Penyelarasan Nama Metrik & Kontrak Tipe
- **Temuan:** Pada pengujian Scatter Plot sampling, pengujian memanggil `scatterRes.totalPoints`, sedangkan antarmuka tipe domain `ScatterPlotResult` menggunakan properti `totalPairs`.
- **Perbaikan:** Menyelaraskan assertion pengujian ke kontrak tipe domain `totalPairs` yang sesungguhnya.
- **Temuan:** Pada `previewRecipeStep` untuk `TRIM_WHITESPACE`, dampak diukur per sel (`impactedCells`), bukan baris (`impactedRows = 0`).
- **Perbaikan:** Menyesuaikan assertion pengujian ke properti `impactedCells`.

### B. Kebijakan Formula Injection pada CSV (RFC 4180)
- **Kondisi:** Pengguna mengekspor data yang mengandung karakter awal seperti `=`, `+`, `-`, `@`.
- **Perilaku Implementasi:** DataWise mengekspor string sesuai standar **RFC 4180 murni**, tanpa menambahkan tanda petik tunggal (`'`) di depan karakter formula secara diam-diam. Hal ini mencegah kerusakan integritas data saat file dibuka oleh parser programmatic (Python/Pandas/R).
- **Risiko Keamanan Pengguna:** Jika pengguna membuka file CSV hasil ekspor di Microsoft Excel versi lama tanpa perlindungan DDE, Excel berpotensi mengeksekusi rumus tersebut.
- **Rekomendasi:** Format ekspor default XLSX lebih direkomendasikan untuk pengguna Microsoft Excel karena cell types dikodekan secara biner (string type `'s'`), sehingga karakter formula tidak dieksekusi sebagai rumus aktif.

---

## 7. Batasan Pemeriksaan Browser Automation

Sesuai instruksi tugas dan temuan dari QA-01:
- **Status Otomasi Browser Playwright:** **INCONCLUSIVE**.
- **Penyebab Teknis:** Di dalam lingkungan AI sandbox lokal yang terisolasi tanpa akses internet terbuka ke Azure CDN, instalasi biner Playwright driver (`playwright-1.57.0-win32_x64.zip`) mengembalikan respons `404 Not Found`.
- **Verifikasi Lokal yang Telah Terlaksana:**
  1. Server aplikasi Next.js aktif di `http://localhost:3000` dan mengembalikan respons HTTP 200 OK.
  2. Kompilasi build produksi statis (`output: 'export'`) terbukti bersih (10/10 halaman statis).
  3. Seluruh logika komponen React, rendering DOM, empty state, dan routing terverifikasi melalui SSR/DOM test suites.
- **Langkah Manual yang Disarankan untuk Pengguna di Chrome/Edge DevTools:**
  1. Buka `http://localhost:3000` di Google Chrome atau Microsoft Edge.
  2. Buka DevTools (`F12`), masuk ke tab **Performance**, rekam profil penelusuran selama scrolling cepat di halaman `/dataset` pada dataset 25.000 atau 50.000 baris untuk memverifikasi frame rate 60 FPS dan ketiadaan long tasks (> 50 ms).
  3. Buka tab **Memory**, ambil Heap Snapshot sebelum dan sesudah ekspor XLSX untuk memverifikasi pelepasan memori Blob (`URL.revokeObjectURL`).

---

## 8. Ringkasan Perintah & Validasi Akhir

| Perintah | Jumlah / Target | Hasil Aktual | Status |
|---|---|---|---|
| `npm test` | 292 pengujian, 65 test suites | **292 Pass, 0 Fail** (Durasi: ~5.7s) | **PASS** |
| `npm run typecheck` | `tsc --noEmit` (strict) | **0 Errors** | **PASS** |
| `npm run lint` | ESLint (Next.js config) | **0 Errors, 7 Warnings** (Warning warisan sebelumnya) | **PASS** |
| `npm run build` | Next.js Static Export | **10/10 Halaman Statis Prerendered** | **PASS** |

### Berkas yang Dibuat / Diperbarui pada QA-02:
1. `src/__tests__/benchmark.test.ts` *(Baru)* — 30 pengujian benchmark otomatis pada 10k, 25k, 50k baris.
2. `src/__tests__/edge-cases-regression.test.ts` *(Baru)* — 51 pengujian kasus ekstrem dan regresi matematis/pipeline.
3. `scripts/benchmark-runner.ts` *(Baru)* — Runner benchmark independen dengan pelaporan median dan min–max.
4. `package.json` *(Diperbarui)* — Menambahkan suite pengujian baru ke script `npm test`.
5. `docs/qa/QA-02-BENCHMARK-EDGE-CASES.md` *(Baru)* — Laporan komprehensif audit performa dan regresi.
6. `docs/IMPLEMENTATION_STATUS.md` *(Diperbarui)* — Memperbarui status TASK-QA-02 menjadi `Reported Complete (PASS: Engine & Regression / INCONCLUSIVE: Physical Browser)`.

---

## 9. Rekomendasi Tahap Berikutnya

Dengan selesainya **TASK-QA-02**, mesin DataWise telah terbukti stabil, akurat menangani kasus batas ekstrem, dan memenuhi seluruh target waktu komputasi PRD Section 5.5.

Tahap berikutnya yang siap dijalankan adalah:
- **TASK-QA-03: Statistical Accuracy & Gold Standard Verification** (validasi akurasi numerik terhadap dataset acuan Iris, Titanic, dan perbandingan ground truth Python NumPy/Pandas).

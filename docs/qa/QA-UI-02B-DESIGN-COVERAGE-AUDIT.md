# DataWise — Design Coverage Audit & Final Premium Polish (TASK-UI-02B)

**Task ID:** TASK-UI-02B  
**Target Acuan:** PRD Versi 1.1.0-REVISED, Design System DataWise, Standar Aksesibilitas WCAG AA  
**Tanggal Eksekusi:** 12 Oktober 2026  
**Auditor:** Antigravity Autonomous Design & QA Subsystem  
**Status Keseluruhan:** **VERIFIED & AUDITED (Automated Regression PASS, User Manual PASS, Browser Agent INCONCLUSIVE)**

---

## 1. Ringkasan Eksekutif & Status Audit

Audit ini merupakan tindak lanjut langsung dari **TASK-UI-02** untuk memvalidasi secara objektif seluruh cakupan desain (*design coverage*), menyelaraskan hierarki tipografi semantik, memastikan konsistensi ikonografi `lucide-react`, serta menyempurnakan interaksi dan responsivitas antarmuka di seluruh 8 rute resmi DataWise.

### Status Validasi Perintah Otomatis

| Perintah Validasi | Kode Keluar | Hasil Aktual | Catatan |
|---|:---:|---|---|
| `npm test` | `0` | **392/392 passed** (100% Pass Rate) | 103 test suites selesai dalam 6,2s tanpa ada test/assertion yang diubah atau dilonggarkan. |
| `npm run typecheck` | `0` | **0 errors** | `tsc --noEmit` sukses pada TypeScript strict mode. |
| `npm run lint` | `0` | **0 errors**, 5 warnings | 5 warning berasal dari variabel mock pada file test lawas (`data-quality.test.ts`, `dataset-overview.test.ts`, `descriptive-statistics-ui.test.ts`). |
| `npm run build` | `0` | **11/11 static pages prerendered** | Bundler worker mandiri (`bundle-worker.mjs`) & Next.js static export (`output: 'export'`) sukses. |

### Status Verifikasi Visual Browser

| Metode Verifikasi | Status | Keterangan & Dasar Objektif |
|---|:---:|---|
| **Otomasi Agen Browser (Playwright / Puppeteer)** | **INCONCLUSIVE** | Binary driver Playwright tidak dapat diunduh pada lingkungan sandbox offline (CDN 404). Status otomatis dicatat secara jujur sebagai `INCONCLUSIVE` tanpa klaim semu. |
| **Verifikasi Manual Pengguna (Fisik Browser)** | **PASS** *(Reported by User)* | Pengguna telah menguji langsung 8 skenario utama di browser fisik (Chrome/Edge): Ingestion CSV/Excel, Steam-200k tanpa header, Insight Dataset, Profiling, Analisis Deskriptif, Siklus Pembersihan, Visualisasi PNG, Ekspor CSV/XLSX, dan inspeksi DevTools Network (0 request). |

---

## 2. Temuan Awal Konkret: Realitas Source Code vs Klaim Dokumentasi

Sebelum melakukan perbaikan terarah, audit memeriksa langsung implementasi aktual di kode sumber dan membandingkannya dengan catatan dokumentasi sebelumnya:

1. **Keluarga Font & Font Bundling:**
   - *Klaim Terdahulu:* Menyebut font dimuat lokal secara offline.
   - *Realitas Kode Sumber:* `src/app/layout.tsx` mengonfigurasi `next/font/google` (`Geist` dan `Geist_Mono`) dengan variabel CSS `--font-geist-sans` dan `--font-geist-mono`. Saat proses `npm run build` (Next.js static export), Next.js secara otomatis mengunduh dan menanamkan aset font ke direktori lokal internal (`.next/static/media/`), sehingga saat aplikasi dijalankan secara runtime tidak ada permintaan jaringan eksternal (0 CDN calls). CSS `src/app/globals.css` juga menyediakan fallback sistem komprehensif (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`). Tidak ditemukan file `.ttf`/`.woff2` tersendiri di direktori `public/fonts/`.
2. **Hierarki Judul Semantik `<h1>` pada Halaman Kosong (Empty States):**
   - *Klaim Terdahulu:* Menyebut seluruh 8 halaman telah memiliki judul semantik `<h1>`.
   - *Realitas Kode Sumber:* Pada kondisi dataset aktif, kedelapan halaman memang memiliki `<h1>`. Namun, ketika dataset belum dimuat (empty states), beberapa komponen menggunakan elemen `<h3>` atau `<h2>` sebagai judul utama modul:
     - `/dataset` (`DataGrid.tsx`): Menampilkan `<h3 className="...">Data Explorer</h3>` saat empty state.
     - `/insight` (`DatasetIntelligenceView.tsx`): Menampilkan `<h3>` saat empty state dan `<h2>` saat loading state.
     - `/profiling` (`profiling/page.tsx`): Menampilkan `<h3 className="...">Profiling & Kualitas Data</h3>` saat empty state.
     - `/analisis` (`DescriptiveStatistics.tsx`): Menampilkan `<h3 className="...">Statistik Deskriptif</h3>` saat empty state.
     - `/pembersihan` (`pembersihan/page.tsx`): Menampilkan `<h3>` saat empty state.
     - `/visualisasi` & `/ekspor`: Menggunakan `text-2xl` alih-alih skala `text-xl sm:text-2xl`.
   - *Tindakan Perbaikan:* Seluruh judul modul pada empty, loading, dan active states distandarisasi ke semantik `<h1>` dengan ukuran kelas token `text-xl sm:text-2xl font-bold tracking-tight text-slate-900`.
3. **Ikonografi & Karakter Simbol UI:**
   - *Klaim Terdahulu:* Semua tombol UI menggunakan ikon `lucide-react`.
   - *Realitas Kode Sumber:* Pada `src/components/ExportStudio.tsx`, tombol penutup notifikasi sukses dan error menggunakan karakter teks mentah `×` alih-alih komponen ikon `X` dari `lucide-react`.
   - *Tindakan Perbaikan:* Karakter teks diganti dengan `<X className="h-4 w-4" />` dari `lucide-react` dengan styling transisi dan focus ring yang selaras.
4. **Accessible Name pada Kontrol Ikon Responsif:**
   - *Realitas Kode Sumber:* Pada `src/components/DatasetIntelligenceView.tsx`, tombol *Analisis Ulang* menyembunyikan label teks pada layar ponsel (`<span className="hidden sm:inline">Analisis Ulang</span>`). Tombol ini hanya memiliki atribut `title` tanpa atribut `aria-label`.
   - *Tindakan Perbaikan:* Menambahkan `aria-label="Analisis Ulang Dataset"` eksplisit agar memenuhi standar aksesibilitas pembaca layar (screen reader).
5. **Tipografi Angka Tabular pada Kartu Metrik Ringkasan:**
   - *Realitas Kode Sumber:* Pada `src/components/DatasetOverview.tsx`, komponen `MetricCard` menerapkan `text-3xl font-extrabold font-mono tabular-nums` secara seragam untuk seluruh nilai. Saat kartu menampilkan status teks seperti `"Struktur Valid"` atau `"Peringatan Struktural"`, ukuran teks 3xl mono menyebabkan teks terlalu padat dan berisiko terpotong pada viewport ponsel (375px).
   - *Tindakan Perbaikan:* Menambahkan deteksi dinamis nilai numerik vs tekstual pada `MetricCard` di `DatasetOverview.tsx` dan `src/components/common/MetricCard.tsx`. Nilai numerik mempertahankan `text-3xl font-extrabold font-mono tabular-nums`, sedangkan nilai status tekstual menggunakan `text-xl font-bold font-sans` yang proporsional dan elegan.
6. **Penomoran Baris Tabel Data:**
   - *Realitas Kode Sumber:* Pada `src/components/DataGrid.tsx`, kolom nomor urut baris sticky kiri menggunakan `font-mono text-[11px]`, namun belum menyertakan `tabular-nums`.
   - *Tindakan Perbaikan:* Ditambahkan `tabular-nums` untuk memastikan seluruh angka (misal `1` s/d `200.000`) memiliki lebar glif yang presisi dan sejajar vertikal secara sempurna.

---

## 3. Matriks Cakupan Desain Delapan Halaman Kerja (Design Coverage Matrix)

Matriks berikut mengevaluasi kesesuaian visual, struktural, dan interaksi pada kedelapan rute resmi DataWise:

| Rute & Halaman | Tipografi & Font | Ikonografi (`lucide-react`) | Hierarki Warna & Kontras | Spacing & Grid | Kontrol & Formulir | Tabel / Grafik | Responsivitas (1440/1024/768/375) | Status Visual (Loading/Empty/Error/Success) |
|---|---|---|---|---|---|---|---|---|
| **1. Beranda & Upload (`/`)** | Geist Sans, H1 semantik, font-mono untuk file metadata & baris. | `BrandMark` orisinal, `FolderOpen`, `UploadCloud`, `ShieldCheck`, `Sparkles`. | Deep Steel Teal `#0F766E` aksen utama, slate-50/70 surface subtle. | Spacing 24px (`space-y-6`), kartu grid alur kerja 3-kolom. | Toggle button struktur baris pertama, file picker button, select delimiter. | Overview 4-kartu metrik adaptif (angka 3xl mono, status text-xl). | Beradaptasi rapi: 1 kolom (375px), 2 kolom (768px), 3-4 kolom (1024-1440px). | Ingestion warning size, sheet picker, loading progress baris, empty state informatif. |
| **2. Dataset Explorer (`/dataset`)** | Geist Sans, H1 semantik Data Explorer, tabular numerals pada sel & nomor baris. | `Table2`, `Search`, `Filter`, `ArrowUpDown`, `RotateCcw`, `Plus`, `X`. | Border halus `border-slate-200/80`, chip amber untuk override kolom. | Toolbar pencarian presisi, drawer filter animasi slide-in. | Input pencarian global, dropdown operator filter, dropdown override tipe data. | Virtual windowing 40px row height, sticky header & sticky row index, null pill. | Tabel `overflow-x-auto` terlindungi, drawer collapse di mobile, scroll horizontal aman. | Empty state tanpa dataset ber-H1, search no-match state ber-reset, loading chunk indicator. |
| **3. Insight Dataset (`/insight`)** | Geist Sans, H1 semantik Insight Dataset, monospace untuk ID kolom. | `Sparkles`, `ShieldCheck`, `RefreshCw`, `Fingerprint`, `Boxes`, `Tag`, `Calendar`. | Palette semantik: Violet (ID), Teal (Kategori), Amber (Tanggal), Sky (Metrik). | Grid 2-kolom temuan penting, kartu rekomendasi 3-kolom fleksibel. | Tombol Analisis Ulang ber-aria-label, tautan modul terarah. | Tabel profil semantik kolom dengan badge tipe dan rasio keunikan persentase. | Tabel `overflow-x-auto`, grid beralih ke 1-kolom di tablet/mobile. | Empty state ramah pengguna ber-H1, spinner evaluasi pola lokal, retry state bila gagal. |
| **4. Profiling Data (`/profiling`)** | Geist Sans, H1 semantik Profiling & Kualitas Data, angka tabular pada N/Missing. | `ShieldCheck`, `FileSpreadsheet`, `Table2`, `Hash`, `Eraser`, `Copy`, `FileDigit`. | Emerald (Kelengkapan 100%), Amber (Whitespace/Warning), Rose (Critical). | Hero Skor Integritas, 4 kartu diagnostik terstruktur, tabel skema kolom. | Retry button saat terjadi error kalkulasi worker. | Tabel audit integritas per kolom dengan micro progress bar visual. | Scroll horizontal tabel skema terlindungi, 4 kartu menyesuaikan 1-2-4 kolom. | Empty state ber-H1, loading skeleton per kartu, progress kelengkapan data dinamis. |
| **5. Analisis Deskriptif (`/analisis`)** | Geist Sans, H1 semantik Statistik Deskriptif, monospace presisi 4 desimal. | `Sigma`, `BarChart3`, `ArrowUpDown`, `X`, `HelpCircle`, `RefreshCw`. | Slate-900 judul & angka, Slate-500 deskripsi, Teal aksen tab aktif. | Summary ribbon, kartu tabel sticky header & first column. | Tab switcher (Numerik/Kategorikal), Transpose toggle button, modal viewer. | Tabel 13 metrik numerik (Bessel, Type-7, Multimodal), modal distribusi kategori. | Table `overflow-x-auto` mandiri, modal terpusat dengan max-height 85vh. | Empty state ber-H1, loading skeleton 4-baris, error state ber-tombol coba lagi. |
| **6. Pembersihan Data (`/pembersihan`)** | Geist Sans, H1 semantik Pembersihan Data, font-mono pada counter recipe. | `Eraser`, `Scissors`, `Sparkles`, `Split`, `Tag`, `Check`, `RotateCcw`, `Layers`. | Pembeda tegas: Blue/Teal (Preview), Emerald (Applied), Rose (Reset/Drop). | Split grid 12-kolom (8 konfigurasi : 4 recipe timeline log). | Radio parameter imputasi, form rename kolom, tombol aksi dengan spinner. | Tabel pratinjau 5 baris pertama dengan badge tipe data. | Layout split collapse bertumpuk pada mobile (< 1024px), dialog konfirmasi responsif. | Empty state ber-H1, timeline log recipe kosong informatif, dialog reset ber-ESC. |
| **7. Visualisasi Data (`/visualisasi`)** | Geist Sans, H1 semantik Visualisasi Data, angka tabular pada tooltip grafik. | `BarChart3`, `Activity`, `CircleDot`, `TrendingUp`, `Download`, `ShieldCheck`. | Palet Okabe-Ito beraksen Deep Steel Teal, gridlines netral halus `#F1F5F9`. | Split grid 12-kolom (4 kontrol : 8 kanvas visualisasi). | Tombol pemilih 4 grafik 2x2, select sumbu X/Y, slider bins sinkron, tombol download PNG. | Recharts responsif: Bar Chart (-25° label), Histogram (-30°), Line Chart, Scatter. | Area kanvas `ResponsiveContainer` 100% lebar, split beralih ke 1 kolom di mobile. | Empty state ber-H1, canvas loading overlay, feedback sukses "Tersimpan!", error alert. |
| **8. Ekspor Dataset (`/ekspor`)** | Geist Sans, H1 semantik Ekspor Dataset, font-mono nama file & schema chips. | `Download`, `FileSpreadsheet`, `FileText`, `CheckCircle2`, `ShieldCheck`, `X`. | Deep Steel Teal ring pada format aktif, emerald feedback pill, rose alert. | Split grid 12-kolom (7 konfigurasi : 5 ringkasan berkas sticky). | Radio kartu format CSV vs XLSX, input nama file, delimiter select, BOM checkbox. | Sticky summary card dengan chip skema kolom terpilih dan rincian baris. | Split beralih ke vertikal pada tablet/ponsel, tombol unduh lebar penuh. | Empty state ber-H1, spinner ekspor worker, banner sukses ber-dismiss Lucide X. |

---

## 4. Rincian Perbaikan yang Dilakukan pada TASK-UI-02B

### A. Tipografi dan Hierarki Heading Semantik
1. **Standardisasi H1 di Seluruh Halaman dan Status:**
   - [`src/components/DataGrid.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DataGrid.tsx): Mengubah heading empty state dari `<h3>` menjadi `<h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Data Explorer</h1>`.
   - [`src/components/DatasetIntelligenceView.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DatasetIntelligenceView.tsx): Mengubah heading empty state dari `<h3>` dan loading state dari `<h2>` menjadi `<h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Insight Dataset</h1>`.
   - [`src/app/profiling/page.tsx`](file:///c:/Antigravity%20Project/DataWise/src/app/profiling/page.tsx): Mengubah heading empty state dari `<h3>` menjadi `<h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Profiling & Kualitas Data</h1>`.
   - [`src/components/DescriptiveStatistics.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DescriptiveStatistics.tsx): Mengubah heading empty state dari `<h3>` menjadi `<h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Statistik Deskriptif</h1>`.
   - [`src/app/pembersihan/page.tsx`](file:///c:/Antigravity%20Project/DataWise/src/app/pembersihan/page.tsx): Mengubah heading empty state dari `<h3>` menjadi `<h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Pembersihan Data</h1>`.
   - [`src/components/VisualizationStudio.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/VisualizationStudio.tsx): Menyelaraskan heading empty state dan active state menjadi token konsisten `<h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Visualisasi Data</h1>`.
   - [`src/components/ExportStudio.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/ExportStudio.tsx): Menyelaraskan heading empty state dan active state menjadi token konsisten `<h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Ekspor Dataset</h1>`.
2. **Tabular Numerals pada Data Numerik:**
   - Menambahkan `tabular-nums` pada sel nomor urut baris DataGrid (`DataGrid.tsx`) untuk memastikan perataan vertikal sempurna angka multi-digit.
   - Mengadaptasi komponen `MetricCard` di [`src/components/DatasetOverview.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DatasetOverview.tsx) dan [`src/components/common/MetricCard.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/common/MetricCard.tsx): Nilai numerik disajikan dengan `font-mono tabular-nums text-3xl font-extrabold`, sedangkan nilai teks status disajikan dengan `text-xl font-bold font-sans` sehingga tidak memicu overflow horizontal pada layar sempit.

### B. Standardisasi Ikonografi dan Aksesibilitas
1. **Penggantian Simbol Karakter dengan Lucide Icons:**
   - Pada [`src/components/ExportStudio.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/ExportStudio.tsx), mengganti tombol penutup teks `×` pada alert notifikasi sukses dan error dengan komponen `<X className="h-4 w-4" />` dari `lucide-react` lengkap dengan focus rings `focus-visible:ring-2`.
2. **Accessible Labels pada Kontrol Ikon:**
   - Pada [`src/components/DatasetIntelligenceView.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DatasetIntelligenceView.tsx), menambahkan atribut `aria-label="Analisis Ulang Dataset"` pada tombol refresh header yang teksnya tersembunyi pada tampilan mobile.
3. **Penyempurnaan Keyboard Navigation:**
   - Memastikan dialog konfirmasi Reset ke Data Asli pada [`src/components/DataCleaningStudio.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DataCleaningStudio.tsx) dan modal distribusi frekuensi kategori pada [`src/components/DescriptiveStatistics.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DescriptiveStatistics.tsx) merespons tombol `Escape` untuk penutupan cepat tanpa mouse.

---

## 5. Ringkasan File yang Dimodifikasi

| Berkas | Alasan Perubahan |
|---|---|
| [`src/components/DataGrid.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DataGrid.tsx) | Standardisasi heading empty state ke semantik `h1` dan penambahan `tabular-nums` pada sel nomor urut baris. |
| [`src/components/DatasetIntelligenceView.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DatasetIntelligenceView.tsx) | Standardisasi heading empty state & loading state ke semantik `h1`, penambahan `aria-label` pada tombol refresh. |
| [`src/app/profiling/page.tsx`](file:///c:/Antigravity%20Project/DataWise/src/app/profiling/page.tsx) | Standardisasi heading empty state ke semantik `h1`. |
| [`src/components/DescriptiveStatistics.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DescriptiveStatistics.tsx) | Standardisasi heading empty state ke semantik `h1`. |
| [`src/app/pembersihan/page.tsx`](file:///c:/Antigravity%20Project/DataWise/src/app/pembersihan/page.tsx) | Standardisasi heading empty state ke semantik `h1`. |
| [`src/components/VisualizationStudio.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/VisualizationStudio.tsx) | Penyelarasan ukuran heading empty state & active state ke skala token `text-xl sm:text-2xl font-bold tracking-tight`. |
| [`src/components/ExportStudio.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/ExportStudio.tsx) | Penyelarasan ukuran heading, import ikon `X` dari `lucide-react` untuk menggantikan karakter teks `×` pada alert dismiss. |
| [`src/components/DatasetOverview.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/DatasetOverview.tsx) | Adaptasi ukuran dan font family `MetricCard` agar teks status tidak overflow pada viewport sempit. |
| [`src/components/common/MetricCard.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/common/MetricCard.tsx) | Penambahan deteksi numerik adaptif untuk tabular monospace pada nilai angka. |
| [`docs/design/DESIGN-SYSTEM.md`](file:///c:/Antigravity%20Project/DataWise/docs/design/DESIGN-SYSTEM.md) | Pembaruan dokumentasi spesifikasi tipografi, standardisasi heading di semua state, dan audit konsistensi. |
| [`docs/IMPLEMENTATION_STATUS.md`](file:///c:/Antigravity%20Project/DataWise/docs/IMPLEMENTATION_STATUS.md) | Pencatatan status penyelesaian TASK-UI-02B dan hasil audit cakupan desain. |

---

## 6. Checklist Verifikasi Manual Tampilan Antarmuka

Langkah-langkah berikut dapat dijalankan secara langsung di browser desktop (Google Chrome atau Microsoft Edge) pada server lokal `http://localhost:3000`:

1. **Pemeriksaan Tipografi & Heading (Semua Rute):**
   - Buka rute `/`, `/dataset`, `/insight`, `/profiling`, `/analisis`, `/pembersihan`, `/visualisasi`, dan `/ekspor` saat belum ada dataset.
   - Buka DevTools (`F12`), periksa elemen judul utama: pastikan setiap halaman memiliki satu tag `<h1>` berukuran `text-xl sm:text-2xl font-bold text-slate-900 tracking-tight`.
   - Unggah berkas CSV (misal: `sample-cleaning.csv` atau dataset demonstrasi Iris), periksa kembali judul utama saat dataset aktif: pastikan seluruh halaman tetap memiliki `<h1>` yang konsisten.
2. **Pemeriksaan Angka Tabular (Tabular Figures):**
   - Di halaman `/dataset`, periksa kolom nomor baris paling kiri (`#`): pastikan angka sejajar rapi secara vertikal saat discroll.
   - Di halaman `/`, periksa kartu metrik `Jumlah Baris` dan `Jumlah Kolom`: pastikan angka menggunakan font monospace tabular (`tabular-nums font-mono`).
   - Di halaman `/analisis`, periksa nilai Mean, Median, Std Dev: pastikan angka desimal 4 digit sejajar rapi di sebelah kanan tabel.
3. **Pemeriksaan Ikon & Tombol Aksi:**
   - Di halaman `/insight`, kecilkan jendela browser ke ukuran ponsel (< 640px). Pastikan tombol *Analisis Ulang* di kanan atas menampilkan ikon `RefreshCw` dengan tooltip dan pembaca layar membaca `aria-label="Analisis Ulang Dataset"`.
   - Di halaman `/ekspor`, lakukan ekspor CSV. Saat notifikasi hijau muncul, periksa tombol silang penutup: pastikan menggunakan ikon SVG vektor `X` yang rapi (bukan karakter teks mentah `×`).
4. **Pemeriksaan Responsivitas Multi-Breakpoint:**
   - Aktifkan Device Mode di DevTools (`Ctrl+Shift+M`):
     - **375 px (Ponsel):** Pastikan tombol navigasi mobile di pojok kiri bawah (48x48px) membuka drawer samping dengan mulus; tabel data di `/dataset` dan `/profiling` dapat digeser secara horizontal tanpa merusak layout luar body.
     - **768 px (Tablet):** Pastikan grid 2-kolom pada ringkasan dataset dan panel kontrol visualisasi tertata proporsional.
     - **1024 px (Laptop):** Pastikan sidebar terbuka normal dan area workspace split (12-kolom) pada Pembersihan, Visualisasi, dan Ekspor tampil seimbang.
     - **1440 px (Desktop Lebar):** Pastikan area konten dibatasi maksimal `1400px` di tengah layar dengan margin yang seimbang dan tidak renggang berlebihan.
5. **Pemeriksaan Keyboard Accessibility (ESC Handler):**
   - Di halaman `/analisis`, klik tautan *"Lihat Distribusi"* pada kolom kategorikal untuk membuka modal. Tekan tombol `Escape` pada keyboard: pastikan modal langsung tertutup.
   - Di halaman `/pembersihan`, klik *"Reset ke Data Asli"* saat ada recipe aktif untuk memunculkan dialog konfirmasi. Tekan tombol `Escape`: pastikan dialog tertutup seketika.

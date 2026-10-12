# DataWise — Visual Design System & Brand Identity Specification

Dokumen ini mendefinisikan sistem desain resmi, identitas merek, token visual, dan panduan komponen untuk **DataWise**, platform analisis dan pembersihan dataset lokal berbasis browser.

---

## 1. Brand Concept & Art Direction

### Karakter Merek
- **Intelligent**: Memberikan visual data yang presisi, informatif, dan tajam.
- **Precise**: Menghargai akurasi numerik dan integritas struktural dataset.
- **Calm**: Palet warna yang tenang dan tidak melelahkan mata pengguna saat menganalisis tabel data besar.
- **Trustworthy**: Menekankan privasi data lokal (*zero-server data transmission*).
- **Premium**: Estetika modern setara produk SaaS analitik kelas atas tanpa efek dekoratif berlebihan.
- **Data-focused**: Tipografi tabular, perataan konsisten, dan hierarki informasi yang jernih.

### Arah Visual (Anti-AI-Slop)
- Menghindari gradien neon, ungu dominan, dan efek *glassmorphism* berlebihan.
- Menghindari *hero banner* raksasa yang mendorong area kerja ke bawah layar.
- Menghindari data *placeholder* atau metrik palsu.
- Menghindari emoji pengganti ikon produk profesional.

---

## 2. Logo System & Brand Assets

Simbol DataWise dirancang dari bentuk geometris orisinal: **Insight Prism & DW Monogram**. Simbol ini menyatukan konsep lengkungan data (*D*), pondasi keahlian (*W*), dan vektor wawasan yang menanjak ke kanan atas (*insight vector*).

### Struktur Facet Geometris (ViewBox 0 0 100 100)
1. **Facet 1 (Top-Right Insight Arrow)**: `#0D9488` (Vibrant Teal) — Vektor wawasan menanjak.
2. **Facet 2 (Top-Left Data Arc)**: `#0F766E` (Deep Steel Teal) — Lengkungan jangkar huruf D.
3. **Facet 3 (Lower-Left Foundation)**: `#115E59` (Deep Slate Teal) — Pondasi dasar huruf W.
4. **Facet 4 (Lower-Right Dimension)**: `#14B8A6` (Luminous Facet) — Refleksi dimensi data.
5. **Apex Dot**: `(84, 24)` dengan warna `#5EEAD4` — Titik fokus puncak insight.

### Varian Logo & Aset Repositori
- **Brand Mark (SVG)**: [`public/brand/datawise-mark.svg`](file:///c:/Antigravity%20Project/DataWise/public/brand/datawise-mark.svg)
- **Horizontal Lockup (SVG)**: [`public/brand/datawise-logo.svg`](file:///c:/Antigravity%20Project/DataWise/public/brand/datawise-logo.svg)
- **Compact Icon (SVG)**: [`public/brand/compact-icon.svg`](file:///c:/Antigravity%20Project/DataWise/public/brand/compact-icon.svg)
- **Favicon & App Icon**: [`public/brand/favicon.svg`](file:///c:/Antigravity%20Project/DataWise/public/brand/favicon.svg)
- **Komponen React**: [`src/components/brand/DataWiseLogo.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/brand/DataWiseLogo.tsx)
  - `<BrandMark size={24} />`: Simbol vektor mandiri.
  - `<CompactIcon size={20} />`: Ikon ringkas untuk dimensi kecil.
  - `<BrandWordmark />`: Tipografi "Data" (Slate-900) + "Wise" (Teal-700).
  - `<DataWiseLogo collapsed={false} />`: Lockup horizontal untuk sidebar terbuka.
  - `<DataWiseLogo collapsed={true} />`: Compact mark untuk sidebar terlipat.

---

## 3. Palet Warna & Token Desain

| Kategori Token | CSS Variable | Hex Code | Deskripsi Penggunaan |
| :--- | :--- | :--- | :--- |
| **Primary Accent** | `--primary` | `#0F766E` | Warna merek utama (Deep Steel Teal) untuk tombol primer, active link, dan chart anchor. |
| **Primary Hover** | `--primary-hover` | `#115E59` | State interaksi hover untuk tombol primer. |
| **Secondary Accent**| `--accent` | `#0D9488` | Teal sekunder untuk highlight dan vektor wawasan. |
| **Surface Tint** | `--accent-bg` | `#F0FDFA` | Latar belakang chip dan container aktif (Teal 50). |
| **App Background** | `--background` | `#F8FAFC` | Latar belakang aplikasi dengan nuansa netral hangat. |
| **Surface / Card** | `--card` | `#FFFFFF` | Permukaan panel, modal, dan kartu data. |
| **Secondary Surface**| `--secondary` | `#F1F5F9` | Latar belakang tabel header dan toolbar filter. |
| **Text Primary** | `--foreground` | `#0F172A` | Slate 900 untuk judul, teks utama, dan angka. |
| **Text Secondary**| `--text-secondary`| `#475569` | Slate 600 untuk deskripsi dan label kolom. |
| **Text Muted** | `--muted-foreground`| `#64748B` | Slate 500 untuk subteks dan placeholder. |
| **Border Subtle** | `--border` | `#E2E8F0` | Border tipis berpresisi tinggi untuk panel dan tabel. |
| **Border Strong** | `--border-strong` | `#CBD5E1` | Garis pemisah tegas dan outline input saat fokus. |
| **Success** | `--success` | `#059669` | Integritas data valid, kelengkapan 100%, ekspor sukses. |
| **Warning** | `--warning` | `#D97706` | Peringatan ukuran file besar, sel terfilter, nilai kosong. |
| **Destructive** | `--destructive` | `#E11D48` | Penghapusan kolom/baris, reset recipe, error parsing. |
| **Info / Sky** | `--info` | `#0284C7` | Metrik jumlah baris dan kategori sekunder. |

---

## 4. Tipografi & Tabular Figures

### Keluarga Font
- **Sans-serif (UI & Headings)**: `Geist Sans`, `system-ui`, `-apple-system`, `sans-serif`.
- **Monospace & Tabular (Numerik & Kode)**: `Geist Mono`, `ui-monospace`, `monospace`.
- **Offline Bundling**: Dikonfigurasi melalui Next.js font bundling lokal (`next/font/google` di-bundle saat build), zero runtime network requests.

### Skala Tipografi
- **Display / Page Title (H1)**: `20px` - `24px` (`text-xl` - `text-2xl`), `font-bold`, `tracking-tight`, `text-slate-900`. Diterapkan konsisten sebagai satu-satunya elemen `<h1>` per halaman pada seluruh 8 rute kerja, baik saat dataset aktif maupun dalam kondisi empty/loading state.
- **Section Heading (H2)**: `16px` - `18px` (`text-base` - `text-lg`), `font-bold`, `text-slate-900`.
- **Card Label (H3/Label)**: `14px` (`text-sm`), `font-bold` / `font-semibold`.
- **Body Text**: `13px` - `14px` (`text-xs` - `text-sm`), `leading-relaxed`, `text-slate-500`.
- **Table & Grid Cells**: `12px` (`text-xs`), `text-slate-800`.
- **Micro Metadata / Badges**: `10px` - `11px` (`text-[10px]` - `text-[11px]`), `font-mono`, `font-semibold`.

### Tabular Numerals & Adaptive Figures
Seluruh nilai statistik (Mean, Median, Modus, Std Dev), jumlah baris, ukuran file, nomor urut tabel (`DataGrid`), dan persentase **wajib** menggunakan angka tabular monospace:
```css
.tabular-data {
  font-family: var(--font-geist-mono), monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
```
Komponen `MetricCard` mendeteksi secara adaptif antara nilai numerik (`text-3xl font-extrabold font-mono tabular-nums`) dan label status tekstual (misal: "Struktur Valid", menggunakan `text-xl font-bold font-sans`) guna mencegah *text clipping* pada tampilan mobile.

---

## 5. Spacing, Radius, Borders & Elevation

- **Radius**: `0.625rem` (`rounded-xl` = 12px, `rounded-2xl` = 16px).
- **Borders**: Border halus 1px `border-slate-200/80` tanpa outline tebal.
- **Elevation / Shadows**:
  - `shadow-2xs`: `0 1px 2px rgba(0,0,0,0.03)`
  - `shadow-xs`: `0 1px 3px rgba(0,0,0,0.05)`
  - `shadow-sm`: `0 2px 4px rgba(0,0,0,0.06)`
- **Focus Rings**:
  - `focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 focus-visible:outline-none`

---

## 6. Ikonografi

Menggunakan koleksi ikon dari `lucide-react`:
- Ukuran standar: `14px` (inline/tombol kecil), `16px` (sidebar/tombol aksi), `20px` (kartu metrik/header).
- Stroke width: `1.75` - `2.0`.
- Alignment: Selalu disejajarkan di tengah vertikal dengan teks pendamping (`items-center gap-2`).
- Larangan Simbol Mentah: Menghindari penggunaan karakter Unicode/emoji mentah (misal karakter teks `×`). Seluruh tindakan penutupan menggunakan ikon resmi `<X className="h-4 w-4" />`.
- Aksesibilitas: Tombol berbasis ikon wajib menyertakan `aria-label` atau tooltip eksplisit. Seluruh dialog konfirmasi (Reset) dan modal (Distribusi Frekuensi) wajib mendukung penutupan via tombol `Escape`.

---

## 7. Komponen Reusable

1. **`DataWiseLogo`** ([`src/components/brand/DataWiseLogo.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/brand/DataWiseLogo.tsx)):
   Logo vektor resmi, mendukung mode normal dan compact (sidebar collapsed).
2. **`PageHeader`** ([`src/components/common/PageHeader.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/common/PageHeader.tsx)):
   Header terpadu dengan judul, deskripsi, badge kategori, dan slot tombol aksi.
3. **`MetricCard`** ([`src/components/common/MetricCard.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/common/MetricCard.tsx)):
   Kartu metrik statistik dengan format angka tabular dan status detail.
4. **`StatusBadge`** ([`src/components/common/StatusBadge.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/common/StatusBadge.tsx)):
   Pill status semantik (`brand`, `success`, `warning`, `destructive`, `neutral`, `info`).
5. **`EmptyState`** ([`src/components/common/EmptyState.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/common/EmptyState.tsx)):
   Tampilan kosong yang sengaja dirancang dengan pesan informatif dan tombol aksi utama.
6. **`SectionHeading`** ([`src/components/common/SectionHeading.tsx`](file:///c:/Antigravity%20Project/DataWise/src/components/common/SectionHeading.tsx)):
   Pemisah bagian halaman dengan judul, ikon, dan counter.

---

## 8. Navigasi & Shell Layout

### `AppSidebar`
- Menampilkan logo DataWise baru.
- Mode normal (lebar 232px) dan mode terlipat (lebar 72px) untuk memaksimalkan ruang tabel data di layar desktop/laptop.
- Indikator rute aktif: Garis aksen kiri 3px (`border-l-[3px] border-[#0F766E]`) dengan latar belakang `bg-teal-50`.
- Tooltip judul otomatis saat sidebar dalam mode terlipat.
- Drawer overlay responsif untuk layar ponsel/tablet.

### `WorkspaceLayout`
- Sticky topbar (tinggi 60px / `h-15`) dengan latar belakang semi-transparan `bg-white/95 backdrop-blur-md`.
- Active Dataset Pill yang menampilkan nama file dan jumlah baris terformat ribuan, langsung menautkan ke `/dataset`.
- Trust badge: `Privat & Zero-Server` dengan ikon perisai hijau.
- Container konten terpusat dengan padding responsif (`max-w-[1320px]`).

---

## 9. Desain Delapan Halaman Kerja

1. **Beranda (`/`)**:
   - Welcome banner dengan logo DataWise orisinal dan ringkasan privasi (*100% Lokal di Browser*).
   - Dropzone unggah file dengan drag & drop dan dukungan CSV, TSV, XLSX, XLS.
   - Pilihan struktur baris pertama (*Baris pertama adalah header* vs *Baris pertama adalah data*).
   - 4-card overview dataset aktif dengan metrik baris, kolom, tipe, dan integritas.
   - Featured card untuk **Insight Dataset & Intelligence** otomatis saat dataset aktif.
   - 6 kartu alur kerja (Data Explorer, Profiling, Statistik, Pembersihan, Visualisasi, Ekspor) saat dataset aktif.
2. **Dataset (`/dataset`)**:
   - Data Explorer dengan sticky header, input pencarian global, drawer filter kolom, dan status baris aktif.
   - Override tipe data kolom (Text, Numeric, Categorical, DateTime, Boolean) dengan feedback visual amber saat di-override.
   - Virtual windowing dipertahankan untuk performa rendering hingga 200.000 baris.
3. **Insight Dataset (`/insight`)**:
   - Executive Page Header dengan badge *100% In-Memory Browser* dan chip metadata dataset.
   - Hero Card Klasifikasi Heuristik Keluarga Dataset (8 keluarga: `EVENT_LOG`, `TRANSACTION`, `CUSTOMER_RECORDS`, `PRODUCT_CATALOG`, `SURVEY_RESPONSES`, `TIME_SERIES`, `GENERAL_TABULAR`, `UNCLASSIFIED`) dengan badge tingkat keyakinan (*Tinggi*, *Sedang*, *Rendah*).
   - Pemetaan Peran Semantik Kolom (12 peran semantik: `IDENTIFIER`, `NAME_LABEL`, `CATEGORY`, `DATE_TIME`, `NUMERIC_METRIC`, `CURRENCY`, `PERCENTAGE`, `DURATION`, `BOOLEAN`, `FREE_TEXT`, `CONSTANT`, `UNKNOWN`) dengan ikon dan badge warna yang jelas.
   - Temuan Kunci (*Key Findings*) berbasis angka aktual (kardinalitas, nilai dominan, observasi per entitas).
   - Catatan Keterbatasan (*Caveats*) transparan untuk dataset tanpa header atau anomali distribusi.
   - Rekomendasi Terarah (*Actionable Recommendations*) yang langsung menautkan ke modul yang tepat.
4. **Profiling (`/profiling`)**:
   - Executive Page Header dengan chip dataset aktif, jumlah baris dan kolom terformat id-ID, serta ringkasan tujuan audit.
   - Hero Card Kualitas Data: Skor Integritas (0-100) dengan indikator semantik (Sangat Baik / Cukup / Kritis), dan visual kelengkapan data (valid cells vs total cells).
   - 4 Kartu Diagnostik Terstruktur: Native Missing (null/string kosong murni), Dirty Whitespace (spasi/tab saja), Baris Duplikat (occurrences & participating rows), dan Effective Missing (native + whitespace).
   - Tabel Audit Integritas Kolom: Kolom, Native Missing, Whitespace, dan % Kosong dengan micro progress bar.
   - Tabel Skema & Profil Tipe Kolom: Nama kolom (chip ID untuk primary key, penanganan nama panjang dan kolom headerless), semantic badge tipe data (Numeric: sky, Categorical: teal, Text: slate, DateTime: amber, Boolean: indigo), rincian observasi valid vs missing (+%), skor kepercayaan inferensi dengan progress track mini, format regional, dan pratinjau nilai sampel baris pertama.
5. **Analisis (`/analisis`)**:
   - Executive Header dengan ikon `Sigma`, chip dataset aktif, counter kolom, dan ringkasan jaminan presisi floating-point Web Worker (koreksi Bessel s², linear percentile Type-7, evaluasi multimodal).
   - Quick Summary ribbon: Total Observasi (N), Variabel Numerik, Variabel Kategorikal, dan indikator mode tampilan aktif.
   - Tabel Statistik Numerik: Header dan kolom pertama sticky, angka tabular ber-monospace (`font-mono tabular-nums`), presisi 4 desimal pada rendering tanpa pembulatan state mentah, tooltip definisi matematis, pembeda tegas nilai nol murni (`0.0000`) vs `N/A` dengan tooltip edukatif ($N < 2$), multimodal badge ties terurut, dan indikator *Tidak Ada Modus*.
   - Tabel Statistik Kategorikal & Modal Frekuensi: Tab metrik kategorikal dengan nilai unik, top value, frekuensi nilai teratas, dan modal interaktif `CategoryDistributionModal` lengkap dengan bilah proporsi visual, scrolling responsif, dan keyboard ESC.
   - Kontrol Interaktif: Transpose toggle (*Metrik per Baris* vs *Variabel per Baris*), tombol pembatalan kalkulasi Worker, penanganan error dengan retry, dan isolasi dataset aktif (mencegah stale data).
6. **Pembersihan (`/pembersihan`)**:
   - Executive Header dengan chip dataset aktif, dimensi baris dan kolom terformat numerik ribuan (`id-ID`), badge status recipe (`Data Asli` vs `N Langkah Diterapkan`), dan badge jaminan *Non-Destruktif* (*Raw dataset terlindungi di memori*).
   - Katalog Operasi Terstruktur (4 Kategori Logis):
     - **Nilai Hilang**: *Hapus Baris Kosong* (`DROP_MISSING`), *Imputasi Nilai Hilang* (`IMPUTE_MISSING` dengan Mean, Median Type-7, Modus Multimodal, Nilai Tetap).
     - **Duplikasi**: *Hapus Baris Duplikat* (`DROP_DUPLICATES`).
     - **Pembersihan Teks**: *Trim Spasi Teks* (`TRIM_WHITESPACE`).
     - **Struktur Kolom**: *Ubah Nama Kolom* (`RENAME_COLUMN`), *Hapus Kolom* (`DROP_COLUMN`).
   - Formulir Konfigurasi Kontekstual: Kontrol input, pemilihan kolom target, parameter numerik/string, dan bantuan validasi parameter langsung.
   - Live Impact Preview:
     - Pembeda visual tegas antara preview non-destruktif (biru/teal) dan perubahan yang sudah diterapkan (hijau/emerald).
     - 3 Chip Diagnostik Dampak: Baris Terdampak, Sel Berubah, dan Nilai Pengganti (saat imputasi).
     - Kotak peringatan validasi otomatis saat input parameter kosong atau konflik nama kolom.
   - Immutable Recipe Log Timeline:
     - Urutan kronologis langkah cleaning dengan penomoran urut, badge tipe aksi, stempel waktu, dan deskripsi manusiawi.
     - Aksi hapus langkah individual di tengah antrean dengan spinner indikator rekalkulasi Worker dari data mentah asli.
     - State kosong recipe informatif dengan indikasi 100% data asli.
     - Tombol Reset ke Data Asli dengan modal konfirmasi risiko dan dukungan keyboard Escape.
   - Pratinjau Cepat Dataset Aktif: Menampilkan 5 baris pertama data aktif dengan badge tipe kolom dan tautan cepat ke Data Explorer (`/dataset`).
7. **Visualisasi (`/visualisasi`)**:
   - Executive Header dengan chip nama dataset aktif, dimensi record terformat ribuan numerik (`id-ID`), badge status sampling transparan, dan trust badge jaminan *Client-Side SVG* (*Zero-server transmission*).
   - Tata Letak Split Workspace (Grid 12-Kolom Berhierarki Jelas):
     - **Panel Konfigurasi (Kiri / 4 Kolom)**:
       - Pemilih jenis grafik 2x2 terstruktur (Bar Chart, Histogram, Line Chart, Scatter Plot) dengan kartu ber-ikon dan state aktif beraksen Deep Steel Teal (`#0F766E`).
       - Kontrol parameter kontekstual per tipe grafik: pemilihan sumbu X & Y, metode agregasi (COUNT, SUM, MEAN) dengan auto-disable bila sumbu nilai kosong, slider + input numerik sinkron untuk jumlah bins histogram (2–50), dan preservasi indeks urutan baris asli untuk Line Chart.
       - Counter ketersediaan kolom numerik dan kategorikal di bagian atas panel konfigurasi.
     - **Area Visualisasi (Kanan / 8 Kolom)**:
       - Toolbar Kanvas: Judul grafik dinamis deskriptif, badge tipe visualisasi, chip status missing values, serta tombol **Unduh Gambar (PNG)** dengan status loading/spinner, feedback sukses *Tersimpan!*, dan penonaktifan aman saat data belum siap.
       - Kanvas Recharts Beresolusi Tinggi: Background putih bersih, gridlines horizontal halus (`#F1F5F9`), sumbu abu-abu netral (`#64748B`), rotasi label teks kategori miring (-25°/-30°) untuk menghindari tumpang tindih teks padat, dan tooltip kustom melayang berangka tabular (`tabular-nums font-mono`).
       - Empat Tipe Grafik Inti:
         - *Bar Chart:* Kategori terurut menurun, pengelompokan transparan kardinalitas tinggi (>20) ke `(Lainnya)`, palet Okabe-Ito beraksen Deep Teal.
         - *Histogram:* Bins linier presisi [min, max], penanganan data konstan dan observasi missing.
         - *Line Chart:* Urutan observasi asli 1..N, penanganan nilai kosong eksplisit (`connectNulls={false}`), dan disclosure sampling transparan jika N > 2.000 titik.
         - *Scatter Plot:* Preservasi pasangan (X, Y) baris yang sama, opacity titik 0.75, dan disclosure sampling transparan jika M > 2.500 titik.
       - Bilah Audit Footer: Metrik observasi valid aktual, total kategori, pembagian bins, disclosure sampling, dan catatan integritas mesin grafik.
8. **Ekspor (`/ekspor`)**:
   - Executive Header dengan chip nama dataset aktif, dimensi record terformat numerik ribuan (`id-ID`), badge status recipe pembersihan aktif, dan trust badge jaminan *100% Client-Side* (*Zero-server transmission*).
   - Tata Letak Split Workspace (Grid 12-Kolom Berhierarki Jelas):
     - **Kolom Konfigurasi Ekspor (Kiri / 7 Kolom)**:
       - *Langkah 1 (Pilih Format Berkas):* Kartu radio interaktif untuk **CSV (Comma-Separated)** ber-RFC 4180 dan **Microsoft Excel (.xlsx)** dengan active ring Deep Steel Teal (`#0F766E`), ikon dokumen terdedikasi, dan deskripsi peruntukan data yang transparan.
       - *Langkah 2 (Pengaturan & Nama Berkas):* Input nama berkas dengan suffix ekstensi dinamis, pemilih delimiter kustom (koma, titik koma, tab), toggle UTF-8 BOM untuk proteksi mojibake Excel desktop, batas 31 karakter nama lembar kerja (worksheet) Excel dengan sanitasi otomatis karakter terlarang (`\ / ? * [ ] :`), serta callout kepatuhan RFC 4180 dan preservasi tipe cell (leading zeros diawetkan sebagai string `s`).
     - **Kolom Ringkasan & Aksi Unduh (Kanan / 5 Kolom)**:
       - *Ringkasan Berkas yang Akan Diunduh:* Sticky card yang menyajikan nama berkas final terformat mono, format keluaran, dataset sumber, jumlah baris dan kolom tabular, status recipe pembersihan, dan scrollable chips skema kolom terpilih beserta tipenya.
       - *Tombol Aksi Utama (#btn-unduh-dataset):* Label kontekstual `Unduh Dataset (CSV)` / `Unduh Dataset (XLSX)`, indikator status loading spinner asinkron via Web Worker, feedback sukses hijau emerald dengan auto-dismiss, feedback error terstruktur, dan pembersihan Object URL memori otomatis.

---

## 10. Aksesibilitas & Responsivitas

- **WCAG AA Contrast**: Warna teks Slate 900 pada putih mencapai rasio kontras 16:1. Deep Steel Teal (`#0F766E`) pada putih mencapai rasio 4.6:1 (memenuhi standar teks reguler).
- **Keyboard Navigation**: Seluruh elemen interaktif memiliki `focus-visible:ring-2` yang jelas.
- **Screen Reader Support**: Atribut `aria-label`, `aria-current="page"`, `aria-selected`, dan `<span className="sr-only">` dipertahankan pada kontrol navigasi dan status.
- **Prefers-reduced-motion**: Deklarasi `@media (prefers-reduced-motion: reduce)` menonaktifkan durasi animasi dan transisi bagi pengguna dengan preferensi vestibular.
- **Responsivitas**: Layout diuji dan beradaptasi dari desktop lebar (1440px), laptop (1280px), tablet (768px), hingga ponsel (360px).

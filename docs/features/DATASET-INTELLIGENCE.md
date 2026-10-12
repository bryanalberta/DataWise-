# DataWise Dataset Intelligence — Dokumentasi Fitur (TASK-DI-01)

Dokumen ini menjelaskan arsitektur, prinsip kerja, aturan heuristik, sistem inferensi semantik, temuan penting, dan rekomendasi analisis pada fitur **Dataset Intelligence** (`/insight`) di DataWise.

---

## 1. Arsitektur & Prinsip Utama

Fitur Dataset Intelligence dikembangkan untuk membantu pengguna memahami makna dataset setelah proses unggah berkas, menjawab tiga pertanyaan mendasar:
1. **"Dataset ini sebenarnya tentang apa?"** (Klasifikasi keluarga dataset).
2. **"Kolom-kolomnya berarti apa?"** (Perkiraan peran semantik setiap kolom).
3. **"Analisis dan visualisasi apa yang cocok dilakukan?"** (Temuan penting terukur & rekomendasi tindakan konkret).

### Batasan Arsitektur & Keamanan
- **100% Pemrosesan Lokal (In-Memory Browser):** Seluruh inferensi dan evaluasi diproses di dalam Web Worker (`src/workers/data-processor.worker.ts` aksi `ANALYZE_DATASET_INTELLIGENCE`).
- **Zero API Keys & Zero External Services:** Tidak menggunakan API eksternal, model AI cloud, atau LLM generik pihak ketiga. Semua aturan berbasis logika deterministik transparan.
- **Zero Network Transmission & Zero Telemetry:** Dataset pengguna tidak pernah dikirim keluar browser. Kepatuhan privasi terjamin penuh sesuai standar DataWise.
- **Non-Destruktif:** Dataset Intelligence bersifat interpretatif. Fitur ini tidak memutasi tipe kolom asli di skema, tidak mengubah nilai sel, dan tidak memodifikasi data aktif.
- **Deterministik:** Input dataset yang identik selalu menghasilkan klasifikasi, peran semantik, temuan penting, dan rekomendasi yang sama persis.
- **Pemisahan Fakta vs Interpretasi:** Fakta numerik (kardinalitas, rasio keunikan, jumlah null, sampel nilai) ditampilkan secara eksplisit terpisah dari kesimpulan heuristik.

---

## 2. Rute & Antarmuka Navigasi

- **Rute Khusus:** `/insight` (Halaman `Insight Dataset`).
- **Navigasi Sidebar:** Menu `Insight Dataset` berikon `Sparkles` ditempatkan di posisi kedua di `src/components/AppSidebar.tsx` (setelah Beranda), melengkapi seluruh 8 rute aktif DataWise:
  1. Beranda (`/`)
  2. Insight Dataset (`/insight`)
  3. Data Explorer (`/dataset`)
  4. Profiling & Kualitas (`/profiling`)
  5. Statistik Deskriptif (`/analisis`)
  6. Pembersihan Data (`/pembersihan`)
  7. Visualisasi Data (`/visualisasi`)
  8. Ekspor Dataset (`/ekspor`)
- **Desain UI:** Dibangun menggunakan `WorkspaceLayout`, design tokens DataWise (Deep Steel Teal `#0F766E`, font Geist, ikon Lucide), dan struktur modular:
  1. Header & ringkasan dataset aktif (nama berkas, total baris, total kolom, status header).
  2. Kartu klasifikasi keluarga dataset dengan badge tingkat keyakinan (*Confidence*), faktor pendukung, dan catatan pembatas (*Caveats*).
  3. Tabel peran semantik kolom (*Peran Semantik Setiap Kolom*).
  4. Temuan penting terukur (*Temuan Penting dalam Dataset*).
  5. Rekomendasi analisis & visualisasi terarah (*Rekomendasi Analisis & Visualisasi*).
  6. Penanganan state lengkap: Empty State (saat belum ada dataset), Loading Spinner (asinkron Worker), Error State (dengan tombol Coba Lagi), dan tombol Analisis Ulang (*Refresh*).

---

## 3. Klasifikasi Keluarga Dataset (Dataset Family Inference)

Modul `src/lib/dataset-intelligence.ts` melakukan klasifikasi deterministik terhadap struktur dataset ke dalam 8 keluarga:

| Keluarga Dataset (`DatasetFamily`) | Label UI | Kriteria Heuristik | Tingkat Keyakinan Umum |
|---|---|---|---|
| `TIME_SERIES` | **Runtun Waktu (Time-Series)** | Memiliki kolom tanggal/waktu (`DATE_TIME`) dan setidaknya satu metrik numerik kontinu tanpa identifier entitas berulang dominan. | Tinggi (jika ada timestamp jelas) |
| `SURVEY_RESPONSES` | **Data Survei & Kuesioner** | Memiliki identifier responden atau banyak kolom kategorikal/ordinal dengan kardinalitas rendah (2–7 nilai unik, pola skala Likert/kuesioner). | Sedang – Tinggi |
| `PRODUCT_CATALOG` | **Katalog Produk & Inventaris** | Memiliki identifier SKU/kode unik (`uniquenessRatio > 0.90`), nama item/produk, serta metrik harga/stok atau kategori produk. | Sedang – Tinggi |
| `TRANSACTION` | **Data Transaksi & Finansial** | Memiliki identifier transaksi/order unik, metrik harga/nominal, timestamp transaksi, atau pola belanja. | Sedang – Tinggi |
| `CUSTOMER_RECORDS` | **Data Pelanggan & Pengguna** | Memiliki entitas identifier unik per baris (`uniquenessRatio > 0.90`), nama orang/pengguna, dan atribut kontak/demografis. | Sedang – Tinggi |
| `EVENT_LOG` | **Log Aktivitas & Riwayat Event** | Memiliki actor/user identifier berulang (`uniquenessRatio < 0.95`), kolom aksi/kategori event, dan metrik kuantitatif atau timestamp. | Sedang – Tinggi |
| `GENERAL_TABULAR` | **Dataset Tabular Umum** | Dataset tabular terstruktur yang tidak memiliki ciri dominan khusus di atas, atau dataset tanpa header dengan bukti belum mencukupi. | Sedang – Rendah |
| `UNCLASSIFIED` | **Belum Dapat Diklasifikasikan** | Dataset kosong (0 baris atau 0 kolom) atau tidak memiliki observasi yang valid. | Rendah |

---

## 4. Deteksi Peran Semantik Kolom (Semantic Column Profiling)

Setiap kolom dievaluasi melalui fungsi `profileColumnSemantics()` berdasarkan tipe data inferensi, nama header (jika ada), pola nilai sampel, rasio keunikan (*uniqueness ratio*), dan kardinalitas:

| Peran Semantik (`SemanticColumnRole`) | Label UI | Bukti & Aturan Inferensi |
|---|---|---|
| `CONSTANT` | Kolom Konstan | Hanya memiliki 1 nilai unik untuk seluruh baris yang tidak null (variasi = 0). |
| `BOOLEAN` | Nilai Boolean | Tipe data `Boolean` atau kolom dengan tepat 2 nilai biner (misal: `true`/`false`, `0`/`1`, `ya`/`tidak`). |
| `DATE_TIME` | Tanggal & Waktu | Tipe data `DateTime` atau format tanggal ISO/regional yang konsisten. |
| `IDENTIFIER` | Pengenal (ID) | Rasio keunikan tinggi ($> 90\%$), pola nama ID/code/key, atau format string numerik/alfanumerik seragam (misal ID 5–15 digit). Kolom numerik kontinu biasa (*sales, score*) tidak salah dilabeli sebagai ID. |
| `NAME_LABEL` | Nama / Label | Kolom teks dengan rasio keunikan sedang-tinggi ($30\% - 98\%$), panjang karakter wajar, atau nama kolom `name`, `title`, `label`, `item`. |
| `CATEGORY` | Kategori | Kardinalitas rendah ($< 50$ nilai unik dan rasio keunikan $< 20\%$) dengan nilai berulang. |
| `CURRENCY` | Mata Uang / Harga | Kolom numerik dengan nama harga/biaya/pendapatan (`price`, `cost`, `salary`, `revenue`) atau simbol mata uang. |
| `PERCENTAGE` | Persentase / Rasio | Kolom numerik dalam rentang $[0, 1]$ atau $[0, 100]$ dengan kata kunci `pct`, `percent`, `rate`, `ratio`. |
| `DURATION` | Durasi Waktu | Kolom numerik atau teks yang merepresentasikan durasi (`duration`, `seconds`, `hours`, `minutes`). |
| `NUMERIC_METRIC` | Metrik Numerik | Kolom bertipe `Numeric` kontinu standar tanpa indikator spesifik lainnya. |
| `FREE_TEXT` | Teks Bebas | Kolom teks panjang dengan rata-rata panjang $> 60$ karakter atau berkarakteristik narasi/komentar. |
| `UNKNOWN` | Tidak Diketahui | Kolom yang buktinya tidak cukup untuk diklasifikasikan ke peran semantik spesifik. |

---

## 5. Definisi Tingkat Keyakinan (Confidence)

DataWise menolak penggunaan angka persentase fiktif (seperti "Akurasi AI 97.4%") jika tidak didukung model terkalibrasi. Tingkat keyakinan disajikan secara kategoris transparan:

- **Tinggi (`HIGH`):** Bukti kuat dari kombinasi nama kolom eksplisit, format tipe data valid, dan distribusi kardinalitas yang sepenuhnya konsisten dengan definisi peran.
- **Sedang (`MEDIUM`):** Bukti struktur data dan distribusi nilai sangat mendukung kesimpulan, namun nama kolom ambigu atau format data memungkinkan interpretasi alternatif.
- **Rendah (`LOW`):** Bukti data terbatas (misalnya sedikit sampel, dataset tanpa header, atau rentang nilai sangat ambigu). Pengguna diberikan peringatan eksplisit.

---

## 6. Temuan Penting dalam Dataset (Key Findings)

Modul `generateDatasetFindings()` mengevaluasi anomali dan karakteristik terukur, menyertakan bukti numerik presisi:

1. **Kolom Konstan (`VARIATION`):** Mendeteksi kolom yang memiliki $100\%$ nilai identik di seluruh baris. Menjelaskan bahwa kolom tidak memberikan variasi informasi analitik.
2. **Missing Values Tinggi (`QUALITY`):** Mendeteksi kolom dengan persentase data hilang $> 20\%$. Menyertakan jumlah sel kosong dan persentase eksak.
3. **Ketidakseimbangan Kategori Ekstrem (`DISTRIBUTION`):** Mendeteksi kolom kategori di mana satu nilai mendominasi $> 80\%$ total observasi, memperingatkan potensi bias sampel.
4. **Kandidat Primary Key (`STRUCTURE`):** Mendeteksi kolom dengan keunikan $100\%$ tanpa missing value yang dapat berfungsi sebagai kunci unik baris.

---

## 7. Rekomendasi Analisis & Visualisasi Praktis

Setiap rekomendasi dibuat berdasarkan kolom nyata yang tersedia dan langsung terhubung ke rute fungsional DataWise:

- **Distribusi Kategori (Bar Chart):** Untuk kolom kategorikal, merekomendasikan Bar Chart frekuensi ke `/visualisasi`.
- **Agregasi Metrik per Kategori (Bar Chart):** Jika terdapat 1 kolom kategori dan 1 metrik numerik, merekomendasikan agregasi MEAN/SUM ke `/visualisasi`.
- **Distribusi & Sebaran Numerik (Histogram):** Untuk kolom numerik, merekomendasikan analisis sebaran bins ke `/visualisasi`.
- **Korelasi Antar-Variabel (Scatter Plot):** Jika terdapat $\ge 2$ kolom numerik, merekomendasikan eksplorasi korelasi X-Y ke `/visualisasi`.
- **Tren Runtun Waktu (Line Chart):** Jika terdapat kolom waktu dan metrik numerik, merekomendasikan Line Chart ke `/visualisasi`.
- **Audit Statistik Deskriptif (Tabel Statistik):** Merekomendasikan telaah 13 metrik numerik lengkap ke `/analisis`.
- **Pembersihan Data (Data Cleaning Studio):** Jika terdeteksi kolom konstan atau missing values tinggi, merekomendasikan pembersihan ke `/pembersihan`.

---

## 8. Penanganan Dataset Tanpa Header (Acceptance Fixture Steam-200k)

Pada dataset tanpa header (seperti berkas `steam-200k.csv` dengan kolom generik `Column 1` hingga `Column 5`):
- **Kolom 1:** Dideteksi sebagai `IDENTIFIER` berdasarkan kardinalitas user ID integer 8–9 digit dan rasio keunikan berulang.
- **Kolom 2:** Dideteksi sebagai `NAME_LABEL` berdasarkan variasi judul/nama game dengan panjang karakter teks sedang.
- **Kolom 3:** Dideteksi sebagai `CATEGORY` berdasarkan nilai berulang aktivitas (`purchase` dan `play`).
- **Kolom 4:** Dideteksi sebagai `NUMERIC_METRIC` kontinu. Algoritma **tidak** secara gegabah menyebutnya sebagai "jam bermain" karena baris `purchase` dan `play` berbagi kolom numerik yang sama (nilai 1.0 vs jam aktual).
- **Kolom 5:** Dideteksi sebagai `CONSTANT` karena $100\%$ nilainya adalah `0`.
- **Caveats:** Sistem menampilkan catatan transparan bahwa dataset tidak memiliki header asli dan interpretasi didasarkan pada pola nilai data sampel.

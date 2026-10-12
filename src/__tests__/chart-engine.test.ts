import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateBarChartData,
  generateHistogramData,
  generateLineChartData,
  generateScatterPlotData,
  generateChartData,
} from '../lib/chart-engine';
import { isValidPngSignature, createMockPngBytes } from '../lib/export-png';
import { ColumnSchema } from '../types';

describe('TASK-FNC-05 — Visualization Studio & Chart Engine', () => {
  const sampleColumns: ColumnSchema[] = [
    { id: 'c1', name: 'kota', type: 'Categorical' },
    { id: 'c2', name: 'skor', type: 'Numeric' },
    { id: 'c3', name: 'gaji', type: 'Numeric' },
    { id: 'c4', name: 'nama', type: 'Text' },
  ];

  const sampleData: Record<string, unknown>[] = [
    { kota: 'Jakarta', skor: 80, gaji: 10000000, nama: 'Andi' },
    { kota: 'Surabaya', skor: 90, gaji: 12000000, nama: 'Budi' },
    { kota: 'Jakarta', skor: 85, gaji: 11000000, nama: 'Citra' },
    { kota: 'Bandung', skor: 70, gaji: 8000000, nama: 'Dewi' },
    { kota: 'Jakarta', skor: 95, gaji: 15000000, nama: 'Eko' },
    { kota: 'Surabaya', skor: null, gaji: 9000000, nama: 'Fajar' }, // skor missing
    { kota: null, skor: 60, gaji: 7000000, nama: 'Gita' }, // kota missing
  ];

  // =========================================================================
  // 1. BAR CHART TESTS
  // =========================================================================
  describe('1. Bar Chart (Frekuensi & Agregasi Nilai)', () => {
    it('1.1. Menghitung frekuensi kategori secara deterministik dan terurut menurun', () => {
      const result = generateBarChartData(sampleData, sampleColumns, {
        type: 'BAR',
        xColumn: 'kota',
        aggregation: 'COUNT',
      });

      assert.equal(result.type, 'BAR');
      assert.equal(result.totalCategories, 3); // Jakarta, Surabaya, Bandung
      assert.equal(result.missingCount, 1); // 1 baris kota null

      // Jakarta muncul 3x, Surabaya 2x, Bandung 1x
      assert.equal(result.data[0].category, 'Jakarta');
      assert.equal(result.data[0].value, 3);

      assert.equal(result.data[1].category, 'Surabaya');
      assert.equal(result.data[1].value, 2);

      assert.equal(result.data[2].category, 'Bandung');
      assert.equal(result.data[2].value, 1);
    });

    it('1.2. Menghitung agregasi nilai SUM dan MEAN per kategori', () => {
      // SUM gaji per kota
      const sumResult = generateBarChartData(sampleData, sampleColumns, {
        type: 'BAR',
        xColumn: 'kota',
        yColumn: 'gaji',
        aggregation: 'SUM',
      });

      // Jakarta: 10jt + 11jt + 15jt = 36jt
      // Surabaya: 12jt + 9jt = 21jt
      // Bandung: 8jt
      assert.equal(sumResult.data[0].category, 'Jakarta');
      assert.equal(sumResult.data[0].value, 36000000);

      // MEAN skor per kota (Surabaya memiliki 1 null skor, sehingga dihitung dari observasi valid)
      const meanResult = generateBarChartData(sampleData, sampleColumns, {
        type: 'BAR',
        xColumn: 'kota',
        yColumn: 'skor',
        aggregation: 'MEAN',
      });

      // Surabaya: 90 / 1 = 90
      // Jakarta: (80 + 85 + 95) / 3 = 86.6667
      // Bandung: 70 / 1 = 70
      assert.equal(meanResult.data[0].category, 'Surabaya');
      assert.equal(meanResult.data[0].value, 90);
      assert.equal(meanResult.data[1].category, 'Jakarta');
      assert.equal(meanResult.data[1].value, 86.6667);
    });

    it('1.3. Kardinalitas tinggi (> 20 kategori) mengelompokkan sisanya ke "(Lainnya)" secara transparan', () => {
      // Buat 30 kategori berbeda
      const largeCategoryData: Record<string, unknown>[] = [];
      for (let i = 1; i <= 30; i++) {
        largeCategoryData.push({ kota: `Kota_${i}`, skor: i * 10 });
      }

      const result = generateBarChartData(largeCategoryData, sampleColumns, {
        type: 'BAR',
        xColumn: 'kota',
        maxCategories: 20,
      });

      assert.equal(result.totalCategories, 30);
      assert.equal(result.displayedCategories, 20);
      assert.equal(result.otherCategoriesCount, 10);
      assert.equal(result.data.length, 21); // 20 top + 1 Lainnya
      assert.ok(result.data[20].category.includes('Lainnya - 10 kategori'));
    });

    it('1.4. Menolak kolom kategori yang tidak ada dalam skema', () => {
      assert.throws(() => {
        generateBarChartData(sampleData, sampleColumns, {
          type: 'BAR',
          xColumn: 'kolom_palsu',
        });
      }, /tidak ditemukan/);
    });
  });

  // =========================================================================
  // 2. HISTOGRAM TESTS
  // =========================================================================
  describe('2. Histogram (Frekuensi Bins & Distribusi Numerik)', () => {
    it('2.1. Menghitung bins frekuensi secara presisi', () => {
      // Data skor: 60, 70, 80, 85, 90, 95 (min: 60, max: 95)
      // 5 bins -> binWidth = (95 - 60) / 5 = 7
      const result = generateHistogramData(sampleData, sampleColumns, {
        type: 'HISTOGRAM',
        column: 'skor',
        bins: 5,
      });

      assert.equal(result.type, 'HISTOGRAM');
      assert.equal(result.binCount, 5);
      assert.equal(result.min, 60);
      assert.equal(result.max, 95);
      assert.equal(result.validCount, 6);
      assert.equal(result.missingCount, 1);
      assert.equal(result.isConstant, false);

      // Total count di seluruh bins harus sama dengan validCount (6)
      const totalCountInBins = result.bins.reduce((acc, b) => acc + b.count, 0);
      assert.equal(totalCountInBins, 6);

      // Nilai maksimum (95) wajib masuk ke bin terakhir
      assert.ok(result.bins[4].count >= 1);
    });

    it('2.2. Menangani kasus data konstan (varians nol) dengan aman', () => {
      const constantData = [
        { skor: 50 },
        { skor: 50 },
        { skor: 50 },
      ];

      const result = generateHistogramData(constantData, sampleColumns, {
        type: 'HISTOGRAM',
        column: 'skor',
        bins: 10,
      });

      assert.equal(result.isConstant, true);
      assert.equal(result.bins.length, 1);
      assert.equal(result.bins[0].count, 3);
      assert.equal(result.bins[0].percentage, 100);
      assert.equal(result.min, 50);
      assert.equal(result.max, 50);
    });

    it('2.3. Menolak kolom non-numerik untuk Histogram', () => {
      assert.throws(() => {
        generateHistogramData(sampleData, sampleColumns, {
          type: 'HISTOGRAM',
          column: 'nama',
          bins: 10,
        });
      }, /hanya dapat dihitung untuk kolom bertipe numerik/);
    });

    it('2.4. Menangani kolom tanpa observasi valid (N = 0)', () => {
      const allNullData = [{ skor: null }, { skor: '' }, { skor: undefined }];
      const result = generateHistogramData(allNullData, sampleColumns, {
        type: 'HISTOGRAM',
        column: 'skor',
        bins: 5,
      });

      assert.equal(result.validCount, 0);
      assert.equal(result.missingCount, 3);
      assert.equal(result.bins.length, 0);
    });
  });

  // =========================================================================
  // 3. LINE CHART TESTS
  // =========================================================================
  describe('3. Line Chart (Urutan Observasi & Missing Policy)', () => {
    it('3.1. Mempertahankan urutan observasi asli dari baris 1 hingga N', () => {
      const result = generateLineChartData(sampleData, sampleColumns, {
        type: 'LINE',
        yColumn: 'gaji',
      });

      assert.equal(result.type, 'LINE');
      assert.equal(result.totalPoints, 7);
      assert.equal(result.data.length, 7);
      assert.equal(result.isSampled, false);

      // Verifikasi urutan nilai Y persis sesuai urutan baris
      assert.equal(result.data[0].y, 10000000);
      assert.equal(result.data[1].y, 12000000);
      assert.equal(result.data[2].y, 11000000);
      assert.equal(result.data[3].y, 8000000);
      assert.equal(result.data[4].y, 15000000);
      assert.equal(result.data[5].y, 9000000);
      assert.equal(result.data[6].y, 7000000);
    });

    it('3.2. Menangani missing values pada Y sebagai null eksplisit (tidak menyesatkan)', () => {
      const result = generateLineChartData(sampleData, sampleColumns, {
        type: 'LINE',
        yColumn: 'skor',
      });

      // Baris ke-6 (index 5) skor adalah null
      assert.equal(result.data[5].y, null);
      assert.equal(result.missingCount, 1);
      assert.equal(result.validCount, 6);
    });

    it('3.3. Mengaktifkan visual sampling jika jumlah baris > 2000 dengan disclosure transparan', () => {
      const bigData: Record<string, unknown>[] = [];
      for (let i = 1; i <= 5000; i++) {
        bigData.push({ skor: 50 + (i % 50) });
      }

      const result = generateLineChartData(bigData, sampleColumns, {
        type: 'LINE',
        yColumn: 'skor',
        maxPoints: 2000,
      });

      assert.equal(result.isSampled, true);
      assert.equal(result.totalPoints, 5000);
      assert.ok(result.displayedPoints <= 2000);
      assert.ok(result.displayedPoints > 500);
    });
  });

  // =========================================================================
  // 4. SCATTER PLOT TESTS
  // =========================================================================
  describe('4. Scatter Plot (Preservasi Pasangan X-Y Satu Baris)', () => {
    it('4.1. Memastikan pasangan (X, Y) berasal dari baris yang sama persis', () => {
      const result = generateScatterPlotData(sampleData, sampleColumns, {
        type: 'SCATTER',
        xColumn: 'skor',
        yColumn: 'gaji',
      });

      assert.equal(result.type, 'SCATTER');
      // Baris 6 (skor null) dilewati, menyisakan 6 pasangan valid
      assert.equal(result.data.length, 6);
      assert.equal(result.missingCount, 1);

      // Verifikasi baris 1: skor=80, gaji=10jt
      assert.equal(result.data[0].x, 80);
      assert.equal(result.data[0].y, 10000000);

      // Verifikasi baris 2: skor=90, gaji=12jt
      assert.equal(result.data[1].x, 90);
      assert.equal(result.data[1].y, 12000000);
    });

    it('4.2. Menolak jika sumbu X atau Y bukan bertipe numerik', () => {
      assert.throws(() => {
        generateScatterPlotData(sampleData, sampleColumns, {
          type: 'SCATTER',
          xColumn: 'nama', // Kolom teks
          yColumn: 'gaji',
        });
      }, /harus bertipe numerik/);
    });

    it('4.3. Visual sampling pada dataset sangat besar (> 2500 titik) dengan disclosure', () => {
      const bigPairs: Record<string, unknown>[] = [];
      for (let i = 1; i <= 6000; i++) {
        bigPairs.push({ skor: i % 100, gaji: i * 1000 });
      }

      const result = generateScatterPlotData(bigPairs, sampleColumns, {
        type: 'SCATTER',
        xColumn: 'skor',
        yColumn: 'gaji',
        maxPoints: 2500,
      });

      assert.equal(result.isSampled, true);
      assert.equal(result.totalPairs, 6000);
      assert.ok(result.displayedPoints <= 2500);
    });
  });

  // =========================================================================
  // 5. DISPATCHER & INTEGRITY
  // =========================================================================
  describe('5. Chart Dispatcher & Integrity', () => {
    it('5.1. Dispatcher memanggil generator yang tepat sesuai config.type', () => {
      const bar = generateChartData(sampleData, sampleColumns, { type: 'BAR', xColumn: 'kota' });
      assert.equal(bar.type, 'BAR');

      const hist = generateChartData(sampleData, sampleColumns, { type: 'HISTOGRAM', column: 'skor', bins: 5 });
      assert.equal(hist.type, 'HISTOGRAM');

      const line = generateChartData(sampleData, sampleColumns, { type: 'LINE', yColumn: 'skor' });
      assert.equal(line.type, 'LINE');

      const scatter = generateChartData(sampleData, sampleColumns, { type: 'SCATTER', xColumn: 'skor', yColumn: 'gaji' });
      assert.equal(scatter.type, 'SCATTER');
    });
  });

  // =========================================================================
  // 6. PNG EXPORT VALIDATION
  // =========================================================================
  describe('6. Ekspor Gambar PNG & Signature Validation', () => {
    it('6.1. Validasi PNG magic bytes (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)', () => {
      const validPngBytes = createMockPngBytes();
      assert.equal(isValidPngSignature(validPngBytes), true);

      // Tes file non-PNG (misal file teks ASCII atau JPEG)
      const fakeBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF header
      assert.equal(isValidPngSignature(fakeBytes), false);

      const emptyBytes = new Uint8Array([]);
      assert.equal(isValidPngSignature(emptyBytes), false);
    });
  });
});

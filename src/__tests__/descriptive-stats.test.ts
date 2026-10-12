import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isClose,
  calculateNumericStats,
  calculateCategoricalStats,
  calculateDescriptiveStatistics,
  parseNumericValue
} from '../lib/descriptive-stats';
import { ColumnSchema } from '../types';
import { useDatasetStore } from '../store/dataset-store';

describe('TASK-FNC-01 — Descriptive Statistics Engine', () => {

  // Helper assertion untuk float tolerance PRD 4.3.E
  const assertClose = (calc: number | null, ref: number, msg?: string) => {
    assert.ok(calc !== null, `${msg || 'Nilai'}: diharapkan bukan null`);
    assert.ok(
      isClose(calc, ref, 1e-5, 1e-5),
      `${msg || 'Nilai'} (${calc}) berbeda dari acuan (${ref}) melampaui toleransi atol=1e-5, rtol=1e-5`
    );
  };

  describe('1. Akurasi Formula Numerik Manual & Master Tolerance (atol=1e-5, rtol=1e-5)', () => {

    it('Fixture 1: [1, 2, 3, 4] dengan hasil manual terverifikasi', () => {
      // Data: 1, 2, 3, 4 (N = 4)
      // Sum = 10
      // Mean = 2.5
      // Min = 1, Max = 4
      // Varians Bessel (N-1): ((1-2.5)^2 + (2-2.5)^2 + (3-2.5)^2 + (4-2.5)^2) / 3 = 5.0 / 3 = 1.6666666667
      // Std Dev: sqrt(5/3) = 1.2909944487
      // Linear Type-7:
      //   Q1 (p=0.25): idx = 3 * 0.25 = 0.75 -> 1 + 0.75*(2-1) = 1.75
      //   Median (p=0.5): idx = 3 * 0.5 = 1.5 -> 2 + 0.5*(3-2) = 2.5
      //   Q3 (p=0.75): idx = 3 * 0.75 = 2.25 -> 3 + 0.25*(4-3) = 3.25
      //   IQR: 3.25 - 1.75 = 1.5
      // Mode: all unique -> null
      const stats = calculateNumericStats([1, 2, 3, 4], 0);

      assert.equal(stats.count, 4);
      assert.equal(stats.missing, 0);
      assert.equal(stats.min, 1);
      assert.equal(stats.max, 4);
      assertClose(stats.sum, 10, 'Sum');
      assertClose(stats.mean, 2.5, 'Mean');
      assertClose(stats.variance, 5 / 3, 'Sample Variance (ddof=1)');
      assertClose(stats.standardDeviation, Math.sqrt(5 / 3), 'Sample Std Dev (ddof=1)');
      assertClose(stats.q1, 1.75, 'Q1 Type-7');
      assertClose(stats.median, 2.5, 'Median Type-7');
      assertClose(stats.q3, 3.25, 'Q3 Type-7');
      assertClose(stats.iqr, 1.5, 'IQR');
      assert.equal(stats.mode, null, 'Semua nilai unik -> null (Tidak ada modus)');
    });

    it('Fixture 2: [10, 20, 20, 30, 40] dengan modus tunggal dan kuantil presisi', () => {
      // Data: 10, 20, 20, 30, 40 (N = 5)
      // Sum = 120
      // Mean = 24
      // Min = 10, Max = 40
      // Deviations: 10-24=-14 (196), 20-24=-4 (16), 20-24=-4 (16), 30-24=6 (36), 40-24=16 (256)
      // Sum sq diff: 196 + 16 + 16 + 36 + 256 = 520
      // Varians (N-1): 520 / 4 = 130
      // Std Dev: sqrt(130) = 11.40175425
      // Linear Type-7:
      //   Q1 (p=0.25): idx = 4 * 0.25 = 1.0 -> sorted[1] = 20
      //   Median (p=0.5): idx = 4 * 0.5 = 2.0 -> sorted[2] = 20
      //   Q3 (p=0.75): idx = 4 * 0.75 = 3.0 -> sorted[3] = 30
      //   IQR: 30 - 20 = 10
      // Mode: [20]
      const stats = calculateNumericStats([10, 20, 20, 30, 40], 2);

      assert.equal(stats.count, 5);
      assert.equal(stats.missing, 2);
      assert.equal(stats.min, 10);
      assert.equal(stats.max, 40);
      assertClose(stats.sum, 120, 'Sum');
      assertClose(stats.mean, 24, 'Mean');
      assertClose(stats.variance, 130, 'Variance');
      assertClose(stats.standardDeviation, Math.sqrt(130), 'Std Dev');
      assertClose(stats.q1, 20, 'Q1');
      assertClose(stats.median, 20, 'Median');
      assertClose(stats.q3, 30, 'Q3');
      assertClose(stats.iqr, 10, 'IQR');
      assert.deepEqual(stats.mode, [20], 'Modus tunggal bernilai 20');
    });

    it('Fixture 3: Multimodal dengan frekuensi seri (ties)', () => {
      // Data: [1, 2, 2, 3, 3, 4] -> 2 dan 3 sama-sama muncul 2 kali
      const stats = calculateNumericStats([1, 2, 2, 3, 3, 4], 0);
      assert.equal(stats.count, 6);
      assert.deepEqual(stats.mode, [2, 3], 'Modus seri harus terurut ascending [2, 3]');
    });

    it('Fixture 4: Nilai float ilmiah (Fisher Iris Sepal Length sample subset)', () => {
      // 5.1, 4.9, 4.7, 4.6, 5.0, 5.4, 4.6, 5.0, 4.4, 4.9 (N = 10)
      const data = [5.1, 4.9, 4.7, 4.6, 5.0, 5.4, 4.6, 5.0, 4.4, 4.9];
      const stats = calculateNumericStats(data, 0);

      assert.equal(stats.count, 10);
      assert.equal(stats.min, 4.4);
      assert.equal(stats.max, 5.4);
      assertClose(stats.sum, 48.6, 'Sum Iris sample');
      assertClose(stats.mean, 4.86, 'Mean Iris sample');
      // Sample variance (ddof=1, N-1=9): 0.764 / 9 = 0.08488888888888889
      assertClose(stats.variance, 0.764 / 9, 'Sample variance Iris');
      // Sample std dev (ddof=1, N-1=9): sqrt(0.764 / 9) = 0.2913570127676646
      assertClose(stats.standardDeviation, Math.sqrt(0.764 / 9), 'Sample std Iris');
      // Type-7: idx = 9 * 0.25 = 2.25 -> sorted[2] + 0.25*(sorted[3]-sorted[2]) = 4.6 + 0.025 = 4.625
      assertClose(stats.q1, 4.625, 'Q1 Iris sample');
      assertClose(stats.median, 4.9, 'Median Iris sample');
      assertClose(stats.q3, 5.0, 'Q3 Iris sample');
      // IQR: 5.0 - 4.625 = 0.375
      assertClose(stats.iqr, 0.375, 'IQR Iris sample');
    });
  });

  describe('2. Penanganan Kasus Ekstrem & Kondisi Batas (Edge Cases)', () => {

    it('Kasus N = 0: seluruh metrik numerik mengembalikan null (PRD 4.3.D)', () => {
      const stats = calculateNumericStats([], 10);
      assert.equal(stats.count, 0);
      assert.equal(stats.missing, 10);
      assert.equal(stats.sum, null);
      assert.equal(stats.mean, null);
      assert.equal(stats.min, null);
      assert.equal(stats.max, null);
      assert.equal(stats.variance, null);
      assert.equal(stats.standardDeviation, null);
      assert.equal(stats.median, null);
      assert.equal(stats.q1, null);
      assert.equal(stats.q3, null);
      assert.equal(stats.iqr, null);
      assert.equal(stats.mode, null);
    });

    it('Kasus N = 1: Varians dan Std Dev bernilai null (N/A), nilai lain sama dengan x1 (PRD AC-04 & 4.3.B)', () => {
      const stats = calculateNumericStats([45], 10);
      assert.equal(stats.count, 1);
      assert.equal(stats.missing, 10);
      assert.equal(stats.sum, 45);
      assert.equal(stats.mean, 45);
      assert.equal(stats.min, 45);
      assert.equal(stats.max, 45);
      assert.equal(stats.median, 45);
      assert.equal(stats.q1, 45);
      assert.equal(stats.q3, 45);
      assert.equal(stats.iqr, 0);
      assert.equal(stats.variance, null, 'Varians N=1 wajib null (bukan 0 atau NaN)');
      assert.equal(stats.standardDeviation, null, 'Std Dev N=1 wajib null (bukan 0 atau NaN)');
      assert.deepEqual(stats.mode, [45], 'Modus N=1 adalah [x1]');
    });

    it('Kasus Varians Nol: seluruh observasi bernilai identik (PRD 8.1 Matriks Edge Cases)', () => {
      // 100 observasi bernilai 50
      const data = new Array(100).fill(50);
      const stats = calculateNumericStats(data, 0);

      assert.equal(stats.count, 100);
      assert.equal(stats.min, 50);
      assert.equal(stats.max, 50);
      assertClose(stats.sum, 5000, 'Sum identik');
      assertClose(stats.mean, 50, 'Mean identik');
      assert.equal(stats.variance, 0, 'Varians identik harus 0 eksak');
      assert.equal(stats.standardDeviation, 0, 'Std Dev identik harus 0 eksak');
      assert.equal(stats.iqr, 0, 'IQR identik harus 0');
      assert.deepEqual(stats.mode, [50], 'Modus identik adalah [50]');
    });

    it('Stabilitas numerik pada angka besar dengan varians kecil (mencegah catastrophic cancellation)', () => {
      const data = [1000000001, 1000000002, 1000000003];
      const stats = calculateNumericStats(data, 0);

      assert.equal(stats.count, 3);
      assertClose(stats.mean, 1000000002, 'Mean angka besar');
      assertClose(stats.variance, 1, 'Variance angka besar harus 1');
      assertClose(stats.standardDeviation, 1, 'Std Dev angka besar harus 1');
    });

    it('Penanganan nilai negatif dan skala campuran', () => {
      const data = [-100, -50, 0, 50, 100];
      const stats = calculateNumericStats(data, 0);

      assert.equal(stats.count, 5);
      assert.equal(stats.min, -100);
      assert.equal(stats.max, 100);
      assertClose(stats.sum, 0, 'Sum simetris negatif');
      assertClose(stats.mean, 0, 'Mean simetris negatif');
      assertClose(stats.median, 0, 'Median simetris negatif');
      // Varians: (10000 + 2500 + 0 + 2500 + 10000) / 4 = 25000 / 4 = 6250
      assertClose(stats.variance, 6250, 'Varians negatif');
      assertClose(stats.standardDeviation, Math.sqrt(6250), 'Std Dev negatif');
    });
  });

  describe('3. Statistik Kolom Kategorikal (FR-07)', () => {

    it('Menghitung Unique Count, Top Value, Frekuensi, dan Persentase', () => {
      const values = ['Apple', 'Banana', 'Apple', 'Cherry', 'Banana', 'Apple'];
      const stats = calculateCategoricalStats(values, 2);

      assert.equal(stats.count, 6);
      assert.equal(stats.missing, 2);
      assert.equal(stats.uniqueCount, 3);
      assert.equal(stats.topValue, 'Apple');
      assert.equal(stats.topValueFrequency, 3);

      assert.equal(stats.frequencies.length, 3);
      // Frequencies diurutkan menurun berdasarkan count
      assert.equal(stats.frequencies[0].value, 'Apple');
      assert.equal(stats.frequencies[0].count, 3);
      assertClose(stats.frequencies[0].percentage, 50.0, 'Persentase Apple');

      assert.equal(stats.frequencies[1].value, 'Banana');
      assert.equal(stats.frequencies[1].count, 2);
      assertClose(stats.frequencies[1].percentage, 33.333333, 'Persentase Banana');

      assert.equal(stats.frequencies[2].value, 'Cherry');
      assert.equal(stats.frequencies[2].count, 1);
      assertClose(stats.frequencies[2].percentage, 16.666667, 'Persentase Cherry');
    });

    it('Kolom kategorikal kosong (semua missing)', () => {
      const stats = calculateCategoricalStats([], 5);
      assert.equal(stats.count, 0);
      assert.equal(stats.missing, 5);
      assert.equal(stats.uniqueCount, 0);
      assert.equal(stats.topValue, null);
      assert.equal(stats.topValueFrequency, null);
      assert.deepEqual(stats.frequencies, []);
    });

    it('Kolom Boolean dan penanganan ties kategorikal terurut leksikografis', () => {
      const values = ['true', 'false', 'true', 'false'];
      const stats = calculateCategoricalStats(values, 0);

      assert.equal(stats.count, 4);
      assert.equal(stats.uniqueCount, 2);
      // Ties 2 vs 2: leksikografis 'false' vs 'true' -> 'false' muncul pertama
      assert.equal(stats.frequencies[0].value, 'false');
      assert.equal(stats.frequencies[0].count, 2);
      assert.equal(stats.frequencies[1].value, 'true');
      assert.equal(stats.frequencies[1].count, 2);
    });
  });

  describe('4. Parsing Nilai Numerik & Penanganan String Unparseable (PRD 4.1)', () => {

    it('Nilai numerik baku dan string valid ter-parse benar', () => {
      assert.equal(parseNumericValue(42), 42);
      assert.equal(parseNumericValue(3.14159), 3.14159);
      assert.equal(parseNumericValue(' 123.45 '), 123.45);
      assert.equal(parseNumericValue('-50'), -50);
    });

    it('Format desimal koma regional Indonesia (12,50)', () => {
      assert.equal(parseNumericValue('12,50', true), 12.5);
      assert.equal(parseNumericValue('-1.250,50', false), null); // bukan format regional koma murni
    });

    it('Nilai sentinel dan string tidak valid diabaikan (mengembalikan null)', () => {
      assert.equal(parseNumericValue(null), null);
      assert.equal(parseNumericValue(undefined), null);
      assert.equal(parseNumericValue(''), null);
      assert.equal(parseNumericValue('   '), null);
      assert.equal(parseNumericValue('NA'), null);
      assert.equal(parseNumericValue('N/A'), null);
      assert.equal(parseNumericValue('null'), null);
      assert.equal(parseNumericValue('NaN'), null);
      assert.equal(parseNumericValue('Infinity'), null);
      assert.equal(parseNumericValue('-Infinity'), null);
      assert.equal(parseNumericValue('abc'), null);
    });
  });

  describe('5. Integrasi Pipeline Dataset Penuh & Invariance Immutability', () => {

    const columns: ColumnSchema[] = [
      { id: 'age', name: 'Age', type: 'Numeric' },
      { id: 'income', name: 'Income', type: 'Numeric' },
      { id: 'city', name: 'City', type: 'Text' },
      { id: 'subscribed', name: 'Subscribed', type: 'Boolean' },
    ];

    const sampleDataset: Record<string, unknown>[] = [
      { age: 25, income: 5000, city: 'Jakarta', subscribed: 'true' },
      { age: 30, income: 6000, city: 'Bandung', subscribed: 'false' },
      { age: 35, income: null, city: 'Jakarta', subscribed: 'true' },
      { age: null, income: 8000, city: 'Surabaya', subscribed: 'true' },
      { age: '   ', income: 7000, city: '', subscribed: 'false' },
    ];

    it('Menghasilkan ringkasan deskriptif multi-kolom yang konsisten', () => {
      const summary = calculateDescriptiveStatistics('ds-test', sampleDataset, columns, {
        treatWhitespaceAsMissing: true,
      });

      assert.equal(summary.datasetId, 'ds-test');
      assert.equal(summary.totalRecords, 5);
      assert.equal(summary.columnStats.length, 4);

      // Kolom 'age': [25, 30, 35], 2 missing (null dan whitespace)
      const ageStats = summary.columnStats.find(c => c.columnId === 'age')!;
      assert.equal(ageStats.type, 'Numeric');
      assert.ok(ageStats.numericStats);
      assert.equal(ageStats.numericStats.count, 3);
      assert.equal(ageStats.numericStats.missing, 2);
      assertClose(ageStats.numericStats.mean, 30, 'Mean Age');
      assertClose(ageStats.numericStats.median, 30, 'Median Age');
      assert.equal(ageStats.numericStats.min, 25);
      assert.equal(ageStats.numericStats.max, 35);

      // Kolom 'city': ['Jakarta', 'Bandung', 'Jakarta', 'Surabaya'], 1 missing ('')
      const cityStats = summary.columnStats.find(c => c.columnId === 'city')!;
      assert.equal(cityStats.type, 'Text');
      assert.ok(cityStats.categoricalStats);
      assert.equal(cityStats.categoricalStats.count, 4);
      assert.equal(cityStats.categoricalStats.missing, 1);
      assert.equal(cityStats.categoricalStats.uniqueCount, 3);
      assert.equal(cityStats.categoricalStats.topValue, 'Jakarta');
      assert.equal(cityStats.categoricalStats.topValueFrequency, 2);
    });

    it('Non-Destructive: dataset sumber tidak termutasi sama sekali', () => {
      const cloneBefore = JSON.parse(JSON.stringify(sampleDataset));
      calculateDescriptiveStatistics('ds-immutability', sampleDataset, columns);
      assert.deepEqual(sampleDataset, cloneBefore, 'Dataset sumber tidak boleh berubah setelah komputasi');
    });

    it('Dataset kosong (0 baris) menghasilkan output aman tanpa throw exception', () => {
      const summary = calculateDescriptiveStatistics('ds-empty', [], columns);
      assert.equal(summary.totalRecords, 0);
      assert.equal(summary.columnStats.length, 4);
      for (const col of summary.columnStats) {
        if (col.numericStats) {
          assert.equal(col.numericStats.count, 0);
          assert.equal(col.numericStats.mean, null);
        }
        if (col.categoricalStats) {
          assert.equal(col.categoricalStats.count, 0);
          assert.equal(col.categoricalStats.topValue, null);
        }
      }
    });
  });

  describe('6. Store State Management Integration', () => {

    it('setDescriptiveStats menyimpan statistik dan di-reset saat setDataset/clearDataset dipanggil', () => {
      const store = useDatasetStore.getState();
      assert.equal(store.descriptiveStats, null);

      const mockSummary = {
        datasetId: 'd1',
        totalRecords: 10,
        columnStats: []
      };

      store.setDescriptiveStats(mockSummary);
      assert.equal(useDatasetStore.getState().descriptiveStats?.datasetId, 'd1');

      // Saat setDataset dipanggil (dataset baru dimuat), statistik deskriptif lama harus direset
      store.setDataset({
        id: 'd2',
        name: 'NewFile.csv',
        rowCount: 5,
        columnCount: 2,
        columns: []
      });
      assert.equal(useDatasetStore.getState().descriptiveStats, null, 'descriptiveStats harus di-reset saat dataset baru dimuat');

      // Isi kembali lalu clearDataset
      store.setDescriptiveStats(mockSummary);
      store.clearDataset();
      assert.equal(useDatasetStore.getState().descriptiveStats, null, 'descriptiveStats harus di-reset saat clearDataset');
    });
  });
});

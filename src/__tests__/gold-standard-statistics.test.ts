import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

import {
  calculateNumericStats,
  calculateCategoricalStats,
  calculateDescriptiveStatistics
} from '../lib/descriptive-stats';
import { inferColumnTypes } from '../lib/type-inference';
import { executeRecipe } from '../lib/recipe-engine';
import { ColumnSchema, RecipeStep } from '../types';

interface NumericGoldStandard {
  count: number;
  missing: number;
  sum: number | null;
  mean: number | null;
  median: number | null;
  mode: number[] | null;
  variance: number | null;
  standardDeviation: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
}

interface CategoricalGoldStandard {
  count: number;
  missing: number;
  uniqueCount: number;
  topValue: string | null;
  topValueFrequency: number | null;
  frequencies: Array<{
    value: string;
    count: number;
    percentage: number;
  }>;
}

interface GoldStandardJson {
  metadata: {
    generatedAt: string;
    pythonVersion: string;
    numpyVersion: string;
    pandasVersion: string;
    methodology: string;
    tolerancePolicy: {
      atol: number;
      rtol: number;
      discrete: string;
    };
  };
  mathematical_fixtures: Record<string, {
    description: string;
    raw_data: unknown[];
    numericStats?: NumericGoldStandard;
    categoricalStats?: CategoricalGoldStandard;
  }>;
  iris: {
    dataset: string;
    totalRecords: number;
    sourceUrl: string;
    provenance: string;
    columns: Record<string, {
      type: string;
      numericStats?: NumericGoldStandard;
      categoricalStats?: CategoricalGoldStandard;
    }>;
  };
  titanic: {
    dataset: string;
    totalRecords: number;
    sourceUrl: string;
    provenance: string;
    columns: Record<string, {
      type: string;
      isIdentifier?: boolean;
      totalCount?: number;
      missingCount?: number;
      validCount?: number;
      numericStats?: NumericGoldStandard;
      categoricalStats?: CategoricalGoldStandard;
    }>;
  };
}

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const GOLD_STANDARD_PATH = path.join(FIXTURES_DIR, 'statistics-gold-standard.json');
const IRIS_CSV_PATH = path.join(FIXTURES_DIR, 'iris.csv');
const TITANIC_CSV_PATH = path.join(FIXTURES_DIR, 'titanic.csv');

// Load frozen ground truth
const goldStandard: GoldStandardJson = JSON.parse(
  fs.readFileSync(GOLD_STANDARD_PATH, 'utf-8')
);

const ATOL = goldStandard.metadata.tolerancePolicy.atol; // 1e-5
const RTOL = goldStandard.metadata.tolerancePolicy.rtol; // 1e-5

function assertNumericClose(
  actual: number | null | undefined,
  expected: number | null | undefined,
  metricName: string,
  atol = ATOL,
  rtol = RTOL
) {
  if (expected === null || expected === undefined) {
    assert.strictEqual(
      actual,
      null,
      `[${metricName}] Diharapkan bernilai null, tetapi diperoleh ${actual}`
    );
    return;
  }

  assert.ok(
    actual !== null && actual !== undefined,
    `[${metricName}] Nilai aktual bernilai null/undefined, diharapkan ${expected}`
  );

  const diff = Math.abs(actual - expected);
  const maxAllowed = atol + rtol * Math.abs(expected);

  assert.ok(
    diff <= maxAllowed,
    `[${metricName}] Nilai aktual ${actual} menyimpang dari ground truth Python ${expected} (selisih: ${diff}, batas toleransi: ${maxAllowed})`
  );
}

function assertNumericStatsMatch(
  actual: ReturnType<typeof calculateNumericStats>,
  expected: NumericGoldStandard,
  context: string
) {
  // Diskrit (Exact match)
  assert.strictEqual(actual.count, expected.count, `${context} - count`);
  assert.strictEqual(actual.missing, expected.missing, `${context} - missing`);

  // Modus
  if (expected.mode === null) {
    assert.strictEqual(actual.mode, null, `${context} - mode null`);
  } else {
    assert.ok(actual.mode !== null, `${context} - mode tidak boleh null`);
    assert.strictEqual(actual.mode.length, expected.mode.length, `${context} - mode length`);
    for (let i = 0; i < expected.mode.length; i++) {
      assertNumericClose(actual.mode[i], expected.mode[i], `${context} - mode[${i}]`);
    }
  }

  // Continuous floats (Tolerance match atol=1e-5, rtol=1e-5)
  assertNumericClose(actual.sum, expected.sum, `${context} - sum`);
  assertNumericClose(actual.mean, expected.mean, `${context} - mean`);
  assertNumericClose(actual.min, expected.min, `${context} - min`);
  assertNumericClose(actual.max, expected.max, `${context} - max`);
  assertNumericClose(actual.median, expected.median, `${context} - median`);
  assertNumericClose(actual.q1, expected.q1, `${context} - q1 (Linear Type-7)`);
  assertNumericClose(actual.q3, expected.q3, `${context} - q3 (Linear Type-7)`);
  assertNumericClose(actual.iqr, expected.iqr, `${context} - iqr`);
  assertNumericClose(actual.variance, expected.variance, `${context} - variance (ddof=1)`);
  assertNumericClose(actual.standardDeviation, expected.standardDeviation, `${context} - standardDeviation (ddof=1)`);
}

function assertCategoricalStatsMatch(
  actual: ReturnType<typeof calculateCategoricalStats>,
  expected: CategoricalGoldStandard,
  context: string
) {
  assert.strictEqual(actual.count, expected.count, `${context} - count`);
  assert.strictEqual(actual.missing, expected.missing, `${context} - missing`);
  assert.strictEqual(actual.uniqueCount, expected.uniqueCount, `${context} - uniqueCount`);
  assert.strictEqual(actual.topValue, expected.topValue, `${context} - topValue`);
  assert.strictEqual(actual.topValueFrequency, expected.topValueFrequency, `${context} - topValueFrequency`);

  assert.strictEqual(actual.frequencies.length, expected.frequencies.length, `${context} - frequency buckets count`);
  for (let i = 0; i < expected.frequencies.length; i++) {
    const expItem = expected.frequencies[i];
    const actItem = actual.frequencies[i];
    assert.strictEqual(actItem.value, expItem.value, `${context} - freq[${i}].value`);
    assert.strictEqual(actItem.count, expItem.count, `${context} - freq[${i}].count`);
    assertNumericClose(actItem.percentage, expItem.percentage, `${context} - freq[${i}].percentage`);
  }
}

describe('TASK-QA-03 — Statistical Accuracy & Gold Standard Verification', () => {

  // =========================================================================
  // 1. VERIFIKASI METADATA & PROVENANCE GROUND TRUTH
  // =========================================================================
  describe('1. Verifikasi Metadata & Integritas Acuan Independen', () => {
    it('1.1. Memverifikasi ground truth dihasilkan menggunakan stack ilmiah Python, NumPy & Pandas', () => {
      assert.ok(goldStandard.metadata.pythonVersion.startsWith('3.13'));
      assert.ok(goldStandard.metadata.numpyVersion.startsWith('2.'));
      assert.ok(goldStandard.metadata.pandasVersion.startsWith('2.'));
      assert.strictEqual(goldStandard.metadata.tolerancePolicy.atol, 1e-5);
      assert.strictEqual(goldStandard.metadata.tolerancePolicy.rtol, 1e-5);
    });

    it('1.2. Memverifikasi ketersediaan berkas autentik Iris dan Titanic di repository', () => {
      assert.ok(fs.existsSync(IRIS_CSV_PATH), 'iris.csv harus tersedia');
      assert.ok(fs.existsSync(TITANIC_CSV_PATH), 'titanic.csv harus tersedia');
      assert.ok(fs.statSync(IRIS_CSV_PATH).size > 3000);
      assert.ok(fs.statSync(TITANIC_CSV_PATH).size > 50000);
    });
  });

  // =========================================================================
  // 2. MATRIKS FIXTURE MATEMATIS TERVERIFIKASI MANUAL & NUMPY
  // =========================================================================
  describe('2. Matriks Validasi Fixture Matematis Independen (10 Skenario)', () => {
    const fixtures = goldStandard.mathematical_fixtures;

    it('2.1. Fixture 1: Angka berurutan ganjil [1, 2, 3, 4, 5]', () => {
      const fix = fixtures.fixture_1_sequential_5;
      const actual = calculateNumericStats(fix.raw_data as number[], 0);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 1 (Sequential 5)');
    });

    it('2.2. Fixture 2: Angka berurutan genap [1, 2, 3, 4]', () => {
      const fix = fixtures.fixture_2_even_4;
      const actual = calculateNumericStats(fix.raw_data as number[], 0);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 2 (Even 4)');
    });

    it('2.3. Fixture 3: Nilai negatif, nol, dan desimal simetris [-10.5, -5.25, 0, 5.25, 10.5]', () => {
      const fix = fixtures.fixture_3_neg_zero_dec;
      const actual = calculateNumericStats(fix.raw_data as number[], 0);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 3 (Neg-Zero-Dec)');
    });

    it('2.4. Fixture 4: Nilai konstan identik (varians nol) [42, 42, 42, 42, 42, 42]', () => {
      const fix = fixtures.fixture_4_constant;
      const actual = calculateNumericStats(fix.raw_data as number[], 0);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 4 (Constant)');
      assert.strictEqual(actual.variance, 0);
      assert.strictEqual(actual.standardDeviation, 0);
      assert.deepEqual(actual.mode, [42]);
    });

    it('2.5. Fixture 5: Sampel tunggal N = 1 [99.9]', () => {
      const fix = fixtures.fixture_5_single_sample;
      const actual = calculateNumericStats(fix.raw_data as number[], 0);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 5 (Single sample)');
      assert.strictEqual(actual.variance, null);
      assert.strictEqual(actual.standardDeviation, null);
    });

    it('2.6. Fixture 6: Data dengan missing values [10, 20, 30] dengan missing = 2', () => {
      const fix = fixtures.fixture_6_missing_values;
      const actual = calculateNumericStats(fix.raw_data as number[], 2);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 6 (Missing values)');
      assert.strictEqual(actual.missing, 2);
      assert.strictEqual(actual.count, 3);
    });

    it('2.7. Fixture 7: Distribusi multimodal dengan nilai modus seri [1, 1, 2, 2, 3]', () => {
      const fix = fixtures.fixture_7_multimodal_ties;
      const actual = calculateNumericStats(fix.raw_data as number[], 0);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 7 (Multimodal ties)');
      assert.deepEqual(actual.mode, [1, 2]);
    });

    it('2.8. Fixture 8: Distribusi seluruh angka unik saat N > 1 [10, 20, 30, 40]', () => {
      const fix = fixtures.fixture_8_all_unique;
      const actual = calculateNumericStats(fix.raw_data as number[], 0);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 8 (All unique)');
      assert.strictEqual(actual.mode, null, 'Tidak ada modus jika frekuensi max = 1 pada N > 1');
    });

    it('2.9. Fixture 9: Kolom seluruh nilainya missing (N = 0 valid)', () => {
      const fix = fixtures.fixture_9_all_missing;
      const actual = calculateNumericStats([], 3);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 9 (All missing)');
      assert.strictEqual(actual.count, 0);
      assert.strictEqual(actual.missing, 3);
      assert.strictEqual(actual.mean, null);
    });

    it('2.10. Fixture 10: Magnitudo kecil presisi tinggi [1e-6 s/d 5e-6]', () => {
      const fix = fixtures.fixture_10_small_magnitude;
      const actual = calculateNumericStats(fix.raw_data as number[], 0);
      assertNumericStatsMatch(actual, fix.numericStats!, 'Fixture 10 (Small magnitude)');
    });

    it('2.11. Fixture Kategorikal: Distribusi frekuensi dengan ties terurut leksikografis', () => {
      const fix = fixtures.fixture_categorical_depts;
      const actual = calculateCategoricalStats(fix.raw_data as string[], 1);
      assertCategoricalStatsMatch(actual, fix.categoricalStats!, 'Fixture Categorical');
    });
  });

  // =========================================================================
  // 3. VERIFIKASI GOLD STANDARD DATASET IRIS AUTENTIK
  // =========================================================================
  describe('3. Verifikasi Gold Standard: Dataset Iris (Fisher 1936 / UCI / Seaborn)', () => {
    let irisRows: Record<string, unknown>[] = [];
    let irisColumns: ColumnSchema[] = [];

    it('3.1. Parsing berkas autentik Iris (150 baris x 5 kolom) via PapaParse', () => {
      const content = fs.readFileSync(IRIS_CSV_PATH, 'utf-8');
      const parsed = Papa.parse<Record<string, unknown>>(content, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });

      assert.strictEqual(parsed.data.length, goldStandard.iris.totalRecords);
      irisRows = parsed.data;

      const colNames = ['sepal_length', 'sepal_width', 'petal_length', 'petal_width', 'species'];
      irisColumns = inferColumnTypes(colNames, irisRows);

      // Verifikasi type inference
      assert.strictEqual(irisColumns.find(c => c.name === 'sepal_length')?.type, 'Numeric');
      assert.strictEqual(irisColumns.find(c => c.name === 'sepal_width')?.type, 'Numeric');
      assert.strictEqual(irisColumns.find(c => c.name === 'petal_length')?.type, 'Numeric');
      assert.strictEqual(irisColumns.find(c => c.name === 'petal_width')?.type, 'Numeric');
      assert.strictEqual(irisColumns.find(c => c.name === 'species')?.type, 'Text');
    });

    it('3.2. Verifikasi 4 kolom numerik Iris terhadap NumPy 2.3.1 (sepal_length, sepal_width, petal_length, petal_width)', () => {
      const summary = calculateDescriptiveStatistics('iris_ds', irisRows, irisColumns);
      const irisExpected = goldStandard.iris.columns;

      const numericCols = ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'];
      for (const colName of numericCols) {
        const colStat = summary.columnStats.find(c => c.columnName === colName);
        assert.ok(colStat, `Kolom ${colName} harus ditemukan dalam summary`);
        assert.ok(colStat.numericStats, `Kolom ${colName} harus memiliki numericStats`);

        const expected = irisExpected[colName].numericStats!;
        assertNumericStatsMatch(colStat.numericStats, expected, `Iris.${colName}`);
      }
    });

    it('3.3. Verifikasi kolom kategorikal Iris (species: setosa, versicolor, virginica)', () => {
      const summary = calculateDescriptiveStatistics('iris_ds', irisRows, irisColumns);
      const colStat = summary.columnStats.find(c => c.columnName === 'species');
      assert.ok(colStat?.categoricalStats);

      const expected = goldStandard.iris.columns.species.categoricalStats!;
      assertCategoricalStatsMatch(colStat.categoricalStats, expected, 'Iris.species');
    });
  });

  // =========================================================================
  // 4. VERIFIKASI GOLD STANDARD DATASET TITANIC AUTENTIK
  // =========================================================================
  describe('4. Verifikasi Gold Standard: Dataset Titanic (891 Baris x 12 Kolom)', () => {
    let titanicRows: Record<string, unknown>[] = [];
    let titanicColumns: ColumnSchema[] = [];

    it('4.1. Parsing berkas autentik Titanic (891 baris) dan verifikasi identitas kolom', () => {
      const content = fs.readFileSync(TITANIC_CSV_PATH, 'utf-8');
      const parsed = Papa.parse<Record<string, unknown>>(content, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });

      assert.strictEqual(parsed.data.length, goldStandard.titanic.totalRecords);
      titanicRows = parsed.data;

      const colNames = [
        'PassengerId', 'Survived', 'Pclass', 'Name', 'Sex',
        'Age', 'SibSp', 'Parch', 'Ticket', 'Fare', 'Cabin', 'Embarked'
      ];
      titanicColumns = inferColumnTypes(colNames, titanicRows);

      // Verifikasi bahwa kolom ID/Text seperti PassengerId dan Name tidak salah diidentifikasi
      const passengerIdCol = titanicColumns.find(c => c.name === 'PassengerId');
      assert.ok(passengerIdCol);
      assert.strictEqual(passengerIdCol.type, 'Text'); // PRD: Identifier diperlakukan sebagai Text
    });

    it('4.2. Verifikasi 4 kolom numerik Titanic terhadap NumPy 2.3.1 (Age, Fare, SibSp, Parch)', () => {
      // Siapkan kolom eksplisit untuk numerik Titanic
      const testedCols: ColumnSchema[] = [
        { id: 'Age', name: 'Age', type: 'Numeric' },
        { id: 'Fare', name: 'Fare', type: 'Numeric' },
        { id: 'SibSp', name: 'SibSp', type: 'Numeric' },
        { id: 'Parch', name: 'Parch', type: 'Numeric' },
      ];

      const summary = calculateDescriptiveStatistics('titanic_ds', titanicRows, testedCols);
      const titanicExpected = goldStandard.titanic.columns;

      for (const colName of ['Age', 'Fare', 'SibSp', 'Parch']) {
        const colStat = summary.columnStats.find(c => c.columnName === colName);
        assert.ok(colStat?.numericStats, `Kolom ${colName} harus memiliki numericStats`);

        const expected = titanicExpected[colName].numericStats!;
        assertNumericStatsMatch(colStat.numericStats, expected, `Titanic.${colName}`);
      }

      // Verifikasi khusus Age: 177 missing values ditangani dengan benar
      const ageStat = summary.columnStats.find(c => c.columnName === 'Age')?.numericStats;
      assert.strictEqual(ageStat?.count, 714);
      assert.strictEqual(ageStat?.missing, 177);
      assertNumericClose(ageStat?.mean, 29.699118, 'Titanic.Age mean');
      assertNumericClose(ageStat?.median, 28.0, 'Titanic.Age median');
      assertNumericClose(ageStat?.standardDeviation, 14.526497, 'Titanic.Age std dev');
    });

    it('4.3. Verifikasi kolom kategorikal Titanic terhadap Pandas 2.3.0 (Sex, Embarked, Pclass, Survived)', () => {
      const testedCols: ColumnSchema[] = [
        { id: 'Sex', name: 'Sex', type: 'Text' },
        { id: 'Embarked', name: 'Embarked', type: 'Text' },
        { id: 'Pclass', name: 'Pclass', type: 'Text' },
        { id: 'Survived', name: 'Survived', type: 'Text' },
      ];

      const summary = calculateDescriptiveStatistics('titanic_ds', titanicRows, testedCols);
      const titanicExpected = goldStandard.titanic.columns;

      for (const colName of ['Sex', 'Embarked', 'Pclass', 'Survived']) {
        const colStat = summary.columnStats.find(c => c.columnName === colName);
        assert.ok(colStat?.categoricalStats, `Kolom ${colName} harus memiliki categoricalStats`);

        const expected = titanicExpected[colName].categoricalStats!;
        assertCategoricalStatsMatch(colStat.categoricalStats, expected, `Titanic.${colName}`);
      }

      // Verifikasi Embarked: 2 missing values tercatat, S = 644, C = 168, Q = 77
      const embarkedStat = summary.columnStats.find(c => c.columnName === 'Embarked')?.categoricalStats;
      assert.strictEqual(embarkedStat?.missing, 2);
      assert.strictEqual(embarkedStat?.uniqueCount, 3);
      assert.strictEqual(embarkedStat?.topValue, 'S');
      assert.strictEqual(embarkedStat?.topValueFrequency, 644);
    });

    it('4.4. Verifikasi bahwa PassengerId, Name, Ticket, Cabin tidak dihitung statistika numeriknya', () => {
      // Identifier columns
      for (const idCol of ['PassengerId', 'Name', 'Ticket', 'Cabin']) {
        const schema = titanicColumns.find(c => c.name === idCol);
        assert.ok(schema);
        assert.strictEqual(schema.type, 'Text', `Kolom identifier ${idCol} harus bertipe Text`);
      }
    });
  });

  // =========================================================================
  // 5. KONSISTENSI ALUR DATA & PIPELINE INTEGRITY
  // =========================================================================
  describe('5. Konsistensi Pipeline Pembersihan terhadap Statistik Aktif', () => {
    it('5.1. Imputasi Median pada kolom Age memperbarui statistik deskriptif dataset aktif', () => {
      const cols: ColumnSchema[] = [
        { id: 'Age', name: 'Age', type: 'Numeric' },
        { id: 'Fare', name: 'Fare', type: 'Numeric' }
      ];

      // Ambil 20 baris pertama Titanic untuk pengujian pipeline deterministik
      const sliceData = goldStandard.titanic.columns.Age ? [
        { Age: '22', Fare: '7.25' },
        { Age: '38', Fare: '71.2833' },
        { Age: '26', Fare: '7.925' },
        { Age: '35', Fare: '53.1' },
        { Age: '35', Fare: '8.05' },
        { Age: null, Fare: '8.4583' }, // Missing Age
        { Age: '54', Fare: '51.8625' },
        { Age: '2', Fare: '21.075' },
        { Age: '27', Fare: '11.1333' },
        { Age: '14', Fare: '30.0708' }
      ] : [];

      // Sebelum imputasi: 1 missing Age
      const statsBefore = calculateDescriptiveStatistics('slice_ds', sliceData, cols);
      assert.strictEqual(statsBefore.columnStats[0].numericStats?.missing, 1);
      assert.strictEqual(statsBefore.columnStats[0].numericStats?.count, 9);

      // Terapkan Imputasi Median Type-7 pada Age
      const step: RecipeStep = {
        id: 'step-impute-age',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'Age',
        method: 'Median',
        description: 'Imputasi missing Age dengan median'
      };

      const result = executeRecipe(sliceData, cols, [step]);
      const statsAfter = calculateDescriptiveStatistics('slice_ds', result.data, cols);

      // Setelah imputasi: 0 missing Age, count = 10
      assert.strictEqual(statsAfter.columnStats[0].numericStats?.missing, 0);
      assert.strictEqual(statsAfter.columnStats[0].numericStats?.count, 10);

      // Raw dataset snapshot awal tidak pernah termutasi
      assert.strictEqual(sliceData[5].Age, null);
    });

    it('5.2. Reset Recipe mengembalikan perhitungan statistik 100% ke dataset sumber', () => {
      const cols: ColumnSchema[] = [{ id: 'val', name: 'val', type: 'Numeric' }];
      const raw = [{ val: 10 }, { val: 20 }, { val: null }];

      const step: RecipeStep = {
        id: 's1',
        timestamp: 1,
        type: 'IMPUTE_MISSING',
        targetColumn: 'val',
        method: 'FixedValue',
        fixedValue: 100,
        description: 'Impute 100'
      };

      // Terapkan recipe
      const applied = executeRecipe(raw, cols, [step]);
      const statsApplied = calculateDescriptiveStatistics('test', applied.data, cols);
      assert.strictEqual(statsApplied.columnStats[0].numericStats?.count, 3);
      assert.strictEqual(statsApplied.columnStats[0].numericStats?.sum, 130);

      // Reset (kosongkan recipe)
      const reset = executeRecipe(raw, cols, []);
      const statsReset = calculateDescriptiveStatistics('test', reset.data, cols);
      assert.strictEqual(statsReset.columnStats[0].numericStats?.count, 2);
      assert.strictEqual(statsReset.columnStats[0].numericStats?.missing, 1);
      assert.strictEqual(statsReset.columnStats[0].numericStats?.sum, 30);
    });
  });
});

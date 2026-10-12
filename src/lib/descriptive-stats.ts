import {
  ColumnSchema,
  NumericColumnStats,
  CategoricalColumnStats,
  CategoryFrequency,
  ColumnDescriptiveStats,
  DescriptiveStatisticsSummary
} from '../types';
import { isNativeMissing, isDirtyWhitespace } from './data-quality';

/**
 * Memeriksa kesesuaian nilai numerik floating-point dengan ground truth acuan
 * sesuai formulasi PRD Bagian 4.3.E.1:
 * abs(x_calc - x_ref) <= atol + rtol * abs(x_ref)
 */
export function isClose(calc: number, ref: number, atol = 1e-5, rtol = 1e-5): boolean {
  return Math.abs(calc - ref) <= (atol + rtol * Math.abs(ref));
}

/**
 * Menghitung persentil ke-p menggunakan Linear Interpolation Type-7
 * (Formula default NumPy method='linear', R default Type-7, Excel PERCENTILE.INC).
 * PRD Bagian 4.3.A:
 * Indeks 0-based virtual: idx = (N - 1) * p
 * k = floor(idx), d = idx - k
 * Q(p) = x[k] + d * (x[k + 1] - x[k])
 */
export function calculatePercentileType7(sortedValues: readonly number[], p: number): number | null {
  const n = sortedValues.length;
  if (n === 0) return null;
  if (n === 1) return sortedValues[0];
  if (p <= 0) return sortedValues[0];
  if (p >= 1) return sortedValues[n - 1];

  const idx = (n - 1) * p;
  const k = Math.floor(idx);
  const d = idx - k;

  if (k >= n - 1) {
    return sortedValues[n - 1];
  }

  return sortedValues[k] + d * (sortedValues[k + 1] - sortedValues[k]);
}

/**
 * Menghitung statistik deskriptif untuk array nilai numerik valid.
 * PRD FR-07, Bagian 4.3:
 * - Count, Missing, Sum, Mean, Median, Mode, Sample Variance (s^2, ddof=1),
 *   Sample Std Dev (s, ddof=1), Min, Max, Q1 (25%), Q3 (75%), IQR.
 */
export function calculateNumericStats(
  values: readonly number[],
  missingCount: number
): NumericColumnStats {
  const n = values.length;

  // Kasus N = 0: seluruh metrik numerik bernilai null (PRD 4.3.D)
  if (n === 0) {
    return {
      count: 0,
      missing: missingCount,
      sum: null,
      mean: null,
      median: null,
      mode: null,
      variance: null,
      standardDeviation: null,
      min: null,
      max: null,
      q1: null,
      q3: null,
      iqr: null,
    };
  }

  // Kasus N = 1: mean = x_1, min = x_1, max = x_1, median = x_1, q1 = x_1, q3 = x_1, iqr = 0
  // Varians dan Std Dev bernilai null (PRD 4.3.B & AC-04)
  if (n === 1) {
    const val = values[0];
    return {
      count: 1,
      missing: missingCount,
      sum: val,
      mean: val,
      median: val,
      mode: [val],
      variance: null,
      standardDeviation: null,
      min: val,
      max: val,
      q1: val,
      q3: val,
      iqr: 0,
    };
  }

  // Kasus N >= 2: komputasi normal
  // Salin dan urutkan nilai secara ascending untuk kuantil, min, max
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Penjumlahan IEEE 754 float64
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += sorted[i];
  }
  const mean = sum / n;

  // Kuantil Type-7
  const q1 = calculatePercentileType7(sorted, 0.25)!;
  const median = calculatePercentileType7(sorted, 0.50)!;
  const q3 = calculatePercentileType7(sorted, 0.75)!;
  const iqr = q3 - q1;

  // Varians sampel s^2 dengan Bessel's correction N - 1 (ddof=1)
  // Menggunakan two-pass algorithm untuk stabilitas numerik
  let sumSqDiff = 0;
  for (let i = 0; i < n; i++) {
    const diff = values[i] - mean;
    sumSqDiff += diff * diff;
  }
  let variance = sumSqDiff / (n - 1);
  // Proteksi floating-point negatif mendekati 0
  if (variance < 0 && variance > -1e-15) {
    variance = 0;
  }
  const standardDeviation = Math.sqrt(Math.max(0, variance));

  // Modus & Penanganan Nilai Seri / Multimodal (PRD 4.3.C)
  const freqMap = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const v = values[i];
    freqMap.set(v, (freqMap.get(v) || 0) + 1);
  }

  let maxFreq = 0;
  for (const count of freqMap.values()) {
    if (count > maxFreq) maxFreq = count;
  }

  let mode: number[] | null = null;
  // Jika seluruh observasi bernilai unik (frekuensi masing-masing = 1 saat N > 1), "Tidak Ada Modus"
  if (maxFreq === 1) {
    mode = null;
  } else {
    const modes: number[] = [];
    for (const [val, count] of freqMap.entries()) {
      if (count === maxFreq) {
        modes.push(val);
      }
    }
    modes.sort((a, b) => a - b);
    mode = modes;
  }

  return {
    count: n,
    missing: missingCount,
    sum,
    mean,
    median,
    mode,
    variance,
    standardDeviation,
    min,
    max,
    q1,
    q3,
    iqr,
  };
}

/**
 * Menghitung statistik deskriptif untuk kolom kategorikal/teks/boolean/tanggal.
 * PRD FR-07: Count, Missing, Unique Count, Top Value, Frekuensi Nilai Teratas, Frekuensi Kategorikal.
 */
export function calculateCategoricalStats(
  values: readonly string[],
  missingCount: number
): CategoricalColumnStats {
  const n = values.length;

  if (n === 0) {
    return {
      count: 0,
      missing: missingCount,
      uniqueCount: 0,
      topValue: null,
      topValueFrequency: null,
      frequencies: [],
    };
  }

  const freqMap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const v = values[i];
    freqMap.set(v, (freqMap.get(v) || 0) + 1);
  }

  const uniqueCount = freqMap.size;

  // Distribusi frekuensi kategorikal
  const frequencies: CategoryFrequency[] = Array.from(freqMap.entries())
    .map(([val, cnt]) => ({
      value: val,
      count: cnt,
      percentage: (cnt / n) * 100,
    }))
    .sort((a, b) => {
      // Urutkan menurun berdasarkan count, lalu menaik secara leksikografis
      if (b.count !== a.count) return b.count - a.count;
      return a.value.localeCompare(b.value);
    });

  const topValue = frequencies[0].value;
  const topValueFrequency = frequencies[0].count;

  return {
    count: n,
    missing: missingCount,
    uniqueCount,
    topValue,
    topValueFrequency,
    frequencies,
  };
}

/**
 * Mem-parse nilai numerik mentah dari baris data dengan aman.
 * Menangani angka murni, string angka, dan format desimal koma jika relevan.
 * Mengembalikan null jika nilai adalah missing atau tidak dapat diparsing (unparseable).
 */
export function parseNumericValue(val: unknown, regionalComma = false): number | null {
  if (val === null || val === undefined || val === '') return null;

  if (typeof val === 'number') {
    if (!Number.isNaN(val) && Number.isFinite(val)) {
      return val;
    }
    return null; // NaN atau Infinity diabaikan dari agregasi numerik
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.length === 0) return null;

    // Cek token non-numerik literal atau Infinity
    if (trimmed === 'NaN' || trimmed === 'Infinity' || trimmed === '-Infinity') {
      return null;
    }

    let candidate = trimmed;
    if (regionalComma && /^-?\d+,\d+$/.test(trimmed)) {
      candidate = trimmed.replace(',', '.');
    }

    const parsed = Number(candidate);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Menghitung Descriptive Statistics Summary secara lengkap untuk seluruh kolom dataset.
 * Bersifat murni dan non-destruktif: tidak memutasi data mentah asli.
 */
export function calculateDescriptiveStatistics(
  datasetId: string,
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[],
  options?: { treatWhitespaceAsMissing?: boolean }
): DescriptiveStatisticsSummary {
  const treatWhitespaceAsMissing = options?.treatWhitespaceAsMissing ?? true;
  const totalRecords = data.length;

  const columnStats: ColumnDescriptiveStats[] = columns.map(col => {
    const isNumericType = col.type === 'Numeric';
    const hasDecimalComma = col.profile?.regionalFormat === 'Decimal Comma';

    if (isNumericType) {
      const validNumbers: number[] = [];
      let missingCount = 0;

      for (let i = 0; i < totalRecords; i++) {
        const rawVal = data[i][col.id];

        if (isNativeMissing(rawVal) || (treatWhitespaceAsMissing && isDirtyWhitespace(rawVal))) {
          missingCount++;
          continue;
        }

        const num = parseNumericValue(rawVal, hasDecimalComma);
        if (num !== null) {
          validNumbers.push(num);
        } else {
          // Unparseable string pada kolom numerik (PRD 4.1.3 & 8.1)
          missingCount++;
        }
      }

      const numericStats = calculateNumericStats(validNumbers, missingCount);
      return {
        columnId: col.id,
        columnName: col.name,
        type: col.type,
        numericStats,
      };
    } else {
      // Kolom non-numerik (Text, Categorical, Boolean, DateTime)
      const validStrings: string[] = [];
      let missingCount = 0;

      for (let i = 0; i < totalRecords; i++) {
        const rawVal = data[i][col.id];

        if (isNativeMissing(rawVal) || (treatWhitespaceAsMissing && isDirtyWhitespace(rawVal))) {
          missingCount++;
          continue;
        }

        validStrings.push(String(rawVal).trim());
      }

      const categoricalStats = calculateCategoricalStats(validStrings, missingCount);
      return {
        columnId: col.id,
        columnName: col.name,
        type: col.type,
        categoricalStats,
      };
    }
  });

  return {
    datasetId,
    totalRecords,
    columnStats,
  };
}

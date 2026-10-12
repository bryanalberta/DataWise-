import { ColumnSchema, DataQualitySummary, ColumnMissingStats } from '../types';

/**
 * Mendeteksi native missing value: null, undefined, atau string kosong murni ("").
 */
export function isNativeMissing(val: unknown): boolean {
  return val === null || val === undefined || val === '';
}

/**
 * Mendeteksi dirty whitespace: string yang berisi HANYA spasi, tab, dsb. (tetapi bukan string kosong)
 */
export function isDirtyWhitespace(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return val.length > 0 && val.trim().length === 0;
}

/**
 * Membuat Row Key yang aman dari tabrakan dan serialisasi tipe ganda.
 */
export function createRowKey(row: Record<string, unknown>, columns: readonly ColumnSchema[]): string {
  // Array dari nilai yang sudah dinormalisasi tipe primitifnya
  const values = columns.map(col => {
    const val = row[col.id] !== undefined ? row[col.id] : row[col.name];
    // Membedakan tipe data, misalnya number 1 dan string "1" tidak tabrakan jika kita encode tipe.
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return `N:${val}`;
    if (typeof val === 'boolean') return `B:${val}`;
    return `S:${String(val)}`; // string fallback
  });
  // Serialisasi aman menggunakan JSON
  return JSON.stringify(values);
}

/**
 * Menghitung profil kualitas data secara keseluruhan.
 */
export function calculateDataQuality(
  datasetId: string,
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[],
  options?: { treatWhitespaceAsMissing?: boolean }
): DataQualitySummary {
  const treatWhitespaceAsMissing = options?.treatWhitespaceAsMissing ?? true;
  const totalRecords = data.length;

  let totalNativeMissing = 0;
  let totalWhitespace = 0;

  // Inisialisasi map statistik per kolom
  const colStats = new Map<string, { native: number; ws: number }>();
  for (const col of columns) {
    colStats.set(col.id, { native: 0, ws: 0 });
  }

  // 1. Missing Values
  for (let i = 0; i < totalRecords; i++) {
    const row = data[i];
    for (const col of columns) {
      const val = row[col.id] !== undefined ? row[col.id] : row[col.name];
      const stats = colStats.get(col.id)!;

      if (isNativeMissing(val)) {
        stats.native++;
        totalNativeMissing++;
      } else if (isDirtyWhitespace(val)) {
        stats.ws++;
        totalWhitespace++;
      }
    }
  }

  // Rekapitulasi per kolom
  const columnStats: ColumnMissingStats[] = columns.map(col => {
    const stats = colStats.get(col.id)!;
    const effectiveMissingCount = stats.native + (treatWhitespaceAsMissing ? stats.ws : 0);
    const effectiveMissingPercentage = totalRecords > 0 
      ? (effectiveMissingCount / totalRecords) * 100 
      : 0;

    return {
      columnId: col.id,
      nativeMissingCount: stats.native,
      whitespaceCount: stats.ws,
      effectiveMissingCount,
      effectiveMissingPercentage
    };
  });

  const totalEffectiveMissing = totalNativeMissing + (treatWhitespaceAsMissing ? totalWhitespace : 0);

  // 2. Duplicate Detection
  let duplicateOccurrences = 0;
  let rowsParticipatingInDuplicates = 0;

  if (totalRecords > 0 && columns.length > 0) {
    // Menghitung frekuensi tiap row key
    const rowKeyFreq = new Map<string, number>();
    for (let i = 0; i < totalRecords; i++) {
      const key = createRowKey(data[i], columns);
      rowKeyFreq.set(key, (rowKeyFreq.get(key) || 0) + 1);
    }

    // Mengakumulasi statistik dari frekuensi
    for (const count of rowKeyFreq.values()) {
      if (count > 1) {
        // Baris yang kembar menyumbang (count - 1) occurrences berlebih
        duplicateOccurrences += (count - 1);
        // Semua anggota baris yang memiliki salinan turut berpartisipasi
        rowsParticipatingInDuplicates += count;
      }
    }
  }

  return {
    datasetId,
    totalRecords,
    totalNativeMissing,
    totalWhitespace,
    totalEffectiveMissing,
    duplicateOccurrences,
    rowsParticipatingInDuplicates,
    columnStats
  };
}

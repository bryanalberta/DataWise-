/**
 * Dataset Metrics Calculator
 * Menyediakan logika murni untuk menghitung metrik ringkasan dataset.
 * Dipisahkan dari UI agar dapat diuji secara mandiri sesuai persyaratan FND-04.
 */

/**
 * Mengestimasi penggunaan memori struktur data hasil parsing di dalam heap.
 * Berdasarkan sampel data (100 baris pertama) dan diekstrapolasi ke total baris.
 * Asumsi (JavaScript V8 Engine):
 * - Object dasar: ~24 bytes overhead
 * - String: ~16 bytes overhead + 2 bytes per karakter
 * - Number: 8 bytes
 * - Boolean: 4 bytes
 * - Null/Undefined: 4 bytes
 * - Array overhead: ~8 bytes per elemen array terluar
 * 
 * @param sampleData Sampel baris data yang sudah diparsing
 * @param totalRows Total baris aktual
 * @returns Estimasi penggunaan memori dalam byte
 */
export function estimateMemoryUsage(sampleData: readonly Record<string, unknown>[], totalRows: number): number {
  if (totalRows === 0 || sampleData.length === 0) return 0;

  let totalBytesInSample = 0;

  for (const row of sampleData) {
    totalBytesInSample += 24; // Object overhead

    for (const [key, value] of Object.entries(row)) {
      // Key size (string)
      totalBytesInSample += 16 + (key.length * 2);

      // Value size
      if (typeof value === 'string') {
        totalBytesInSample += 16 + (value.length * 2);
      } else if (typeof value === 'number') {
        totalBytesInSample += 8;
      } else if (typeof value === 'boolean') {
        totalBytesInSample += 4;
      } else if (value === null || value === undefined) {
        totalBytesInSample += 4;
      } else {
        // Fallback untuk struktur lain
        totalBytesInSample += 24; 
      }
    }
  }

  const averageRowBytes = totalBytesInSample / sampleData.length;
  // Ditambah array pointer overhead per elemen
  return Math.round((averageRowBytes + 8) * totalRows);
}

/**
 * Menentukan status integritas dataset berdasarkan struktur dan hasil parsing.
 * - 'VALID': Memiliki baris dan kolom yang sah.
 * - 'WARNING': Memiliki baris/kolom tetapi ada inkonsistensi struktur atau error parsial.
 * - 'INVALID': Kosong, gagal parsing, atau tidak dapat digunakan.
 * - 'UNKNOWN': Status belum tersedia (kosong).
 */
export function determineIntegrityStatus(
  rowCount: number, 
  columnCount: number, 
  parserWarningsCount: number = 0
): 'VALID' | 'WARNING' | 'INVALID' | 'UNKNOWN' {
  if (rowCount === 0 && columnCount === 0) {
    return parserWarningsCount > 0 ? 'INVALID' : 'UNKNOWN';
  }

  if (rowCount === 0 || columnCount === 0) {
    return 'INVALID';
  }

  if (parserWarningsCount > 0) {
    return 'WARNING';
  }

  return 'VALID';
}

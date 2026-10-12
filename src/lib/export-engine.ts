import * as XLSX from 'xlsx';
import { ColumnSchema } from '../types';

export interface CsvSerializeOptions {
  readonly delimiter?: ',' | ';' | '\t';
  readonly includeBom?: boolean;
  readonly lineEnding?: '\r\n' | '\n';
}

export interface XlsxSerializeOptions {
  readonly sheetName?: string;
}

/**
 * Meng-escape satu nilai cell menjadi format RFC 4180 CSV yang aman.
 * - Nilai null/undefined diserialisasi menjadi string kosong.
 * - Nilai Boolean/Number diformat sesuai nilai aslinya.
 * - String yang mengandung delimiter, tanda kutip, newline (\n), atau carriage return (\r)
 *   wajib dibungkus tanda kutip ganda dan tanda kutip internal di-escape menjadi "".
 * - Tidak melakukan manipulasi formula diam-diam (transparan).
 */
export function escapeCsvField(value: unknown, delimiter: string = ','): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const str = String(value);

  // Periksa apakah memerlukan quoting per RFC 4180
  const needsQuotes =
    str.includes(delimiter) ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r');

  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Menserialisasi dataset tabular menjadi string CSV ber-encoding UTF-8.
 * Mendukung kustomisasi delimiter dan UTF-8 BOM untuk kompatibilitas Excel.
 */
export function serializeToCsv(
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[] | readonly string[],
  options: CsvSerializeOptions = {}
): string {
  const delimiter = options.delimiter || ',';
  const includeBom = options.includeBom !== false; // Default true untuk Excel compatibility
  const lineEnding = options.lineEnding || '\r\n'; // RFC 4180 standar

  // Normalisasi skema kolom
  const colDefs = columns.map((col) => {
    if (typeof col === 'string') {
      return { key: col, name: col };
    }
    return { key: col.name, name: col.name };
  });

  // Baris header
  const headerLine = colDefs
    .map((c) => escapeCsvField(c.name, delimiter))
    .join(delimiter);

  if (data.length === 0) {
    const csvContent = headerLine;
    return includeBom ? `\uFEFF${csvContent}` : csvContent;
  }

  // Baris data
  const dataLines = data.map((row) =>
    colDefs
      .map((c) => {
        const val = row[c.key] !== undefined ? row[c.key] : row[c.name];
        return escapeCsvField(val, delimiter);
      })
      .join(delimiter)
  );

  const csvContent = `${headerLine}${lineEnding}${dataLines.join(lineEnding)}`;
  return includeBom ? `\uFEFF${csvContent}` : csvContent;
}

/**
 * Membersihkan nama sheet agar valid sesuai spesifikasi Microsoft Excel:
 * - Panjang maksimal 31 karakter
 * - Tidak boleh mengandung karakter terlarang: \ / ? * [ ] :
 * - Tidak boleh kosong
 */
export function sanitizeSheetName(name: string, fallback: string = 'Data Aktif'): string {
  const sanitized = name.replace(/[\\/?*[\]:]/g, '_').trim();
  const truncated = sanitized.slice(0, 31);
  return truncated.length > 0 ? truncated : fallback;
}

/**
 * Menserialisasi dataset tabular menjadi workbook Excel (.xlsx) valid menggunakan SheetJS.
 * - Memastikan tipe data string, angka, dan boolean terjaga presisi.
 * - String dengan leading zeros (misal "0123") dipertahankan sebagai tipe text ('s').
 * - Dataset kosong tetap mempertahankan baris header.
 */
export function serializeToXlsx(
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[] | readonly string[],
  options: XlsxSerializeOptions = {}
): ArrayBuffer {
  const sheetName = sanitizeSheetName(options.sheetName || 'Data Aktif');

  // Normalisasi skema kolom
  const colDefs = columns.map((col) => {
    if (typeof col === 'string') {
      return { key: col, name: col };
    }
    return { key: col.name, name: col.name };
  });

  const ws: XLSX.WorkSheet = {};
  const totalCols = colDefs.length;

  // Header row (baris 0)
  for (let c = 0; c < totalCols; c++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c });
    ws[cellAddress] = { t: 's', v: colDefs[c].name };
  }

  // Data rows (baris 1 .. N)
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    for (let c = 0; c < totalCols; c++) {
      const colDef = colDefs[c];
      const val = row[colDef.key] !== undefined ? row[colDef.key] : row[colDef.name];
      const cellAddress = XLSX.utils.encode_cell({ r: r + 1, c });

      if (val === null || val === undefined || val === '') {
        // Biarkan kosong di Excel
        continue;
      }

      if (typeof val === 'number') {
        if (Number.isFinite(val)) {
          ws[cellAddress] = { t: 'n', v: val };
        }
      } else if (typeof val === 'boolean') {
        ws[cellAddress] = { t: 'b', v: val };
      } else if (val instanceof Date) {
        ws[cellAddress] = { t: 'd', v: val };
      } else {
        // String (termasuk "0123" atau teks dengan leading zeros)
        ws[cellAddress] = { t: 's', v: String(val) };
      }
    }
  }

  // Rentang worksheet (!ref)
  const totalRows = data.length > 0 ? data.length : 0;
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: totalRows, c: Math.max(0, totalCols - 1) },
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Write to ArrayBuffer
  const buffer = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;

  return buffer;
}

/**
 * Membersihkan nama file agar aman digunakan pada sistem operasi klien:
 * - Menghilangkan karakter terlarang: \ / : * ? " < > |
 * - Menghilangkan karakter kontrol dan spasi di ujung
 */
export function sanitizeFileName(name: string, fallback: string = 'datawise_export'): string {
  const sanitized = name.replace(/[\\/:*?"<>|\0]/g, '_').trim();
  const withoutLeadingDot = sanitized.replace(/^\.+/, '');
  return withoutLeadingDot.length > 0 ? withoutLeadingDot : fallback;
}

/**
 * Memicu unduhan file langsung di browser dari Blob atau ArrayBuffer tanpa server.
 */
export function downloadFileBlob(
  data: ArrayBuffer | Blob | string,
  fileName: string,
  mimeType: string
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  let blob: Blob;
  if (data instanceof Blob) {
    blob = data;
  } else if (typeof data === 'string') {
    blob = new Blob([data], { type: mimeType });
  } else {
    blob = new Blob([data], { type: mimeType });
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Bersihkan resource Object URL
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

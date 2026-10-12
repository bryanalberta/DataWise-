import { ColumnSchema } from '../types';

/**
 * Heuristik kata kunci identifier
 */
const ID_KEYWORDS = ['id', 'code', 'zip', 'postal', 'nik', 'phone', 'telepon', 'nomor'];

/**
 * Memeriksa apakah nama kolom mengindikasikan kolom tersebut adalah identifier.
 */
export function isIdentifierColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  // Cocokkan kata kunci penuh atau bagian dari nama yang relevan (misal 'user_id', 'id_pegawai')
  const keywordMatch = ID_KEYWORDS.some(kw => {
    const regex = new RegExp(`(^|[^a-zA-Z])${kw}([^a-zA-Z]|$)`, 'i');
    return regex.test(lower);
  });
  if (keywordMatch) return true;

  // Deteksi batas camelCase untuk identifier (misal 'PassengerId', 'userId', 'customerID', 'IdMember', 'idMember')
  const camelCaseMatch =
    /[a-z](?:Id|ID)(?=[A-Z0-9]|[^a-zA-Z]|$)|^(?:Id|ID|id)(?=[A-Z0-9])/.test(columnName);
  return camelCaseMatch;
}

/**
 * Memeriksa apakah string adalah tanggal ISO 8601 atau YYYY-MM-DD yang valid
 */
function isValidISOOrYYYYMMDD(val: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
  if (!regex.test(val)) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

/**
 * Mengekstrak komponen tanggal dari MM/DD/YYYY atau DD/MM/YYYY
 */
function extractSlashDateComponents(val: string): { p1: number; p2: number; y: number } | null {
  const match = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return { p1: parseInt(match[1], 10), p2: parseInt(match[2], 10), y: parseInt(match[3], 10) };
}

/**
 * Fungsi utama untuk inferensi tipe
 */
export function inferColumnTypes(
  columns: string[],
  data: Record<string, unknown>[]
): ColumnSchema[] {
  return columns.map(colId => {
    // 1. Kumpulkan maksimal 1000 sampel non-kosong
    const samples: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const val = data[i][colId];
      if (val !== null && val !== undefined && val !== '') {
        samples.push(String(val).trim());
      }
      if (samples.length >= 1000) break;
    }

    const totalSamples = samples.length;

    // Jika tidak ada data, default ke Text
    if (totalSamples === 0) {
      return {
        id: colId,
        name: colId,
        type: 'Text',
        profile: { inferredType: 'Text', confidenceScore: 100 }
      };
    }

    const colIsId = isIdentifierColumn(colId);
    let hasLeadingZeroId = false;

    // Cek Leading Zero (seperti "081234") -> ini mengindikasikan identifier
    for (const s of samples) {
      if (/^0\d{2,}$/.test(s)) {
        hasLeadingZeroId = true;
        break;
      }
    }

    const isIdentifier = colIsId || hasLeadingZeroId;

    if (isIdentifier) {
      return {
        id: colId,
        name: colId,
        type: 'Text',
        profile: { 
          inferredType: 'Text', 
          confidenceScore: 100,
          isIdentifier: true,
          formatWarning: colIsId ? 'Deteksi kata kunci identifier' : 'Deteksi leading zero'
        }
      };
    }

    // 2. Cek Boolean (Priority 1)
    let boolMatches = 0;
    const boolRegex = /^(true|false|1|0|yes|no)$/i;
    for (const s of samples) {
      if (boolRegex.test(s)) boolMatches++;
    }
    const boolRate = boolMatches / totalSamples;
    if (boolRate >= 0.95) {
      return {
        id: colId,
        name: colId,
        type: 'Boolean',
        profile: { inferredType: 'Boolean', confidenceScore: Math.round(boolRate * 100) }
      };
    }

    // 3. Cek Date/DateTime (Priority 2)
    let dateMatches = 0;
    let hasP1Gt12 = false;
    let hasP2Gt12 = false;
    let slashFormatCount = 0;

    for (const s of samples) {
      if (isValidISOOrYYYYMMDD(s)) {
        dateMatches++;
      } else {
        const comps = extractSlashDateComponents(s);
        if (comps) {
          slashFormatCount++;
          if (comps.p1 > 12 && comps.p1 <= 31 && comps.p2 <= 12) hasP1Gt12 = true; // pasti DD/MM
          if (comps.p2 > 12 && comps.p2 <= 31 && comps.p1 <= 12) hasP2Gt12 = true; // pasti MM/DD
          
          // Validasi rentang dasar
          if ((comps.p1 <= 31 && comps.p2 <= 12) || (comps.p2 <= 31 && comps.p1 <= 12)) {
            dateMatches++;
          }
        }
      }
    }

    const dateRate = dateMatches / totalSamples;
    if (dateRate >= 0.90) {
      // Cek ambiguitas jika ada slash format
      if (slashFormatCount > 0) {
        if (!hasP1Gt12 && !hasP2Gt12) {
          // Ambiguitas tak terpecahkan
          return {
            id: colId,
            name: colId,
            type: 'Text',
            profile: {
              inferredType: 'Text',
              confidenceScore: Math.round(dateRate * 100),
              formatWarning: 'Ambiguous Date Format (DD/MM vs MM/DD)'
            }
          };
        }
      }
      return {
        id: colId,
        name: colId,
        type: 'DateTime',
        profile: { inferredType: 'DateTime', confidenceScore: Math.round(dateRate * 100) }
      };
    }

    // 4. Cek Numeric (Priority 3)
    let numMatches = 0;
    let hasDecimalComma = false;
    
    // Pola angka internasional biasa (titik desimal) atau ribuan dengan koma
    // Cukup longgar: opsional tanda minus, digit, titik, koma
    const numIntlRegex = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
    const numIntlPlainRegex = /^-?\d+(\.\d+)?$/;
    
    // Pola desimal regional: 1.234,56 atau 1234,56
    const numRegRegex = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/;
    const numRegPlainRegex = /^-?\d+(,\d+)?$/;

    for (const s of samples) {
      // Cek pure number
      if (!isNaN(Number(s)) && s.trim() !== '') {
        numMatches++;
      } else if (numIntlRegex.test(s) || numIntlPlainRegex.test(s)) {
        numMatches++;
      } else if (numRegRegex.test(s) || (numRegPlainRegex.test(s) && s.includes(','))) {
        numMatches++;
        hasDecimalComma = true;
      }
    }

    const numRate = numMatches / totalSamples;
    if (numRate >= 0.90) {
      return {
        id: colId,
        name: colId,
        type: 'Numeric',
        profile: { 
          inferredType: 'Numeric', 
          confidenceScore: Math.round(numRate * 100),
          regionalFormat: hasDecimalComma ? 'Decimal Comma' : undefined
        }
      };
    }

    // 5. Fallback ke Text/Categorical
    return {
      id: colId,
      name: colId,
      type: 'Text',
      profile: { inferredType: 'Text', confidenceScore: 100 }
    };
  });
}

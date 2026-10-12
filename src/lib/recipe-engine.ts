import { ColumnSchema, RecipeStep, RecipePreviewResult } from '../types';
import { isNativeMissing, createRowKey } from './data-quality';
import { calculatePercentileType7, parseNumericValue } from './descriptive-stats';

/**
 * Menghasilkan ID unik untuk setiap langkah recipe pembersihan.
 */
export function createRecipeStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Mencari kolom berdasarkan id atau name secara fleksibel.
 */
export function findColumn(columns: readonly ColumnSchema[], identifier: string): ColumnSchema | undefined {
  return columns.find(c => c.id === identifier || c.name === identifier);
}

/**
 * Mengambil nilai sel dari baris secara fleksibel (mendukung key col.id maupun col.name).
 */
export function getCellValue(row: Record<string, unknown>, col: ColumnSchema): unknown {
  if (row[col.id] !== undefined) return row[col.id];
  if (row[col.name] !== undefined) return row[col.name];
  return undefined;
}

/**
 * Menghitung nilai modus secara deterministik untuk nilai numerik.
 * Mengikuti spesifikasi PRD 4.3.C:
 * - Mengembalikan null jika seluruh observasi unik saat N > 1 (Tidak Ada Modus)
 * - Jika multimodal, mengurutkan nilai seri secara ascending dan mengembalikan [modes, selected]
 */
export function calculateNumericMode(values: readonly number[]): {
  modes: number[];
  selectedMode: number | null;
  maxFreq: number;
  isMultimodal: boolean;
  hasNoMode: boolean;
} {
  const n = values.length;
  if (n === 0) {
    return { modes: [], selectedMode: null, maxFreq: 0, isMultimodal: false, hasNoMode: true };
  }
  if (n === 1) {
    return { modes: [values[0]], selectedMode: values[0], maxFreq: 1, isMultimodal: false, hasNoMode: false };
  }

  const freqMap = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const v = values[i];
    freqMap.set(v, (freqMap.get(v) || 0) + 1);
  }

  let maxFreq = 0;
  for (const count of freqMap.values()) {
    if (count > maxFreq) maxFreq = count;
  }

  if (maxFreq === 1 && n > 1) {
    return { modes: [], selectedMode: null, maxFreq: 1, isMultimodal: false, hasNoMode: true };
  }

  const modes: number[] = [];
  for (const [val, count] of freqMap.entries()) {
    if (count === maxFreq) {
      modes.push(val);
    }
  }
  modes.sort((a, b) => a - b);

  return {
    modes,
    selectedMode: modes[0],
    maxFreq,
    isMultimodal: modes.length > 1,
    hasNoMode: false,
  };
}

/**
 * Menghitung nilai modus secara deterministik untuk nilai kategorikal/string.
 * PRD FR-07 & FR-10:
 * - Mengurutkan ties secara leksikografis menaik
 */
export function calculateCategoricalMode(values: readonly string[]): {
  modes: string[];
  selectedMode: string | null;
  maxFreq: number;
  isMultimodal: boolean;
  hasNoMode: boolean;
} {
  const n = values.length;
  if (n === 0) {
    return { modes: [], selectedMode: null, maxFreq: 0, isMultimodal: false, hasNoMode: true };
  }
  if (n === 1) {
    return { modes: [values[0]], selectedMode: values[0], maxFreq: 1, isMultimodal: false, hasNoMode: false };
  }

  const freqMap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const v = values[i];
    freqMap.set(v, (freqMap.get(v) || 0) + 1);
  }

  let maxFreq = 0;
  for (const count of freqMap.values()) {
    if (count > maxFreq) maxFreq = count;
  }

  if (maxFreq === 1 && n > 1) {
    return { modes: [], selectedMode: null, maxFreq: 1, isMultimodal: false, hasNoMode: true };
  }

  const modes: string[] = [];
  for (const [val, count] of freqMap.entries()) {
    if (count === maxFreq) {
      modes.push(val);
    }
  }
  modes.sort((a, b) => a.localeCompare(b));

  return {
    modes,
    selectedMode: modes[0],
    maxFreq,
    isMultimodal: modes.length > 1,
    hasNoMode: false,
  };
}

/**
 * Menghitung preview dampak live dari satu langkah recipe tanpa mengubah dataset asli/aktif.
 */
export function previewRecipeStep(
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[],
  step: RecipeStep
): RecipePreviewResult {
  const totalRows = data.length;

  switch (step.type) {
    case 'DROP_MISSING': {
      let targetColumns: ColumnSchema[];
      if (step.targetColumns && step.targetColumns.length > 0) {
        targetColumns = [];
        for (const colId of step.targetColumns) {
          const found = findColumn(columns, colId);
          if (!found) {
            return {
              canApply: false,
              impactedRows: 0,
              impactedCells: 0,
              summaryMessage: `Kolom '${colId}' tidak ditemukan dalam skema dataset.`,
              error: `Kolom '${colId}' tidak ditemukan.`
            };
          }
          targetColumns.push(found);
        }
      } else {
        targetColumns = [...columns];
      }

      let droppedCount = 0;
      for (let i = 0; i < totalRows; i++) {
        const row = data[i];
        let hasMissing = false;
        for (const col of targetColumns) {
          if (isNativeMissing(getCellValue(row, col))) {
            hasMissing = true;
            break;
          }
        }
        if (hasMissing) {
          droppedCount++;
        }
      }

      const isAllCols = !step.targetColumns || step.targetColumns.length === 0 || step.targetColumns.length === columns.length;
      const targetDesc = isAllCols
        ? 'seluruh kolom'
        : `kolom terpilih (${targetColumns.map(c => c.name).join(', ')})`;

      return {
        canApply: true,
        impactedRows: droppedCount,
        impactedCells: 0,
        summaryMessage: droppedCount > 0
          ? `Akan menghapus ${droppedCount} baris yang memiliki nilai kosong pada ${targetDesc}. Sisa baris: ${totalRows - droppedCount}.`
          : `Tidak ada baris dengan nilai kosong pada ${targetDesc}. Tidak ada baris yang akan dihapus.`,
      };
    }

    case 'IMPUTE_MISSING': {
      const col = findColumn(columns, step.targetColumn);
      if (!col) {
        return {
          canApply: false,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Kolom '${step.targetColumn}' tidak ditemukan dalam dataset.`,
          error: `Kolom '${step.targetColumn}' tidak ditemukan.`
        };
      }

      let missingCount = 0;
      const validRawValues: unknown[] = [];
      for (let i = 0; i < totalRows; i++) {
        const val = getCellValue(data[i], col);
        if (isNativeMissing(val)) {
          missingCount++;
        } else {
          validRawValues.push(val);
        }
      }

      if (missingCount === 0) {
        return {
          canApply: true,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Kolom '${col.name}' tidak memiliki nilai kosong (0 missing). Tidak ada sel yang perlu diimputasi.`,
        };
      }

      // Validasi ketersediaan data valid untuk metode selain FixedValue
      if (validRawValues.length === 0 && step.method !== 'FixedValue') {
        return {
          canApply: false,
          impactedRows: 0,
          impactedCells: missingCount,
          summaryMessage: `Kolom '${col.name}' tidak memiliki observasi yang valid untuk menghitung nilai ${step.method}.`,
          error: `Seluruh observasi pada kolom '${col.name}' kosong (N = 0).`
        };
      }

      if (step.method === 'Mean') {
        if (col.type !== 'Numeric') {
          return {
            canApply: false,
            impactedRows: 0,
            impactedCells: missingCount,
            summaryMessage: `Metode Mean hanya didukung untuk kolom bertipe numerik (tipe saat ini: ${col.type}).`,
            error: `Tipe kolom tidak kompatibel dengan Mean.`
          };
        }

        const nums: number[] = [];
        for (const raw of validRawValues) {
          const parsed = parseNumericValue(raw);
          if (parsed !== null) nums.push(parsed);
        }

        if (nums.length === 0) {
          return {
            canApply: false,
            impactedRows: 0,
            impactedCells: missingCount,
            summaryMessage: `Tidak ada observasi angka valid pada kolom '${col.name}' untuk menghitung Mean.`,
            error: `Tidak ada angka valid.`
          };
        }

        let sum = 0;
        for (let i = 0; i < nums.length; i++) sum += nums[i];
        const meanVal = sum / nums.length;

        return {
          canApply: true,
          impactedRows: 0,
          impactedCells: missingCount,
          replacementValue: meanVal,
          summaryMessage: `${missingCount} sel kosong pada kolom '${col.name}' akan diisi dengan Mean: ${meanVal.toFixed(4)}.`,
        };
      }

      if (step.method === 'Median') {
        if (col.type !== 'Numeric') {
          return {
            canApply: false,
            impactedRows: 0,
            impactedCells: missingCount,
            summaryMessage: `Metode Median hanya didukung untuk kolom bertipe numerik (tipe saat ini: ${col.type}).`,
            error: `Tipe kolom tidak kompatibel dengan Median.`
          };
        }

        const nums: number[] = [];
        for (const raw of validRawValues) {
          const parsed = parseNumericValue(raw);
          if (parsed !== null) nums.push(parsed);
        }

        if (nums.length === 0) {
          return {
            canApply: false,
            impactedRows: 0,
            impactedCells: missingCount,
            summaryMessage: `Tidak ada observasi angka valid pada kolom '${col.name}' untuk menghitung Median.`,
            error: `Tidak ada angka valid.`
          };
        }

        nums.sort((a, b) => a - b);
        const medianVal = calculatePercentileType7(nums, 0.5);
        if (medianVal === null) {
          return {
            canApply: false,
            impactedRows: 0,
            impactedCells: missingCount,
            summaryMessage: `Gagal menghitung Median pada kolom '${col.name}'.`,
            error: `Perhitungan median gagal.`
          };
        }

        return {
          canApply: true,
          impactedRows: 0,
          impactedCells: missingCount,
          replacementValue: medianVal,
          summaryMessage: `${missingCount} sel kosong pada kolom '${col.name}' akan diisi dengan Median: ${medianVal.toFixed(4)}.`,
        };
      }

      if (step.method === 'Mode') {
        if (col.type === 'Numeric') {
          const nums: number[] = [];
          for (const raw of validRawValues) {
            const parsed = parseNumericValue(raw);
            if (parsed !== null) nums.push(parsed);
          }

          const modeResult = calculateNumericMode(nums);
          if (modeResult.hasNoMode || modeResult.selectedMode === null) {
            return {
              canApply: false,
              impactedRows: 0,
              impactedCells: missingCount,
              summaryMessage: `Seluruh observasi pada kolom '${col.name}' bernilai unik (${nums.length} nilai unik). Tidak ada modus untuk imputasi.`,
              error: `Tidak ada modus.`
            };
          }

          let tieMsg = '';
          if (modeResult.isMultimodal) {
            tieMsg = ` (Multimodal ${modeResult.modes.length} nilai: [${modeResult.modes.slice(0, 3).join(', ')}${modeResult.modes.length > 3 ? '...' : ''}]. Nilai terkecil ${modeResult.selectedMode} dipilih secara deterministik)`;
          }

          return {
            canApply: true,
            impactedRows: 0,
            impactedCells: missingCount,
            replacementValue: modeResult.selectedMode,
            summaryMessage: `${missingCount} sel kosong pada kolom '${col.name}' akan diisi dengan Modus: ${modeResult.selectedMode}${tieMsg}.`,
          };
        } else {
          // Categorical / string / date / boolean
          const strVals = validRawValues.map(v => String(v));
          const modeResult = calculateCategoricalMode(strVals);
          if (modeResult.hasNoMode || modeResult.selectedMode === null) {
            return {
              canApply: false,
              impactedRows: 0,
              impactedCells: missingCount,
              summaryMessage: `Seluruh observasi pada kolom '${col.name}' bernilai unik (${strVals.length} nilai unik). Tidak ada modus untuk imputasi.`,
              error: `Tidak ada modus.`
            };
          }

          let tieMsg = '';
          if (modeResult.isMultimodal) {
            tieMsg = ` (Terdeteksi ${modeResult.modes.length} nilai modus: [${modeResult.modes.slice(0, 3).join(', ')}${modeResult.modes.length > 3 ? '...' : ''}]. Nilai teratas leksikografis "${modeResult.selectedMode}" dipilih secara deterministik)`;
          }

          return {
            canApply: true,
            impactedRows: 0,
            impactedCells: missingCount,
            replacementValue: modeResult.selectedMode,
            summaryMessage: `${missingCount} sel kosong pada kolom '${col.name}' akan diisi dengan Modus: "${modeResult.selectedMode}"${tieMsg}.`,
          };
        }
      }

      if (step.method === 'FixedValue') {
        if (step.fixedValue === undefined || step.fixedValue === null || String(step.fixedValue).trim() === '') {
          return {
            canApply: false,
            impactedRows: 0,
            impactedCells: missingCount,
            summaryMessage: `Nilai tetap pengganti tidak boleh kosong.`,
            error: `Nilai tetap kosong.`
          };
        }

        if (col.type === 'Numeric') {
          const num = typeof step.fixedValue === 'number'
            ? step.fixedValue
            : parseFloat(String(step.fixedValue));
          if (isNaN(num) || !isFinite(num)) {
            return {
              canApply: false,
              impactedRows: 0,
              impactedCells: missingCount,
              summaryMessage: `Nilai tetap harus berupa angka yang valid untuk kolom bertipe numerik.`,
              error: `Nilai bukan angka valid.`
            };
          }
          return {
            canApply: true,
            impactedRows: 0,
            impactedCells: missingCount,
            replacementValue: num,
            summaryMessage: `${missingCount} sel kosong pada kolom '${col.name}' akan diisi dengan nilai tetap: ${num}.`,
          };
        }

        if (col.type === 'Boolean') {
          const str = String(step.fixedValue).toLowerCase().trim();
          if (str !== 'true' && str !== 'false') {
            return {
              canApply: false,
              impactedRows: 0,
              impactedCells: missingCount,
              summaryMessage: `Nilai tetap harus berupa 'true' atau 'false' untuk kolom boolean.`,
              error: `Nilai bukan boolean valid.`
            };
          }
          const bVal = str === 'true';
          return {
            canApply: true,
            impactedRows: 0,
            impactedCells: missingCount,
            replacementValue: bVal,
            summaryMessage: `${missingCount} sel kosong pada kolom '${col.name}' akan diisi dengan nilai tetap boolean: ${bVal}.`,
          };
        }

        const strVal = String(step.fixedValue);
        return {
          canApply: true,
          impactedRows: 0,
          impactedCells: missingCount,
          replacementValue: strVal,
          summaryMessage: `${missingCount} sel kosong pada kolom '${col.name}' akan diisi dengan nilai tetap: "${strVal}".`,
        };
      }

      return {
        canApply: false,
        impactedRows: 0,
        impactedCells: 0,
        summaryMessage: `Metode imputasi '${step.method}' tidak dikenali.`,
        error: `Metode tidak valid.`
      };
    }

    case 'DROP_DUPLICATES': {
      if (totalRows === 0 || columns.length === 0) {
        return {
          canApply: true,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Dataset kosong. Tidak ada baris duplikat yang dapat dihapus.`,
        };
      }

      const seenKeys = new Set<string>();
      let duplicateCount = 0;
      for (let i = 0; i < totalRows; i++) {
        const key = createRowKey(data[i], columns);
        if (seenKeys.has(key)) {
          duplicateCount++;
        } else {
          seenKeys.add(key);
        }
      }

      return {
        canApply: true,
        impactedRows: duplicateCount,
        impactedCells: 0,
        summaryMessage: duplicateCount > 0
          ? `Akan menghapus ${duplicateCount} baris duplikat persis (kemunculan pertama dipertahankan). Sisa baris: ${totalRows - duplicateCount}.`
          : `Tidak ditemukan baris duplikat persis. Dataset sudah 100% unik.`,
      };
    }

    case 'TRIM_WHITESPACE': {
      let targetColumns: ColumnSchema[];
      if (step.targetColumns && step.targetColumns.length > 0) {
        targetColumns = [];
        for (const colId of step.targetColumns) {
          const found = findColumn(columns, colId);
          if (found) targetColumns.push(found);
        }
      } else {
        targetColumns = columns.filter(c => c.type === 'Text' || c.type === 'Categorical' || c.type === 'DateTime');
      }

      let dirtyCellCount = 0;
      for (let i = 0; i < totalRows; i++) {
        const row = data[i];
        for (const col of targetColumns) {
          const val = getCellValue(row, col);
          if (typeof val === 'string' && val.trim() !== val) {
            dirtyCellCount++;
          }
        }
      }

      return {
        canApply: true,
        impactedRows: 0,
        impactedCells: dirtyCellCount,
        summaryMessage: dirtyCellCount > 0
          ? `Akan menghapus spasi awal/akhir pada ${dirtyCellCount} sel teks.`
          : `Tidak ada sel teks dengan spasi berlebih pada awal atau akhir.`,
      };
    }

    case 'DROP_COLUMN': {
      const col = findColumn(columns, step.targetColumn);
      if (!col) {
        return {
          canApply: false,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Kolom '${step.targetColumn}' tidak ditemukan dalam dataset.`,
          error: `Kolom tidak ditemukan.`
        };
      }

      if (columns.length <= 1) {
        return {
          canApply: false,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Tidak dapat menghapus kolom '${col.name}'. Dataset harus memiliki minimal 1 kolom.`,
          error: `Minimal 1 kolom.`
        };
      }

      return {
        canApply: true,
        impactedRows: 0,
        impactedCells: totalRows,
        summaryMessage: `Kolom '${col.name}' (${col.type}) akan dihapus. Dataset akan memiliki ${columns.length - 1} kolom.`,
      };
    }

    case 'RENAME_COLUMN': {
      const col = findColumn(columns, step.targetColumn);
      if (!col) {
        return {
          canApply: false,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Kolom '${step.targetColumn}' tidak ditemukan dalam dataset.`,
          error: `Kolom tidak ditemukan.`
        };
      }

      const newName = (step.newName || '').trim();
      if (!newName) {
        return {
          canApply: false,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Nama kolom baru tidak boleh kosong.`,
          error: `Nama kolom kosong.`
        };
      }

      if (columns.some(c => c.id !== col.id && (c.id === newName || c.name.toLowerCase() === newName.toLowerCase()))) {
        return {
          canApply: false,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Nama kolom '${newName}' sudah digunakan oleh kolom lain. Gunakan nama yang berbeda.`,
          error: `Nama kolom terduplikasi.`
        };
      }

      if (newName === col.name) {
        return {
          canApply: true,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Nama kolom '${col.name}' tidak berubah.`,
        };
      }

      return {
        canApply: true,
        impactedRows: 0,
        impactedCells: 1,
        summaryMessage: `Kolom '${col.name}' akan diubah namanya menjadi '${newName}'.`,
      };
    }

    case 'OVERRIDE_TYPE': {
      const col = columns.find(c => c.id === step.targetColumn);
      if (!col) {
        return {
          canApply: false,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: `Kolom '${step.targetColumn}' tidak ditemukan dalam dataset.`,
          error: `Kolom tidak ditemukan.`
        };
      }

      return {
        canApply: true,
        impactedRows: 0,
        impactedCells: totalRows,
        summaryMessage: `Tipe kolom '${col.name}' akan diubah menjadi ${step.newType}.`,
      };
    }

    default:
      return {
        canApply: false,
        impactedRows: 0,
        impactedCells: 0,
        summaryMessage: `Tipe operasi tidak dikenal.`,
        error: `Tipe operasi tidak valid.`
      };
  }
}

/**
 * Menerapkan satu langkah recipe secara non-destruktif.
 * Mengembalikan objek data dan columns baru tanpa memutasi input asli.
 */
export function applyRecipeStep(
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[],
  step: RecipeStep
): {
  data: Record<string, unknown>[];
  columns: ColumnSchema[];
  impactEstimate: number;
} {
  // Verifikasi via preview terlebih dahulu
  const preview = previewRecipeStep(data, columns, step);
  if (!preview.canApply) {
    throw new Error(preview.error || preview.summaryMessage || 'Langkah tidak dapat diterapkan.');
  }

  const totalRows = data.length;

  switch (step.type) {
    case 'DROP_MISSING': {
      let targetColumns: ColumnSchema[];
      if (step.targetColumns && step.targetColumns.length > 0) {
        targetColumns = [];
        for (const colId of step.targetColumns) {
          const found = findColumn(columns, colId);
          if (!found) throw new Error(`Kolom '${colId}' tidak ditemukan.`);
          targetColumns.push(found);
        }
      } else {
        targetColumns = [...columns];
      }

      const keptRows: Record<string, unknown>[] = [];
      for (let i = 0; i < totalRows; i++) {
        const row = data[i];
        let hasMissing = false;
        for (const col of targetColumns) {
          if (isNativeMissing(getCellValue(row, col))) {
            hasMissing = true;
            break;
          }
        }
        if (!hasMissing) {
          keptRows.push({ ...row });
        }
      }

      return {
        data: keptRows,
        columns: [...columns],
        impactEstimate: preview.impactedRows,
      };
    }

    case 'IMPUTE_MISSING': {
      const col = findColumn(columns, step.targetColumn);
      if (!col) throw new Error(`Kolom '${step.targetColumn}' tidak ditemukan.`);
      const replacement = preview.replacementValue;

      const updatedRows = data.map(row => {
        const val = getCellValue(row, col);
        if (isNativeMissing(val)) {
          const newRow = { ...row };
          if (col.id in newRow) {
            newRow[col.id] = replacement;
          }
          if (col.name in newRow) {
            newRow[col.name] = replacement;
          }
          if (!(col.id in newRow) && !(col.name in newRow)) {
            newRow[col.id] = replacement;
          }
          return newRow;
        }
        return { ...row };
      });

      return {
        data: updatedRows,
        columns: [...columns],
        impactEstimate: preview.impactedCells,
      };
    }

    case 'DROP_DUPLICATES': {
      const seenKeys = new Set<string>();
      const keptRows: Record<string, unknown>[] = [];

      for (let i = 0; i < totalRows; i++) {
        const row = data[i];
        const key = createRowKey(row, columns);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          keptRows.push({ ...row });
        }
      }

      return {
        data: keptRows,
        columns: [...columns],
        impactEstimate: preview.impactedRows,
      };
    }

    case 'TRIM_WHITESPACE': {
      let targetColumns: ColumnSchema[];
      if (step.targetColumns && step.targetColumns.length > 0) {
        targetColumns = [];
        for (const colId of step.targetColumns) {
          const found = findColumn(columns, colId);
          if (found) targetColumns.push(found);
        }
      } else {
        targetColumns = columns.filter(c => c.type === 'Text' || c.type === 'Categorical' || c.type === 'DateTime');
      }

      const updatedRows = data.map(row => {
        const copy = { ...row };
        for (const col of targetColumns) {
          if (col.id in copy && typeof copy[col.id] === 'string') {
            copy[col.id] = (copy[col.id] as string).trim();
          }
          if (col.name in copy && typeof copy[col.name] === 'string') {
            copy[col.name] = (copy[col.name] as string).trim();
          }
        }
        return copy;
      });

      return {
        data: updatedRows,
        columns: [...columns],
        impactEstimate: preview.impactedCells,
      };
    }

    case 'DROP_COLUMN': {
      const col = findColumn(columns, step.targetColumn);
      if (!col) throw new Error(`Kolom '${step.targetColumn}' tidak ditemukan.`);
      const updatedColumns = columns.filter(c => c.id !== col.id);
      const updatedRows = data.map(row => {
        const copy = { ...row };
        delete copy[col.id];
        delete copy[col.name];
        return copy;
      });

      return {
        data: updatedRows,
        columns: updatedColumns,
        impactEstimate: preview.impactedCells,
      };
    }

    case 'RENAME_COLUMN': {
      const col = findColumn(columns, step.targetColumn);
      if (!col) throw new Error(`Kolom '${step.targetColumn}' tidak ditemukan.`);
      const newName = step.newName.trim();
      const updatedColumns = columns.map(c => {
        if (c.id === col.id) {
          return {
            ...c,
            id: newName,
            name: newName,
          };
        }
        return { ...c };
      });

      const updatedRows = data.map(row => {
        const copy = { ...row };
        if (col.name in copy) {
          const val = copy[col.name];
          delete copy[col.name];
          copy[newName] = val;
        } else if (col.id in copy) {
          const val = copy[col.id];
          delete copy[col.id];
          copy[newName] = val;
        }
        return copy;
      });

      return {
        data: updatedRows,
        columns: updatedColumns,
        impactEstimate: 1,
      };
    }

    case 'OVERRIDE_TYPE': {
      const col = findColumn(columns, step.targetColumn);
      if (!col) throw new Error(`Kolom '${step.targetColumn}' tidak ditemukan.`);
      const updatedColumns = columns.map(c => {
        if (c.id === col.id) {
          return {
            ...c,
            type: step.newType,
          };
        }
        return { ...c };
      });

      const copiedRows = data.map(r => ({ ...r }));

      return {
        data: copiedRows,
        columns: updatedColumns,
        impactEstimate: 1,
      };
    }

    default:
      throw new Error(`Tipe langkah pembersihan '${(step as { type: string }).type}' tidak didukung.`);
  }
}

/**
 * Menjalankan seluruh daftar langkah recipe secara berurutan dan deterministik
 * terhadap snapshot dataset asli.
 *
 * Mengembalikan dataset hasil transformasi tanpa pernah memutasi originalData.
 */
export function executeRecipe(
  originalData: readonly Record<string, unknown>[],
  originalColumns: readonly ColumnSchema[],
  steps: readonly RecipeStep[]
): {
  data: Record<string, unknown>[];
  columns: ColumnSchema[];
} {
  let currentData: Record<string, unknown>[] = originalData.map(r => ({ ...r }));
  let currentColumns: ColumnSchema[] = originalColumns.map(c => ({ ...c }));

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      const result = applyRecipeStep(currentData, currentColumns, step);
      currentData = result.data;
      currentColumns = result.columns;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gagal mengeksekusi langkah #${i + 1} (${step.description || step.type}): ${msg}`);
    }
  }

  return {
    data: currentData,
    columns: currentColumns,
  };
}

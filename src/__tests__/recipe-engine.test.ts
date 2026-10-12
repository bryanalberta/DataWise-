import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ColumnSchema, RecipeStep } from '../types';
import {
  previewRecipeStep,
  applyRecipeStep,
  executeRecipe,
  calculateNumericMode,
  calculateCategoricalMode,
} from '../lib/recipe-engine';

describe('TASK-FNC-04 — Data Cleaning & Immutable Recipe Engine', () => {
  const sampleColumns: ColumnSchema[] = [
    { id: 'id', name: 'ID', type: 'Numeric' },
    { id: 'nama', name: 'Nama', type: 'Text' },
    { id: 'skor', name: 'Skor', type: 'Numeric' },
    { id: 'aktif', name: 'Aktif', type: 'Boolean' },
  ];

  // =========================================================================
  // 1. DROP MISSING ROWS (FR-10.A)
  // =========================================================================
  describe('1. Drop Missing Rows (DROP_MISSING)', () => {
    const rawData: Record<string, unknown>[] = [
      { id: 1, nama: 'Budi', skor: 85, aktif: true },
      { id: 2, nama: null, skor: 90, aktif: true }, // missing nama (null)
      { id: 3, nama: 'Siti', skor: null, aktif: false }, // missing skor (null)
      { id: 4, nama: '', skor: 70, aktif: true }, // missing nama ("")
      { id: 5, nama: '   ', skor: 60, aktif: true }, // whitespace-only (bukan native missing)
      { id: 6, nama: 'Dewi', skor: 95, aktif: true },
    ];

    it('1.1. Menghapus baris jika ada missing value pada seluruh kolom', () => {
      const step: RecipeStep = {
        id: 'step-1',
        timestamp: Date.now(),
        type: 'DROP_MISSING',
        description: 'Hapus baris missing seluruh kolom',
      };

      const preview = previewRecipeStep(rawData, sampleColumns, step);
      assert.equal(preview.canApply, true);
      // Baris index 1 (null), 2 (null), 3 ("") -> 3 baris dihapus
      // Baris index 4 ("   ") tidak dihapus karena bukan native missing
      assert.equal(preview.impactedRows, 3);

      const result = applyRecipeStep(rawData, sampleColumns, step);
      assert.equal(result.data.length, 3);
      assert.deepEqual(
        result.data.map(r => r.id),
        [1, 5, 6]
      );
    });

    it('1.2. Menghapus baris berdasarkan kolom terpilih saja', () => {
      const step: RecipeStep = {
        id: 'step-2',
        timestamp: Date.now(),
        type: 'DROP_MISSING',
        targetColumns: ['skor'],
        description: 'Hapus baris jika skor kosong',
      };

      const preview = previewRecipeStep(rawData, sampleColumns, step);
      assert.equal(preview.canApply, true);
      // Hanya baris id=3 yang memiliki skor null
      assert.equal(preview.impactedRows, 1);

      const result = applyRecipeStep(rawData, sampleColumns, step);
      assert.equal(result.data.length, 5);
      assert.equal(result.data.some(r => r.id === 3), false);
    });

    it('1.3. Menolak kolom target yang tidak ada dalam skema', () => {
      const step: RecipeStep = {
        id: 'step-err',
        timestamp: Date.now(),
        type: 'DROP_MISSING',
        targetColumns: ['kolom_ghaib'],
        description: 'Target kolom salah',
      };

      const preview = previewRecipeStep(rawData, sampleColumns, step);
      assert.equal(preview.canApply, false);
      assert.ok(preview.summaryMessage.includes('tidak ditemukan'));
    });
  });

  // =========================================================================
  // 2. IMPUTE MISSING VALUES (FR-10.B)
  // =========================================================================
  describe('2. Impute Missing Values (IMPUTE_MISSING)', () => {
    it('2.1. Imputasi Mean pada kolom numerik', () => {
      const data: Record<string, unknown>[] = [
        { id: 1, skor: 10 },
        { id: 2, skor: 20 },
        { id: 3, skor: null },
        { id: 4, skor: 30 },
        { id: 5, skor: '' },
      ];
      // Mean dari [10, 20, 30] = 20.0
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'ID', type: 'Numeric' },
        { id: 'skor', name: 'Skor', type: 'Numeric' },
      ];

      const step: RecipeStep = {
        id: 'step-mean',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'Mean',
        description: 'Imputasi Mean pada skor',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, true);
      assert.equal(preview.impactedCells, 2);
      assert.equal(preview.replacementValue, 20);

      const result = applyRecipeStep(data, cols, step);
      assert.equal(result.data[2].skor, 20);
      assert.equal(result.data[4].skor, 20);
    });

    it('2.2. Imputasi Mean ditolak untuk kolom non-numerik', () => {
      const data: Record<string, unknown>[] = [
        { id: 1, nama: 'Budi' },
        { id: 2, nama: null },
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'ID', type: 'Numeric' },
        { id: 'nama', name: 'Nama', type: 'Text' },
      ];

      const step: RecipeStep = {
        id: 'step-err-mean',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'nama',
        method: 'Mean',
        description: 'Mean pada teks',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, false);
      assert.ok(preview.summaryMessage.includes('numerik'));
    });

    it('2.3. Imputasi Median dengan Type-7 Interpolation', () => {
      const data: Record<string, unknown>[] = [
        { id: 1, skor: 10 },
        { id: 2, skor: 20 },
        { id: 3, skor: null },
        { id: 4, skor: 40 },
      ];
      // [10, 20, 40] -> Median = 20
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'ID', type: 'Numeric' },
        { id: 'skor', name: 'Skor', type: 'Numeric' },
      ];

      const step: RecipeStep = {
        id: 'step-median',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'Median',
        description: 'Imputasi Median pada skor',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, true);
      assert.equal(preview.impactedCells, 1);
      assert.equal(preview.replacementValue, 20);

      const result = applyRecipeStep(data, cols, step);
      assert.equal(result.data[2].skor, 20);
    });

    it('2.4. Imputasi Modus dengan penanganan Ties / Multimodal numerik', () => {
      // 10 muncul 2 kali, 30 muncul 2 kali. Ties!
      // Nilai terkecil (10) harus dipilih secara deterministik
      const modeResult = calculateNumericMode([10, 10, 20, 30, 30]);
      assert.equal(modeResult.isMultimodal, true);
      assert.deepEqual(modeResult.modes, [10, 30]);
      assert.equal(modeResult.selectedMode, 10);

      const data: Record<string, unknown>[] = [
        { id: 1, skor: 10 },
        { id: 2, skor: 10 },
        { id: 3, skor: 30 },
        { id: 4, skor: 30 },
        { id: 5, skor: null },
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'ID', type: 'Numeric' },
        { id: 'skor', name: 'Skor', type: 'Numeric' },
      ];

      const step: RecipeStep = {
        id: 'step-mode',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'Mode',
        description: 'Imputasi Modus pada skor',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, true);
      assert.equal(preview.replacementValue, 10);
      assert.ok(preview.summaryMessage.includes('Multimodal'));

      const result = applyRecipeStep(data, cols, step);
      assert.equal(result.data[4].skor, 10);
    });

    it('2.5. Imputasi Modus dengan ties kategorikal terurut alfabetis', () => {
      const modeCat = calculateCategoricalMode(['Surabaya', 'Bandung', 'Bandung', 'Surabaya']);
      assert.equal(modeCat.isMultimodal, true);
      assert.deepEqual(modeCat.modes, ['Bandung', 'Surabaya']);
      assert.equal(modeCat.selectedMode, 'Bandung'); // 'Bandung' < 'Surabaya'
    });

    it('2.6. Imputasi Modus ditolak jika semua data bernilai unik', () => {
      const data: Record<string, unknown>[] = [
        { id: 1, skor: 10 },
        { id: 2, skor: 20 },
        { id: 3, skor: 30 },
        { id: 4, skor: null },
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'ID', type: 'Numeric' },
        { id: 'skor', name: 'Skor', type: 'Numeric' },
      ];

      const step: RecipeStep = {
        id: 'step-mode-unique',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'Mode',
        description: 'Imputasi Modus unik',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, false);
      assert.ok(preview.summaryMessage.includes('unik'));
    });

    it('2.7. Imputasi Nilai Tetap (FixedValue) divalidasi sesuai tipe kolom', () => {
      const data: Record<string, unknown>[] = [
        { id: 1, skor: 10, aktif: true, kota: 'Jakarta' },
        { id: 2, skor: null, aktif: null, kota: null },
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'ID', type: 'Numeric' },
        { id: 'skor', name: 'Skor', type: 'Numeric' },
        { id: 'aktif', name: 'Aktif', type: 'Boolean' },
        { id: 'kota', name: 'Kota', type: 'Text' },
      ];

      // Numerik valid
      const stepNum: RecipeStep = {
        id: 'step-fixed-num',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'FixedValue',
        fixedValue: 99,
        description: 'Isi skor 99',
      };
      const resNum = applyRecipeStep(data, cols, stepNum);
      assert.equal(resNum.data[1].skor, 99);

      // Numerik tidak valid (teks acak) ditolak
      const stepBadNum: RecipeStep = {
        id: 'step-fixed-bad-num',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'FixedValue',
        fixedValue: 'bukan_angka',
        description: 'Isi skor teks',
      };
      const prevBad = previewRecipeStep(data, cols, stepBadNum);
      assert.equal(prevBad.canApply, false);

      // Boolean valid
      const stepBool: RecipeStep = {
        id: 'step-fixed-bool',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'aktif',
        method: 'FixedValue',
        fixedValue: 'false',
        description: 'Isi boolean false',
      };
      const resBool = applyRecipeStep(data, cols, stepBool);
      assert.equal(resBool.data[1].aktif, false);

      // Text
      const stepText: RecipeStep = {
        id: 'step-fixed-txt',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'kota',
        method: 'FixedValue',
        fixedValue: 'Unknown',
        description: 'Isi kota Unknown',
      };
      const resText = applyRecipeStep(data, cols, stepText);
      assert.equal(resText.data[1].kota, 'Unknown');
    });

    it('2.8. Imputasi pada kolom dengan N = 0 (seluruhnya missing) dicegah dengan aman', () => {
      const data: Record<string, unknown>[] = [
        { id: 1, skor: null },
        { id: 2, skor: null },
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'ID', type: 'Numeric' },
        { id: 'skor', name: 'Skor', type: 'Numeric' },
      ];

      const step: RecipeStep = {
        id: 'step-n0',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'Mean',
        description: 'Mean saat N=0',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, false);
      assert.ok(preview.summaryMessage.includes('kosong') || preview.summaryMessage.includes('valid'));
    });
  });

  // =========================================================================
  // 3. DROP EXACT DUPLICATES (FR-10.C)
  // =========================================================================
  describe('3. Drop Exact Duplicates (DROP_DUPLICATES)', () => {
    it('3.1. Menghapus baris duplikat persis dan mempertahankan kemunculan pertama', () => {
      const data: Record<string, unknown>[] = [
        { id: 1, nama: 'Andi', nilai: 80 }, // baris 0 (pertama)
        { id: 2, nama: 'Budi', nilai: 90 }, // baris 1
        { id: 1, nama: 'Andi', nilai: 80 }, // baris 2 (duplikat baris 0)
        { id: 1, nama: 'Andi', nilai: 80 }, // baris 3 (duplikat baris 0)
        { id: 3, nama: 'Citra', nilai: 85 }, // baris 4
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'ID', type: 'Numeric' },
        { id: 'nama', name: 'Nama', type: 'Text' },
        { id: 'nilai', name: 'Nilai', type: 'Numeric' },
      ];

      const step: RecipeStep = {
        id: 'step-dup',
        timestamp: Date.now(),
        type: 'DROP_DUPLICATES',
        description: 'Hapus duplikat persis',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, true);
      assert.equal(preview.impactedRows, 2);

      const result = applyRecipeStep(data, cols, step);
      assert.equal(result.data.length, 3);
      assert.deepEqual(
        result.data.map(r => r.id),
        [1, 2, 3]
      );
    });

    it('3.2. Membedakan tipe data primitif dan tidak salah menganggap duplikat', () => {
      // id 1 (number) vs id "1" (string) tidak boleh dianggap duplikat
      const data: Record<string, unknown>[] = [
        { kode: 1, desc: 'A' },
        { kode: '1', desc: 'A' },
      ];
      const cols: ColumnSchema[] = [
        { id: 'kode', name: 'Kode', type: 'Text' },
        { id: 'desc', name: 'Desc', type: 'Text' },
      ];

      const step: RecipeStep = {
        id: 'step-type-dup',
        timestamp: Date.now(),
        type: 'DROP_DUPLICATES',
        description: 'Drop duplikat tipe beda',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.impactedRows, 0);

      const result = applyRecipeStep(data, cols, step);
      assert.equal(result.data.length, 2);
    });
  });

  // =========================================================================
  // 4. TRIM WHITESPACE (FR-10.D)
  // =========================================================================
  describe('4. Trim Whitespace (TRIM_WHITESPACE)', () => {
    it('4.1. Merapikan spasi di awal dan akhir teks tanpa merusak numerik atau boolean', () => {
      const data: Record<string, unknown>[] = [
        { id: 1, nama: '  Budi Santoso  ', skor: 85, flag: true },
        { id: 2, nama: 'Siti', skor: 90, flag: false },
        { id: 3, nama: '\tDewi\n', skor: 75, flag: true },
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'ID', type: 'Numeric' },
        { id: 'nama', name: 'Nama', type: 'Text' },
        { id: 'skor', name: 'Skor', type: 'Numeric' },
        { id: 'flag', name: 'Flag', type: 'Boolean' },
      ];

      const step: RecipeStep = {
        id: 'step-trim',
        timestamp: Date.now(),
        type: 'TRIM_WHITESPACE',
        description: 'Trim whitespace',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, true);
      assert.equal(preview.impactedCells, 2);

      const result = applyRecipeStep(data, cols, step);
      assert.equal(result.data[0].nama, 'Budi Santoso');
      assert.equal(result.data[1].nama, 'Siti');
      assert.equal(result.data[2].nama, 'Dewi');
      // Nilai numerik dan boolean tetap utuh
      assert.equal(result.data[0].skor, 85);
      assert.equal(result.data[0].flag, true);
    });
  });

  // =========================================================================
  // 5. RENAME & DROP COLUMN (FR-10.E)
  // =========================================================================
  describe('5. Rename Column & Drop Column', () => {
    const data: Record<string, unknown>[] = [
      { id: 1, nama_lama: 'A', nilai: 10 },
      { id: 2, nama_lama: 'B', nilai: 20 },
    ];
    const cols: ColumnSchema[] = [
      { id: 'id', name: 'id', type: 'Numeric' },
      { id: 'nama_lama', name: 'nama_lama', type: 'Text' },
      { id: 'nilai', name: 'nilai', type: 'Numeric' },
    ];

    it('5.1. Rename Column memperbarui nama skema dan key data', () => {
      const step: RecipeStep = {
        id: 'step-rename',
        timestamp: Date.now(),
        type: 'RENAME_COLUMN',
        targetColumn: 'nama_lama',
        newName: 'nama_baru',
        description: 'Rename nama_lama ke nama_baru',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, true);

      const result = applyRecipeStep(data, cols, step);
      assert.equal(result.columns.some(c => c.id === 'nama_baru'), true);
      assert.equal(result.columns.some(c => c.id === 'nama_lama'), false);
      assert.equal(result.data[0].nama_baru, 'A');
      assert.equal('nama_lama' in result.data[0], false);
    });

    it('5.2. Rename Column menolak nama kosong atau konflik nama yang ada', () => {
      const stepEmpty: RecipeStep = {
        id: 'step-empty',
        timestamp: Date.now(),
        type: 'RENAME_COLUMN',
        targetColumn: 'nama_lama',
        newName: '   ',
        description: 'Nama kosong',
      };
      assert.equal(previewRecipeStep(data, cols, stepEmpty).canApply, false);

      const stepConflict: RecipeStep = {
        id: 'step-conflict',
        timestamp: Date.now(),
        type: 'RENAME_COLUMN',
        targetColumn: 'nama_lama',
        newName: 'nilai', // sudah dipakai
        description: 'Konflik nama',
      };
      assert.equal(previewRecipeStep(data, cols, stepConflict).canApply, false);
    });

    it('5.3. Drop Column menghapus kolom dari skema dan baris data', () => {
      const step: RecipeStep = {
        id: 'step-drop-col',
        timestamp: Date.now(),
        type: 'DROP_COLUMN',
        targetColumn: 'nilai',
        description: 'Hapus kolom nilai',
      };

      const preview = previewRecipeStep(data, cols, step);
      assert.equal(preview.canApply, true);

      const result = applyRecipeStep(data, cols, step);
      assert.equal(result.columns.length, 2);
      assert.equal(result.columns.some(c => c.id === 'nilai'), false);
      assert.equal('nilai' in result.data[0], false);
    });

    it('5.4. Drop Column mencegah penghapusan jika hanya tersisa 1 kolom', () => {
      const oneCol: ColumnSchema[] = [{ id: 'id', name: 'id', type: 'Numeric' }];
      const step: RecipeStep = {
        id: 'step-last-col',
        timestamp: Date.now(),
        type: 'DROP_COLUMN',
        targetColumn: 'id',
        description: 'Hapus satu-satunya kolom',
      };
      assert.equal(previewRecipeStep(data, oneCol, step).canApply, false);
    });
  });

  // =========================================================================
  // 6. NON-DESTRUCTIVE RECIPE ENGINE & STEP MANAGEMENT (FR-11)
  // =========================================================================
  describe('6. Non-Destructive Recipe Engine & Pipeline Evaluation', () => {
    const rawData: Record<string, unknown>[] = [
      { id: 1, nama: '  Andi  ', skor: 80 },
      { id: 2, nama: 'Budi', skor: null },
      { id: 1, nama: '  Andi  ', skor: 80 }, // duplicate
      { id: 3, nama: 'Citra', skor: 90 },
    ];
    const rawCols: ColumnSchema[] = [
      { id: 'id', name: 'ID', type: 'Numeric' },
      { id: 'nama', name: 'Nama', type: 'Text' },
      { id: 'skor', name: 'Skor', type: 'Numeric' },
    ];

    it('6.1. Raw dataset tidak pernah termutasi setelah preview atau apply step', () => {
      const rawSnapshot = JSON.stringify(rawData);

      const stepTrim: RecipeStep = {
        id: 's1',
        timestamp: Date.now(),
        type: 'TRIM_WHITESPACE',
        description: 'Trim',
      };

      // Preview tidak memutasi
      previewRecipeStep(rawData, rawCols, stepTrim);
      assert.equal(JSON.stringify(rawData), rawSnapshot);

      // Apply tidak memutasi rawData
      applyRecipeStep(rawData, rawCols, stepTrim);
      assert.equal(JSON.stringify(rawData), rawSnapshot);
    });

    it('6.2. Eksekusi urutan recipe majemuk menghasilkan data aktif yang deterministik', () => {
      const step1: RecipeStep = {
        id: 's1',
        timestamp: Date.now(),
        type: 'DROP_DUPLICATES',
        description: 'Hapus duplikat',
      };
      const step2: RecipeStep = {
        id: 's2',
        timestamp: Date.now(),
        type: 'TRIM_WHITESPACE',
        description: 'Trim whitespace',
      };
      const step3: RecipeStep = {
        id: 's3',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'Mean',
        description: 'Imputasi Skor',
      };

      // Eksekusi pipeline 3 langkah
      const pipelineResult = executeRecipe(rawData, rawCols, [step1, step2, step3]);

      // 4 baris awal - 1 duplikat = 3 baris
      assert.equal(pipelineResult.data.length, 3);
      // Whitespace ter-trim
      assert.equal(pipelineResult.data[0].nama, 'Andi');
      // Skor [80, null, 90] -> mean = 85
      assert.equal(pipelineResult.data[1].skor, 85);
    });

    it('6.3. Menghapus satu langkah dari Recipe Log menghitung ulang dari snapshot asli', () => {
      const step1: RecipeStep = {
        id: 's1',
        timestamp: Date.now(),
        type: 'DROP_DUPLICATES',
        description: 'Hapus duplikat',
      };
      const step2: RecipeStep = {
        id: 's2',
        timestamp: Date.now(),
        type: 'TRIM_WHITESPACE',
        description: 'Trim whitespace',
      };
      const step3: RecipeStep = {
        id: 's3',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'Mean',
        description: 'Imputasi Skor',
      };

      // Terapkan dulu ketiga langkah
      const allThree = executeRecipe(rawData, rawCols, [step1, step2, step3]);
      assert.equal(allThree.data[1].skor, 85); // 80 + 90 / 2 = 85

      // Hapus langkah ke-3 (Imputasi) -> Evaluasi ulang [step1, step2]
      const remainingSteps = [step1, step2];
      const reevaluated = executeRecipe(rawData, rawCols, remainingSteps);

      assert.equal(reevaluated.data.length, 3);
      assert.equal(reevaluated.data[0].nama, 'Andi');
      // Skor baris ke-2 harus tetap null (karena langkah imputasi telah dihapus!)
      assert.equal(reevaluated.data[1].skor, null);
    });

    it('6.4. Reset ke Data Asli mengembalikan dataset awal secara 100% presisi', () => {
      const resetResult = executeRecipe(rawData, rawCols, []);
      assert.equal(resetResult.data.length, rawData.length);
      assert.deepEqual(resetResult.data, rawData);
      assert.deepEqual(resetResult.columns, rawCols);
    });
  });
});

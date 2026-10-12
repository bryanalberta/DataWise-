/**
 * Representasi tipe data kolom yang didukung oleh aplikasi.
 * Sesuai PRD Bagian 1.7 FR-04: Numeric, Text, Categorical, DateTime, Boolean.
 */
export type DataType = 'Numeric' | 'Text' | 'Categorical' | 'DateTime' | 'Boolean';

/**
 * Metadata skema kolom.
 * Mengidentifikasi properti sebuah kolom dalam dataset.
 */
export interface ColumnProfile {
  readonly inferredType: DataType;
  readonly confidenceScore: number;
  readonly isIdentifier?: boolean;
  readonly formatWarning?: string; // misal: 'Ambiguous Date Format (DD/MM vs MM/DD)'
  readonly regionalFormat?: string; // misal: 'Decimal Comma'
}

export interface ColumnSchema {
  readonly id: string;
  readonly name: string;
  readonly type: DataType; // Tipe aktif (bisa hasil inferensi atau hasil override)
  readonly originalType?: DataType; // Tipe awal hasil inferensi (disimpan jika pengguna melakukan override)
  readonly profile?: ColumnProfile; // Metadata hasil analisis inferensi
}

/**
 * Metadata dataset.
 * Merepresentasikan identitas, skema, dan ringkasan metrik struktur dataset.
 */
export interface Dataset {
  readonly id: string;
  readonly name: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly columns: readonly ColumnSchema[];
  readonly fileSize?: number; // Ukuran file asli dalam byte (berguna untuk peringatan performa)
  readonly estimatedMemoryBytes?: number; // FND-04: Estimasi memori setelah parsing
  readonly integrityStatus?: 'VALID' | 'WARNING' | 'INVALID' | 'UNKNOWN'; // FND-04: Status integritas
  readonly availableSheets?: readonly string[]; // Khusus untuk file multi-sheet (Excel)
  readonly hasHeader?: boolean; // Menandakan apakah dataset dibaca dengan header atau tanpa header
}

export interface ColumnMissingStats {
  readonly columnId: string;
  readonly nativeMissingCount: number;
  readonly whitespaceCount: number;
  readonly effectiveMissingCount: number; // Tergantung treatWhitespaceAsMissing
  readonly effectiveMissingPercentage: number;
}

export interface DataQualitySummary {
  readonly datasetId: string;
  readonly totalRecords: number;
  readonly totalNativeMissing: number;
  readonly totalWhitespace: number;
  readonly totalEffectiveMissing: number;
  readonly duplicateOccurrences: number; // Munculnya baris setelah yang pertama
  readonly rowsParticipatingInDuplicates: number; // Semua baris yang memiliki duplikat
  readonly columnStats: readonly ColumnMissingStats[];
}

/**
 * Descriptive Statistics Domain Types (FNC-01 / FR-07)
 */
export interface NumericColumnStats {
  readonly count: number; // Jumlah observasi valid (N)
  readonly missing: number; // Jumlah observasi kosong/tidak valid
  readonly sum: number | null; // Penjumlahan float64
  readonly mean: number | null; // Rata-rata
  readonly median: number | null; // Median (Linear Type-7)
  readonly mode: readonly number[] | null; // Array nilai modus terurut, null jika semua unik atau N=0
  readonly variance: number | null; // Varians sampel s^2 (ddof=1), null jika N < 2
  readonly standardDeviation: number | null; // Standar deviasi sampel s (ddof=1), null jika N < 2
  readonly min: number | null; // Nilai minimum
  readonly max: number | null; // Nilai maksimum
  readonly q1: number | null; // Kuartil 1 Q(0.25) (Linear Type-7)
  readonly q3: number | null; // Kuartil 3 Q(0.75) (Linear Type-7)
  readonly iqr: number | null; // Interquartile range (Q3 - Q1)
}

export interface CategoryFrequency {
  readonly value: string;
  readonly count: number;
  readonly percentage: number; // 0 - 100
}

export interface CategoricalColumnStats {
  readonly count: number; // Jumlah observasi valid non-null
  readonly missing: number; // Jumlah observasi kosong
  readonly uniqueCount: number; // Jumlah nilai unik
  readonly topValue: string | null; // Nilai frekuensi teratas
  readonly topValueFrequency: number | null; // Frekuensi nilai teratas
  readonly frequencies: readonly CategoryFrequency[]; // Tabel distribusi frekuensi
}

export interface ColumnDescriptiveStats {
  readonly columnId: string;
  readonly columnName: string;
  readonly type: DataType;
  readonly numericStats?: NumericColumnStats;
  readonly categoricalStats?: CategoricalColumnStats;
}

export interface DescriptiveStatisticsSummary {
  readonly datasetId: string;
  readonly totalRecords: number;
  readonly columnStats: readonly ColumnDescriptiveStats[];
}

/**
 * Recipe Step Types (Transformasi & Pembersihan Data)
 * Berdasarkan spesifikasi Data Cleaning Engine (FR-10).
 */
export type ImputationMethod = 'Mean' | 'Median' | 'Mode' | 'FixedValue';

export interface BaseRecipeStep {
  readonly id: string;
  readonly timestamp: number;
  readonly description: string;
}

export interface DropMissingStep extends BaseRecipeStep {
  readonly type: 'DROP_MISSING';
  readonly targetColumns?: readonly string[]; // Jika undefined atau kosong, berlaku untuk semua kolom
}

export interface ImputeMissingStep extends BaseRecipeStep {
  readonly type: 'IMPUTE_MISSING';
  readonly targetColumn: string;
  readonly method: ImputationMethod;
  readonly fixedValue?: string | number | boolean;
}

export interface DropDuplicatesStep extends BaseRecipeStep {
  readonly type: 'DROP_DUPLICATES';
}

export interface TrimWhitespaceStep extends BaseRecipeStep {
  readonly type: 'TRIM_WHITESPACE';
  readonly targetColumns?: readonly string[]; // Jika undefined atau kosong, berlaku untuk semua kolom teks
}

export interface DropColumnStep extends BaseRecipeStep {
  readonly type: 'DROP_COLUMN';
  readonly targetColumn: string;
}

export interface RenameColumnStep extends BaseRecipeStep {
  readonly type: 'RENAME_COLUMN';
  readonly targetColumn: string;
  readonly newName: string;
}

export interface OverrideTypeStep extends BaseRecipeStep {
  readonly type: 'OVERRIDE_TYPE';
  readonly targetColumn: string;
  readonly newType: DataType;
}

export type RecipeStep =
  | DropMissingStep
  | ImputeMissingStep
  | DropDuplicatesStep
  | TrimWhitespaceStep
  | DropColumnStep
  | RenameColumnStep
  | OverrideTypeStep;

export interface RecipePreviewResult {
  readonly canApply: boolean;
  readonly impactedRows: number;
  readonly impactedCells: number;
  readonly replacementValue?: unknown;
  readonly summaryMessage: string;
  readonly error?: string;
}

/**
 * Web Worker Message Contracts
 * Mendefinisikan protokol komunikasi antara UI Thread (Main) dan Web Worker.
 */

// Worker Request Messages (Main -> Worker)
export interface WorkerParseRequest {
  readonly taskId: string;
  readonly action: 'PARSE_FILE';
  readonly payload: {
    readonly fileId: string;
    readonly file: File;
    readonly options?: {
      readonly sheetName?: string; // Khusus untuk Excel (FR-03)
      readonly delimiter?: string; // Khusus untuk CSV (FR-02)
      readonly sampleLimit?: number; // FND-07: Batas sampel jika file kebesaran
      readonly hasHeader?: boolean; // Pilihan headerless CSV (FR-02/TASK-FIX-02)
    };
  };
}

export interface WorkerCalculateStatsRequest {
  readonly taskId: string;
  readonly action: 'CALCULATE_STATS';
  readonly payload: {
    readonly datasetId: string;
    readonly columns: readonly ColumnSchema[];
    readonly options?: {
      readonly treatWhitespaceAsMissing?: boolean;
    };
  };
}

export interface WorkerCalculateDescriptiveStatsRequest {
  readonly taskId: string;
  readonly action: 'CALCULATE_DESCRIPTIVE_STATS';
  readonly payload: {
    readonly datasetId: string;
    readonly columns: readonly ColumnSchema[];
    readonly options?: {
      readonly treatWhitespaceAsMissing?: boolean;
    };
  };
}

export interface WorkerPreviewRecipeStepRequest {
  readonly taskId: string;
  readonly action: 'PREVIEW_RECIPE_STEP';
  readonly payload: {
    readonly datasetId: string;
    readonly step: RecipeStep;
  };
}

export interface WorkerApplyRecipeRequest {
  readonly taskId: string;
  readonly action: 'APPLY_RECIPE';
  readonly payload: {
    readonly datasetId: string;
    readonly step: RecipeStep;
  };
}

export interface WorkerRemoveRecipeStepRequest {
  readonly taskId: string;
  readonly action: 'REMOVE_RECIPE_STEP';
  readonly payload: {
    readonly datasetId: string;
    readonly stepId: string;
  };
}

export interface WorkerResetRecipeRequest {
  readonly taskId: string;
  readonly action: 'RESET_RECIPE';
  readonly payload: {
    readonly datasetId: string;
  };
}

export interface WorkerCancelRequest {
  readonly taskId: string; // ID dari tugas yang ingin dibatalkan
  readonly action: 'CANCEL_TASK';
}

export interface WorkerInspectRequest {
  readonly taskId: string;
  readonly action: 'INSPECT_FILE';
  readonly payload: {
    readonly fileId: string;
    readonly file: File;
  };
}

export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'isEmpty'
  | 'isNotEmpty';

export interface ColumnFilter {
  readonly columnId: string;
  readonly operator: FilterOperator;
  readonly value: string;
}

export interface GridSortConfig {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
}

export interface WorkerQueryDataPayload {
  readonly datasetId: string;
  readonly offset: number;
  readonly limit: number;
  readonly sort?: GridSortConfig;
  readonly searchQuery?: string;
  readonly filters?: readonly ColumnFilter[];
  readonly columnTypes?: Record<string, DataType>;
}

export interface WorkerQueryDataRequest {
  readonly taskId: string;
  readonly action: 'QUERY_DATA';
  readonly payload: WorkerQueryDataPayload;
}

// ==========================================
// FNC-05: Visualization Studio Contracts
// ==========================================

export type ChartType = 'BAR' | 'HISTOGRAM' | 'LINE' | 'SCATTER';

export interface BarChartConfig {
  readonly type: 'BAR';
  readonly xColumn: string; // Kategori / Text
  readonly yColumn?: string; // Optional numeric column for aggregation
  readonly aggregation?: 'COUNT' | 'SUM' | 'MEAN';
  readonly maxCategories?: number; // Default: 20
}

export interface HistogramConfig {
  readonly type: 'HISTOGRAM';
  readonly column: string; // Kolom numerik
  readonly bins: number; // 2-50, default: 10
}

export interface LineChartConfig {
  readonly type: 'LINE';
  readonly yColumn: string; // Kolom numerik
  readonly xColumn?: string; // Optional: index baris jika kosong
  readonly maxPoints?: number; // Default: 2000 untuk visual sampling
}

export interface ScatterPlotConfig {
  readonly type: 'SCATTER';
  readonly xColumn: string; // Kolom numerik
  readonly yColumn: string; // Kolom numerik
  readonly maxPoints?: number; // Default: 2500 untuk visual sampling
}

export type ChartConfig = BarChartConfig | HistogramConfig | LineChartConfig | ScatterPlotConfig;

export interface BarChartItem {
  readonly category: string;
  readonly value: number;
  readonly count: number;
}

export interface BarChartResult {
  readonly type: 'BAR';
  readonly data: readonly BarChartItem[];
  readonly xColumn: string;
  readonly yColumn?: string;
  readonly aggregation: 'COUNT' | 'SUM' | 'MEAN';
  readonly totalCategories: number;
  readonly displayedCategories: number;
  readonly otherCategoriesCount: number;
  readonly missingCount: number;
}

export interface HistogramBin {
  readonly binIndex: number;
  readonly binStart: number;
  readonly binEnd: number;
  readonly label: string;
  readonly count: number;
  readonly percentage: number;
}

export interface HistogramResult {
  readonly type: 'HISTOGRAM';
  readonly bins: readonly HistogramBin[];
  readonly column: string;
  readonly binCount: number;
  readonly binWidth: number;
  readonly min: number;
  readonly max: number;
  readonly totalObservations: number;
  readonly validCount: number;
  readonly missingCount: number;
  readonly isConstant: boolean;
}

export interface LineChartPoint {
  readonly index: number;
  readonly x: string | number;
  readonly y: number | null;
}

export interface LineChartResult {
  readonly type: 'LINE';
  readonly data: readonly LineChartPoint[];
  readonly yColumn: string;
  readonly xColumn?: string;
  readonly totalPoints: number;
  readonly displayedPoints: number;
  readonly isSampled: boolean;
  readonly validCount: number;
  readonly missingCount: number;
}

export interface ScatterPlotPoint {
  readonly rowIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface ScatterPlotResult {
  readonly type: 'SCATTER';
  readonly data: readonly ScatterPlotPoint[];
  readonly xColumn: string;
  readonly yColumn: string;
  readonly totalPairs: number;
  readonly displayedPoints: number;
  readonly isSampled: boolean;
  readonly validCount: number;
  readonly missingCount: number;
}

export type ChartDataResult = BarChartResult | HistogramResult | LineChartResult | ScatterPlotResult;

export interface WorkerGenerateChartPayload {
  readonly datasetId: string;
  readonly config: ChartConfig;
}

export interface WorkerGenerateChartRequest {
  readonly taskId: string;
  readonly action: 'GENERATE_CHART_DATA';
  readonly payload: WorkerGenerateChartPayload;
}

// ==========================================
// FNC-06: CSV/XLSX Export Studio Contracts
// ==========================================

export type ExportFormat = 'CSV' | 'XLSX';

export interface ExportDatasetOptions {
  readonly format: ExportFormat;
  readonly fileName?: string;
  readonly delimiter?: ',' | ';' | '\t';
  readonly includeBom?: boolean;
  readonly sheetName?: string;
}

export interface WorkerExportDatasetPayload {
  readonly datasetId: string;
  readonly options: ExportDatasetOptions;
}

export interface WorkerExportDatasetRequest {
  readonly taskId: string;
  readonly action: 'EXPORT_DATASET';
  readonly payload: WorkerExportDatasetPayload;
}

export interface WorkerAnalyzeIntelligencePayload {
  readonly datasetId: string;
}

export interface WorkerAnalyzeIntelligenceRequest {
  readonly taskId: string;
  readonly action: 'ANALYZE_DATASET_INTELLIGENCE';
  readonly payload: WorkerAnalyzeIntelligencePayload;
}

export type WorkerRequest =
  | WorkerParseRequest
  | WorkerCalculateStatsRequest
  | WorkerCalculateDescriptiveStatsRequest
  | WorkerPreviewRecipeStepRequest
  | WorkerApplyRecipeRequest
  | WorkerRemoveRecipeStepRequest
  | WorkerResetRecipeRequest
  | WorkerCancelRequest
  | WorkerInspectRequest
  | WorkerQueryDataRequest
  | WorkerGenerateChartRequest
  | WorkerExportDatasetRequest
  | WorkerAnalyzeIntelligenceRequest;

// Worker Response Messages (Worker -> Main)
export interface WorkerParseSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'PARSE_FILE';
  readonly payload: {
    readonly dataset: Dataset;
    readonly previewData: readonly Record<string, unknown>[]; // 100 baris pertama untuk FND-03
  };
}

export interface WorkerCalculateStatsSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'CALCULATE_STATS';
  readonly payload: {
    readonly datasetId: string;
    readonly stats: DataQualitySummary;
  };
}

export interface WorkerCalculateDescriptiveStatsSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'CALCULATE_DESCRIPTIVE_STATS';
  readonly payload: {
    readonly datasetId: string;
    readonly stats: DescriptiveStatisticsSummary;
  };
}

export interface WorkerPreviewRecipeStepSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'PREVIEW_RECIPE_STEP';
  readonly payload: {
    readonly datasetId: string;
    readonly preview: RecipePreviewResult;
  };
}

export interface WorkerApplyRecipeSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'APPLY_RECIPE';
  readonly payload: {
    readonly datasetId: string;
    readonly updatedDataset: Dataset;
    readonly previewData: readonly Record<string, unknown>[];
    readonly recipe: readonly RecipeStep[];
    readonly impactEstimate?: number; // Estimasi jumlah baris/sel yang terdampak (FR-11)
  };
}

export interface WorkerRemoveRecipeStepSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'REMOVE_RECIPE_STEP';
  readonly payload: {
    readonly datasetId: string;
    readonly updatedDataset: Dataset;
    readonly previewData: readonly Record<string, unknown>[];
    readonly recipe: readonly RecipeStep[];
  };
}

export interface WorkerResetRecipeSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'RESET_RECIPE';
  readonly payload: {
    readonly datasetId: string;
    readonly updatedDataset: Dataset;
    readonly previewData: readonly Record<string, unknown>[];
    readonly recipe: readonly RecipeStep[];
  };
}

export interface WorkerErrorResponse {
  readonly taskId: string;
  readonly status: 'ERROR';
  readonly action: WorkerRequest['action'];
  readonly payload: {
    readonly error: string;
    readonly details?: string;
  };
}

export interface WorkerInspectSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'INSPECT_FILE';
  readonly payload: {
    readonly sheetNames: readonly string[]; // Khusus Excel
  };
}

export interface QueryDataResult {
  readonly datasetId: string;
  readonly rows: readonly Record<string, unknown>[];
  readonly totalRows: number;
  readonly matchedRows: number;
  readonly offset: number;
  readonly limit: number;
}

export interface WorkerQueryDataSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'QUERY_DATA';
  readonly payload: QueryDataResult;
}

export interface WorkerGenerateChartSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'GENERATE_CHART_DATA';
  readonly payload: {
    readonly datasetId: string;
    readonly chartResult: ChartDataResult;
  };
}

export interface WorkerExportDatasetSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'EXPORT_DATASET';
  readonly payload: {
    readonly datasetId: string;
    readonly format: ExportFormat;
    readonly fileName: string;
    readonly mimeType: string;
    readonly buffer: ArrayBuffer;
    readonly rowCount: number;
    readonly columnCount: number;
  };
}

// ==========================================
// TASK-DI-01: Dataset Intelligence Contracts
// ==========================================

export type DatasetFamily =
  | 'EVENT_LOG'
  | 'TRANSACTION'
  | 'CUSTOMER_RECORDS'
  | 'PRODUCT_CATALOG'
  | 'SURVEY_RESPONSES'
  | 'TIME_SERIES'
  | 'GENERAL_TABULAR'
  | 'UNCLASSIFIED';

export type IntelligenceConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DatasetTypeInference {
  readonly family: DatasetFamily;
  readonly label: string;
  readonly description: string;
  readonly confidence: IntelligenceConfidence;
  readonly confidenceLabel: 'Rendah' | 'Sedang' | 'Tinggi';
  readonly supportingFactors: readonly string[];
  readonly caveats: readonly string[];
}

export type SemanticColumnRole =
  | 'IDENTIFIER'
  | 'NAME_LABEL'
  | 'CATEGORY'
  | 'DATE_TIME'
  | 'NUMERIC_METRIC'
  | 'CURRENCY'
  | 'PERCENTAGE'
  | 'DURATION'
  | 'BOOLEAN'
  | 'FREE_TEXT'
  | 'CONSTANT'
  | 'UNKNOWN';

export interface SemanticColumnProfile {
  readonly columnId: string;
  readonly columnName: string;
  readonly inferredType: DataType;
  readonly role: SemanticColumnRole;
  readonly roleLabel: string;
  readonly confidence: IntelligenceConfidence;
  readonly confidenceLabel: 'Rendah' | 'Sedang' | 'Tinggi';
  readonly rationale: string;
  readonly evidence: {
    readonly uniqueCount: number;
    readonly uniquenessRatio: number;
    readonly nullCount: number;
    readonly nullRatio: number;
    readonly isConstant: boolean;
    readonly sampleValues: readonly unknown[];
    readonly isNumeric: boolean;
    readonly isDateTime: boolean;
    readonly isIdentifierPattern?: boolean;
    readonly isCurrencyPattern?: boolean;
    readonly isPercentagePattern?: boolean;
  };
}

export type FindingCategory = 'QUALITY' | 'DISTRIBUTION' | 'VARIATION' | 'STRUCTURE';
export type FindingSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface DatasetFinding {
  readonly id: string;
  readonly category: FindingCategory;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly description: string;
  readonly targetColumns: readonly string[];
  readonly numericalEvidence: {
    readonly metricName: string;
    readonly value: number | string;
    readonly formattedValue: string;
  };
}

export type RecommendedActionType = 'CHART' | 'ANALYSIS' | 'CLEANING';

export interface AnalysisRecommendation {
  readonly id: string;
  readonly type: RecommendedActionType;
  readonly title: string;
  readonly questionAnswered: string;
  readonly rationale: string;
  readonly targetColumns: readonly string[];
  readonly targetRoute: '/visualisasi' | '/analisis' | '/pembersihan';
  readonly chartType?: ChartType;
  readonly chartConfigSuggestion?: {
    readonly chartType: ChartType;
    readonly xColumn?: string;
    readonly yColumn?: string;
    readonly aggregation?: 'COUNT' | 'SUM' | 'MEAN';
    readonly bins?: number;
  };
}

export interface DatasetIntelligenceResult {
  readonly datasetId: string;
  readonly evaluatedAt: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly hasHeader: boolean;
  readonly typeInference: DatasetTypeInference;
  readonly columnProfiles: readonly SemanticColumnProfile[];
  readonly keyFindings: readonly DatasetFinding[];
  readonly recommendations: readonly AnalysisRecommendation[];
}

export interface WorkerAnalyzeIntelligenceSuccessResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS';
  readonly action: 'ANALYZE_DATASET_INTELLIGENCE';
  readonly payload: {
    readonly datasetId: string;
    readonly intelligence: DatasetIntelligenceResult;
  };
}

export type WorkerResponse =
  | WorkerParseSuccessResponse
  | WorkerCalculateStatsSuccessResponse
  | WorkerCalculateDescriptiveStatsSuccessResponse
  | WorkerPreviewRecipeStepSuccessResponse
  | WorkerApplyRecipeSuccessResponse
  | WorkerRemoveRecipeStepSuccessResponse
  | WorkerResetRecipeSuccessResponse
  | WorkerErrorResponse
  | WorkerInspectSuccessResponse
  | WorkerQueryDataSuccessResponse
  | WorkerGenerateChartSuccessResponse
  | WorkerExportDatasetSuccessResponse
  | WorkerAnalyzeIntelligenceSuccessResponse;

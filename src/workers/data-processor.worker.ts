/// <reference lib="webworker" />

import { WorkerRequest, WorkerResponse, ColumnSchema, Dataset, RecipeStep } from '../types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { estimateMemoryUsage, determineIntegrityStatus } from '../lib/metrics';
import { inferColumnTypes } from '../lib/type-inference';
import { calculateDataQuality } from '../lib/data-quality';
import { calculateDescriptiveStatistics } from '../lib/descriptive-stats';
import { queryDataGrid } from '../lib/data-grid-engine';
import { previewRecipeStep, applyRecipeStep, executeRecipe } from '../lib/recipe-engine';
import { generateChartData } from '../lib/chart-engine';
import { serializeToCsv, serializeToXlsx, sanitizeFileName } from '../lib/export-engine';
import { analyzeDatasetIntelligence } from '../lib/dataset-intelligence';

// In-memory data store for active dataset (digunakan oleh query, stats, profiling)
const dataStore: Map<string, Record<string, unknown>[]> = new Map();

// Snapshot dataset mentah asli (Immutable, tidak pernah termutasi)
const originalDataStore: Map<string, Record<string, unknown>[]> = new Map();
const originalColumnsStore: Map<string, ColumnSchema[]> = new Map();

// Metadata dataset dan riwayat recipe langkah pembersihan
const datasetMetaStore: Map<string, Dataset> = new Map();
const recipeStore: Map<string, RecipeStep[]> = new Map();

// Track active parsers to allow abortion
const activeParsers: Map<string, Papa.Parser> = new Map();

// Map to track active tasks and allow cancellation
const activeTasks: Map<string, boolean> = new Map();

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  // Handle cancellation immediately
  if (request.action === 'CANCEL_TASK') {
    activeTasks.set(request.taskId, false);
    
    // Abort parser if one is running for this task
    const parser = activeParsers.get(request.taskId);
    if (parser) {
      parser.abort();
      activeParsers.delete(request.taskId);
    }
    
    return; // Do not send a success response for CANCEL_TASK to avoid race conditions
  }

  // Register task as active
  activeTasks.set(request.taskId, true);

  try {
    switch (request.action) {
      case 'PARSE_FILE':
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        
        const { file, fileId, options } = request.payload;
        
        // Empty file check (PRD 8.1 Edge Cases)
        if (file.size === 0) {
          throw new Error('File kosong (0 byte). Silakan periksa kembali berkas Anda.');
        }

        const fileName = file?.name || '';
        const isExcel = fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');

        if (isExcel) {
          (async () => {
            try {
              const rawBuffer = await file.arrayBuffer();
              const buffer = new Uint8Array(rawBuffer);
              if (!activeTasks.get(request.taskId)) return;

              const readOptions: XLSX.ParsingOptions = { type: 'array' };
              if (options?.sampleLimit) {
                readOptions.sheetRows = options.sampleLimit; // Hanya memparsing baris sampel
              }
              const workbook = XLSX.read(buffer, readOptions);
              
              if (workbook.SheetNames.length === 0) {
                throw new Error("Buku kerja Excel kosong atau tidak valid.");
              }

              const targetSheetName = options?.sheetName || workbook.SheetNames[0];
              if (!workbook.SheetNames.includes(targetSheetName)) {
                throw new Error(`Sheet "${targetSheetName}" tidak ditemukan.`);
              }

              const worksheet = workbook.Sheets[targetSheetName];
              const hasHeader = options?.hasHeader !== false;
              let rawData: Record<string, unknown>[];
              let columns: string[];

              if (hasHeader) {
                rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, unknown>[];
                if (rawData.length === 0) {
                  throw new Error('Sheet hanya berisi header atau kosong.');
                }
                columns = Object.keys(rawData[0]);
              } else {
                const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as unknown[][];
                if (matrix.length === 0) {
                  throw new Error('Sheet kosong.');
                }
                const maxCols = matrix.reduce((max, r) => (Array.isArray(r) && r.length > max ? r.length : max), 0);
                columns = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
                rawData = [];
                for (let i = 0; i < matrix.length; i++) {
                  const r = matrix[i];
                  if (!Array.isArray(r) || r.length === 0) continue;
                  const rowObj: Record<string, unknown> = {};
                  for (let c = 0; c < columns.length; c++) {
                    rowObj[columns[c]] = r[c] !== undefined ? r[c] : '';
                  }
                  rawData.push(rowObj);
                }
              }

              if (!activeTasks.get(request.taskId)) return;

              const columnSchemas = inferColumnTypes(columns, rawData);

              // Simpan snapshot mentah asli yang tidak termutasi
              originalDataStore.set(fileId, rawData.map(r => ({ ...r })));
              originalColumnsStore.set(fileId, columnSchemas.map(c => ({ ...c })));

              // Simpan dataset aktif dan inisialisasi recipe kosong
              dataStore.set(fileId, rawData);
              recipeStore.set(fileId, []);

              const previewData = rawData.slice(0, 100);
              const estimatedMemoryBytes = estimateMemoryUsage(previewData, rawData.length);
              const integrityStatus = determineIntegrityStatus(rawData.length, columns.length, 0);

              const datasetObj: Dataset = {
                id: fileId,
                name: file.name,
                rowCount: rawData.length,
                columnCount: columns.length,
                columns: columnSchemas,
                fileSize: file.size,
                estimatedMemoryBytes,
                integrityStatus,
                availableSheets: workbook.SheetNames,
                hasHeader
              };
              datasetMetaStore.set(fileId, datasetObj);

              self.postMessage({
                taskId: request.taskId,
                status: 'SUCCESS',
                action: 'PARSE_FILE',
                payload: {
                  dataset: datasetObj,
                  previewData
                }
              } as WorkerResponse);
            } catch (error: unknown) {
              const err = error as Error;
              if (!activeTasks.get(request.taskId)) return;
              self.postMessage({
                taskId: request.taskId,
                status: 'ERROR',
                action: 'PARSE_FILE',
                payload: {
                  error: `Gagal membaca file Excel: ${err.message}`
                }
              } as WorkerResponse);
            } finally {
              activeTasks.delete(request.taskId);
            }
          })();
          break;
        }

        const rows: Record<string, unknown>[] = [];
        let columns: string[] = [];
        let parseErrorsCount = 0;

        const handleComplete = () => {
          activeParsers.delete(request.taskId);
          if (!activeTasks.get(request.taskId)) {
            activeTasks.delete(request.taskId);
            return; // silently exit if cancelled
          }

          if (rows.length === 0) {
            activeTasks.delete(request.taskId);
            self.postMessage({
              taskId: request.taskId,
              status: 'ERROR',
              action: 'PARSE_FILE',
              payload: {
                error: 'File hanya berisi header tanpa baris data observasi. Analisis statistik tidak dapat dilakukan.'
              }
            } as WorkerResponse);
            return;
          }
          
          const columnSchemas = inferColumnTypes(columns, rows);

          // Simpan snapshot mentah asli yang tidak termutasi
          originalDataStore.set(fileId, rows.map(r => ({ ...r })));
          originalColumnsStore.set(fileId, columnSchemas.map(c => ({ ...c })));

          // Simpan dataset aktif dan inisialisasi recipe kosong
          dataStore.set(fileId, rows);
          recipeStore.set(fileId, []);
          
          const previewData = rows.slice(0, 100);
          const estimatedMemoryBytes = estimateMemoryUsage(previewData, rows.length);
          const integrityStatus = determineIntegrityStatus(rows.length, columns.length, parseErrorsCount);
          
          const datasetObj: Dataset = {
            id: fileId,
            name: file.name,
            rowCount: rows.length,
            columnCount: columns.length,
            columns: columnSchemas,
            fileSize: file.size,
            estimatedMemoryBytes,
            integrityStatus,
            hasHeader: options?.hasHeader !== false
          };
          datasetMetaStore.set(fileId, datasetObj);

          activeTasks.delete(request.taskId);
          self.postMessage({
            taskId: request.taskId,
            status: 'SUCCESS',
            action: 'PARSE_FILE',
            payload: {
              dataset: datasetObj,
              previewData
            }
          } as WorkerResponse);
        };

        const handleError = (error: Error | { message: string }) => {
          activeParsers.delete(request.taskId);
          if (!activeTasks.get(request.taskId)) {
            activeTasks.delete(request.taskId);
            return;
          }
          
          activeTasks.delete(request.taskId);
          self.postMessage({
            taskId: request.taskId,
            status: 'ERROR',
            action: 'PARSE_FILE',
            payload: {
              error: `Format berkas tidak valid atau rusak: ${error.message}`
            }
          } as WorkerResponse);
        };

        const hasHeader = options?.hasHeader !== false;

        // Fallback untuk environment tanpa FileReaderSync (misal sandbox / non-standard workers)
        if (typeof FileReaderSync === 'undefined' && typeof (file as Blob).text === 'function') {
          (async () => {
            try {
              const text = await file.text();
              if (!activeTasks.get(request.taskId)) return;

              Papa.parse(text, {
                header: hasHeader,
                dynamicTyping: false,
                skipEmptyLines: true,
                delimiter: options?.delimiter || "",
                preview: options?.sampleLimit || 0,
                step: (results, parser) => {
                  activeParsers.set(request.taskId, parser);
                  if (!activeTasks.get(request.taskId)) {
                    parser.abort();
                    return;
                  }
                  if (results.errors && results.errors.length > 0) {
                    parseErrorsCount += results.errors.length;
                  }
                  if (hasHeader) {
                    if (results.meta.fields && columns.length === 0) {
                      columns = results.meta.fields;
                    }
                    rows.push(results.data as Record<string, unknown>);
                  } else {
                    const item = results.data as unknown[];
                    if (Array.isArray(item)) {
                      if (columns.length === 0 && item.length > 0) {
                        columns = Array.from({ length: item.length }, (_, i) => `Column ${i + 1}`);
                      }
                      const rowObj: Record<string, unknown> = {};
                      for (let c = 0; c < columns.length; c++) {
                        rowObj[columns[c]] = item[c] !== undefined ? item[c] : '';
                      }
                      rows.push(rowObj);
                    }
                  }
                },
                complete: () => handleComplete(),
                error: (error: Error) => handleError(error),
              });
            } catch (err: unknown) {
              handleError(err as Error);
            }
          })();
          break;
        }

        Papa.parse(file, {
          header: hasHeader,
          dynamicTyping: false, // FND-01: jangan inferensi tipe dulu
          skipEmptyLines: true, // FND-01: skip baris kosong murni
          encoding: "UTF-8",
          delimiter: options?.delimiter || "", // Auto detect jika kosong
          preview: options?.sampleLimit || 0, // FND-07: Batas sampel
          chunk: (results, parser) => {
            activeParsers.set(request.taskId, parser);
            
            if (!activeTasks.get(request.taskId)) {
              parser.abort();
              return;
            }
            
            if (results.errors && results.errors.length > 0) {
              parseErrorsCount += results.errors.length;
            }
            
            if (hasHeader) {
              if (results.meta.fields && columns.length === 0) {
                columns = results.meta.fields;
              }
              const batch = results.data as Record<string, unknown>[];
              for (let i = 0; i < batch.length; i++) {
                rows.push(batch[i]);
              }
            } else {
              const batch = results.data as unknown[][];
              if (columns.length === 0 && batch.length > 0 && Array.isArray(batch[0])) {
                columns = Array.from({ length: batch[0].length }, (_, i) => `Column ${i + 1}`);
              }
              for (let i = 0; i < batch.length; i++) {
                const item = batch[i];
                if (!Array.isArray(item) || item.length === 0) continue;
                const rowObj: Record<string, unknown> = {};
                for (let c = 0; c < columns.length; c++) {
                  rowObj[columns[c]] = item[c] !== undefined ? item[c] : '';
                }
                rows.push(rowObj);
              }
            }
          },
          complete: () => handleComplete(),
          error: (error: Error) => handleError(error)
        });
        break;

      case 'CALCULATE_STATS': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        
        const req = request as Extract<WorkerRequest, { action: 'CALCULATE_STATS' }>;
        const dsId = req.payload.datasetId;
        const rawData = dataStore.get(dsId) as Record<string, unknown>[] | undefined;

        if (!rawData) {
          throw new Error('Dataset tidak ditemukan di memori Worker.');
        }

        const stats = calculateDataQuality(
          dsId,
          rawData,
          req.payload.columns,
          req.payload.options
        );

        if (!activeTasks.get(request.taskId)) return;

        self.postMessage({
          taskId: request.taskId,
          status: 'SUCCESS',
          action: 'CALCULATE_STATS',
          payload: {
            datasetId: dsId,
            stats
          }
        } as WorkerResponse);
        break;
      }

      case 'CALCULATE_DESCRIPTIVE_STATS': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        
        const req = request as Extract<WorkerRequest, { action: 'CALCULATE_DESCRIPTIVE_STATS' }>;
        const dsId = req.payload.datasetId;
        const rawData = dataStore.get(dsId) as Record<string, unknown>[] | undefined;

        if (!rawData) {
          throw new Error('Dataset tidak ditemukan di memori Worker.');
        }

        const stats = calculateDescriptiveStatistics(
          dsId,
          rawData,
          req.payload.columns,
          req.payload.options
        );

        if (!activeTasks.get(request.taskId)) return;

        self.postMessage({
          taskId: request.taskId,
          status: 'SUCCESS',
          action: 'CALCULATE_DESCRIPTIVE_STATS',
          payload: {
            datasetId: dsId,
            stats
          }
        } as WorkerResponse);
        break;
      }

      case 'QUERY_DATA': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');

        const req = request as Extract<WorkerRequest, { action: 'QUERY_DATA' }>;
        const dsId = req.payload.datasetId;
        const rawData = dataStore.get(dsId) as Record<string, unknown>[] | undefined;

        if (!rawData) {
          throw new Error('Dataset tidak ditemukan di memori Worker.');
        }

        const result = queryDataGrid(rawData, req.payload);

        if (!activeTasks.get(request.taskId)) return;

        self.postMessage({
          taskId: request.taskId,
          status: 'SUCCESS',
          action: 'QUERY_DATA',
          payload: result
        } as WorkerResponse);
        break;
      }

      case 'PREVIEW_RECIPE_STEP': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        const req = request as Extract<WorkerRequest, { action: 'PREVIEW_RECIPE_STEP' }>;
        const dsId = req.payload.datasetId;
        const activeData = dataStore.get(dsId);
        const meta = datasetMetaStore.get(dsId);

        if (!activeData || !meta) {
          throw new Error('Dataset tidak ditemukan di memori Worker.');
        }

        const preview = previewRecipeStep(activeData, meta.columns, req.payload.step);

        if (!activeTasks.get(request.taskId)) return;

        self.postMessage({
          taskId: request.taskId,
          status: 'SUCCESS',
          action: 'PREVIEW_RECIPE_STEP',
          payload: {
            datasetId: dsId,
            preview
          }
        } as WorkerResponse);
        break;
      }

      case 'APPLY_RECIPE': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        const req = request as Extract<WorkerRequest, { action: 'APPLY_RECIPE' }>;
        const dsId = req.payload.datasetId;
        const activeData = dataStore.get(dsId);
        const meta = datasetMetaStore.get(dsId);

        if (!activeData || !meta) {
          throw new Error('Dataset tidak ditemukan di memori Worker.');
        }

        const result = applyRecipeStep(activeData, meta.columns, req.payload.step);
        const currentRecipe = recipeStore.get(dsId) || [];
        const updatedRecipe = [...currentRecipe, req.payload.step];

        // Perbarui dataset aktif dan riwayat recipe
        dataStore.set(dsId, result.data);
        recipeStore.set(dsId, updatedRecipe);

        const previewData = result.data.slice(0, 100);
        const updatedDataset: Dataset = {
          ...meta,
          rowCount: result.data.length,
          columnCount: result.columns.length,
          columns: result.columns,
          estimatedMemoryBytes: estimateMemoryUsage(previewData, result.data.length),
          integrityStatus: determineIntegrityStatus(result.data.length, result.columns.length, 0)
        };
        datasetMetaStore.set(dsId, updatedDataset);

        if (!activeTasks.get(request.taskId)) return;

        self.postMessage({
          taskId: request.taskId,
          status: 'SUCCESS',
          action: 'APPLY_RECIPE',
          payload: {
            datasetId: dsId,
            updatedDataset,
            previewData,
            recipe: updatedRecipe,
            impactEstimate: result.impactEstimate
          }
        } as WorkerResponse);
        break;
      }

      case 'REMOVE_RECIPE_STEP': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        const req = request as Extract<WorkerRequest, { action: 'REMOVE_RECIPE_STEP' }>;
        const dsId = req.payload.datasetId;
        const originalData = originalDataStore.get(dsId);
        const originalColumns = originalColumnsStore.get(dsId);
        const meta = datasetMetaStore.get(dsId);

        if (!originalData || !originalColumns || !meta) {
          throw new Error('Snapshot data asli tidak ditemukan di memori Worker.');
        }

        const currentRecipe = recipeStore.get(dsId) || [];
        const remainingSteps = currentRecipe.filter(s => s.id !== req.payload.stepId);

        // Evaluasi ulang secara deterministik dari snapshot awal menggunakan langkah yang tersisa
        const result = executeRecipe(originalData, originalColumns, remainingSteps);

        // Perbarui dataset aktif
        dataStore.set(dsId, result.data);
        recipeStore.set(dsId, remainingSteps);

        const previewData = result.data.slice(0, 100);
        const updatedDataset: Dataset = {
          ...meta,
          rowCount: result.data.length,
          columnCount: result.columns.length,
          columns: result.columns,
          estimatedMemoryBytes: estimateMemoryUsage(previewData, result.data.length),
          integrityStatus: determineIntegrityStatus(result.data.length, result.columns.length, 0)
        };
        datasetMetaStore.set(dsId, updatedDataset);

        if (!activeTasks.get(request.taskId)) return;

        self.postMessage({
          taskId: request.taskId,
          status: 'SUCCESS',
          action: 'REMOVE_RECIPE_STEP',
          payload: {
            datasetId: dsId,
            updatedDataset,
            previewData,
            recipe: remainingSteps
          }
        } as WorkerResponse);
        break;
      }

      case 'RESET_RECIPE': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        const req = request as Extract<WorkerRequest, { action: 'RESET_RECIPE' }>;
        const dsId = req.payload.datasetId;
        const originalData = originalDataStore.get(dsId);
        const originalColumns = originalColumnsStore.get(dsId);
        const meta = datasetMetaStore.get(dsId);

        if (!originalData || !originalColumns || !meta) {
          throw new Error('Snapshot data asli tidak ditemukan di memori Worker.');
        }

        // Kembalikan ke data asli persis (clone rows) dan kosongkan langkah recipe
        const restoredData = originalData.map(r => ({ ...r }));
        const restoredColumns = originalColumns.map(c => ({ ...c }));

        dataStore.set(dsId, restoredData);
        recipeStore.set(dsId, []);

        const previewData = restoredData.slice(0, 100);
        const updatedDataset: Dataset = {
          ...meta,
          rowCount: restoredData.length,
          columnCount: restoredColumns.length,
          columns: restoredColumns,
          estimatedMemoryBytes: estimateMemoryUsage(previewData, restoredData.length),
          integrityStatus: determineIntegrityStatus(restoredData.length, restoredColumns.length, 0)
        };
        datasetMetaStore.set(dsId, updatedDataset);

        if (!activeTasks.get(request.taskId)) return;

        self.postMessage({
          taskId: request.taskId,
          status: 'SUCCESS',
          action: 'RESET_RECIPE',
          payload: {
            datasetId: dsId,
            updatedDataset,
            previewData,
            recipe: []
          }
        } as WorkerResponse);
        break;
      }

      case 'INSPECT_FILE': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        const req = request as Extract<WorkerRequest, { action: 'INSPECT_FILE' }>;
        const file = req.payload.file;

        const fileName = file?.name || '';
        const isExcel = fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');
        if (!isExcel) {
          throw new Error('Inspeksi saat ini hanya didukung untuk file Excel.');
        }

        (async () => {
          try {
            const rawBuffer = await file.arrayBuffer();
            const buffer = new Uint8Array(rawBuffer);
            if (!activeTasks.get(request.taskId)) return;

            // Baca workbook hanya untuk mendapatkan daftar sheet
            const workbook = XLSX.read(buffer, { type: 'array', bookSheets: true });
            
            if (!activeTasks.get(request.taskId)) return;

            self.postMessage({
              taskId: request.taskId,
              status: 'SUCCESS',
              action: 'INSPECT_FILE',
              payload: {
                sheetNames: workbook.SheetNames
              }
            } as WorkerResponse);
          } catch (error: unknown) {
            const err = error as Error;
            if (!activeTasks.get(request.taskId)) return;
            self.postMessage({
              taskId: request.taskId,
              status: 'ERROR',
              action: 'INSPECT_FILE',
              payload: {
                error: `Gagal membaca file Excel: ${err.message}`
              }
            } as WorkerResponse);
          } finally {
            activeTasks.delete(request.taskId);
          }
        })();
        break;
      }

      case 'GENERATE_CHART_DATA': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        const req = request as Extract<WorkerRequest, { action: 'GENERATE_CHART_DATA' }>;
        const { datasetId, config } = req.payload;

        const activeData = dataStore.get(datasetId);
        const meta = datasetMetaStore.get(datasetId);

        if (!activeData || !meta) {
          throw new Error('Dataset tidak ditemukan di memori Worker.');
        }

        const chartResult = generateChartData(activeData, meta.columns, config);

        if (!activeTasks.get(request.taskId)) return;

        self.postMessage({
          taskId: request.taskId,
          status: 'SUCCESS',
          action: 'GENERATE_CHART_DATA',
          payload: {
            datasetId,
            chartResult,
          }
        } as WorkerResponse);
        break;
      }

      case 'EXPORT_DATASET': {
        if (!activeTasks.get(request.taskId)) throw new Error('Task Cancelled');
        const req = request as Extract<WorkerRequest, { action: 'EXPORT_DATASET' }>;
        const { datasetId, options } = req.payload;

        const activeData = dataStore.get(datasetId);
        const meta = datasetMetaStore.get(datasetId);

        if (!activeData || !meta) {
          throw new Error('Dataset tidak ditemukan di memori Worker.');
        }

        const format = options.format;
        let buffer: ArrayBuffer;
        let mimeType: string;
        let extension: string;

        if (format === 'CSV') {
          const csvText = serializeToCsv(activeData, meta.columns, {
            delimiter: options.delimiter,
            includeBom: options.includeBom,
          });
          const uint8 = new TextEncoder().encode(csvText);
          buffer = uint8.buffer as ArrayBuffer;
          mimeType = 'text/csv;charset=utf-8';
          extension = 'csv';
        } else if (format === 'XLSX') {
          buffer = serializeToXlsx(activeData, meta.columns, {
            sheetName: options.sheetName,
          });
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          extension = 'xlsx';
        } else {
          throw new Error(`Format ekspor tidak didukung: ${format}`);
        }

        const baseName = options.fileName
          ? sanitizeFileName(options.fileName.replace(/\.(csv|xlsx)$/i, ''))
          : sanitizeFileName(meta.name.replace(/\.[^/.]+$/, ''));
        const fileName = `${baseName}.${extension}`;

        if (!activeTasks.get(request.taskId)) return;

        const responsePayload = {
          datasetId,
          format,
          fileName,
          mimeType,
          buffer,
          rowCount: activeData.length,
          columnCount: meta.columns.length,
        };

        self.postMessage(
          {
            taskId: request.taskId,
            status: 'SUCCESS',
            action: 'EXPORT_DATASET',
            payload: responsePayload,
          } as WorkerResponse,
          [buffer]
        );
        break;
      }

      case 'ANALYZE_DATASET_INTELLIGENCE': {
        if (!activeTasks.get(request.taskId)) return;
        const { datasetId } = request.payload;
        const activeData = dataStore.get(datasetId);
        const meta = datasetMetaStore.get(datasetId);

        if (!activeData || !meta) {
          throw new Error(`Dataset dengan ID "${datasetId}" tidak ditemukan dalam memori Worker.`);
        }

        const intelligence = analyzeDatasetIntelligence(meta, activeData);

        if (!activeTasks.get(request.taskId)) return;

        self.postMessage({
          taskId: request.taskId,
          status: 'SUCCESS',
          action: 'ANALYZE_DATASET_INTELLIGENCE',
          payload: {
            datasetId,
            intelligence,
          },
        } as WorkerResponse);
        break;
      }

      default:
        throw new Error(`Unknown action: ${(request as { action?: string }).action}`);
    }
  } catch (error: unknown) {
    const err = error as Error;
    activeTasks.delete(request.taskId);
    if (err.message === 'Task Cancelled') {
      // Don't broadcast error for intentional cancellations
      return;
    }
    
    self.postMessage({
      taskId: request.taskId,
      status: 'ERROR',
      action: request.action,
      payload: {
        error: err.message || 'Unknown worker error',
      }
    } as WorkerResponse);
  } finally {
    // Synchronous tasks are cleaned up immediately; async tasks manage their own completion
    if (request.action !== 'PARSE_FILE' && request.action !== 'INSPECT_FILE') {
      activeTasks.delete(request.taskId);
    }
  }
});

export {}; // Ensure this is treated as a module

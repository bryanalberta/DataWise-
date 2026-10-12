'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useDatasetStore } from '@/store/dataset-store';
import { workerClient } from '@/lib/worker-client';
import { WorkerParseSuccessResponse, WorkerInspectSuccessResponse } from '@/types';
import { UploadCloud, FileSpreadsheet, FileText, AlertTriangle, FileQuestion, Loader2, RotateCcw, FolderOpen, ShieldCheck, CheckCircle2 } from 'lucide-react';

const CSV_LIMIT = 30 * 1024 * 1024;
const EXCEL_LIMIT = 15 * 1024 * 1024;

type ImportState = 
  | 'IDLE' 
  | 'WARNING_SIZE'
  | 'SELECT_SHEET'
  | 'PROCESSING';

let fileIdCounter = 0;
const generateFileId = () => {
  fileIdCounter += 1;
  return `file-${new Date().getTime()}-${fileIdCounter}`;
};

export function FileDropzone() {
  const { setDataset, startProcessing, stopProcessing, setError, clearError, isProcessing, activeDataset } = useDatasetStore();
  
  const [dragActive, setDragActive] = useState(false);
  const [importState, setImportState] = useState<ImportState>('IDLE');
  
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [loadedFile, setLoadedFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<readonly string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [delimiter, setDelimiter] = useState<string>(''); // empty means auto
  const [hasHeader, setHasHeader] = useState<boolean>(true); // TASK-FIX-02: Baris pertama adalah header vs data
  const [isSampleMode, setIsSampleMode] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setImportState('IDLE');
    setPendingFile(null);
    setLoadedFile(null);
    setSheetNames([]);
    setSelectedSheet('');
    setDelimiter('');
    setHasHeader(true);
    setIsSampleMode(false);
    
    if (currentTaskId) {
      workerClient.cancelTask(currentTaskId);
      setCurrentTaskId(null);
    }
    stopProcessing();
    
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const cancelImport = () => {
    resetState();
    clearError();
  };

  const getExtension = (filename: string) => {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts.pop()?.toLowerCase()}` : '';
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processFile = (file: File) => {
    clearError();
    const ext = getExtension(file.name);
    
    if (!['.csv', '.tsv', '.xlsx', '.xls'].includes(ext)) {
      setError(`Format file tidak didukung: ${ext}. Gunakan .csv, .tsv, .xlsx, atau .xls.`);
      return;
    }
    
    if (file.size === 0) {
      setError('File kosong (0 byte). Silakan periksa kembali berkas Anda.');
      return;
    }

    setPendingFile(file);

    const isExcel = ext === '.xlsx' || ext === '.xls';
    const limit = isExcel ? EXCEL_LIMIT : CSV_LIMIT;

    if (file.size > limit) {
      setImportState('WARNING_SIZE');
    } else if (isExcel) {
      inspectExcel(file);
    } else {
      executeParse(file, '', false, delimiter, hasHeader);
    }
  };

  const inspectExcel = async (file: File) => {
    setImportState('PROCESSING');
    startProcessing('inspect', 'Menginspeksi workbook Excel...');
    
    try {
      const { promise, taskId } = workerClient.executeTask('INSPECT_FILE', {
        fileId: generateFileId(),
        file
      });
      setCurrentTaskId(taskId);
      
      const result = await promise as WorkerInspectSuccessResponse['payload'];
      
      if (result.sheetNames.length > 1) {
        setSheetNames(result.sheetNames);
        setSelectedSheet(result.sheetNames[0]);
        setImportState('SELECT_SHEET');
        stopProcessing();
      } else {
        executeParse(file, result.sheetNames[0], isSampleMode, delimiter, hasHeader);
      }
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message !== 'Task Cancelled') {
        setError(err.message || 'Gagal menginspeksi file.');
      }
      setImportState('IDLE');
      stopProcessing();
    }
  };

  const executeParse = async (
    file: File, 
    targetSheet: string, 
    sample: boolean, 
    delimiterOverride?: string,
    hasHeaderOverride?: boolean
  ) => {
    const parseDelimiter = delimiterOverride !== undefined ? delimiterOverride : delimiter;
    if (delimiterOverride !== undefined) setDelimiter(parseDelimiter);

    const parseHasHeader = hasHeaderOverride !== undefined ? hasHeaderOverride : hasHeader;
    if (hasHeaderOverride !== undefined) setHasHeader(parseHasHeader);

    setImportState('PROCESSING');
    startProcessing('parse', 'Membaca dan memparsing dataset...');
    
    try {
      const { promise, taskId } = workerClient.executeTask('PARSE_FILE', {
        fileId: generateFileId(),
        file,
        options: {
          sheetName: targetSheet || undefined,
          delimiter: parseDelimiter || undefined,
          sampleLimit: sample ? 10000 : undefined,
          hasHeader: parseHasHeader
        }
      });
      setCurrentTaskId(taskId);

      const result = await promise as WorkerParseSuccessResponse['payload'];
      
      setDataset(result.dataset, result.previewData);
      setImportState('IDLE');
      stopProcessing();
      setCurrentTaskId(null);
      setPendingFile(null);
      setLoadedFile(file);
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message !== 'Task Cancelled') {
        setError(err.message || 'Gagal memparsing dataset.');
      }
      setImportState('IDLE');
      stopProcessing();
      setCurrentTaskId(null);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleWarningAction = (action: 'continue' | 'sample' | 'cancel') => {
    if (action === 'cancel') {
      cancelImport();
      return;
    }
    
    const sampleMode = action === 'sample';
    setIsSampleMode(sampleMode);
    
    if (pendingFile) {
      const ext = getExtension(pendingFile.name);
      if (ext === '.xlsx' || ext === '.xls') {
        inspectExcel(pendingFile);
      } else {
        executeParse(pendingFile, '', sampleMode, delimiter, hasHeader);
      }
    }
  };

  // Compact dataset bar when dataset is loaded
  if (activeDataset && importState === 'IDLE' && !isProcessing) {
    const isCsv = loadedFile && (loadedFile.name.toLowerCase().endsWith('.csv') || loadedFile.name.toLowerCase().endsWith('.tsv'));

    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between text-slate-800 gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 border border-teal-100 text-[#0F766E] shadow-2xs">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-900 truncate tracking-tight">{activeDataset.name}</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                Aktif
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {formatSize(activeDataset.fileSize || 0)} • {activeDataset.availableSheets && activeDataset.availableSheets.length > 1 ? `Sheet: ${activeDataset.availableSheets[0]}` : (activeDataset.hasHeader === false ? 'CSV/TSV (Tanpa Header)' : 'CSV/TSV')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isCsv && (
            <>
              <div className="flex items-center gap-1.5 text-xs">
                <label className="text-slate-500 font-medium">Struktur:</label>
                <select 
                  className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:ring-2 focus:ring-[#0F766E]/30 focus:border-[#0F766E] outline-none transition-colors"
                  value={activeDataset.hasHeader !== false ? 'header' : 'data'}
                  onChange={(e) => {
                    const newHeader = e.target.value === 'header';
                    setHasHeader(newHeader);
                    if (loadedFile) {
                      executeParse(loadedFile, selectedSheet, isSampleMode, delimiter, newHeader);
                    }
                  }}
                  aria-label="Ubah mode struktur baris pertama"
                >
                  <option value="header">Baris pertama adalah header</option>
                  <option value="data">Baris pertama adalah data</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <label className="text-slate-500 font-medium">Delimiter:</label>
                <select 
                  className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:ring-2 focus:ring-[#0F766E]/30 focus:border-[#0F766E] outline-none transition-colors"
                  value={delimiter}
                  onChange={(e) => {
                    if (loadedFile) {
                      executeParse(loadedFile, '', isSampleMode, e.target.value, hasHeader);
                    }
                  }}
                  aria-label="Ubah pemisah kolom delimiter"
                >
                  <option value="">Otomatis</option>
                  <option value=",">Koma (,)</option>
                  <option value=";">Titik Koma (;)</option>
                  <option value={"\t"}>Tab</option>
                </select>
              </div>
            </>
          )}
          <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border border-slate-200/80 transition-colors focus-within:ring-2 focus-within:ring-[#0F766E]/50">
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Ganti Dataset</span>
            <input type="file" className="hidden" accept=".csv,.tsv,.xlsx,.xls" onChange={handleChange} ref={inputRef} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {importState === 'WARNING_SIZE' && pendingFile && (
        <div className="mb-4 p-5 border-l-4 border-amber-500 bg-amber-50 rounded-2xl border border-amber-200 shadow-xs">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-amber-900">Ukuran File Besar ({formatSize(pendingFile.size)})</h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                File ini melebihi rekomendasi ukuran pemrosesan lokal ({(pendingFile.name.endsWith('.csv') || pendingFile.name.endsWith('.tsv')) ? '30 MB' : '15 MB'}). Memproses seluruh data dapat memperlambat browser Anda tergantung spesifikasi perangkat keras.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button onClick={() => handleWarningAction('continue')} className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-2xs">
                  Lanjutkan (Penuh)
                </button>
                <button onClick={() => handleWarningAction('sample')} className="bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-2xs">
                  Muat Sampel (10k Baris)
                </button>
                <button onClick={() => handleWarningAction('cancel')} className="text-amber-700 hover:text-amber-950 font-semibold text-xs px-2.5 py-1.5">
                  Batalkan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importState === 'SELECT_SHEET' && pendingFile && (
        <div className="mb-4 p-6 border border-slate-200/90 rounded-2xl bg-white shadow-xs">
          <div className="flex items-start gap-3.5">
            <FileQuestion className="h-5 w-5 text-[#0F766E] shrink-0 mt-0.5" />
            <div className="w-full">
              <h3 className="text-sm font-bold text-slate-900">Pilih Lembar Kerja Excel (Worksheet)</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Workbook &quot;{pendingFile.name}&quot; memuat beberapa sheet. Tentukan sheet yang ingin diproses:
              </p>
              <div className="mt-3.5 max-w-sm">
                <select 
                  className="w-full border-slate-200 rounded-xl py-2 px-3 text-xs bg-slate-50 focus:ring-2 focus:ring-[#0F766E]/40 border font-medium text-slate-800 outline-none"
                  value={selectedSheet}
                  onChange={(e) => setSelectedSheet(e.target.value)}
                  aria-label="Pilih worksheet Excel"
                >
                  {sheetNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2.5 mt-4">
                <button onClick={() => executeParse(pendingFile, selectedSheet, isSampleMode, delimiter, hasHeader)} className="bg-[#0F766E] hover:bg-[#115E59] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors shadow-2xs">
                  Proses Sheet Terpilih
                </button>
                <button onClick={cancelImport} className="text-slate-500 hover:text-slate-800 font-semibold text-xs px-3 py-2">
                  Batalkan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importState === 'IDLE' && !activeDataset && !isProcessing && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-7 shadow-xs">
          <div 
            className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-all flex flex-col items-center justify-center
              ${dragActive ? 'border-[#0F766E] bg-teal-50/40 ring-4 ring-teal-500/10' : 'border-slate-200/90 hover:border-[#0F766E]/40 bg-slate-50/25'}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex justify-center mb-4">
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all shadow-2xs ${dragActive ? 'bg-teal-100 scale-105' : 'bg-teal-50 border border-teal-100/70'}`}>
                <UploadCloud className="h-8 w-8 text-[#0F766E]" />
              </div>
            </div>
            
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mb-1.5">Unggah Dataset Anda</h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-1 leading-relaxed">
              Tarik dan letakkan berkas di sini, atau telusuri penyimpanan komputer Anda untuk memulai eksplorasi data seketika.
            </p>
            <p className="text-xs text-slate-400 max-w-lg mx-auto mb-5">
              Mendukung CSV, TSV, XLSX, dan XLS dengan batas ukuran 30MB (CSV/TSV) atau 15MB (Excel).
            </p>

            <div className="mb-5">
              <label className="cursor-pointer inline-flex items-center gap-2 bg-[#0F766E] hover:bg-[#115E59] active:bg-[#134E4A] text-white px-6 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow-xs hover:shadow-sm focus-within:ring-2 focus-within:ring-[#0F766E]/50 focus-within:ring-offset-2">
                <FolderOpen className="h-4 w-4" />
                <span>Pilih File dari Komputer</span>
                <input type="file" className="hidden" accept=".csv,.tsv,.xlsx,.xls" onChange={handleChange} ref={inputRef} />
              </label>
            </div>

            {/* Ingestion options: Baris pertama adalah header vs data */}
            <div className="pt-4 border-t border-slate-100 w-full max-w-md flex flex-col items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700">Struktur Baris Pertama:</span>
              <div className="inline-flex rounded-xl border border-slate-200/90 p-1 bg-slate-100/80 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setHasHeader(true)}
                  className={`px-3.5 py-1.5 rounded-lg font-medium text-xs transition-all ${
                    hasHeader 
                      ? 'bg-white text-[#0F766E] font-bold shadow-2xs border border-slate-200/60' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Baris pertama adalah header
                </button>
                <button
                  type="button"
                  onClick={() => setHasHeader(false)}
                  className={`px-3.5 py-1.5 rounded-lg font-medium text-xs transition-all ${
                    !hasHeader 
                      ? 'bg-white text-[#0F766E] font-bold shadow-2xs border border-slate-200/60' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Baris pertama adalah data
                </button>
              </div>
              <p className="text-[11px] text-slate-500 text-center max-w-sm mt-0.5">
                {hasHeader
                  ? 'Gunakan baris 1 sebagai nama kolom dataset (skema variabel).'
                  : 'Pertahankan baris 1 sebagai baris observasi data (nama kolom: Column 1, 2, ...).'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100/80 border border-slate-200/60 font-mono text-[11px] text-slate-600">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                CSV / TSV (Maks 30MB)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100/80 border border-slate-200/60 font-mono text-[11px] text-slate-600">
                <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
                Excel (Maks 15MB)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-50 border border-teal-100 text-[#0F766E] font-semibold text-[11px]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0F766E]" />
                100% Pemrosesan Lokal (Zero-Server)
              </span>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-8 sm:p-12 text-center shadow-xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 border border-teal-100/80 mx-auto mb-4 shadow-2xs">
            <Loader2 className="h-7 w-7 animate-spin text-[#0F766E]" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">Sedang Memproses</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
            {useDatasetStore.getState().processingMessage || 'Harap tunggu, berkas sedang diproses di Web Worker lokal...'}
          </p>
          <div>
            <button 
              onClick={cancelImport} 
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              Batalkan Proses
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import { useDatasetStore } from '@/store/dataset-store';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Dataset, DataType, ColumnSchema } from '@/types';

type StoreState = ReturnType<typeof useDatasetStore.getState>;

const DATA_TYPES: DataType[] = ['Text', 'Numeric', 'Categorical', 'DateTime', 'Boolean'];

export function DatasetPreview({ _testState }: { _testState?: Partial<StoreState> }) {
  const storeState = useDatasetStore();
  const stateToUse = _testState || storeState;
  
  const error = stateToUse.error as string | null;
  const isProcessing = stateToUse.isProcessing as boolean;
  const processingMessage = stateToUse.processingMessage as string | null;
  const activeDataset = stateToUse.activeDataset as Dataset | null;
  const datasetPreview = (stateToUse.datasetPreview || []) as Record<string, unknown>[];
  const overrideColumnType = storeState.overrideColumnType;

  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Kesalahan</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isProcessing) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 text-[#0f766e]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-semibold">Memproses Dataset</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{processingMessage || 'Sedang menyiapkan data pratinjau...'}</p>
        </div>
        <div className="p-5 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (!activeDataset || datasetPreview.length === 0) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base sm:text-lg font-bold text-slate-900">Preview Dataset</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100/70 mb-4 text-slate-400">
            <FileSpreadsheet className="h-7 w-7 text-slate-400" />
          </div>
          <h4 className="text-base font-bold text-slate-800 mb-1">
            Belum Ada Data untuk Ditampilkan
            <span className="sr-only">Belum Ada Pratinjau Data</span>
          </h4>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm leading-relaxed">
            Unggah dataset Anda untuk melihat pratinjau data di sini.
          </p>
        </div>
      </div>
    );
  }

  const columns = activeDataset.columns;

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[#0f766e]" />
            {activeDataset.name}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pratinjau data mentah. Ubah tipe kolom jika inferensi kurang tepat.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
          <span className="font-medium text-slate-700">{new Intl.NumberFormat('id-ID').format(activeDataset.rowCount)} baris × {activeDataset.columnCount} kolom</span>
          <span className="text-slate-400">|</span>
          <span>Menampilkan {datasetPreview.length} baris pertama</span>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              {columns.map((col: ColumnSchema) => {
                const isOverridden = !!col.originalType && col.originalType !== col.type;
                
                return (
                  <TableHead key={col.id} className="whitespace-nowrap align-top py-3 px-4 text-xs">
                    <div className="flex flex-col gap-1.5 min-w-[120px]">
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <span className="truncate max-w-[180px]" title={col.name}>{col.name}</span>
                        {col.profile?.isIdentifier && (
                          <span className="text-[10px] uppercase font-bold bg-slate-200 text-slate-600 px-1 rounded-sm" title={col.profile.formatWarning || 'Identifier terdeteksi'}>ID</span>
                        )}
                      </div>
                      
                      <select 
                        className={`text-xs py-1 px-1.5 rounded border outline-none cursor-pointer transition-colors focus:ring-2 focus:ring-[#0f766e]/40 ${
                          isOverridden 
                            ? 'bg-amber-50 border-amber-300 text-amber-900' 
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                        value={col.type}
                        onChange={(e) => overrideColumnType(col.id, e.target.value as DataType)}
                        title={isOverridden ? `Tipe asli: ${col.originalType}` : `Keyakinan inferensi: ${col.profile?.confidenceScore ?? 100}%`}
                      >
                        {DATA_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                      
                      {col.profile?.regionalFormat && (
                        <span className="text-[10px] text-slate-400 italic">
                          {col.profile.regionalFormat}
                        </span>
                      )}
                      {col.profile?.formatWarning && !col.profile.isIdentifier && (
                        <span className="text-[10px] text-amber-600 italic">
                          {col.profile.formatWarning}
                        </span>
                      )}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {datasetPreview.map((row: Record<string, unknown>, rowIndex: number) => (
              <TableRow key={`row-${rowIndex}`} className="hover:bg-slate-50/60">
                {columns.map((col: ColumnSchema) => {
                  const val = row[col.id];
                  const displayVal = val === null || val === undefined || val === ''
                    ? <span className="text-slate-400 italic">null</span> 
                    : String(val);
                  
                  const isNumber = col.type === 'Numeric' || (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== ''));

                  return (
                    <TableCell 
                      key={`cell-${rowIndex}-${col.id}`} 
                      className={`whitespace-nowrap max-w-[300px] truncate text-sm px-4 ${isNumber && col.type !== 'Text' ? 'tabular-data text-right' : ''}`}
                      title={String(val)}
                    >
                      {displayVal}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

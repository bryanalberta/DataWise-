'use client';

import React, { useState, useId } from 'react';
import Link from 'next/link';
import {
  Download,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Database,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  FileCheck,
  Info,
  X,
} from 'lucide-react';
import { useDatasetStore } from '@/store/dataset-store';
import { workerClient } from '@/lib/worker-client';
import { downloadFileBlob, sanitizeFileName, sanitizeSheetName } from '@/lib/export-engine';
import { Dataset, ExportFormat } from '@/types';

export interface ExportStudioProps {
  readonly _testDataset?: Dataset | null;
}

export function ExportStudio({ _testDataset }: ExportStudioProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;
  const activeRecipe = store.activeRecipe;

  const [format, setFormat] = useState<ExportFormat>('CSV');
  const [customFileName, setCustomFileName] = useState<string>('');
  const [csvDelimiter, setCsvDelimiter] = useState<',' | ';' | '\t'>(',');
  const [includeBom, setIncludeBom] = useState<boolean>(true);
  const [sheetName, setSheetName] = useState<string>('Data Aktif');

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const baseId = useId();

  // Jika belum ada dataset aktif, tampilkan empty state yang informatif
  if (!activeDataset) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              <Download className="h-3.5 w-3.5 text-teal-600" />
              Export Studio
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Ekspor Dataset</h1>
          <p className="text-sm text-slate-500">
            Ekspor dataset aktif hasil pembersihan ke berkas CSV atau workbook Microsoft Excel (.xlsx) dengan pemrosesan 100% lokal.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 p-12 text-center backdrop-blur-sm shadow-xs">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 shadow-xs ring-1 ring-teal-600/10">
            <FileSpreadsheet className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Belum ada dataset yang dimuat</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Unggah berkas CSV atau Excel di halaman Beranda untuk mulai menganalisis, membersihkan, dan mengekspor data Anda.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#115E59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40"
          >
            Buka Beranda
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  // Hitung nama file default dari dataset aktif
  const baseRawName = activeDataset.name.replace(/\.[^/.]+$/, '');
  const recipeSuffix = activeRecipe.length > 0 ? '_bersih' : '';
  const defaultBaseName = `${sanitizeFileName(baseRawName)}${recipeSuffix}`;
  const effectiveBaseName = customFileName.trim() ? sanitizeFileName(customFileName.trim()) : defaultBaseName;
  const finalFileName = `${effectiveBaseName}.${format.toLowerCase()}`;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      setExportSuccess(null);

      // Jalankan ekspor di Web Worker tanpa memindahkan seluruh memori ke UI thread
      const { promise } = workerClient.executeTask('EXPORT_DATASET', {
        datasetId: activeDataset.id,
        options: {
          format,
          fileName: effectiveBaseName,
          delimiter: csvDelimiter,
          includeBom,
          sheetName: sanitizeSheetName(sheetName.trim() || 'Data Aktif'),
        },
      });

      const result = (await promise) as {
        format: ExportFormat;
        fileName: string;
        mimeType: string;
        buffer: ArrayBuffer;
        rowCount: number;
        columnCount: number;
      };

      // Unduh file langsung di browser
      downloadFileBlob(result.buffer, result.fileName, result.mimeType);

      setExportSuccess(`Berkas ${result.fileName} (${result.rowCount.toLocaleString('id-ID')} baris) berhasil diunduh.`);
    } catch (err: unknown) {
      const error = err as Error;
      setExportError(error.message || 'Terjadi kesalahan saat memproses ekspor berkas.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Page Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50/80 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              <Download className="h-3.5 w-3.5 text-teal-700" />
              Export Studio
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              100% Client-Side
            </span>
            {activeRecipe.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50/80 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                {activeRecipe.length} Langkah Recipe Diterapkan
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100/80 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                Data Asli (Tanpa Mutasi)
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Ekspor Dataset</h1>
          <p className="text-sm text-slate-500">
            Unduh dataset aktif hasil pembersihan ke berkas CSV ber-encoding UTF-8 atau workbook Excel (.xlsx) secara instan.
          </p>
        </div>

        {/* Dataset Context Chip */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/70 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <Database className="h-4 w-4 text-teal-700" />
            <span className="font-semibold text-slate-900">{activeDataset.name}</span>
          </div>
          <span className="text-slate-300">•</span>
          <span className="tabular-data font-mono font-medium text-slate-600">
            {activeDataset.rowCount.toLocaleString('id-ID')} baris
          </span>
          <span className="text-slate-300">•</span>
          <span className="tabular-data font-mono font-medium text-slate-600">
            {activeDataset.columnCount} kolom
          </span>
        </div>
      </div>

      {/* Alert Umpan Balik Sukses */}
      {exportSuccess && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-800 shadow-2xs">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-semibold">Ekspor Berhasil</p>
            <p className="mt-0.5 text-xs text-emerald-700">{exportSuccess}</p>
          </div>
          <button
            onClick={() => setExportSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 rounded-lg hover:bg-emerald-100/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Tutup notifikasi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Alert Umpan Balik Gagal */}
      {exportError && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800 shadow-2xs">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold">Gagal Mengekspor Dataset</p>
            <p className="mt-0.5 text-xs text-rose-700">{exportError}</p>
          </div>
          <button
            onClick={() => setExportError(null)}
            className="text-rose-700 hover:text-rose-900 p-1 rounded-lg hover:bg-rose-100/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            aria-label="Tutup pesan error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Grid Utama: Konfigurasi Format (Kiri / 7 Kolom) & Ringkasan Berkas (Kanan / 5 Kolom) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* =========================================================================
            KOLOM KIRI: KONFIGURASI FORMAT & PARAMETER (7 Kolom)
            ========================================================================= */}
        <div className="space-y-5 lg:col-span-7 xl:col-span-7">
          {/* Langkah 1: Pemilihan Format */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-100 text-teal-800 text-[11px] font-bold">
                  1
                </span>
                Pilih Format Berkas
              </h2>
              <span className="text-[11px] font-medium text-slate-500">
                Pilih format tujuan
              </span>
            </div>

            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              Format ekspor disesuaikan untuk kompatibilitas maksimal pada software pengolah data dan basis data lokal.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Format Ekspor">
              {/* Kartu Format CSV */}
              <button
                type="button"
                role="radio"
                aria-checked={format === 'CSV'}
                onClick={() => setFormat('CSV')}
                className={`relative flex flex-col items-start rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 ${
                  format === 'CSV'
                    ? 'border-[#0F766E] bg-teal-50/50 shadow-2xs ring-1 ring-[#0F766E]'
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-800">
                    <FileText className="h-5 w-5" />
                  </div>
                  {format === 'CSV' && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F766E] text-white">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">CSV (Comma-Separated)</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Teks terstruktur ber-encoding UTF-8 standar. Kompatibel dengan Python, R, SPSS, SQL, dan seluruh database.
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-600">
                    .csv
                  </span>
                  <span className="text-[10px] text-teal-700 font-medium">RFC 4180</span>
                </div>
              </button>

              {/* Kartu Format Excel XLSX */}
              <button
                type="button"
                role="radio"
                aria-checked={format === 'XLSX'}
                onClick={() => setFormat('XLSX')}
                className={`relative flex flex-col items-start rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 ${
                  format === 'XLSX'
                    ? 'border-[#0F766E] bg-teal-50/50 shadow-2xs ring-1 ring-[#0F766E]'
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  {format === 'XLSX' && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F766E] text-white">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">Microsoft Excel (.xlsx)</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Buku kerja spreadsheet native. Mempertahankan tipe cell angka, teks berkode leading zero, dan tanggal.
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-600">
                    .xlsx
                  </span>
                  <span className="text-[10px] text-emerald-700 font-medium">Native Spreadsheet</span>
                </div>
              </button>
            </div>
          </div>

          {/* Langkah 2: Pengaturan Format Terpilih */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-100 text-teal-800 text-[11px] font-bold">
                  2
                </span>
                Pengaturan & Nama Berkas
              </h2>
              <span className="text-[11px] font-mono text-teal-800 bg-teal-50 px-2 py-0.5 rounded font-medium">
                Format: {format}
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {/* Nama File */}
              <div>
                <label htmlFor={`${baseId}-filename`} className="block text-xs font-semibold text-slate-700">
                  Nama Berkas Hasil Ekspor
                </label>
                <div className="mt-1.5 flex rounded-xl border border-slate-200 bg-slate-50/50 focus-within:border-[#0F766E] focus-within:ring-1 focus-within:ring-[#0F766E]">
                  <input
                    type="text"
                    id={`${baseId}-filename`}
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    placeholder={defaultBaseName}
                    className="w-full rounded-l-xl bg-transparent px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
                  />
                  <span className="inline-flex items-center rounded-r-xl border-l border-slate-200 bg-slate-100 px-3 text-xs font-mono font-semibold text-slate-600">
                    .{format.toLowerCase()}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Nama final berkas yang akan diunduh:{' '}
                  <span className="font-mono font-semibold text-slate-600">{finalFileName}</span>
                </p>
              </div>

              {/* Opsi Spesifik Format CSV */}
              {format === 'CSV' && (
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 space-y-4">
                  <div>
                    <label htmlFor={`${baseId}-delimiter`} className="block text-xs font-semibold text-slate-700">
                      Pemisah Kolom (Delimiter)
                    </label>
                    <select
                      id={`${baseId}-delimiter`}
                      value={csvDelimiter}
                      onChange={(e) => setCsvDelimiter(e.target.value as ',' | ';' | '\t')}
                      className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    >
                      <option value=",">Koma (,) — Standar Internasional / RFC 4180</option>
                      <option value=";">Titik Koma (;) — Regional Indonesia / Excel Eropa</option>
                      <option value="&#9;">Tab (\t) — TSV (Tab-Separated Values)</option>
                    </select>
                  </div>

                  <div className="flex items-start gap-2.5 pt-1">
                    <input
                      type="checkbox"
                      id={`${baseId}-bom`}
                      checked={includeBom}
                      onChange={(e) => setIncludeBom(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0F766E] focus:ring-[#0F766E]"
                    />
                    <label htmlFor={`${baseId}-bom`} className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                      <span className="font-semibold text-slate-800">Sertakan UTF-8 BOM (Byte Order Mark)</span>
                      <br />
                      Mencegah teks dengan aksen, karakter khusus Indonesia, atau simbol mengalami kerusakan (mojibake) saat dibuka langsung di Microsoft Excel desktop.
                    </label>
                  </div>

                  {/* Callout Integritas Format CSV */}
                  <div className="flex items-start gap-2 rounded-lg border border-teal-200/60 bg-teal-50/50 p-2.5 text-[11px] text-teal-800">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-teal-600" />
                    <span>
                      <strong>Jaminan RFC 4180:</strong> Karakter tanda kutip ganda internal di-escape menjadi <code className="font-mono bg-teal-100/60 px-1 py-0.2 rounded">&quot;&quot;</code>, pemisah baris/newline multiline dipertahankan, dan nilai kosong/null diekspor konsisten sebagai string kosong.
                    </span>
                  </div>
                </div>
              )}

              {/* Opsi Spesifik Format Excel XLSX */}
              {format === 'XLSX' && (
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor={`${baseId}-sheetname`} className="block text-xs font-semibold text-slate-700">
                        Nama Lembar Kerja (Worksheet Name)
                      </label>
                      <span className="text-[11px] font-mono text-slate-400">
                        {sheetName.length}/31 karakter
                      </span>
                    </div>
                    <input
                      type="text"
                      id={`${baseId}-sheetname`}
                      value={sheetName}
                      maxLength={31}
                      onChange={(e) => setSheetName(e.target.value)}
                      placeholder="Data Aktif"
                      className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Maksimal 31 karakter. Karakter ilegal (\ / ? * [ ] :) akan dibersihkan secara otomatis.
                    </p>
                  </div>

                  {/* Callout Integritas Format XLSX */}
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-2.5 text-[11px] text-emerald-800">
                    <FileCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
                    <span>
                      <strong>Preservasi Tipe Cell:</strong> Nilai numerik disimpan sebagai tipe numeric (<code className="font-mono">n</code>), teks ber-leading zero (seperti NIK, nomor telepon, kode pos) disimpan sebagai string (<code className="font-mono">s</code>), dan boolean disimpan sebagai boolean (<code className="font-mono">b</code>).
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================================
            KOLOM KANAN: RINGKASAN DATASET & TOMBOL UNDUH (5 Kolom)
            ========================================================================= */}
        <div className="space-y-5 lg:col-span-5 xl:col-span-5">
          {/* Kartu Ringkasan Ekspor */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6 lg:sticky lg:top-24">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Database className="h-4 w-4 text-[#0F766E]" />
                Ringkasan Ekspor
              </h2>
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800 border border-teal-200/60">
                Siap Unduh
              </span>
            </div>

            <div className="mt-4 space-y-3 divide-y divide-slate-100 text-xs">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500">Nama Berkas Final</span>
                <span className="font-mono font-semibold text-slate-900 max-w-[190px] truncate" title={finalFileName}>
                  {finalFileName}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500">Format Keluaran</span>
                <span className="font-semibold text-slate-800">
                  {format === 'CSV' ? 'Teks Tabel CSV (UTF-8)' : 'Microsoft Excel (.xlsx)'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500">Dataset Sumber</span>
                <span className="font-semibold text-slate-900 max-w-[190px] truncate" title={activeDataset.name}>
                  {activeDataset.name}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500">Jumlah Baris</span>
                <span className="tabular-data font-mono font-bold text-slate-900">
                  {activeDataset.rowCount.toLocaleString('id-ID')} baris
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500">Jumlah Kolom</span>
                <span className="tabular-data font-mono font-bold text-slate-900">
                  {activeDataset.columnCount} kolom
                </span>
              </div>

              <div className="flex items-start justify-between py-1.5">
                <span className="text-slate-500">Status Pembersihan</span>
                <span className="text-right">
                  {activeRecipe.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800 border border-teal-200/60">
                      <Sparkles className="h-3 w-3" />
                      {activeRecipe.length} langkah diterapkan
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      Data Asli (Mentah)
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Pratinjau Kolom Terpilih */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  Kolom yang Diekspor ({activeDataset.columns.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-1.5 bg-slate-50/70 rounded-xl border border-slate-100">
                {activeDataset.columns.map((c) => (
                  <span
                    key={c.id || c.name}
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-2xs border border-slate-200/70"
                  >
                    <span>{c.name}</span>
                    <span className="text-[9px] font-mono text-slate-400">({c.type})</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Tombol Unduh Utama */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-[#115E59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 disabled:cursor-not-allowed disabled:opacity-50"
                id="btn-unduh-dataset"
                aria-label={`Unduh Dataset (${format})`}
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Mengekspor Dataset...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Unduh Dataset ({format})</span>
                  </>
                )}
              </button>

              <div className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>100% In-Memory Browser • Tanpa Server</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

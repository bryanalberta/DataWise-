'use client';

import React from 'react';
import Link from 'next/link';
import { FileDropzone } from '@/components/FileDropzone';
import { DatasetOverview } from '@/components/DatasetOverview';
import { useDatasetStore } from '@/store/dataset-store';
import { BrandMark } from '@/components/brand/DataWiseLogo';
import { Database, ShieldCheck, LineChart, ArrowRight, Sparkles, Eraser, PieChart, Download } from 'lucide-react';

export interface HomePageProps {
  _testDataset?: import('@/types').Dataset | null;
}

export default function Home({ _testDataset }: HomePageProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;

  return (
    <div className="space-y-6">
      {/* Welcome banner card */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4 max-w-2xl">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50/90 border border-teal-100 shadow-2xs mt-0.5">
              <BrandMark size={28} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Selamat datang di DataWise</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                Platform analisis dan pembersihan dataset lokal berbasis browser. Unggah berkas CSV atau Excel untuk memulai eksplorasi data secara instan, aman, dan tanpa transmisi ke server.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2.5 rounded-xl bg-teal-50/90 border border-teal-100/80 px-3.5 py-2 text-[#0F766E] self-start md:self-auto shadow-2xs">
            <Sparkles className="h-4 w-4 shrink-0 text-[#0F766E]" />
            <div className="text-left">
              <span className="block text-xs font-bold leading-tight text-teal-900">100% Lokal di Browser</span>
              <span className="block text-[10px] text-teal-700 leading-tight">Data privat, zero-server</span>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Section */}
      <section className="w-full">
        <FileDropzone />
      </section>

      {/* Dataset Overview */}
      <section className="w-full">
        <DatasetOverview />
      </section>

      {/* Aksi Cepat / Tautan Modul Analisis Saat Dataset Aktif */}
      {activeDataset && (
        <section className="w-full">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Alur Kerja Analisis Dataset</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dataset <strong className="font-mono text-slate-800">{activeDataset.name}</strong> siap dieksplorasi. Pilih modul yang ingin Anda gunakan:
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-mono font-semibold self-start sm:self-auto">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0F766E]" />
                {new Intl.NumberFormat('id-ID').format(activeDataset.rowCount)} baris aktif
              </span>
            </div>

            {/* Featured Card: Insight Dataset (Intelligence) */}
            <Link
              href="/insight"
              className="group relative flex flex-col sm:flex-row sm:items-center justify-between p-4.5 mb-4 rounded-xl border border-teal-200/90 bg-gradient-to-r from-teal-50/70 via-teal-50/40 to-white hover:border-[#0F766E]/50 hover:shadow-xs transition-all"
            >
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-[#0F766E] border border-teal-200/70 group-hover:scale-105 transition-transform shadow-2xs">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0F766E] transition-colors">
                      Insight Dataset &amp; Intelligence
                    </h4>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100/80 text-[#0F766E] border border-teal-200/70">
                      Otomatis
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Deteksi keluarga dataset, peran semantik kolom, anomali struktural, dan rekomendasi analisis cerdas.
                  </p>
                </div>
              </div>
              <div className="mt-3 sm:mt-0 flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] shrink-0">
                <span>Lihat Insight</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Data Explorer */}
              <Link
                href="/dataset"
                className="group relative flex flex-col justify-between p-4.5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-[#0F766E]/40 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-[#0F766E] border border-teal-100/60 mb-3 group-hover:scale-105 transition-transform">
                    <Database className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0F766E] transition-colors">
                    Data Explorer
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Jelajahi seluruh baris data dengan virtual scrolling, pencarian kata kunci, dan filter kolom presisi.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-[#0F766E]">
                  <span>Buka Data Explorer</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Card 2: Profiling & Kualitas */}
              <Link
                href="/profiling"
                className="group relative flex flex-col justify-between p-4.5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-[#0F766E]/40 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 border border-sky-100/60 mb-3 group-hover:scale-105 transition-transform">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0F766E] transition-colors">
                    Profiling &amp; Kualitas
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Audit missing values, spasi kotor (dirty whitespace), dan identifikasi baris duplikat.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-[#0F766E]">
                  <span>Lihat Profiling Data</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Card 3: Statistik Deskriptif */}
              <Link
                href="/analisis"
                className="group relative flex flex-col justify-between p-4.5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-[#0F766E]/40 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100/60 mb-3 group-hover:scale-105 transition-transform">
                    <LineChart className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0F766E] transition-colors">
                    Statistik Deskriptif
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Hitung 13 metrik numerik presisi tinggi dan distribusi frekuensi modal kategorikal.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-[#0F766E]">
                  <span>Buka Analisis Statistik</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Card 4: Pembersihan Data */}
              <Link
                href="/pembersihan"
                className="group relative flex flex-col justify-between p-4.5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-[#0F766E]/40 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100/60 mb-3 group-hover:scale-105 transition-transform">
                    <Eraser className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0F766E] transition-colors">
                    Pembersihan Data
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Imputasi nilai kosong, trim spasi, hapus duplikat, dan kelola recipe pipeline yang aman (non-destruktif).
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-[#0F766E]">
                  <span>Buka Cleaning Studio</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Card 5: Visualisasi Studio */}
              <Link
                href="/visualisasi"
                className="group relative flex flex-col justify-between p-4.5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-[#0F766E]/40 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100/60 mb-3 group-hover:scale-105 transition-transform">
                    <PieChart className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0F766E] transition-colors">
                    Visualisasi Data
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Buat grafik batang, garis, area, scatter, pie/donut, dan histogram interaktif dengan ekspor PNG instan.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-[#0F766E]">
                  <span>Buka Visualisasi</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Card 6: Ekspor Dataset */}
              <Link
                href="/ekspor"
                className="group relative flex flex-col justify-between p-4.5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-[#0F766E]/40 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 border border-slate-200/60 mb-3 group-hover:scale-105 transition-transform">
                    <Download className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0F766E] transition-colors">
                    Ekspor Dataset
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Unduh dataset aktif hasil pembersihan ke format CSV (kustom delimiter &amp; BOM) atau Excel XLSX.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-[#0F766E]">
                  <span>Buka Export Studio</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

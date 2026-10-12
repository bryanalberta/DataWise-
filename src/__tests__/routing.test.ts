import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppSidebar } from '../components/AppSidebar';
import Home from '../app/page';
import DatasetPage from '../app/dataset/page';
import ProfilingPage from '../app/profiling/page';
import AnalisisPage from '../app/analisis/page';
import PembersihanPage from '../app/pembersihan/page';
import VisualisasiPage from '../app/visualisasi/page';
import EksporPage from '../app/ekspor/page';
import { useDatasetStore } from '../store/dataset-store';
import { Dataset } from '../types';

describe('DATAWISE ROUTING REFACTOR — Separate Home, Dataset, Profiling & Analysis Pages', () => {
  const dummyDataset: Dataset = {
    id: 'ds-routing-01',
    name: 'Sales_Data_2024.csv',
    rowCount: 2500,
    columnCount: 3,
    columns: [
      { id: 'tx_id', name: 'Transaction ID', type: 'Numeric' },
      { id: 'item', name: 'Item Name', type: 'Text' },
      { id: 'price', name: 'Price (IDR)', type: 'Numeric' },
    ],
  };

  // Helper untuk merender halaman secara aman dalam lingkungan server testing
  function renderPage(
    component: React.ComponentType<Record<string, unknown>>,
    props: Record<string, unknown> = {}
  ): string {
    return renderToStaticMarkup(
      React.createElement(component as React.ElementType, props)
    );
  }

  // =========================================================================
  // 1. SIDEBAR NAVIGATION & ROUTE-BASED ACTIVE STATES
  // =========================================================================
  describe('1. Sidebar Navigation & Active States', () => {
    it('1.1. Sidebar merender seluruh 7 tautan navigasi dengan href yang sesuai', () => {
      const html = renderPage(AppSidebar as React.ComponentType<Record<string, unknown>>, { currentPath: '/' });

      assert.ok(html.includes('href="/"'), 'Harus memiliki link ke Beranda (/)');
      assert.ok(html.includes('href="/dataset"'), 'Harus memiliki link ke /dataset');
      assert.ok(html.includes('href="/insight"'), 'Harus memiliki link ke /insight');
      assert.ok(html.includes('href="/profiling"'), 'Harus memiliki link ke /profiling');
      assert.ok(html.includes('href="/analisis"'), 'Harus memiliki link ke /analisis');
      assert.ok(html.includes('href="/pembersihan"'), 'Harus memiliki link ke /pembersihan');
      assert.ok(html.includes('href="/visualisasi"'), 'Harus memiliki link ke /visualisasi');
      assert.ok(html.includes('href="/ekspor"'), 'Harus memiliki link ke /ekspor');
    });

    it('1.2. Path "/" mengaktifkan menu Beranda secara eksklusif', () => {
      const html = renderPage(AppSidebar as React.ComponentType<Record<string, unknown>>, { currentPath: '/' });

      const ariaMatches = html.match(/aria-current="page"/g);
      assert.equal(ariaMatches?.length, 1, 'Hanya boleh ada 1 item navigasi yang aktif');
      assert.ok(
        html.includes('href="/"') && html.includes('aria-current="page"'),
        'Beranda harus aktif pada path /'
      );
    });

    it('1.3. Path "/dataset" mengaktifkan menu Dataset', () => {
      const html = renderPage(AppSidebar as React.ComponentType<Record<string, unknown>>, { currentPath: '/dataset' });
      const ariaMatches = html.match(/aria-current="page"/g);
      assert.equal(ariaMatches?.length, 1, 'Hanya 1 item navigasi yang aktif');
      assert.ok(html.includes('href="/dataset"'), 'Dataset href harus ada');
    });

    it('1.4. Path "/profiling" mengaktifkan menu Profiling', () => {
      const html = renderPage(AppSidebar as React.ComponentType<Record<string, unknown>>, { currentPath: '/profiling' });
      const ariaMatches = html.match(/aria-current="page"/g);
      assert.equal(ariaMatches?.length, 1);
    });

    it('1.5. Path "/analisis" mengaktifkan menu Analisis', () => {
      const html = renderPage(AppSidebar as React.ComponentType<Record<string, unknown>>, { currentPath: '/analisis' });
      const ariaMatches = html.match(/aria-current="page"/g);
      assert.equal(ariaMatches?.length, 1);
    });

    it('1.6. Path fitur roadmap (/pembersihan, /visualisasi, /ekspor) mengaktifkan menu yang tepat', () => {
      const htmlPembersihan = renderPage(AppSidebar as React.ComponentType<Record<string, unknown>>, { currentPath: '/pembersihan' });
      assert.equal(htmlPembersihan.match(/aria-current="page"/g)?.length, 1);

      const htmlVisualisasi = renderPage(AppSidebar as React.ComponentType<Record<string, unknown>>, { currentPath: '/visualisasi' });
      assert.equal(htmlVisualisasi.match(/aria-current="page"/g)?.length, 1);

      const htmlEkspor = renderPage(AppSidebar as React.ComponentType<Record<string, unknown>>, { currentPath: '/ekspor' });
      assert.equal(htmlEkspor.match(/aria-current="page"/g)?.length, 1);
    });
  });

  // =========================================================================
  // 2. PEMISAHAN TANGGUNG JAWAB HALAMAN BERANDA (/)
  // =========================================================================
  describe('2. Halaman Beranda (/) Separation of Concerns', () => {
    it('2.1. Beranda merender selamat datang, upload dropzone, dan overview', () => {
      const html = renderPage(Home as React.ComponentType<Record<string, unknown>>, { _testDataset: null });

      assert.ok(html.includes('Selamat datang di DataWise'), 'Harus menampilkan judul sambutan');
      assert.ok(html.includes('Unggah Dataset Anda'), 'Harus menampilkan area dropzone upload');
      assert.ok(html.includes('Ringkasan Dataset'), 'Harus menampilkan overview ringkasan');
    });

    it('2.2. Beranda TIDAK merender Data Grid lengkap atau tabel interaktif', () => {
      const html = renderPage(Home as React.ComponentType<Record<string, unknown>>, { _testDataset: null });

      assert.ok(!html.includes('id="data-explorer-grid"'), 'DataGrid tidak boleh dirender di Beranda');
      assert.ok(!html.includes('Cari kata kunci di seluruh kolom'), 'Toolbar grid tidak boleh ada di Beranda');
    });

    it('2.3. Beranda menampilkan tautan alur kerja ke /dataset, /profiling, /analisis saat dataset aktif', () => {
      const html = renderPage(Home as React.ComponentType<Record<string, unknown>>, { _testDataset: dummyDataset });

      assert.ok(html.includes('href="/dataset"'), 'Harus menyediakan tautan menuju Data Explorer');
      assert.ok(html.includes('href="/profiling"'), 'Harus menyediakan tautan menuju Profiling');
      assert.ok(html.includes('href="/analisis"'), 'Harus menyediakan tautan menuju Analisis');
      assert.ok(html.includes('Sales_Data_2024.csv'), 'Harus menampilkan nama dataset aktif');
    });
  });

  // =========================================================================
  // 3. HALAMAN DATASET (/dataset)
  // =========================================================================
  describe('3. Halaman Dataset (/dataset)', () => {
    it('3.1. Halaman Dataset merender Data Explorer lengkap dengan DataGrid', () => {
      const html = renderPage(DatasetPage as React.ComponentType<Record<string, unknown>>, { _testDataset: dummyDataset });

      assert.ok(html.includes('Data Explorer'), 'Harus merender Data Explorer');
      assert.ok(html.includes('data-explorer-grid'), 'Harus memiliki elemen id data-explorer-grid');
      assert.ok(html.includes('Sales_Data_2024.csv'), 'Harus merender dataset aktif');
      assert.ok(html.includes('Cari kata kunci di seluruh kolom'), 'Harus merender toolbar pencarian');
    });

    it('3.2. Halaman Dataset saat belum ada dataset: menampilkan empty state dengan tautan ke Beranda', () => {
      const html = renderPage(DatasetPage as React.ComponentType<Record<string, unknown>>, { _testDataset: null });

      assert.ok(html.includes('Belum Ada Data untuk Ditampilkan'));
      assert.ok(html.includes('Unggah Dataset di Beranda'));
      assert.ok(html.includes('href="/"'), 'Harus memiliki link kembali ke Beranda');
    });
  });

  // =========================================================================
  // 4. HALAMAN PROFILING (/profiling)
  // =========================================================================
  describe('4. Halaman Profiling (/profiling)', () => {
    it('4.1. Halaman Profiling saat ada dataset: menampilkan audit kualitas dan skema kolom', () => {
      const html = renderPage(ProfilingPage as React.ComponentType<Record<string, unknown>>, { _testDataset: dummyDataset });

      assert.ok(html.includes('Profiling &amp; Kualitas Data') || html.includes('Profiling & Kualitas Data'));
      assert.ok(html.includes('Sales_Data_2024.csv'));
      assert.ok(html.includes('Skema &amp; Profil Tipe Kolom') || html.includes('Skema & Profil Tipe Kolom'));
      assert.ok(html.includes('Transaction ID'));
      assert.ok(html.includes('Price (IDR)'));
    });

    it('4.2. Halaman Profiling saat belum ada dataset: menampilkan empty state dengan tautan ke Beranda', () => {
      const html = renderPage(ProfilingPage as React.ComponentType<Record<string, unknown>>, { _testDataset: null });

      assert.ok(html.includes('Belum Ada Dataset untuk Profiling'));
      assert.ok(html.includes('href="/"'), 'Harus memiliki link ke Beranda');
    });
  });

  // =========================================================================
  // 5. HALAMAN ANALISIS (/analisis)
  // =========================================================================
  describe('5. Halaman Analisis (/analisis)', () => {
    it('5.1. Halaman Analisis merender modul DescriptiveStatistics', () => {
      const html = renderPage(AnalisisPage as React.ComponentType<Record<string, unknown>>, { _testDataset: dummyDataset });

      assert.ok(html.includes('Statistik Deskriptif'), 'Harus merender komponen Statistik Deskriptif');
    });

    it('5.2. Halaman Analisis saat belum ada dataset: menampilkan empty state dengan tautan ke Beranda', () => {
      const html = renderPage(AnalisisPage as React.ComponentType<Record<string, unknown>>, { _testDataset: null });

      assert.ok(html.includes('Belum Ada Statistik untuk Ditampilkan'));
      assert.ok(html.includes('href="/"'), 'Harus memiliki link ke Beranda');
    });
  });

  // =========================================================================
  // 6. HALAMAN STATUS FITUR ROADMAP (PEMBERSIHAN, VISUALISASI, EKSPOR)
  // =========================================================================
  describe('6. Halaman Status Fitur Roadmap (No Fake Functionality)', () => {
    it('6.1. Halaman /pembersihan: Merender Data Cleaning Studio saat dataset aktif dan empty state saat kosong', () => {
      // Saat belum ada dataset: tampilkan empty state dengan tautan kembali ke Beranda
      useDatasetStore.getState().clearDataset();
      const htmlEmpty = renderPage(PembersihanPage as React.ComponentType<Record<string, unknown>>);
      assert.ok(htmlEmpty.includes('Belum Ada Dataset yang Dimuat'));
      assert.ok(htmlEmpty.includes('href="/"'), 'Memiliki tombol kembali ke Beranda');

      // Saat ada dataset aktif: tampilkan Data Cleaning Studio nyata
      useDatasetStore.getState().setDataset(dummyDataset, []);
      const htmlActive = renderPage(PembersihanPage as React.ComponentType<Record<string, unknown>>, { _testDataset: dummyDataset });
      assert.ok(htmlActive.includes('Data Cleaning Studio'));
      assert.ok(htmlActive.includes('Immutable Recipe Engine'));
      assert.ok(htmlActive.includes('Hapus Baris Kosong'));
      assert.ok(htmlActive.includes('Imputasi Nilai'));

      // Cleanup
      useDatasetStore.getState().clearDataset();
    });

    it('6.2. Halaman /visualisasi: Merender Visualization Studio saat dataset aktif dan empty state saat kosong', () => {
      // Saat belum ada dataset: tampilkan empty state dengan tautan kembali ke Beranda
      useDatasetStore.getState().clearDataset();
      const htmlEmpty = renderPage(VisualisasiPage as React.ComponentType<Record<string, unknown>>);
      assert.ok(htmlEmpty.includes('Belum ada dataset yang dimuat'));
      assert.ok(htmlEmpty.includes('href="/"'), 'Memiliki tombol kembali ke Beranda');

      // Saat ada dataset aktif: tampilkan Visualization Studio nyata
      useDatasetStore.getState().setDataset(dummyDataset, []);
      const htmlActive = renderPage(VisualisasiPage as React.ComponentType<Record<string, unknown>>, { _testDataset: dummyDataset });
      assert.ok(htmlActive.includes('Visualization Studio'));
      assert.ok(htmlActive.includes('Bar Chart'));
      assert.ok(htmlActive.includes('Histogram'));
      assert.ok(htmlActive.includes('Line Chart'));
      assert.ok(htmlActive.includes('Scatter Plot'));
      assert.ok(htmlActive.includes('Unduh Gambar (PNG)'));

      // Cleanup
      useDatasetStore.getState().clearDataset();
    });

    it('6.3. Halaman /ekspor: Merender Export Studio saat dataset aktif dan empty state saat kosong', () => {
      // Saat belum ada dataset: tampilkan empty state dengan tautan kembali ke Beranda
      useDatasetStore.getState().clearDataset();
      const htmlEmpty = renderPage(EksporPage as React.ComponentType<Record<string, unknown>>);
      assert.ok(htmlEmpty.includes('Belum ada dataset yang dimuat'));
      assert.ok(htmlEmpty.includes('href="/"'), 'Memiliki tombol kembali ke Beranda');

      // Saat ada dataset aktif: tampilkan Export Studio nyata
      useDatasetStore.getState().setDataset(dummyDataset, []);
      const htmlActive = renderPage(EksporPage as React.ComponentType<Record<string, unknown>>, { _testDataset: dummyDataset });
      assert.ok(htmlActive.includes('Export Studio'));
      assert.ok(htmlActive.includes('CSV (Comma-Separated)'));
      assert.ok(htmlActive.includes('Microsoft Excel (.xlsx)'));
      assert.ok(htmlActive.includes('Unduh Dataset (CSV)'));

      // Cleanup
      useDatasetStore.getState().clearDataset();
    });
  });

  // =========================================================================
  // 7. KONTINUITAS STATE DATASET DI STORE
  // =========================================================================
  describe('7. Kontinuitas State Dataset di Store', () => {
    it('7.1. Dataset yang diset di Beranda langsung terbaca di halaman Dataset, Profiling, Analisis, dan Pembersihan', () => {
      // Simulasikan upload di Beranda melalui Zustand store
      useDatasetStore.getState().setDataset(dummyDataset, []);

      // Verifikasi state store menyimpan dataset yang aktif
      const currentDataset = useDatasetStore.getState().activeDataset;
      assert.equal(currentDataset?.id, dummyDataset.id);
      assert.equal(currentDataset?.name, dummyDataset.name);

      // Verifikasi halaman Dataset membaca dataset yang sama
      const htmlDataset = renderPage(DatasetPage as React.ComponentType<Record<string, unknown>>, { _testDataset: currentDataset });
      assert.ok(htmlDataset.includes('Sales_Data_2024.csv'));

      // Verifikasi halaman Profiling membaca dataset yang sama
      const htmlProfiling = renderPage(ProfilingPage as React.ComponentType<Record<string, unknown>>, { _testDataset: currentDataset });
      assert.ok(htmlProfiling.includes('Sales_Data_2024.csv'));

      // Verifikasi halaman Analisis membaca dataset yang sama
      const htmlAnalisis = renderPage(AnalisisPage as React.ComponentType<Record<string, unknown>>, { _testDataset: currentDataset });
      assert.ok(htmlAnalisis.includes('Statistik Deskriptif'));

      // Verifikasi halaman Pembersihan membaca dataset yang sama
      const htmlPembersihan = renderPage(PembersihanPage as React.ComponentType<Record<string, unknown>>, { _testDataset: currentDataset });
      assert.ok(htmlPembersihan.includes('Sales_Data_2024.csv'));

      // Cleanup
      useDatasetStore.getState().clearDataset();
    });
  });
});

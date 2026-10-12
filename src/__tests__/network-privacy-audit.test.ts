import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

import Papa from 'papaparse';
import { inferColumnTypes } from '../lib/type-inference';
import { calculateDataQuality } from '../lib/data-quality';
import { calculateDescriptiveStatistics } from '../lib/descriptive-stats';
import { queryDataGrid } from '../lib/data-grid-engine';
import { executeRecipe } from '../lib/recipe-engine';
import { generateChartData } from '../lib/chart-engine';
import { serializeToCsv, serializeToXlsx } from '../lib/export-engine';
import { ColumnSchema, RecipeStep } from '../types';

describe('TASK-QA-01 — Network Traffic Audit & Privacy Verification', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const srcDir = path.resolve(rootDir, 'src');

  // =========================================================================
  // 1. STATIC SOURCE CODE AUDIT
  // =========================================================================
  describe('1. Static Source Code & Dependency Audit', () => {
    // Fungsi rekursif untuk mengumpulkan semua berkas kode sumber
    function getAllCodeFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...getAllCodeFiles(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const codeFiles = getAllCodeFiles(srcDir);

    it('1.1. Memverifikasi 0 pemanggilan fetch, XMLHttpRequest, sendBeacon, WebSocket, dan EventSource', () => {
      const forbiddenApis = [
        /\bfetch\s*\(/g,
        /\bXMLHttpRequest\b/g,
        /\bnavigator\.sendBeacon\b/g,
        /\bnew\s+WebSocket\b/g,
        /\bnew\s+EventSource\b/g,
      ];

      const violations: { file: string; api: string; line: number }[] = [];

      for (const filePath of codeFiles) {
        // Abaikan berkas test audit ini sendiri
        if (filePath.includes('network-privacy-audit.test.ts')) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          for (const regex of forbiddenApis) {
            if (regex.test(line)) {
              violations.push({
                file: path.relative(rootDir, filePath),
                api: regex.source,
                line: idx + 1,
              });
            }
          }
        });
      }

      assert.deepEqual(
        violations,
        [],
        `Ditemukan pemanggilan API jaringan terlarang di kode sumber: ${JSON.stringify(violations)}`
      );
    });

    it('1.2. Memverifikasi ketiadaan Server Actions (\'use server\') dan API Routes di App Router', () => {
      const serverActionViolations: string[] = [];

      for (const filePath of codeFiles) {
        if (filePath.includes('network-privacy-audit.test.ts')) continue;
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes("'use server'") || content.includes('"use server"')) {
          serverActionViolations.push(path.relative(rootDir, filePath));
        }
      }

      assert.deepEqual(
        serverActionViolations,
        [],
        `Ditemukan Server Actions pada berkas: ${JSON.stringify(serverActionViolations)}`
      );

      // Verifikasi ketiadaan direktori /api di dalam src/app
      const apiDirExists = fs.existsSync(path.join(srcDir, 'app', 'api'));
      assert.equal(apiDirExists, false, 'Tidak boleh ada direktori src/app/api');
    });

    it('1.3. Memverifikasi ketiadaan domain eksternal atau URL endpoint remote (kecuali XML namespace SVG)', () => {
      const urlRegex = /https?:\/\/[^\s"'`]+/g;
      const externalDomainViolations: { file: string; url: string; line: number }[] = [];

      // Daftar URL aman yang diizinkan (hanya standar XML namespace)
      const allowedNamespaces = new Set([
        'http://www.w3.org/2000/svg',
        'http://www.w3.org/1999/xlink',
      ]);

      for (const filePath of codeFiles) {
        // Abaikan berkas audit ini sendiri
        if (filePath.includes('network-privacy-audit.test.ts')) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          const matches = line.match(urlRegex);
          if (matches) {
            for (const url of matches) {
              const cleanUrl = url.replace(/['"`>].*$/, '');
              if (!allowedNamespaces.has(cleanUrl)) {
                externalDomainViolations.push({
                  file: path.relative(rootDir, filePath),
                  url: cleanUrl,
                  line: idx + 1,
                });
              }
            }
          }
        });
      }

      assert.deepEqual(
        externalDomainViolations,
        [],
        `Ditemukan URL eksternal yang tidak diizinkan: ${JSON.stringify(externalDomainViolations)}`
      );
    });

    it('1.4. Memverifikasi ketiadaan SDK analitik dan pelacak telemetri pihak ketiga di source code', () => {
      const trackerTokens = [
        'google-analytics',
        'gtag',
        'mixpanel',
        'posthog',
        'segment',
        'sentry',
        'datadog',
        'logrocket',
      ];

      const trackerViolations: { file: string; token: string }[] = [];

      for (const filePath of codeFiles) {
        if (filePath.includes('network-privacy-audit.test.ts')) continue;

        const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();
        for (const token of trackerTokens) {
          if (content.includes(token)) {
            trackerViolations.push({
              file: path.relative(rootDir, filePath),
              token,
            });
          }
        }
      }

      assert.deepEqual(
        trackerViolations,
        [],
        `Ditemukan referensi SDK analitik / pelacak: ${JSON.stringify(trackerViolations)}`
      );
    });

    it('1.5. Memverifikasi Next.js build dikonfigurasikan sebagai Static Export lokal (output: "export")', () => {
      const nextConfigPath = path.join(rootDir, 'next.config.ts');
      assert.ok(fs.existsSync(nextConfigPath), 'next.config.ts harus ada');
      const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf-8');
      assert.ok(
        nextConfigContent.includes("output: 'export'") || nextConfigContent.includes('output: "export"'),
        'next.config.ts wajib memiliki konfigurasi output: "export"'
      );
    });
  });

  // =========================================================================
  // 2. RUNTIME PIPELINE NETWORK INTERCEPTION AUDIT WITH SYNTHETIC MARKERS
  // =========================================================================
  describe('2. Runtime Pipeline Network Interception & Synthetic Markers Audit', () => {
    // Dataset sintetis dengan privacy markers yang unik
    const QA_MARKER_COL = 'QA_PRIVATE_NAME_MARKER_7F2A';
    const QA_MARKER_VAL = 'QA_PRIVATE_VALUE_MARKER_91BC';
    const QA_SENSITIVE_NIK = 'NIK_3201234567890001';
    const QA_SENSITIVE_EMAIL = 'analisis_privat_internal@datawise.org';

    const testColumns: ColumnSchema[] = [
      { id: 'c1', name: QA_MARKER_COL, type: 'Text' },
      { id: 'c2', name: 'skor_analisis', type: 'Numeric' },
      { id: 'c3', name: 'nik_rahasia', type: 'Text' },
      { id: 'c4', name: 'email_pengguna', type: 'Text' },
    ];

    const testRows: Record<string, unknown>[] = [
      {
        [QA_MARKER_COL]: QA_MARKER_VAL,
        skor_analisis: 95.5,
        nik_rahasia: QA_SENSITIVE_NIK,
        email_pengguna: QA_SENSITIVE_EMAIL,
      },
      {
        [QA_MARKER_COL]: 'Karyawan_B',
        skor_analisis: 80.0,
        nik_rahasia: 'NIK_3201234567890002',
        email_pengguna: 'karyawan_b@datawise.org',
      },
    ];

    it('2.1. Menjalankan seluruh alur FNC-01 s/d FNC-06 dengan network spy aktif: Terverifikasi 0 HTTP/HTTPS Request', async () => {
      const interceptedRequests: { protocol: string; host: string; path: string; data?: string }[] = [];

      // Intersep http.request
      const originalHttpRequest = http.request;
      (http as unknown as { request: unknown }).request = function (options: unknown, cb?: unknown) {
        interceptedRequests.push({
          protocol: 'http',
          host: String((options as { host?: string }).host || ''),
          path: String((options as { path?: string }).path || ''),
        });
        return originalHttpRequest.call(http, options as never, cb as never);
      };

      // Intersep https.request
      const originalHttpsRequest = https.request;
      (https as unknown as { request: unknown }).request = function (options: unknown, cb?: unknown) {
        interceptedRequests.push({
          protocol: 'https',
          host: String((options as { host?: string }).host || ''),
          path: String((options as { path?: string }).path || ''),
        });
        return originalHttpsRequest.call(https, options as never, cb as never);
      };

      // Intersep global fetch jika ada
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        interceptedRequests.push({
          protocol: 'fetch',
          host: String(input),
          path: String(input),
          data: init && typeof init === 'object' && 'body' in init ? String(init.body) : undefined,
        });
        throw new Error(`[PRIVACY VIOLATION] fetch dipanggil ke: ${String(input)}`);
      };

      try {
        // --- 1. Ingestion / Parsing ---
        const csvRaw = `${QA_MARKER_COL},skor_analisis,nik_rahasia,email_pengguna\r\n${QA_MARKER_VAL},95.5,${QA_SENSITIVE_NIK},${QA_SENSITIVE_EMAIL}`;
        const parsed = Papa.parse(csvRaw, { header: true });
        assert.equal(parsed.data.length, 1);

        // --- 2. Profiling & Type Inference ---
        const inferredCols = inferColumnTypes(Object.keys(testRows[0]), testRows);
        assert.ok(inferredCols.length > 0);
        const dataQuality = calculateDataQuality('ds-test', testRows, testColumns);
        assert.ok(dataQuality.totalRecords > 0);

        // --- 3. Descriptive Statistics Engine (FNC-01) ---
        const stats = calculateDescriptiveStatistics('ds-test', testRows, testColumns);
        assert.ok(stats.columnStats.length > 0);

        // --- 4. Interactive Data Grid Query (FNC-03) ---
        const gridResult = queryDataGrid(testRows, {
          datasetId: 'ds-test',
          offset: 0,
          limit: 10,
          searchQuery: QA_MARKER_VAL,
        });
        assert.equal(gridResult.matchedRows, 1);

        // --- 5. Data Cleaning & Recipe Engine (FNC-04) ---
        const recipeSteps: RecipeStep[] = [
          {
            id: 'r1',
            type: 'TRIM_WHITESPACE',
            targetColumns: [QA_MARKER_COL],
            timestamp: Date.now(),
            description: 'Trim marker column',
          },
        ];
        const cleaned = executeRecipe(testRows, testColumns, recipeSteps);
        assert.equal(cleaned.data.length, 2);

        // --- 6. Visualization Studio Data Generator (FNC-05) ---
        const chartResult = generateChartData(cleaned.data, cleaned.columns, {
          type: 'BAR',
          xColumn: QA_MARKER_COL,
          aggregation: 'COUNT',
        });
        assert.ok(chartResult.type === 'BAR' && chartResult.data.length > 0);

        // --- 7. Export Studio (FNC-06) ---
        const exportedCsv = serializeToCsv(cleaned.data, cleaned.columns);
        assert.ok(exportedCsv.includes(QA_MARKER_VAL));

        const exportedXlsx = serializeToXlsx(cleaned.data, cleaned.columns);
        assert.ok(exportedXlsx.byteLength > 0);
      } finally {
        // Pulihkan fungsi asli
        http.request = originalHttpRequest;
        https.request = originalHttpsRequest;
        globalThis.fetch = originalFetch;
      }

      // Verifikasi 0 request terpantau sepanjang pipeline
      assert.equal(
        interceptedRequests.length,
        0,
        `Terdeteksi panggilan jaringan selama eksekusi alur data: ${JSON.stringify(interceptedRequests)}`
      );
    });

    it('2.2. Memverifikasi nilai penanda privasi (QA_PRIVATE_NAME_MARKER_7F2A) tidak bocor ke environment sistem', () => {
      const envKeys = Object.keys(process.env);
      for (const key of envKeys) {
        const val = process.env[key] || '';
        assert.ok(
          !val.includes(QA_MARKER_COL) && !val.includes(QA_MARKER_VAL),
          `Nilai penanda privasi terdeteksi bocor di environment variable '${key}'`
        );
      }
    });
  });
});

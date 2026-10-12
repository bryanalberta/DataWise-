# DataWise

<div align="center">
  <img src="public/brand/datawise-logo.svg" alt="DataWise Logo" width="280" />
  <p><strong>A modern, privacy-first data analytics workspace for profiling, cleaning, visualizing, and understanding datasets locally in your browser.</strong></p>

  [![Tests](https://img.shields.io/badge/tests-392%20passed-0f766e?style=flat-square)](src/__tests__)
  [![TypeScript](https://img.shields.io/badge/typescript-strict%205.x-0284c7?style=flat-square)](tsconfig.json)
  [![Next.js](https://img.shields.io/badge/next.js-16.4%20(App%20Router)-black?style=flat-square)](next.config.ts)
  [![Zero Server](https://img.shields.io/badge/privacy-100%25%20client--side-0d9488?style=flat-square)](#privacy--zero-server-architecture)
  [![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg?style=flat-square)](LICENSE)
  [![Static Export](https://img.shields.io/badge/build-static%20export-slate?style=flat-square)](next.config.ts)
</div>

---

## Overview

**DataWise** is an open-source, client-side data analytics application designed for data analysts, researchers, and developers who need instant data profiling, exploratory statistics, non-destructive data cleaning, interactive visualizations, and structured file exporting—**without uploading sensitive datasets to any remote server or cloud AI provider**.

Built with Next.js App Router, React 19, TypeScript, Tailwind CSS, and Web Workers, DataWise processes all file parsing, type inference, calculations, and transformations directly in your browser tab's memory.

---

## Key Features

DataWise organizes data workflows into eight dedicated workspaces:

### 1. Ingestion & Overview (`/`)
- **Drag-and-Drop Ingestion:** Support for CSV, TSV, and Excel (`.xlsx`) files.
- **Delimiter Detection:** Automatic delimiter detection with manual override options (comma `,`, semicolon `;`, tab `\t`).
- **Headerless CSV Support:** Toggle first-row header parsing (`hasHeader: true/false`). Retains 100% of row observations on headerless datasets (e.g. `steam-200k.csv`).
- **Worksheet Selector:** Interactive sheet selector for multi-sheet Excel workbooks.
- **Immediate Metadata:** Real-time calculation of row counts, column counts, memory estimation, and structural integrity status.

### 2. Interactive Data Grid (`/dataset`)
- **Virtualized Windowing:** High-performance DOM virtualization (`ROW_HEIGHT = 40`, `CHUNK_SIZE = 60`) supporting large datasets (200,000+ rows) at a consistent 60 FPS.
- **Multi-Type Sorting:** Type-aware sorting (Numeric, Text, Boolean, DateTime) with stable tie-breaking and explicit *nulls last* handling in both ascending and descending directions.
- **Global Search & Column Filtering:** Real-time multi-column text search and 10 column-level filter operators (`contains`, `startsWith`, `endsWith`, `equals`, `gt`, `gte`, `lt`, `lte`, `isEmpty`, `isNotEmpty`).
- **Column Type Override:** Ability to manually override inferred column data types directly within the interface.

### 3. Dataset Intelligence (`/insight`)
- **Family Classification:** Deterministic heuristic classification into 8 structural dataset archetypes:
  - `EVENT_LOG`, `TRANSACTION`, `CUSTOMER_RECORDS`, `PRODUCT_CATALOG`, `SURVEY_RESPONSES`, `TIME_SERIES`, `GENERAL_TABULAR`, `UNCLASSIFIED`.
- **Semantic Column Roles:** Automatic classification across 12 semantic roles (Identifier, Label, Category, DateTime, Numeric Metric, Currency, Percentage, Duration, Boolean, Free Text, Constant, Unknown) with uniqueness ratios and sample evidence.
- **Structural Key Findings:** Detection of high missing rates (>20%), constant columns (100% identical), extreme category imbalance (>80%), and primary key candidates.
- **Actionable Next Steps:** Direct contextual recommendations linked to visualization, statistics, and cleaning actions.

### 4. Data Quality Profiling (`/profiling`)
- **Integrity Score:** Composite data quality score (0–100) assessing overall cleanliness.
- **Completeness Metrics:** Visual ratio of valid cells vs total cells.
- **Diagnostic Breakdown:** Explicit separation between *Native Missing* (null / empty string) and *Dirty Whitespace* (space or tab characters only).
- **Duplicate Row Detection:** Identification of identical row duplicates with participant counts.
- **Column Schema Audit:** Per-column missing percentages with visual micro-progress bars and type inference confidence ratings.

### 5. Descriptive Statistics (`/analisis`)
- **13 Numerical Metrics:** 
  - Central tendency: Mean, Median (Linear Type-7 interpolation), Mode (deterministic multimodal tie-breaking).
  - Dispersion: Variance ($s^2$, Bessel correction $ddof=1$), Standard Deviation ($s$), Min, Max, Range, Interquartile Range (IQR).
  - Percentiles: 25th percentile (Q1), 75th percentile (Q3).
  - Distribution shape: Sample Skewness, Sample Kurtosis (Fisher-Pearson).
- **6 Categorical Metrics:** Count ($N$), Unique values, Missing count, Top frequent value, Top value frequency, Top value percentage.
- **Mathematical Integrity:** Verified against Python 3.13 / NumPy 2.3 / Pandas 2.3 gold standard fixtures with absolute tolerance $\Delta < 1 \times 10^{-12}$.
- **Interactive Modals & Transpose:** Categorical frequency distribution breakdown modal with keyboard ESC navigation, plus row/column transpose toggle.

### 6. Data Cleaning Studio (`/pembersihan`)
- **Immutable Raw Snapshot:** The raw ingested dataset is preserved untouched in memory (`originalDataStore`).
- **Non-Destructive Recipe Engine:** Operations are recorded as an immutable recipe log and evaluated deterministically:
  - *Drop Missing Rows:* Entire row or column-specific.
  - *Impute Missing Values:* Mean, Median (Type-7), Mode (multimodal tie-breaker), or Fixed Value with type validation.
  - *Drop Exact Duplicates:* Retains first occurrence.
  - *Trim Whitespace:* Strips leading and trailing whitespace from string columns without mutating primitives.
  - *Structure Operations:* Rename Column and Drop Column.
- **Live Impact Preview:** Real-time preview of impacted rows, affected cells, and replacement values before applying changes.
- **Rollback & Reset:** Individual step deletion with automatic re-evaluation, plus instant *Reset to Original Data* with confirmation modal.

### 7. Visualization Studio (`/visualisasi`)
- **Four High-Resolution Chart Types:**
  - *Bar Chart:* Category aggregation (COUNT, SUM, MEAN) with automatic handling for high cardinality (>20 categories grouped into `(Other)`).
  - *Histogram:* Configurable linear binning (2–50 bins) with zero-variance edge case handling.
  - *Line Chart:* Sequential observation ordering with explicit null-value policy (`connectNulls={false}`).
  - *Scatter Plot:* Paired X-Y numeric evaluation with transparent point sampling disclosure when $N > 2,500$.
- **Accessible Palette:** Okabe-Ito color-blind friendly palette accented by Deep Steel Teal (`#0F766E`).
- **Client-Side PNG Export:** High-DPI canvas rendering (2x Retina scale) with PNG magic-byte signature validation.

### 8. Dataset Export Studio (`/ekspor`)
- **RFC 4180 CSV Export:** Comma, semicolon, or tab delimited text export with optional UTF-8 Byte Order Mark (`\uFEFF`) for native Microsoft Excel desktop compatibility. Leading zeros (e.g. IDs, postal codes) preserved cleanly.
- **Excel (.xlsx) Export:** Native multi-cell spreadsheet generation via SheetJS with automatic cell typing (`s`, `n`, `b`) and sheet name sanitization (31-char limit, illegal character escaping).
- **Transformed Data Source:** Always exports the current active transformed dataset reflecting all cleaning recipe steps.

---

## Technologies Used

| Category | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | [Next.js](https://nextjs.org/) | `16.4.0` | App Router, Static HTML Export (`output: 'export'`) |
| **UI Library** | [React](https://react.dev/) | `19.3.0` | Modern React with concurrent rendering |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | `5.x` | Strict typing and interface contracts across all modules |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | `v4` | Modern utility-first CSS with CSS theme variables |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) | `5.0.15` | Lightweight client-side reactive store and cache isolation |
| **Background Processing** | [Web Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) | Native | Non-blocking background worker (`WorkerGlobalScope`) |
| **Worker Bundler** | [esbuild](https://esbuild.github.io/) | Native CLI | Bundling worker source to self-contained IIFE script |
| **CSV Parsing** | [PapaParse](https://www.papaparse.com/) | `5.7.0` | High-speed client-side CSV parsing |
| **Excel Processing** | [SheetJS (xlsx)](https://sheetjs.com/) | `0.18.5` | In-memory spreadsheet workbook reading and writing |
| **Data Visualization** | [Recharts](https://recharts.org/) | `3.10.1` | React 19 compatible responsive SVG chart components |
| **Icons** | [Lucide React](https://lucide.dev/) | `1.55.0` | Clean, accessible SVG iconography |
| **Test Runner** | [Node.js Test Runner](https://nodejs.org/api/test.html) | Native | Built-in test runner executed via `tsx` |

---

## Privacy & Zero-Server Architecture

DataWise is engineered from the ground up to provide **100% local privacy**:

- **No Backend Server:** The Next.js application is statically exported into pure HTML, CSS, and client-side JavaScript. There are zero API routes (`src/app/api`), zero server actions (`'use server'`), and zero cloud databases.
- **Zero Network Transmission:** When you upload, profile, clean, or export a dataset, not a single byte of data is sent over the network.
- **Verified by Automated Network Spy:** The test suite [`src/__tests__/network-privacy-audit.test.ts`](src/__tests__/network-privacy-audit.test.ts) intercepts `http.request`, `https.request`, and `fetch` across all pipeline operations, verifying **0 outgoing requests** and 0 data leakage.
- **No Third-Party Telemetry:** Zero Google Analytics, Sentry, Mixpanel, LogRocket, or tracking cookies.
- **Offline Capable:** Once loaded in the browser, DataWise can be run completely disconnected from the internet.

---

## Web Worker Architecture

To guarantee a responsive 60 FPS interface, all CPU-intensive operations run in a dedicated Web Worker (`public/workers/data-processor.worker.js`):

```
┌────────────────────────────────┐         postMessage()         ┌──────────────────────────────────────┐
│       Main Thread (React)      │ ────────────────────────────> │          Web Worker Thread           │
│                                │                               │                                      │
│  - App Router & Pages          │                               │  - Ingestion (PapaParse / SheetJS)   │
│  - Zustand Store State         │ <──────────────────────────── │  - Type Inference & Profiling        │
│  - Virtual DataGrid (DOM)      │         postMessage()         │  - Descriptive Stats (13 Metrics)    │
│  - SVG Chart Rendering         │     (Slice & Aggregates)      │  - Dataset Intelligence Engine       │
│  - Local Blob File Downloads   │                               │  - Immutable Cleaning Recipe Engine  │
│                                │                               │  - CSV / XLSX Serialization          │
└────────────────────────────────┘                               └──────────────────────────────────────┘
```

- **Memory Isolation:** Large raw records remain in Worker memory; only virtualized display windows (e.g. 60 rows) are transferred to the React DOM.
- **Non-Blocking Execution:** Heavy computations on 200,000+ rows do not freeze UI buttons, animations, or modal interactions.
- **Crash Protection:** The client communication wrapper (`src/lib/worker-client.ts`) handles task timeouts, Worker errors, and `messageerror` events gracefully.

---

## Prerequisites

- **Node.js:** `20.x` or later (LTS recommended).
- **npm:** `10.x` or later (bundled with Node.js).
- **Web Browser:** Any modern evergreen browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Apple Safari).

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/bryanalberta/DataWise-.git
   cd DataWise-
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification & Build Commands

DataWise includes a comprehensive validation suite:

```bash
# Run all 392 automated test suites (100% pass rate)
npm test

# Run TypeScript strict typecheck (0 errors)
npm run typecheck

# Run ESLint linting
npm run lint

# Bundle the Web Worker and generate production static export
npm run build
```

The production output will be generated in the `out/` directory, ready to be served by any static file host (e.g. GitHub Pages, Vercel Static, Cloudflare Pages, Nginx, or Caddy).

---

## Project Structure

```text
DataWise/
├── docs/                       # Project specifications & QA audit reports
│   ├── PRD.md                  # Comprehensive Product Requirements Document (v1.1.0-REVISED)
│   ├── IMPLEMENTATION_STATUS.md # Granular task tracking across all phases
│   ├── design/                 # Design system tokens and specifications
│   ├── features/               # Feature documentation (e.g. Dataset Intelligence)
│   └── qa/                     # Empirical QA audit reports (QA-01 through QA-GH-01)
├── public/                     # Static assets served by Next.js
│   ├── brand/                  # Official DataWise SVG brand marks and logos
│   └── workers/                # Bundled Web Worker (data-processor.worker.js)
├── scripts/                    # Build and validation scripts
│   ├── bundle-worker.mjs       # esbuild bundler for the standalone Web Worker
│   ├── generate-statistics-gold-standard.py # Python 3.13 / NumPy / Pandas verification script
│   └── serve-out.mjs           # Zero-dependency local server for static export verification
├── src/
│   ├── __tests__/              # 103 test suites covering all features, benchmarks, and regression
│   │   └── fixtures/           # Verified static fixtures (iris.csv, titanic.csv, etc.)
│   ├── app/                    # Next.js App Router (8 application workspaces)
│   │   ├── analisis/           # Descriptive statistics workspace
│   │   ├── dataset/            # Interactive virtualized DataGrid workspace
│   │   ├── ekspor/             # CSV & Excel export studio workspace
│   │   ├── insight/            # Dataset Intelligence workspace
│   │   ├── pembersihan/        # Data Cleaning Studio workspace
│   │   ├── profiling/          # Data quality profiling workspace
│   │   ├── visualisasi/        # Visualization studio workspace
│   │   ├── globals.css         # CSS custom properties, tokens, and utility classes
│   │   ├── layout.tsx          # Root layout bundling local Geist fonts
│   │   └── page.tsx            # Home ingestion workspace
│   ├── components/             # Reusable UI components
│   │   ├── brand/              # React SVG components (DataWiseLogo, BrandMark)
│   │   ├── common/             # Shared layout components (MetricCard, StatusBadge, EmptyState)
│   │   └── ui/                 # Base UI primitives
│   ├── lib/                    # Core business logic engines
│   │   ├── chart-engine.ts     # Visual aggregation, binning, and sampling logic
│   │   ├── data-grid-engine.ts # Windowing, multi-type sorting, and compound filter engine
│   │   ├── data-quality.ts     # Integrity score and duplicate/whitespace detection
│   │   ├── dataset-intelligence.ts # Family classification and semantic role heuristics
│   │   ├── descriptive-stats.ts # 13 numerical and 6 categorical statistics calculations
│   │   ├── export-engine.ts    # RFC 4180 CSV serializer and SheetJS XLSX exporter
│   │   ├── recipe-engine.ts    # Immutable cleaning pipeline evaluation and rollback
│   │   ├── type-inference.ts   # Column data type inference and profiling
│   │   └── worker-client.ts    # Typed Promise-based Web Worker client
│   ├── store/                  # Zustand state store and cache management
│   ├── types/                  # TypeScript interfaces and Worker message contracts
│   └── workers/                # Raw Web Worker source code (data-processor.worker.ts)
├── .gitignore                  # Git ignore rules protecting datasets, caches, and local files
├── eslint.config.mjs           # ESLint configuration
├── next.config.ts              # Next.js configuration with static export enabled
├── package.json                # Project dependencies and npm scripts
└── tsconfig.json               # TypeScript strict configuration
```

---

## Supported File Formats & Limits

| Format | File Extension | Recommended Limit | Notes |
|---|---|---|---|
| **CSV** | `.csv` | Up to 30 MB (~200,000+ rows) | Auto-detects comma, semicolon, and tab delimiters. Supports quoted multiline records, UTF-8 BOM, and headerless files. |
| **TSV** | `.tsv` | Up to 30 MB (~200,000+ rows) | Tab-delimited plain text data. |
| **Excel** | `.xlsx` | Up to 15 MB | Single and multi-sheet workbooks. Sheet selector available on upload. |

*Note: In-memory capacity depends on your local browser tab heap limit (typically 1–2 GB in modern desktop browsers).*

---

## Project Status & Quality Assurance

DataWise has completed all planned phases defined in the Product Requirements Document:
- **Phase 0:** Infrastructure & Worker Foundation (`TASK-SET-01` – `03`)
- **Phase 1:** Ingestion, Profiling & Overview (`TASK-FND-01` – `07`)
- **Phase 2:** Interactive Grid, Cleaning, Stats, Visuals, Export (`TASK-FNC-01` – `06`)
- **Phase 3:** Empirical Privacy, Benchmark, Gold-Standard QA (`TASK-QA-01` – `04`)
- **Phase 4:** Brand Identity & UI/UX Redesign (`TASK-UI-01A` – `01F`, `TASK-UI-02`, `TASK-UI-02B`)
- **Phase 5:** Dataset Intelligence & Semantic Role Detection (`TASK-DI-01`)
- **Phase 6:** Release Candidate & Repository Publication Preparation (`TASK-QA-05`, `TASK-GH-01`)

### Test Coverage Summary:
- **392 automated test assertions** across 103 test suites (`npm test`).
- **0 TypeScript compilation errors** under strict mode (`npm run typecheck`).
- **0 ESLint errors** (`npm run lint`).
- **11/11 static pages prerendered** successfully (`npm run build`).

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 bryanalberta. All bundled third-party libraries use permissive open-source licenses (MIT, Apache 2.0, ISC, SIL OFL 1.1).

import { DataType, ColumnFilter, GridSortConfig, QueryDataResult } from '../types';
import { isNativeMissing, isDirtyWhitespace } from './data-quality';
import { parseNumericValue } from './descriptive-stats';

export interface QueryDataGridOptions {
  datasetId: string;
  offset?: number;
  limit?: number;
  sort?: GridSortConfig;
  searchQuery?: string;
  filters?: readonly ColumnFilter[];
  columnTypes?: Record<string, DataType>;
  treatWhitespaceAsMissing?: boolean;
}

export interface IndexedRow extends Record<string, unknown> {
  _index?: number; // 1-based original row index
}

/**
 * Memeriksa apakah suatu nilai merupakan missing value
 */
export function isMissingValue(val: unknown, treatWhitespaceAsMissing = true): boolean {
  if (isNativeMissing(val)) return true;
  if (treatWhitespaceAsMissing && isDirtyWhitespace(val)) return true;
  return false;
}

/**
 * Memeriksa apakah suatu baris cocok dengan pencarian kata kunci global (case-insensitive)
 */
export function matchesGlobalSearch(
  row: Record<string, unknown>,
  query: string,
  treatWhitespaceAsMissing = true
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;

  for (const [key, val] of Object.entries(row)) {
    if (key === '_index') continue;
    if (isMissingValue(val, treatWhitespaceAsMissing)) continue;

    const strVal = String(val).toLowerCase();
    if (strVal.includes(q)) {
      return true;
    }
  }

  return false;
}

/**
 * Memeriksa apakah nilai kolom memenuhi kriteria ColumnFilter
 */
export function matchesColumnFilter(
  val: unknown,
  filter: ColumnFilter,
  columnType: DataType = 'Text',
  treatWhitespaceAsMissing = true
): boolean {
  const missing = isMissingValue(val, treatWhitespaceAsMissing);

  // Operator pemeriksaan kekosongan
  if (filter.operator === 'isEmpty') {
    return missing;
  }
  if (filter.operator === 'isNotEmpty') {
    return !missing;
  }

  // Jika nilai missing dan operator bukan isEmpty/isNotEmpty, baris tidak lolos filter
  if (missing) {
    return false;
  }

  const filterValTrimmed = filter.value.trim();

  switch (filter.operator) {
    case 'contains': {
      const target = filterValTrimmed.toLowerCase();
      return String(val).toLowerCase().includes(target);
    }

    case 'startsWith': {
      const target = filterValTrimmed.toLowerCase();
      return String(val).toLowerCase().startsWith(target);
    }

    case 'endsWith': {
      const target = filterValTrimmed.toLowerCase();
      return String(val).toLowerCase().endsWith(target);
    }

    case 'equals': {
      if (columnType === 'Numeric') {
        const numVal = parseNumericValue(val);
        const targetNum = parseNumericValue(filterValTrimmed);
        if (numVal !== null && targetNum !== null) {
          return Math.abs(numVal - targetNum) < 1e-9;
        }
      }
      if (columnType === 'Boolean') {
        const strA = String(val).toLowerCase();
        const strB = filterValTrimmed.toLowerCase();
        return strA === strB;
      }
      return String(val).toLowerCase() === filterValTrimmed.toLowerCase();
    }

    case 'gt': {
      const numVal = parseNumericValue(val);
      const targetNum = parseNumericValue(filterValTrimmed);
      if (numVal !== null && targetNum !== null) {
        return numVal > targetNum;
      }
      if (columnType === 'DateTime') {
        const tVal = Date.parse(String(val));
        const tTarget = Date.parse(filterValTrimmed);
        return !Number.isNaN(tVal) && !Number.isNaN(tTarget) && tVal > tTarget;
      }
      return String(val).localeCompare(filterValTrimmed) > 0;
    }

    case 'gte': {
      const numVal = parseNumericValue(val);
      const targetNum = parseNumericValue(filterValTrimmed);
      if (numVal !== null && targetNum !== null) {
        return numVal >= targetNum;
      }
      if (columnType === 'DateTime') {
        const tVal = Date.parse(String(val));
        const tTarget = Date.parse(filterValTrimmed);
        return !Number.isNaN(tVal) && !Number.isNaN(tTarget) && tVal >= tTarget;
      }
      return String(val).localeCompare(filterValTrimmed) >= 0;
    }

    case 'lt': {
      const numVal = parseNumericValue(val);
      const targetNum = parseNumericValue(filterValTrimmed);
      if (numVal !== null && targetNum !== null) {
        return numVal < targetNum;
      }
      if (columnType === 'DateTime') {
        const tVal = Date.parse(String(val));
        const tTarget = Date.parse(filterValTrimmed);
        return !Number.isNaN(tVal) && !Number.isNaN(tTarget) && tVal < tTarget;
      }
      return String(val).localeCompare(filterValTrimmed) < 0;
    }

    case 'lte': {
      const numVal = parseNumericValue(val);
      const targetNum = parseNumericValue(filterValTrimmed);
      if (numVal !== null && targetNum !== null) {
        return numVal <= targetNum;
      }
      if (columnType === 'DateTime') {
        const tVal = Date.parse(String(val));
        const tTarget = Date.parse(filterValTrimmed);
        return !Number.isNaN(tVal) && !Number.isNaN(tTarget) && tVal <= tTarget;
      }
      return String(val).localeCompare(filterValTrimmed) <= 0;
    }

    default:
      return true;
  }
}

/**
 * Membandingkan dua baris untuk pengurutan multi-tipe (Numeric, Text, Boolean, DateTime)
 * dengan perlakuan missing value konsisten (nulls last) dan tie-breaker stabil.
 */
export function compareRows(
  rowA: IndexedRow,
  rowB: IndexedRow,
  sortConfig: GridSortConfig,
  columnTypes: Record<string, DataType> = {},
  treatWhitespaceAsMissing = true
): number {
  const colId = sortConfig.columnId;
  const dir = sortConfig.direction === 'asc' ? 1 : -1;
  const colType = columnTypes[colId] || 'Text';

  const valA = rowA[colId];
  const valB = rowB[colId];

  const isMissingA = isMissingValue(valA, treatWhitespaceAsMissing);
  const isMissingB = isMissingValue(valB, treatWhitespaceAsMissing);

  // Penanganan Missing Values: selalu di paling bawah (nulls last)
  if (isMissingA && isMissingB) {
    return (rowA._index ?? 0) - (rowB._index ?? 0);
  }
  if (isMissingA) return 1;
  if (isMissingB) return -1;

  let diff = 0;

  if (colType === 'Numeric') {
    const numA = parseNumericValue(valA);
    const numB = parseNumericValue(valB);

    if (numA !== null && numB !== null) {
      diff = numA - numB;
    } else if (numA !== null) {
      diff = -1;
    } else if (numB !== null) {
      diff = 1;
    } else {
      diff = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
    }
  } else if (colType === 'Boolean') {
    const bA = typeof valA === 'boolean' ? valA : String(valA).toLowerCase() === 'true' || valA === 1 || valA === '1';
    const bB = typeof valB === 'boolean' ? valB : String(valB).toLowerCase() === 'true' || valB === 1 || valB === '1';
    // false (0) sebelum true (1) dalam urutan ascending
    diff = bA === bB ? 0 : bA ? 1 : -1;
  } else if (colType === 'DateTime') {
    const tA = Date.parse(String(valA));
    const tB = Date.parse(String(valB));
    if (!Number.isNaN(tA) && !Number.isNaN(tB)) {
      diff = tA - tB;
    } else {
      diff = String(valA).localeCompare(String(valB));
    }
  } else {
    // Text / Categorical (Leksikografis standar)
    diff = String(valA).localeCompare(String(valB), undefined, { sensitivity: 'base' });
  }

  if (diff !== 0) {
    return diff * dir;
  }

  // Stable sort tie-breaker menggunakan indeks asli
  return (rowA._index ?? 0) - (rowB._index ?? 0);
}

/**
 * Menjalankan pipeline query data: Filter -> Search -> Sort -> Slicing Window
 */
export function queryDataGrid(
  rawData: readonly Record<string, unknown>[],
  options: QueryDataGridOptions
): QueryDataResult {
  const {
    datasetId,
    offset = 0,
    limit = 50,
    sort,
    searchQuery = '',
    filters = [],
    columnTypes = {},
    treatWhitespaceAsMissing = true,
  } = options;

  const totalRows = rawData.length;
  const hasSearch = searchQuery.trim().length > 0;
  const hasFilters = filters.length > 0;
  const hasSort = Boolean(sort && sort.columnId && (sort.direction === 'asc' || sort.direction === 'desc'));

  // Jika tidak ada filter, search, maupun sort, gunakan jalur cepat
  if (!hasSearch && !hasFilters && !hasSort) {
    const boundedOffset = Math.max(0, Math.min(offset, totalRows));
    const sliceEnd = Math.min(boundedOffset + limit, totalRows);

    const rows: IndexedRow[] = [];
    for (let i = boundedOffset; i < sliceEnd; i++) {
      rows.push({
        ...rawData[i],
        _index: i + 1,
      });
    }

    return {
      datasetId,
      rows,
      totalRows,
      matchedRows: totalRows,
      offset: boundedOffset,
      limit,
    };
  }

  // 1. Filter & Search
  const filtered: IndexedRow[] = [];

  for (let i = 0; i < totalRows; i++) {
    const row = rawData[i];

    // Global Search
    if (hasSearch && !matchesGlobalSearch(row, searchQuery, treatWhitespaceAsMissing)) {
      continue;
    }

    // Column Filters (AND logic)
    if (hasFilters) {
      let passedAll = true;
      for (const filter of filters) {
        const val = row[filter.columnId];
        const type = columnTypes[filter.columnId] || 'Text';
        if (!matchesColumnFilter(val, filter, type, treatWhitespaceAsMissing)) {
          passedAll = false;
          break;
        }
      }
      if (!passedAll) continue;
    }

    filtered.push({
      ...row,
      _index: i + 1,
    });
  }

  const matchedRows = filtered.length;

  // 2. Sort jika aktif
  if (hasSort && sort) {
    filtered.sort((a, b) => compareRows(a, b, sort, columnTypes, treatWhitespaceAsMissing));
  }

  // 3. Slice Window
  const boundedOffset = Math.max(0, Math.min(offset, matchedRows));
  const sliceEnd = Math.min(boundedOffset + limit, matchedRows);
  const rows = filtered.slice(boundedOffset, sliceEnd);

  return {
    datasetId,
    rows,
    totalRows,
    matchedRows,
    offset: boundedOffset,
    limit,
  };
}

import {
  ColumnSchema,
  ChartConfig,
  ChartDataResult,
  BarChartConfig,
  BarChartResult,
  BarChartItem,
  HistogramConfig,
  HistogramResult,
  HistogramBin,
  LineChartConfig,
  LineChartResult,
  LineChartPoint,
  ScatterPlotConfig,
  ScatterPlotResult,
  ScatterPlotPoint,
} from '../types';
import { isNativeMissing } from './data-quality';
import { parseNumericValue } from './descriptive-stats';
import { findColumn, getCellValue } from './recipe-engine';

/**
 * Menghasilkan data untuk Bar Chart.
 * Mendukung penghitungan frekuensi kategori atau agregasi nilai (SUM / MEAN).
 * Jika kardinalitas kategori terlalu besar (> maxCategories), mengelompokkan sisanya ke "(Lainnya)".
 */
export function generateBarChartData(
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[],
  config: BarChartConfig
): BarChartResult {
  const xCol = findColumn(columns, config.xColumn);
  if (!xCol) {
    throw new Error(`Kolom kategori '${config.xColumn}' tidak ditemukan dalam dataset.`);
  }

  let yCol: ColumnSchema | undefined;
  const aggregation = config.aggregation || (config.yColumn ? 'SUM' : 'COUNT');

  if (config.yColumn) {
    yCol = findColumn(columns, config.yColumn);
    if (!yCol) {
      throw new Error(`Kolom Y '${config.yColumn}' tidak ditemukan dalam dataset.`);
    }
    if (yCol.type !== 'Numeric') {
      throw new Error(`Kolom Y untuk agregasi harus bertipe numerik (tipe saat ini: ${yCol.type}).`);
    }
  }

  const maxCategories = Math.max(5, Math.min(100, config.maxCategories ?? 20));
  const categoryStats = new Map<string, { sum: number; count: number }>();
  let missingCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rawX = getCellValue(row, xCol);

    if (isNativeMissing(rawX)) {
      missingCount++;
      continue;
    }

    const catName = String(rawX).trim() || '(String Kosong)';

    let yValNum = 1;
    if (yCol) {
      const rawY = getCellValue(row, yCol);
      const parsedY = parseNumericValue(rawY);
      if (parsedY === null) {
        // Lewati nilai Y yang tidak valid untuk kalkulasi nilai
        continue;
      }
      yValNum = parsedY;
    }

    const current = categoryStats.get(catName) || { sum: 0, count: 0 };
    current.sum += yValNum;
    current.count += 1;
    categoryStats.set(catName, current);
  }

  // Bentuk array kategori dan urutkan
  const allItems: BarChartItem[] = [];
  for (const [category, stats] of categoryStats.entries()) {
    let finalValue = stats.count;
    if (aggregation === 'SUM') {
      finalValue = stats.sum;
    } else if (aggregation === 'MEAN') {
      finalValue = stats.count > 0 ? stats.sum / stats.count : 0;
    }

    allItems.push({
      category,
      value: Number(finalValue.toFixed(4)),
      count: stats.count,
    });
  }

  // Urutkan nilai menurun (descending), ties diurutkan leksikografis
  allItems.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.category.localeCompare(b.category);
  });

  const totalCategories = allItems.length;
  let displayedCategories = totalCategories;
  let otherCategoriesCount = 0;
  let finalData: BarChartItem[] = allItems;

  if (totalCategories > maxCategories) {
    const topItems = allItems.slice(0, maxCategories);
    const otherItems = allItems.slice(maxCategories);
    otherCategoriesCount = otherItems.length;

    let otherTotalValue = 0;
    let otherTotalCount = 0;
    for (const item of otherItems) {
      otherTotalCount += item.count;
      otherTotalValue += item.value;
    }

    let otherFinalValue = otherTotalCount;
    if (aggregation === 'SUM') {
      otherFinalValue = otherTotalValue;
    } else if (aggregation === 'MEAN') {
      otherFinalValue = otherTotalCount > 0 ? otherTotalValue / otherItems.length : 0;
    }

    topItems.push({
      category: `(Lainnya - ${otherCategoriesCount} kategori)`,
      value: Number(otherFinalValue.toFixed(4)),
      count: otherTotalCount,
    });

    finalData = topItems;
    displayedCategories = maxCategories;
  }

  return {
    type: 'BAR',
    data: finalData,
    xColumn: xCol.name,
    yColumn: yCol?.name,
    aggregation,
    totalCategories,
    displayedCategories,
    otherCategoriesCount,
    missingCount,
  };
}

/**
 * Menghasilkan data untuk Histogram.
 * Menghitung distribusi frekuensi bin numerik secara presisi.
 * Menangani data konstan, missing values, dan batas bin.
 */
export function generateHistogramData(
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[],
  config: HistogramConfig
): HistogramResult {
  const col = findColumn(columns, config.column);
  if (!col) {
    throw new Error(`Kolom '${config.column}' tidak ditemukan dalam dataset.`);
  }

  if (col.type !== 'Numeric') {
    throw new Error(`Histogram hanya dapat dihitung untuk kolom bertipe numerik (tipe saat ini: ${col.type}).`);
  }

  const requestedBins = Math.max(2, Math.min(50, Math.floor(config.bins || 10)));
  const validNumbers: number[] = [];
  let missingCount = 0;

  for (let i = 0; i < data.length; i++) {
    const rawVal = getCellValue(data[i], col);
    if (isNativeMissing(rawVal)) {
      missingCount++;
      continue;
    }
    const num = parseNumericValue(rawVal);
    if (num === null) {
      missingCount++;
    } else {
      validNumbers.push(num);
    }
  }

  const totalObservations = data.length;
  const validCount = validNumbers.length;

  if (validCount === 0) {
    return {
      type: 'HISTOGRAM',
      bins: [],
      column: col.name,
      binCount: requestedBins,
      binWidth: 0,
      min: 0,
      max: 0,
      totalObservations,
      validCount: 0,
      missingCount,
      isConstant: false,
    };
  }

  let min = validNumbers[0];
  let max = validNumbers[0];
  for (let i = 1; i < validCount; i++) {
    if (validNumbers[i] < min) min = validNumbers[i];
    if (validNumbers[i] > max) max = validNumbers[i];
  }

  // Kasus data konstan (seluruh nilai sama)
  if (min === max) {
    const singleBin: HistogramBin = {
      binIndex: 0,
      binStart: min,
      binEnd: max,
      label: `[${min}]`,
      count: validCount,
      percentage: 100,
    };

    return {
      type: 'HISTOGRAM',
      bins: [singleBin],
      column: col.name,
      binCount: 1,
      binWidth: 0,
      min,
      max,
      totalObservations,
      validCount,
      missingCount,
      isConstant: true,
    };
  }

  const binWidth = (max - min) / requestedBins;
  const binCounts = new Array<number>(requestedBins).fill(0);

  for (let i = 0; i < validCount; i++) {
    const val = validNumbers[i];
    // Indeks bin: nilai maksimum masuk ke bin terakhir (bins - 1)
    let idx = Math.floor((val - min) / binWidth);
    if (idx >= requestedBins) {
      idx = requestedBins - 1;
    }
    if (idx < 0) {
      idx = 0;
    }
    binCounts[idx]++;
  }

  const bins: HistogramBin[] = [];
  for (let b = 0; b < requestedBins; b++) {
    const binStart = min + b * binWidth;
    const binEnd = b === requestedBins - 1 ? max : min + (b + 1) * binWidth;
    const count = binCounts[b];
    const percentage = Number(((count / validCount) * 100).toFixed(2));
    const label = `[${binStart.toFixed(2)} - ${binEnd.toFixed(2)}${b === requestedBins - 1 ? ']' : ')'}`;

    bins.push({
      binIndex: b,
      binStart: Number(binStart.toFixed(4)),
      binEnd: Number(binEnd.toFixed(4)),
      label,
      count,
      percentage,
    });
  }

  return {
    type: 'HISTOGRAM',
    bins,
    column: col.name,
    binCount: requestedBins,
    binWidth: Number(binWidth.toFixed(4)),
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    totalObservations,
    validCount,
    missingCount,
    isConstant: false,
  };
}

/**
 * Menghasilkan data untuk Line Chart.
 * Mempertahankan urutan observasi asli dataset.
 * Menangani missing values secara eksplisit (sebagai null) tanpa menghubungkan titik secara keliru.
 * Melakukan visual sampling sistematis jika jumlah observasi > 2000 titik.
 */
export function generateLineChartData(
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[],
  config: LineChartConfig
): LineChartResult {
  const yCol = findColumn(columns, config.yColumn);
  if (!yCol) {
    throw new Error(`Kolom Y '${config.yColumn}' tidak ditemukan dalam dataset.`);
  }

  if (yCol.type !== 'Numeric') {
    throw new Error(`Sumbu Y pada Line Chart harus bertipe numerik (tipe saat ini: ${yCol.type}).`);
  }

  let xCol: ColumnSchema | undefined;
  if (config.xColumn) {
    xCol = findColumn(columns, config.xColumn);
  }

  const totalPoints = data.length;
  const maxAllowedPoints = Math.max(500, config.maxPoints ?? 2000);
  const shouldSample = totalPoints > maxAllowedPoints;
  const sampleStep = shouldSample ? Math.ceil(totalPoints / maxAllowedPoints) : 1;

  const points: LineChartPoint[] = [];
  let validCount = 0;
  let missingCount = 0;

  for (let i = 0; i < totalPoints; i++) {
    const row = data[i];
    const rawY = getCellValue(row, yCol);
    let parsedY: number | null = null;

    if (isNativeMissing(rawY)) {
      missingCount++;
    } else {
      const num = parseNumericValue(rawY);
      if (num === null) {
        missingCount++;
      } else {
        parsedY = num;
        validCount++;
      }
    }

    // Periksa apakah titik ini diambil (jika sampling, selalu sertakan titik awal dan akhir)
    const isEdgePoint = i === 0 || i === totalPoints - 1;
    const isSampledIn = i % sampleStep === 0;

    if (!shouldSample || isEdgePoint || isSampledIn) {
      let xVal: string | number = i + 1; // Default: 1-indexed row number
      if (xCol) {
        const rawX = getCellValue(row, xCol);
        if (!isNativeMissing(rawX)) {
          xVal = String(rawX);
        }
      }

      points.push({
        index: i + 1,
        x: xVal,
        y: parsedY !== null ? Number(parsedY.toFixed(4)) : null,
      });
    }
  }

  return {
    type: 'LINE',
    data: points,
    yColumn: yCol.name,
    xColumn: xCol?.name,
    totalPoints,
    displayedPoints: points.length,
    isSampled: shouldSample,
    validCount,
    missingCount,
  };
}

/**
 * Menghasilkan data untuk Scatter Plot.
 * Memastikan pasangan (X, Y) berasal dari baris yang sama persis tanpa percampuran.
 * Menangani missing values dan melakukan visual sampling jika jumlah pasangan > 2500.
 */
export function generateScatterPlotData(
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[],
  config: ScatterPlotConfig
): ScatterPlotResult {
  const xCol = findColumn(columns, config.xColumn);
  if (!xCol) {
    throw new Error(`Kolom X '${config.xColumn}' tidak ditemukan dalam dataset.`);
  }
  if (xCol.type !== 'Numeric') {
    throw new Error(`Kolom X pada Scatter Plot harus bertipe numerik (tipe saat ini: ${xCol.type}).`);
  }

  const yCol = findColumn(columns, config.yColumn);
  if (!yCol) {
    throw new Error(`Kolom Y '${config.yColumn}' tidak ditemukan dalam dataset.`);
  }
  if (yCol.type !== 'Numeric') {
    throw new Error(`Kolom Y pada Scatter Plot harus bertipe numerik (tipe saat ini: ${yCol.type}).`);
  }

  const totalPairs = data.length;
  const validPairs: ScatterPlotPoint[] = [];
  let missingCount = 0;

  for (let i = 0; i < totalPairs; i++) {
    const row = data[i];
    const rawX = getCellValue(row, xCol);
    const rawY = getCellValue(row, yCol);

    if (isNativeMissing(rawX) || isNativeMissing(rawY)) {
      missingCount++;
      continue;
    }

    const numX = parseNumericValue(rawX);
    const numY = parseNumericValue(rawY);

    if (numX === null || numY === null) {
      missingCount++;
      continue;
    }

    validPairs.push({
      rowIndex: i + 1,
      x: Number(numX.toFixed(4)),
      y: Number(numY.toFixed(4)),
    });
  }

  const validCount = validPairs.length;
  const maxAllowed = Math.max(500, config.maxPoints ?? 2500);
  const shouldSample = validCount > maxAllowed;

  let finalPoints = validPairs;
  if (shouldSample) {
    const step = Math.ceil(validCount / maxAllowed);
    finalPoints = [];
    for (let i = 0; i < validCount; i += step) {
      finalPoints.push(validPairs[i]);
    }
    // Pastikan titik terakhir tetap terplot
    if (finalPoints[finalPoints.length - 1] !== validPairs[validCount - 1]) {
      finalPoints.push(validPairs[validCount - 1]);
    }
  }

  return {
    type: 'SCATTER',
    data: finalPoints,
    xColumn: xCol.name,
    yColumn: yCol.name,
    totalPairs,
    displayedPoints: finalPoints.length,
    isSampled: shouldSample,
    validCount,
    missingCount,
  };
}

/**
 * Dispatcher utama untuk menghasilkan data grafik berdasarkan konfigurasi.
 */
export function generateChartData(
  data: readonly Record<string, unknown>[],
  columns: readonly ColumnSchema[],
  config: ChartConfig
): ChartDataResult {
  switch (config.type) {
    case 'BAR':
      return generateBarChartData(data, columns, config);
    case 'HISTOGRAM':
      return generateHistogramData(data, columns, config);
    case 'LINE':
      return generateLineChartData(data, columns, config);
    case 'SCATTER':
      return generateScatterPlotData(data, columns, config);
    default:
      throw new Error(`Tipe grafik '${(config as { type: string }).type}' tidak didukung.`);
  }
}

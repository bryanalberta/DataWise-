import {
  Dataset,
  ColumnSchema,
  IntelligenceConfidence,
  DatasetTypeInference,
  SemanticColumnRole,
  SemanticColumnProfile,
  DatasetFinding,
  AnalysisRecommendation,
  DatasetIntelligenceResult,
} from '../types';
import { isNativeMissing } from './data-quality';
import { getCellValue } from './recipe-engine';

/**
 * Pola regex nama kolom umum untuk inferensi heuristik awal saat header tersedia.
 */
const ID_NAME_REGEX =
  /(^|_|\b)(id|uuid|guid|code|kode|nik|isbn|sku|nip|nis|token|key|user_id|userid|customer_id|customerid|order_id|orderid|account_id|accountid|player_id)($|_|\b)/i;

const NAME_LABEL_REGEX =
  /(^|_|\b)(name|nama|title|judul|label|item|product|produk|game|app|artist|album|kota|city|country|negara)($|_|\b)/i;

const DATE_NAME_REGEX =
  /(^|_|\b)(date|tanggal|time|waktu|timestamp|created|updated|year|tahun|month|bulan|day|hari)($|_|\b)/i;

const CATEGORY_NAME_REGEX =
  /(^|_|\b)(type|tipe|category|kategori|status|genre|class|grade|level|behavior|action|aktivitas|peran|role|gender|jenis_kelamin|kelompok)($|_|\b)/i;

const CURRENCY_NAME_REGEX =
  /(^|_|\b)(price|harga|cost|biaya|salary|gaji|revenue|pendapatan|nominal|fare|tarif|amount|total_amount|bayar|ongkos)($|_|\b)/i;

const PERCENTAGE_NAME_REGEX =
  /(^|_|\b)(percent|percentage|persen|persentase|ratio|rasio|rate|tingkat|margin)($|_|\b)/i;

const DURATION_NAME_REGEX =
  /(^|_|\b)(duration|durasi|hours|jam|minutes|menit|seconds|detik|playtime|elapsed|latency)($|_|\b)/i;

/**
 * Memeriksa apakah suatu string tampak seperti identifier non-desimal (misal NIK, User ID 3-18 digit).
 */
function isIntegerIdentifierString(val: string): boolean {
  return /^[0-9]{3,18}$/.test(val);
}

/**
 * Mengonversi tingkat confidence string ke label bahasa Indonesia yang ramah pengguna.
 */
export function getConfidenceLabel(confidence: IntelligenceConfidence): 'Rendah' | 'Sedang' | 'Tinggi' {
  switch (confidence) {
    case 'HIGH':
      return 'Tinggi';
    case 'MEDIUM':
      return 'Sedang';
    case 'LOW':
    default:
      return 'Rendah';
  }
}

/**
 * Memberikan label deskriptif untuk setiap peran semantik kolom.
 */
export function getRoleLabel(role: SemanticColumnRole): string {
  switch (role) {
    case 'IDENTIFIER':
      return 'Identifier / Kunci';
    case 'NAME_LABEL':
      return 'Nama atau Label';
    case 'CATEGORY':
      return 'Kategori';
    case 'DATE_TIME':
      return 'Tanggal / Waktu';
    case 'NUMERIC_METRIC':
      return 'Metrik Numerik';
    case 'CURRENCY':
      return 'Mata Uang / Finansial';
    case 'PERCENTAGE':
      return 'Persentase / Rasio';
    case 'DURATION':
      return 'Durasi / Waktu';
    case 'BOOLEAN':
      return 'Boolean / Biner';
    case 'FREE_TEXT':
      return 'Teks Bebas';
    case 'CONSTANT':
      return 'Konstan (Tanpa Variasi)';
    case 'UNKNOWN':
    default:
      return 'Tidak Diketahui';
  }
}

/**
 * Menganalisis peran semantik satu kolom secara deterministik berdasarkan
 * struktur skema, nama kolom, kardinalitas nilai, dan sebaran observasi aktual.
 */
export function profileColumnSemantics(
  dataset: Dataset,
  column: ColumnSchema,
  values: readonly unknown[]
): SemanticColumnProfile {
  const totalCount = values.length;
  let nullCount = 0;
  const distinctSet = new Set<string>();
  const sampleValuesList: unknown[] = [];
  let allIntegersOfLength = true;
  let integerIdMatchCount = 0;
  let totalStringLength = 0;

  for (let i = 0; i < totalCount; i++) {
    const val = values[i];
    if (isNativeMissing(val)) {
      nullCount++;
      continue;
    }

    const strVal = String(val).trim();
    if (!distinctSet.has(strVal)) {
      distinctSet.add(strVal);
      if (sampleValuesList.length < 5) {
        sampleValuesList.push(val);
      }
    }

    totalStringLength += strVal.length;

    if (isIntegerIdentifierString(strVal)) {
      integerIdMatchCount++;
    } else if (allIntegersOfLength) {
      allIntegersOfLength = false;
    }
  }

  const validCount = totalCount - nullCount;
  const uniqueCount = distinctSet.size;
  const uniquenessRatio = validCount > 0 ? uniqueCount / validCount : 0;
  const nullRatio = totalCount > 0 ? nullCount / totalCount : 0;
  const isConstant = validCount > 0 && uniqueCount <= 1;
  const isNumeric = column.type === 'Numeric';
  const isDateTime = column.type === 'DateTime';
  const isNamedHeader = dataset.hasHeader ?? !/^Column \d+$/i.test(column.name);

  // 1. Kasus Kolom Konstan (Seluruh observasi bernilai tunggal)
  if (isConstant) {
    const sampleVal = sampleValuesList[0];
    return {
      columnId: column.id,
      columnName: column.name,
      inferredType: column.type,
      role: 'CONSTANT',
      roleLabel: getRoleLabel('CONSTANT'),
      confidence: 'HIGH',
      confidenceLabel: 'Tinggi',
      rationale: `Seluruh ${validCount.toLocaleString('id-ID')} observasi (100% baris) bernilai tunggal identik ("${String(sampleVal ?? '')}").`,
      evidence: {
        uniqueCount,
        uniquenessRatio,
        nullCount,
        nullRatio,
        isConstant: true,
        sampleValues: sampleValuesList,
        isNumeric,
        isDateTime,
      },
    };
  }

  // 2. Kasus Kolom Boolean
  if (
    column.type === 'Boolean' ||
    (uniqueCount === 2 &&
      Array.from(distinctSet).every((v) =>
        ['true', 'false', '0', '1', 'yes', 'no', 'ya', 'tidak'].includes(v.toLowerCase())
      ))
  ) {
    return {
      columnId: column.id,
      columnName: column.name,
      inferredType: column.type,
      role: 'BOOLEAN',
      roleLabel: getRoleLabel('BOOLEAN'),
      confidence: 'HIGH',
      confidenceLabel: 'Tinggi',
      rationale: `Memiliki tepat 2 nilai biner diskrit (${Array.from(distinctSet).slice(0, 2).join(' / ')}).`,
      evidence: {
        uniqueCount,
        uniquenessRatio,
        nullCount,
        nullRatio,
        isConstant: false,
        sampleValues: sampleValuesList,
        isNumeric,
        isDateTime,
      },
    };
  }

  // 3. Kasus Kolom Tanggal / Waktu
  if (isDateTime || (isNamedHeader && DATE_NAME_REGEX.test(column.name))) {
    return {
      columnId: column.id,
      columnName: column.name,
      inferredType: column.type,
      role: 'DATE_TIME',
      roleLabel: getRoleLabel('DATE_TIME'),
      confidence: isDateTime ? 'HIGH' : 'MEDIUM',
      confidenceLabel: isDateTime ? 'Tinggi' : 'Sedang',
      rationale: isDateTime
        ? 'Tipe data terinferensi sebagai tanggal atau stempel waktu terformat.'
        : 'Nama kolom mengindikasikan informasi waktu atau tanggal observasi.',
      evidence: {
        uniqueCount,
        uniquenessRatio,
        nullCount,
        nullRatio,
        isConstant: false,
        sampleValues: sampleValuesList,
        isNumeric: false,
        isDateTime: true,
      },
    };
  }

  // 4. Kasus Identifier (ID Unik atau Foreign Key Relasional)
  const isCurrencyName = isNamedHeader && CURRENCY_NAME_REGEX.test(column.name);
  const isDurationName = isNamedHeader && DURATION_NAME_REGEX.test(column.name);
  const isPercentageName = isNamedHeader && PERCENTAGE_NAME_REGEX.test(column.name);
  const isIntegerIdPattern = validCount >= 5 && integerIdMatchCount / validCount >= 0.98;
  const isNameId = isNamedHeader && ID_NAME_REGEX.test(column.name);
  const isTextIdentifier =
    column.type === 'Text' &&
    (isNameId || (uniquenessRatio >= 0.85 && validCount >= 10) || isIntegerIdPattern);
  const isNumericIdentifier =
    isNumeric &&
    !isCurrencyName &&
    !isDurationName &&
    !isPercentageName &&
    (isNameId || isIntegerIdPattern);

  if (isNameId || isTextIdentifier || isNumericIdentifier) {
    const isHighConf = isNameId || uniquenessRatio >= 0.95;
    return {
      columnId: column.id,
      columnName: column.name,
      inferredType: column.type,
      role: 'IDENTIFIER',
      roleLabel: getRoleLabel('IDENTIFIER'),
      confidence: isHighConf ? 'HIGH' : 'MEDIUM',
      confidenceLabel: isHighConf ? 'Tinggi' : 'Sedang',
      rationale: isNameId
        ? `Nama kolom dan rasio keunikan (${uniqueCount.toLocaleString('id-ID')} nilai unik) mengindikasikan identifier unik/relasional.`
        : `Nilai observasi berupa rangkaian angka/kode pengenal terstruktur (${uniqueCount.toLocaleString('id-ID')} nilai unik).`,
      evidence: {
        uniqueCount,
        uniquenessRatio,
        nullCount,
        nullRatio,
        isConstant: false,
        sampleValues: sampleValuesList,
        isNumeric,
        isDateTime: false,
        isIdentifierPattern: true,
      },
    };
  }

  // 5. Kasus Nama atau Label Entitas Deskriptif (Berdasarkan Header)
  const avgStrLength = validCount > 0 ? totalStringLength / validCount : 0;
  const isNameMatch = isNamedHeader && NAME_LABEL_REGEX.test(column.name);
  if (column.type === 'Text' && isNameMatch) {
    return {
      columnId: column.id,
      columnName: column.name,
      inferredType: column.type,
      role: 'NAME_LABEL',
      roleLabel: getRoleLabel('NAME_LABEL'),
      confidence: 'HIGH',
      confidenceLabel: 'Tinggi',
      rationale: `Nama kolom dan isi data menunjukkan label atau nama entitas (${uniqueCount.toLocaleString('id-ID')} nilai unik).`,
      evidence: {
        uniqueCount,
        uniquenessRatio,
        nullCount,
        nullRatio,
        isConstant: false,
        sampleValues: sampleValuesList,
        isNumeric: false,
        isDateTime: false,
      },
    };
  }

  // 6. Kasus Kategori Berulang (Low Cardinality)
  const isCategoricalType = column.type === 'Categorical' || column.type === 'Text';
  const isLowCardinality =
    uniqueCount >= 2 &&
    (uniqueCount <= 15 ||
      (uniqueCount <= 30 && uniquenessRatio <= 0.3) ||
      (validCount > 100 && uniquenessRatio <= 0.05 && uniqueCount <= 100));

  if (isCategoricalType && isLowCardinality) {
    const isNameCat = isNamedHeader && CATEGORY_NAME_REGEX.test(column.name);
    return {
      columnId: column.id,
      columnName: column.name,
      inferredType: column.type,
      role: 'CATEGORY',
      roleLabel: getRoleLabel('CATEGORY'),
      confidence: uniqueCount <= 15 || isNameCat ? 'HIGH' : 'MEDIUM',
      confidenceLabel: uniqueCount <= 15 || isNameCat ? 'Tinggi' : 'Sedang',
      rationale: `Nilai diskrit berulang dengan kardinalitas rendah (${uniqueCount} kategori unik dari ${validCount.toLocaleString('id-ID')} observasi).`,
      evidence: {
        uniqueCount,
        uniquenessRatio,
        nullCount,
        nullRatio,
        isConstant: false,
        sampleValues: sampleValuesList,
        isNumeric: false,
        isDateTime: false,
      },
    };
  }

  // 7. Kasus Nama / Label Berdasarkan Pola Isi (Jika Headerless atau Nama Generik)
  if (
    column.type === 'Text' &&
    uniqueCount > 20 &&
    avgStrLength >= 3 &&
    avgStrLength <= 50 &&
    !allIntegersOfLength
  ) {
    return {
      columnId: column.id,
      columnName: column.name,
      inferredType: column.type,
      role: 'NAME_LABEL',
      roleLabel: getRoleLabel('NAME_LABEL'),
      confidence: 'MEDIUM',
      confidenceLabel: 'Sedang',
      rationale: `Teks diskrit dengan variasi nama atau entitas (${uniqueCount.toLocaleString('id-ID')} nilai unik).`,
      evidence: {
        uniqueCount,
        uniquenessRatio,
        nullCount,
        nullRatio,
        isConstant: false,
        sampleValues: sampleValuesList,
        isNumeric: false,
        isDateTime: false,
      },
    };
  }

  // 7. Kasus Khusus Numerik: Durasi, Mata Uang, Persentase, atau Metrik Umum
  if (isNumeric) {
    // Hanya klasifikasikan durasi jika ada bukti nama kolom spesifik
    if (isNamedHeader && DURATION_NAME_REGEX.test(column.name)) {
      return {
        columnId: column.id,
        columnName: column.name,
        inferredType: column.type,
        role: 'DURATION',
        roleLabel: getRoleLabel('DURATION'),
        confidence: 'HIGH',
        confidenceLabel: 'Tinggi',
        rationale: 'Nama kolom mengindikasikan besaran waktu atau durasi terukur.',
        evidence: {
          uniqueCount,
          uniquenessRatio,
          nullCount,
          nullRatio,
          isConstant: false,
          sampleValues: sampleValuesList,
          isNumeric: true,
          isDateTime: false,
        },
      };
    }

    // Hanya klasifikasikan mata uang jika ada bukti nama kolom spesifik
    if (isNamedHeader && CURRENCY_NAME_REGEX.test(column.name)) {
      return {
        columnId: column.id,
        columnName: column.name,
        inferredType: column.type,
        role: 'CURRENCY',
        roleLabel: getRoleLabel('CURRENCY'),
        confidence: 'HIGH',
        confidenceLabel: 'Tinggi',
        rationale: 'Nama kolom mengindikasikan nilai moneter atau finansial.',
        evidence: {
          uniqueCount,
          uniquenessRatio,
          nullCount,
          nullRatio,
          isConstant: false,
          sampleValues: sampleValuesList,
          isNumeric: true,
          isDateTime: false,
          isCurrencyPattern: true,
        },
      };
    }

    // Persentase
    if (isNamedHeader && PERCENTAGE_NAME_REGEX.test(column.name)) {
      return {
        columnId: column.id,
        columnName: column.name,
        inferredType: column.type,
        role: 'PERCENTAGE',
        roleLabel: getRoleLabel('PERCENTAGE'),
        confidence: 'HIGH',
        confidenceLabel: 'Tinggi',
        rationale: 'Nama kolom mengindikasikan nilai rasio atau persentase.',
        evidence: {
          uniqueCount,
          uniquenessRatio,
          nullCount,
          nullRatio,
          isConstant: false,
          sampleValues: sampleValuesList,
          isNumeric: true,
          isDateTime: false,
          isPercentagePattern: true,
        },
      };
    }

    // Metrik Numerik Umum (Akurat dan jujur: jangan berasumsi harga/durasi jika headerless)
    return {
      columnId: column.id,
      columnName: column.name,
      inferredType: column.type,
      role: 'NUMERIC_METRIC',
      roleLabel: getRoleLabel('NUMERIC_METRIC'),
      confidence: 'HIGH',
      confidenceLabel: 'Tinggi',
      rationale: 'Variabel terukur kontinu bertipe numerik dengan sebaran nilai kuantitatif.',
      evidence: {
        uniqueCount,
        uniquenessRatio,
        nullCount,
        nullRatio,
        isConstant: false,
        sampleValues: sampleValuesList,
        isNumeric: true,
        isDateTime: false,
      },
    };
  }

  // 8. Teks Bebas Panjang
  if (column.type === 'Text' && avgStrLength > 40) {
    return {
      columnId: column.id,
      columnName: column.name,
      inferredType: column.type,
      role: 'FREE_TEXT',
      roleLabel: getRoleLabel('FREE_TEXT'),
      confidence: 'HIGH',
      confidenceLabel: 'Tinggi',
      rationale: `String panjang dengan rata-rata ${Math.round(avgStrLength)} karakter per baris.`,
      evidence: {
        uniqueCount,
        uniquenessRatio,
        nullCount,
        nullRatio,
        isConstant: false,
        sampleValues: sampleValuesList,
        isNumeric: false,
        isDateTime: false,
      },
    };
  }

  // 9. Fallback Unknown
  return {
    columnId: column.id,
    columnName: column.name,
    inferredType: column.type,
    role: 'UNKNOWN',
    roleLabel: getRoleLabel('UNKNOWN'),
    confidence: 'LOW',
    confidenceLabel: 'Rendah',
    rationale: 'Bukti statistik dan pola nilai belum cukup untuk menentukan peran semantik spesifik.',
    evidence: {
      uniqueCount,
      uniquenessRatio,
      nullCount,
      nullRatio,
      isConstant: false,
      sampleValues: sampleValuesList,
      isNumeric,
      isDateTime,
    },
  };
}

/**
 * Mengklasifikasikan keluarga dataset (Dataset Family) secara heuristik
 * berdasarkan komposisi peran semantik kolom, kardinalitas, dan bukti struktural.
 */
export function inferDatasetFamily(
  dataset: Dataset,
  columnProfiles: readonly SemanticColumnProfile[],
  rowCount: number
): DatasetTypeInference {
  if (rowCount === 0 || columnProfiles.length === 0) {
    return {
      family: 'UNCLASSIFIED',
      label: 'Belum Dapat Dipastikan',
      description: 'Dataset kosong atau belum memiliki kolom yang cukup untuk dianalisis.',
      confidence: 'LOW',
      confidenceLabel: 'Rendah',
      supportingFactors: ['Jumlah baris observasi adalah 0.'],
      caveats: ['Unggah berkas dengan observasi data untuk mengaktifkan analisis intelligence.'],
    };
  }

  const hasHeader = dataset.hasHeader ?? true;
  const roles = columnProfiles.map((p) => p.role);
  const identifierCount = roles.filter((r) => r === 'IDENTIFIER').length;
  const categoryCount = roles.filter((r) => r === 'CATEGORY').length;
  const nameLabelCount = roles.filter((r) => r === 'NAME_LABEL').length;
  const dateTimeCount = roles.filter((r) => r === 'DATE_TIME').length;
  const numericCount = roles.filter((r) => r === 'NUMERIC_METRIC' || r === 'CURRENCY' || r === 'DURATION' || r === 'PERCENTAGE').length;
  const currencyCount = roles.filter((r) => r === 'CURRENCY').length;

  const supportingFactors: string[] = [];
  const caveats: string[] = [];

  if (!hasHeader) {
    caveats.push(
      'Dataset diimpor tanpa header (kolom generik Column 1-N). Klasifikasi didasarkan murni pada sebaran isi dan relasi tipe data.'
    );
  }

  // 1. TIME-SERIES DATA
  // Ciri khas: Memuat Tanggal/Waktu utama + satu atau lebih metrik numerik kontinu tanpa ID aktor.
  if (dateTimeCount >= 1 && numericCount >= 1 && identifierCount === 0 && categoryCount <= 2) {
    supportingFactors.push('Memuat sumbu waktu/tanggal observasi teratur.');
    supportingFactors.push(`Memuat ${numericCount} metrik numerik yang berfluktuasi seiring waktu.`);

    return {
      family: 'TIME_SERIES',
      label: 'Data Deret Waktu (Time-Series)',
      description:
        'Dataset melacak pergerakan satu atau beberapa metrik kuantitatif sepanjang garis kronologis waktu.',
      confidence: hasHeader ? 'HIGH' : 'MEDIUM',
      confidenceLabel: hasHeader ? 'Tinggi' : 'Sedang',
      supportingFactors,
      caveats,
    };
  }

  // 2. SURVEY / RESPONSE DATA
  // Ciri khas: Kolom pertanyaan/kuesioner/rating/skor atau mayoritas kolom kategori diskrit
  const hasSurveyCol = columnProfiles.some((p) =>
    /(^|_|\b)(survey|survei|question|pertanyaan|q[0-9]|feedback|rating|skor|score|respondent)($|_|\b)/i.test(p.columnName)
  );
  if (hasSurveyCol || (categoryCount >= 3 && categoryCount / columnProfiles.length >= 0.5)) {
    supportingFactors.push('Memuat kolom indikator kuesioner, pertanyaan, atau umpan balik responden.');
    supportingFactors.push(`Didominasi oleh variabel kategori pilihan ganda (${categoryCount} kolom).`);

    return {
      family: 'SURVEY_RESPONSES',
      label: 'Data Survei / Respons Kuesioner',
      description:
        'Dataset memuat kumpulan jawaban survei responden yang didominasi variabel pilihan ganda dan skala ordinal.',
      confidence: hasSurveyCol ? 'HIGH' : 'MEDIUM',
      confidenceLabel: hasSurveyCol ? 'Tinggi' : 'Sedang',
      supportingFactors,
      caveats,
    };
  }

  // 3. TRANSACTION DATA
  // Ciri khas: Currency / Amount, Tanggal/Waktu, dan ID Transaksi / Pelanggan.
  const hasTxCol = columnProfiles.some((p) =>
    /(^|_|\b)(order|tx|transaction|transaksi|invoice|payment|pembayaran|sale|penjualan)($|_|\b)/i.test(p.columnName)
  );
  if (
    hasTxCol ||
    (currencyCount >= 1 && dateTimeCount >= 1) ||
    (identifierCount >= 1 &&
      dateTimeCount >= 1 &&
      numericCount >= 1 &&
      !columnProfiles.some((p) => /(^|_|\b)(game|play|activity|aktivitas)($|_|\b)/i.test(p.columnName)))
  ) {
    supportingFactors.push('Memuat pencatatan nilai moneter atau kuantitas transaksi.');
    if (dateTimeCount >= 1) {
      supportingFactors.push('Memuat stempel waktu atau tanggal transaksi.');
    }
    if (identifierCount >= 1) {
      supportingFactors.push('Memuat kode identifikasi transaksi atau pelanggan.');
    }

    return {
      family: 'TRANSACTION',
      label: 'Data Transaksi / Finansial',
      description:
        'Dataset berorientasi transaksi bisnis yang mencatat pertukaran nilai, tanggal pesanan, atau mutasi finansial.',
      confidence: hasHeader ? 'HIGH' : 'MEDIUM',
      confidenceLabel: hasHeader ? 'Tinggi' : 'Sedang',
      supportingFactors,
      caveats,
    };
  }

  // 4. EVENT / ACTIVITY LOG
  // Ciri khas: Memuat ID aktor/pengguna (berulang), nama item/entitas yang diinteraksikan,
  // kategori aksi/tindakan (e.g. play/purchase), dan metrik waktu/kuantitas tanpa mata uang.
  const hasEventKeyword =
    /(^|_|\b)(event|log|activity|aktivitas|behavior|tindakan|play|game)($|_|\b)/i.test(dataset.name) ||
    columnProfiles.some((p) => /(^|_|\b)(action|behavior|aktivitas|tindakan|play|game)($|_|\b)/i.test(p.columnName));
  const hasRepeatingActorId = columnProfiles.some(
    (p) => p.role === 'IDENTIFIER' && p.evidence.uniquenessRatio < 0.95
  );
  const isMultiEventPattern =
    identifierCount >= 1 &&
    categoryCount >= 1 &&
    (numericCount >= 1 || nameLabelCount >= 1) &&
    hasRepeatingActorId &&
    currencyCount === 0;

  if (hasEventKeyword || isMultiEventPattern) {
    supportingFactors.push('Memuat kolom identifier (ID pengguna/aktor) dengan pola observasi berulang.');
    supportingFactors.push(`Memuat ${categoryCount} kolom kategori tindakan atau status aktivitas.`);
    if (nameLabelCount >= 1) {
      supportingFactors.push('Memuat nama entitas atau item yang menjadi objek interaksi.');
    }
    if (numericCount >= 1) {
      supportingFactors.push('Memuat metrik kuantitatif terkait besaran aktivitas.');
    }

    return {
      family: 'EVENT_LOG',
      label: 'Log Aktivitas / Event Log',
      description:
        'Dataset mencatat urutan riwayat interaksi atau event yang dilakukan oleh entitas pengguna terhadap item/layanan tertentu.',
      confidence: hasHeader ? 'HIGH' : 'MEDIUM',
      confidenceLabel: hasHeader ? 'Tinggi' : 'Sedang',
      supportingFactors,
      caveats,
    };
  }

  // 5. PRODUCT / CATALOG DATA
  // Ciri khas: Nama produk/item, kategori, dan metrik harga/stok tanpa ID pengguna/transaksi berulang.
  const hasProductCol =
    /(product|produk|catalog|katalog|sku|inventaris|inventory|stok|stock)/i.test(dataset.name) ||
    columnProfiles.some((p) =>
      /(^|_|\b)(product|produk|catalog|katalog|sku|inventaris|inventory|stok|stock)($|_|\b)/i.test(p.columnName)
    );
  if (
    hasProductCol ||
    (nameLabelCount >= 1 &&
      categoryCount >= 1 &&
      (currencyCount >= 1 || numericCount >= 1) &&
      !hasRepeatingActorId &&
      !columnProfiles.some((p) =>
        /(user|cust|pelanggan|member|action|behavior|play|order|tx|transaction|transaksi)/i.test(p.columnName)
      ))
  ) {
    supportingFactors.push('Memuat nama barang/item deskriptif.');
    supportingFactors.push('Memuat pengelompokan kategori produk dan metrik numerik.');

    return {
      family: 'PRODUCT_CATALOG',
      label: 'Katalog Produk / Inventaris',
      description:
        'Dataset memuat daftar katalog barang, layanan, atau inventaris yang terbagi dalam kategori dan spesifikasi terukur.',
      confidence: hasHeader ? 'HIGH' : 'MEDIUM',
      confidenceLabel: hasHeader ? 'Tinggi' : 'Sedang',
      supportingFactors,
      caveats,
    };
  }

  // 6. CUSTOMER / USER RECORDS
  // Ciri khas: ID unik bertingkat tinggi + atribut demografis/profil (nama, kategori status, kontak).
  // Hanya disimpulkan jika ada header pendukung yang relevan atau kontak demografis.
  const highUniqueId = columnProfiles.find((p) => p.role === 'IDENTIFIER' && p.evidence.uniquenessRatio >= 0.8);
  const hasCustomerCol = columnProfiles.some((p) =>
    /(^|_|\b)(user|cust|customer|pelanggan|member|anggota|profil|karyawan|employee|person|email|phone)($|_|\b)/i.test(p.columnName)
  );
  if (
    highUniqueId &&
    hasHeader &&
    (hasCustomerCol || (nameLabelCount >= 1 && categoryCount >= 1)) &&
    rowCount <= highUniqueId.evidence.uniqueCount * 1.5 &&
    !hasRepeatingActorId &&
    !columnProfiles.some((p) => /(action|behavior|play|aktivitas|tindakan)/i.test(p.columnName))
  ) {
    supportingFactors.push(`Kolom "${highUniqueId.columnName}" memiliki tingkat keunikan tinggi per baris.`);
    supportingFactors.push('Struktur baris merepresentasikan data profil satu entitas per record.');

    return {
      family: 'CUSTOMER_RECORDS',
      label: 'Data Profil Pelanggan / Entitas',
      description:
        'Dataset memuat daftar direktori entitas unik (seperti pengguna, anggota, atau pelanggan) beserta atribut individunya.',
      confidence: hasHeader ? 'HIGH' : 'MEDIUM',
      confidenceLabel: hasHeader ? 'Tinggi' : 'Sedang',
      supportingFactors,
      caveats,
    };
  }

  // 7. GENERAL TABULAR DATASET (Fallback Netral & Jujur)
  supportingFactors.push(`Memuat ${numericCount} variabel numerik dan ${categoryCount + nameLabelCount} variabel teks/kategori.`);
  supportingFactors.push('Distribusi kolom tidak menunjukkan tanda khas spesifik log event atau transaksi tunggal.');

  return {
    family: 'GENERAL_TABULAR',
    label: 'Dataset Tabular Umum',
    description:
      'Dataset tabel relasional standar yang memuat kombinasi atribut numerik dan kategorikal terstruktur.',
    confidence: 'MEDIUM',
    confidenceLabel: 'Sedang',
    supportingFactors,
    caveats,
  };
}

/**
 * Menghasilkan temuan-temuan penting (Key Findings) berdasarkan bukti numerik aktual
 * dari profiling dan sebaran data (misal: kolom konstan, missing values, duplikasi).
 */
export function generateDatasetFindings(
  dataset: Dataset,
  columnProfiles: readonly SemanticColumnProfile[],
  data: readonly Record<string, unknown>[]
): readonly DatasetFinding[] {
  const findings: DatasetFinding[] = [];
  const rowCount = dataset.rowCount;

  // 1. Temuan Kolom Konstan (Variasi Nol)
  const constantCols = columnProfiles.filter((p) => p.role === 'CONSTANT');
  for (const c of constantCols) {
    const valSample = c.evidence.sampleValues[0];
    findings.push({
      id: `finding-constant-${c.columnId}`,
      category: 'VARIATION',
      severity: 'WARNING',
      title: `Kolom Tanpa Variasi: ${c.columnName}`,
      description: `Kolom "${c.columnName}" bernilai identik ("${String(valSample ?? '')}") pada 100% dari ${rowCount.toLocaleString('id-ID')} baris observasi. Kolom ini tidak memiliki variansi diskriminatif.`,
      targetColumns: [c.columnName],
      numericalEvidence: {
        metricName: 'Kardinalitas Unik',
        value: 1,
        formattedValue: '1 nilai unik (100% observasi sama)',
      },
    });
  }

  // 2. Temuan Nilai Kosong Tinggi (> 20%)
  const highMissingCols = columnProfiles.filter((p) => p.evidence.nullRatio >= 0.2);
  for (const c of highMissingCols) {
    const pct = c.evidence.nullRatio * 100;
    findings.push({
      id: `finding-missing-${c.columnId}`,
      category: 'QUALITY',
      severity: pct >= 50 ? 'CRITICAL' : 'WARNING',
      title: `Tingkat Nilai Kosong Tinggi: ${c.columnName}`,
      description: `Kolom "${c.columnName}" memiliki ${pct.toFixed(1)}% nilai kosong (${c.evidence.nullCount.toLocaleString('id-ID')} dari ${rowCount.toLocaleString('id-ID')} baris). Pertimbangkan imputasi atau drop baris sebelum analisis mendalam.`,
      targetColumns: [c.columnName],
      numericalEvidence: {
        metricName: 'Persentase Missing',
        value: pct,
        formattedValue: `${pct.toFixed(1)}% (${c.evidence.nullCount.toLocaleString('id-ID')} baris kosong)`,
      },
    });
  }

  // 3. Temuan Ketimpangan Kategori (> 80% pada kategori dominan)
  const categoryCols = columnProfiles.filter((p) => p.role === 'CATEGORY' && p.evidence.uniqueCount >= 2 && p.evidence.uniqueCount <= 10);
  for (const c of categoryCols) {
    // Hitung frekuensi kategori dominan
    const colObj = dataset.columns.find((col) => col.id === c.columnId || col.name === c.columnName);
    if (!colObj) continue;

    const freqMap = new Map<string, number>();
    let validN = 0;
    for (let i = 0; i < data.length; i++) {
      const v = getCellValue(data[i], colObj);
      if (!isNativeMissing(v)) {
        const str = String(v).trim();
        freqMap.set(str, (freqMap.get(str) || 0) + 1);
        validN++;
      }
    }

    let topVal = '';
    let topCount = 0;
    for (const [k, count] of freqMap.entries()) {
      if (count > topCount) {
        topCount = count;
        topVal = k;
      }
    }

    const topRatio = validN > 0 ? topCount / validN : 0;
    if (topRatio >= 0.8 && validN >= 5) {
      findings.push({
        id: `finding-imbalance-${c.columnId}`,
        category: 'DISTRIBUTION',
        severity: 'INFO',
        title: `Distribusi Kategori Sangat Timpang: ${c.columnName}`,
        description: `Kategori "${topVal}" mendominasi ${(topRatio * 100).toFixed(1)}% dari seluruh observasi valid (${topCount.toLocaleString('id-ID')} dari ${validN.toLocaleString('id-ID')} baris).`,
        targetColumns: [c.columnName],
        numericalEvidence: {
          metricName: 'Dominasi Kategori Teratas',
          value: topRatio * 100,
          formattedValue: `"${topVal}" mencakup ${(topRatio * 100).toFixed(1)}%`,
        },
      });
    }
  }

  // 4. Temuan Kolom Identifier Tinggi
  const identifierCols = columnProfiles.filter((p) => p.role === 'IDENTIFIER');
  if (identifierCols.length > 0) {
    const idCol = identifierCols[0];
    findings.push({
      id: `finding-identifier-${idCol.columnId}`,
      category: 'STRUCTURE',
      severity: 'INFO',
      title: `Kolom Kunci / Identifier: ${idCol.columnName}`,
      description: `Kolom "${idCol.columnName}" memuat ${idCol.evidence.uniqueCount.toLocaleString('id-ID')} kode pengenal unik yang dapat digunakan untuk pelacakan entitas atau pengelompokan grup.`,
      targetColumns: [idCol.columnName],
      numericalEvidence: {
        metricName: 'Kardinalitas ID',
        value: idCol.evidence.uniqueCount,
        formattedValue: `${idCol.evidence.uniqueCount.toLocaleString('id-ID')} entitas unik`,
      },
    });
  }

  return findings;
}

/**
 * Menghasilkan rekomendasi analisis dan visualisasi praktis yang didukung penuh
 * oleh antarmuka dan mesin komputasi DataWise (Visualisasi, Analisis, Pembersihan).
 */
export function generateAnalysisRecommendations(
  dataset: Dataset,
  columnProfiles: readonly SemanticColumnProfile[]
): readonly AnalysisRecommendation[] {
  const recommendations: AnalysisRecommendation[] = [];

  const categoryCols = columnProfiles.filter((p) => p.role === 'CATEGORY');
  const numericCols = columnProfiles.filter((p) => p.role === 'NUMERIC_METRIC' || p.role === 'CURRENCY' || p.role === 'DURATION' || p.role === 'PERCENTAGE');
  const dateTimeCols = columnProfiles.filter((p) => p.role === 'DATE_TIME');
  const highMissingCols = columnProfiles.filter((p) => p.evidence.nullRatio > 0.1);
  const constantCols = columnProfiles.filter((p) => p.role === 'CONSTANT');

  // 1. Rekomendasi Bar Chart (Agregasi Kategori x Metrik Numerik)
  if (categoryCols.length > 0 && numericCols.length > 0) {
    const cat = categoryCols[0];
    const num = numericCols[0];
    recommendations.push({
      id: 'rec-bar-agg',
      type: 'CHART',
      title: `Bandingkan ${num.columnName} Berdasarkan ${cat.columnName}`,
      questionAnswered: `Bagaimana total atau rata-rata nilai "${num.columnName}" tersebar di antara kelompok "${cat.columnName}"?`,
      rationale: `Kombinasi kategori diskrit "${cat.columnName}" dan variabel terukur "${num.columnName}" sangat cocok dibandingkan dengan Bar Chart agregasi MEAN atau SUM.`,
      targetColumns: [cat.columnName, num.columnName],
      targetRoute: '/visualisasi',
      chartType: 'BAR',
      chartConfigSuggestion: {
        chartType: 'BAR',
        xColumn: cat.columnName,
        yColumn: num.columnName,
        aggregation: 'MEAN',
      },
    });
  } else if (categoryCols.length > 0) {
    const cat = categoryCols[0];
    recommendations.push({
      id: 'rec-bar-count',
      type: 'CHART',
      title: `Distribusi Frekuensi Kategori ${cat.columnName}`,
      questionAnswered: `Kategori apa yang paling banyak dan paling sedikit muncul dalam kolom "${cat.columnName}"?`,
      rationale: `Bar Chart frekuensi menampilkan kardinalitas dan ranking proporsi setiap grup secara visual.`,
      targetColumns: [cat.columnName],
      targetRoute: '/visualisasi',
      chartType: 'BAR',
      chartConfigSuggestion: {
        chartType: 'BAR',
        xColumn: cat.columnName,
        aggregation: 'COUNT',
      },
    });
  }

  // 2. Rekomendasi Histogram (Sebaran & Skewness Metrik)
  if (numericCols.length > 0) {
    const num = numericCols[0];
    recommendations.push({
      id: 'rec-histogram',
      type: 'CHART',
      title: `Analisis Sebaran Distribusi ${num.columnName}`,
      questionAnswered: `Apakah sebaran nilai "${num.columnName}" simetris (normal), menjulur (skewed), atau terdapat konsentrasi pada rentang tertentu?`,
      rationale: `Histogram 10-20 bins membantu mengidentifikasi modus data, nilai ekstrim, dan dispersi observasi numerik.`,
      targetColumns: [num.columnName],
      targetRoute: '/visualisasi',
      chartType: 'HISTOGRAM',
      chartConfigSuggestion: {
        chartType: 'HISTOGRAM',
        xColumn: num.columnName,
        bins: 10,
      },
    });
  }

  // 3. Rekomendasi Scatter Plot (Korelasi Bivariat)
  if (numericCols.length >= 2) {
    const num1 = numericCols[0];
    const num2 = numericCols[1];
    recommendations.push({
      id: 'rec-scatter',
      type: 'CHART',
      title: `Eksplorasi Korelasi: ${num1.columnName} vs ${num2.columnName}`,
      questionAnswered: `Apakah terdapat pola hubungan linier, pengelompokan klaster, atau korelasi antara "${num1.columnName}" dan "${num2.columnName}"?`,
      rationale: `Diagram pencar (Scatter Plot) menempatkan dua variabel numerik berdampingan untuk mendeteksi kecenderungan kovarians.`,
      targetColumns: [num1.columnName, num2.columnName],
      targetRoute: '/visualisasi',
      chartType: 'SCATTER',
      chartConfigSuggestion: {
        chartType: 'SCATTER',
        xColumn: num1.columnName,
        yColumn: num2.columnName,
      },
    });
  }

  // 4. Rekomendasi Line Chart (Tren Waktu)
  if (dateTimeCols.length > 0 && numericCols.length > 0) {
    const dt = dateTimeCols[0];
    const num = numericCols[0];
    recommendations.push({
      id: 'rec-line-time',
      type: 'CHART',
      title: `Tren Temporal ${num.columnName} Sepanjang Waktu`,
      questionAnswered: `Bagaimana dinamika fluktuasi nilai "${num.columnName}" seiring berjalannya waktu?`,
      rationale: `Line Chart menghubungkan titik observasi kronologis untuk mengungkap siklus musiman atau tren jangka panjang.`,
      targetColumns: [dt.columnName, num.columnName],
      targetRoute: '/visualisasi',
      chartType: 'LINE',
      chartConfigSuggestion: {
        chartType: 'LINE',
        xColumn: dt.columnName,
        yColumn: num.columnName,
      },
    });
  }

  // 5. Rekomendasi Analisis Deskriptif
  if (numericCols.length > 0) {
    recommendations.push({
      id: 'rec-stats-summary',
      type: 'ANALYSIS',
      title: 'Pemeriksaan Statistik Deskriptif Terpadu',
      questionAnswered: 'Berapa nilai pusat (Mean, Median), penyebaran (Std Dev, IQR), dan persentil kuartil untuk seluruh metrik numerik?',
      rationale: 'Modul Analisis menghitung 13 metrik numerik dengan koreksi Bessel dan kuartil Type-7 secara deterministik.',
      targetColumns: numericCols.map((c) => c.columnName).slice(0, 4),
      targetRoute: '/analisis',
    });
  }

  // 6. Rekomendasi Pembersihan Data
  if (highMissingCols.length > 0 || constantCols.length > 0) {
    const affected = [...highMissingCols, ...constantCols].map((c) => c.columnName);
    recommendations.push({
      id: 'rec-cleaning-action',
      type: 'CLEANING',
      title: 'Optimalisasi Dataset di Studio Pembersihan',
      questionAnswered: 'Bagaimana cara menangani nilai kosong atau menghapus kolom tanpa variasi agar dataset siap diproses?',
      rationale: 'Studio Pembersihan menyediakan operasi non-destruktif untuk imputasi missing values, drop duplicates, atau drop column konstan.',
      targetColumns: affected,
      targetRoute: '/pembersihan',
    });
  }

  return recommendations;
}

/**
 * Fungsi utama Dataset Intelligence Engine.
 * Menghasilkan kesimpulan tipe dataset, profil peran semantik setiap kolom,
 * temuan-temuan penting terukur, dan rekomendasi analisis yang relevan.
 */
export function analyzeDatasetIntelligence(
  dataset: Dataset,
  data: readonly Record<string, unknown>[]
): DatasetIntelligenceResult {
  const rowCount = dataset.rowCount;
  const columnCount = dataset.columns.length;
  const hasHeader = dataset.hasHeader ?? true;

  // 1. Profiling Peran Semantik Setiap Kolom
  const columnProfiles: SemanticColumnProfile[] = [];
  for (let c = 0; c < dataset.columns.length; c++) {
    const col = dataset.columns[c];
    // Ekstraksi nilai kolom untuk seluruh baris data
    const values: unknown[] = new Array(data.length);
    for (let r = 0; r < data.length; r++) {
      values[r] = getCellValue(data[r], col);
    }

    const profile = profileColumnSemantics(dataset, col, values);
    columnProfiles.push(profile);
  }

  // 2. Inferensi Tipe / Keluarga Dataset
  const typeInference = inferDatasetFamily(dataset, columnProfiles, rowCount);

  // 3. Temuan-Temuan Penting (Key Findings)
  const keyFindings = generateDatasetFindings(dataset, columnProfiles, data);

  // 4. Rekomendasi Analisis & Visualisasi Praktis
  const recommendations = generateAnalysisRecommendations(dataset, columnProfiles);

  return {
    datasetId: dataset.id,
    evaluatedAt: Date.now(),
    rowCount,
    columnCount,
    hasHeader,
    typeInference,
    columnProfiles,
    keyFindings,
    recommendations,
  };
}

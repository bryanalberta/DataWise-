#!/usr/bin/env python3
"""
scripts/generate-statistics-gold-standard.py
Generates independent ground-truth statistical metrics for DataWise using Python, NumPy, and Pandas.
This script produces `src/__tests__/fixtures/statistics-gold-standard.json`.

Ground-truth formulas:
- Linear Type-7 Quartiles (np.percentile with method='linear')
- Sample Variance & Sample Standard Deviation (ddof=1, Bessel's correction)
- Deterministic Multimodal Tie-breaking (sorted ascending)
- Strict "No Mode" rule when all observations are unique (maxFreq == 1 and N > 1)
- Categorical frequency distributions sorted by count desc, ties sorted alphabetically.
"""

import os
import json
import urllib.request
import math
import numpy as np
import pandas as pd

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "__tests__", "fixtures")
IRIS_PATH = os.path.join(FIXTURES_DIR, "iris.csv")
TITANIC_PATH = os.path.join(FIXTURES_DIR, "titanic.csv")
OUTPUT_JSON_PATH = os.path.join(FIXTURES_DIR, "statistics-gold-standard.json")

IRIS_URL = "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv"
TITANIC_URL = "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"


def ensure_directory():
    os.makedirs(FIXTURES_DIR, exist_ok=True)


def download_file(url: str, dest_path: str):
    if not os.path.exists(dest_path):
        print(f"Downloading authentic dataset from {url} to {dest_path}...")
        urllib.request.urlretrieve(url, dest_path)
        print(f"Saved {dest_path} ({os.path.getsize(dest_path)} bytes).")
    else:
        print(f"File already exists: {dest_path} ({os.path.getsize(dest_path)} bytes).")


def compute_numeric_gold_standard(values: list[float], missing_count: int) -> dict:
    n = len(values)
    if n == 0:
        return {
            "count": 0,
            "missing": missing_count,
            "sum": None,
            "mean": None,
            "median": None,
            "mode": None,
            "variance": None,
            "standardDeviation": None,
            "min": None,
            "max": None,
            "q1": None,
            "q3": None,
            "iqr": None
        }

    val_arr = np.array(values, dtype=np.float64)
    min_val = float(np.min(val_arr))
    max_val = float(np.max(val_arr))
    sum_val = float(np.sum(val_arr))
    mean_val = float(np.mean(val_arr))

    if n == 1:
        single_val = values[0]
        return {
            "count": 1,
            "missing": missing_count,
            "sum": single_val,
            "mean": single_val,
            "median": single_val,
            "mode": [single_val],
            "variance": None,
            "standardDeviation": None,
            "min": single_val,
            "max": single_val,
            "q1": single_val,
            "q3": single_val,
            "iqr": 0.0
        }

    # Linear Type-7 Quartiles (method='linear' in numpy)
    q1_val = float(np.percentile(val_arr, 25, method="linear"))
    median_val = float(np.percentile(val_arr, 50, method="linear"))
    q3_val = float(np.percentile(val_arr, 75, method="linear"))
    iqr_val = float(q3_val - q1_val)

    # Sample variance with ddof=1
    var_val = float(np.var(val_arr, ddof=1))
    std_val = float(np.std(val_arr, ddof=1))

    # Multimodal calculation
    freq_map = {}
    for v in values:
        freq_map[v] = freq_map.get(v, 0) + 1

    max_freq = max(freq_map.values())
    if max_freq == 1:
        mode_val = None
    else:
        modes = sorted([k for k, count in freq_map.items() if count == max_freq])
        mode_val = [float(m) for m in modes]

    return {
        "count": n,
        "missing": missing_count,
        "sum": sum_val,
        "mean": mean_val,
        "median": median_val,
        "mode": mode_val,
        "variance": var_val,
        "standardDeviation": std_val,
        "min": min_val,
        "max": max_val,
        "q1": q1_val,
        "q3": q3_val,
        "iqr": iqr_val
    }


def compute_categorical_gold_standard(values: list[str], missing_count: int) -> dict:
    n = len(values)
    if n == 0:
        return {
            "count": 0,
            "missing": missing_count,
            "uniqueCount": 0,
            "topValue": None,
            "topValueFrequency": None,
            "frequencies": []
        }

    freq_map = {}
    for v in values:
        freq_map[v] = freq_map.get(v, 0) + 1

    unique_count = len(freq_map)
    sorted_items = sorted(freq_map.items(), key=lambda item: (-item[1], item[0]))

    frequencies = [
        {
            "value": k,
            "count": cnt,
            "percentage": (cnt / n) * 100.0
        }
        for k, cnt in sorted_items
    ]

    top_val = frequencies[0]["value"]
    top_cnt = frequencies[0]["count"]

    return {
        "count": n,
        "missing": missing_count,
        "uniqueCount": unique_count,
        "topValue": top_val,
        "topValueFrequency": top_cnt,
        "frequencies": frequencies
    }


def generate_mathematical_fixtures():
    fixtures = {}

    # Fixture 1: Sequential [1, 2, 3, 4, 5]
    f1_vals = [1.0, 2.0, 3.0, 4.0, 5.0]
    fixtures["fixture_1_sequential_5"] = {
        "description": "Angka berurutan 1 sampai 5",
        "raw_data": f1_vals,
        "numericStats": compute_numeric_gold_standard(f1_vals, 0)
    }

    # Fixture 2: Even count [1, 2, 3, 4]
    f2_vals = [1.0, 2.0, 3.0, 4.0]
    fixtures["fixture_2_even_4"] = {
        "description": "Angka berjumlah genap 1 sampai 4",
        "raw_data": f2_vals,
        "numericStats": compute_numeric_gold_standard(f2_vals, 0)
    }

    # Fixture 3: Negative, zero, decimal [-10.5, -5.25, 0.0, 5.25, 10.5]
    f3_vals = [-10.5, -5.25, 0.0, 5.25, 10.5]
    fixtures["fixture_3_neg_zero_dec"] = {
        "description": "Nilai negatif, nol, dan desimal simetris",
        "raw_data": f3_vals,
        "numericStats": compute_numeric_gold_standard(f3_vals, 0)
    }

    # Fixture 4: Constant [42, 42, 42, 42, 42, 42]
    f4_vals = [42.0] * 6
    fixtures["fixture_4_constant"] = {
        "description": "Konstanta 6 observasi bernilai 42.0 (varians 0)",
        "raw_data": f4_vals,
        "numericStats": compute_numeric_gold_standard(f4_vals, 0)
    }

    # Fixture 5: Single sample [99.9]
    f5_vals = [99.9]
    fixtures["fixture_5_single_sample"] = {
        "description": "Sampel tunggal N = 1 bernilai 99.9",
        "raw_data": f5_vals,
        "numericStats": compute_numeric_gold_standard(f5_vals, 0)
    }

    # Fixture 6: With missing values [10, 20, 30] and 2 missing
    f6_vals = [10.0, 20.0, 30.0]
    fixtures["fixture_6_missing_values"] = {
        "description": "Data dengan missing values (3 valid, 2 missing)",
        "raw_data": f6_vals,
        "numericStats": compute_numeric_gold_standard(f6_vals, 2)
    }

    # Fixture 7: Multimodal ties [1, 1, 2, 2, 3]
    f7_vals = [1.0, 1.0, 2.0, 2.0, 3.0]
    fixtures["fixture_7_multimodal_ties"] = {
        "description": "Distribusi bimodal dengan seri [1.0, 2.0]",
        "raw_data": f7_vals,
        "numericStats": compute_numeric_gold_standard(f7_vals, 0)
    }

    # Fixture 8: All unique [10, 20, 30, 40]
    f8_vals = [10.0, 20.0, 30.0, 40.0]
    fixtures["fixture_8_all_unique"] = {
        "description": "Seluruh angka bernilai unik saat N > 1 (tidak ada modus)",
        "raw_data": f8_vals,
        "numericStats": compute_numeric_gold_standard(f8_vals, 0)
    }

    # Fixture 9: 100% missing (N = 0 valid, 3 missing)
    fixtures["fixture_9_all_missing"] = {
        "description": "Seluruh observasi missing (N = 0 valid)",
        "raw_data": [],
        "numericStats": compute_numeric_gold_standard([], 3)
    }

    # Fixture 10: Mixed magnitudes [1e-6, 2e-6, 3e-6, 4e-6, 5e-6]
    f10_vals = [1e-6, 2e-6, 3e-6, 4e-6, 5e-6]
    fixtures["fixture_10_small_magnitude"] = {
        "description": "Magnitudo kecil presisi tinggi (1e-6 s/d 5e-6)",
        "raw_data": f10_vals,
        "numericStats": compute_numeric_gold_standard(f10_vals, 0)
    }

    # Categorical fixture: Departments
    cat_vals = ["Teknologi", "Pemasaran", "Teknologi", "Keuangan", "Pemasaran", "Teknologi"]
    fixtures["fixture_categorical_depts"] = {
        "description": "Kategori departemen dengan tie-breaker frekuensi",
        "raw_data": cat_vals,
        "categoricalStats": compute_categorical_gold_standard(cat_vals, 1)
    }

    return fixtures


def generate_iris_gold_standard():
    df = pd.read_csv(IRIS_PATH)
    print(f"Iris loaded: {df.shape[0]} rows, {df.shape[1]} cols.")

    iris_stats = {
        "dataset": "iris",
        "totalRecords": len(df),
        "sourceUrl": IRIS_URL,
        "provenance": "Ronald A. Fisher (1936) / UCI / Seaborn canonical repository",
        "columns": {}
    }

    numeric_cols = ["sepal_length", "sepal_width", "petal_length", "petal_width"]
    for col in numeric_cols:
        series = df[col].dropna()
        missing_count = int(df[col].isna().sum())
        vals = [float(x) for x in series.tolist()]
        iris_stats["columns"][col] = {
            "type": "Numeric",
            "numericStats": compute_numeric_gold_standard(vals, missing_count)
        }

    # Categorical: species
    cat_col = "species"
    series = df[cat_col].dropna()
    missing_count = int(df[cat_col].isna().sum())
    vals = [str(x) for x in series.tolist()]
    iris_stats["columns"][cat_col] = {
        "type": "Categorical",
        "categoricalStats": compute_categorical_gold_standard(vals, missing_count)
    }

    return iris_stats


def generate_titanic_gold_standard():
    df = pd.read_csv(TITANIC_PATH)
    print(f"Titanic loaded: {df.shape[0]} rows, {df.shape[1]} cols.")

    titanic_stats = {
        "dataset": "titanic",
        "totalRecords": len(df),
        "sourceUrl": TITANIC_URL,
        "provenance": "British Board of Trade enquiry / Kaggle / Data Science Dojo archive",
        "columns": {}
    }

    # Numeric continuous/discrete columns
    numeric_cols = ["Age", "Fare", "SibSp", "Parch"]
    for col in numeric_cols:
        series = df[col].dropna()
        missing_count = int(df[col].isna().sum())
        vals = [float(x) for x in series.tolist()]
        titanic_stats["columns"][col] = {
            "type": "Numeric",
            "numericStats": compute_numeric_gold_standard(vals, missing_count)
        }

    # Categorical columns
    categorical_cols = ["Sex", "Embarked", "Pclass", "Survived"]
    for col in categorical_cols:
        series = df[col].dropna()
        missing_count = int(df[col].isna().sum())
        vals = [str(x) for x in series.tolist()]
        titanic_stats["columns"][col] = {
            "type": "Categorical",
            "categoricalStats": compute_categorical_gold_standard(vals, missing_count)
        }

    # Identifier columns (explicitly documented as identifiers - not subjected to numeric mean)
    identifier_cols = ["PassengerId", "Name", "Ticket", "Cabin"]
    for col in identifier_cols:
        series = df[col].dropna()
        missing_count = int(df[col].isna().sum())
        titanic_stats["columns"][col] = {
            "type": "Text",
            "isIdentifier": True,
            "totalCount": len(df),
            "missingCount": missing_count,
            "validCount": len(series)
        }

    return titanic_stats


def main():
    ensure_directory()
    download_file(IRIS_URL, IRIS_PATH)
    download_file(TITANIC_URL, TITANIC_PATH)

    print("Generating mathematical fixtures ground truth...")
    math_fixtures = generate_mathematical_fixtures()

    print("Generating Iris gold standard...")
    iris_gold = generate_iris_gold_standard()

    print("Generating Titanic gold standard...")
    titanic_gold = generate_titanic_gold_standard()

    gold_standard = {
        "metadata": {
            "generatedAt": "2026-10-11T20:38:00Z",
            "pythonVersion": "3.13.2",
            "numpyVersion": np.__version__,
            "pandasVersion": pd.__version__,
            "methodology": "NumPy percentile method='linear' (Type-7), ddof=1 sample variance/std, deterministic multimodal ties",
            "tolerancePolicy": {
                "atol": 1e-5,
                "rtol": 1e-5,
                "discrete": "exact"
            }
        },
        "mathematical_fixtures": math_fixtures,
        "iris": iris_gold,
        "titanic": titanic_gold
    }

    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(gold_standard, f, indent=2, ensure_ascii=False)

    print(f"Successfully generated gold standard fixture at: {OUTPUT_JSON_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_JSON_PATH)} bytes.")


if __name__ == "__main__":
    main()

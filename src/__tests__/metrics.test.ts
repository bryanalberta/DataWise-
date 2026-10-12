import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateMemoryUsage, determineIntegrityStatus } from '../lib/metrics';

describe('Dataset Metrics Calculator (FND-04)', () => {

  describe('Estimasi Penggunaan Memori', () => {
    it('1. Dataset kosong (0 baris atau data array kosong) mengembalikan 0', () => {
      assert.equal(estimateMemoryUsage([], 0), 0);
      assert.equal(estimateMemoryUsage([{ a: 1 }], 0), 0);
      assert.equal(estimateMemoryUsage([], 100), 0);
    });

    it('7. Perhitungan atau estimasi memori dengan input berukuran berbeda', () => {
      // Baris kecil
      const smallRow = { id: 1 }; // key "id" = 2 chars. value = number
      // bytes = 24 (overhead) + (16 + 2*2) (key) + 8 (value) = 52
      // avg = 52.  total = (52 + 8) * 1 = 60 bytes
      const memSmall = estimateMemoryUsage([smallRow], 1);
      assert.ok(memSmall > 0);

      // Baris besar
      const largeRow = { id: 1, long_text_field: 'A very long string that should consume more memory than the small row above' };
      const memLarge = estimateMemoryUsage([largeRow], 1);
      assert.ok(memLarge > memSmall, 'Baris besar harus memiliki estimasi memori lebih besar dari baris kecil');

      // 10 baris
      const memLarge10 = estimateMemoryUsage([largeRow], 10);
      assert.equal(memLarge10, memLarge * 10, 'Estimasi memori diekstrapolasi sesuai rowCount');
    });

    it('8. Perbedaan antara ukuran file sumber dan estimasi data terparse', () => {
      // Ini lebih ke konseptual, tapi kita bisa memastikan estimasinya wajar
      const sample = [{ name: 'Alice', age: 30 }];
      const memory = estimateMemoryUsage(sample, 1000);
      
      // Ukuran CSV aslinya mungkin `name,age\nAlice,30\n...` sekitar 15 bytes per baris.
      // Di memori V8, object overhead jauh lebih besar dari 15 bytes.
      assert.ok(memory > 15 * 1000, 'Estimasi memori harus merepresentasikan struktur V8, bukan panjang string statis semata');
    });
  });

  describe('Status Integritas File', () => {
    it('9. Status valid, warning, invalid, atau unknown sesuai hasil validasi', () => {
      // VALID: ada baris & kolom, tidak ada warning parsing
      assert.equal(determineIntegrityStatus(100, 5, 0), 'VALID');

      // WARNING: ada baris & kolom, tapi ada warning dari parser
      assert.equal(determineIntegrityStatus(100, 5, 2), 'WARNING');

      // INVALID: baris atau kolom = 0
      assert.equal(determineIntegrityStatus(0, 5, 0), 'INVALID');
      assert.equal(determineIntegrityStatus(100, 0, 0), 'INVALID');

      // UNKNOWN: baris dan kolom 0 (misalnya state awal)
      assert.equal(determineIntegrityStatus(0, 0, 0), 'UNKNOWN');
    });

    it('10. Error atau metadata yang tidak tersedia (ditangani sebagai unknown/invalid)', () => {
      assert.equal(determineIntegrityStatus(0, 0, 0), 'UNKNOWN');
      // Jika error, akan me-throw atau membuat rowCount = 0
      assert.equal(determineIntegrityStatus(0, 0, 1), 'INVALID');
    });
  });
});

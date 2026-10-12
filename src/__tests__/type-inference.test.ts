import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferColumnTypes, isIdentifierColumn } from '../lib/type-inference';

describe('Type Inference Engine (FND-05)', () => {
  it('1. Bilangan bulat', () => {
    const data = [{ a: '10' }, { a: '20' }, { a: '-5' }, { a: '0' }];
    const res = inferColumnTypes(['a'], data);
    assert.equal(res[0].type, 'Numeric');
  });

  it('2. Angka desimal titik', () => {
    const data = [{ b: '10.5' }, { b: '20.123' }, { b: '-5.0' }, { b: '0.01' }];
    const res = inferColumnTypes(['b'], data);
    assert.equal(res[0].type, 'Numeric');
  });

  it('3. Angka desimal koma & 4. Pemisah ribuan regional', () => {
    const data = [{ c: '10,5' }, { c: '1.234,56' }, { c: '-5,0' }, { c: '0,01' }];
    const res = inferColumnTypes(['c'], data);
    assert.equal(res[0].type, 'Numeric');
    assert.equal(res[0].profile?.regionalFormat, 'Decimal Comma');
  });

  it('5. Boolean true dan false', () => {
    const data = [{ d: 'true' }, { d: 'False' }, { d: 'TRUE' }, { d: 'false' }];
    const res = inferColumnTypes(['d'], data);
    assert.equal(res[0].type, 'Boolean');
  });

  it('6. Boolean yes dan no', () => {
    const data = [{ e: 'yes' }, { e: 'No' }, { e: 'YES' }, { e: 'no' }];
    const res = inferColumnTypes(['e'], data);
    assert.equal(res[0].type, 'Boolean');
  });

  it('7. Boolean 1 dan 0', () => {
    const data = [{ f: '1' }, { f: '0' }, { f: '1' }, { f: '0' }];
    const res = inferColumnTypes(['f'], data);
    assert.equal(res[0].type, 'Boolean');
  });

  it('8. Kolom yang berisi kombinasi numerik dan teks (Fallback ke Text)', () => {
    const data = [{ g: '10' }, { g: '20' }, { g: 'abc' }, { g: '30' }];
    const res = inferColumnTypes(['g'], data);
    // Hanya 75% numeric, batas adalah 90%
    assert.equal(res[0].type, 'Text');
  });

  it('9. Tanggal ISO', () => {
    const data = [{ h: '2023-01-01' }, { h: '2023-12-31T23:59:59Z' }];
    const res = inferColumnTypes(['h'], data);
    assert.equal(res[0].type, 'DateTime');
  });

  it('10. Tanggal DD/MM/YYYY yang tidak ambigu', () => {
    const data = [{ i: '31/01/2023' }, { i: '15/02/2023' }]; // 31 > 12 (DD)
    const res = inferColumnTypes(['i'], data);
    assert.equal(res[0].type, 'DateTime');
  });

  it('11. Tanggal MM/DD/YYYY yang tidak ambigu', () => {
    const data = [{ j: '01/31/2023' }, { j: '02/15/2023' }]; // 31 > 12 (MM)
    const res = inferColumnTypes(['j'], data);
    assert.equal(res[0].type, 'DateTime');
  });

  it('12. Tanggal ambigu yang harus dipertahankan sebagai Text', () => {
    const data = [{ k: '01/02/2023' }, { k: '12/12/2023' }]; // Semua bisa DD/MM atau MM/DD
    const res = inferColumnTypes(['k'], data);
    assert.equal(res[0].type, 'Text');
    assert.equal(res[0].profile?.formatWarning, 'Ambiguous Date Format (DD/MM vs MM/DD)');
  });

  it('13. Tanggal tidak valid', () => {
    const data = [{ l: '32/01/2023' }, { l: '99/99/2023' }]; // Out of bounds
    const res = inferColumnTypes(['l'], data);
    assert.equal(res[0].type, 'Text');
  });

  it('14. Teks biasa', () => {
    const data = [{ m: 'Hello' }, { m: 'World' }];
    const res = inferColumnTypes(['m'], data);
    assert.equal(res[0].type, 'Text');
  });

  it('15. Kategori berulang (tetap Text di scope inferensi, bukan Categorical khusus karena fallback)', () => {
    const data = [{ n: 'A' }, { n: 'B' }, { n: 'A' }, { n: 'B' }];
    const res = inferColumnTypes(['n'], data);
    assert.equal(res[0].type, 'Text'); // PRD fallback is Text, not automatically Categorical for now unless distinct count is checked.
  });

  it('16. ID unik & 17. Nama kolom mengandung identifier (QA-03-FINAL)', () => {
    // 1. Verifikasi fungsi isIdentifierColumn untuk nama kolom target QA-03
    assert.equal(isIdentifierColumn('PassengerId'), true, 'PassengerId must be recognized as identifier');
    assert.equal(isIdentifierColumn('userId'), true, 'userId must be recognized as identifier');
    assert.equal(isIdentifierColumn('customerID'), true, 'customerID must be recognized as identifier');
    assert.equal(isIdentifierColumn('user_id'), true, 'user_id must be recognized as identifier');
    assert.equal(isIdentifierColumn('id'), true, 'id must be recognized as identifier');
    assert.equal(isIdentifierColumn('IdMember'), true, 'IdMember must be recognized as identifier');

    // 2. Verifikasi kata biasa tidak keliru diklasifikasikan sebagai identifier
    assert.equal(isIdentifierColumn('solid'), false, 'solid must NOT be recognized as identifier');
    assert.equal(isIdentifierColumn('valid'), false, 'valid must NOT be recognized as identifier');
    assert.equal(isIdentifierColumn('idea'), false, 'idea must NOT be recognized as identifier');

    // 3. Verifikasi kata kunci identifier lain yang didukung tetap berfungsi
    assert.equal(isIdentifierColumn('zip_code'), true, 'zip_code must be recognized');
    assert.equal(isIdentifierColumn('postal'), true, 'postal must be recognized');
    assert.equal(isIdentifierColumn('nik'), true, 'nik must be recognized');
    assert.equal(isIdentifierColumn('phone_number'), true, 'phone_number must be recognized');
    assert.equal(isIdentifierColumn('nomor_telepon'), true, 'nomor_telepon must be recognized');

    // 4. Verifikasi perilaku end-to-end melalui inferColumnTypes
    // Kolom identifier dengan data numerik harus tetap Text
    const idData = [{ PassengerId: '1', userId: '10', customerID: '100', IdMember: '99' }];
    const idRes = inferColumnTypes(['PassengerId', 'userId', 'customerID', 'IdMember'], idData);
    for (const schema of idRes) {
      assert.equal(schema.type, 'Text');
      assert.equal(schema.profile?.isIdentifier, true);
    }

    // Kolom non-identifier dengan data numerik harus terinferensi sebagai Numeric
    const nonIdData = [{ solid: '10.5', valid: '20', idea: '300' }];
    const nonIdRes = inferColumnTypes(['solid', 'valid', 'idea'], nonIdData);
    assert.equal(nonIdRes[0].type, 'Numeric', 'solid with numbers must be Numeric');
    assert.equal(nonIdRes[1].type, 'Numeric', 'valid with numbers must be Numeric');
    assert.equal(nonIdRes[2].type, 'Numeric', 'idea with numbers must be Numeric');
    assert.equal(nonIdRes[0].profile?.isIdentifier, undefined);
    assert.equal(nonIdRes[1].profile?.isIdentifier, undefined);
    assert.equal(nonIdRes[2].profile?.isIdentifier, undefined);
  });

  it('18. Nilai dengan leading zero (Identifier)', () => {
    const data = [{ x: '0123' }, { x: '0456' }];
    const res = inferColumnTypes(['x'], data);
    assert.equal(res[0].type, 'Text');
    assert.equal(res[0].profile?.isIdentifier, true);
  });

  it('19. Kolom yang sebagian besar kosong', () => {
    // 90% kosong, 10% numeric.
    const data = Array.from({ length: 100 }, (_, i) => ({ y: i < 10 ? '1' : '' }));
    const res = inferColumnTypes(['y'], data);
    assert.equal(res[0].type, 'Boolean'); // '1' matches boolean
    assert.equal(res[0].profile?.confidenceScore, 100); // 10 out of 10 non-empty are '1'
  });

  it('20. Kolom campuran di dekat ambang persentase', () => {
    // 89 angka, 11 string acak (100 total) -> rate 0.89 -> fallback to Text
    const data = Array.from({ length: 100 }, (_, i) => ({ z: i < 89 ? '123' : 'abc' }));
    const res = inferColumnTypes(['z'], data);
    assert.equal(res[0].type, 'Text');

    // 90 angka, 10 string acak -> rate 0.90 -> Numeric
    const data2 = Array.from({ length: 100 }, (_, i) => ({ z: i < 90 ? '123' : 'abc' }));
    const res2 = inferColumnTypes(['z'], data2);
    assert.equal(res2[0].type, 'Numeric');
  });
});

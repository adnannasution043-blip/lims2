// Syarat data lengkap sebelum Finalisasi: Pengecekan Spesimen & Lembar Hasil Uji (lib/completeness.js).
const assert = require('assert');
const { specimenSheetProblems, testReportProblems } = require('../lib/completeness');

// ----- Pengecekan Spesimen -----
const bendRow = (over = {}) => ({
  marking_specimen: 'ABN.9.1-BR1', type_lt: 'T', accepted: 'Y',
  measurements: { width_actual: '38', thickness_actual: '10', radius_actual: '1', length_actual: '200', ...over }
});
const sheet = { category: 'bending', shape: 'flat', inspection_date: '2026-10-20', inspected_by_name: 'Andi' };

assert.deepStrictEqual(specimenSheetProblems(sheet, [bendRow()]), []);
let p = specimenSheetProblems({ category: 'bending', shape: 'flat' }, []);
assert.ok(p.includes('Tanggal pemeriksaan belum diisi'));
assert.ok(p.includes('Nama pemeriksa (Inspected By) belum diisi'));
assert.ok(p.includes('Belum ada baris spesimen'));
p = specimenSheetProblems(sheet, [bendRow({ thickness_actual: ' ' }), { ...bendRow(), marking_specimen: '', accepted: '' }]);
assert.deepStrictEqual(p, ['Spesimen ABN.9.1-BR1: Thickness (Actual)', 'Baris 2: Marking Specimen, Accepted Y/N']);
// Bend round: tanpa Thickness/Radius
assert.deepStrictEqual(specimenSheetProblems({ ...sheet, shape: 'round' }, [{ marking_specimen: 'X1', accepted: 'N', measurements: { diameter_actual: '12', length_actual: '150' } }]), []);

// Tensile: 3 titik ukur wajib, tanpa Accepted
const tnM = { gauge_length_actual: '50', width_actual: '12.5', thickness_actual: '10', radius_actual: '12', reduce_section_actual: '60', total_length_actual: '200' };
const tnSheet = { ...sheet, category: 'tensile' };
assert.deepStrictEqual(specimenSheetProblems(tnSheet, [{ marking_specimen: 'T1', measurements: { ...tnM, points: [{ width: '12', thickness: '10' }, { width: '12', thickness: '10' }, { width: '12', thickness: '10' }] } }]), []);
p = specimenSheetProblems(tnSheet, [{ marking_specimen: 'T1', measurements: { ...tnM, points: [{ width: '12', thickness: '' }] } }]);
assert.deepStrictEqual(p, ['Spesimen T1: 3 Point Measurement']);

// Charpy: Location & V-Notch
p = specimenSheetProblems({ ...sheet, category: 'charpy' }, [{ marking_specimen: 'C1', accepted: 'Y', location: '', measurements: { length_actual: '55', width_actual: '10', thickness_actual: '10', v_notch_l: '27.5' } }]);
assert.deepStrictEqual(p, ['Spesimen C1: Location, Center V-Notch']);

// General: cukup satu ukuran Actual
assert.deepStrictEqual(specimenSheetProblems({ ...sheet, category: 'general' }, [{ marking_specimen: 'H1', accepted: 'Y', measurements: { width_actual: '20' } }]), []);
assert.deepStrictEqual(specimenSheetProblems({ ...sheet, category: 'general' }, [{ marking_specimen: 'H1', accepted: 'Y', measurements: {} }]), ['Spesimen H1: minimal satu ukuran Actual']);

// daftar panjang diringkas
p = specimenSheetProblems(sheet, Array.from({ length: 10 }, () => ({ marking_specimen: '', measurements: {} })));
assert.strictEqual(p.length, 7);
assert.ok(/dan 4 kekurangan lainnya/.test(p[6]));

// ----- Lembar Hasil Uji -----
const head = { date_tested: '2026-10-20', test_conducted_by: 'Budi' };
// isian bawaan (marking, observation) tidak dihitung sebagai data
p = testReportProblems({ kind: 'bending', template: 'bend-sec', body: { ...head, rows: [{ marking_specimen: 'BR1', observation: 'No Open Discontinuity was Observed', result: '' }] } });
assert.deepStrictEqual(p, ['Belum ada data hasil pengujian yang diisi']);
p = testReportProblems({ kind: 'bending', template: 'bend-sec', body: { ...head, rows: [{ marking_specimen: 'BR1', result: 'accepted' }, { marking_specimen: 'BR2', result: '' }] } });
assert.deepStrictEqual(p, ['Spesimen BR2: Result belum dipilih']);
// Charpy: Impact per spesimen
p = testReportProblems({ kind: 'charpy', body: { ...head, rows: [{ marking_specimen: 'C1', notch_position: 'WM', impact: '120' }, { marking_specimen: 'C2', notch_position: 'WM', impact: '' }] } });
assert.deepStrictEqual(p, ['Spesimen C2: Impact Energy belum diisi']);
// Tensile
p = testReportProblems({ kind: 'tn', body: { ...head, rows: [{ marking_specimen: 'T1', kind: 'Tensile', load: '', tensile: '' }] } });
assert.deepStrictEqual(p, ['Belum ada data hasil pengujian yang diisi']);
// form berbasis isian (Chemical): unsur terisi = ada data; tidak wajib Result per baris
assert.deepStrictEqual(testReportProblems({ kind: 'chemical', template: 'chem-mat-cs', body: { ...head, rows: [{ marking_specimen: 'X', result: '' }], fields: { elements: { C: '0.12' } } } }), []);
// form foto (Salt Spray / SEM): foto terunggah = ada data
assert.deepStrictEqual(testReportProblems({ kind: 'pset', template: 'salt', body: { ...head, rows: [{ marking_specimen: 'S1' }], fields: {} }, photoCount: 2 }), []);
// header wajib
p = testReportProblems({ kind: 'charpy', body: { rows: [{ marking_specimen: 'C1', impact: '100' }] } });
assert.deepStrictEqual(p, ['Date of Tested belum diisi', 'Test Conducted By belum diisi']);

console.log('completeness OK');

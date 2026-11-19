// Penjaga revisi klien yang sebelumnya belum punya tes otomatis (audit 2026-11-18). Tiap blok menyebut asal revisinya
// (PDF "Permintaan Perbaikan Aplikasi form Report" / revisi lewat chat) supaya jelas apa yang dijaga.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { renderTemplateReportHtml: R, hasTemplate } = require('../lib/testReportTemplatePrint');
const { loadTemplate } = require('../lib/reportTemplate');
const { renderWorkOrderPrintHtml } = require('../lib/workOrderPrintView');

const KEYS = fs.readdirSync(path.join(__dirname, '..', 'lib', 'reportTemplates')).map(f => f.replace('.json', ''));
const base = { test_request: { job_number: 'DE.1' }, fields: {}, coupon: { coupon_type: ['Plate'] } };
// gaya huruf (CSS kelas sel) dari sel yang memuat teks tertentu
function fontOf(html, text) {
  const i = html.indexOf('>' + text + '<');
  assert.ok(i > 0, 'teks ' + text + ' tercetak');
  const cls = /class="(s\d+)"/.exec(html.slice(html.lastIndexOf('<td', i), i))[1];
  const rule = new RegExp('\\.' + cls + '\\{([^}]*)\\}').exec(html)[1];
  return rule.split(';').filter(p => /^font-(family|size)/.test(p)).sort().join(';');
}

// PDF koreksi: "Ukuran Logo Detech dan KAN tidak seragam di setiap jenis report"
{
  const sizes = new Set();
  KEYS.forEach(k => (loadTemplate(k).images || []).filter(im => im.y < 120 && im.w > 120).forEach(im => sizes.add(im.w + 'x' + im.h)));
  assert.deepStrictEqual([...sizes].sort(), ['209x79', '215x53'], 'logo kepala form seragam: DETECH 215x53, KAN 209x79');
}

// PDF koreksi: "Tanpa jarak seperti Test Conduct dan Witness by" (baris S/N kosong di bawah Testing Machine tidak dicetak)
// dan "jenis font berbeda" (isian Witnessed By / Testing Machine mengikuti huruf Test Conducted by)
{
  const r = { ...base, template: 'micro-mat', test_name: 'Microstructure / Metallography', rows: [{ marking_specimen: 'A' }],
    witnessed_by: 'WITNAME', test_conducted_by: 'CONNAME' };
  const withMachine = R({ ...r, testing_machine: 'MACHNAME' });
  assert.ok(!withMachine.includes('S/N : '), 'S/N contoh bawaan form tidak tercetak saat alat dipilih');
  // form tanpa gambar di bawah baris alat (Tensile, Hardness): baris S/N kosong ikut dihapus agar Remarks langsung di bawahnya
  ['tn-red', 'hard-mat'].forEach(t => {
    const x = { ...base, template: t, test_name: 'X', rows: [{ marking_specimen: 'A' }] };
    assert.ok((R({ ...x, testing_machine: 'MACH' }).match(/<tr/g) || []).length < (R(x).match(/<tr/g) || []).length, t + ': baris S/N kosong tidak dicetak');
  });
  assert.strictEqual(fontOf(withMachine, 'WITNAME'), fontOf(withMachine, 'CONNAME'), 'huruf Witnessed By = Test Conducted by');
  assert.strictEqual(fontOf(withMachine, 'MACHNAME'), fontOf(withMachine, 'CONNAME'), 'huruf Testing Machine = Test Conducted by');
}

// PDF koreksi: "Spacing antar baris agar lebih rapat" (catatan form berbaris CRLF dulu tercetak berjarak ganda)
KEYS.filter(hasTemplate).forEach(k => {
  const html = R({ ...base, template: k, test_name: 'X', rows: [{}] });
  assert.ok(!/\r/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), k + ': tidak ada CR tersisa (jarak baris ganda)');
});

// PDF koreksi: "Nama unsur yg muncul ... yang ter report hanya yang diisi saja"
{
  const html = R({ ...base, template: 'chem-mat-cs', test_name: 'Chemical Composition Test', rows: [{}], fields: { elements: { C: '0.18', Cr: '0.95' } } });
  assert.ok(html.includes('>C<') && html.includes('>Cr<') && html.includes('>0.95<'));
  ['Mn', 'Si', 'Ni', 'Mo'].forEach(el => assert.ok(!html.includes('>' + el + '<'), 'unsur kosong ' + el + ' tidak dicetak'));
}

// PDF koreksi: "posisi teks dan gambar bertabrakan" (keterangan foto Corrosion di bawah kotak foto, bukan menimpanya)
KEYS.filter(k => /^corr-/.test(k)).forEach(k => {
  const t = loadTemplate(k);
  const texts = (t.shapes || []).filter(sh => sh.type === 'text');
  (t.slots || []).forEach(sl => {
    texts.filter(sh => { const cx = sh.x + sh.w / 2; return cx > sl.x && cx < sl.x + sl.w && sh.y > sl.y + sl.h / 2 && sh.y < sl.y + sl.h + 80; })
      .forEach(cap => assert.ok(cap.y >= sl.y + sl.h, `${k}: keterangan "${cap.text || ''}" di bawah foto ${sl.id}`));
  });
});

// PDF koreksi: "Lembar Bisa Dirubah Menjadi Landscape" (Work Order)
{
  const html = renderWorkOrderPrintHtml({ test_request: { job_number: 'DE.1' }, coupon_tests: [] });
  assert.ok(/@page\s*\{\s*size:\s*A4 landscape/.test(html), 'Work Order dicetak A4 landscape');
}

// Chat (9 Nov): Project Name panjang -> titik dua turun; (13 Nov): isian panjang dipecah baris, bukan dikecilkan
{
  const project = 'Pengadaan Bolt & Nut Nomor : 4110106061, Proyek Pembangunan Jetty 1 Baru di Integrated Terminal Manggis.';
  const html = R({ ...base, template: 'tn-red', test_name: 'Tensile Test', rows: [{ marking_specimen: 'A' }], test_request: { job_number: 'DE.1', project_name: project } });
  const i = html.indexOf('Pengadaan Bolt');
  const td = html.slice(html.lastIndexOf('<td', i), i);
  const tr = html.slice(html.lastIndexOf('<tr', i), i);
  assert.ok(!/font-size/.test(td), 'Project Name tidak dikecilkan');
  assert.ok(/rt-multi/.test(tr), 'baris Project Name rata atas (label & titik dua sejajar baris pertama)');
  assert.ok(!html.slice(i, i + 400).includes('Manggis.') || html.slice(i, i + 400).includes('<br'), 'Project Name dipecah beberapa baris');
}

// Chat (16 Nov): Hardness Material bisa dicustom seperti Weld (tambah line & titik)
{
  const pattern = { id: null, name: 'Susunan khusus', kind: 'material', sketch: '', lines: ['Line 1', 'Line 2'], zones: [{ name: 'Surface', points: 4 }, { name: 'Core', points: 7 }] };
  const html = R({ ...base, template: 'hard-mat', test_name: 'Hardness Test', rows: [{}],
    fields: { pattern, hardness: { lines: [['97.5'], ['98.0', '', '', '', '', '', '', '', '', '', '99.9']] } } });
  assert.ok(html.includes('>Line 2<') && html.includes('>Surface<') && html.includes('>Core<') && html.includes('>11<'), 'tabel mengikuti susunan khusus');
  assert.ok(html.includes('>97.5<') && html.includes('>99.9<'), 'nilai line 1 & titik ke-11 line 2 tercetak');
}

// 19 Nov: teks form "terisi tapi bisa diubah" - Type of Test di semua form & catatan metode Ferrite
{
  const { formDefaults } = require('../lib/testReportTemplatePrint');
  KEYS.filter(hasTemplate).forEach(k => {
    const d = formDefaults(k);
    assert.ok(d.type_test, k + ': ada teks Type of Test bawaan');
    const same = R({ ...base, template: k, test_name: 'X', rows: [{}] });
    assert.ok(same.includes(d.type_test.slice(0, 20).replace(/&/g, '&amp;')), k + ': tanpa isian tetap teks form');
    assert.ok(R({ ...base, template: k, test_name: 'X', rows: [{}], fields: { type_test: 'ZZ Custom Type ZZ' } }).includes('ZZ Custom Type ZZ'), k + ': Type of Test bisa diganti');
  });
  assert.ok(formDefaults('ferrite-weld').method_note.startsWith('Specimen was electrolityc etched'));
  assert.strictEqual(formDefaults('tn-red').method_note, '', 'form tanpa catatan metode');
  const fer = R({ ...base, template: 'ferrite-mat', test_name: 'Ferrite', rows: [{}], fields: { method_note: 'Specimen was etched using KOH solution.' } });
  assert.ok(fer.includes('KOH solution') && !fer.includes('NaOH'), 'catatan metode Ferrite bisa diganti');
}

// 19 Nov: Hardness sampai 30 titik per line; tabel cetak dirapatkan (> 22 titik) agar nilai tidak terpotong
{
  const zones = [{ name: 'Base Metal', points: 3 }, { name: 'HAZ', points: 3 }, { name: 'Weld Metal', points: 13 }, { name: 'HAZ', points: 3 }, { name: 'Base Metal', points: 3 }];
  const lines = [0, 1, 2].map(li => Array.from({ length: 25 }, (_, i) => String(200 + li * 30 + i)));
  const html = R({ ...base, template: 'hard-weld', test_name: 'Hardness Test', rows: [{}], fields: { pattern: { id: null, name: 'K', kind: 'weld', lines: ['Line 1', 'Line 2', 'Line 3'], zones }, hardness: { lines } } });
  assert.ok(html.includes('>200<') && html.includes('>284<'), 'semua 25 titik x 3 line tercetak');
  assert.ok(/font-size:7\.5pt/.test(html), 'tabel dirapatkan untuk titik banyak');
  const few = R({ ...base, template: 'hard-weld', test_name: 'Hardness Test', rows: [{}], fields: { pattern: { id: null, name: 'K', kind: 'weld', lines: ['Line 1'], zones: zones.slice(0, 3) }, hardness: { lines: [['1']] } } });
  assert.ok(!/font-size:7\.5pt/.test(few), 'titik sedikit tetap ukuran normal');
}

console.log('revisi-regression.test.js OK');

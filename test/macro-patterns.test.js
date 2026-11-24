// Master Data > Pola Macro (permintaan klien 2026-11-24: report Macro bisa custom seperti Hardness): validasi baris ukur,
// sketsa, CRUD lewat route (pool palsu), isian Lembar tersanitasi, dan cetak tata letak khusus.
const assert = require('assert');
const { registerMacroPatternRoutes, sanitizeMacroSnapshot, cleanGroups, pointList } = require('../lib/macroPatterns');

// ---- validasi baris ukur ----
assert.deepStrictEqual(pointList('A1, A2;A3  A4'), ['A1', 'A2', 'A3', 'A4']);
assert.strictEqual(pointList('1,2,3,4,5,6,7,8,9,10').length, 8, 'maks. 8 titik per baris');
assert.deepStrictEqual(cleanGroups([{ label: 'Weld Size (mm)', points: 'A1,A2' }, { label: '', points: '' }, { label: 'Fusion', points: [] }]).groups,
  [{ label: 'Weld Size (mm)', points: ['A1', 'A2'] }, { label: 'Fusion', points: [] }], 'baris kosong dibuang; tanpa titik = satu nilai');
assert.ok(cleanGroups([]).error, 'tanpa baris ditolak');
assert.strictEqual(cleanGroups(Array.from({ length: 15 }, (_, i) => ({ label: 'L' + i }))).groups.length, 10, 'maks. 10 baris');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
assert.strictEqual(sanitizeMacroSnapshot({ name: 'P', groups: [{ label: 'X', points: ['A'] }], sketch: png }).sketch, png);
assert.strictEqual(sanitizeMacroSnapshot({ name: 'P', groups: [{ label: 'X' }], sketch: 'javascript:x' }).sketch, '');
assert.strictEqual(sanitizeMacroSnapshot({ name: 'P', groups: [] }), null);
assert.strictEqual(sanitizeMacroSnapshot(null), null);

// ---- isian Lembar: pola tersimpan di fields.macro_pattern, nilai ukur di rows[].mvals ----
{
  const { sanitizeFields, sanitizeRows } = require('../lib/testReports');
  {
    const f = sanitizeFields('macro', 'Macro Etching', { macro_pattern: { name: 'P', groups: [{ label: 'Weld Size', points: 'A1,A2' }] } });
    assert.deepStrictEqual(f.macro_pattern.groups, [{ label: 'Weld Size', points: ['A1', 'A2'] }]);
    assert.ok(!sanitizeFields('bending', 'Bend Root', { macro_pattern: { name: 'P', groups: [{ label: 'X' }] } }).macro_pattern, 'hanya Lembar Macro');
  }
  {
    const rows = sanitizeRows([{ marking_specimen: 'MC1', mvals: [['10.13', '6.18'], ['2.19']] }], ['MC1'], 'macro');
    assert.deepStrictEqual(rows[0].mvals, [['10.13', '6.18'], ['2.19']]);
  }
}

// ---- cetak: blok hasil form diganti tabel spesimen + foto (kiri) dan sketsa + tabel ukur (kanan) ----
{
  const { renderTemplateReportHtml: R } = require('../lib/testReportTemplatePrint');
  const pat = { name: 'X', sketch: png, groups: [
    { label: 'Weld Size (mm)', points: ['A1', 'A2', 'A3'] }, { label: 'Weld Penetration (mm)', points: ['P_A1', 'P_A2'] }, { label: 'Fusion', points: [] }] };
  const row = { marking_specimen: 'MC-1', thickness: '80 x 80', mag: '10x', result: 'accepted', remarks: 'Cap', mvals: [['10.13', '6.18', '8.42'], ['2.19', '3.15'], ['Good']] };
  ['macro-butt', 'macro-fillet', 'macro-mat'].forEach(t => {
    const base = { template: t, test_name: 'Macro', test_request: {}, coupon: {}, rows: [row], photo_data: { [t + '/s1']: png } };
    const h = R({ ...base, fields: { macro_pattern: pat } });
    ['10.13', '8.42', '3.15', 'P<sub>A1</sub>', 'Weld Penetration (mm)', '>Good<', 'Accepted', '>Cap'].forEach(x => assert.ok(h.includes(x), t + ': tercetak ' + x));
    assert.ok(!h.includes('Root Penetration') && !h.includes('Weld type joint'), t + ': keterangan bawaan form tidak tercetak');
    assert.strictEqual(h.split(png).length - 1, 2, t + ': foto makro + sketsa tercetak sekali');
    const plain = R({ ...base, fields: {} });
    assert.ok(!plain.includes('P<sub>A1</sub>'), t + ': tanpa pola tetap form bawaan');
  });
  assert.ok(R({ template: 'macro-butt', test_name: 'Macro', test_request: {}, coupon: {}, rows: [row], fields: {} }).includes('Weld type joint'), 'tanpa pola: keterangan form tetap');
}

// ---- route CRUD ----
const rows = [];
let seq = 0;
const pool = {
  async query(sql, params) {
    if (/^SELECT .* FROM macro_patterns ORDER BY/s.test(sql)) return { rows: rows.map(({ sketch_image, ...r }) => ({ ...r, has_sketch: !!sketch_image })) };
    if (/^SELECT .*FROM macro_patterns WHERE id = \$1/s.test(sql)) return { rows: rows.filter(r => r.id === Number(params[0])).map(r => ({ ...r, has_sketch: !!r.sketch_image })) };
    if (/^INSERT INTO macro_patterns/.test(sql)) {
      if (rows.some(r => r.name === params[0])) { const e = new Error('dup'); e.code = '23505'; throw e; }
      const r = { id: ++seq, name: params[0], customer: params[1], groups: params[2], notes: params[3], sketch_image: params[4] };
      rows.push(r);
      return { rows: [r] };
    }
    if (/^UPDATE macro_patterns/.test(sql)) {
      const r = rows.find(x => x.id === Number(params[6]));
      if (!r) return { rows: [] };
      Object.assign(r, { name: params[0], customer: params[1], groups: params[2], notes: params[3] });
      if (params[4]) r.sketch_image = params[5];
      return { rows: [r] };
    }
    if (/^DELETE FROM macro_patterns/.test(sql)) { const n = rows.length; const i = rows.findIndex(r => r.id === Number(params[0])); if (i >= 0) rows.splice(i, 1); return { rowCount: n - rows.length }; }
    throw new Error('unexpected sql ' + sql);
  }
};
const routes = {};
const app = {};
['get', 'post', 'put', 'delete'].forEach(m => { app[m] = (path, h) => { routes[m.toUpperCase() + ' ' + path] = h; }; });
registerMacroPatternRoutes(app, { pool });
const call = (key, params, body) => new Promise(resolve => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } };
  routes[key]({ params: params || {}, body, query: {} }, res);
});

(async () => {
  const groups = [{ label: 'Weld Size (mm)', points: 'A1, A2, A3' }, { label: 'Weld Penetration (mm)', points: ['P_A1', 'P_A2'] }];
  let r = await call('POST /api/macro-patterns', {}, { name: 'Fillet ganda', customer: 'PT Contoh', groups, sketch: png });
  assert.strictEqual(r.status, 201);
  const id = r.body.id;
  assert.deepStrictEqual(JSON.parse(rows[0].groups)[0].points, ['A1', 'A2', 'A3']);
  assert.strictEqual((await call('POST /api/macro-patterns', {}, { name: 'Fillet ganda', groups })).status, 400, 'nama kembar');
  assert.strictEqual((await call('POST /api/macro-patterns', {}, { name: '', groups })).status, 400, 'nama wajib');
  assert.strictEqual((await call('POST /api/macro-patterns', {}, { name: 'Y', groups: [] })).status, 400, 'tanpa baris ukur');
  assert.strictEqual((await call('POST /api/macro-patterns', {}, { name: 'Z', groups, sketch: 'data:text/html;base64,AA==' })).status, 400, 'sketsa bukan gambar');
  r = await call('GET /api/macro-patterns/:id', { id: String(id) });
  assert.strictEqual(r.body.sketch, png);
  assert.ok(!('sketch_image' in r.body));
  r = await call('PUT /api/macro-patterns/:id', { id: String(id) }, { name: 'Fillet ganda', groups: [{ label: 'Fusion' }] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(rows[0].sketch_image, png, 'tanpa sketch -> sketsa tetap');
  await call('PUT /api/macro-patterns/:id', { id: String(id) }, { name: 'Fillet ganda', groups, sketch: '' });
  assert.strictEqual(rows[0].sketch_image, null, "sketch '' -> dihapus");
  r = await call('GET /api/macro-patterns', {});
  assert.strictEqual(r.body.items.length, 1);
  assert.strictEqual((await call('DELETE /api/macro-patterns/:id', { id: String(id) })).status, 200);
  assert.strictEqual((await call('DELETE /api/macro-patterns/:id', { id: String(id) })).status, 404);
  console.log('MACRO PATTERNS OK');
})().catch(e => { console.error(e); process.exit(1); });

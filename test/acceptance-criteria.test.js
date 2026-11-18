// Master Data > Acceptance Criteria (Fillet Weld Break / Peel): validasi, snapshot Lembar, CRUD route (pool palsu),
// set bawaan dari form resmi, dan cetakan report yang mengikuti kriteria pilihan.
const assert = require('assert');
const { registerAcceptanceCriteriaRoutes, sanitizeCriteriaSnapshot, cleanCriteria, defaultSets } = require('../lib/acceptanceCriteria');
const { renderTemplateReportHtml } = require('../lib/testReportTemplatePrint');

// ---- validasi ----
assert.deepStrictEqual(cleanCriteria([{ text: ' A ', remark: 'R' }, { text: '' }, 'x', { text: 'B' }]), [{ text: 'A', remark: 'R' }, { text: 'B', remark: '' }]);
assert.strictEqual(cleanCriteria(Array.from({ length: 12 }, (_, i) => ({ text: 'K' + i }))).length, 8, 'maks. 8 kriteria');
assert.strictEqual(sanitizeCriteriaSnapshot({ name: 'X', criteria: [] }), null, 'tanpa kriteria = bawaan form');
assert.strictEqual(sanitizeCriteriaSnapshot(null), null);
assert.deepStrictEqual(sanitizeCriteriaSnapshot({ id: '3', name: 'AWS B4.0', criteria: [{ text: 'K1', remark: 'R1', evil: 1 }] }),
  { id: 3, name: 'AWS B4.0', criteria: [{ text: 'K1', remark: 'R1' }] });

// ---- set bawaan = kalimat form resmi ----
const defs = defaultSets();
assert.deepStrictEqual(defs.map(s => s.criteria.length), [3, 3, 2, 2, 3]);
assert.ok(defs[3].criteria[0].text.startsWith('The fractured surface shall show no evidence of cracks') && defs[3].criteria[0].remark === 'Showing complete fusion');

// ---- route CRUD ----
const rows = [];
let seq = 0;
const pool = {
  async query(sql, params) {
    if (/^SELECT .* FROM acceptance_criteria_sets ORDER BY/s.test(sql)) return { rows };
    if (/^INSERT INTO acceptance_criteria_sets/.test(sql)) {
      if (rows.some(r => r.name === params[0])) { const e = new Error('dup'); e.code = '23505'; throw e; }
      const r = { id: ++seq, name: params[0], customer: params[1], criteria: params[2], notes: params[3] };
      rows.push(r);
      return { rows: [r] };
    }
    if (/^UPDATE acceptance_criteria_sets/.test(sql)) {
      const r = rows.find(x => x.id === Number(params[4]));
      if (!r) return { rows: [] };
      Object.assign(r, { name: params[0], customer: params[1], criteria: params[2], notes: params[3] });
      return { rows: [r] };
    }
    if (/^DELETE FROM acceptance_criteria_sets/.test(sql)) { const n = rows.length; const i = rows.findIndex(r => r.id === Number(params[0])); if (i >= 0) rows.splice(i, 1); return { rowCount: n - rows.length }; }
    throw new Error('unexpected sql ' + sql);
  }
};
const routes = {};
const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; }, put: (p, h) => { routes['PUT ' + p] = h; }, delete: (p, h) => { routes['DELETE ' + p] = h; } };
registerAcceptanceCriteriaRoutes(app, { pool });
const call = (m, p, params, body) => new Promise(resolve => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } };
  routes[m + ' ' + p]({ params: params || {}, body }, res);
});

(async () => {
  let r = await call('POST', '/api/acceptance-criteria', {}, { name: '', criteria: [{ text: 'A' }] });
  assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/acceptance-criteria', {}, { name: 'AWS B4.0M:2016 Butir 9.2', criteria: [{ text: '' }] });
  assert.strictEqual(r.status, 400, 'tanpa kalimat ditolak');
  r = await call('POST', '/api/acceptance-criteria', {}, { name: 'AWS B4.0M:2016 Butir 9.2', criteria: [{ text: 'K1', remark: 'R1' }, { text: 'K2' }] });
  assert.strictEqual(r.status, 201);
  assert.deepStrictEqual(r.body.criteria, [{ text: 'K1', remark: 'R1' }, { text: 'K2', remark: '' }]);
  const id = r.body.id;
  r = await call('POST', '/api/acceptance-criteria', {}, { name: 'AWS B4.0M:2016 Butir 9.2', criteria: [{ text: 'K' }] });
  assert.strictEqual(r.status, 400, 'nama kembar ditolak');
  r = await call('PUT', '/api/acceptance-criteria/:id', { id: String(id) }, { name: 'AWS B4.0M', criteria: [{ text: 'K1 baru' }] });
  assert.strictEqual(r.body.name, 'AWS B4.0M');
  r = await call('GET', '/api/acceptance-criteria');
  assert.strictEqual(r.body.items.length, 1);
  r = await call('DELETE', '/api/acceptance-criteria/:id', { id: String(id) });
  assert.ok(r.body.ok);

  // ---- cetakan: kriteria pilihan menggantikan kalimat form; jumlah kriteria bebas ----
  const own = { id: 1, name: 'AWS B4.0', criteria: [{ text: 'Kriteria satu', remark: 'Showing Complete Fusion' }, { text: 'Kriteria dua', remark: 'No Inclusion or Porosity' }, { text: 'Kriteria tiga', remark: '' }] };
  const html = renderTemplateReportHtml({ template: 'fwb-asme-pipe', test_name: 'Fillet Weld Break', test_request: {}, coupon: {}, fields: { fwb_criteria: own },
    rows: [{ marking_specimen: 'AMI.11.1-FWB1', result: 'accepted', remarks: ['', 'Porosity 1 mm'] }, { marking_specimen: 'AMI.11.1-FWB2', result: 'accepted' }] });
  assert.ok(['Kriteria satu', 'Kriteria dua', 'Kriteria tiga'].every(t => html.includes('>' + t + '<')), 'semua kriteria pilihan tercetak');
  assert.ok(!html.includes('The fractured surface'), 'kalimat bawaan form tidak tercetak');
  assert.ok(html.includes('>Showing Complete Fusion<') && html.includes('>Porosity 1 mm<'), 'Remarks: isian spesimen, kosong = Remarks bawaan set');
  assert.strictEqual((html.match(/class="paper"/g) || []).length, 2, 'tetap satu halaman per spesimen');
  const plain = renderTemplateReportHtml({ template: 'fwb-asme-pipe', test_name: 'Fillet Weld Break', test_request: {}, coupon: {}, fields: {}, rows: [{ marking_specimen: 'X' }] });
  assert.ok(plain.includes('The fractured surface'), 'tanpa pilihan: kalimat form resmi');
  console.log('acceptance-criteria.test.js OK');
})().catch(e => { console.error(e); process.exit(1); });

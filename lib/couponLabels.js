// Label Coupon / kertas penanda material yang akan diuji (permintaan klien 2026-11-25, contoh "Kertas Kecil.xlsx").
// Satu label per coupon Work Order: nama perusahaan (judul), kotak Sample Marking, lalu "Client's Description of Sample"
// dua kolom label : isi. Isi bawaan diambil dari coupon (Weld: WPS / PQR / ukuran / testing for / welder + grade /
// posisi / proses; Material: grade / ukuran / heat no / testing for + PO / project). Semua teks bisa diubah di halaman
// cetak dan disimpan per coupon (work_order_sample_marks.label_data) supaya cetak ulang memakai isian yang sama.
const { esc } = require('./printCommon');

const MAX_ROWS = 12;   // baris per kolom
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const dashOr = v => str(v) || '-';

function sizeText(c) {
  const v = x => { const s = str(x); return s === '-' ? '' : s; };
  const mm = s => (/mm/i.test(s) ? s : s + ' mm');
  if (v(c.material_size)) return v(c.material_size);
  const od = v(c.outside_diameter), thk = v(c.thickness);
  return [od ? 'OD ' + mm(od) : '', thk ? (od ? 'with ' : '') + mm(thk) + ' Thickness' : ''].filter(Boolean).join(' ');
}

const isWeld = c => !!(str(c.no_wps) || str(c.welding_process));

// Isi bawaan label satu coupon
function defaultLabel(coupon, request) {
  const c = coupon || {}, tr = request || {};
  const base = { title: str(tr.company) || '-', marking: str(c.sample_marking) || '-' };
  if (isWeld(c)) {
    return {
      ...base, kind: 'weld',
      left: [
        { label: 'WPS No', value: dashOr(c.no_wps) }, { label: 'PQR No', value: dashOr(c.pqr_no) },
        { label: 'Material Size', value: dashOr(sizeText(c)) }, { label: 'Testing for', value: str(c.testing_purpose) || 'Welding Procedure Specification' },
        { label: "Welder's Name/ID", value: dashOr(c.welder_name) }
      ],
      right: [
        { label: 'Material Type/Grade', value: dashOr(c.material_type_grade) }, { label: 'Welding Position', value: dashOr(c.welding_position) },
        { label: 'Welding Process', value: dashOr(c.welding_process) }
      ]
    };
  }
  return {
    ...base, kind: 'material',
    left: [
      { label: 'Material Type/Grade', value: dashOr(c.material_type_grade) }, { label: 'Material Size', value: dashOr(sizeText(c)) },
      { label: 'Heat No.', value: dashOr(c.heat_number) }, { label: 'Testing for', value: str(c.testing_purpose) || 'Material Testing' }
    ],
    right: [{ label: 'Po No', value: dashOr(tr.po_number) }, { label: 'Project Name', value: dashOr(tr.project_name) }]
  };
}

// Label tersimpan yang valid, atau null (null = pakai isi bawaan coupon)
function sanitizeLabel(input) {
  if (!input || typeof input !== 'object') return null;
  const rows = v => (Array.isArray(v) ? v : []).slice(0, MAX_ROWS).map(x => ({ label: str((x || {}).label, 60), value: str((x || {}).value, 200) }))
    .filter(x => x.label || x.value);
  return {
    title: str(input.title, 120), marking: str(input.marking, 80), kind: input.kind === 'material' ? 'material' : 'weld',
    left: rows(input.left), right: rows(input.right), copies: Math.max(1, Math.min(20, Math.floor(Number(input.copies)) || 1))
  };
}

// Halaman cetak + sunting: tiap label bisa diubah langsung (klik teks), tambah/hapus baris, jumlah cetak, pilih coupon.
function renderCouponLabelsHtml(wo, saved) {
  const tr = wo.test_request || {};
  const coupons = (wo.coupon_tests || []).map(c => {
    const own = saved[c.row_no];
    return { row: c.row_no, data: own || { ...defaultLabel(c, tr), copies: 1 }, def: { ...defaultLabel(c, tr), copies: 1 }, own: !!own };
  });
  const payload = JSON.stringify({ woId: wo.id, coupons }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Label Coupon - ${esc(tr.job_number || '')}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#eef0f3;font-family:Arial,Helvetica,sans-serif;color:#000}
  .bar{position:sticky;top:0;z-index:5;background:#1f2a44;color:#fff;padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .bar b{font-size:15px}.bar .hint{font-size:12px;opacity:.85;flex:1 1 260px}
  .bar button{background:#fff;color:#1f2a44;border:0;border-radius:6px;padding:7px 14px;font-weight:700;cursor:pointer}
  .bar button.primary{background:#c0392b;color:#fff}
  .wrap{max-width:820px;margin:16px auto;padding:0 12px}
  .item{background:#fff;border-radius:8px;padding:10px 12px 14px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;margin-bottom:8px;color:#333}
  .tools button{font-size:12px;padding:3px 9px;border:1px solid #b9c0cc;background:#f6f7f9;border-radius:5px;cursor:pointer}
  .tools input[type=number]{width:52px;padding:2px 4px}
  .tools .own{color:#1d7a3a;font-weight:700}
  .label{border:1px solid #000;padding:6px 10px 8px;width:100%;page-break-inside:avoid;break-inside:avoid;background:#fff}
  .label h1{margin:0 0 6px;text-align:center;font-size:17px;font-weight:700;text-decoration:underline}
  .mark{display:flex;justify-content:flex-end;margin-bottom:4px}
  .mark table{border-collapse:collapse;font-size:12px}
  .mark td{border:1px solid #000;padding:3px 6px}
  .mark td.l{font-weight:700;border-right:0}.mark td.c{border-left:0;border-right:0;padding:3px 2px}.mark td.v{border-left:0;font-weight:700;min-width:120px}
  .desc{font-weight:700;font-size:12px;margin:2px 0 3px}
  .cols{display:flex;gap:16px}.cols>div{flex:1 1 0}
  .cols table{border-collapse:collapse;width:100%;font-size:12px}
  .cols td{padding:2px 2px;vertical-align:top}
  .cols td.l{font-weight:700;width:38%}.cols td.c{width:10px;text-align:center}
  .cols td.x{width:18px}
  [contenteditable]{outline:none;border-radius:2px}
  [contenteditable]:hover{background:#fff7d6}[contenteditable]:focus{background:#fff2b3}
  .rm{border:0;background:none;color:#c0392b;cursor:pointer;font-size:13px;padding:0}
  .add{font-size:11px;margin-top:3px;border:1px dashed #9aa3b2;background:#fafbfc;border-radius:4px;cursor:pointer;padding:1px 8px}
  .off .label{opacity:.35}
  #msg{font-size:12px}
  @page{size:A4;margin:10mm}
  @media print{
    body{background:#fff}.bar,.tools,.rm,.add,.no-print{display:none!important}
    .wrap{max-width:none;margin:0;padding:0}
    .item{box-shadow:none;border-radius:0;padding:0;margin:0 0 6mm;background:none}
    .item.off{display:none}
    [contenteditable]:hover,[contenteditable]:focus{background:none}
  }
</style></head><body>
<div class="bar"><b>Label Coupon &mdash; ${esc(tr.job_number || '')}</b>
  <span class="hint">Klik teks mana pun untuk mengubahnya (judul, Sample Marking, label &amp; isi). Klik Simpan agar perubahan dipakai lagi saat cetak ulang. Hilangkan centang coupon yang tidak dicetak.</span>
  <span id="msg"></span>
  <button type="button" id="save">Simpan</button><button type="button" class="primary" id="print">Cetak</button></div>
<div class="wrap" id="list"></div>
<script>
const DATA = ${payload};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = DATA.coupons.map(c => ({ ...c, on: true, data: JSON.parse(JSON.stringify(c.data)) }));
const list = document.getElementById('list');
function sideHtml(ci, side) {
  const rows = state[ci].data[side];
  return '<table>' + rows.map((r, i) => '<tr><td class="l" contenteditable data-ci="' + ci + '" data-side="' + side + '" data-i="' + i + '" data-f="label">' + esc(r.label) + '</td><td class="c">:</td>'
    + '<td contenteditable data-ci="' + ci + '" data-side="' + side + '" data-i="' + i + '" data-f="value">' + esc(r.value) + '</td>'
    + '<td class="x"><button type="button" class="rm" title="Hapus baris" data-rm="' + ci + ':' + side + ':' + i + '">&times;</button></td></tr>').join('')
    + '</table><button type="button" class="add" data-add="' + ci + ':' + side + '">+ baris</button>';
}
function labelHtml(ci) {
  const d = state[ci].data;
  return '<div class="label"><h1 contenteditable data-ci="' + ci + '" data-f="title">' + esc(d.title) + '</h1>'
    + '<div class="mark"><table><tr><td class="l">Sample Marking</td><td class="c">:</td><td class="v" contenteditable data-ci="' + ci + '" data-f="marking">' + esc(d.marking) + '</td></tr></table></div>'
    + '<div class="desc">Client\\u2019s Description of Sample</div>'
    + '<div class="cols"><div>' + sideHtml(ci, 'left') + '</div><div>' + sideHtml(ci, 'right') + '</div></div></div>';
}
function render() {
  list.innerHTML = state.map((c, ci) => {
    const copies = Math.max(1, Math.min(20, Number(c.data.copies) || 1));
    const extra = Array.from({ length: copies - 1 }, () => '<div style="margin-top:6mm" class="copy">' + labelHtml(ci).replace(/ contenteditable/g, '').replace(/<button[^>]*>[^<]*<\\/button>/g, '') + '</div>').join('');
    return '<div class="item' + (c.on ? '' : ' off') + '"><div class="tools"><label><input type="checkbox" data-on="' + ci + '"' + (c.on ? ' checked' : '') + '> Coupon #' + c.row + '</label>'
      + '<label>Jumlah cetak <input type="number" min="1" max="20" value="' + copies + '" data-copies="' + ci + '"></label>'
      + '<button type="button" data-reset="' + ci + '">Kembalikan isi dari data coupon</button>'
      + (c.own ? '<span class="own">tersimpan</span>' : '') + '</div>' + labelHtml(ci) + extra + '</div>';
  }).join('') || '<p>Work Order ini belum punya coupon.</p>';
}
list.addEventListener('input', e => {
  const t = e.target, ci = Number(t.dataset.ci);
  if (t.dataset.copies !== undefined) { state[Number(t.dataset.copies)].data.copies = Number(t.value) || 1; render(); return; }
  if (!t.dataset.f || Number.isNaN(ci)) return;
  const d = state[ci].data;
  if (t.dataset.side) d[t.dataset.side][Number(t.dataset.i)][t.dataset.f] = t.innerText.trim(); else d[t.dataset.f] = t.innerText.trim();
});
list.addEventListener('change', e => { const t = e.target; if (t.dataset.on !== undefined) { state[Number(t.dataset.on)].on = t.checked; render(); } });
list.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.rm) { const [ci, side, i] = t.dataset.rm.split(':'); state[Number(ci)].data[side].splice(Number(i), 1); render(); }
  else if (t.dataset.add) { const [ci, side] = t.dataset.add.split(':'); const rows = state[Number(ci)].data[side]; if (rows.length < ${MAX_ROWS}) rows.push({ label: 'Label', value: '-' }); render(); }
  else if (t.dataset.reset) { const ci = Number(t.dataset.reset); state[ci].data = JSON.parse(JSON.stringify(state[ci].def)); render(); }
});
// Enter di teks label tidak membuat baris baru (satu baris per sel)
list.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); } });
document.getElementById('print').addEventListener('click', () => window.print());
document.getElementById('save').addEventListener('click', async () => {
  const msg = document.getElementById('msg');
  msg.textContent = 'Menyimpan...';
  try {
    for (const c of state) {
      const same = JSON.stringify(c.data) === JSON.stringify(c.def);
      const r = await fetch('/api/work-orders/' + DATA.woId + '/coupon-labels/' + c.row, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: same ? null : c.data })
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Gagal menyimpan');
      c.own = !same;
    }
    msg.textContent = 'Tersimpan';
    render();
  } catch (err) { msg.textContent = err.message; }
});
render();
</script></body></html>`;
}

function registerCouponLabelRoutes(app, deps) {
  const { pool, getFullWorkOrder } = deps;

  async function savedLabels(woId) {
    const { rows } = await pool.query(`SELECT coupon_row_no, label_data FROM work_order_sample_marks WHERE work_order_id = $1 AND label_data IS NOT NULL`, [woId]);
    const out = {};
    rows.forEach(r => { const l = sanitizeLabel(typeof r.label_data === 'string' ? JSON.parse(r.label_data) : r.label_data); if (l) out[r.coupon_row_no] = l; });
    return out;
  }

  app.get('/work-orders/:id/coupon-labels', async (req, res) => {
    try {
      const wo = await getFullWorkOrder(req.params.id);
      if (!wo) return res.status(404).send('Work Order tidak ditemukan');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderCouponLabelsHtml(wo, await savedLabels(wo.id)));
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal membuat label coupon');
    }
  });

  // body: { label: {...} | null }  (null = kembali ke isi bawaan coupon)
  app.put('/api/work-orders/:id/coupon-labels/:rowNo', async (req, res) => {
    try {
      const rowNo = Number(req.params.rowNo);
      const { rows } = await pool.query(`SELECT 1 FROM work_order_sample_marks WHERE work_order_id = $1 AND coupon_row_no = $2`, [req.params.id, rowNo]);
      if (!rows.length) return res.status(404).json({ error: 'Coupon tidak ditemukan pada Work Order ini' });
      const label = sanitizeLabel((req.body || {}).label);
      await pool.query(`UPDATE work_order_sample_marks SET label_data = $1 WHERE work_order_id = $2 AND coupon_row_no = $3`,
        [label ? JSON.stringify(label) : null, req.params.id, rowNo]);
      res.json({ ok: true, label });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan label coupon' });
    }
  });
}

module.exports = { registerCouponLabelRoutes, defaultLabel, sanitizeLabel, renderCouponLabelsHtml };

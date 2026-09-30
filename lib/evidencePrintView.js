// Lampiran foto / dokumen evidence tahap Receiving (kondisi sampel sebelum & sesudah marking),
// dicetak per Work Order supaya bisa dicetak ulang kapan saja. Foto ditampilkan lewat rute file yang
// sama dengan halaman Receiving (/api/work-order-files/:id), bukan disalin ke HTML; file PDF tidak
// bisa ditanam di halaman cetak, jadi hanya didaftar dengan tautan buka.
const { LOGO_BASE64, esc, fmtDate } = require('./printCommon');

function couponTitle(c) {
  const types = [...(c.coupon_type || [])];
  if (c.coupon_type_other) types.push(c.coupon_type_other);
  return `Coupon #${c.row_no} — ${types.length ? types.join(', ') : (c.material_type_grade || '-')}`;
}

function fileCell(f) {
  const url = `/api/work-order-files/${f.id}`;
  if (String(f.mime_type).startsWith('image/')) {
    return `<figure class="ph"><img src="${url}" alt="${esc(f.filename)}"><figcaption>${esc(f.filename)}</figcaption></figure>`;
  }
  return `<figure class="ph doc"><a href="${url}" target="_blank" rel="noopener">Dokumen PDF</a><figcaption>${esc(f.filename)}</figcaption></figure>`;
}

function group(title, files) {
  return `<div class="grp"><p class="grp-title">${esc(title)} <span>(${files.length})</span></p>
    ${files.length ? `<div class="ph-grid">${files.map(fileCell).join('')}</div>` : '<p class="empty">Belum ada file</p>'}</div>`;
}

function renderEvidencePrintHtml({ wo, files, receivingDate }) {
  const tr = wo.test_request || {};
  const forCoupon = (rowNo, state) => files.filter(f => f.coupon_row_no === rowNo && f.marking_state === state);
  const general = files.filter(f => f.coupon_row_no == null || !['before', 'after'].includes(f.marking_state));

  const sections = (wo.coupon_tests || []).map(c => `
    <section class="coupon">
      <h3>${esc(couponTitle(c))} <span class="mk">Sample Marking: ${esc(c.sample_marking) || '-'}</span></h3>
      <div class="pair">
        ${group('Sebelum dimarking', forCoupon(c.row_no, 'before'))}
        ${group('Sesudah dimarking', forCoupon(c.row_no, 'after'))}
      </div>
    </section>`).join('');

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${esc(tr.job_number || 'Work Order')} - Lampiran Evidence Penerimaan Sampel</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 9.5pt; background: #ddd; margin: 0; }
  .toolbar { position: sticky; top: 0; background: #0E3270; color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; z-index: 10; }
  .toolbar button { background: #AA0000; color: #fff; border: none; padding: 8px 18px; font-weight: bold; border-radius: 4px; cursor: pointer; font-size: 10pt; }
  .sheet { width: 210mm; margin: 16px auto; padding: 12mm; background: #fff; box-shadow: 0 0 8px rgba(0,0,0,.25); }
  .logo { height: 34px; display: block; }
  .bar { height: 3px; background: #8E2A2A; margin: 7px 0 1px; }
  .bar + .bar { background: #0E3270; margin: 0 0 10px; }
  h1 { text-align: center; font-size: 12pt; margin: 0 0 10px; }
  table.info { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9pt; }
  table.info td { border: 1px solid #000; padding: 3px 6px; width: 50%; }
  table.info b { display: inline-block; min-width: 30mm; }
  .coupon { margin-bottom: 14px; }
  h3 { font-size: 10pt; margin: 0 0 6px; padding: 4px 6px; background: #EAEAEA; border: 1px solid #000; }
  h3 .mk { float: right; font-weight: normal; font-size: 9pt; }
  .grp { margin: 0 0 8px; }
  .grp-title { font-weight: bold; margin: 0 0 4px; }
  .grp-title span { font-weight: normal; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .pair .ph-grid { grid-template-columns: 1fr; }
  .ph-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  figure.ph { margin: 0; border: 1px solid #999; padding: 4px; break-inside: avoid; page-break-inside: avoid; }
  figure.ph img { display: block; width: 100%; max-height: 82mm; object-fit: contain; }
  figure.ph.doc { padding: 14px 8px; text-align: center; }
  figcaption { font-size: 7.6pt; color: #333; margin-top: 3px; word-break: break-all; }
  .empty { color: #777; font-style: italic; margin: 0; }
  .footer { margin-top: 10px; border-top: 1px solid #0E3270; padding-top: 3px; font-size: 7.6pt; color: #333; }
  @media print { body { background: #fff; } .toolbar { display: none; } .sheet { box-shadow: none; margin: 0; padding: 0; width: auto; } }
</style>
</head>
<body>
  <div class="toolbar">
    <span>Lampiran Evidence Penerimaan Sampel &mdash; ${esc(tr.job_number || '')}</span>
    <button onclick="window.print()">Print / Simpan sebagai PDF</button>
  </div>
  <div class="sheet">
    <img class="logo" src="data:image/png;base64,${LOGO_BASE64}" alt="DETECH">
    <div class="bar"></div><div class="bar"></div>
    <h1>LAMPIRAN FOTO / DOKUMEN PENERIMAAN SAMPEL</h1>
    <table class="info">
      <tr><td><b>No. Pekerjaan</b>: ${esc(tr.job_number)}</td><td><b>Pelanggan</b>: ${esc(tr.on_behalf_owner || tr.company)}</td></tr>
      <tr><td><b>Nama Proyek</b>: ${esc(tr.project_name)}</td><td><b>Tgl. Penerimaan</b>: ${receivingDate ? fmtDate(receivingDate) : '-'}</td></tr>
    </table>
    ${files.length ? sections : '<p class="empty">Belum ada foto / dokumen evidence yang diunggah pada tahap Receiving.</p>'}
    ${files.length && general.length ? `<section class="coupon"><h3>Dokumen umum</h3>${group('Surat pengantar, berita acara, dll', general)}</section>` : ''}
    <div class="footer">Dicetak dari DETECH LIMS &middot; Work Order ${esc(tr.job_number)} &middot; ${files.length} file</div>
  </div>
</body>
</html>`;
}

module.exports = { renderEvidencePrintHtml };

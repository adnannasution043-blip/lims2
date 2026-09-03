// Halaman cetak Tinjauan Permintaan Pengujian (DPI-LP-FR-24 Rev.4), dirender sebagai HTML
// lalu di-print/simpan-sebagai-PDF lewat browser — supaya layout tabel (rowspan, header
// berulang tiap halaman) mengikuti mesin cetak browser, bukan dihitung manual seperti pdfkit.
const { TEST_TYPES } = require('../db/testTypes');
const { LOGO_BASE64, esc, fmtDate } = require('./printCommon');

function ynText(v) {
  return v === 'Y' ? 'Y' : v === 'N' ? 'N' : '-';
}

function couponTypeBoxes(row) {
  const selected = new Set(row.coupon_type || []);
  const base = ['Plate', 'Pipe', 'Bolt/Nut'].map(t =>
    `<span class="cbx">${selected.has(t) ? '&#9746;' : '&#9744;'} ${esc(t)}</span>`
  ).join(' ');
  const other = row.coupon_type_other
    ? `<span class="cbx">&#9746; ${esc(row.coupon_type_other)}</span>`
    : `<span class="cbx">&#9744; ....</span>`;
  return `${base} ${other}`;
}

function deskripsiFieldsHtml(row) {
  const field = (label, value, unit) => `
    <div class="desk-field"><span class="lbl">${label}</span><span class="colon">:</span>
      <span class="val">${esc(value)}${unit && value ? ' ' + unit : ''}</span></div>`;
  return `
    <div class="desk-field"><span class="lbl">Coupon Test</span><span class="colon">:</span>
      <span class="val">${couponTypeBoxes(row)}</span></div>
    ${field('Material Type/ Grade', row.material_type_grade)}
    ${field('Material Size', row.material_size, 'mm')}
    ${field('Outside Diameter', row.outside_diameter, 'mm')}
    ${field('Thickness', row.thickness, 'mm')}
    ${field('Heat Number', row.heat_number)}
    ${field('Welding Process', row.welding_process)}
    ${field('Welding Position', row.welding_position)}
    ${field('Ref. Code', row.ref_code)}
    ${field('No WPS', row.no_wps)}
    ${field('Testing Purpose', row.testing_purpose)}
    ${field('Note', row.note)}
  `;
}

function testTypeLabel(name, row) {
  if (name !== 'Charpy Impact Test') return esc(name);
  const t = row.charpy_temp ? esc(row.charpy_temp) : '..........';
  const wm = row.charpy_wm ? esc(row.charpy_wm) : '......';
  const bm = row.charpy_bm ? esc(row.charpy_bm) : '......';
  const haz = row.charpy_haz ? esc(row.charpy_haz) : '......';
  return `Charpy Impact Test, T&deg; : ${t}<br>WM : ${wm}&nbsp;&nbsp;BM : ${bm}&nbsp;&nbsp;HAZ : ${haz}`;
}

function couponTbody(row, idx) {
  const rows = TEST_TYPES.map((name, i) => {
    const item = (row.test_items || []).find(ti => ti.test_name === name) || {};
    const firstCell = i === 0
      ? `<td class="no-col" rowspan="${TEST_TYPES.length}">${idx + 1}.</td>
         <td class="desk-col" rowspan="${TEST_TYPES.length}">${deskripsiFieldsHtml(row)}</td>`
      : '';
    return `<tr>
      ${firstCell}
      <td class="cek-col">${item.checked ? '&#10003;' : ''}</td>
      <td class="jenis-col">${testTypeLabel(name, row)}</td>
      <td class="jml-col">${item.checked ? esc(item.qty) : ''}</td>
      <td class="metode-col">${item.checked ? esc(item.method) : ''}</td>
    </tr>`;
  }).join('');
  return `<tbody class="coupon-block">${rows}</tbody>`;
}

function infoRow(label, en, value) {
  return `<div class="info-row"><span class="lbl">${label} <i>(${en})</i></span><span class="colon">:</span><span class="val">${esc(value)}</span></div>`;
}

const NOTE_TEXT =
  'Material sisa pengujian yang ditinggalkan oleh pelanggan akan disimpan pada fasilitas ' +
  'penyimpanan material sisa uji PT Detech Profesional Indonesia selama 14 hari kerja. Apabila ' +
  'tidak ada berita acara penitipan atau notifikasi pengambilan material dari pelanggan sampai ' +
  'dengan 14 hari durasi penyimpanan, maka material sisa pengujian akan dimusnahkan.';

function renderPrintHtml(req) {
  const couponRows = (req.coupon_tests && req.coupon_tests.length) ? req.coupon_tests : [{ test_items: [] }];
  const tbodies = couponRows.map((row, idx) => couponTbody(row, idx)).join('');

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${esc(req.job_number || 'Permintaan Uji')} - Tinjauan Permintaan Pengujian</title>
<style>
  @page { size: A4; margin: 13mm 12mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 9pt; background: #ddd; }
  .toolbar { position: sticky; top: 0; background: #1B2A4A; color: #fff; padding: 10px 16px;
             display: flex; justify-content: space-between; align-items: center; z-index: 10; }
  .toolbar button { background: #F5A623; border: none; padding: 8px 18px; font-weight: bold;
             border-radius: 4px; cursor: pointer; font-size: 10pt; }
  .sheet { max-width: 210mm; margin: 16px auto; padding: 13mm 12mm 16mm; background: #fff;
           box-shadow: 0 0 8px rgba(0,0,0,.25); }

  .logo { height: 42px; display: block; }
  .headbar { height: 4px; background: #1B2A4A; margin: 6px 0 10px; }
  h1 { text-align: center; font-size: 15pt; margin: 0; letter-spacing: .3px; }
  .subtitle { text-align: center; font-style: italic; font-size: 10pt; margin: 2px 0 12px; }

  .info-grid { display: flex; gap: 22px; margin-bottom: 10px; }
  .info-col { flex: 1; min-width: 0; }
  .info-row { display: flex; font-size: 8.7pt; margin-bottom: 3px; }
  .info-row .lbl { font-weight: bold; width: 175px; flex-shrink: 0; }
  .info-row .lbl i { font-weight: normal; font-style: italic; }
  .info-row .colon { width: 8px; flex-shrink: 0; }
  .info-row .val { flex: 1; word-break: break-word; }

  table.form-table { width: 100%; border-collapse: collapse; font-size: 8.3pt; margin-bottom: 10px; }
  table.form-table th, table.form-table td { border: 1px solid #333; padding: 4px 6px; text-align: left; vertical-align: top; }
  table.form-table th { background: #EAEAEA; font-weight: bold; text-align: center; }

  table.coupon-table { width: 100%; border-collapse: collapse; font-size: 8.3pt; table-layout: fixed; }
  table.coupon-table th, table.coupon-table td { border: 1px solid #333; padding: 3px 6px; vertical-align: top; word-wrap: break-word; }
  table.coupon-table thead { display: table-header-group; }
  table.coupon-table th { background: #EAEAEA; font-weight: bold; text-align: center; }
  table.coupon-table th i, table.coupon-table th em { font-weight: normal; font-style: italic; display: block; font-size: 7.6pt; }
  .coupon-block { break-inside: avoid; page-break-inside: avoid; }
  .no-col { width: 36px; padding-left: 2px !important; padding-right: 2px !important; text-align: center; font-weight: bold; }
  .desk-col { width: 225px; }
  .desk-field { display: flex; padding: 1.5px 0; font-size: 8.2pt; }
  .desk-field .lbl { width: 96px; flex-shrink: 0; }
  .desk-field .colon { width: 7px; flex-shrink: 0; }
  .desk-field .val { flex: 1; word-break: break-word; }
  .cbx { white-space: nowrap; margin-right: 6px; display: inline-block; }
  .cek-col { width: 26px; text-align: center; }
  .jenis-col { }
  .jml-col { width: 42px; text-align: center; }
  .metode-col { width: 96px; }

  .bottom-grid { display: flex; gap: 12px; margin-top: 10px; break-inside: avoid; page-break-inside: avoid; }
  .note-box { flex: 1.15; border: 1px solid #333; padding: 6px 8px; font-size: 7.8pt; }
  .note-box .title { font-weight: bold; font-size: 8.5pt; margin-bottom: 4px; }
  .sig-box { flex: 1; border: 1px solid #333; display: flex; flex-direction: column; }
  .sig-head { display: flex; border-bottom: 1px solid #333; }
  .sig-head div { flex: 1; text-align: center; font-weight: bold; padding: 4px; font-size: 8.3pt; }
  .sig-head div:first-child { border-right: 1px solid #333; }
  .sig-body { display: flex; flex: 1; min-height: 74px; }
  .sig-cell { flex: 1; padding: 5px 7px; font-size: 8pt; display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; }
  .sig-cell:first-child { border-right: 1px solid #333; }
  .sig-img { max-height: 34px; max-width: 100%; object-fit: contain; align-self: flex-start; }

  .footer { margin-top: 10px; font-size: 7.3pt; border-top: 1px solid #333; padding-top: 3px;
            display: flex; justify-content: space-between; }

  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { box-shadow: none; margin: 0; padding: 0; max-width: none; }
    /* repeats on every printed page: fixed relative to each page box while printing */
    .footer { position: fixed; bottom: 4mm; left: 0; right: 0; margin-top: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span>${esc(req.job_number || '')} &mdash; Tinjauan Permintaan Pengujian</span>
    <button onclick="window.print()">Print / Simpan sebagai PDF</button>
  </div>

  <div class="sheet">
    <img class="logo" src="data:image/png;base64,${LOGO_BASE64}" alt="DETECH">
    <div class="headbar"></div>
    <h1>TINJAUAN PERMINTAAN PENGUJIAN</h1>
    <p class="subtitle">TESTING REQUIREMENTS REVIEW</p>

    <div class="info-grid">
      <div class="info-col">
        ${infoRow('Nomor Pekerjaan', 'Job Number', req.job_number)}
        ${infoRow('Tgl. Diterima', 'Received Date', fmtDate(req.received_date))}
        ${infoRow('ID Perusahaan', 'Cust. ID', req.customer_id)}
        ${infoRow('Nama Projek', 'Project Name', req.project_name)}
      </div>
      <div class="info-col">
        ${infoRow('Perusahaan', 'Company', req.company)}
        ${infoRow('No. PO', 'PO. No.', req.po_number)}
        ${infoRow('Atas Nama Perusahaan', 'On Behalf Owner', req.on_behalf_owner)}
        ${infoRow('Alamat', 'Address', req.address)}
        ${infoRow('No. Telepon', 'Phone No.', req.phone)}
      </div>
    </div>

    <table class="form-table">
      <tr><th style="width:60%">DESKRIPSI <i>(DESCRIPTION)</i></th><th>KETERANGAN <i>(REMARKS)</i></th></tr>
      <tr><td>Nilai ketidakpastian perlu diklarifikasi / <i>Uncertainties need for clarifications</i></td><td>${ynText(req.uncertainty_clarification)}</td></tr>
      <tr><td>Kemampuan metode uji yang tersedia / <i>Capability test methods used</i></td><td>${ynText(req.capability_test_methods)}</td></tr>
      <tr><td>Perbedaan kontrak yang perlu diselesaikan / <i>Differences to be resolved</i></td><td>${ynText(req.contract_differences)}</td></tr>
      <tr><td>Ketersediaan peralatan dan fasilitas / <i>Availability of equipment and facilities</i></td><td>${ynText(req.equipment_availability)}</td></tr>
      <tr><td>Pelaksanaan pengujian / <i>Test execution</i></td><td>${esc(req.witness_status) || '-'}${req.witness_date ? ', Date: ' + fmtDate(req.witness_date) : ''}</td></tr>
      <tr><td>Benda uji / <i>Specimen</i></td><td>${esc(req.specimen_status) || '-'}</td></tr>
      <tr><td>Target penyelesaian LHU / <i>LHU completion target</i></td><td>${req.lhu_target_date ? 'Date: ' + fmtDate(req.lhu_target_date) : '-'}</td></tr>
      <tr><td>Penanganan LHU / <i>LHU handling</i></td><td>${esc(req.lhu_handling) || '-'}</td></tr>
    </table>

    <table class="coupon-table">
      <thead>
        <tr>
          <th class="no-col" rowspan="2">NO.<i>(NO.)</i></th>
          <th class="desk-col" rowspan="2">DESKRIPSI<i>(DESCRIPTION)</i></th>
          <th colspan="3">KETERANGAN <i>(REMARKS)</i></th>
          <th class="metode-col" rowspan="2">METODE TES<i>(TEST METHOD)</i></th>
        </tr>
        <tr>
          <th class="cek-col">Beri tanda &radic;</th>
          <th class="jenis-col">JENIS PENGUJIAN<i>(TYPE OF TESTING)</i></th>
          <th class="jml-col">JUMLAH<i>(QTY)</i></th>
        </tr>
      </thead>
      ${tbodies}
    </table>

    <div class="bottom-grid">
      <div class="note-box">
        <div class="title">Catatan :</div>
        ${NOTE_TEXT}
      </div>
      <div class="sig-box">
        <div class="sig-head"><div>Pelanggan <i>(Customer)</i></div><div>Diterima Oleh <i>(Received By)</i></div></div>
        <div class="sig-body">
          <div class="sig-cell">
            ${req.customer_signature ? `<img class="sig-img" src="${esc(req.customer_signature)}" alt="">` : ''}
            <div>Nama <i>(Name)</i> : ${esc(req.customer_name)}</div>
            <div>Tgl <i>(Date)</i> : ${fmtDate(req.customer_date)}</div>
          </div>
          <div class="sig-cell">
            ${req.received_by_signature ? `<img class="sig-img" src="${esc(req.received_by_signature)}" alt="">` : ''}
            <div>Nama <i>(Name)</i> : ${esc(req.received_by_name)}</div>
            <div>Tgl <i>(Date)</i> : ${fmtDate(req.received_by_date)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <span>Hal. (page) : ..... / .....</span>
      <span>Form No.: DPI-LP-FR-24, Rev.4, Date of Issued 01/08/2022</span>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderPrintHtml };

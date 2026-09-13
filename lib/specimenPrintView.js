// Halaman cetak Pengecekan Spesimen (DPI-LP-FR-26-1..4) — rendered as HTML then
// print/save-as-PDF via browser, sama seperti printView.js & workOrderPrintView.js.
// Ada 4 layout tetap (Tensile Flat, Tensile Round, Bending, Charpy Impact); Kode
// Acuan/standar cuma data di header, tidak pernah mengubah bentuk tabelnya.
const { LOGO_BASE64, esc, fmtDate } = require('./printCommon');

const TITLES = {
  tensile: { flat: 'TENSILE FLAT', round: 'TENSILE ROUND' },
  bending: { flat: 'BENDING', round: 'BENDING' },
  charpy: { flat: 'CHARPY IMPACT', round: 'CHARPY IMPACT' }
};

const FORM_NOS = {
  tensile: { flat: 'DPI-LP-FR-26-1', round: 'DPI-LP-FR-26-4' },
  bending: { flat: 'DPI-LP-FR-26-2', round: 'DPI-LP-FR-26-2' },
  charpy: { flat: 'DPI-LP-FR-26-3', round: 'DPI-LP-FR-26-3' }
};

function num(v) { return (v === undefined || v === null || v === '') ? '' : esc(v); }
function ynBox(v) { return v === 'Y' ? '&#9746; Y' : v === 'N' ? '&#9746; N' : '&#9744; Y &#9744; N'; }

function tensileFlatRows(rows) {
  return rows.map((r, idx) => {
    const m = r.measurements || {};
    const points = (m.points && m.points.length) ? m.points : [{}];
    const span = points.length;
    return points.map((p, i) => `<tr>
      ${i === 0 ? `<td rowspan="${span}">${esc(r.marking_specimen)}</td><td rowspan="${span}">${esc(r.type_lt)}</td>` : ''}
      <td class="pt-col">${String.fromCharCode(65 + i)}</td>
      <td>${num(p.width)}</td>
      <td>${num(p.thickness)}</td>
      <td>${num(p.area)}</td>
      ${i === 0 ? `
        <td rowspan="${span}">${num(m.gauge_length_code)}</td><td rowspan="${span}">${num(m.gauge_length_actual)}</td>
        <td rowspan="${span}">${num(m.width_code)}</td><td rowspan="${span}">${num(m.width_actual)}</td>
        <td rowspan="${span}">${num(m.thickness_code)}</td><td rowspan="${span}">${num(m.thickness_actual)}</td>
        <td rowspan="${span}">${num(m.radius_code)}</td><td rowspan="${span}">${num(m.radius_actual)}</td>
        <td rowspan="${span}">${num(m.reduce_section_code)}</td><td rowspan="${span}">${num(m.reduce_section_actual)}</td>
        <td rowspan="${span}">${num(m.total_length_code)}</td><td rowspan="${span}">${num(m.total_length_actual)}</td>
      ` : ''}
    </tr>`).join('');
  }).join('');
}

function tensileFlatTable(rows) {
  return `
    <table class="spec-table">
      <thead>
        <tr>
          <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>L/T</th>
          <th colspan="4">3 Point Measurement</th>
          <th colspan="12">Actual Measurement</th>
        </tr>
        <tr>
          <th>Point</th><th>Width</th><th>Thickness</th><th>Area</th>
          <th colspan="2">Gauge Length</th><th colspan="2">Width</th><th colspan="2">Thickness</th>
          <th colspan="2">Radius</th><th colspan="2">Reduce Section Length</th><th colspan="2">Total Length</th>
        </tr>
        <tr class="code-row">
          <th></th><th></th><th></th><th></th><th></th>
          <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
          <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
        </tr>
      </thead>
      <tbody>${tensileFlatRows(rows)}</tbody>
    </table>`;
}

function tensileRoundRows(rows) {
  return rows.map((r) => {
    const m = r.measurements || {};
    const points = (m.points && m.points.length) ? m.points : [{}];
    const span = points.length;
    return points.map((p, i) => `<tr>
      ${i === 0 ? `<td rowspan="${span}">${esc(r.marking_specimen)}</td><td rowspan="${span}">${esc(r.type_lt)}</td>` : ''}
      <td class="pt-col">${String.fromCharCode(65 + i)}</td>
      <td>${num(p.diameter)}</td>
      <td>${num(p.area)}</td>
      ${i === 0 ? `
        <td rowspan="${span}">${num(m.gauge_length_code)}</td><td rowspan="${span}">${num(m.gauge_length_actual)}</td>
        <td rowspan="${span}">${num(m.diameter_code)}</td><td rowspan="${span}">${num(m.diameter_actual)}</td>
        <td rowspan="${span}">${num(m.radius_code)}</td><td rowspan="${span}">${num(m.radius_actual)}</td>
        <td rowspan="${span}">${num(m.reduce_section_code)}</td><td rowspan="${span}">${num(m.reduce_section_actual)}</td>
        <td rowspan="${span}">${num(m.total_length_code)}</td><td rowspan="${span}">${num(m.total_length_actual)}</td>
      ` : ''}
    </tr>`).join('');
  }).join('');
}

function tensileRoundTable(rows) {
  return `
    <table class="spec-table">
      <thead>
        <tr>
          <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>L/T</th>
          <th colspan="3">3 Point Measurement</th>
          <th colspan="10">Actual Measurement</th>
        </tr>
        <tr>
          <th>Point</th><th>Diameter</th><th>Area</th>
          <th colspan="2">Gauge Length</th><th colspan="2">Diameter</th>
          <th colspan="2">Radius</th><th colspan="2">Reduce Section Length</th><th colspan="2">Total Length</th>
        </tr>
        <tr class="code-row">
          <th></th><th></th><th></th>
          <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
          <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
        </tr>
      </thead>
      <tbody>${tensileRoundRows(rows)}</tbody>
    </table>`;
}

function bendingFlatTable(rows) {
  const body = rows.map(r => {
    const m = r.measurements || {};
    return `<tr>
      <td>${esc(r.marking_specimen)}</td><td>${esc(r.type_lt)}</td>
      <td>${num(m.width_code)}</td><td>${num(m.width_actual)}</td>
      <td>${num(m.thickness_code)}</td><td>${num(m.thickness_actual)}</td>
      <td>${num(m.radius_code)}</td><td>${num(m.radius_actual)}</td>
      <td>${num(m.length_code)}</td><td>${num(m.length_actual)}</td>
      <td>${esc(r.accepted)}</td>
    </tr>`;
  }).join('');
  return `
    <table class="spec-table">
      <thead>
        <tr>
          <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>(L/T)</th>
          <th colspan="2">Width</th><th colspan="2">Thickness</th><th colspan="2">Radius</th><th colspan="2">Length</th>
          <th rowspan="2">Accepted<br>Y/N</th>
        </tr>
        <tr class="code-row">
          <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function bendingRoundTable(rows) {
  const body = rows.map(r => {
    const m = r.measurements || {};
    return `<tr>
      <td>${esc(r.marking_specimen)}</td><td>${esc(r.type_lt)}</td>
      <td>${num(m.diameter_code)}</td><td>${num(m.diameter_actual)}</td>
      <td>${num(m.length_code)}</td><td>${num(m.length_actual)}</td>
      <td>${esc(r.accepted)}</td>
    </tr>`;
  }).join('');
  return `
    <table class="spec-table">
      <thead>
        <tr>
          <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>(L/T)</th>
          <th colspan="2">Diameter</th><th colspan="2">Length</th>
          <th rowspan="2">Accepted<br>Y/N</th>
        </tr>
        <tr class="code-row"><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th></tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function charpyTable(rows) {
  const chk = v => v ? '&#8730;' : '';
  const body = rows.map(r => {
    const m = r.measurements || {};
    return `<tr>
      <td>${esc(r.marking_specimen)}</td><td>${esc(r.type_lt)}</td><td>${esc(r.location)}</td>
      <td>${num(m.length_code)}</td><td>${num(m.length_actual)}</td>
      <td>${num(m.width_code)}</td><td>${num(m.width_actual)}</td>
      <td>${num(m.thickness_code)}</td><td>${num(m.thickness_actual)}</td>
      <td>${num(m.v_notch_l)}</td><td>${num(m.v_notch_r)}</td>
      <td>${chk(m.profile_radius)}</td><td>${chk(m.profile_depth)}</td><td>${chk(m.profile_width)}</td>
      <td>${esc(r.accepted)}</td>
    </tr>`;
  }).join('');
  return `
    <table class="spec-table">
      <thead>
        <tr>
          <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>(L/T)</th><th rowspan="2">Location<br>BM/WM/FL</th>
          <th colspan="2">Length</th><th colspan="2">Width</th><th colspan="2">Thickness</th>
          <th colspan="2">Center V-Notch</th><th colspan="3">Profile Projector Check</th>
          <th rowspan="2">Accepted<br>Y/N</th>
        </tr>
        <tr class="code-row">
          <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
          <th>L</th><th>R</th><th>Radius</th><th>Depth</th><th>Width</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function tableFor(insp) {
  const rows = insp.rows || [];
  if (insp.category === 'tensile') return insp.shape === 'round' ? tensileRoundTable(rows) : tensileFlatTable(rows);
  if (insp.category === 'bending') return insp.shape === 'round' ? bendingRoundTable(rows) : bendingFlatTable(rows);
  return charpyTable(rows);
}

function infoRow(label, value) {
  return `<div class="info-row"><span class="lbl">${label}</span><span class="colon">:</span><span class="val">${value}</span></div>`;
}

function renderSpecimenPrintHtml(insp) {
  const tr = insp.test_request || {};
  const title = (TITLES[insp.category] || {})[insp.shape || 'flat'] || 'SPESIMEN';
  const formNo = (FORM_NOS[insp.category] || {})[insp.shape || 'flat'] || '';

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${esc(tr.job_number || 'Pengecekan Spesimen')} - ${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 13mm 12mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 8.6pt; background: #ddd; }
  .toolbar { position: sticky; top: 0; background: #0E3270; color: #fff; padding: 10px 16px;
             display: flex; justify-content: space-between; align-items: center; z-index: 10; }
  .toolbar button { background: #AA0000; border: none; padding: 8px 18px; font-weight: bold;
             border-radius: 4px; cursor: pointer; font-size: 10pt; }
  .sheet { max-width: 297mm; margin: 16px auto; padding: 13mm 12mm 16mm; background: #fff;
           box-shadow: 0 0 8px rgba(0,0,0,.25); }

  .logo { height: 42px; display: block; }
  .headbar { height: 4px; background: #0E3270; margin: 6px 0 10px; }
  h1 { text-align: center; font-size: 15pt; margin: 0 0 2px; letter-spacing: .5px; }
  h2 { text-align: center; font-size: 10pt; font-style: italic; font-weight: normal; margin: 0 0 12px; }

  .info-grid-3 { display: flex; gap: 18px; margin-bottom: 12px; }
  .info-col { flex: 1; min-width: 0; }
  .info-row { display: flex; font-size: 8.6pt; margin-bottom: 3px; }
  .info-row .lbl { font-weight: bold; width: 108px; flex-shrink: 0; }
  .info-row .colon { width: 8px; flex-shrink: 0; }
  .info-row .val { flex: 1; word-break: break-word; }

  table.spec-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 14px; }
  table.spec-table th, table.spec-table td { border: 1px solid #333; padding: 3px 5px; text-align: center; vertical-align: middle; }
  table.spec-table thead th { background: #EAEAEA; font-weight: bold; }
  table.spec-table .pt-col { width: 26px; }
  table.spec-table tbody td:first-child { text-align: left; }

  .approval-wrap { break-inside: avoid; page-break-inside: avoid; margin-top: 20px; }
  table.approval-table { width: 40%; border-collapse: collapse; font-size: 8.6pt; }
  table.approval-table th, table.approval-table td { border: 1px solid #333; text-align: center; vertical-align: top; }
  table.approval-table th { background: #EAEAEA; font-weight: bold; padding: 5px; }
  .approval-sig { height: 60px; }
  .sig-img { max-height: 55px; max-width: 100%; object-fit: contain; }
  .approval-name { padding: 4px; font-size: 8.2pt; min-height: 14px; }

  .footer { margin-top: 14px; font-size: 7.3pt; border-top: 1px solid #333; padding-top: 3px;
            display: flex; justify-content: space-between; }

  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { box-shadow: none; margin: 0; padding: 0; max-width: none; }
    .footer { position: fixed; bottom: 4mm; left: 0; right: 0; margin-top: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span>Pengecekan Spesimen &mdash; ${esc(tr.job_number || '')}</span>
    <button onclick="window.print()">Print / Simpan sebagai PDF</button>
  </div>

  <div class="sheet">
    <img class="logo" src="data:image/png;base64,${LOGO_BASE64}" alt="DETECH">
    <div class="headbar"></div>
    <h1>PENGECEKAN SPESIMEN ${esc(title)}</h1>
    <h2>SPECIMEN INSPECTION of ${esc(title)}</h2>

    <div class="info-grid-3">
      <div class="info-col">
        ${infoRow('Tanggal (Date)', fmtDate(insp.inspection_date))}
        ${infoRow('No. Pekerjaan (Job No.)', esc(tr.job_number))}
      </div>
      <div class="info-col">
        ${infoRow('Pelanggan (Customer)', esc(tr.on_behalf_owner))}
        ${infoRow('Kode Acuan (Ref. Code)', esc(insp.ref_code))}
      </div>
      <div class="info-col">
        ${infoRow('Tipe Spesimen (Type)', esc(insp.type_of_specimen))}
        ${infoRow('Marking (Marking)', esc(insp.marking || insp.sample_marking || tr.customer_id))}
      </div>
    </div>

    ${tableFor(insp)}

    <div class="approval-wrap">
      <table class="approval-table">
        <tr><th>Inspected by</th><th>Approved by</th></tr>
        <tr>
          <td class="approval-sig">${insp.inspected_by_signature ? `<img class="sig-img" src="${esc(insp.inspected_by_signature)}" alt="">` : ''}</td>
          <td class="approval-sig">${insp.approved_by_signature ? `<img class="sig-img" src="${esc(insp.approved_by_signature)}" alt="">` : ''}</td>
        </tr>
        <tr>
          <td class="approval-name">${esc(insp.inspected_by_name)}</td>
          <td class="approval-name">${esc(insp.approved_by_name)}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <span>Hal. (page) : 1/1</span>
      <span>Form No.: ${esc(formNo)}, Rev. 1, Date of Issued 04/08/2022</span>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderSpecimenPrintHtml };

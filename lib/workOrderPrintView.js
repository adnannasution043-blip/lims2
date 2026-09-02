// Halaman cetak Work Order (DPI-LP-FR-25 Rev.3), dirender sebagai HTML lalu di-print/
// simpan-sebagai-PDF lewat browser — sama seperti lib/printView.js untuk Tinjauan
// Permintaan Pengujian. Data pelanggan & coupon test dibaca dari test_request yang terkait
// (work_order 1:1 ke test_request); hanya field khas Work Order yang disimpan sendiri.
const { PROCESS_STEPS } = require('../db/workOrderSteps');
const { LOGO_BASE64, esc, fmtDate } = require('./printCommon');

function sampleIdHtml(row) {
  const types = row.coupon_type || [];
  const other = row.coupon_type_other || '';
  const otherLower = other.toLowerCase();
  const isJointPipe = otherLower.includes('joint pipe');
  const isJointPlate = otherLower.includes('joint plate');
  const hasPipe = types.includes('Pipe');
  const hasPlate = types.includes('Plate');

  const extras = [];
  if (types.includes('Bolt/Nut')) extras.push('Bolt/Nut');
  if (other && !isJointPipe && !isJointPlate) extras.push(esc(other));

  const box = (checked, label) => `<span class="cbx">${checked ? '&#9746;' : '&#9744;'} ${label}</span>`;
  return `
    <div>${box(hasPipe, 'Pipe')} ${box(hasPlate, 'Plate')}</div>
    <div>${box(isJointPipe, 'Joint Pipe')} ${box(isJointPlate, 'Joint Plate')}</div>
    ${extras.length ? `<div class="extra">${extras.join(', ')}</div>` : ''}
  `;
}

function materialSizeText(row) {
  const parts = [];
  if (row.outside_diameter || row.thickness) {
    let p = '';
    if (row.outside_diameter) p += `OD. ${esc(row.outside_diameter)} mm`;
    if (row.thickness) p += (p ? ' ' : '') + `with Thickness ${esc(row.thickness)} mm`;
    parts.push(p);
  }
  const weld = [row.welding_process, row.welding_position].filter(Boolean).map(esc).join(' ');
  if (weld) parts.push(weld);
  if (row.no_wps) parts.push(`No. WPS : ${esc(row.no_wps)}`);
  if (row.note) parts.push(esc(row.note));
  return parts.join(', ') || '-';
}

function testTypeLabel(ti, row) {
  if (ti.test_name !== 'Charpy Impact Test') return esc(ti.test_name);
  const t = row.charpy_temp ? esc(row.charpy_temp) : '..........';
  const wm = row.charpy_wm ? esc(row.charpy_wm) : '......';
  const bm = row.charpy_bm ? esc(row.charpy_bm) : '......';
  const haz = row.charpy_haz ? esc(row.charpy_haz) : '......';
  return `Charpy Impact Test, T&deg; : ${t}<br>WM : ${wm}&nbsp;&nbsp;BM : ${bm}&nbsp;&nbsp;HAZ : ${haz}`;
}

function woBlock(row, idx, sampleMarking) {
  const checkedItems = (row.test_items || []).filter(ti => ti.checked);
  const items = checkedItems.length ? checkedItems : [{ test_name: '-', qty: '', method: '' }];
  const span = items.length;

  const rows = items.map((ti, i) => {
    const firstCells = i === 0 ? `
      <td class="no-col" rowspan="${span}">${idx + 1}.</td>
      <td class="sampleid-col" rowspan="${span}">${sampleIdHtml(row)}</td>
      <td class="ref-col" rowspan="${span}">${esc(row.ref_code) || '-'}</td>
      <td class="matsize-col" rowspan="${span}">${materialSizeText(row)}</td>
      <td class="matspec-col" rowspan="${span}">${esc(row.material_type_grade) || '-'}</td>
      <td class="marking-col" rowspan="${span}">${esc(sampleMarking)}</td>
    ` : '';
    return `<tr>${firstCells}
      <td class="test-col">${testTypeLabel(ti, row)}</td>
      <td class="qty-col">${esc(ti.qty)}</td>
      <td class="remarks-col">${esc(ti.method)}</td>
    </tr>`;
  }).join('');

  return `<tbody class="wo-block">${rows}</tbody>`;
}

function infoRow(label, value) {
  return `<div class="info-row"><span class="lbl">${label}</span><span class="colon">:</span><span class="val">${value}</span></div>`;
}

function renderWorkOrderPrintHtml(wo) {
  const tr = wo.test_request || {};
  const couponRows = (wo.coupon_tests && wo.coupon_tests.length) ? wo.coupon_tests : [{ test_items: [] }];

  const tbodies = couponRows.map((row, idx) => woBlock(row, idx, row.sample_marking || '')).join('');

  const witnessYes = tr.witness_status === 'Witness';
  const witnessNo = tr.witness_status === 'Not Witness';

  const processRows = PROCESS_STEPS.map(step => `
    <tr><td class="proc-label">${step.label}</td><td class="proc-pic">${esc(wo[step.key])}</td><td class="proc-sign"></td></tr>
  `).join('');

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${esc(tr.job_number || 'Work Order')} - Work Order</title>
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
  h1 { text-align: center; font-size: 16pt; margin: 0 0 12px; letter-spacing: .5px; }

  .info-grid-3 { display: flex; gap: 18px; margin-bottom: 10px; }
  .info-col { flex: 1; min-width: 0; }
  .info-row { display: flex; font-size: 8.6pt; margin-bottom: 3px; }
  .info-row .lbl { font-weight: bold; width: 108px; flex-shrink: 0; }
  .info-row .colon { width: 8px; flex-shrink: 0; }
  .info-row .val { flex: 1; word-break: break-word; }

  table.wo-table { width: 100%; border-collapse: collapse; font-size: 8.2pt; table-layout: fixed; margin-bottom: 12px; }
  table.wo-table th, table.wo-table td { border: 1px solid #333; padding: 3px 5px; vertical-align: top; word-wrap: break-word; }
  table.wo-table thead { display: table-header-group; }
  table.wo-table th { background: #EAEAEA; font-weight: bold; text-align: center; }
  .wo-block { break-inside: avoid; page-break-inside: avoid; }
  .no-col { width: 30px; padding-left: 2px !important; padding-right: 2px !important; text-align: center; font-weight: bold; }
  .sampleid-col { width: 92px; }
  .cbx { white-space: nowrap; display: inline-block; }
  .sampleid-col .extra { margin-top: 2px; font-style: italic; }
  .ref-col { width: 78px; }
  .matsize-col { width: 150px; }
  .matspec-col { width: 92px; }
  .marking-col { width: 66px; }
  .qty-col { width: 40px; text-align: center; }
  .remarks-col { width: 88px; }

  table.process-table { width: 100%; border-collapse: collapse; font-size: 8.3pt; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
  table.process-table th, table.process-table td { border: 1px solid #333; padding: 4px 7px; text-align: left; }
  table.process-table th { background: #EAEAEA; font-weight: bold; }
  .proc-label { width: 32%; font-weight: bold; }
  .proc-pic { width: 48%; }
  .proc-sign { width: 20%; }

  .approval-wrap { break-inside: avoid; page-break-inside: avoid; }
  .approval-date { font-size: 8.6pt; font-weight: bold; margin-bottom: 4px; }
  table.approval-table { width: 100%; border-collapse: collapse; font-size: 8.6pt; }
  table.approval-table th, table.approval-table td { border: 1px solid #333; text-align: center; vertical-align: top; }
  table.approval-table th { background: #EAEAEA; font-weight: bold; padding: 5px; }
  .approval-sig { height: 60px; }
  .approval-name { padding: 4px; font-size: 8.2pt; min-height: 14px; }
  .approval-role { padding: 5px; font-weight: bold; font-size: 8.2pt; }

  .footer { margin-top: 10px; font-size: 7.3pt; border-top: 1px solid #333; padding-top: 3px;
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
    <span>Work Order &mdash; ${esc(tr.job_number || '')}</span>
    <button onclick="window.print()">Print / Simpan sebagai PDF</button>
  </div>

  <div class="sheet">
    <img class="logo" src="data:image/png;base64,${LOGO_BASE64}" alt="DETECH">
    <div class="headbar"></div>
    <h1>WORK ORDER</h1>

    <div class="info-grid-3">
      <div class="info-col">
        ${infoRow('Job Number', esc(tr.job_number))}
        ${infoRow('Request Date', fmtDate(tr.received_date))}
        ${infoRow('Testing Date', fmtDate(wo.testing_date))}
      </div>
      <div class="info-col">
        ${infoRow('Customer Name', esc(tr.company))}
        ${infoRow('On Behalf Owner', esc(tr.on_behalf_owner))}
        ${infoRow('Customer ID', esc(tr.customer_id))}
        ${infoRow('Contact Person', esc(wo.contact_person))}
      </div>
      <div class="info-col">
        ${infoRow('Customer Witness', `${witnessYes ? '&#9746;' : '&#9744;'} Yes &nbsp; ${witnessNo ? '&#9746;' : '&#9744;'} No`)}
        ${infoRow('Our Reference', esc(wo.our_reference))}
        ${infoRow('Project', esc(tr.project_name))}
      </div>
    </div>

    <table class="wo-table">
      <thead>
        <tr>
          <th class="no-col">No.</th>
          <th class="sampleid-col">Sample Identification</th>
          <th class="ref-col">Reff. Code</th>
          <th class="matsize-col">Material Size</th>
          <th class="matspec-col">Material Specification</th>
          <th class="marking-col">Sample Marking</th>
          <th class="test-col">Type of Test</th>
          <th class="qty-col">Qty of Test</th>
          <th class="remarks-col">Remarks</th>
        </tr>
      </thead>
      ${tbodies}
    </table>

    <table class="process-table">
      <tr><th>Description of process</th><th>PIC</th><th>Sign</th></tr>
      ${processRows}
    </table>

    <div class="approval-wrap">
      <div class="approval-date">Date : ${fmtDate(wo.approval_date)}</div>
      <table class="approval-table">
        <tr><th>Prepared by</th><th>Checked by</th><th>Approved by</th></tr>
        <tr>
          <td class="approval-sig"></td><td class="approval-sig"></td><td class="approval-sig"></td>
        </tr>
        <tr>
          <td class="approval-name">${esc(wo.prepared_by_name)}</td>
          <td class="approval-name">${esc(wo.checked_by_name)}</td>
          <td class="approval-name">${esc(wo.approved_by_name)}</td>
        </tr>
        <tr>
          <td class="approval-role">QA / QC Admin</td>
          <td class="approval-role">QA / QC Manager</td>
          <td class="approval-role">Technical Manager</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <span>Hal. (page) : ..... / .....</span>
      <span>Form No.: DPI-LP-FR-25, Rev.3, Date of Issued 10/06/2022</span>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderWorkOrderPrintHtml };

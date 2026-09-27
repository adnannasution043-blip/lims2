// Laporan Hasil Uji (Testing Report) — dicetak dari Lembar Hasil Uji tahap Testing.
// category='bending' mengikuti isi form resmi Detech DE.1/TR/02/BEND.SEC (Job No, data material/las,
// dimensi bend, hasil per spesimen, Term & Conditions, tanda tangan). Kategori lain memakai tata letak
// yang sama tapi tanpa bagian dimensi bend, sampai form resminya tersedia — nomor form ditandai "Umum".
const { LOGO_BASE64, esc, fmtDate } = require('./printCommon');

const FORM_NO = {
  bending: 'DE.1/TR/02/BEND.SEC, Rev.3; Date of Issued 10-06-2025'
};

const RESULT_LABEL = { accepted: 'Accepted', rejected: 'Rejected', '': '-' };

const TERMS = [
  'The report is prepared by DETECH, printed once, in accordance with the client request and refers to the regulatory requirements when testing.',
  'The result in this report only apply to the specimen tested and are not used to represent the same thing, or is used for other uses outside the request for issuance of this report.',
  'DETECH agrees to carry out appropriate testing procedures but does not guarantee directly or indirectly related to the results of reports and equipment.',
  'Reports may not be produced in part or in full without permission from DETECH.',
  'DETECH is not responsible for losses incurred due to mistakes in work agreements, material or non-material losses, lawsuits (including negligence or breach of regulations) and contract disputes between client and agent.'
];

function infoRow(label, value) {
  return `<div class="info-row"><span class="lbl">${esc(label)}</span><span class="colon">:</span><span class="val">${esc(value) || '-'}</span></div>`;
}

function dimCell(label, code, actual) {
  return `
    <tr><td class="dim-lbl">${esc(label)}</td><td>${esc(code) || '-'}</td><td>${esc(actual) || '-'}</td></tr>`;
}

function renderTestReportPrintHtml(r) {
  const tr = r.test_request || {};
  const coupon = r.coupon || {};
  const isBending = r.category === 'bending';
  const formNo = FORM_NO[r.category] || 'DE.1/TR/XX/UMUM (belum ada form resmi)';
  const couponTypeText = [...(coupon.coupon_type || []), coupon.coupon_type_other || ''].filter(Boolean).join(', ') || coupon.material_type_grade || '-';

  const rowsHtml = (r.rows || []).map(row => `
    <tr>
      <td>${esc(row.marking_specimen)}</td>
      <td>${esc(row.observation) || '-'}</td>
      <td class="result-${esc(row.result) || 'na'}">${esc(RESULT_LABEL[row.result] ?? '-')}</td>
    </tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada data spesimen.</td></tr>';

  const dimensionsBlock = isBending ? `
    <p class="section-title">Dimensi Pengujian Bend</p>
    <table class="dim-table">
      <thead><tr><th></th><th>Code</th><th>Actual</th></tr></thead>
      <tbody>
        ${dimCell('Test Specimen Width (mm)', r.specimen_width_code, r.specimen_width_actual)}
        ${dimCell('Former Diameter (mm)', r.former_diameter_code, r.former_diameter_actual)}
        ${dimCell('Bend Angle (Degree)', r.bend_angle_code || '180', r.bend_angle_actual)}
        ${dimCell('Shoulder Distance (mm)', r.shoulder_distance_code, r.shoulder_distance_actual)}
      </tbody>
    </table>` : '';

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${esc(tr.job_number || 'Laporan Hasil Uji')} - ${esc(r.title)}</title>
<style>
  @page { size: A4 portrait; margin: 15mm 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 9pt; background: #ddd; }
  .toolbar { position: sticky; top: 0; background: #0E3270; color: #fff; padding: 10px 16px;
             display: flex; justify-content: space-between; align-items: center; z-index: 10; }
  .toolbar button { background: #AA0000; border: none; padding: 8px 18px; font-weight: bold;
             border-radius: 4px; cursor: pointer; font-size: 10pt; }
  .sheet { max-width: 210mm; margin: 16px auto; padding: 15mm 14mm 16mm; background: #fff;
           box-shadow: 0 0 8px rgba(0,0,0,.25); }

  .logo { height: 42px; display: block; }
  .headbar { height: 4px; background: #0E3270; margin: 6px 0 10px; }
  h1 { text-align: center; font-size: 14pt; margin: 0 0 2px; letter-spacing: .5px; }
  h2 { text-align: center; font-size: 9.5pt; font-style: italic; font-weight: normal; margin: 0 0 12px; color: #444; }

  .info-grid-2 { display: flex; gap: 20px; margin-bottom: 12px; }
  .info-col { flex: 1; min-width: 0; }
  .info-row { display: flex; font-size: 8.8pt; margin-bottom: 3px; }
  .info-row .lbl { font-weight: bold; width: 150px; flex-shrink: 0; }
  .info-row .colon { width: 8px; flex-shrink: 0; }
  .info-row .val { flex: 1; word-break: break-word; }

  .section-title { font-size: 9.5pt; font-weight: bold; color: #0E3270; margin: 14px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; }

  table.dim-table, table.result-table { width: 100%; border-collapse: collapse; font-size: 8.6pt; margin-bottom: 6px; }
  table.dim-table th, table.dim-table td, table.result-table th, table.result-table td {
    border: 1px solid #333; padding: 4px 6px; text-align: center; vertical-align: middle;
  }
  table.dim-table thead th, table.result-table thead th { background: #EAEAEA; font-weight: bold; }
  table.dim-table td.dim-lbl { text-align: left; font-weight: 600; }
  table.result-table td:first-child { text-align: left; font-weight: 600; }
  table.result-table td:nth-child(2) { text-align: left; }
  td.result-accepted { color: #1e7a3d; font-weight: bold; }
  td.result-rejected { color: #b3341d; font-weight: bold; }

  .terms { font-size: 7.6pt; color: #333; margin: 14px 0; line-height: 1.5; }
  .terms b { display: block; margin-bottom: 3px; }
  .terms ol { margin: 0; padding-left: 16px; }

  .approval-wrap { break-inside: avoid; page-break-inside: avoid; margin-top: 16px; }
  table.approval-table { width: 100%; border-collapse: collapse; font-size: 8.6pt; }
  table.approval-table th, table.approval-table td { border: 1px solid #333; text-align: center; vertical-align: top; }
  table.approval-table th { background: #EAEAEA; font-weight: bold; padding: 5px; }
  .approval-sig { height: 55px; }
  .sig-img { max-height: 50px; max-width: 100%; object-fit: contain; }
  .approval-name { padding: 4px; font-size: 8.2pt; min-height: 14px; }

  .footer { margin-top: 14px; font-size: 7.2pt; border-top: 1px solid #333; padding-top: 3px; }
  .footer .company { font-weight: bold; }

  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { box-shadow: none; margin: 0; padding: 0; max-width: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span>Laporan Hasil Uji &mdash; ${esc(tr.job_number || '')}</span>
    <button onclick="window.print()">Print / Simpan sebagai PDF</button>
  </div>

  <div class="sheet">
    <img class="logo" src="data:image/png;base64,${LOGO_BASE64}" alt="DETECH">
    <div class="headbar"></div>
    <h1>LAPORAN HASIL UJI</h1>
    <h2>${esc(r.title)}</h2>

    <div class="info-grid-2">
      <div class="info-col">
        ${infoRow('Job No.', tr.job_number)}
        ${infoRow('Report No.', r.report_no)}
        ${infoRow('Date of Received', fmtDate(tr.received_date))}
        ${infoRow('Date of Tested', fmtDate(r.date_tested))}
        ${infoRow('Customer', tr.company)}
        ${infoRow('Address', tr.address)}
        ${infoRow('PO No.', tr.po_number)}
        ${infoRow('Project Name', tr.project_name)}
      </div>
      <div class="info-col">
        ${infoRow('Object to be Tested', couponTypeText)}
        ${infoRow('Sample Marking', r.sample_marking)}
        ${infoRow('WPS No', coupon.no_wps)}
        ${infoRow('Material Type/Grade', coupon.material_type_grade)}
        ${infoRow('Material Size', coupon.material_size)}
        ${infoRow('Test Weldment Thickness', coupon.thickness)}
        ${infoRow('Welding Position', coupon.welding_position)}
        ${infoRow('Welding Process', coupon.welding_process)}
      </div>
    </div>

    <div class="info-grid-2">
      <div class="info-col">
        ${infoRow('Environment Temp', r.environment_temp || '25 ± 2 ºC')}
        ${infoRow('Type of Test', r.title)}
        ${infoRow('Test Method', r.test_method || r.method)}
      </div>
      <div class="info-col">
        ${infoRow('Reference Code', r.reference_code)}
        ${infoRow('Testing Purpose', r.testing_purpose)}
      </div>
    </div>

    ${dimensionsBlock}

    <p class="section-title">Hasil per Spesimen</p>
    <table class="result-table">
      <thead><tr><th>Specimen No.</th><th>Observation</th><th>Result</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="info-grid-2">
      <div class="info-col">
        ${infoRow('Testing Machine Used', r.testing_machine || 'Hydraulic Press Machine, Capacity : 400 Bar')}
        ${infoRow("Welder's Name", r.welder_name)}
      </div>
      <div class="info-col">
        ${infoRow('Witnessed By', r.witnessed_by)}
        ${infoRow('Remarks', r.remarks)}
      </div>
    </div>

    <div class="terms">
      <b>Term &amp; Conditions</b>
      <ol>${TERMS.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
    </div>

    <div class="approval-wrap">
      <table class="approval-table">
        <tr><th>Test Conducted by</th><th>Witnessed By</th><th>Approved Signatory</th></tr>
        <tr>
          <td class="approval-sig"></td>
          <td class="approval-sig"></td>
          <td class="approval-sig">${r.approved_signatory && r.approved_signatory.signature ? `<img class="sig-img" src="${esc(r.approved_signatory.signature)}" alt="">` : ''}</td>
        </tr>
        <tr>
          <td class="approval-name">${esc(r.test_conducted_by || r.testing_pic)}</td>
          <td class="approval-name">${esc(r.witnessed_by)}</td>
          <td class="approval-name">${esc(r.approved_signatory ? r.approved_signatory.name : '')}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <div class="company">PT DETECH PROFESIONAL INDONESIA</div>
      <div>Bizpoint Modern Multi Business, Point 1, Jl. Guangzhou No.10, Sukamulya, Kec. Cikupa, Kabupaten Tangerang, Banten 15710, Telp: +6221 59644285, Email: marketing@detech.co.id</div>
      <div>Form No.: ${esc(formNo)}</div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderTestReportPrintHtml };

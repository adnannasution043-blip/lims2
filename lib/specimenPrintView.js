// Halaman cetak Pengecekan Spesimen (DPI-LP-FR-26-1..4) — rendered as HTML then
// print/save-as-PDF via browser, sama seperti printView.js & workOrderPrintView.js.
// Ada 4 layout tetap (Tensile Flat, Tensile Round, Bending, Charpy Impact); Kode
// Acuan/standar cuma data di header, tidak pernah mengubah bentuk tabelnya.
// Tata letak mengikuti contoh dokumen resmi Detech ("Contoh Pengecekan Specimen ...pdf"):
// tabel info 3 kolom, petunjuk (khusus tensile), gambar, tabel ukur, Note di kiri bawah,
// kotak Inspected/Approved di kanan bawah, lalu footer Hal./Form No. di kiri bawah halaman.
const { LOGO_BASE64, esc } = require('./printCommon');
const SpecimenDiagrams = require('../public/js/specimenDiagrams.js');

const TITLES = {
  tensile: { flat: 'TENSILE FLAT', round: 'TENSILE ROUND' },
  bending: { flat: 'BENDING', round: 'BENDING' },
  charpy: { flat: 'CHARPY IMPACT', round: 'CHARPY IMPACT' },
  nickbreak: { flat: 'NICK BREAK', round: 'NICK BREAK' },
  hic: { flat: 'HIC/SSCC/SCC', round: 'HIC/SSCC/SCC' }
};

const FORM_NOS = {
  tensile: { flat: 'DPI-LP-FR-26-1', round: 'DPI-LP-FR-26-4' },
  bending: { flat: 'DPI-LP-FR-26-2', round: 'DPI-LP-FR-26-2' },
  charpy: { flat: 'DPI-LP-FR-26-3', round: 'DPI-LP-FR-26-3' },
  nickbreak: { flat: 'DPI-LP-FR-26-5', round: 'DPI-LP-FR-26-5' },
  hic: { flat: 'DPI-LP-FR-26-6', round: 'DPI-LP-FR-26-6' }
};

// Revisi & tanggal terbit form (footer). Form HIC/SSCC/SCC lebih baru (Rev. 0, 20/06/2024) daripada keempat form lain.
const FORM_REVISION = { hic: 'Rev. 0, Date of Issued 20/06/2024' };
const DEFAULT_FORM_REVISION = 'Rev. 1, Date of Issued 04/08/2022';

// Template resmi selalu punya baris kosong tersisa di bawah data (form kertas bisa ditambah tangan),
// jadi tabel dilengkapi baris kosong sampai jumlah minimum ini supaya hasil cetak terlihat sama.
const MIN_ROWS = { tensile: 3, bending: 6, charpy: 6, nickbreak: 5, hic: 6 };

const INSTRUCTIONS = [
  ['1. Tandai 3 titik secara acak pada daerah tereduksi', 'mark 3 random points on the reduced area'],
  ['2. Ukur dan catat dimensi lebar dan tebal pada masing-masing titik tersebut', 'measure and record the width and thickness dimensions at each of these points'],
  ['3. Hitung dan catat luasan area pada masing-masing titik tersebut', 'calculate and record the total area at each of these points'],
  ['4. Gunakan data luasan area terkecil sebagai data dimensi spesimen', 'use the smallest area data as the specimen dimension data']
];

function num(v) { return (v === undefined || v === null || v === '') ? '' : esc(v); }

// Tanggal di form resmi memakai 4 digit tahun (06/10/2023), beda dari print lain yang dd/mm/yy.
function fmtDateFull(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(s || '');
}

function padRows(rows, min) {
  const out = rows.slice();
  while (out.length < (min || 0)) out.push(null);
  return out;
}

const blankCells = n => '<td></td>'.repeat(n);

// Satu spesimen tensile = satu blok 3 baris (titik A/B/C); kolom Actual Measurement di-rowspan.
// pointCols = kolom ukur per titik (Flat: width, thickness, area | Round: diameter, area),
// groups = grup Code/Actual pada Actual Measurement.
function tensileBlock(r, pointCols, groups) {
  if (!r) {
    return [0, 1, 2].map(i => `<tr>
      ${i === 0 ? '<td rowspan="3"></td><td rowspan="3"></td>' : ''}
      <td class="pt-col"></td>${blankCells(pointCols.length)}
      ${i === 0 ? '<td rowspan="3"></td>'.repeat(groups.length * 2) : ''}
    </tr>`).join('');
  }
  const m = r.measurements || {};
  const points = (m.points && m.points.length) ? m.points : [{}, {}, {}];
  const span = points.length;
  return points.map((p, i) => `<tr>
    ${i === 0 ? `<td rowspan="${span}">${esc(r.marking_specimen)}</td><td rowspan="${span}">${esc(r.type_lt)}</td>` : ''}
    <td class="pt-col">${String.fromCharCode(65 + i)}</td>
    ${pointCols.map(c => `<td>${num(p[c])}</td>`).join('')}
    ${i === 0 ? groups.map(g => `<td rowspan="${span}">${num(m[g + '_code'])}</td><td rowspan="${span}">${num(m[g + '_actual'])}</td>`).join('') : ''}
  </tr>`).join('');
}

// Header 3 tingkat seperti template resmi: Marking/Type menjangkau ketiga baris, Point/Width/... dua baris,
// baris ketiga hanya Code/Actual — jumlah rowspan yang salah membuat kolom Code/Actual bergeser ke kanan.
function tensileTable(rows, pointHeads, groupHeads) {
  const pointCols = pointHeads.map(h => h[0]);
  const groups = groupHeads.map(h => h[0]);
  return `
    <table class="spec-table plain">
      <thead>
        <tr>
          <th rowspan="3" class="mark-col">Marking Specimen</th><th rowspan="3" class="type-col">Type<br>L / T</th>
          <th colspan="${pointHeads.length + 1}">3 Point Measurement</th>
          <th colspan="${groupHeads.length * 2}">Actual Measurement</th>
        </tr>
        <tr>
          <th rowspan="2" class="pt-head"><span class="vtxt">Point</span></th>
          ${pointHeads.map(h => `<th rowspan="2">${h[1]}</th>`).join('')}
          ${groupHeads.map(h => `<th colspan="2">${h[1]}</th>`).join('')}
        </tr>
        <tr class="code-row">${groupHeads.map(() => '<th>Code</th><th>Actual</th>').join('')}</tr>
      </thead>
      <tbody>${padRows(rows, MIN_ROWS.tensile).map(r => tensileBlock(r, pointCols, groups)).join('')}</tbody>
    </table>`;
}

function tensileFlatTable(rows) {
  return tensileTable(rows,
    [['width', 'Width'], ['thickness', 'Thickness'], ['area', 'Area']],
    [['gauge_length', 'Gauge Length'], ['width', 'Width'], ['thickness', 'Thickness'], ['radius', 'Radius'],
      ['reduce_section', 'Reduce Section Length'], ['total_length', 'Total Length']]);
}

function tensileRoundTable(rows) {
  return tensileTable(rows,
    [['diameter', 'Diameter'], ['area', 'Area']],
    [['gauge_length', 'Gauge Length'], ['diameter', 'Diameter'], ['radius', 'Radius'],
      ['reduce_section', 'Reduce Section Length'], ['total_length', 'Total Length']]);
}

function bendingFlatTable(rows) {
  const body = padRows(rows, MIN_ROWS.bending).map(r => {
    if (!r) return `<tr>${blankCells(11)}</tr>`;
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
    <table class="spec-table tall narrow-bending-flat">
      <thead>
        <tr>
          <th rowspan="2" class="mark-col">Marking Specimen</th><th rowspan="2" class="type-col">Type<br>(L/T)*</th>
          <th colspan="2">Width</th><th colspan="2">Thickness</th><th colspan="2"><i>Radius</i></th><th colspan="2"><i>Length</i></th>
          <th><i>Accepted</i></th>
        </tr>
        <tr class="code-row">
          <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Y/N</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function bendingRoundTable(rows) {
  const body = padRows(rows, MIN_ROWS.bending).map(r => {
    if (!r) return `<tr>${blankCells(7)}</tr>`;
    const m = r.measurements || {};
    return `<tr>
      <td>${esc(r.marking_specimen)}</td><td>${esc(r.type_lt)}</td>
      <td>${num(m.diameter_code)}</td><td>${num(m.diameter_actual)}</td>
      <td>${num(m.length_code)}</td><td>${num(m.length_actual)}</td>
      <td>${esc(r.accepted)}</td>
    </tr>`;
  }).join('');
  return `
    <table class="spec-table tall narrow-bending-round">
      <thead>
        <tr>
          <th rowspan="2" class="mark-col">Marking Specimen</th><th rowspan="2" class="type-col">Type<br>(L/T)*</th>
          <th colspan="2">Diameter</th><th colspan="2"><i>Length</i></th>
          <th><i>Accepted</i></th>
        </tr>
        <tr class="code-row"><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Y/N</th></tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function charpyTable(rows) {
  const chk = v => v ? '&#8730;' : '';
  const body = padRows(rows, MIN_ROWS.charpy).map(r => {
    if (!r) return `<tr>${blankCells(15)}</tr>`;
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
    <table class="spec-table tall">
      <thead>
        <tr>
          <th rowspan="2" class="mark-col">Marking Specimen</th><th rowspan="2" class="type-col">Type<br>(L/T)*</th><th>Location</th>
          <th colspan="2">Length</th><th colspan="2">Width</th><th colspan="2">Thickness</th>
          <th colspan="2">Center V-Notch</th><th colspan="3"><i>Profile Projector Check (&#8730; / X)</i></th>
          <th><i>Accepted</i></th>
        </tr>
        <tr class="code-row">
          <th class="loc-sub">BM, WM, FL, FL2, FL5</th>
          <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
          <th>L</th><th>R</th><th>Radius</th><th>Depth</th><th>Width</th><th>Y/N</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

// Layout umum untuk jenis pengujian yang belum punya form kertas resmi (Hardness, Macro, Microstructure,
// PMI, dst). Bukan salah satu dari 4 form resmi di atas — ganti bila form resminya sudah ada.
function generalTable(rows) {
  const body = rows.map(r => {
    const m = r.measurements || {};
    return `<tr>
      <td>${esc(r.marking_specimen)}</td><td>${esc(r.type_lt)}</td>
      <td>${num(m.length_code)}</td><td>${num(m.length_actual)}</td>
      <td>${num(m.width_code)}</td><td>${num(m.width_actual)}</td>
      <td>${num(m.thickness_code)}</td><td>${num(m.thickness_actual)}</td>
      <td>${esc(r.accepted)}</td>
      <td>${esc(m.note)}</td>
    </tr>`;
  }).join('');
  return `
    <table class="spec-table tall">
      <thead>
        <tr>
          <th rowspan="2" class="mark-col">Marking Specimen</th><th rowspan="2" class="type-col">Type<br>(L/T)*</th>
          <th colspan="2">Length</th><th colspan="2">Width / Diameter</th><th colspan="2">Thickness</th>
          <th rowspan="2">Accepted<br>Y/N</th><th rowspan="2">Remarks</th>
        </tr>
        <tr class="code-row">
          <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

// Form resmi sederhana (Nick Break, HIC/SSCC/SCC): dimensi = pasangan Code/Actual lalu Accepted Y/N.
const SIMPLE_DIMS = {
  nickbreak: [['width', 'Width'], ['thickness', 'Thickness'], ['notch_depth', 'Notch Depth'], ['length', 'Length']],
  hic: [['width', 'Width'], ['thickness', 'Thickness'], ['length', 'Length']]
};

function simpleTable(rows, category) {
  const dims = SIMPLE_DIMS[category];
  const body = padRows(rows, MIN_ROWS[category]).map(r => {
    if (!r) return `<tr>${blankCells(2 + dims.length * 2 + 1)}</tr>`;
    const m = r.measurements || {};
    return `<tr>
      <td>${esc(r.marking_specimen)}</td><td>${esc(r.type_lt)}</td>
      ${dims.map(([k]) => `<td>${num(m[k + '_code'])}</td><td>${num(m[k + '_actual'])}</td>`).join('')}
      <td>${esc(r.accepted)}</td>
    </tr>`;
  }).join('');
  return `
    <table class="spec-table tall narrow-${category}">
      <thead>
        <tr>
          <th rowspan="2" class="mark-col">Marking Specimen</th><th rowspan="2" class="type-col">Type<br>(L/T)*</th>
          ${dims.map(([, label]) => `<th colspan="2">${label}</th>`).join('')}
          <th><i>Accepted</i></th>
        </tr>
        <tr class="code-row">${dims.map(() => '<th>Code</th><th>Actual</th>').join('')}<th>Y/N</th></tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function tableFor(insp) {
  const rows = insp.rows || [];
  if (insp.category === 'nickbreak' || insp.category === 'hic') return simpleTable(rows, insp.category);
  if (insp.category === 'general') return generalTable(rows);
  if (insp.category === 'tensile') return insp.shape === 'round' ? tensileRoundTable(rows) : tensileFlatTable(rows);
  if (insp.category === 'bending') return insp.shape === 'round' ? bendingRoundTable(rows) : bendingFlatTable(rows);
  return charpyTable(rows);
}

// Keterangan "Note :" di kiri bawah — sama dengan tiap form resmi.
function notesFor(insp) {
  if (insp.category === 'tensile') {
    return insp.shape === 'round'
      ? ['* All measurement in mm', '* L : Longitudinal ; T : Transverse', '* DA = Diameter A ; DB = Diameter B ; DC = Diameter C']
      : ['* All measurement in mm', '* L : Longitudinal ; T : Transverse',
          '* TA = Thickness A ; TB = Thickness B ; TC = Thickness C', '* WA = Width A ; WB = Width B ; WC = Width C'];
  }
  if (insp.category === 'charpy') {
    return ['* All measurement in mm', '* L : Longitudinal, T : Transverse',
      '* BM = Base Metal ; WM = Weld Metal ; FL = Fusion Line ; FL2 = Fusion Line +2 ; FL5 = Fusion Line +5'];
  }
  return ['* All measurement in mm', '* L : Longitudinal, T : Transverse'];
}

// Sel info: label (Indonesia + <i>Inggris</i>), titik dua, lalu nilai.
function infoCell(label, en, value, cls) {
  return `<td class="info-cell ${cls}"><span class="lbl">${label} <i>(${en})</i></span><span class="val">: ${value}</span></td>`;
}

function renderSpecimenPrintHtml(insp) {
  const tr = insp.test_request || {};
  const isGeneral = insp.category === 'general';
  const title = isGeneral
    ? String(insp.test_name || 'UMUM').toUpperCase()
    : (TITLES[insp.category] || {})[insp.shape || 'flat'] || 'SPESIMEN';
  const formNo = isGeneral ? 'DPI-LP-FR-26' : (FORM_NOS[insp.category] || {})[insp.shape || 'flat'] || '';
  const date = fmtDateFull(insp.inspection_date);

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${esc(tr.job_number || 'Pengecekan Spesimen')} - ${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 9mm 11mm 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 8.2pt; background: #ddd; }
  .toolbar { position: sticky; top: 0; background: #0E3270; color: #fff; padding: 10px 16px;
             display: flex; justify-content: space-between; align-items: center; z-index: 10; }
  .toolbar button { background: #AA0000; border: none; padding: 8px 18px; font-weight: bold;
             border-radius: 4px; cursor: pointer; font-size: 10pt; }

  /* Satu halaman A4 landscape; footer selalu menempel di dasar halaman (bukan position:fixed,
     yang dulu menimpa kotak tanda tangan). Tinggi = 210mm - margin atas/bawah @page. */
  .sheet { width: 297mm; min-height: 193mm; margin: 16px auto; padding: 9mm 11mm 8mm; background: #fff;
           box-shadow: 0 0 8px rgba(0,0,0,.25); display: flex; flex-direction: column; }
  .sheet-body { flex: 1; }

  .logo { height: 34px; display: block; }
  .headbar { margin: 7px 0 9px; }
  .headbar i { display: block; height: 3px; background: #8E2A2A; }
  .headbar i + i { background: #0E3270; margin-top: 1px; }
  h1 { text-align: center; font-size: 10.5pt; margin: 0 0 1px; }
  h2 { text-align: center; font-size: 9pt; font-style: italic; font-weight: normal; margin: 0 0 7px; }

  table.info-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 8pt; }
  table.info-table td { border: 1px solid #000; padding: 2px 4px; width: 33.33%; }
  .info-cell { white-space: nowrap; }
  .info-cell .lbl { display: inline-block; }
  .info-cell.c1 .lbl { min-width: 27mm; }
  .info-cell.c2 .lbl { min-width: 35mm; }
  .info-cell .val { white-space: normal; }

  .instructions { font-size: 7.2pt; line-height: 1.5; margin: 0 0 4px; }
  .instructions i { margin-left: 4px; }

  /* gambar spesimen (sesuai bentuk) di atas tabel */
  .figure { margin: 2px 0 6px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .figure svg { display: block !important; margin: 0 auto; height: 40mm !important; width: auto !important; max-width: 100%; }
  /* Bending/Charpy tidak punya blok petunjuk, jadi gambarnya boleh lebih besar seperti contoh resmi */
  .figure.big svg { height: 50mm !important; }

  table.spec-table { width: 100%; border-collapse: collapse; font-size: 7.8pt; margin-bottom: 6px; }
  table.spec-table th, table.spec-table td { border: 1px solid #000; padding: 1.4px 4px; text-align: center; vertical-align: middle; }
  table.spec-table thead th { background: #D9D9D9; font-weight: bold; }
  table.spec-table.plain thead th { background: #fff; }
  table.spec-table td { height: 4.4mm; }
  /* form resmi Bending/Nick Break/HIC tabelnya tidak selebar halaman — di tengah, seperti contoh */
  table.spec-table.narrow-nickbreak { width: 78%; margin-left: auto; margin-right: auto; }
  table.spec-table.narrow-hic { width: 70%; margin-left: auto; margin-right: auto; }
  table.spec-table.narrow-bending-flat { width: 78%; margin-left: auto; margin-right: auto; }
  table.spec-table.narrow-bending-round { width: 56%; margin-left: auto; margin-right: auto; }
  table.spec-table.tall td { height: 6mm; }
  table.spec-table .mark-col { width: 15%; }
  table.spec-table .type-col { width: 5%; }
  table.spec-table .pt-head { width: 15px; padding: 0; }
  table.spec-table .pt-col { width: 15px; padding: 0 2px; }
  table.spec-table .loc-sub { font-size: 6.6pt; }
  .vtxt { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); font-size: 6.4pt; line-height: 1; white-space: nowrap; }
  table.spec-table tbody tr, table.spec-table thead tr { break-inside: avoid; page-break-inside: avoid; }

  .bottom-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px;
                margin-top: 4px; break-inside: avoid; page-break-inside: avoid; }
  .notes { font-size: 7.4pt; line-height: 1.5; }
  .approval-wrap { width: 42%; flex-shrink: 0; font-size: 7.6pt; }
  .approval-date { margin-bottom: 1px; }
  table.approval-table { width: 100%; border-collapse: collapse; }
  table.approval-table th, table.approval-table td { border: 1px solid #000; text-align: center; vertical-align: top; }
  table.approval-table th { font-weight: normal; padding: 1.5px 4px; }
  .approval-sig { height: 15mm; }
  .sig-img { max-height: 14mm; max-width: 100%; object-fit: contain; }
  table.approval-table td.approval-name { text-align: left; padding: 1.5px 4px; }

  .footer { margin-top: 6px; border-top: 1px solid #0E3270; padding-top: 3px; font-size: 8pt; line-height: 1.5; }
  .footer .form-no { font-style: italic; font-size: 6.8pt; }

  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { box-shadow: none; margin: 0; padding: 0; width: auto; min-height: 193mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span>Pengecekan Spesimen &mdash; ${esc(tr.job_number || '')}</span>
    <button onclick="window.print()">Print / Simpan sebagai PDF</button>
  </div>

  <div class="sheet">
    <div class="sheet-body">
      <img class="logo" src="data:image/png;base64,${LOGO_BASE64}" alt="DETECH">
      <div class="headbar"><i></i><i></i></div>
      <h1>PENGECEKAN SPESIMEN ${esc(title)}</h1>
      <h2>SPECIMEN INSPECTION of ${esc(title)}</h2>

      <table class="info-table">
        <tr>
          ${infoCell('Tanggal', 'Date', date, 'c1')}
          ${infoCell('Pelanggan', 'Customer', esc(tr.on_behalf_owner), 'c2')}
          ${infoCell('Tipe Spesimen', 'Type of Specimen', esc(insp.type_of_specimen), 'c3')}
        </tr>
        <tr>
          ${infoCell('No.Pekerjaan', 'Job No.', esc(tr.job_number), 'c1')}
          ${infoCell('Kode Acuan', 'Ref.Code', esc(insp.ref_code), 'c2')}
          ${infoCell('Marking', 'Marking', esc(insp.marking || insp.sample_marking || tr.customer_id), 'c3')}
        </tr>
      </table>

      ${insp.category === 'tensile' ? `
      <div class="instructions">
        <div>Penentuan Titik Luasan Terkecil Pada Daerah Reduced Section <i>(Determination of the Point of the Smallest Area in the Reduced Section)</i></div>
        ${INSTRUCTIONS.map(([id, en]) => `<div>${id} <i>(${en})</i></div>`).join('')}
      </div>` : ''}

      <div class="figure${insp.category === 'tensile' ? '' : ' big'}">${SpecimenDiagrams.render(insp.category, insp.shape, { idPrefix: 'sdp', variant: SpecimenDiagrams.variantOf(insp.type_of_specimen) })}</div>

      ${tableFor(insp)}

      <div class="bottom-row">
        <div class="notes">
          <div>Note :</div>
          ${notesFor(insp).map(n => `<div>${esc(n)}</div>`).join('')}
        </div>
        <div class="approval-wrap">
          <div class="approval-date">Date : ${date}</div>
          <table class="approval-table">
            <tr><th>Inspected By</th><th>Approved By</th></tr>
            <tr>
              <td class="approval-sig">${insp.inspected_by_signature ? `<img class="sig-img" src="${esc(insp.inspected_by_signature)}" alt="">` : ''}</td>
              <td class="approval-sig">${insp.approved_by_signature ? `<img class="sig-img" src="${esc(insp.approved_by_signature)}" alt="">` : ''}</td>
            </tr>
            <tr>
              <td class="approval-name">Name : ${esc(insp.inspected_by_name)}</td>
              <td class="approval-name">Name : ${esc(insp.approved_by_name)}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>

    <div class="footer">
      <div>Hal. (page) : 1/1</div>
      <div class="form-no">Form No.: ${esc(formNo)}, ${FORM_REVISION[insp.category] || DEFAULT_FORM_REVISION}</div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderSpecimenPrintHtml };

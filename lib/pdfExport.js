// Menghasilkan PDF Tinjauan Permintaan Pengujian (DPI-LP-FR-24 Rev.4) siap cetak & tanda tangan,
// mengikuti layout form asli: header, info umum, tabel deskripsi/keterangan, blok Coupon Test
// (deskripsi material + 13 jenis pengujian), lalu catatan & kolom tanda tangan.
const PDFDocument = require('pdfkit');
const { TEST_TYPES } = require('../db/testTypes');

const NAVY = '#1B2A4A';
const RED = '#D32F2F';
const BORDER = '#333333';
const LIGHT_FILL = '#F0F0F0';
const MARGIN = 36;

const NOTE_TEXT =
  'Material sisa pengujian yang ditinggalkan oleh pelanggan akan disimpan pada fasilitas ' +
  'penyimpanan material sisa uji PT Detech Profesional Indonesia selama 14 hari kerja. Apabila ' +
  'tidak ada berita acara penitipan atau notifikasi pengambilan material dari pelanggan sampai ' +
  'dengan 14 hari durasi penyimpanan, maka material sisa pengujian akan dimusnahkan.';

function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return s || '';
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

function ynText(v) {
  return v === 'Y' ? 'Y' : v === 'N' ? 'N' : '-';
}

function couponTypeLabel(row) {
  const types = [...(row.coupon_type || [])];
  if (row.coupon_type_other) types.push(row.coupon_type_other);
  return types.length ? types.join(', ') : '-';
}

function contentWidth(doc) {
  return doc.page.width - MARGIN * 2;
}

function drawMainHeader(doc) {
  const left = MARGIN;
  const top = MARGIN;
  const width = contentWidth(doc);

  doc.font('Helvetica-Bold').fontSize(22).fillColor(RED).text('DETECH', left, top);
  doc.font('Helvetica').fontSize(8).fillColor('#555').text('Material Testing Laboratory', left, top + 24);

  const barY = top + 40;
  doc.rect(left, barY, width, 3).fill(NAVY);

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#000')
    .text('TINJAUAN PERMINTAAN PENGUJIAN', left, barY + 12, { width, align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(10).fillColor('#000')
    .text('TESTING REQUIREMENTS REVIEW', left, barY + 30, { width, align: 'center' });

  return barY + 50;
}

function drawContinuationHeader(doc, req) {
  const left = MARGIN;
  const top = MARGIN;
  const width = contentWidth(doc);

  doc.font('Helvetica-Bold').fontSize(13).fillColor(RED).text('DETECH', left, top);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
    .text('TINJAUAN PERMINTAAN PENGUJIAN (Lanjutan)', left, top, { width, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor('#555')
    .text(`No. Pekerjaan: ${req.job_number || '-'}`, left, top + 14, { width, align: 'right' });

  const barY = top + 28;
  doc.rect(left, barY, width, 2).fill(NAVY);
  return barY + 14;
}

function drawLabelValue(doc, x, y, width, label, value) {
  doc.font('Helvetica-Bold').fontSize(8);
  const labelH = doc.heightOfString(label, { width });
  doc.fillColor('#000').text(label, x, y, { width, height: labelH, lineBreak: true });

  const text = ': ' + (value && String(value).trim() ? value : '-');
  doc.font('Helvetica').fontSize(9);
  const valH = doc.heightOfString(text, { width });
  const valY = y + labelH + 1;
  doc.fillColor('#000').text(text, x, valY, { width, height: valH, lineBreak: true });
  return valY + valH + 6;
}

function drawInfoSection(doc, req, y) {
  const left = MARGIN;
  const width = contentWidth(doc);
  const colWidth = width / 2 - 10;
  const rightX = left + width / 2 + 10;

  let yL = y;
  yL = drawLabelValue(doc, left, yL, colWidth, 'Nomor Pekerjaan (Job Number)', req.job_number);
  yL = drawLabelValue(doc, left, yL, colWidth, 'Tgl. Diterima (Received Date)', fmtDate(req.received_date));
  yL = drawLabelValue(doc, left, yL, colWidth, 'ID Perusahaan (Cust. ID)', req.customer_id);
  yL = drawLabelValue(doc, left, yL, colWidth, 'Nama Projek (Project Name)', req.project_name);

  let yR = y;
  yR = drawLabelValue(doc, rightX, yR, colWidth, 'Perusahaan (Company)', req.company);
  yR = drawLabelValue(doc, rightX, yR, colWidth, 'No. PO (PO. No.)', req.po_number);
  yR = drawLabelValue(doc, rightX, yR, colWidth, 'Atas Nama Perusahaan (On Behalf Owner)', req.on_behalf_owner);
  yR = drawLabelValue(doc, rightX, yR, colWidth, 'Alamat (Address)', req.address);
  yR = drawLabelValue(doc, rightX, yR, colWidth, 'No. Telepon (Phone No.)', req.phone);

  return Math.max(yL, yR) + 6;
}

// ---------- generic bordered table row ----------

function measureRowHeight(doc, cells, colWidths, font, size, padding) {
  doc.font(font).fontSize(size);
  let maxH = 0;
  cells.forEach((c, i) => {
    const h = doc.heightOfString(c || '', { width: colWidths[i] - padding * 2 });
    maxH = Math.max(maxH, h);
  });
  return maxH + padding * 2;
}

function drawRow(doc, x, y, cells, colWidths, opts = {}) {
  const {
    font = 'Helvetica', size = 8.5, bold = false, fill = null,
    align = 'left', padding = 4, minHeight = 0
  } = opts;
  const useFont = bold ? 'Helvetica-Bold' : font;
  let h = Math.max(measureRowHeight(doc, cells, colWidths, useFont, size, padding), minHeight);

  let cx = x;
  cells.forEach((c, i) => {
    if (fill) doc.rect(cx, y, colWidths[i], h).fill(fill);
    doc.rect(cx, y, colWidths[i], h).stroke(BORDER);
    const cellAlign = Array.isArray(align) ? (align[i] || 'left') : align;
    doc.font(useFont).fontSize(size).fillColor('#000')
      .text(c || '', cx + padding, y + padding,
        { width: colWidths[i] - padding * 2, height: h - padding * 2, align: cellAlign, lineBreak: true });
    cx += colWidths[i];
  });
  return y + h;
}

function drawDescriptionTable(doc, req, y) {
  const left = MARGIN;
  const width = contentWidth(doc);
  const colWidths = [width * 0.6, width * 0.4];

  let cy = drawRow(doc, left, y, ['DESKRIPSI (DESCRIPTION)', 'KETERANGAN (REMARKS)'], colWidths,
    { bold: true, fill: LIGHT_FILL, align: 'center', size: 8.5 });

  const rows = [
    ['Nilai ketidakpastian perlu diklarifikasi / Uncertainties need for clarifications', ynText(req.uncertainty_clarification)],
    ['Kemampuan metode uji yang tersedia / Capability test methods used', ynText(req.capability_test_methods)],
    ['Perbedaan kontrak yang perlu diselesaikan / Differences to be resolved', ynText(req.contract_differences)],
    ['Ketersediaan peralatan dan fasilitas / Availability of equipment and facilities', ynText(req.equipment_availability)],
    ['Pelaksanaan pengujian / Test execution',
      `${req.witness_status || '-'}${req.witness_date ? ', Date: ' + fmtDate(req.witness_date) : ''}`],
    ['Benda uji / Specimen', req.specimen_status || '-'],
    ['Target penyelesaian LHU / LHU completion target', req.lhu_target_date ? 'Date: ' + fmtDate(req.lhu_target_date) : '-'],
    ['Penanganan LHU / LHU handling', req.lhu_handling || '-']
  ];

  rows.forEach(r => { cy = drawRow(doc, left, cy, r, colWidths, { size: 8 }); });
  return cy + 10;
}

function charpyLabel(row) {
  const t = row.charpy_temp || '..........';
  const wm = row.charpy_wm || '......';
  const bm = row.charpy_bm || '......';
  const haz = row.charpy_haz || '......';
  return `Charpy Impact Test, T° : ${t}\nWM : ${wm}   BM : ${bm}   HAZ : ${haz}`;
}

function couponBlockHeight(doc, row, idx) {
  const width = contentWidth(doc);
  const leftW = width * 0.56;
  const rightW = width - leftW;

  const leftFields = couponLeftFields(row, idx);
  doc.font('Helvetica').fontSize(8);
  let leftH = 20; // "Coupon Test #n" title
  leftFields.forEach(([label, value]) => {
    const labelH = doc.heightOfString(label, { width: leftW - 12 });
    const valH = doc.heightOfString(': ' + (value || '-'), { width: leftW - 12, font: 'Helvetica', size: 9 });
    leftH += labelH + valH + 5;
  });

  let rightH = measureRowHeight(doc, ['', 'Jenis Pengujian', 'Jumlah', 'Metode Tes'],
    [rightW * 0.12, rightW * 0.5, rightW * 0.14, rightW * 0.24], 'Helvetica-Bold', 8, 4);
  TEST_TYPES.forEach(name => {
    const label = name === 'Charpy Impact Test' ? charpyLabel(row) : name;
    rightH += measureRowHeight(doc, ['', label, '', ''],
      [rightW * 0.12, rightW * 0.5, rightW * 0.14, rightW * 0.24], 'Helvetica', 8, 4);
  });

  return Math.max(leftH, rightH) + 16;
}

function couponLeftFields(row, idx) {
  return [
    [`Coupon Test #${idx + 1}`, couponTypeLabel(row)],
    ['Material Type / Grade', row.material_type_grade],
    ['Material Size', row.material_size],
    ['Outside Diameter (mm)', row.outside_diameter],
    ['Thickness (mm)', row.thickness],
    ['Heat Number', row.heat_number],
    ['Welding Process', row.welding_process],
    ['Welding Position', row.welding_position],
    ['Ref. Code', row.ref_code],
    ['No WPS', row.no_wps],
    ['Testing Purpose', row.testing_purpose],
    ['Note', row.note]
  ];
}

function drawCouponBlock(doc, y, row, idx) {
  const left = MARGIN;
  const width = contentWidth(doc);
  const leftW = width * 0.56;
  const rightW = width - leftW;
  const rightX = left + leftW;

  const blockH = couponBlockHeight(doc, row, idx);
  doc.rect(left, y, width, blockH).stroke(BORDER);
  doc.moveTo(rightX, y).lineTo(rightX, y + blockH).stroke(BORDER);

  // ---- left: material fields ----
  let ly = y + 6;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000')
    .text(`NO. ${idx + 1}`, left + 6, ly, { width: leftW - 12 });
  ly += 16;
  couponLeftFields(row, idx).forEach(([label, value]) => {
    doc.font('Helvetica-Bold').fontSize(8);
    const labelH = doc.heightOfString(label, { width: leftW - 12 });
    doc.fillColor('#000').text(label, left + 6, ly, { width: leftW - 12, height: labelH, lineBreak: true });

    const text = ': ' + (value && String(value).trim() ? value : '-');
    doc.font('Helvetica').fontSize(9);
    const valH = doc.heightOfString(text, { width: leftW - 12 });
    doc.fillColor('#000').text(text, left + 6, ly + labelH + 1, { width: leftW - 12, height: valH, lineBreak: true });
    ly += labelH + valH + 5;
  });

  // ---- right: test items table ----
  const colW = [rightW * 0.12, rightW * 0.5, rightW * 0.14, rightW * 0.24];
  let ry = drawRow(doc, rightX, y, ['Cek', 'Jenis Pengujian', 'Jumlah', 'Metode Tes'], colW,
    { bold: true, fill: LIGHT_FILL, align: 'center', size: 8 });

  TEST_TYPES.forEach(name => {
    const item = (row.test_items || []).find(ti => ti.test_name === name) || {};
    const label = name === 'Charpy Impact Test' ? charpyLabel(row) : name;
    ry = drawRow(doc, rightX, ry,
      [item.checked ? 'X' : '', label, item.checked ? (item.qty || '') : '', item.checked ? (item.method || '') : ''],
      colW, { size: 8, align: ['center', 'left', 'center', 'left'] });
  });

  return y + blockH + 10;
}

function signatureBoxHeight(doc, req, colW) {
  doc.font('Helvetica').fontSize(8);
  const w = colW - 8;
  const leftH = doc.heightOfString(`Nama (Name) : ${req.customer_name || ''}`, { width: w }) + 2
    + doc.heightOfString(`Tgl (Date) : ${fmtDate(req.customer_date) || ''}`, { width: w });
  const rightH = doc.heightOfString(`Nama (Name) : ${req.received_by_name || ''}`, { width: w }) + 2
    + doc.heightOfString(`Tgl (Date) : ${fmtDate(req.received_by_date) || ''}`, { width: w });
  return 16 /* header row */ + 34 /* blank signature space */ + Math.max(leftH, rightH) + 8;
}

function drawSignatureSection(doc, req, y) {
  const left = MARGIN;
  const width = contentWidth(doc);
  const noteW = width * 0.5;
  const sigW = width - noteW - 12;
  const colW = sigW / 2;
  const boxH = Math.max(92, signatureBoxHeight(doc, req, colW));

  doc.rect(left, y, noteW, boxH).stroke(BORDER);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000')
    .text('Catatan :', left + 6, y + 6, { width: noteW - 12, height: 12 });
  doc.font('Helvetica').fontSize(7.5);
  const noteH = doc.heightOfString(NOTE_TEXT, { width: noteW - 12 });
  doc.fillColor('#000').text(NOTE_TEXT, left + 6, y + 20, { width: noteW - 12, height: Math.min(noteH, boxH - 24), lineBreak: true });

  const sigX = left + noteW + 12;
  doc.rect(sigX, y, sigW, boxH).stroke(BORDER);
  doc.moveTo(sigX + colW, y).lineTo(sigX + colW, y + boxH).stroke(BORDER);
  doc.moveTo(sigX, y + 16).lineTo(sigX + sigW, y + 16).stroke(BORDER);

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
    .text('Pelanggan (Customer)', sigX, y + 4, { width: colW, height: 12, align: 'center' })
    .text('Diterima Oleh (Received By)', sigX + colW, y + 4, { width: colW, height: 12, align: 'center' });

  const nameY = y + boxH - (Math.max(
    doc.heightOfString(`Nama (Name) : ${req.customer_name || ''}`, { width: colW - 8 })
      + doc.heightOfString(`Tgl (Date) : ${fmtDate(req.customer_date) || ''}`, { width: colW - 8 }),
    doc.heightOfString(`Nama (Name) : ${req.received_by_name || ''}`, { width: colW - 8 })
      + doc.heightOfString(`Tgl (Date) : ${fmtDate(req.received_by_date) || ''}`, { width: colW - 8 })
  ) + 8);

  const stackLine = (x, w, sy, label, value) => {
    const text = `${label} : ${value || ''}`;
    doc.font('Helvetica').fontSize(8);
    const h = doc.heightOfString(text, { width: w });
    doc.fillColor('#000').text(text, x, sy, { width: w, height: h, lineBreak: true });
    return sy + h + 2;
  };

  let cyL = stackLine(sigX + 4, colW - 8, nameY, 'Nama (Name)', req.customer_name);
  stackLine(sigX + 4, colW - 8, cyL, 'Tgl (Date)', fmtDate(req.customer_date));
  let cyR = stackLine(sigX + colW + 4, colW - 8, nameY, 'Nama (Name)', req.received_by_name);
  stackLine(sigX + colW + 4, colW - 8, cyR, 'Tgl (Date)', fmtDate(req.received_by_date));

  return y + boxH;
}

function generateRequestPdf(req) {
  // bottom margin is kept tiny on purpose: PDFKit auto-inserts a page whenever a text
  // draw's y crosses (page height - margins.bottom), no matter what explicit x/y is given.
  // Pagination is instead handled manually below via bottomLimit, so the real margin
  // needs to stay out of the way.
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 4 },
    bufferPages: true
  });
  const bottomLimit = doc.page.height - MARGIN - 24;

  let y = drawMainHeader(doc);
  y = drawInfoSection(doc, req, y);
  y = drawDescriptionTable(doc, req, y);

  const couponRows = (req.coupon_tests && req.coupon_tests.length) ? req.coupon_tests : [{ test_items: [] }];

  couponRows.forEach((row, idx) => {
    const h = couponBlockHeight(doc, row, idx);
    if (idx > 0 || y + h > bottomLimit) {
      doc.addPage();
      y = drawContinuationHeader(doc, req);
    }
    y = drawCouponBlock(doc, y, row, idx);
  });

  const sigColW = (contentWidth(doc) * 0.5 - 12) / 2;
  const sigHeight = Math.max(92, signatureBoxHeight(doc, req, sigColW));
  if (y + sigHeight > bottomLimit) {
    doc.addPage();
    y = drawContinuationHeader(doc, req);
  }
  drawSignatureSection(doc, req, y);

  // ---- footer on every page ----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottomY = doc.page.height - MARGIN + 8;
    doc.font('Helvetica').fontSize(8).fillColor('#000')
      .text(`Hal. (page) : ${i + 1} / ${range.count}`, MARGIN, bottomY, { width: contentWidth(doc) / 2 })
      .text('Form No.: DPI-LP-FR-24, Rev.4, Date of Issued 01/08/2022', MARGIN, bottomY,
        { width: contentWidth(doc), align: 'right' });
  }

  return doc;
}

module.exports = { generateRequestPdf };

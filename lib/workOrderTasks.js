// Tahap pengerjaan ("Tasks") per Work Order:
//   Receiving -> Preparation -> Testing -> Reporting -> Review & Approval -> Released
//
// Prinsip: baris kerja (coupon, jenis pengujian, qty, sample marking) SELALU diturunkan
// langsung dari Permintaan Uji/Work Order, bukan diketik ulang — halaman tahap hanya
// menyimpan isian di atasnya (kunci coupon_row_no / "coupon_row_no|test_name").
// Preparation tidak punya data sendiri: itu adalah Pengecekan Spesimen (marking, cutting,
// machining specimen), jadi statusnya mengikuti sheet-sheet di sana.

const TASK_STAGES = [
  { key: 'receiving', label: 'Receiving', hint: 'Terima sampel', kind: 'form', picColumn: 'receiving_pic', dateLabel: 'Tanggal Penerimaan' },
  { key: 'preparation', label: 'Preparation', hint: 'Marking, cutting, machining specimen', kind: 'derived', picColumn: 'machining_pic', extraPicColumns: ['inspection_pic'], dateLabel: '' },
  { key: 'testing', label: 'Testing', hint: 'Hardness, tensile, impact, PMI, dll', kind: 'form', picColumn: 'testing_pic', dateLabel: 'Tanggal Selesai Testing' },
  { key: 'reporting', label: 'Reporting', hint: 'Input hasil pengujian', kind: 'form', picColumn: 'reporting_pic', dateLabel: 'Tanggal Laporan' },
  { key: 'review', label: 'Review & Approval', hint: 'Pemeriksaan laporan', kind: 'approval', picColumn: 'doc_checked_pic', dateLabel: 'Tanggal Review' },
  { key: 'released', label: 'Released', hint: 'Report dikirim ke customer', kind: 'form', picColumn: 'released_pic', dateLabel: 'Tanggal Dikirim' }
];

const RECEIVED = ['', 'Y', 'N'];
const CONDITIONS = ['', 'Baik', 'Cacat / Rusak', 'Perlu Klarifikasi'];
const TEST_STATUS = ['', 'proses', 'selesai', 'na'];
const TEST_RESULTS = ['', 'accepted', 'rejected', 'na'];
const APPROVAL_STATUS = ['', 'approved', 'rejected'];
const YES_NO = ['', 'Y', 'N'];
const RELEASE_METHODS = ['', 'Email', 'Kurir', 'Portal Customer', 'Diambil Langsung'];

const REVIEW_MANUAL_CHECKS = [
  { key: 'identity_match', label: 'Identitas pelanggan & Sample Marking sesuai Permintaan Uji' },
  { key: 'signatures_complete', label: 'Seluruh tanda tangan & approval dokumen lengkap' },
  { key: 'ready_to_release', label: 'Laporan siap dikirim ke customer' }
];

const APPROVAL_LABELS = { '': 'Menunggu approval', approved: 'Disetujui', rejected: 'Ditolak — perlu revisi' };
const RECEIVED_LABEL = { Y: 'Diterima', N: 'Tidak diterima', '': 'Belum diisi' };
const TEST_STATUS_LABEL = { '': 'Belum', proses: 'Sedang Diuji', selesai: 'Selesai', na: 'Tidak Perlu' };
const RESULT_LABEL = { '': 'Belum', accepted: 'Accepted', rejected: 'Rejected', na: 'N/A' };
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function stageByKey(key) {
  return TASK_STAGES.find(s => s.key === key) || null;
}

function str(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function pick(value, allowed) {
  return allowed.includes(value) ? value : '';
}

function orDash(value) {
  return value ? String(value) : '-';
}

function fmtDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '-';
}

// ---------- baris kerja yang diturunkan dari Permintaan Uji ----------

function couponLabel(c) {
  const types = [...(c.coupon_type || [])];
  if (c.coupon_type_other) types.push(c.coupon_type_other);
  const typeText = types.length ? types.join(', ') : (c.material_type_grade || '-');
  return `Coupon #${c.row_no} — ${typeText}`;
}

function couponRowsOf(wo) {
  return (wo.coupon_tests || []).map(c => ({
    key: String(c.row_no),
    coupon_row_no: c.row_no,
    sample_marking: c.sample_marking || '',
    coupon_label: couponLabel(c)
  }));
}

function testRowsOf(wo) {
  const rows = [];
  for (const c of (wo.coupon_tests || [])) {
    const items = [
      ...(c.test_items || []).filter(t => t.checked),
      ...(c.other_tests || []).filter(t => (t.test_name || '').trim())
    ];
    for (const t of items) {
      rows.push({
        key: `${c.row_no}|${t.test_name}`,
        coupon_row_no: c.row_no,
        sample_marking: c.sample_marking || '',
        coupon_label: couponLabel(c),
        test_name: t.test_name,
        qty: t.qty || '',
        method: t.method || ''
      });
    }
  }
  return rows;
}

function savedItems(task) {
  return (task && task.data && task.data.items) || {};
}

function savedData(task) {
  return (task && task.data) || {};
}

// ---------- status ----------

// required = jumlah (coupon x jenis pengujian) yang punya template Pengecekan Spesimen,
// created/finals = jumlah sheet yang sudah dibuat / berstatus final.
function inspectionStatus(required, created, finals) {
  if (!required && !created) return 'na';
  if (!created) return 'pending';
  if (finals === created && finals >= required) return 'final';
  return 'draft';
}

function taskStatus(task) {
  if (!task) return 'pending';
  if (task.approval_status === 'rejected') return 'rejected';
  return task.status === 'final' ? 'final' : 'draft';
}

function isDone(status) {
  return status === 'final' || status === 'na';
}

// Tahap yang sedang berjalan = tahap pertama yang belum selesai (urutan proses); bila semua
// sudah selesai, tahap terakhir (Released) yang ditampilkan.
function currentStageOf(stages) {
  const idx = stages.findIndex(s => !isDone(s.status));
  const i = idx === -1 ? stages.length - 1 : idx;
  return { key: stages[i].key, label: stages[i].label, status: stages[i].status, no: i + 1 };
}

// ---------- evaluasi tiap tahap (murni: tanpa akses DB) ----------
// Setiap builder mengembalikan { items, extra, stats, summary, problems }.
// `problems` = alasan tahap belum boleh diselesaikan (dipakai saat Simpan & Selesaikan).

// Specimen Marking = "{Sample Marking}-{kode jenis pengujian}{nomor urut}" (1..qty) — rumus yang sama
// dengan Marking Specimen di sheet Pengecekan Spesimen, jadi nilainya otomatis sama saat diteruskan.
function specimenMarkings(row, codes) {
  const code = (codes || {})[row.test_name];
  const qty = Math.min(parseInt(row.qty, 10) || 0, 200);
  if (!row.sample_marking || !code || qty < 1) return [];
  return Array.from({ length: qty }, (_, i) => `${row.sample_marking}-${code}${i + 1}`);
}

function evidenceStats(ctx) {
  const rows = (ctx && ctx.evidence) || [];
  const sum = fn => rows.filter(fn).reduce((total, r) => total + Number(r.n || 0), 0);
  return { total: sum(() => true), before: sum(r => r.marking_state === 'before'), after: sum(r => r.marking_state === 'after') };
}

function buildReceiving(wo, task, ctx) {
  const saved = savedItems(task);
  const items = couponRowsOf(wo).map(r => {
    const s = saved[r.key] || {};
    return { ...r, received: s.received || '', condition: s.condition || '', note: s.note || '' };
  });
  const answered = items.filter(i => i.received).length;
  const received = items.filter(i => i.received === 'Y').length;
  const evidence = evidenceStats(ctx);
  const problems = [];
  if (!items.length) problems.push('Belum ada Coupon Test pada Permintaan Uji');
  if (items.length - answered) problems.push(`${items.length - answered} coupon belum diisi status penerimaannya`);
  return {
    items,
    extra: { delivered_by: savedData(task).delivered_by || '' },
    stats: {
      total: items.length, answered, received,
      evidence: evidence.total, evidence_before: evidence.before, evidence_after: evidence.after
    },
    summary: items.length
      ? `${received}/${items.length} coupon diterima${evidence.total ? ` · ${evidence.total} file evidence` : ''}`
      : 'Belum ada coupon',
    problems
  };
}

// Preparation memuat SEMUA baris coupon x jenis pengujian (marking, cutting, machining terjadi untuk
// semuanya). Hanya yang punya template Pengecekan Spesimen yang dihitung sebagai "sheet dibutuhkan".
function buildPreparation(wo, sheets, ctx) {
  const MAP = ctx.TEST_NAME_TO_CATEGORY || {};
  const sheetByKey = new Map(sheets.filter(s => s.test_name).map(s => [`${s.coupon_row_no}|${s.test_name}`, s]));
  const items = testRowsOf(wo).map(r => {
    const sheet = sheetByKey.get(r.key);
    return {
      ...r,
      has_template: !!(MAP[r.test_name] && r.qty),
      code: (ctx.codes || {})[r.test_name] || '',
      markings: specimenMarkings(r, ctx.codes),
      sheet_id: sheet ? sheet.id : null,
      sheet_status: sheet ? (sheet.status || 'draft') : ''
    };
  });
  const required = items.filter(i => i.has_template).length;
  const created = sheets.length;
  const finals = sheets.filter(s => s.status === 'final').length;
  const status = inspectionStatus(required, created, finals);
  let summary;
  if (status === 'na') summary = 'Tidak ada sheet yang diperlukan';
  else if (required) summary = `${finals}/${required} sheet final`;
  else summary = `${finals}/${created} sheet final`;
  return {
    items,
    extra: {},
    stats: {
      required, created, finals,
      rows: items.length,
      coupons: (wo.coupon_tests || []).length,
      specimens: items.reduce((sum, i) => sum + (parseInt(i.qty, 10) || 0), 0)
    },
    summary,
    problems: [],
    status
  };
}

function buildTesting(wo, task, ctx) {
  const MAP = ctx.TEST_NAME_TO_CATEGORY || {};
  const saved = savedItems(task);
  const sheetByKey = new Map(ctx.sheets.filter(s => s.test_name).map(s => [`${s.coupon_row_no}|${s.test_name}`, s]));
  const items = testRowsOf(wo).map(r => {
    const s = saved[r.key] || {};
    const sheet = sheetByKey.get(r.key);
    return {
      ...r,
      tested_date: s.tested_date || '', equipment: s.equipment || '', status: s.status || '', note: s.note || '',
      has_template: !!(MAP[r.test_name] && r.qty),
      markings: specimenMarkings(r, ctx.codes),
      sheet_id: sheet ? sheet.id : null, sheet_status: sheet ? (sheet.status || 'draft') : ''
    };
  });
  const done = items.filter(i => i.status === 'selesai' || i.status === 'na').length;
  const running = items.filter(i => i.status === 'proses').length;
  const problems = [];
  if (!items.length) problems.push('Belum ada Jenis Pengujian yang dicentang pada Permintaan Uji');
  if (items.length - done) problems.push(`${items.length - done} pengujian belum selesai`);
  return {
    items,
    extra: {},
    stats: { total: items.length, done, running },
    summary: items.length ? `${done}/${items.length} pengujian selesai` : 'Belum ada pengujian',
    problems
  };
}

function buildReporting(wo, task, ctx) {
  const saved = savedItems(task);
  const testedBy = savedItems(ctx.tasks.testing);
  const items = testRowsOf(wo).map(r => {
    const s = saved[r.key] || {};
    return {
      ...r,
      tested_date: (testedBy[r.key] || {}).tested_date || '',
      result: s.result || '', result_value: s.result_value || '', note: s.note || ''
    };
  });
  const count = fn => items.filter(fn).length;
  const stats = {
    total: items.length,
    with_result: count(i => i.result),
    accepted: count(i => i.result === 'accepted'),
    rejected: count(i => i.result === 'rejected'),
    na: count(i => i.result === 'na')
  };
  const reportNo = savedData(task).report_no || '';
  const problems = [];
  if (ctx.statuses.testing !== 'final') problems.push('Tahap Testing belum selesai');
  if (stats.total - stats.with_result) problems.push(`${stats.total - stats.with_result} pengujian belum ada hasilnya`);
  if (!reportNo) problems.push('No. Laporan belum diisi');
  return {
    items,
    extra: { report_no: reportNo },
    stats,
    summary: stats.total
      ? `${stats.with_result}/${stats.total} hasil terisi${reportNo ? ` · ${reportNo}` : ''}`
      : 'Belum ada pengujian',
    problems
  };
}

function approvalOf(task) {
  return {
    status: (task && task.approval_status) || '',
    name: (task && task.approver_name) || '',
    signature: (task && task.approver_signature) || null,
    date: (task && task.approval_date) || '',
    notes: (task && task.approval_notes) || ''
  };
}

function buildReview(wo, task, ctx) {
  const reporting = buildReporting(wo, ctx.tasks.reporting, ctx);
  const approval = approvalOf(task);
  const checks = savedData(task).checks || {};
  const auto = [
    { key: 'preparation_done', label: 'Pengecekan Spesimen selesai (semua sheet Final)', ok: isDone(ctx.statuses.preparation) },
    { key: 'testing_done', label: 'Semua pengujian selesai (tahap Testing selesai)', ok: ctx.statuses.testing === 'final' },
    { key: 'reporting_done', label: 'Hasil pengujian sudah lengkap dilaporkan (tahap Reporting selesai)', ok: ctx.statuses.reporting === 'final' }
  ];
  const manual = REVIEW_MANUAL_CHECKS.map(c => ({ ...c, value: checks[c.key] || '' }));
  const okCount = auto.filter(a => a.ok).length + manual.filter(m => m.value === 'Y').length;
  const total = auto.length + manual.length;
  const problems = [];
  auto.filter(a => !a.ok).forEach(a => problems.push(`${a.label} belum terpenuhi`));
  manual.filter(m => m.value !== 'Y').forEach(m => problems.push(`"${m.label}" belum dicentang`));
  if (approval.status !== 'approved') problems.push('Approval belum berstatus Disetujui');
  return {
    items: [],
    extra: { report_no: reporting.extra.report_no, results: reporting.items, results_stats: reporting.stats, auto, manual },
    stats: { ok: okCount, total },
    summary: `${APPROVAL_LABELS[approval.status]} · ${okCount}/${total} butir`,
    problems
  };
}

function buildReleased(wo, task, ctx) {
  const d = savedData(task);
  const approval = approvalOf(ctx.tasks.review);
  const reportNo = savedData(ctx.tasks.reporting).report_no || '';
  const problems = [];
  if (ctx.statuses.review !== 'final') problems.push('Tahap Review & Approval belum selesai');
  if (!(task && task.task_date)) problems.push('Tanggal pengiriman belum diisi');
  if (!d.method) problems.push('Cara pengiriman belum dipilih');
  if (!d.recipient) problems.push('Penerima belum diisi');
  const sent = ctx.statuses.released === 'final';
  return {
    items: [],
    extra: {
      method: d.method || '', recipient: d.recipient || '', reference: d.reference || '',
      report_no: reportNo, approved_by: approval.name, approved_date: approval.date
    },
    stats: {},
    summary: sent ? `Dikirim via ${d.method || '-'} ke ${d.recipient || '-'}` : 'Belum dikirim',
    problems
  };
}

function computeStatuses(wo, tasks, sheets, TEST_NAME_TO_CATEGORY) {
  const statuses = {};
  for (const stage of TASK_STAGES) {
    statuses[stage.key] = stage.key === 'preparation'
      ? buildPreparation(wo, sheets, { TEST_NAME_TO_CATEGORY }).status
      : taskStatus(tasks[stage.key]);
  }
  return statuses;
}

function evalStage(key, wo, task, ctx) {
  if (key === 'receiving') return buildReceiving(wo, task, ctx);
  if (key === 'preparation') return buildPreparation(wo, ctx.sheets, ctx);
  if (key === 'testing') return buildTesting(wo, task, ctx);
  if (key === 'reporting') return buildReporting(wo, task, ctx);
  if (key === 'review') return buildReview(wo, task, ctx);
  return buildReleased(wo, task, ctx);
}

// ---------- ringkasan hanya-baca (halaman detail Work Order) ----------
// Menerjemahkan hasil evalStage menjadi { facts, columns, rows } berisi teks siap tampil,
// supaya halaman detail WO cukup menampilkan info tanpa form.

function rowLabel(it) {
  return `${it.coupon_label} · ${it.sample_marking || 'tanpa marking'}`;
}

function buildInfo(key, detail, task) {
  const date = task ? task.task_date : '';
  const notes = task ? task.notes : '';
  const { items, extra, stats } = detail;
  let facts = [];
  let columns = [];
  let rows = [];

  if (key === 'receiving') {
    facts = [
      ['Tanggal Penerimaan', fmtDate(date)],
      ['Diserahkan oleh', orDash(extra.delivered_by)],
      ['Coupon diterima', `${stats.received} dari ${stats.total}`],
      ['Evidence Sample', stats.evidence
        ? `${stats.evidence} file (belum dimarking ${stats.evidence_before}, sudah dimarking ${stats.evidence_after})`
        : 'Belum ada']
    ];
    columns = ['Coupon / Sample Marking', 'Penerimaan', 'Kondisi'];
    rows = items.map(i => [rowLabel(i), RECEIVED_LABEL[i.received], orDash(i.condition)]);
  } else if (key === 'preparation') {
    facts = [
      ['Total spesimen', String(stats.specimens)],
      ['Sheet dibutuhkan', String(stats.required)],
      ['Sheet dibuat', String(stats.created)],
      ['Sheet Final', String(stats.finals)]
    ];
    columns = ['Coupon / Sample Marking', 'Jenis Pengujian', 'Specimen Marking', 'Status Sheet'];
    rows = items.map(i => [
      rowLabel(i), `${i.test_name} (Qty ${i.qty || '-'})`, i.markings.length ? i.markings.join(', ') : '-',
      i.sheet_status ? (i.sheet_status === 'final' ? 'Final' : 'Draft') : (i.has_template ? 'Belum dibuat' : 'Tanpa sheet')
    ]);
  } else if (key === 'testing') {
    facts = [
      ['Tanggal Selesai Testing', fmtDate(date)],
      ['Pengujian selesai', `${stats.done} dari ${stats.total}`]
    ];
    columns = ['Coupon / Sample Marking', 'Jenis Pengujian', 'Specimen Marking', 'Tgl. Uji', 'Alat', 'Status'];
    rows = items.map(i => [
      rowLabel(i), i.test_name, i.markings.length ? i.markings.join(', ') : '-',
      fmtDate(i.tested_date), orDash(i.equipment), TEST_STATUS_LABEL[i.status]
    ]);
  } else if (key === 'reporting') {
    facts = [
      ['No. Laporan', orDash(extra.report_no)],
      ['Tanggal Laporan', fmtDate(date)],
      ['Hasil', `Accepted ${stats.accepted} · Rejected ${stats.rejected} · Belum ${stats.total - stats.with_result}`]
    ];
    columns = ['Coupon / Sample Marking', 'Jenis Pengujian', 'Hasil', 'Nilai / Ringkasan'];
    rows = items.map(i => [rowLabel(i), i.test_name, RESULT_LABEL[i.result], orDash(i.result_value)]);
  } else if (key === 'review') {
    const approval = approvalOf(task);
    facts = [
      ['Keputusan', APPROVAL_LABELS[approval.status]],
      ['Approver', orDash(approval.name)],
      ['Tanggal Approval', fmtDate(approval.date)],
      ['Checklist', `${stats.ok} dari ${stats.total} butir terpenuhi`]
    ];
    if (approval.notes) facts.push(['Catatan Approval', approval.notes]);
    columns = ['Butir Checklist', 'Status'];
    rows = [
      ...extra.auto.map(a => [a.label, a.ok ? 'Terpenuhi' : 'Belum']),
      ...extra.manual.map(m => [m.label, m.value === 'Y' ? 'Ya' : m.value === 'N' ? 'Tidak' : 'Belum dicek'])
    ];
  } else if (key === 'released') {
    facts = [
      ['Tanggal Dikirim', fmtDate(date)],
      ['Cara Pengiriman', orDash(extra.method)],
      ['Penerima', orDash(extra.recipient)],
      ['No. Resi / Referensi', orDash(extra.reference)],
      ['No. Laporan', orDash(extra.report_no)]
    ];
  }
  if (notes) facts.push(['Catatan Tahap', notes]);
  return { facts: facts.map(([label, value]) => ({ label, value })), columns, rows };
}

// ---------- data yang dikirim form -> baris yang akan disimpan ----------

function sanitizeTask(stage, body, wo, requestedStatus, signatureToBuffer) {
  const b = body || {};
  const incoming = Array.isArray(b.items) ? b.items : [];
  const data = {};

  if (stage.key === 'receiving') {
    const validKeys = new Set(couponRowsOf(wo).map(r => r.key));
    const items = {};
    for (const it of incoming) {
      const k = String(it.key);
      if (!validKeys.has(k)) continue;
      items[k] = { received: pick(it.received, RECEIVED), condition: pick(it.condition, CONDITIONS), note: str(it.note) };
    }
    data.items = items;
    data.delivered_by = str(b.delivered_by, 200);
  } else if (stage.key === 'testing' || stage.key === 'reporting') {
    const validKeys = new Set(testRowsOf(wo).map(r => r.key));
    const items = {};
    for (const it of incoming) {
      const k = String(it.key);
      if (!validKeys.has(k)) continue;
      items[k] = stage.key === 'testing'
        ? { tested_date: str(it.tested_date, 20), equipment: str(it.equipment, 120), status: pick(it.status, TEST_STATUS), note: str(it.note) }
        : { result: pick(it.result, TEST_RESULTS), result_value: str(it.result_value), note: str(it.note) };
    }
    data.items = items;
    if (stage.key === 'reporting') data.report_no = str(b.report_no, 80);
  } else if (stage.key === 'review') {
    const checks = {};
    for (const c of REVIEW_MANUAL_CHECKS) checks[c.key] = pick((b.checks || {})[c.key], YES_NO);
    data.checks = checks;
  } else if (stage.key === 'released') {
    data.method = pick(b.method, RELEASE_METHODS);
    data.recipient = str(b.recipient, 200);
    data.reference = str(b.reference, 200);
  }

  const isApproval = stage.kind === 'approval';
  return {
    status: requestedStatus,
    task_date: str(b.task_date, 20),
    notes: str(b.notes, 1000),
    data,
    approval_status: isApproval ? pick(b.approval_status, APPROVAL_STATUS) : '',
    approver_name: isApproval ? str(b.approver_name, 200) : '',
    approver_signature: isApproval ? signatureToBuffer(b.approver_signature) : null,
    approval_date: isApproval ? str(b.approval_date, 20) : '',
    approval_notes: isApproval ? str(b.approval_notes, 1000) : ''
  };
}

// ---------- antrian kerja (sudut pandang teknisi / reviewer) ----------
// Diturunkan dari data yang sama dengan halaman tahap, jadi antrian dan halaman tahap tidak bisa berbeda:
//  - Receiving Queue  : coupon yang belum diterima (hilang begitu ditandai Diterima).
//  - Preparation Queue: coupon yang sudah diterima, jenis pengujian ber-template yang sheet
//                       Pengecekan Spesimen-nya belum Final.
//  - Testing Queue    : jenis pengujian pada coupon yang sudah diterima dan siap uji (sheet Final,
//                       atau tidak butuh sheet) tetapi pengujiannya belum selesai.
//  - Review Queue     : Work Order yang laporannya (Reporting) sudah selesai tapi belum di-review.

const QUEUE_NAMES = ['receiving', 'preparation', 'testing', 'review'];

function queueBase(entry) {
  const m = entry.meta;
  return {
    work_order_id: m.id, test_request_id: m.test_request_id, job_number: m.job_number || '',
    company: m.company || '', project_name: m.project_name || '',
    testing_date: m.testing_date || '', received_date: m.received_date || ''
  };
}

function buildQueues(entries) {
  const queues = { receiving: [], preparation: [], testing: [], review: [] };

  for (const e of entries) {
    const { wo, tasks, ctx, statuses } = e;
    const base = queueBase(e);
    const testRows = testRowsOf(wo);
    const testsByCoupon = {};
    testRows.forEach(r => { (testsByCoupon[r.coupon_row_no] = testsByCoupon[r.coupon_row_no] || []).push(r); });

    const recv = evalStage('receiving', wo, tasks.receiving || null, ctx);
    const received = {};
    recv.items.forEach(i => { received[i.coupon_row_no] = i.received; });

    // Tahap Receiving yang sudah di-Selesaikan dianggap tuntas, walau ada coupon yang dicatat "Tidak".
    if (statuses.receiving !== 'final') {
      recv.items.filter(i => i.received !== 'Y').forEach(i => {
        const tests = testsByCoupon[i.coupon_row_no] || [];
        queues.receiving.push({
          ...base,
          coupon_row_no: i.coupon_row_no, coupon_label: i.coupon_label, sample_marking: i.sample_marking,
          received: i.received,
          tests: tests.map(t => `${t.test_name} (${t.qty || '-'})`),
          test_names_text: tests.map(t => t.test_name).join(', '),
          specimens: tests.reduce((sum, t) => sum + (parseInt(t.qty, 10) || 0), 0)
        });
      });
    }

    const prep = evalStage('preparation', wo, null, ctx);
    prep.items
      .filter(i => received[i.coupon_row_no] === 'Y' && i.has_template && i.sheet_status !== 'final')
      .forEach(i => queues.preparation.push({
        ...base,
        coupon_row_no: i.coupon_row_no, coupon_label: i.coupon_label, sample_marking: i.sample_marking,
        test_name: i.test_name, qty: i.qty, method: i.method, markings: i.markings,
        sheet_id: i.sheet_id, sheet_status: i.sheet_status
      }));

    if (statuses.testing !== 'final') {
      const test = evalStage('testing', wo, tasks.testing || null, ctx);
      test.items
        .filter(i => received[i.coupon_row_no] === 'Y'
          && (!i.has_template || i.sheet_status === 'final')
          && !['selesai', 'na'].includes(i.status))
        .forEach(i => queues.testing.push({
          ...base,
          coupon_row_no: i.coupon_row_no, coupon_label: i.coupon_label, sample_marking: i.sample_marking,
          test_name: i.test_name, qty: i.qty, method: i.method, markings: i.markings,
          status: i.status, equipment: i.equipment, has_template: i.has_template,
          sheet_id: i.sheet_id, sheet_status: i.sheet_status
        }));
    }

    if (statuses.reporting === 'final' && statuses.review !== 'final') {
      const rep = evalStage('reporting', wo, tasks.reporting || null, ctx);
      const rev = evalStage('review', wo, tasks.review || null, ctx);
      queues.review.push({
        ...base,
        report_no: rep.extra.report_no, results: rep.stats,
        review_status: statuses.review, checklist_ok: rev.stats.ok, checklist_total: rev.stats.total
      });
    }
  }

  const byUrgency = (a, b) =>
    (a.testing_date || '9999').localeCompare(b.testing_date || '9999')
    || a.job_number.localeCompare(b.job_number)
    || (a.coupon_row_no || 0) - (b.coupon_row_no || 0);
  QUEUE_NAMES.forEach(name => queues[name].sort(byUrgency));
  return queues;
}

// ---------- rute ----------

function registerWorkOrderTaskRoutes(app, deps) {
  const { pool, getFullWorkOrder, signatureToBuffer, signatureToDataUrl, TEST_NAME_TO_CATEGORY, rawBody } = deps;

  async function loadContext(wo) {
    const { rows: taskRows } = await pool.query(`SELECT * FROM work_order_tasks WHERE work_order_id = $1`, [wo.id]);
    const tasks = {};
    taskRows.forEach(t => { tasks[t.task_key] = t; });
    const { rows: sheets } = await pool.query(
      `SELECT id, coupon_row_no, test_name, category, shape, status, inspection_date
       FROM specimen_inspections WHERE test_request_id = $1 ORDER BY id ASC`,
      [wo.test_request_id]
    );
    const { rows: codeRows } = await pool.query(`SELECT test_name, code FROM test_type_codes`);
    const codes = {};
    codeRows.forEach(c => { if (c.code) codes[c.test_name] = c.code; });
    const { rows: evidence } = await pool.query(
      `SELECT coupon_row_no, marking_state, COUNT(*)::int AS n FROM work_order_files
       WHERE work_order_id = $1 AND task_key = 'receiving' GROUP BY coupon_row_no, marking_state`,
      [wo.id]
    );
    const statuses = computeStatuses(wo, tasks, sheets, TEST_NAME_TO_CATEGORY);
    return { tasks, sheets, statuses, codes, evidence, TEST_NAME_TO_CATEGORY };
  }

  function buildStages(wo, ctx, withInfo) {
    return TASK_STAGES.map(stage => {
      const task = ctx.tasks[stage.key] || null;
      const detail = evalStage(stage.key, wo, task, ctx);
      const out = {
        key: stage.key,
        label: stage.label,
        hint: stage.hint,
        kind: stage.kind,
        status: ctx.statuses[stage.key],
        pic: wo[stage.picColumn] || '',
        summary: detail.summary,
        date: task ? (task.task_date || '') : '',
        updated_at: task ? task.updated_at : null
      };
      if (withInfo) out.info = buildInfo(stage.key, detail, task);
      return out;
    });
  }

  function woHeader(wo) {
    const tr = wo.test_request || {};
    return {
      id: wo.id,
      test_request_id: wo.test_request_id,
      job_number: tr.job_number || '',
      company: tr.company || '',
      project_name: tr.project_name || '',
      testing_date: wo.testing_date || '',
      our_reference: wo.our_reference || ''
    };
  }

  async function buildTaskDetail(wo, key) {
    const stage = stageByKey(key);
    const ctx = await loadContext(wo);
    const task = ctx.tasks[key] || null;
    const detail = evalStage(key, wo, task, ctx);
    let approval = null;
    if (stage.kind === 'approval') {
      approval = approvalOf(task);
      approval.signature = signatureToDataUrl(approval.signature);
    }
    return {
      work_order: woHeader(wo),
      stage: {
        key: stage.key,
        label: stage.label,
        hint: stage.hint,
        kind: stage.kind,
        date_label: stage.dateLabel,
        status: ctx.statuses[key],
        pic: wo[stage.picColumn] || '',
        task_date: task ? (task.task_date || '') : '',
        notes: task ? (task.notes || '') : '',
        updated_at: task ? task.updated_at : null
      },
      stages: buildStages(wo, ctx, false),
      items: detail.items,
      extra: detail.extra,
      stats: detail.stats,
      summary: detail.summary,
      approval
    };
  }

  // Halaman detail Work Order: progress + info tiap tahap (hanya baca).
  app.get('/api/work-orders/:id/progress', async (req, res) => {
    try {
      const wo = await getFullWorkOrder(req.params.id);
      if (!wo) return res.status(404).json({ error: 'Not found' });
      const ctx = await loadContext(wo);
      const stages = buildStages(wo, ctx, true);
      const doneCount = stages.filter(s => isDone(s.status)).length;
      res.json({
        work_order: woHeader(wo),
        stages,
        done_count: doneCount,
        total: stages.length,
        percent: Math.round((doneCount / stages.length) * 100)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat progress Work Order' });
    }
  });

  // Status semua Work Order — pakai query agregat (bukan getFullWorkOrder per WO) supaya
  // tetap ringan saat Work Order banyak. Dipakai halaman Tasks dan kolom Status daftar WO.
  // Tanggal testing selalu diambil dari Permintaan Uji (tanggal "Pelaksanaan pengujian");
  // kolom work_orders.testing_date hanya cadangan untuk data lama.
  async function loadProgressRows() {
    const picColumns = TASK_STAGES.map(s => `wo.${s.picColumn}`).join(', ');
    const { rows: wos } = await pool.query(
      `SELECT wo.id, wo.test_request_id,
              COALESCE(NULLIF(tr.witness_date, ''), wo.testing_date) AS testing_date, ${picColumns},
              tr.job_number, tr.company, tr.project_name
       FROM work_orders wo
       JOIN test_requests tr ON tr.id = wo.test_request_id
       ORDER BY wo.id DESC`
    );
    const { rows: taskRows } = await pool.query(`SELECT work_order_id, task_key, status, approval_status FROM work_order_tasks`);
    const { rows: requiredRows } = await pool.query(
      `SELECT ct.test_request_id, COUNT(*)::int AS required
       FROM test_items ti
       JOIN coupon_tests ct ON ct.id = ti.coupon_test_id
       WHERE ti.checked = TRUE AND ti.qty IS NOT NULL AND ti.qty <> '' AND ti.test_name = ANY($1)
       GROUP BY ct.test_request_id`,
      [Object.keys(TEST_NAME_TO_CATEGORY)]
    );
    const { rows: sheetRows } = await pool.query(
      `SELECT test_request_id, COUNT(*)::int AS created, COUNT(*) FILTER (WHERE status = 'final')::int AS finals
       FROM specimen_inspections GROUP BY test_request_id`
    );

    const tasksByWo = new Map();
    taskRows.forEach(t => {
      if (!tasksByWo.has(t.work_order_id)) tasksByWo.set(t.work_order_id, {});
      tasksByWo.get(t.work_order_id)[t.task_key] = t;
    });
    const requiredByReq = new Map(requiredRows.map(r => [r.test_request_id, r.required]));
    const sheetsByReq = new Map(sheetRows.map(r => [r.test_request_id, r]));

    return wos.map(wo => {
      const tasks = tasksByWo.get(wo.id) || {};
      const sheet = sheetsByReq.get(wo.test_request_id) || { created: 0, finals: 0 };
      const stages = TASK_STAGES.map(stage => ({
        key: stage.key,
        label: stage.label,
        pic: wo[stage.picColumn] || '',
        status: stage.key === 'preparation'
          ? inspectionStatus(requiredByReq.get(wo.test_request_id) || 0, sheet.created, sheet.finals)
          : taskStatus(tasks[stage.key])
      }));
      const doneCount = stages.filter(s => isDone(s.status)).length;
      return {
        work_order_id: wo.id,
        test_request_id: wo.test_request_id,
        job_number: wo.job_number,
        company: wo.company,
        project_name: wo.project_name,
        testing_date: wo.testing_date,
        stages,
        current: currentStageOf(stages),
        done_count: doneCount,
        total: stages.length,
        percent: Math.round((doneCount / stages.length) * 100)
      };
    });
  }

  // Ringkasan status semua Work Order untuk halaman Tasks.
  app.get('/api/work-order-progress', async (req, res) => {
    try {
      const rows = await loadProgressRows();
      res.json({ stages: TASK_STAGES.map(s => ({ key: s.key, label: s.label, hint: s.hint })), rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat progress Work Order' });
    }
  });

  app.get('/api/work-orders/:id/tasks/:key', async (req, res) => {
    try {
      if (!stageByKey(req.params.key)) return res.status(404).json({ error: 'Tahap tidak ditemukan' });
      const wo = await getFullWorkOrder(req.params.id);
      if (!wo) return res.status(404).json({ error: 'Not found' });
      res.json(await buildTaskDetail(wo, req.params.key));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat data tahap' });
    }
  });

  app.put('/api/work-orders/:id/tasks/:key', async (req, res) => {
    try {
      const stage = stageByKey(req.params.key);
      if (!stage) return res.status(404).json({ error: 'Tahap tidak ditemukan' });
      const wo = await getFullWorkOrder(req.params.id);
      if (!wo) return res.status(404).json({ error: 'Not found' });
      const b = req.body || {};

      if (stage.kind !== 'derived') {
        const requestedStatus = b.status === 'final' ? 'final' : 'draft';
        const candidate = sanitizeTask(stage, b, wo, requestedStatus, signatureToBuffer);

        if (requestedStatus === 'final') {
          const ctx = await loadContext(wo);
          const evalCtx = {
            ...ctx,
            tasks: { ...ctx.tasks, [stage.key]: candidate },
            statuses: { ...ctx.statuses, [stage.key]: taskStatus(candidate) }
          };
          const { problems } = evalStage(stage.key, wo, candidate, evalCtx);
          if (problems.length) {
            return res.status(400).json({
              error: `Tahap ${stage.label} belum bisa diselesaikan: ${problems.join('; ')}`,
              problems
            });
          }
        }

        await pool.query(
          `INSERT INTO work_order_tasks (
             work_order_id, task_key, status, task_date, notes, data,
             approval_status, approver_name, approver_signature, approval_date, approval_notes
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (work_order_id, task_key) DO UPDATE SET
             status = EXCLUDED.status, task_date = EXCLUDED.task_date, notes = EXCLUDED.notes, data = EXCLUDED.data,
             approval_status = EXCLUDED.approval_status, approver_name = EXCLUDED.approver_name,
             approver_signature = EXCLUDED.approver_signature, approval_date = EXCLUDED.approval_date,
             approval_notes = EXCLUDED.approval_notes, updated_at = NOW()`,
          [
            wo.id, stage.key, candidate.status, candidate.task_date, candidate.notes, JSON.stringify(candidate.data),
            candidate.approval_status, candidate.approver_name, candidate.approver_signature,
            candidate.approval_date, candidate.approval_notes
          ]
        );
      }

      if (b.pic !== undefined) {
        const pic = str(b.pic, 200);
        // Nama kolom berasal dari daftar TASK_STAGES di atas, bukan input pengguna.
        const picColumns = [stage.picColumn, ...(stage.extraPicColumns || [])];
        await pool.query(
          `UPDATE work_orders SET ${picColumns.map(c => `${c} = $1`).join(', ')}, updated_at = NOW() WHERE id = $2`,
          [pic, wo.id]
        );
        picColumns.forEach(c => { wo[c] = pic; });
      }

      res.json(await buildTaskDetail(wo, stage.key));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan data tahap', detail: String(err.message || err) });
    }
  });

  // Memuat semua Work Order dengan query agregat (bukan getFullWorkOrder per WO), lalu memakai
  // fungsi evaluasi tahap yang sama. Marking sample yang belum pernah dibuat dibiarkan kosong.
  async function loadQueueEntries() {
    const { rows: wos } = await pool.query(
      `SELECT wo.id, wo.test_request_id, wo.created_at,
              COALESCE(NULLIF(tr.witness_date, ''), wo.testing_date) AS testing_date,
              tr.job_number, tr.company, tr.project_name, tr.received_date
       FROM work_orders wo
       JOIN test_requests tr ON tr.id = wo.test_request_id
       ORDER BY wo.id ASC`
    );
    if (!wos.length) return [];
    const woIds = wos.map(w => w.id);
    const reqIds = wos.map(w => w.test_request_id);

    const { rows: coupons } = await pool.query(
      `SELECT id, test_request_id, row_no, coupon_type, coupon_type_other, material_type_grade
       FROM coupon_tests WHERE test_request_id = ANY($1) ORDER BY test_request_id, row_no`,
      [reqIds]
    );
    const couponIds = coupons.map(c => c.id);
    const { rows: items } = couponIds.length
      ? await pool.query(
          `SELECT coupon_test_id, test_name, qty, method FROM test_items
           WHERE coupon_test_id = ANY($1) AND checked = TRUE ORDER BY id`, [couponIds])
      : { rows: [] };
    const { rows: marks } = await pool.query(
      `SELECT work_order_id, coupon_row_no, sample_marking FROM work_order_sample_marks WHERE work_order_id = ANY($1)`, [woIds]);
    const { rows: taskRows } = await pool.query(
      `SELECT work_order_id, task_key, status, task_date, notes, data, approval_status, approver_name, approval_date, approval_notes
       FROM work_order_tasks WHERE work_order_id = ANY($1)`, [woIds]);
    const { rows: sheetRows } = await pool.query(
      `SELECT id, test_request_id, coupon_row_no, test_name, status FROM specimen_inspections
       WHERE test_request_id = ANY($1) ORDER BY id`, [reqIds]);
    const { rows: codeRows } = await pool.query(`SELECT test_name, code FROM test_type_codes`);

    const codes = {};
    codeRows.forEach(c => { if (c.code) codes[c.test_name] = c.code; });
    const itemsByCoupon = new Map();
    items.forEach(i => {
      if (!itemsByCoupon.has(i.coupon_test_id)) itemsByCoupon.set(i.coupon_test_id, []);
      itemsByCoupon.get(i.coupon_test_id).push({ test_name: i.test_name, checked: true, qty: i.qty || '', method: i.method || '' });
    });
    const markByKey = new Map(marks.map(m => [`${m.work_order_id}|${m.coupon_row_no}`, m.sample_marking || '']));
    const couponsByReq = new Map();
    coupons.forEach(c => {
      if (!couponsByReq.has(c.test_request_id)) couponsByReq.set(c.test_request_id, []);
      couponsByReq.get(c.test_request_id).push(c);
    });
    const tasksByWo = new Map();
    taskRows.forEach(t => {
      if (!tasksByWo.has(t.work_order_id)) tasksByWo.set(t.work_order_id, {});
      tasksByWo.get(t.work_order_id)[t.task_key] = t;
    });
    const sheetsByReq = new Map();
    sheetRows.forEach(sh => {
      if (!sheetsByReq.has(sh.test_request_id)) sheetsByReq.set(sh.test_request_id, []);
      sheetsByReq.get(sh.test_request_id).push(sh);
    });

    return wos.map(meta => {
      const wo = {
        id: meta.id,
        test_request_id: meta.test_request_id,
        coupon_tests: (couponsByReq.get(meta.test_request_id) || []).map(c => ({
          row_no: c.row_no,
          coupon_type: c.coupon_type || [],
          coupon_type_other: c.coupon_type_other || '',
          material_type_grade: c.material_type_grade || '',
          sample_marking: markByKey.get(`${meta.id}|${c.row_no}`) || '',
          test_items: itemsByCoupon.get(c.id) || [],
          other_tests: []
        }))
      };
      const tasks = tasksByWo.get(meta.id) || {};
      const sheets = sheetsByReq.get(meta.test_request_id) || [];
      const statuses = computeStatuses(wo, tasks, sheets, TEST_NAME_TO_CATEGORY);
      return { meta, wo, tasks, sheets, statuses, ctx: { tasks, sheets, statuses, codes, evidence: [], TEST_NAME_TO_CATEGORY } };
    });
  }

  const queueCounts = queues => Object.fromEntries(QUEUE_NAMES.map(n => [n, queues[n].length]));

  app.get('/api/queues/summary', async (req, res) => {
    try {
      res.json({ counts: queueCounts(buildQueues(await loadQueueEntries())) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat antrian' });
    }
  });

  app.get('/api/queues/:name', async (req, res) => {
    try {
      if (!QUEUE_NAMES.includes(req.params.name)) return res.status(404).json({ error: 'Antrian tidak ditemukan' });
      const queues = buildQueues(await loadQueueEntries());
      res.json({ name: req.params.name, rows: queues[req.params.name], counts: queueCounts(queues) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat antrian' });
    }
  });

  // ----- Evidence: foto / dokumen per Work Order (saat ini dipakai tahap Receiving) -----
  // Upload berupa body mentah (Content-Type = tipe file, nama file di header X-Filename), jadi
  // tidak butuh library multipart. Hanya gambar & PDF yang diterima; disajikan dengan nosniff.

  const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  const FILE_TASKS = ['receiving'];
  const MARKING_STATES = ['', 'before', 'after'];
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_FILES_PER_WO = 60;
  const FILE_COLUMNS = 'id, coupon_row_no, marking_state, filename, mime_type, size_bytes, created_at';

  app.get('/api/work-orders/:id/files', async (req, res) => {
    try {
      const task = String(req.query.task || 'receiving');
      if (!FILE_TASKS.includes(task)) return res.status(400).json({ error: 'Tahap tidak mendukung file evidence' });
      const { rows } = await pool.query(
        `SELECT ${FILE_COLUMNS} FROM work_order_files WHERE work_order_id = $1 AND task_key = $2 ORDER BY id ASC`,
        [req.params.id, task]
      );
      res.json({ files: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat file evidence' });
    }
  });

  if (rawBody) {
    app.post('/api/work-orders/:id/files', rawBody, async (req, res) => {
      try {
        const task = String(req.query.task || 'receiving');
        if (!FILE_TASKS.includes(task)) return res.status(400).json({ error: 'Tahap tidak mendukung file evidence' });

        const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!FILE_TYPES.includes(mime)) {
          return res.status(400).json({ error: 'Format file harus gambar (JPG, PNG, WEBP, GIF) atau PDF' });
        }
        const data = req.body;
        if (!Buffer.isBuffer(data) || !data.length) return res.status(400).json({ error: 'File kosong' });
        if (data.length > MAX_FILE_BYTES) return res.status(413).json({ error: 'Ukuran file maksimal 10 MB' });

        const { rows: woRows } = await pool.query(`SELECT test_request_id FROM work_orders WHERE id = $1`, [req.params.id]);
        if (!woRows.length) return res.status(404).json({ error: 'Not found' });

        let couponRowNo = null;
        if (req.query.coupon !== undefined && req.query.coupon !== '') {
          couponRowNo = Number(req.query.coupon);
          const { rows: couponRows } = Number.isInteger(couponRowNo)
            ? await pool.query(`SELECT 1 FROM coupon_tests WHERE test_request_id = $1 AND row_no = $2`, [woRows[0].test_request_id, couponRowNo])
            : { rows: [] };
          if (!couponRows.length) return res.status(400).json({ error: 'Coupon tidak ditemukan pada Work Order ini' });
        }
        const marking = pick(String(req.query.marking || ''), MARKING_STATES);

        const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM work_order_files WHERE work_order_id = $1`, [req.params.id]);
        if (n >= MAX_FILES_PER_WO) return res.status(400).json({ error: `Maksimal ${MAX_FILES_PER_WO} file per Work Order` });

        let filename = '';
        try { filename = decodeURIComponent(String(req.headers['x-filename'] || '')); } catch (e) { filename = ''; }
        filename = filename.replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 200) || 'file';

        const { rows: [file] } = await pool.query(
          `INSERT INTO work_order_files (work_order_id, task_key, coupon_row_no, marking_state, filename, mime_type, size_bytes, data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${FILE_COLUMNS}`,
          [req.params.id, task, couponRowNo, marking, filename, mime, data.length, data]
        );
        res.status(201).json(file);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengunggah file' });
      }
    });
  }

  app.get('/api/work-order-files/:fileId', async (req, res) => {
    try {
      if (!Number.isInteger(Number(req.params.fileId))) return res.status(404).send('File tidak ditemukan');
      const { rows } = await pool.query(`SELECT filename, mime_type, data FROM work_order_files WHERE id = $1`, [req.params.fileId]);
      if (!rows.length) return res.status(404).send('File tidak ditemukan');
      const f = rows[0];
      res.setHeader('Content-Type', f.mime_type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
      res.send(f.data);
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal memuat file');
    }
  });

  app.delete('/api/work-order-files/:fileId', async (req, res) => {
    try {
      if (!Number.isInteger(Number(req.params.fileId))) return res.status(404).json({ error: 'Not found' });
      const { rowCount } = await pool.query(`DELETE FROM work_order_files WHERE id = $1`, [req.params.fileId]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus file' });
    }
  });

  return { loadProgressRows };
}

module.exports = {
  TASK_STAGES,
  registerWorkOrderTaskRoutes,
  // diekspor untuk uji unit (fungsi murni)
  evalStage, computeStatuses, inspectionStatus, taskStatus, currentStageOf, buildQueues, sanitizeTask, buildInfo, testRowsOf, couponRowsOf
};

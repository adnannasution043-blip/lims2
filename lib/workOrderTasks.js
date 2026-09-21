// Tahap pengerjaan ("Tasks") per Work Order: Receiving -> Machining -> Inspection ->
// Testing -> Reporting (approval) -> Doc. Check (approval).
//
// Prinsip: baris kerja (coupon, jenis pengujian, qty, sample marking) SELALU diturunkan
// langsung dari Permintaan Uji/Work Order, bukan diketik ulang — halaman tahap hanya
// menyimpan isian di atasnya (kunci coupon_row_no / "coupon_row_no|test_name").
// Inspection tidak punya data sendiri: statusnya mengikuti sheet Pengecekan Spesimen.

const TASK_STAGES = [
  { key: 'receiving', label: 'Receiving', kind: 'form', picColumn: 'receiving_pic', dateLabel: 'Tanggal Penerimaan' },
  { key: 'machining', label: 'Machining', kind: 'form', picColumn: 'machining_pic', dateLabel: 'Tanggal Machining' },
  { key: 'inspection', label: 'Inspection', kind: 'derived', picColumn: 'inspection_pic', dateLabel: '' },
  { key: 'testing', label: 'Testing', kind: 'form', picColumn: 'testing_pic', dateLabel: 'Tanggal Selesai Testing' },
  { key: 'reporting', label: 'Reporting', kind: 'approval', picColumn: 'reporting_pic', dateLabel: 'Tanggal Laporan' },
  { key: 'doc_check', label: 'Doc. Check', kind: 'approval', picColumn: 'doc_checked_pic', dateLabel: 'Tanggal Pengecekan' }
];

const RECEIVED = ['', 'Y', 'N'];
const CONDITIONS = ['', 'Baik', 'Cacat / Rusak', 'Perlu Klarifikasi'];
const MACHINING_STATUS = ['', 'proses', 'selesai', 'na'];
const TEST_RESULTS = ['', 'accepted', 'rejected', 'na'];
const APPROVAL_STATUS = ['', 'approved', 'rejected'];
const YES_NO = ['', 'Y', 'N'];

const DOC_MANUAL_CHECKS = [
  { key: 'identity_match', label: 'Identitas pelanggan & Sample Marking sesuai Permintaan Uji' },
  { key: 'signatures_complete', label: 'Seluruh tanda tangan & approval dokumen lengkap' },
  { key: 'ready_to_release', label: 'Dokumen siap diserahkan ke pelanggan' }
];

const APPROVAL_LABELS = { '': 'Menunggu approval', approved: 'Disetujui', rejected: 'Ditolak — perlu revisi' };

function stageByKey(key) {
  return TASK_STAGES.find(s => s.key === key) || null;
}

function str(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function pick(value, allowed) {
  return allowed.includes(value) ? value : '';
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

// ---------- evaluasi tiap tahap (murni: tanpa akses DB) ----------
// Setiap builder mengembalikan { items, extra, stats, summary, problems }.
// `problems` = alasan tahap belum boleh diselesaikan (dipakai saat Simpan & Selesaikan).

function buildReceiving(wo, task) {
  const saved = savedItems(task);
  const items = couponRowsOf(wo).map(r => {
    const s = saved[r.key] || {};
    return { ...r, received: s.received || '', condition: s.condition || '', note: s.note || '' };
  });
  const answered = items.filter(i => i.received).length;
  const received = items.filter(i => i.received === 'Y').length;
  const problems = [];
  if (!items.length) problems.push('Belum ada Coupon Test pada Permintaan Uji');
  if (items.length - answered) problems.push(`${items.length - answered} coupon belum diisi status penerimaannya`);
  return {
    items,
    extra: { delivered_by: savedData(task).delivered_by || '' },
    stats: { total: items.length, answered, received },
    summary: items.length ? `${received}/${items.length} coupon diterima` : 'Belum ada coupon',
    problems
  };
}

function buildMachining(wo, task) {
  const saved = savedItems(task);
  const items = couponRowsOf(wo).map(r => {
    const s = saved[r.key] || {};
    return { ...r, method: s.method || '', status: s.status || '', note: s.note || '' };
  });
  const done = items.filter(i => i.status === 'selesai' || i.status === 'na').length;
  const problems = [];
  if (!items.length) problems.push('Belum ada Coupon Test pada Permintaan Uji');
  if (items.length - done) problems.push(`${items.length - done} coupon belum selesai di-machining`);
  return {
    items,
    extra: {},
    stats: { total: items.length, done },
    summary: items.length ? `${done}/${items.length} coupon selesai` : 'Belum ada coupon',
    problems
  };
}

function buildTesting(wo, task, sheets) {
  const saved = savedItems(task);
  const sheetByKey = new Map(sheets.filter(s => s.test_name).map(s => [`${s.coupon_row_no}|${s.test_name}`, s]));
  const items = testRowsOf(wo).map(r => {
    const s = saved[r.key] || {};
    const sheet = sheetByKey.get(r.key);
    return {
      ...r,
      tested_date: s.tested_date || '', equipment: s.equipment || '', result: s.result || '',
      result_value: s.result_value || '', note: s.note || '',
      sheet_id: sheet ? sheet.id : null, sheet_status: sheet ? (sheet.status || 'draft') : ''
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
  const problems = [];
  if (!stats.total) problems.push('Belum ada Jenis Pengujian yang dicentang pada Permintaan Uji');
  if (stats.total - stats.with_result) problems.push(`${stats.total - stats.with_result} pengujian belum ada hasilnya`);
  return {
    items,
    extra: {},
    stats,
    summary: stats.total ? `${stats.with_result}/${stats.total} pengujian ada hasil` : 'Belum ada pengujian',
    problems
  };
}

function buildInspection(wo, sheets, TEST_NAME_TO_CATEGORY) {
  const required = testRowsOf(wo).filter(r => TEST_NAME_TO_CATEGORY[r.test_name] && r.qty);
  const sheetByKey = new Map(sheets.filter(s => s.test_name).map(s => [`${s.coupon_row_no}|${s.test_name}`, s]));
  const items = required.map(r => {
    const sheet = sheetByKey.get(r.key);
    return { ...r, sheet_id: sheet ? sheet.id : null, sheet_status: sheet ? (sheet.status || 'draft') : '' };
  });
  const created = sheets.length;
  const finals = sheets.filter(s => s.status === 'final').length;
  const status = inspectionStatus(required.length, created, finals);
  let summary;
  if (status === 'na') summary = 'Tidak ada sheet yang diperlukan';
  else if (required.length) summary = `${finals}/${required.length} sheet final`;
  else summary = `${finals}/${created} sheet final`;
  return {
    items,
    extra: { sheets_created: created, sheets_final: finals },
    stats: { required: required.length, created, finals },
    summary,
    problems: [],
    status
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

function buildReporting(wo, task, ctx) {
  const testing = buildTesting(wo, ctx.tasks.testing, ctx.sheets);
  const approval = approvalOf(task);
  const reportNo = savedData(task).report_no || '';
  const problems = [];
  if (ctx.statuses.testing !== 'final') problems.push('Tahap Testing belum selesai');
  if (!reportNo) problems.push('No. Laporan belum diisi');
  if (approval.status !== 'approved') problems.push('Approval laporan belum berstatus Disetujui');
  return {
    items: [],
    extra: { report_no: reportNo, results: testing.items, results_stats: testing.stats },
    stats: testing.stats,
    summary: `${APPROVAL_LABELS[approval.status]}${reportNo ? ` · ${reportNo}` : ''}`,
    problems
  };
}

function buildDocCheck(wo, task, ctx) {
  const approval = approvalOf(task);
  const checks = savedData(task).checks || {};
  const auto = [
    { key: 'inspection_done', label: 'Pengecekan Spesimen selesai (semua sheet Final)', ok: isDone(ctx.statuses.inspection) },
    { key: 'testing_done', label: 'Hasil pengujian lengkap (tahap Testing selesai)', ok: ctx.statuses.testing === 'final' },
    { key: 'reporting_done', label: 'Laporan hasil uji sudah disetujui (tahap Reporting selesai)', ok: ctx.statuses.reporting === 'final' }
  ];
  const manual = DOC_MANUAL_CHECKS.map(c => ({ ...c, value: checks[c.key] || '' }));
  const okCount = auto.filter(a => a.ok).length + manual.filter(m => m.value === 'Y').length;
  const total = auto.length + manual.length;
  const problems = [];
  auto.filter(a => !a.ok).forEach(a => problems.push(`${a.label} belum terpenuhi`));
  manual.filter(m => m.value !== 'Y').forEach(m => problems.push(`"${m.label}" belum dicentang`));
  if (approval.status !== 'approved') problems.push('Approval pengecekan dokumen belum berstatus Disetujui');
  return {
    items: [],
    extra: { auto, manual },
    stats: { ok: okCount, total },
    summary: `${okCount}/${total} butir terpenuhi · ${APPROVAL_LABELS[approval.status]}`,
    problems
  };
}

function computeStatuses(wo, tasks, sheets, TEST_NAME_TO_CATEGORY) {
  const statuses = {};
  for (const stage of TASK_STAGES) {
    statuses[stage.key] = stage.key === 'inspection'
      ? buildInspection(wo, sheets, TEST_NAME_TO_CATEGORY).status
      : taskStatus(tasks[stage.key]);
  }
  return statuses;
}

function evalStage(key, wo, task, ctx) {
  if (key === 'receiving') return buildReceiving(wo, task);
  if (key === 'machining') return buildMachining(wo, task);
  if (key === 'inspection') return buildInspection(wo, ctx.sheets, ctx.TEST_NAME_TO_CATEGORY);
  if (key === 'testing') return buildTesting(wo, task, ctx.sheets);
  if (key === 'reporting') return buildReporting(wo, task, ctx);
  return buildDocCheck(wo, task, ctx);
}

// ---------- data yang dikirim form -> baris yang akan disimpan ----------

function sanitizeTask(stage, body, wo, requestedStatus, signatureToBuffer) {
  const b = body || {};
  const incoming = Array.isArray(b.items) ? b.items : [];
  const data = {};

  if (stage.key === 'receiving' || stage.key === 'machining') {
    const validKeys = new Set(couponRowsOf(wo).map(r => r.key));
    const items = {};
    for (const it of incoming) {
      const k = String(it.key);
      if (!validKeys.has(k)) continue;
      items[k] = stage.key === 'receiving'
        ? { received: pick(it.received, RECEIVED), condition: pick(it.condition, CONDITIONS), note: str(it.note) }
        : { method: str(it.method, 120), status: pick(it.status, MACHINING_STATUS), note: str(it.note) };
    }
    data.items = items;
    if (stage.key === 'receiving') data.delivered_by = str(b.delivered_by, 200);
  } else if (stage.key === 'testing') {
    const validKeys = new Set(testRowsOf(wo).map(r => r.key));
    const items = {};
    for (const it of incoming) {
      const k = String(it.key);
      if (!validKeys.has(k)) continue;
      items[k] = {
        tested_date: str(it.tested_date, 20), equipment: str(it.equipment, 120),
        result: pick(it.result, TEST_RESULTS), result_value: str(it.result_value), note: str(it.note)
      };
    }
    data.items = items;
  } else if (stage.key === 'reporting') {
    data.report_no = str(b.report_no, 80);
  } else if (stage.key === 'doc_check') {
    const checks = {};
    for (const c of DOC_MANUAL_CHECKS) checks[c.key] = pick((b.checks || {})[c.key], YES_NO);
    data.checks = checks;
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

// ---------- rute ----------

function registerWorkOrderTaskRoutes(app, deps) {
  const { pool, getFullWorkOrder, signatureToBuffer, signatureToDataUrl, TEST_NAME_TO_CATEGORY } = deps;

  async function loadContext(wo) {
    const { rows: taskRows } = await pool.query(`SELECT * FROM work_order_tasks WHERE work_order_id = $1`, [wo.id]);
    const tasks = {};
    taskRows.forEach(t => { tasks[t.task_key] = t; });
    const { rows: sheets } = await pool.query(
      `SELECT id, coupon_row_no, test_name, category, shape, status, inspection_date
       FROM specimen_inspections WHERE test_request_id = $1 ORDER BY id ASC`,
      [wo.test_request_id]
    );
    const statuses = computeStatuses(wo, tasks, sheets, TEST_NAME_TO_CATEGORY);
    return { tasks, sheets, statuses, TEST_NAME_TO_CATEGORY };
  }

  function buildStages(wo, ctx) {
    return TASK_STAGES.map(stage => {
      const task = ctx.tasks[stage.key] || null;
      const detail = evalStage(stage.key, wo, task, ctx);
      return {
        key: stage.key,
        label: stage.label,
        kind: stage.kind,
        status: ctx.statuses[stage.key],
        pic: wo[stage.picColumn] || '',
        summary: detail.summary,
        date: task ? (task.task_date || '') : '',
        updated_at: task ? task.updated_at : null
      };
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
        kind: stage.kind,
        date_label: stage.dateLabel,
        status: ctx.statuses[key],
        pic: wo[stage.picColumn] || '',
        task_date: task ? (task.task_date || '') : '',
        notes: task ? (task.notes || '') : '',
        updated_at: task ? task.updated_at : null
      },
      stages: buildStages(wo, ctx),
      items: detail.items,
      extra: detail.extra,
      stats: detail.stats,
      summary: detail.summary,
      approval
    };
  }

  app.get('/api/work-orders/:id/progress', async (req, res) => {
    try {
      const wo = await getFullWorkOrder(req.params.id);
      if (!wo) return res.status(404).json({ error: 'Not found' });
      const ctx = await loadContext(wo);
      const stages = buildStages(wo, ctx);
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

  // Ringkasan status semua Work Order untuk halaman Tasks — pakai query agregat
  // (bukan getFullWorkOrder per WO) supaya tetap ringan saat Work Order banyak.
  app.get('/api/work-order-progress', async (req, res) => {
    try {
      const { rows: wos } = await pool.query(
        `SELECT wo.id, wo.test_request_id, wo.testing_date,
                wo.receiving_pic, wo.machining_pic, wo.inspection_pic, wo.testing_pic, wo.reporting_pic, wo.doc_checked_pic,
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

      const rows = wos.map(wo => {
        const tasks = tasksByWo.get(wo.id) || {};
        const sheet = sheetsByReq.get(wo.test_request_id) || { created: 0, finals: 0 };
        const stages = TASK_STAGES.map(stage => ({
          key: stage.key,
          label: stage.label,
          pic: wo[stage.picColumn] || '',
          status: stage.key === 'inspection'
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
          done_count: doneCount,
          total: stages.length,
          percent: Math.round((doneCount / stages.length) * 100)
        };
      });

      res.json({ stages: TASK_STAGES.map(s => ({ key: s.key, label: s.label })), rows });
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
        // picColumn berasal dari daftar TASK_STAGES di atas, bukan input pengguna.
        await pool.query(`UPDATE work_orders SET ${stage.picColumn} = $1, updated_at = NOW() WHERE id = $2`, [pic, wo.id]);
        wo[stage.picColumn] = pic;
      }

      res.json(await buildTaskDetail(wo, stage.key));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan data tahap', detail: String(err.message || err) });
    }
  });
}

module.exports = {
  TASK_STAGES,
  registerWorkOrderTaskRoutes,
  // diekspor untuk uji unit (fungsi murni)
  evalStage, computeStatuses, inspectionStatus, taskStatus, sanitizeTask, testRowsOf, couponRowsOf
};

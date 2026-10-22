// Ringkasan halaman Dashboard (manajemen laboratorium): KPI periode berjalan dibanding periode sebelumnya, tren per bulan,
// status Work Order & Pengecekan Spesimen, jumlah pengujian per jenis, Turn Around Time, klien teratas, Work Order
// terlama, dan aktivitas per tahap. Semua angka diturunkan dari data yang sudah ada (tidak ada tabel baru).
//
// Periode = N bulan kalender terakhir menurut WIB, termasuk bulan berjalan. Tanggal teks (received_date, date_tested,
// approval_date) dibaca 'YYYY-MM-DD'; timestamp diubah ke bulan WIB.

const TAT_TARGET_DAYS = 5;   // target Turn Around Time (hari), garis acuan di grafik
const PERIODS = [3, 6, 12, 24];

const monthOfTs = ts => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }).formatToParts(d);
  return `${p.find(x => x.type === 'year').value}-${p.find(x => x.type === 'month').value}`;
};
const dayOfTs = ts => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);   // YYYY-MM-DD
};
const textDay = v => (/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '');
const daysBetween = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;

// Daftar kunci bulan 'YYYY-MM' sebanyak n, berakhir di bulan `end`
function monthKeys(end, n) {
  let [y, m] = end.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

const pctChange = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : (cur ? null : 0));

function topWithRest(entries, n, restLabel) {
  const sorted = entries.filter(e => e.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((s, e) => s + e.value, 0);
  return rest ? top.concat({ label: restLabel, value: rest, rest: true }) : top;
}

/**
 * data: { requests, workOrders, progress, testItems, testReports, sheets, tasks, issuedCoupons }
 * opts: { months, now }
 */
function buildDashboard(data, opts = {}) {
  const months = PERIODS.includes(Number(opts.months)) ? Number(opts.months) : 12;
  const now = opts.now || new Date();
  const endKey = monthOfTs(now);
  const today = dayOfTs(now);
  const keys = monthKeys(endKey, months);
  const prevKeys = monthKeys(monthKeys(keys[0], 2)[0], months);
  const inCur = k => keys.includes(k), inPrev = k => prevKeys.includes(k);

  const reqById = new Map(data.requests.map(r => [r.id, r]));
  const reqDay = r => textDay(r.received_date) || dayOfTs(r.created_at);
  const tasksByWo = new Map();
  data.tasks.forEach(t => { if (!tasksByWo.has(t.work_order_id)) tasksByWo.set(t.work_order_id, {}); tasksByWo.get(t.work_order_id)[t.task_key] = t; });
  const progressByWo = new Map(data.progress.map(p => [p.work_order_id, p]));
  const couponsByWo = new Map(data.issuedCoupons.map(c => [c.work_order_id, Number(c.n) || 0]));

  // LHU terbit = Review & Approval Final + Disetujui; tanggal terbit = tanggal approval (atau waktu Review disimpan)
  const issued = data.workOrders.map(wo => {
    const rv = (tasksByWo.get(wo.id) || {}).review;
    if (!rv || rv.status !== 'final' || rv.approval_status !== 'approved') return null;
    const day = textDay(rv.approval_date) || dayOfTs(rv.updated_at);
    const req = reqById.get(wo.test_request_id);
    return { wo, day, month: day.slice(0, 7), coupons: couponsByWo.get(wo.id) || 1, receivedDay: req ? reqDay(req) : '' };
  }).filter(Boolean);

  // ----- KPI -----
  const count = (list, monthOf, test) => list.filter(x => test(monthOf(x))).length;
  const reqMonth = r => reqDay(r).slice(0, 7);
  const woMonth = w => monthOfTs(w.created_at);
  const finalReports = data.testReports.filter(r => r.status === 'final');
  const reportMonth = r => (textDay(r.date_tested) || dayOfTs(r.updated_at)).slice(0, 7);
  const specimens = test => finalReports.filter(r => test(reportMonth(r))).reduce((s, r) => s + (Number(r.n) || 0), 0);
  const lhu = test => issued.filter(i => test(i.month)).reduce((s, i) => s + i.coupons, 0);

  // Perlu tindak lanjut (kondisi saat ini, bukan per periode)
  const woByReq = new Set(data.workOrders.map(w => w.test_request_id));
  const sheetsByReq = new Map();
  data.sheets.forEach(s => sheetsByReq.set(s.test_request_id, (sheetsByReq.get(s.test_request_id) || 0) + 1));
  const followUps = [];
  data.requests.filter(r => r.status === 'final' && !woByReq.has(r.id))
    .forEach(r => followUps.push({ kind: 'wo', label: `${r.job_number} · ${r.company || '-'}`, note: 'Permintaan Uji Final, belum ada Work Order', request_id: r.id }));
  data.workOrders.forEach(wo => {
    const p = progressByWo.get(wo.id);
    const t = tasksByWo.get(wo.id) || {};
    const label = `${wo.job_number} · ${wo.company || '-'}`;
    if (wo.machining_status === 'selesai' && !sheetsByReq.get(wo.test_request_id) && p && p.stages.find(s => s.key === 'preparation').status !== 'final') {
      followUps.push({ kind: 'specimen', label, note: 'Machining selesai, Pengecekan Spesimen belum dibuat', request_id: wo.test_request_id, work_order_id: wo.id });
    }
    const cs = t.reporting && t.reporting.customer_status;
    if (cs === 'revision' || cs === 'rejected') {
      followUps.push({ kind: 'customer', label, note: cs === 'revision' ? 'Customer meminta revisi Preliminary Report' : 'Preliminary Report ditolak customer', work_order_id: wo.id, stage: 'reporting' });
    }
    if (t.review && t.review.approval_status === 'rejected') {
      followUps.push({ kind: 'review', label, note: 'Review & Approval: Ditolak / Revisi', work_order_id: wo.id, stage: 'review' });
    }
  });

  const kpi = {
    requests: { value: count(data.requests, reqMonth, inCur), prev: count(data.requests, reqMonth, inPrev) },
    work_orders: { value: count(data.workOrders, woMonth, inCur), prev: count(data.workOrders, woMonth, inPrev) },
    specimens: { value: specimens(inCur), prev: specimens(inPrev) },
    lhu: { value: lhu(inCur), prev: lhu(inPrev) },
    follow_up: { value: followUps.length }
  };
  Object.values(kpi).forEach(k => { if (k.prev !== undefined) k.change = pctChange(k.value, k.prev); });

  // ----- tren per bulan -----
  const trend = keys.map(k => ({
    month: k,
    requests: count(data.requests, reqMonth, m => m === k),
    lhu: lhu(m => m === k)
  }));

  // ----- status Work Order (dibuat dalam periode) -----
  const woStatus = { running: 0, done: 0, waiting: 0 };
  data.workOrders.filter(w => inCur(woMonth(w))).forEach(w => {
    const p = progressByWo.get(w.id);
    if (!p) return;
    if (p.done_count === p.total) woStatus.done++;
    else if (p.stages[0].status !== 'final') woStatus.waiting++;
    else woStatus.running++;
  });

  // ----- status Pengecekan Spesimen -----
  // Final / Draft = sheet yang dibuat dalam periode; Menunggu = sheet yang masih harus dibuat pada Work Order berjalan
  const requiredByReq = new Map();
  data.testItems.filter(t => String(t.qty || '').trim()).forEach(t => requiredByReq.set(t.test_request_id, (requiredByReq.get(t.test_request_id) || 0) + 1));
  const sheetsInPeriod = data.sheets.filter(s => inCur(monthOfTs(s.created_at)));
  const waitingSheets = data.workOrders.reduce((sum, wo) => {
    const p = progressByWo.get(wo.id);
    if (!p || p.done_count === p.total) return sum;
    return sum + Math.max(0, (requiredByReq.get(wo.test_request_id) || 0) - (sheetsByReq.get(wo.test_request_id) || 0));
  }, 0);
  const specimenStatus = {
    final: sheetsInPeriod.filter(s => s.status === 'final').length,
    draft: sheetsInPeriod.filter(s => s.status !== 'final').length,
    waiting: waitingSheets
  };

  // ----- jumlah pengujian (spesimen) per jenis, Permintaan Uji dalam periode -----
  const reqInPeriod = new Set(data.requests.filter(r => inCur(reqMonth(r))).map(r => r.id));
  const byType = new Map();
  data.testItems.filter(t => reqInPeriod.has(t.test_request_id)).forEach(t => {
    const n = parseInt(t.qty, 10) || 0;
    if (n) byType.set(t.test_name, (byType.get(t.test_name) || 0) + n);
  });
  const testsByType = topWithRest([...byType].map(([label, value]) => ({ label, value })), 7, 'Lainnya');

  // Grafik per bulan yang rapat (TAT, aktivitas) cukup memuat 6 bulan terakhir periode
  const recent = keys.slice(-6);

  // ----- Turn Around Time: rata-rata hari dari sampel diterima sampai LHU terbit, per bulan terbit -----
  const tat = recent.map(k => {
    const list = issued.filter(i => i.month === k && i.receivedDay && i.day).map(i => Math.max(0, daysBetween(i.receivedDay, i.day)));
    return { month: k, days: list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null, count: list.length };
  });

  // ----- klien teratas (Permintaan Uji dalam periode) -----
  const byClient = new Map();
  data.requests.filter(r => reqInPeriod.has(r.id)).forEach(r => {
    const c = String(r.company || '').trim() || '(tanpa nama)';
    byClient.set(c, (byClient.get(c) || 0) + 1);
  });
  const topClients = topWithRest([...byClient].map(([label, value]) => ({ label, value })), 5, 'Lainnya');

  // ----- Work Order berjalan dengan durasi terlama (hari sejak sampel diterima) -----
  const testsByReq = new Map();
  data.testItems.forEach(t => { if (!testsByReq.has(t.test_request_id)) testsByReq.set(t.test_request_id, []); const l = testsByReq.get(t.test_request_id); if (!l.includes(t.test_name)) l.push(t.test_name); });
  const longest = data.workOrders.map(wo => {
    const p = progressByWo.get(wo.id);
    if (!p || p.done_count === p.total) return null;
    const req = reqById.get(wo.test_request_id);
    const start = (req && reqDay(req)) || dayOfTs(wo.created_at);
    const tests = testsByReq.get(wo.test_request_id) || [];
    return {
      work_order_id: wo.id, job_number: wo.job_number, company: wo.company || '',
      tests: tests.slice(0, 2).join(', ') + (tests.length > 2 ? ` +${tests.length - 2}` : ''),
      days: start ? Math.max(0, Math.floor(daysBetween(start, today))) : 0,
      stage: p.current.label, stage_key: p.current.key, stage_status: p.current.status
    };
  }).filter(Boolean).sort((a, b) => b.days - a.days).slice(0, 5);

  // ----- aktivitas per tahap per bulan (jumlah tahap / sheet yang selesai pada bulan itu) -----
  const tally = (list, monthOf) => recent.map(k => list.filter(x => monthOf(x) === k).length);
  const finalTasks = key => data.tasks.filter(t => t.task_key === key && t.status === 'final');
  const activity = {
    months: recent,
    series: [
      { key: 'receiving', label: 'Receiving', values: tally(finalTasks('receiving'), t => monthOfTs(t.updated_at)) },
      { key: 'preparation', label: 'Machining', values: tally(data.workOrders.filter(w => w.machining_finished_at), w => monthOfTs(w.machining_finished_at)) },
      { key: 'inspection', label: 'Pengecekan Spesimen', values: tally(data.sheets.filter(s => s.status === 'final'), s => monthOfTs(s.updated_at)) },
      { key: 'testing', label: 'Lembar Hasil Uji', values: tally(finalReports, r => monthOfTs(r.updated_at)) },
      { key: 'review', label: 'Review', values: tally(finalTasks('review'), t => monthOfTs(t.updated_at)) },
      { key: 'lhu', label: 'LHU Terbit', values: recent.map(k => lhu(m => m === k)) }
    ]
  };

  return {
    period: { months, from: keys[0], to: keys[keys.length - 1], prev_from: prevKeys[0], prev_to: prevKeys[prevKeys.length - 1], options: PERIODS },
    kpi, follow_ups: followUps.slice(0, 20), trend, wo_status: woStatus, specimen_status: specimenStatus,
    tests_by_type: testsByType, tat: { target: TAT_TARGET_DAYS, months: tat }, top_clients: topClients,
    longest, activity
  };
}

function registerDashboardRoutes(app, deps) {
  const { pool, loadProgressRows } = deps;
  app.get('/api/dashboard', async (req, res) => {
    try {
      const q = sql => pool.query(sql).then(r => r.rows);
      const [requests, workOrders, testItems, testReports, sheets, tasks, issuedCoupons, progress] = await Promise.all([
        q(`SELECT id, job_number, company, status, received_date, created_at FROM test_requests`),
        q(`SELECT wo.id, wo.test_request_id, wo.created_at, wo.machining_status, wo.machining_finished_at, tr.job_number, tr.company
           FROM work_orders wo JOIN test_requests tr ON tr.id = wo.test_request_id`),
        q(`SELECT ct.test_request_id, ti.test_name, ti.qty FROM test_items ti JOIN coupon_tests ct ON ct.id = ti.coupon_test_id WHERE ti.checked = TRUE`),
        q(`SELECT test_request_id, status, date_tested, updated_at, jsonb_array_length(rows) AS n FROM test_reports`),
        q(`SELECT test_request_id, status, created_at, updated_at FROM specimen_inspections`),
        q(`SELECT work_order_id, task_key, status, approval_status, approval_date, updated_at, data->>'customer_status' AS customer_status FROM work_order_tasks`),
        q(`SELECT work_order_id, COUNT(*) AS n FROM work_order_sample_marks WHERE report_no IS NOT NULL AND report_no <> '' GROUP BY work_order_id`),
        loadProgressRows()
      ]);
      res.json(buildDashboard({ requests, workOrders, testItems, testReports, sheets, tasks, issuedCoupons, progress }, { months: req.query.months }));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat dashboard' });
    }
  });
}

module.exports = { registerDashboardRoutes, buildDashboard, monthKeys, TAT_TARGET_DAYS };

(function () {
  const contentEl = document.getElementById('content');
  const topbarActions = document.getElementById('topbarActions');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  const toastEl = document.getElementById('toast');

  let TEST_TYPES = [];
  let WELDING_PROCESSES = [];
  let WELDING_POSITIONS = [];
  let REF_CODES = [];
  let COUPON_TYPES = [];
  let WO_PICS = [];
  let TEST_METHODS = [];
  let CUSTOMERS = [];
  let EQUIPMENT = [];
  let state = { view: 'dashboard', editingId: null, couponRows: [], tableUI: {} };

  // ---------- utils ----------

  function toast(msg, type) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => { toastEl.className = 'toast'; }, 2600);
  }

  function esc(s) {
    return (s ?? '').toString().replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function api(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.error || `Request failed (${res.status})`);
      Object.assign(e, err);
      throw e;
    }
    return res.status === 204 ? null : res.json();
  }

  // ---------- reusable searchable + paginated table ----------
  // Client-side only: `allRows` is already fully loaded, this just filters by a
  // substring match across `searchFields` and slices a page out of the result.
  // Re-renders just its own container (search box + table + pager) on every
  // keystroke/page change, without touching the rest of the page or the API.

  function renderSearchablePaginatedTable(opts) {
    const {
      key, containerEl, allRows, searchFields, renderTableHtml,
      bindRowEvents, emptyHtml, searchPlaceholder, pageSize = 10
    } = opts;

    const ui = (state.tableUI[key] = state.tableUI[key] || { search: '', page: 1 });
    const term = ui.search.trim().toLowerCase();
    const filtered = term
      ? allRows.filter(r => searchFields.some(f => String(r[f] ?? '').toLowerCase().includes(term)))
      : allRows;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (ui.page > totalPages) ui.page = totalPages;
    if (ui.page < 1) ui.page = 1;
    const start = (ui.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    const rerender = () => renderSearchablePaginatedTable(opts);

    const pagerHtml = filtered.length > pageSize ? `
      <div class="table-pager">
        <span class="muted">Halaman ${ui.page} dari ${totalPages} &mdash; ${filtered.length} data</span>
        <div class="table-pager-btns">
          <button type="button" class="btn btn-sm" data-pg="prev" ${ui.page <= 1 ? 'disabled' : ''}>&larr; Sebelumnya</button>
          <button type="button" class="btn btn-sm" data-pg="next" ${ui.page >= totalPages ? 'disabled' : ''}>Berikutnya &rarr;</button>
        </div>
      </div>` : '';

    containerEl.innerHTML = `
      <div class="table-search">
        <input type="text" id="${key}-search" placeholder="${esc(searchPlaceholder || 'Cari...')}" value="${esc(ui.search)}">
        ${term ? `<span class="muted">${filtered.length} dari ${allRows.length} data cocok</span>` : ''}
      </div>
      ${pageRows.length ? renderTableHtml(pageRows) : (emptyHtml || '<p class="muted" style="padding:16px 0;">Tidak ada data.</p>')}
      ${pagerHtml}
    `;

    const searchInput = document.getElementById(`${key}-search`);
    searchInput.addEventListener('input', (e) => {
      ui.search = e.target.value;
      ui.page = 1;
      rerender();
    });
    // keep focus + caret position across the re-render triggered by typing
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);

    containerEl.querySelectorAll('[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => {
        ui.page += btn.dataset.pg === 'next' ? 1 : -1;
        rerender();
      });
    });

    if (pageRows.length && bindRowEvents) bindRowEvents(containerEl);
  }

  function blankCouponRow() {
    return {
      coupon_type: [],
      coupon_type_other: '',
      material_type_grade: '',
      material_size: '',
      outside_diameter: '',
      thickness: '',
      heat_number: '',
      welding_process: '',
      welding_position: '',
      ref_code: '',
      no_wps: '',
      testing_purpose: '',
      note: '',
      charpy_temp: '', charpy_wm: '', charpy_bm: '', charpy_haz: '',
      charpy_fl: '', charpy_fl2: '', charpy_optional_label: '', charpy_optional: '',
      hardness_spot: '',
      test_items: TEST_TYPES.map(name => ({ test_name: name, checked: false, qty: '', method: '' })),
      other_tests: []
    };
  }

  // ---------- sidebar toggle ----------

  (function initSidebarToggle() {
    const appShell = document.querySelector('.app-shell');
    const toggleBtn = document.getElementById('sidebarToggle');
    if (!appShell || !toggleBtn) return;

    let collapsed = false;
    try { collapsed = localStorage.getItem('sidebarCollapsed') === 'true'; } catch (e) {}
    appShell.classList.toggle('sidebar-collapsed', collapsed);

    toggleBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      appShell.classList.toggle('sidebar-collapsed', collapsed);
      try { localStorage.setItem('sidebarCollapsed', String(collapsed)); } catch (e) {}
    });
  })();

  // ---------- nav ----------

  document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.nav;
      if (key === 'dashboard') {
        state.view = 'dashboard';
        render();
      } else if (key === 'permintaan-uji') {
        state.view = 'list';
        state.editingId = null;
        render();
      } else if (key === 'work-order') {
        state.view = 'wo-list';
        state.woEditingId = null;
        render();
      } else if (key === 'manajemen-data') {
        state.view = 'master-data';
        render();
      } else if (key === 'pengecekan-spesimen') {
        state.view = 'specimen-list';
        render();
      } else if (key === 'hasil-laporan') {
        state.view = 'lhu-list';
        render();
      } else if (key === 'timeline') {
        state.view = 'timeline';
        render();
      } else if (key === 'tasks') {
        state.view = 'wo-tasks';
        render();
      } else if (key === 'pengaturan') {
        state.view = 'settings';
        render();
      } else if (key.startsWith('q-')) {
        state.view = 'queue-' + key.slice(2);
        render();
      } else if (key === 'keluar') {
        toast('Logout belum tersedia di tahap ini', 'error');
      } else {
        toast('Modul ini akan tersedia di tahap berikutnya', 'error');
      }
    });
  });

  // ---------- dashboard ----------

  async function renderDashboard() {
    pageTitle.textContent = 'Dashboard';
    pageSubtitle.textContent = 'Ringkasan aktivitas laboratorium — DETECH LIMS';
    topbarActions.innerHTML = '';

    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;

    let requests = [], workOrders = [], specimens = [];
    try {
      [requests, workOrders, specimens] = await Promise.all([
        api('/api/requests'),
        api('/api/work-orders'),
        api('/api/specimen-inspections')
      ]);
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat data: ${esc(e.message)}</p></div>`;
      return;
    }

    const draftRequests = requests.filter(r => r.status !== 'final').length;
    const finalRequests = requests.length - draftRequests;
    const draftWO = workOrders.filter(w => w.status !== 'complete').length;
    const finalWO = workOrders.length - draftWO;
    const draftSpecimens = specimens.filter(s => s.status !== 'final').length;
    const finalSpecimens = specimens.length - draftSpecimens;

    const specimenRequestIds = new Set(specimens.map(s => s.test_request_id));
    const needsWO = requests.filter(r => r.status === 'final' && !r.work_order_id);
    // Sheet Pengecekan Spesimen baru bisa dibuat setelah machining selesai.
    const needsSpecimen = workOrders.filter(w => w.stage && w.stage.statuses && w.stage.statuses.preparation === 'draft'
      && w.machining_status === 'selesai' && !specimenRequestIds.has(w.test_request_id));
    const actionCount = needsWO.length + needsSpecimen.length;

    // Status machining tiap Work Order: menunggu (sampel sudah diterima, belum dimachining), sedang, atau selesai
    // tetapi inspeksi spesimen belum selesai.
    const machiningRows = workOrders.map(w => {
      const st = (w.stage && w.stage.statuses) || {};
      let group = null;
      if (st.preparation === 'final' || st.preparation === 'na') group = null;
      else if (w.machining_status === 'proses') group = 'proses';
      else if (w.machining_status === 'selesai') group = 'selesai';
      else if (st.receiving === 'final') group = 'menunggu';
      return group ? { ...w, group } : null;
    }).filter(Boolean);
    const machiningOrder = { proses: 0, menunggu: 1, selesai: 2 };
    machiningRows.sort((a, b) => machiningOrder[a.group] - machiningOrder[b.group]);
    const machiningCount = g => machiningRows.filter(r => r.group === g).length;
    const machiningGroupHtml = {
      proses: '<span class="st-pill st-draft">Sedang machining</span>',
      menunggu: '<span class="st-pill st-pending">Menunggu machining</span>',
      selesai: '<span class="st-pill st-final">Machining selesai &middot; siap inspeksi</span>'
    };

    const totalRequests = requests.length;
    const funnelStages = [
      { label: 'Permintaan Uji', count: requests.length, pct: 100 },
      { label: 'Work Order', count: workOrders.length, pct: totalRequests ? Math.min(100, Math.round(workOrders.length / totalRequests * 100)) : 0 },
      { label: 'Pengecekan Spesimen', count: specimenRequestIds.size, pct: totalRequests ? Math.min(100, Math.round(specimenRequestIds.size / totalRequests * 100)) : 0 }
    ];

    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: d.toLocaleDateString('id-ID', { month: 'short' }), count: 0 });
    }
    requests.forEach(r => {
      const bucket = months.find(m => m.key === (r.received_date || '').slice(0, 7));
      if (bucket) bucket.count += 1;
    });
    const maxMonthCount = Math.max(1, ...months.map(m => m.count));

    const ACTIVITY_ICON = { request: '&#128203;', wo: '&#128295;', specimen: '&#9879;' };
    const activity = [
      ...requests.map(r => ({ type: 'request', label: `Permintaan Uji ${r.job_number}`, sub: r.company, status: r.status, created_at: r.created_at })),
      ...workOrders.map(w => ({ type: 'wo', label: `Work Order ${w.job_number}`, sub: w.company, status: w.status, created_at: w.created_at, badgeHtml: w.stage ? stageBadgeHtml(w.stage.label, w.stage.status) : '' })),
      ...specimens.map(s => ({ type: 'specimen', label: `Pengecekan Spesimen ${s.job_number}`, sub: s.test_name || SPECIMEN_CATEGORY_LABELS[s.category] || s.category, status: s.status, created_at: s.created_at }))
    ].filter(a => a.created_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

    const todayLabel = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    contentEl.innerHTML = `
      <div class="dash-hero">
        <p class="dash-hero-eyebrow">Selamat datang kembali</p>
        <h2 class="dash-hero-title">Ringkasan Laboratorium DETECH</h2>
        <p class="muted">${esc(todayLabel)}</p>
      </div>

      <div class="dash-stats">
        <div class="dash-stat-card">
          <div class="dash-stat-icon">&#128203;</div>
          <div>
            <p class="dash-stat-value">${requests.length}</p>
            <p class="dash-stat-label">Permintaan Uji</p>
            <p class="dash-stat-sub">${draftRequests} draft &middot; ${finalRequests} final</p>
          </div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-icon">&#128295;</div>
          <div>
            <p class="dash-stat-value">${workOrders.length}</p>
            <p class="dash-stat-label">Work Order</p>
            <p class="dash-stat-sub">${draftWO} berjalan &middot; ${finalWO} selesai</p>
          </div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-icon">&#9879;</div>
          <div>
            <p class="dash-stat-value">${specimens.length}</p>
            <p class="dash-stat-label">Pengecekan Spesimen</p>
            <p class="dash-stat-sub">${draftSpecimens} draft &middot; ${finalSpecimens} final</p>
          </div>
        </div>
        <div class="dash-stat-card ${actionCount ? 'is-alert' : ''}">
          <div class="dash-stat-icon">&#9888;</div>
          <div>
            <p class="dash-stat-value">${actionCount}</p>
            <p class="dash-stat-label">Perlu Tindak Lanjut</p>
            <p class="dash-stat-sub">${actionCount ? 'Butuh langkah berikutnya' : 'Semua sudah tertangani'}</p>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <p class="card-title">Status Machining Spesimen</p>
        <p class="card-desc">${machiningCount('menunggu')} menunggu &middot; ${machiningCount('proses')} sedang machining &middot; ${machiningCount('selesai')} selesai machining (siap diinspeksi)</p>
        ${machiningRows.length === 0 ? `<p class="dash-empty">Tidak ada spesimen yang sedang menunggu atau dalam proses machining.</p>` : `
          <div class="dash-action-list">
            ${machiningRows.slice(0, 8).map(w => `
              <div class="dash-action-item">
                <div>
                  <strong>${esc(w.job_number)}</strong><span class="muted"> &middot; ${esc(w.company)}</span>
                  <p class="dash-action-hint">${machiningGroupHtml[w.group]}
                    ${w.group === 'proses' && w.machining_started_at ? ' &middot; dimulai ' + esc(formatDateTimeID(w.machining_started_at)) + ' &middot; berjalan ' + esc(fmtDurationID(w.machining_started_at)) : ''}
                    ${w.group === 'selesai' && w.machining_finished_at ? ' &middot; selesai ' + esc(formatDateTimeID(w.machining_finished_at)) + ' &middot; durasi ' + esc(fmtDurationID(w.machining_started_at, w.machining_finished_at)) : ''}</p>
                </div>
                <div>
                  <button class="btn btn-sm" data-machining-open="${w.id}">Buka Preparation</button>
                  ${w.group === 'selesai' ? `<button class="btn btn-sm btn-primary" data-action-spec="${w.test_request_id}">Inspeksi</button>` : ''}
                </div>
              </div>`).join('')}
            ${machiningRows.length > 8 ? `<p class="muted" style="margin:6px 0 0;">+ ${machiningRows.length - 8} Work Order lainnya &mdash; lihat Preparation Queue.</p>` : ''}
          </div>`}
      </div>

      <div class="dash-grid">
        <div class="card">
          <p class="card-title">Alur Kerja</p>
          <p class="card-desc">Permintaan Uji &rarr; Work Order &rarr; Pengecekan Spesimen</p>
          <div class="dash-funnel">
            ${funnelStages.map(s => `
              <div class="dash-funnel-row">
                <div class="dash-funnel-track"><div class="dash-funnel-fill" style="width:${s.pct}%"></div></div>
                <div class="dash-funnel-meta"><span class="dash-funnel-name">${esc(s.label)}</span><span class="dash-funnel-count">${s.count}</span></div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <p class="card-title">Permintaan Uji per Bulan</p>
          <p class="card-desc">6 bulan terakhir</p>
          <div class="dash-bars">
            ${months.map(m => `
              <div class="dash-bar-col">
                <div class="dash-bar-track"><div class="dash-bar-fill" style="height:${Math.round(m.count / maxMonthCount * 100)}%"></div></div>
                <span class="dash-bar-count">${m.count}</span>
                <span class="dash-bar-label">${esc(m.label)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <p class="card-title">Perlu Tindak Lanjut</p>
          <p class="card-desc">Langkah berikutnya yang belum diambil</p>
          ${actionCount === 0 ? `<p class="dash-empty">Semua Permintaan Uji sudah lengkap sampai Pengecekan Spesimen.</p>` : `
            <div class="dash-action-list">
              ${needsWO.map(r => `
                <div class="dash-action-item">
                  <div>
                    <strong>${esc(r.job_number)}</strong><span class="muted"> &middot; ${esc(r.company)}</span>
                    <p class="dash-action-hint">Sudah Final, belum ada Work Order</p>
                  </div>
                  <button class="btn btn-sm btn-primary" data-action-wo="${r.id}">+ Work Order</button>
                </div>`).join('')}
              ${needsSpecimen.map(w => `
                <div class="dash-action-item">
                  <div>
                    <strong>${esc(w.job_number)}</strong><span class="muted"> &middot; ${esc(w.company)}</span>
                    <p class="dash-action-hint">Machining selesai, belum ada Pengecekan Spesimen</p>
                  </div>
                  <button class="btn btn-sm" data-action-spec="${w.test_request_id}">Buat Sheet</button>
                </div>`).join('')}
            </div>
          `}
        </div>

        <div class="card">
          <p class="card-title">Aktivitas Terbaru</p>
          <p class="card-desc">6 perubahan terakhir</p>
          ${activity.length === 0 ? `<p class="dash-empty">Belum ada aktivitas.</p>` : `
            <div class="dash-activity-list">
              ${activity.map(a => `
                <div class="dash-activity-item">
                  <div class="dash-activity-icon">${ACTIVITY_ICON[a.type]}</div>
                  <div class="dash-activity-body">
                    <strong>${esc(a.label)}</strong>
                    <span class="muted">${esc(a.sub || '')}</span>
                  </div>
                  ${a.badgeHtml || `<span class="badge badge-${a.status === 'final' ? 'final' : 'draft'}">${a.status === 'final' ? 'Final' : 'Draft'}</span>`}
                </div>`).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    contentEl.querySelectorAll('[data-action-wo]').forEach(btn =>
      btn.addEventListener('click', () => createWorkOrder(btn.dataset.actionWo)));
    contentEl.querySelectorAll('[data-machining-open]').forEach(btn =>
      btn.addEventListener('click', () => openWoTask(btn.dataset.machiningOpen, 'preparation')));
    contentEl.querySelectorAll('[data-action-spec]').forEach(btn =>
      btn.addEventListener('click', () => {
        state.view = 'specimen-list';
        state.specimenCreatorOpen = true;
        state.specimenCreatorPrefill = { requestId: btn.dataset.actionSpec };
        render();
      }));
  }

  // ---------- timeline ----------

  const TIMELINE_STAGES = {
    draft: 'Draft',
    'need-wo': 'Menunggu Work Order',
    'need-spec': 'Menunggu Pengecekan Spesimen',
    running: 'Pengecekan Berjalan',
    done: 'Selesai'
  };
  const TIMELINE_PAGE_SIZE = 8;

  function formatDateOnly(value) {
    if (!value) return '';
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatDateTimeID(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function buildTimelineJobs(requests, workOrders, specimens) {
    const woByRequest = new Map(workOrders.map(w => [w.test_request_id, w]));
    const sheetsByRequest = new Map();
    [...specimens].sort((a, b) => a.id - b.id).forEach(s => {
      if (!sheetsByRequest.has(s.test_request_id)) sheetsByRequest.set(s.test_request_id, []);
      sheetsByRequest.get(s.test_request_id).push(s);
    });

    return requests.map(r => {
      const wo = woByRequest.get(r.id) || null;
      const sheets = sheetsByRequest.get(r.id) || [];
      const requestFinal = r.status === 'final';

      let stage;
      if (!requestFinal) stage = 'draft';
      else if (!wo) stage = 'need-wo';
      else if (!sheets.length) stage = 'need-spec';
      else if (wo.status === 'complete' && sheets.every(s => s.status === 'final')) stage = 'done';
      else stage = 'running';

      const steps = [];
      steps.push({
        done: true,
        title: 'Permintaan diterima',
        meta: r.received_date ? '' : 'Tanggal terima belum diisi',
        when: formatDateOnly(r.received_date)
      });
      steps.push({
        done: true,
        title: 'Permintaan Uji dibuat',
        meta: requestFinal ? '' : 'Belum difinalisasi',
        when: formatDateTimeID(r.created_at),
        status: r.status,
        open: { type: 'request', id: r.id }
      });
      if (wo) {
        steps.push({
          done: true,
          title: 'Work Order dibuat',
          meta: wo.testing_date ? `Tanggal pengujian: ${formatDateOnly(wo.testing_date)}` : '',
          when: formatDateTimeID(wo.created_at),
          status: wo.status,
          open: { type: 'wo', id: wo.id }
        });
      } else {
        steps.push({
          done: false,
          title: 'Work Order',
          meta: requestFinal ? 'Belum dibuat — siap dibuatkan Work Order' : 'Menunggu Permintaan Uji difinalisasi'
        });
      }
      if (sheets.length) {
        sheets.forEach(s => {
          const label = s.test_name || SPECIMEN_CATEGORY_LABELS[s.category] || s.category;
          const shape = s.shape ? ` - ${SPECIMEN_SHAPE_LABELS[s.shape] || s.shape}` : '';
          const metaParts = [];
          if (s.coupon_row_no) metaParts.push(`Coupon #${s.coupon_row_no}`);
          if (s.qty) metaParts.push(`Qty ${s.qty}`);
          if (s.inspection_date) metaParts.push(`Diperiksa ${formatDateOnly(s.inspection_date)}`);
          steps.push({
            done: true,
            title: `Pengecekan Spesimen — ${label}${shape}`,
            meta: metaParts.join(' · '),
            when: formatDateTimeID(s.created_at),
            status: s.status,
            open: { type: 'specimen', id: s.id }
          });
        });
      } else {
        steps.push({
          done: false,
          title: 'Pengecekan Spesimen',
          meta: wo ? 'Belum ada sheet Pengecekan Spesimen' : 'Menunggu Work Order'
        });
      }
      const nextIdx = steps.findIndex(st => !st.done);
      if (nextIdx !== -1) steps[nextIdx].next = true;

      return { request: r, stage, steps };
    });
  }

  async function renderTimeline() {
    pageTitle.textContent = 'Timeline';
    pageSubtitle.textContent = 'Jejak progres tiap pekerjaan — Permintaan Uji → Work Order → Pengecekan Spesimen';
    topbarActions.innerHTML = '';

    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;

    let requests = [], workOrders = [], specimens = [];
    try {
      [requests, workOrders, specimens] = await Promise.all([
        api('/api/requests'),
        api('/api/work-orders'),
        api('/api/specimen-inspections')
      ]);
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat data: ${esc(e.message)}</p></div>`;
      return;
    }

    if (!requests.length) {
      contentEl.innerHTML = `
        <div class="card empty-state">
          <p class="card-title">Belum ada pekerjaan</p>
          <p class="card-desc">Timeline akan muncul setelah ada Permintaan Uji.</p>
        </div>`;
      return;
    }

    const jobs = buildTimelineJobs(requests, workOrders, specimens);
    const ui = { search: '', stage: 'all', shown: TIMELINE_PAGE_SIZE };
    const stageCount = key => jobs.filter(j => j.stage === key).length;

    contentEl.innerHTML = `
      <div class="card tl-toolbar">
        <input type="text" id="tlSearch" placeholder="Cari No. Pekerjaan, Perusahaan, atau Nama Projek..." autocomplete="off">
        <div class="tl-chips" id="tlChips">
          <button type="button" class="tl-chip active" data-tl-stage="all">Semua <span>${jobs.length}</span></button>
          ${Object.keys(TIMELINE_STAGES).map(key => `
            <button type="button" class="tl-chip" data-tl-stage="${key}">${esc(TIMELINE_STAGES[key])} <span>${stageCount(key)}</span></button>
          `).join('')}
        </div>
      </div>
      <div id="tlList"></div>
    `;

    const listEl = document.getElementById('tlList');

    const stepHtml = (st) => `
      <li class="tl-step ${st.done ? 'done' : 'pending'}${st.next ? ' next' : ''}">
        <span class="tl-dot"></span>
        <div class="tl-body">
          <div class="tl-title">${esc(st.title)}${st.status ? ` <span class="badge badge-${st.status === 'complete' ? 'complete' : st.status === 'final' ? 'final' : 'draft'}">${st.status === 'complete' ? 'Complete' : st.status === 'final' ? 'Final' : 'Draft'}</span>` : ''}</div>
          ${st.meta ? `<div class="tl-meta">${esc(st.meta)}</div>` : ''}
        </div>
        <div class="tl-when">${esc(st.when || '')}</div>
        ${st.open ? `<button type="button" class="btn btn-sm" data-tl-open="${st.open.type}:${st.open.id}">Buka</button>` : '<span class="tl-open-spacer"></span>'}
      </li>`;

    const renderList = () => {
      const term = ui.search.trim().toLowerCase();
      const filtered = jobs.filter(j => {
        if (ui.stage !== 'all' && j.stage !== ui.stage) return false;
        if (!term) return true;
        const r = j.request;
        return [r.job_number, r.company, r.project_name].some(v => String(v || '').toLowerCase().includes(term));
      });

      if (!filtered.length) {
        listEl.innerHTML = `<div class="card empty-state"><p class="card-desc">Tidak ada pekerjaan yang cocok.</p></div>`;
        return;
      }

      const visible = filtered.slice(0, ui.shown);
      listEl.innerHTML = visible.map(j => `
        <div class="card tl-job">
          <div class="tl-job-head">
            <div>
              <strong>${esc(j.request.job_number)}</strong>
              <span class="muted"> &middot; ${esc(j.request.company)}${j.request.project_name ? ' &middot; ' + esc(j.request.project_name) : ''}</span>
            </div>
            <span class="tl-stage tl-stage-${j.stage}">${esc(TIMELINE_STAGES[j.stage])}</span>
          </div>
          <ol class="tl-steps">${j.steps.map(stepHtml).join('')}</ol>
        </div>
      `).join('') + (filtered.length > visible.length ? `
        <div style="text-align:center; margin-bottom:20px;">
          <button type="button" class="btn" id="tlMore">Tampilkan lebih banyak (${filtered.length - visible.length} lagi)</button>
        </div>` : '');

      const more = document.getElementById('tlMore');
      if (more) more.addEventListener('click', () => { ui.shown += TIMELINE_PAGE_SIZE; renderList(); });

      listEl.querySelectorAll('[data-tl-open]').forEach(btn => btn.addEventListener('click', () => {
        const [type, id] = btn.dataset.tlOpen.split(':');
        if (type === 'request') openForm(id);
        else if (type === 'wo') openWorkOrderForm(id);
        else openSpecimenForm(id);
      }));
    };

    document.getElementById('tlSearch').addEventListener('input', (e) => {
      ui.search = e.target.value;
      ui.shown = TIMELINE_PAGE_SIZE;
      renderList();
    });
    document.querySelectorAll('#tlChips [data-tl-stage]').forEach(chip => chip.addEventListener('click', () => {
      ui.stage = chip.dataset.tlStage;
      ui.shown = TIMELINE_PAGE_SIZE;
      document.querySelectorAll('#tlChips [data-tl-stage]').forEach(c => c.classList.toggle('active', c === chip));
      renderList();
    }));

    renderList();
  }

  // ---------- list view ----------

  async function renderList() {
    pageTitle.textContent = 'Permintaan Uji';
    pageSubtitle.textContent = 'Tinjauan Permintaan Pengujian — Testing Requirements Review';
    topbarActions.innerHTML = `<button class="btn btn-primary" id="btnNew">+ Buat Permintaan Baru</button>`;
    document.getElementById('btnNew').addEventListener('click', () => openForm(null));

    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;

    let rows = [];
    try {
      rows = await api('/api/requests');
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat data: ${esc(e.message)}</p></div>`;
      return;
    }

    if (!rows.length) {
      contentEl.innerHTML = `
        <div class="card empty-state">
          <p class="card-title">Belum ada Tinjauan Permintaan Pengujian</p>
          <p class="card-desc">Klik tombol di bawah untuk membuat form baru sesuai DPI-LP-FR-24.</p>
          <button class="btn btn-primary" id="btnNewEmpty">+ Buat Permintaan Baru</button>
        </div>`;
      document.getElementById('btnNewEmpty').addEventListener('click', () => openForm(null));
      return;
    }

    contentEl.innerHTML = `
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar Tinjauan Permintaan Pengujian</p>
          <p class="card-desc">${rows.length} permintaan tersimpan</p>
        </div>
        <div id="reqTableArea"></div>
      </div>`;

    renderSearchablePaginatedTable({
      key: 'requests',
      containerEl: document.getElementById('reqTableArea'),
      allRows: rows,
      searchFields: ['job_number', 'company', 'project_name'],
      searchPlaceholder: 'Cari No. Pekerjaan, Perusahaan, atau Nama Projek...',
      renderTableHtml: (pageRows) => `
        <table class="data-table">
          <thead><tr>
            <th>No. Pekerjaan</th><th>Perusahaan</th><th>Nama Projek</th><th>Tgl. Diterima</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${pageRows.map(r => `
            <tr>
              <td><strong>${esc(r.job_number)}</strong></td>
              <td>${esc(r.company)}</td>
              <td>${esc(r.project_name)}</td>
              <td>${esc(r.received_date)}</td>
              <td><span class="badge badge-${r.status === 'final' ? 'final' : 'draft'}">${r.status === 'final' ? 'Final' : 'Draft'}</span></td>
              <td>
                <button class="btn btn-sm" data-edit="${r.id}">Buka</button>
                <button class="btn btn-sm" data-pdf="${r.id}">Export PDF</button>
                ${r.status === 'final' ? (
                  r.work_order_id
                    ? `<button class="btn btn-sm" data-open-wo="${r.work_order_id}">Work Order</button>`
                    : `<button class="btn btn-sm" data-create-wo="${r.id}">+ Work Order</button>`
                ) : ''}
                <button class="btn btn-sm btn-danger" data-del="${r.id}">Hapus</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>`,
      bindRowEvents: (container) => {
        container.querySelectorAll('[data-edit]').forEach(btn =>
          btn.addEventListener('click', () => openForm(btn.dataset.edit)));
        container.querySelectorAll('[data-pdf]').forEach(btn =>
          btn.addEventListener('click', () => window.open(`/requests/${btn.dataset.pdf}/print`, '_blank')));
        container.querySelectorAll('[data-open-wo]').forEach(btn =>
          btn.addEventListener('click', () => openWorkOrderForm(btn.dataset.openWo)));
        container.querySelectorAll('[data-create-wo]').forEach(btn =>
          btn.addEventListener('click', () => createWorkOrder(btn.dataset.createWo)));
        container.querySelectorAll('[data-del]').forEach(btn =>
          btn.addEventListener('click', () => deleteRequest(btn.dataset.del)));
      }
    });
  }

  async function createWorkOrder(testRequestId) {
    try {
      const wo = await api(`/api/requests/${testRequestId}/work-order`, { method: 'POST' });
      toast('Work Order dibuat', 'success');
      state.view = 'wo-form';
      state.woEditingId = wo.id;
      state.woData = wo;
      render();
    } catch (e) {
      if (e.workOrderId) {
        openWorkOrderForm(e.workOrderId);
      } else {
        toast(e.message, 'error');
      }
    }
  }

  async function deleteRequest(id) {
    if (!confirm('Hapus permintaan ini? Tindakan tidak dapat dibatalkan.')) return;
    try {
      await api(`/api/requests/${id}`, { method: 'DELETE' });
      toast('Permintaan dihapus', 'success');
      renderList();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------- form view ----------

  async function openForm(id) {
    state.view = 'form';
    state.editingId = id;
    state.requestHistoryOpen = false;

    if (id) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;
      try {
        const data = await api(`/api/requests/${id}`);
        state.formData = data;
        state.couponRows = data.coupon_tests && data.coupon_tests.length
          ? data.coupon_tests : [blankCouponRow()];
      } catch (e) {
        toast(e.message, 'error');
        state.view = 'list';
        renderList();
        return;
      }
    } else {
      let jobNumber = '';
      try { jobNumber = (await api('/api/next-job-number')).jobNumber; } catch (e) {}
      state.formData = { job_number: jobNumber, status: 'draft' };
      state.couponRows = [blankCouponRow()];
    }

    render();
  }

  function ynToggle(fieldKey, value) {
    return `
      <div class="yn-toggle" data-field="${fieldKey}">
        <button type="button" class="on-y ${value === 'Y' ? 'active' : ''}" data-val="Y">Y</button>
        <button type="button" class="on-n ${value === 'N' ? 'active' : ''}" data-val="N">N</button>
      </div>`;
  }

  async function renderForm() {
    const f = state.formData || {};
    pageTitle.textContent = state.editingId ? 'Edit Permintaan Uji' : 'Permintaan Uji Baru';
    pageSubtitle.textContent = 'Tinjauan Permintaan Pengujian — Testing Requirements Review';
    const canHaveHistory = state.editingId && f.status === 'final';
    topbarActions.innerHTML = `
      <button class="btn" id="btnBack">&larr; Kembali ke Daftar</button>
      ${state.editingId ? `<button type="button" class="btn" id="btnExportPdf">Export PDF</button>` : ''}
      ${canHaveHistory ? `<button type="button" class="btn" id="btnReqHistory">Riwayat Perubahan</button>` : ''}
    `;
    document.getElementById('btnBack').addEventListener('click', () => { state.view = 'list'; render(); });
    if (state.editingId) {
      document.getElementById('btnExportPdf').addEventListener('click', () =>
        window.open(`/requests/${state.editingId}/print`, '_blank'));
    }
    if (canHaveHistory) {
      document.getElementById('btnReqHistory').addEventListener('click', () => {
        state.requestHistoryOpen = !state.requestHistoryOpen;
        renderForm();
      });
    }

    let historyHtml = '';
    if (canHaveHistory && state.requestHistoryOpen) {
      let historyRows = [];
      try {
        historyRows = await api(`/api/requests/${state.editingId}/history`);
      } catch (e) {
        historyRows = [];
      }
      historyHtml = `
        <div class="card">
          <p class="section-title">Riwayat Perubahan <span class="en">(versi sebelum tiap amandemen setelah Finalisasi)</span></p>
          ${historyRows.length ? `
          <table class="data-table">
            <thead><tr><th>Tanggal Amandemen</th><th></th></tr></thead>
            <tbody>
              ${historyRows.map(h => `
                <tr>
                  <td>${esc(new Date(h.amended_at).toLocaleString('id-ID'))}</td>
                  <td><button type="button" class="btn btn-sm" data-view-history="${h.id}">Lihat Versi Ini</button></td>
                </tr>`).join('')}
            </tbody>
          </table>` : `<p class="muted">Belum ada amandemen sejak difinalisasi.</p>`}
        </div>
      `;
    }

    contentEl.innerHTML = `
      ${historyHtml}
      <datalist id="weldingProcessList">
        ${WELDING_PROCESSES.map(p => `<option value="${esc(p)}">`).join('')}
      </datalist>
      <datalist id="weldingPositionList">
        ${WELDING_POSITIONS.map(p => `<option value="${esc(p)}">`).join('')}
      </datalist>
      <datalist id="refCodeList">
        ${REF_CODES.map(p => `<option value="${esc(p)}">`).join('')}
      </datalist>
      <datalist id="testMethodList">
        ${TEST_METHODS.map(p => `<option value="${esc(p)}">`).join('')}
      </datalist>
      <datalist id="customerIdList">
        ${[...new Set(CUSTOMERS.map(c => c.customer_id))].map(v => `<option value="${esc(v)}">`).join('')}
      </datalist>
      <datalist id="onBehalfOwnerList">
        ${[...new Set(CUSTOMERS.map(c => c.on_behalf_owner))].map(v => `<option value="${esc(v)}">`).join('')}
      </datalist>
      <form id="reqForm">

        <div class="card">
          <p class="section-title">Informasi Umum</p>
          <div class="form-grid">
            <div class="field">
              <label>Nomor Pekerjaan <span class="en">Job Number</span></label>
              <input type="text" name="job_number" value="${esc(f.job_number)}">
            </div>
            <div class="field">
              <label>Perusahaan <span class="en">Company</span></label>
              <input type="text" name="company" value="${esc(f.company)}">
            </div>
            <div class="field">
              <label>Tgl. Diterima <span class="en">Received Date</span></label>
              <input type="date" name="received_date" value="${esc(f.received_date)}">
            </div>
            <div class="field">
              <label>No. PO <span class="en">PO No.</span></label>
              <input type="text" name="po_number" value="${esc(f.po_number)}">
            </div>
            <div class="field">
              <label>ID Perusahaan <span class="en">Cust. ID</span></label>
              <input type="text" list="customerIdList" autocomplete="off" id="customerIdInput" name="customer_id" value="${esc(f.customer_id)}">
            </div>
            <div class="field">
              <label>Atas Nama Perusahaan <span class="en">On Behalf Owner</span></label>
              <input type="text" list="onBehalfOwnerList" autocomplete="off" id="onBehalfOwnerInput" name="on_behalf_owner" value="${esc(f.on_behalf_owner)}">
            </div>
            <div class="field">
              <label>Nama Projek <span class="en">Project Name</span></label>
              <input type="text" name="project_name" value="${esc(f.project_name)}">
            </div>
            <div class="field">
              <label>No. Telepon <span class="en">Phone No.</span></label>
              <input type="text" name="phone" value="${esc(f.phone)}">
            </div>
            <div class="field full">
              <label>Alamat <span class="en">Address</span></label>
              <textarea name="address">${esc(f.address)}</textarea>
            </div>
          </div>
        </div>

        <div class="card">
          <p class="section-title">Tinjauan &amp; Deskripsi</p>

          <div class="review-row">
            <div class="review-label">Nilai ketidakpastian perlu diklarifikasi <span class="en">Uncertainties need for clarifications</span></div>
            ${ynToggle('uncertainty_clarification', f.uncertainty_clarification)}
          </div>
          <div class="review-row">
            <div class="review-label">Kemampuan metode uji yang tersedia <span class="en">Capability test methods used</span></div>
            ${ynToggle('capability_test_methods', f.capability_test_methods)}
          </div>
          <div class="review-row">
            <div class="review-label">Perbedaan kontrak yang perlu diselesaikan <span class="en">Differences to be resolved</span></div>
            ${ynToggle('contract_differences', f.contract_differences)}
          </div>
          <div class="review-row">
            <div class="review-label">Ketersediaan peralatan dan fasilitas <span class="en">Availability of equipment and facilities</span></div>
            ${ynToggle('equipment_availability', f.equipment_availability)}
          </div>
          <div class="review-row">
            <div class="review-label">Pelaksanaan pengujian <span class="en">Test execution</span></div>
            <div class="review-inline">
              <select name="witness_status">
                <option value="" ${!f.witness_status ? 'selected' : ''}>-</option>
                <option value="Witness" ${f.witness_status === 'Witness' ? 'selected' : ''}>Witness</option>
                <option value="Not Witness" ${f.witness_status === 'Not Witness' ? 'selected' : ''}>Not Witness</option>
              </select>
              <input type="date" name="witness_date" value="${esc(f.witness_date)}">
            </div>
          </div>
          <div class="review-row">
            <div class="review-label">Benda uji <span class="en">Specimen</span></div>
            <div class="review-inline">
              <select name="specimen_status">
                <option value="" ${!f.specimen_status ? 'selected' : ''}>-</option>
                <option value="Taken" ${f.specimen_status === 'Taken' ? 'selected' : ''}>Taken</option>
                <option value="Not Taken" ${f.specimen_status === 'Not Taken' ? 'selected' : ''}>Not Taken</option>
              </select>
            </div>
          </div>
          <div class="review-row">
            <div class="review-label">Target penyelesaian LHU <span class="en">LHU completion target</span></div>
            <div class="review-inline">
              <input type="date" name="lhu_target_date" value="${esc(f.lhu_target_date)}">
            </div>
          </div>
          <div class="review-row">
            <div class="review-label">Penanganan LHU <span class="en">LHU handling</span></div>
            <div class="review-inline">
              <select name="lhu_handling">
                <option value="" ${!f.lhu_handling ? 'selected' : ''}>-</option>
                <option value="Taken by customer" ${f.lhu_handling === 'Taken by customer' ? 'selected' : ''}>Taken by customer</option>
                <option value="sent by PT Detech" ${f.lhu_handling === 'sent by PT Detech' ? 'selected' : ''}>sent by PT Detech</option>
              </select>
            </div>
          </div>
        </div>

        <div class="card">
          <p class="section-title">Coupon Test</p>
          <div id="couponRows"></div>
          <button type="button" class="btn" id="btnAddRow">+ Tambah Coupon Test</button>
        </div>

        <div class="card">
          <p class="section-title">Tanda Tangan</p>
          <div class="signature-columns">
            <div class="signature-column">
              <div class="field">
                <label>Nama Pelanggan <span class="en">Customer Name</span></label>
                <input type="text" name="customer_name" value="${esc(f.customer_name)}">
              </div>
              <div class="field">
                <label>Tanggal <span class="en">Customer Date</span></label>
                <input type="date" name="customer_date" value="${esc(f.customer_date)}">
              </div>
              <div class="field">
                ${signaturePadHtml('customer_signature', 'Tanda Tangan Pelanggan', 'Customer Signature', f.customer_signature)}
              </div>
            </div>
            <div class="signature-column">
              <div class="field">
                <label>Diterima Oleh <span class="en">Received By</span></label>
                <input type="text" name="received_by_name" value="${esc(f.received_by_name)}">
              </div>
              <div class="field">
                <label>Tanggal <span class="en">Received Date</span></label>
                <input type="date" name="received_by_date" value="${esc(f.received_by_date)}">
              </div>
              <div class="field">
                ${signaturePadHtml('received_by_signature', 'Tanda Tangan Penerima', 'Received By Signature', f.received_by_signature)}
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <p class="section-title">Konfirmasi Persetujuan</p>
          <label class="confirm-checkbox">
            <input type="checkbox" id="confirmationAgreed" ${f.confirmation_agreed ? 'checked' : ''}>
            <span>
              Saya menyatakan bahwa seluruh data pada formulir Tinjauan Permintaan Pengujian ini telah saya periksa dengan benar dan saya <strong>menyetujui</strong> pengajuan permintaan pengujian ini sesuai dengan persyaratan yang berlaku. Saya juga memahami bahwa laboratorium <strong>hanya menyimpan sampel/benda uji selama 14 (empat belas) hari</strong> setelah pengujian selesai, dan tidak bertanggung jawab atas sampel yang tidak diambil setelah periode tersebut.
              <span class="en">I confirm that all information on this Testing Requirements Review form has been checked and is correct, and I agree to submit this testing request in accordance with the applicable requirements. I also understand that the laboratory only retains samples/test specimens for 14 (fourteen) days after testing is completed, and is not responsible for samples not collected after that period.</span>
            </span>
          </label>
        </div>

        <div class="form-actions">
          <div>
            ${state.editingId ? `<button type="button" class="btn btn-danger" id="btnDelete">Hapus Permintaan</button>` : ''}
          </div>
          <div class="right">
            <button type="submit" class="btn" data-status="draft">Simpan sebagai Draft</button>
            <button type="submit" class="btn btn-primary" data-status="final">Simpan &amp; Finalisasi</button>
          </div>
        </div>
      </form>
    `;

    renderCouponRows();
    bindFormEvents();
    initSignaturePads();

    contentEl.querySelectorAll('[data-view-history]').forEach(btn =>
      btn.addEventListener('click', () => window.open(`/requests/history/${btn.dataset.viewHistory}/print`, '_blank')));
  }

  function signaturePadHtml(fieldKey, labelId, labelEn, dataUrl) {
    return `
      <label>${labelId} <span class="en">${labelEn}</span></label>
      <div class="signature-pad-wrap">
        <canvas class="signature-pad" data-sig="${fieldKey}" data-existing="${esc(dataUrl || '')}" width="600" height="180"></canvas>
        <button type="button" class="btn btn-sm" data-sig-clear="${fieldKey}">Hapus Tanda Tangan</button>
      </div>
    `;
  }

  function initSignaturePads() {
    contentEl.querySelectorAll('canvas.signature-pad').forEach(canvas => {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      canvas.dataset.hasSignature = 'false';

      const existing = canvas.dataset.existing;
      if (existing) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.dataset.hasSignature = 'true';
        };
        img.src = existing;
      }

      function posFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (canvas.width / rect.width),
          y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
      }

      let drawing = false;
      canvas.addEventListener('pointerdown', e => {
        drawing = true;
        canvas.setPointerCapture(e.pointerId);
        const p = posFromEvent(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      });
      canvas.addEventListener('pointermove', e => {
        if (!drawing) return;
        const p = posFromEvent(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        canvas.dataset.hasSignature = 'true';
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
        canvas.addEventListener(evt, () => { drawing = false; }));
    });

    contentEl.querySelectorAll('[data-sig-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        const canvas = contentEl.querySelector(`canvas[data-sig="${btn.dataset.sigClear}"]`);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        canvas.dataset.hasSignature = 'false';
        canvas.dataset.existing = '';
      });
    });
  }

  function renderCouponRows() {
    const wrap = document.getElementById('couponRows');
    wrap.innerHTML = state.couponRows.map((row, idx) => couponRowHtml(row, idx)).join('');

    wrap.querySelectorAll('[data-remove-row]').forEach(btn =>
      btn.addEventListener('click', () => {
        if (state.couponRows.length <= 1) { toast('Minimal harus ada 1 baris coupon test', 'error'); return; }
        state.couponRows.splice(Number(btn.dataset.removeRow), 1);
        renderCouponRows();
      }));

    wrap.querySelectorAll('[data-add-other]').forEach(btn =>
      btn.addEventListener('click', () => {
        state.couponRows[Number(btn.dataset.addOther)].other_tests.push({ test_name: '', qty: '', method: '' });
        renderCouponRows();
      }));

    wrap.querySelectorAll('[data-remove-other]').forEach(btn =>
      btn.addEventListener('click', () => {
        const [rowIdx, otherIdx] = btn.dataset.removeOther.split(':').map(Number);
        state.couponRows[rowIdx].other_tests.splice(otherIdx, 1);
        renderCouponRows();
      }));
  }

  function couponRowHtml(row, idx) {
    const typeBoxes = COUPON_TYPES.map(t => `
      <label><input type="checkbox" data-row="${idx}" data-coupon-type="${t}" ${row.coupon_type.includes(t) ? 'checked' : ''}> ${t}</label>
    `).join('');

    const itemRows = row.test_items.map((ti, tIdx) => {
      const isCharpy = ti.test_name === 'Charpy Impact Test';
      const isHardness = ti.test_name === 'Hardness Test';
      return `
        <tr>
          <td><input type="checkbox" data-row="${idx}" data-item="${tIdx}" data-item-field="checked" ${ti.checked ? 'checked' : ''}></td>
          <td class="test-item-name">${esc(ti.test_name)}</td>
          <td style="width:48px;"><input type="text" data-row="${idx}" data-item="${tIdx}" data-item-field="qty" value="${esc(ti.qty)}" placeholder="Qty"></td>
          <td><input type="text" list="testMethodList" autocomplete="off" data-row="${idx}" data-item="${tIdx}" data-item-field="method" value="${esc(ti.method)}" placeholder="Metode tes"></td>
        </tr>
        ${isCharpy ? `
        <tr>
          <td></td>
          <td colspan="3">
            <div class="charpy-extra">
              <span>T&deg;</span><input type="text" data-row="${idx}" data-charpy="charpy_temp" value="${esc(row.charpy_temp)}">
              <span>WM</span><input type="text" data-row="${idx}" data-charpy="charpy_wm" value="${esc(row.charpy_wm)}">
              <span>BM</span><input type="text" data-row="${idx}" data-charpy="charpy_bm" value="${esc(row.charpy_bm)}">
              <span>HAZ</span><input type="text" data-row="${idx}" data-charpy="charpy_haz" value="${esc(row.charpy_haz)}">
              <span>FL</span><input type="text" data-row="${idx}" data-charpy="charpy_fl" value="${esc(row.charpy_fl)}">
              <span>FL+2</span><input type="text" data-row="${idx}" data-charpy="charpy_fl2" value="${esc(row.charpy_fl2)}">
              <input type="text" class="charpy-optional-label" data-row="${idx}" data-charpy="charpy_optional_label" value="${esc(row.charpy_optional_label)}" placeholder="Opsional/Lainnya"><input type="text" data-row="${idx}" data-charpy="charpy_optional" value="${esc(row.charpy_optional)}">
            </div>
          </td>
        </tr>` : ''}
        ${isHardness ? `
        <tr>
          <td></td>
          <td colspan="3">
            <div class="charpy-extra">
              <span>Jumlah Spot</span><input type="text" data-row="${idx}" data-charpy="hardness_spot" value="${esc(row.hardness_spot)}">
            </div>
          </td>
        </tr>` : ''}
      `;
    }).join('');

    const otherTestRows = row.other_tests.map((ot, oIdx) => `
      <tr>
        <td>${oIdx + 1}</td>
        <td><input type="text" data-row="${idx}" data-other="${oIdx}" data-other-field="test_name" value="${esc(ot.test_name)}" placeholder="Nama pengujian"></td>
        <td style="width:48px;"><input type="text" data-row="${idx}" data-other="${oIdx}" data-other-field="qty" value="${esc(ot.qty)}" placeholder="Qty"></td>
        <td><input type="text" list="testMethodList" autocomplete="off" data-row="${idx}" data-other="${oIdx}" data-other-field="method" value="${esc(ot.method)}" placeholder="Metode tes"></td>
        <td><button type="button" class="btn btn-sm btn-danger" data-remove-other="${idx}:${oIdx}">&#128465;</button></td>
      </tr>`).join('');

    return `
      <div class="coupon-row">
        <div class="coupon-row-header">
          <strong>Coupon Test #${idx + 1}</strong>
          <button type="button" class="btn btn-sm btn-danger" data-remove-row="${idx}">Hapus baris</button>
        </div>
        <div class="coupon-row-body">

          <div class="subcard">
            <p class="subcard-title">Jenis Coupon</p>
            <div class="checkbox-group">
              ${typeBoxes}
              <input type="text" style="width:140px;" placeholder="Lainnya (mis. Joint Pipe)" data-row="${idx}" data-coupon-type-other value="${esc(row.coupon_type_other)}">
            </div>
          </div>

          <div class="subcard-pair">
            <div class="subcard">
              <p class="subcard-title">Spesifikasi Material</p>
              <div class="field-grid">
                <div class="field">
                  <label>Material Type / Grade</label>
                  <input type="text" data-row="${idx}" data-field="material_type_grade" value="${esc(row.material_type_grade)}">
                </div>
                <div class="field">
                  <label>Material Size</label>
                  <input type="text" data-row="${idx}" data-field="material_size" value="${esc(row.material_size)}">
                </div>
                <div class="field">
                  <label>Outside Diameter (mm)</label>
                  <input type="text" data-row="${idx}" data-field="outside_diameter" value="${esc(row.outside_diameter)}">
                </div>
                <div class="field">
                  <label>Thickness (mm)</label>
                  <input type="text" data-row="${idx}" data-field="thickness" value="${esc(row.thickness)}">
                </div>
                <div class="field">
                  <label>Heat Number</label>
                  <input type="text" data-row="${idx}" data-field="heat_number" value="${esc(row.heat_number)}">
                </div>
              </div>
            </div>

            <div class="subcard">
              <p class="subcard-title">Data Pengelasan</p>
              <div class="field-grid">
                <div class="field">
                  <label>Welding Process</label>
                  <input type="text" list="weldingProcessList" autocomplete="off" placeholder="Pilih atau ketik baru..." data-row="${idx}" data-field="welding_process" value="${esc(row.welding_process)}">
                </div>
                <div class="field">
                  <label>Welding Position</label>
                  <input type="text" list="weldingPositionList" autocomplete="off" placeholder="Pilih atau ketik baru..." data-row="${idx}" data-field="welding_position" value="${esc(row.welding_position)}">
                </div>
                <div class="field">
                  <label>Ref. Code</label>
                  <input type="text" list="refCodeList" autocomplete="off" placeholder="Pilih atau ketik baru..." data-row="${idx}" data-field="ref_code" value="${esc(row.ref_code)}">
                </div>
                <div class="field">
                  <label>No WPS</label>
                  <input type="text" data-row="${idx}" data-field="no_wps" value="${esc(row.no_wps)}">
                </div>
              </div>
            </div>
          </div>

          <div class="subcard">
            <p class="subcard-title">Catatan</p>
            <div class="field-grid" style="grid-template-columns: 1fr; gap: 12px;">
              <div class="field">
                <label>Testing Purpose</label>
                <input type="text" data-row="${idx}" data-field="testing_purpose" value="${esc(row.testing_purpose)}">
              </div>
              <div class="field">
                <label>Note</label>
                <textarea data-row="${idx}" data-field="note">${esc(row.note)}</textarea>
              </div>
            </div>
          </div>

          <div class="subcard">
            <p class="subcard-title">Jenis Pengujian</p>
            <table class="test-items-table">
              <thead><tr><th></th><th>Jenis Pengujian</th><th>Jumlah</th><th>Metode Tes</th></tr></thead>
              <tbody>${itemRows}</tbody>
            </table>
          </div>

          <div class="subcard">
            <p class="subcard-title">Other Test <span class="en">(Tulis Manual)</span></p>
            <table class="test-items-table other-tests-table">
              <thead><tr><th>No.</th><th>Nama Pengujian</th><th>Qty</th><th>Metode Test</th><th>Aksi</th></tr></thead>
              <tbody>${otherTestRows}</tbody>
            </table>
            <button type="button" class="btn btn-sm" data-add-other="${idx}">+ Tambah Other Test</button>
          </div>

        </div>
      </div>
    `;
  }

  function bindFormEvents() {
    document.getElementById('btnAddRow').addEventListener('click', () => {
      state.couponRows.push(blankCouponRow());
      renderCouponRows();
    });

    contentEl.querySelectorAll('.yn-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.yn-toggle');
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        group.dataset.value = btn.dataset.val;
      });
    });

    // delegated listeners for coupon row inputs
    document.getElementById('couponRows').addEventListener('input', handleCouponInput);
    document.getElementById('couponRows').addEventListener('change', handleCouponInput);

    // ID Perusahaan & Atas Nama Perusahaan are a paired customer record —
    // picking/typing one that matches an existing pair fills in the other.
    const custIdInput = document.getElementById('customerIdInput');
    const ownerInput = document.getElementById('onBehalfOwnerInput');
    custIdInput.addEventListener('input', () => {
      const owner = findOwnerByCustomerId(custIdInput.value.trim());
      if (owner) ownerInput.value = owner;
    });
    ownerInput.addEventListener('input', () => {
      const custId = findCustomerIdByOwner(ownerInput.value.trim());
      if (custId) custIdInput.value = custId;
    });

    const delBtn = document.getElementById('btnDelete');
    if (delBtn) delBtn.addEventListener('click', () => deleteRequest(state.editingId));

    document.getElementById('reqForm').addEventListener('submit', onSubmit);
    contentEl.querySelectorAll('button[type="submit"]').forEach(b => {
      b.addEventListener('click', () => { state.pendingStatus = b.dataset.status; });
    });
  }

  function handleCouponInput(e) {
    const t = e.target;
    const rowIdx = t.dataset.row;
    if (rowIdx === undefined) return;
    const row = state.couponRows[Number(rowIdx)];
    if (!row) return;

    if (t.dataset.couponType) {
      const val = t.dataset.couponType;
      if (t.checked) { if (!row.coupon_type.includes(val)) row.coupon_type.push(val); }
      else { row.coupon_type = row.coupon_type.filter(v => v !== val); }
    } else if (t.dataset.couponTypeOther !== undefined) {
      row.coupon_type_other = t.value;
    } else if (t.dataset.field) {
      row[t.dataset.field] = t.value;
    } else if (t.dataset.charpy) {
      row[t.dataset.charpy] = t.value;
    } else if (t.dataset.item !== undefined) {
      const item = row.test_items[Number(t.dataset.item)];
      if (t.dataset.itemField === 'checked') item.checked = t.checked;
      else item[t.dataset.itemField] = t.value;
    } else if (t.dataset.other !== undefined) {
      row.other_tests[Number(t.dataset.other)][t.dataset.otherField] = t.value;
    }
  }

  function collectYN(form, name) {
    const group = form.querySelector(`.yn-toggle[data-field="${name}"]`);
    return group ? (group.dataset.value || '') : '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());

    payload.uncertainty_clarification = collectYN(form, 'uncertainty_clarification');
    payload.capability_test_methods = collectYN(form, 'capability_test_methods');
    payload.contract_differences = collectYN(form, 'contract_differences');
    payload.equipment_availability = collectYN(form, 'equipment_availability');
    payload.status = state.pendingStatus || 'draft';
    payload.coupon_tests = state.couponRows;
    payload.confirmation_agreed = document.getElementById('confirmationAgreed').checked;

    if (payload.status === 'final' && !payload.confirmation_agreed) {
      toast('Centang konfirmasi persetujuan terlebih dahulu sebelum Finalisasi', 'error');
      return;
    }

    contentEl.querySelectorAll('canvas.signature-pad').forEach(canvas => {
      payload[canvas.dataset.sig] = canvas.dataset.hasSignature === 'true' ? canvas.toDataURL('image/png') : '';
    });

    try {
      let saved;
      if (state.editingId) {
        saved = await api(`/api/requests/${state.editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        saved = await api('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (payload.status === 'final') {
        await loadWeldingProcesses();
        await loadWeldingPositions();
        await loadRefCodes();
        await loadCouponTypes();
        await loadTestMethods();
        await loadCustomers();
      }
      toast('Permintaan tersimpan', 'success');
      state.view = 'list';
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- work order: list view ----------

  async function renderWorkOrderList() {
    pageTitle.textContent = 'Work Order';
    pageSubtitle.textContent = 'Work Order — DPI-LP-FR-25';
    topbarActions.innerHTML = '';

    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;

    let rows = [];
    try {
      rows = await api('/api/work-orders');
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat data: ${esc(e.message)}</p></div>`;
      return;
    }

    if (!rows.length) {
      contentEl.innerHTML = `
        <div class="card empty-state">
          <p class="card-title">Belum ada Work Order</p>
          <p class="card-desc">Work Order dibuat dari Permintaan Uji yang sudah berstatus Final — buka menu
            Permintaan Uji lalu klik &ldquo;+ Work Order&rdquo; pada baris yang diinginkan.</p>
          <button class="btn btn-primary" id="btnGotoRequests">Buka Permintaan Uji</button>
        </div>`;
      document.getElementById('btnGotoRequests').addEventListener('click', () => {
        state.view = 'list'; state.editingId = null; render();
      });
      return;
    }

    contentEl.innerHTML = `
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar Work Order</p>
          <p class="card-desc">${rows.length} Work Order tersimpan</p>
        </div>
        <div id="woTableArea"></div>
      </div>`;

    renderSearchablePaginatedTable({
      key: 'work-orders',
      containerEl: document.getElementById('woTableArea'),
      allRows: rows,
      searchFields: ['job_number', 'company', 'project_name'],
      searchPlaceholder: 'Cari No. Pekerjaan, Perusahaan, atau Nama Projek...',
      renderTableHtml: (pageRows) => `
        <table class="data-table">
          <thead><tr>
            <th>No. Pekerjaan</th><th>Perusahaan</th><th>Nama Projek</th><th>Tgl. Testing</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${pageRows.map(r => `
            <tr>
              <td><strong>${esc(r.job_number)}</strong></td>
              <td>${esc(r.company)}</td>
              <td>${esc(r.project_name)}</td>
              <td>${r.testing_date ? esc(r.testing_date) : '-'}</td>
              <td>${r.stage ? `${stageBadgeHtml(r.stage.label, r.stage.status)}<span class="muted stage-count">${r.stage.done_count}/${r.stage.total}</span>` : '<span class="muted">-</span>'}</td>
              <td>
                <button class="btn btn-sm" data-wo-edit="${r.id}">Buka</button>
                <button class="btn btn-sm" data-wo-pdf="${r.id}">Export PDF</button>
                <button class="btn btn-sm btn-danger" data-wo-del="${r.id}">Hapus</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>`,
      bindRowEvents: (container) => {
        container.querySelectorAll('[data-wo-edit]').forEach(btn =>
          btn.addEventListener('click', () => openWorkOrderForm(btn.dataset.woEdit)));
        container.querySelectorAll('[data-wo-pdf]').forEach(btn =>
          btn.addEventListener('click', () => window.open(`/work-orders/${btn.dataset.woPdf}/print`, '_blank')));
        container.querySelectorAll('[data-wo-del]').forEach(btn =>
          btn.addEventListener('click', () => deleteWorkOrder(btn.dataset.woDel)));
      }
    });
  }

  async function deleteWorkOrder(id) {
    if (!confirm('Hapus Work Order ini? Tindakan tidak dapat dibatalkan.')) return;
    try {
      await api(`/api/work-orders/${id}`, { method: 'DELETE' });
      toast('Work Order dihapus', 'success');
      state.view = 'wo-list';
      render();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------- work order: form view ----------

  async function openWorkOrderForm(id) {
    state.view = 'wo-form';
    state.woEditingId = id;
    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;
    try {
      state.woData = await api(`/api/work-orders/${id}`);
    } catch (e) {
      toast(e.message, 'error');
      state.view = 'wo-list';
      render();
      return;
    }
    render();
  }

  // ---------- work order: detail view ----------
  // Urutan halaman: header projek -> progress bar -> informasi projek & work order ->
  // informasi sample/coupon -> informasi proses (detail tiap tahap) -> approval.
  // Tanggal testing dan info projek dibaca dari Permintaan Uji, tidak diisi ulang di sini.

  function fmtDateCell(value) {
    return value ? esc(formatDateOnly(value)) : '-';
  }

  function infoFactHtml(label, valueHtml) {
    return `<div class="info-fact"><span>${esc(label)}</span><strong>${valueHtml}</strong></div>`;
  }

  function stageBadgeHtml(label, status, id) {
    return `<span ${id ? `id="${id}"` : ''} class="stage-badge sb-${status}" title="${esc(label)} — ${esc(STAGE_STATUS_LABELS[status] || '')}"><i class="sb-dot"></i>${esc(label)}</span>`;
  }

  function currentStageInfo(stages) {
    const idx = stages.findIndex(s => !isStageDone(s.status));
    return stages[idx === -1 ? stages.length - 1 : idx];
  }

  function woHeroHtml(tr) {
    return `
      <div class="wo-hero">
        <div class="wo-hero-main">
          <div class="wo-hero-badges">
            <span id="woStageBadge" class="stage-badge sb-pending"><i class="sb-dot"></i>Memuat status...</span>
            ${tr.witness_status ? `<span class="wo-hero-tag">${esc(tr.witness_status)}</span>` : ''}
          </div>
          <h2 class="wo-hero-title">${esc(tr.project_name) || 'Projek tanpa nama'}</h2>
          <p class="wo-hero-company"><span aria-hidden="true">&#127970;</span> ${esc(tr.company) || '-'}</p>
        </div>
        <div class="wo-hero-tile">
          <span>No. Permintaan Uji</span>
          <strong>${esc(tr.job_number) || '-'}</strong>
        </div>
      </div>`;
  }

  // Keterangan tambahan untuk baris Jenis Pengujian tertentu (data dari form Permintaan Uji).
  function testExtraText(row, testName) {
    if (testName === 'Hardness Test' && row.hardness_spot) return `Jumlah spot: ${row.hardness_spot}`;
    if (testName === 'Charpy Impact Test') {
      const parts = [];
      if (row.charpy_temp) parts.push(`Suhu ${row.charpy_temp}`);
      [['WM', row.charpy_wm], ['BM', row.charpy_bm], ['HAZ', row.charpy_haz], ['FL', row.charpy_fl],
        ['FL+2', row.charpy_fl2], [row.charpy_optional_label || 'Opsional', row.charpy_optional]]
        .forEach(([label, value]) => { if (value) parts.push(`${label} ${value}`); });
      return parts.join(' · ');
    }
    return '';
  }

  function couponTestsOf(row) {
    return [
      ...(row.test_items || []).filter(t => t.checked),
      ...(row.other_tests || []).filter(t => t.test_name)
    ];
  }

  const qtyNumber = q => parseInt(q, 10) || 0;

  // Ringkasan sekilas: berapa coupon, jenis pengujian, total qty, dan matriks
  // jenis pengujian x coupon (angka = qty) lengkap dengan total.
  function woSampleSummaryHtml(couponRows) {
    const names = [];
    TEST_TYPES.forEach(n => { if (couponRows.some(r => couponTestsOf(r).some(t => t.test_name === n))) names.push(n); });
    couponRows.forEach(r => couponTestsOf(r).forEach(t => { if (!names.includes(t.test_name)) names.push(t.test_name); }));
    if (!names.length) return '';

    const totalByCoupon = couponRows.map(r => couponTestsOf(r).reduce((sum, t) => sum + qtyNumber(t.qty), 0));
    const grandTotal = totalByCoupon.reduce((a, b) => a + b, 0);

    return `
      <div class="task-stats">
        <div class="task-stat"><b>${couponRows.length}</b><span>Coupon</span></div>
        <div class="task-stat"><b>${names.length}</b><span>Jenis pengujian</span></div>
        <div class="task-stat ok"><b>${grandTotal}</b><span>Total qty spesimen</span></div>
      </div>
      <p class="matrix-title">Ringkasan Jenis Pengujian &times; Coupon <span class="en">(angka = qty)</span></p>
      <div class="task-table-wrap matrix-wrap"><table class="task-table info-table matrix-table">
        <thead><tr>
          <th>Jenis Pengujian</th>
          ${couponRows.map(r => `<th class="mx-col">Coupon #${esc(r.row_no)}<small>${esc(r.sample_marking) || '-'}</small></th>`).join('')}
          <th class="mx-col">Total</th>
        </tr></thead>
        <tbody>${names.map(name => {
          const cells = couponRows.map(r => couponTestsOf(r).find(t => t.test_name === name) || null);
          const total = cells.reduce((sum, t) => sum + (t ? qtyNumber(t.qty) : 0), 0);
          return `<tr>
            <td><strong>${esc(name)}</strong></td>
            ${cells.map(t => `<td class="mx-cell">${t ? `<span class="qty-pill">${esc(t.qty) || '&#10003;'}</span>` : '<span class="mx-empty">&ndash;</span>'}</td>`).join('')}
            <td class="mx-cell mx-total">${total}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr>
          <td>Total qty per coupon</td>
          ${totalByCoupon.map(n => `<td class="mx-cell">${n}</td>`).join('')}
          <td class="mx-cell mx-total">${grandTotal}</td>
        </tr></tfoot>
      </table></div>
      <p class="matrix-title" style="margin-top:22px;">Detail per Coupon</p>`;
  }

  function woCouponCardHtml(row) {
    const types = [...(row.coupon_type || [])];
    if (row.coupon_type_other) types.push(row.coupon_type_other);
    const specs = [
      ['Material / Grade', row.material_type_grade], ['Ukuran Material', row.material_size],
      ['Outside Diameter', row.outside_diameter], ['Tebal', row.thickness], ['Heat Number', row.heat_number],
      ['Proses Pengelasan', row.welding_process], ['Posisi Pengelasan', row.welding_position],
      ['Ref. Code', row.ref_code], ['No. WPS', row.no_wps], ['Tujuan Pengujian', row.testing_purpose]
    ].filter(([, value]) => value);
    const tests = couponTestsOf(row);
    const totalQty = tests.reduce((sum, t) => sum + qtyNumber(t.qty), 0);

    return `
      <div class="coupon-card">
        <div class="coupon-card-head">
          <span class="coupon-no">#${esc(row.row_no)}</span>
          <div class="coupon-title">
            <div class="coupon-types">${types.length
              ? types.map(t => `<span class="type-chip">${esc(t)}</span>`).join('')
              : '<span class="muted">Jenis coupon belum diisi</span>'}</div>
            <span class="muted">${tests.length} jenis pengujian &middot; total qty ${totalQty}</span>
          </div>
          <div class="field coupon-mark">
            <label>Sample Marking</label>
            <input type="text" data-row-no="${esc(row.row_no)}" data-sample-marking value="${esc(row.sample_marking)}">
          </div>
        </div>
        ${specs.length ? `<div class="info-facts coupon-specs">${specs.map(([label, value]) => infoFactHtml(label, esc(value))).join('')}</div>` : ''}
        ${row.note ? `<p class="coupon-note"><span>Catatan:</span> ${esc(row.note)}</p>` : ''}
        <div class="task-table-wrap coupon-tests"><table class="task-table info-table">
          <thead><tr><th>Jenis Pengujian</th><th>Qty</th><th>Metode / Standar</th><th>Keterangan</th></tr></thead>
          <tbody>${tests.map(t => `
            <tr>
              <td><strong>${esc(t.test_name)}</strong></td>
              <td><span class="qty-pill">${esc(t.qty) || '-'}</span></td>
              <td>${esc(t.method) || '-'}</td>
              <td>${esc(testExtraText(row, t.test_name)) || '-'}</td>
            </tr>`).join('') || '<tr><td colspan="4" class="muted">Belum ada Jenis Pengujian yang dipilih.</td></tr>'}
          </tbody>
          ${tests.length ? `<tfoot><tr><td>Total qty</td><td><span class="qty-pill qty-total">${totalQty}</span></td><td colspan="2"></td></tr></tfoot>` : ''}
        </table></div>
      </div>`;
  }

  function renderWorkOrderForm() {
    const wo = state.woData || {};
    const tr = wo.test_request || {};

    pageTitle.textContent = 'Work Order';
    pageSubtitle.textContent = `Work Order — ${tr.job_number || ''}`;
    topbarActions.innerHTML = `
      <button class="btn" id="btnWoBack">&larr; Kembali ke Daftar</button>
      <button type="button" class="btn" id="btnWoExportPdf">Export PDF</button>
    `;
    document.getElementById('btnWoBack').addEventListener('click', () => { state.view = 'wo-list'; render(); });
    document.getElementById('btnWoExportPdf').addEventListener('click', () =>
      window.open(`/work-orders/${state.woEditingId}/print`, '_blank'));

    const couponRows = wo.coupon_tests || [];

    contentEl.innerHTML = `
      ${woHeroHtml(tr)}
      <div id="woBarSlot"></div>
      <form id="woForm">

        <div class="card">
          <p class="section-title">Informasi Projek &amp; Work Order <span class="en">(diambil dari Permintaan Uji)</span></p>
          <div class="info-facts info-facts-lg">
            ${infoFactHtml('Tgl. Request', fmtDateCell(tr.received_date))}
            ${infoFactHtml('Atas Nama Perusahaan', esc(tr.on_behalf_owner) || '-')}
            ${infoFactHtml('ID Perusahaan', esc(tr.customer_id) || '-')}
            ${infoFactHtml('Nomor PO', esc(tr.po_number) || '-')}
            ${infoFactHtml('Pelaksanaan Pengujian', esc(tr.witness_status) || '-')}
            ${infoFactHtml('Tgl. Testing', fmtDateCell(wo.testing_date))}
            ${infoFactHtml('Benda Uji', esc(tr.specimen_status) || '-')}
            ${infoFactHtml('Target Penyelesaian LHU', fmtDateCell(tr.lhu_target_date))}
            ${infoFactHtml('Penanganan LHU', esc(tr.lhu_handling) || '-')}
          </div>
          <div class="form-grid" style="margin-top:16px;">
            <div class="field">
              <label>Our Reference</label>
              <input type="text" name="our_reference" value="${esc(wo.our_reference)}">
            </div>
            <div class="field">
              <label>Contact Person</label>
              <input type="text" name="contact_person" value="${esc(wo.contact_person)}">
            </div>
          </div>
        </div>

        <div class="card">
          <p class="section-title">Informasi Sample / Coupon <span class="en">${couponRows.length} coupon &mdash; Sample Marking bisa diubah</span></p>
          ${woSampleSummaryHtml(couponRows)}
          ${couponRows.map(woCouponCardHtml).join('') || '<p class="muted">Tidak ada coupon test pada permintaan ini.</p>'}
        </div>

        <div id="woProgressSlot" data-wo-id="${esc(wo.id)}"></div>

        <div class="card">
          <p class="section-title">Approval <span class="en">untuk approval manual &mdash; Work Order otomatis Final setelah semua tahap proses selesai</span></p>
          <div class="signature-columns cols-3">
            <div class="signature-column">
              <div class="field">
                <label>Prepared by <span class="en">QA/QC Admin</span></label>
                <input type="text" name="prepared_by_name" value="${esc(wo.prepared_by_name)}">
              </div>
              <div class="field">
                ${signaturePadHtml('prepared_by_signature', 'Tanda Tangan', 'Signature', wo.prepared_by_signature)}
              </div>
            </div>
            <div class="signature-column">
              <div class="field">
                <label>Checked by <span class="en">QA/QC Manager</span></label>
                <input type="text" name="checked_by_name" value="${esc(wo.checked_by_name)}">
              </div>
              <div class="field">
                ${signaturePadHtml('checked_by_signature', 'Tanda Tangan', 'Signature', wo.checked_by_signature)}
              </div>
            </div>
            <div class="signature-column">
              <div class="field">
                <label>Approved by <span class="en">Technical Manager</span></label>
                <input type="text" name="approved_by_name" value="${esc(wo.approved_by_name)}">
              </div>
              <div class="field">
                ${signaturePadHtml('approved_by_signature', 'Tanda Tangan', 'Signature', wo.approved_by_signature)}
              </div>
            </div>
          </div>
          <div class="field" style="max-width: 260px; margin-top: 14px;">
            <label>Tanggal Approval <span class="en">Date</span></label>
            <input type="date" name="approval_date" value="${esc(wo.approval_date)}">
          </div>
        </div>

        <div class="form-actions">
          <div>
            <button type="button" class="btn btn-danger" id="btnWoDelete">Hapus Work Order</button>
          </div>
          <div class="right">
            <button type="submit" class="btn btn-primary">Simpan</button>
          </div>
        </div>
      </form>
    `;

    bindWorkOrderFormEvents();
    initSignaturePads();
    loadWoProgressInto(wo.id);
  }

  function bindWorkOrderFormEvents() {
    document.getElementById('btnWoDelete').addEventListener('click', () => deleteWorkOrder(state.woEditingId));
    document.getElementById('woForm').addEventListener('submit', onWorkOrderSubmit);
  }

  async function onWorkOrderSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());

    payload.sample_marks = Array.from(contentEl.querySelectorAll('[data-sample-marking]')).map(input => ({
      row_no: Number(input.dataset.rowNo),
      sample_marking: input.value
    }));

    contentEl.querySelectorAll('canvas.signature-pad').forEach(canvas => {
      payload[canvas.dataset.sig] = canvas.dataset.hasSignature === 'true' ? canvas.toDataURL('image/png') : '';
    });

    try {
      state.woData = await api(`/api/work-orders/${state.woEditingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      toast('Work Order tersimpan', 'success');
      state.view = 'wo-list';
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- work order: tasks (Receiving .. Report Issued) ----------
  // Enam tahap per Work Order. Baris kerja (coupon, jenis pengujian, qty, sample marking)
  // datang dari server yang menurunkannya dari Permintaan Uji — form tahap hanya mengisi
  // hasil di atasnya, jadi tidak ada data yang diketik ulang. Detail Work Order hanya
  // MENAMPILKAN progress; semua form pengisian ada di menu Tasks.

  const WO_STAGE_ICONS = {
    receiving: '&#128229;', preparation: '&#9879;', testing: '&#128202;',
    reporting: '&#128196;', review: '&#9989;', released: '&#128220;'
  };
  const STAGE_STATUS_LABELS = {
    pending: 'Belum Dimulai', draft: 'Berjalan', final: 'Selesai', rejected: 'Perlu Revisi', na: 'Tidak Berlaku'
  };
  const STAGE_STATUS_GLYPH = { pending: '&#9675;', draft: '&#9679;', final: '&#10003;', rejected: '!', na: '&ndash;' };
  const RECEIVE_CONDITIONS = ['Baik', 'Cacat / Rusak', 'Perlu Klarifikasi'];
  const TEST_STATUS_OPTIONS = [['', 'Belum'], ['proses', 'Sedang Diuji'], ['selesai', 'Selesai'], ['na', 'Tidak Perlu']];
  const TEST_EQUIPMENT = [
    'Universal Testing Machine (UTM)', 'Charpy Impact Machine', 'Hardness Tester',
    'Bend Test Machine', 'Optical Emission Spectrometer (OES)', 'PMI Analyzer', 'Metallurgical Microscope'
  ];
  const TEST_RESULT_OPTIONS = [['', 'Belum ada hasil'], ['accepted', 'Accepted'], ['rejected', 'Rejected'], ['na', 'Tanpa kriteria (N/A)']];

  const isStageDone = status => status === 'final' || status === 'na';

  function firstOpenStageKey(stages) {
    const open = stages.find(s => !isStageDone(s.status));
    return (open || stages[stages.length - 1]).key;
  }

  function stageDot(status, index) {
    return status === 'final' ? '&#10003;' : status === 'na' ? '&ndash;' : status === 'rejected' ? '!' : String(index + 1);
  }

  function stagePill(status) {
    return `<span class="st-pill st-${status}">${esc(STAGE_STATUS_LABELS[status] || status)}</span>`;
  }

  // ----- Detail Work Order: progress + info tiap tahap (hanya baca) -----

  function woInfoTableHtml(info) {
    if (!info.rows.length) return '';
    return `<div class="task-table-wrap"><table class="task-table info-table">
      <thead><tr>${info.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${info.rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  // Progress bar ringkas (tanpa info detail) di bawah header.
  function woProgressBarHtml(p) {
    return `
      <div class="card wo-bar-card">
        <div class="wo-bar-head">
          <div>
            <p class="card-title">Progress Pengerjaan</p>
            <p class="card-desc" style="margin:0;">${p.done_count} dari ${p.total} tahap selesai</p>
          </div>
          <div class="wo-progress-pct">${p.percent}%</div>
        </div>
        <div class="wo-seg-bar">
          ${p.stages.map((s, i) => `
            <div class="wo-seg st-${s.status}" title="${esc(s.label)} — ${esc(STAGE_STATUS_LABELS[s.status])}">
              <span class="wo-seg-fill"></span>
              <span class="wo-seg-label"><b>${i + 1}</b>${esc(s.label)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // Informasi proses secara detail (hanya baca), ditaruh di bawah informasi sample.
  function woProgressInfoHtml(p) {
    return `
      <div class="card wo-progress">
        <div class="wo-progress-head">
          <div>
            <p class="card-title">Informasi Proses</p>
            <p class="card-desc" style="margin-bottom:6px;">Rincian tiap tahap pengerjaan &mdash; hanya info, pengisian form ada di menu Tasks</p>
          </div>
          <button type="button" class="btn btn-sm btn-primary" data-wo-stage="${firstOpenStageKey(p.stages)}">Kerjakan di Tasks &rarr;</button>
        </div>
        <ol class="wo-flow">
          ${p.stages.map((s, i) => `
            <li class="wo-flow-item st-${s.status}">
              <span class="wo-flow-dot">${stageDot(s.status, i)}</span>
              <div class="wo-flow-body">
                <div class="wo-flow-top"><strong>${esc(s.label)}</strong>${stagePill(s.status)}</div>
                <p class="wo-flow-hint">${esc(s.hint)}</p>
                <p class="wo-flow-meta">PIC: <strong>${esc(s.pic) || '-'}</strong>${s.date ? ` &middot; ${esc(formatDateOnly(s.date))}` : ''} &middot; ${esc(s.summary)}</p>
                <details class="wo-flow-more">
                  <summary>Lihat detail</summary>
                  <div class="info-facts">${s.info.facts.map(f =>
                    `<div class="info-fact"><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong></div>`).join('')}</div>
                  ${woInfoTableHtml(s.info)}
                </details>
              </div>
              <button type="button" class="btn btn-sm" data-wo-stage="${s.key}">Buka di Tasks</button>
            </li>`).join('')}
        </ol>
      </div>`;
  }

  async function loadWoProgressInto(woId) {
    const flowSlot = document.getElementById('woProgressSlot');
    const barSlot = document.getElementById('woBarSlot');
    if (!flowSlot) return;
    if (barSlot) barSlot.innerHTML = `<div class="card"><p class="muted">Memuat progress pengerjaan...</p></div>`;
    let progress = null;
    try {
      progress = await api(`/api/work-orders/${woId}/progress`);
    } catch (e) { /* progress adalah tambahan; form Work Order tetap bisa dipakai */ }

    const flow = document.getElementById('woProgressSlot');
    if (!flow || flow.dataset.woId !== String(woId)) return;   // halaman sudah berganti
    const bar = document.getElementById('woBarSlot');
    if (!progress) { if (bar) bar.innerHTML = ''; return; }

    if (bar) bar.innerHTML = woProgressBarHtml(progress);
    flow.innerHTML = woProgressInfoHtml(progress);
    const badge = document.getElementById('woStageBadge');
    if (badge) {
      const current = currentStageInfo(progress.stages);
      badge.outerHTML = stageBadgeHtml(current.label, current.status, 'woStageBadge');
    }
    flow.querySelectorAll('[data-wo-stage]').forEach(btn =>
      btn.addEventListener('click', () => openWoTask(woId, btn.dataset.woStage)));
  }

  // ----- Tasks: ruang kerja per Work Order (form tiap tahap) -----

  async function openWoTask(woId, key) {
    state.view = 'wo-task';
    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;
    try {
      state.woTask = await api(`/api/work-orders/${woId}/tasks/${key}`);
    } catch (e) {
      toast(e.message, 'error');
      openWorkOrderForm(woId);
      return;
    }
    render();
  }

  function confirmLeaveTask() {
    return !state.woTaskDirty || confirm('Perubahan pada halaman ini belum disimpan. Tetap pindah halaman?');
  }

  function woPicSelect(current) {
    const names = WO_PICS.map(p => p.name);
    if (current && !names.includes(current)) names.push(current);
    return `<select name="pic"><option value="">-</option>${names.map(n =>
      `<option value="${esc(n)}" ${n === current ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  }

  // Pilihan segmented (radio). `attr` = atribut mentah, mis. data-f="received".
  function woSeg(name, attr, value, options) {
    return `<div class="seg">${options.map(([v, label]) => `
      <label class="seg-opt seg-${v || 'none'}"><input type="radio" name="${esc(name)}" ${attr} value="${esc(v)}" ${value === v ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`;
  }

  function woSelectOptions(options, current) {
    return options.map(([v, label]) => `<option value="${esc(v)}" ${current === v ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  function couponCellHtml(it) {
    return `<div class="task-id-cell"><strong>${esc(it.coupon_label)}</strong><span class="marking-chip">${esc(it.sample_marking) || 'belum ada marking'}</span></div>`;
  }

  function sheetBadge(status) {
    return status ? `<span class="badge badge-${status === 'final' ? 'final' : 'draft'}">Sheet ${status === 'final' ? 'Final' : 'Draft'}</span>` : '';
  }

  // Tombol menuju Lembar Hasil Uji tahap Testing (test_reports) — berbeda dari sheetActionHtml
  // yang menuju Pengecekan Spesimen (tahap Preparation). Selalu bisa dibuat asal baris punya Qty;
  // tidak digantung pada template PDF resmi seperti sheet Pengecekan Spesimen.
  function reportActionHtml(it) {
    if (it.report_id) return `<button type="button" class="btn btn-sm" data-open-report="${it.report_id}">Buka</button>`;
    if (!it.qty) return '<span class="muted">Qty belum diisi</span>';
    return `<button type="button" class="btn btn-sm btn-primary" data-create-report data-coupon="${esc(it.coupon_row_no)}" data-test="${esc(it.test_name)}">+ Buat Sheet</button>`;
  }

  function resultBadge(result) {
    if (result === 'accepted') return '<span class="badge badge-final">Accepted</span>';
    if (result === 'rejected') return '<span class="badge badge-draft">Rejected</span>';
    if (result === 'na') return '<span class="st-pill st-na">N/A</span>';
    return '<span class="st-pill st-pending">Belum</span>';
  }

  function receivingBodyHtml(t) {
    return `
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Penerimaan Sampel per Coupon <span class="en">(daftar otomatis dari Permintaan Uji)</span></p>
          <button type="button" class="btn btn-sm" id="btnMarkAllReceived">Tandai semua diterima (Baik)</button>
        </div>
        <div class="task-table-wrap"><table class="task-table">
          <thead><tr><th>Coupon / Sample Marking</th><th>Diterima?</th><th>Kondisi</th><th>Catatan</th></tr></thead>
          <tbody>${t.items.map(it => `
            <tr data-task-row data-key="${esc(it.key)}">
              <td>${couponCellHtml(it)}</td>
              <td>${woSeg(`received-${it.key}`, 'data-f="received"', it.received, [['Y', 'Diterima'], ['N', 'Tidak']])}</td>
              <td><select data-f="condition"><option value="">-</option>${RECEIVE_CONDITIONS.map(c =>
                `<option ${it.condition === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
              <td><input type="text" data-f="note" value="${esc(it.note)}" placeholder="Catatan"></td>
            </tr>`).join('') || '<tr><td colspan="4" class="muted">Belum ada Coupon Test pada Permintaan Uji.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }

  // Specimen Marking = Sample Marking + kode jenis pengujian + nomor urut (sama dengan Marking
  // Specimen di sheet Pengecekan Spesimen, jadi otomatis diteruskan ke sana).
  function markingChipsHtml(it) {
    if (it.markings && it.markings.length) {
      return `<div class="mk-list">${it.markings.map(m => `<span class="mk-chip">${esc(m)}</span>`).join('')}</div>`;
    }
    return it.qty
      ? '<span class="muted" title="Kode jenis pengujian ini belum diatur di Master Data > Kode Jenis Pengujian">Kode belum diatur</span>'
      : '<span class="muted">-</span>';
  }

  // Durasi antara dua waktu ("2 hari 3 jam 15 menit"); tanpa waktu selesai dihitung sampai sekarang.
  function fmtDurationID(startedAt, finishedAt) {
    if (!startedAt) return '-';
    const start = new Date(startedAt).getTime();
    const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '-';
    const min = Math.floor((end - start) / 60000);
    const parts = [];
    if (Math.floor(min / 1440)) parts.push(`${Math.floor(min / 1440)} hari`);
    if (Math.floor((min % 1440) / 60)) parts.push(`${Math.floor((min % 1440) / 60)} jam`);
    if (min % 60 || !parts.length) parts.push(`${min % 60} menit`);
    return parts.join(' ');
  }

  const MACHINING_LABELS = { belum: 'Belum machining', proses: 'Sedang machining', selesai: 'Machining selesai' };
  const MACHINING_PILL = { belum: 'st-pending', proses: 'st-draft', selesai: 'st-final' };
  const machiningPillHtml = status => `<span class="st-pill ${MACHINING_PILL[status] || 'st-pending'}">${esc(MACHINING_LABELS[status] || status)}</span>`;

  // Tombol menuju sheet untuk satu baris: Buka (sudah ada) / Buat Sheet (punya template) / -.
  // Sheet baru hanya bisa dibuat setelah machining selesai (item.machining_done === false = belum).
  function sheetActionHtml(it) {
    if (it.sheet_id) return `<button type="button" class="btn btn-sm" data-open-sheet="${it.sheet_id}">Buka Sheet</button>`;
    if (it.has_template && it.machining_done === false) {
      return '<button type="button" class="btn btn-sm" disabled title="Tim machining perlu menekan Selesai Machining dulu">Menunggu machining</button>';
    }
    if (it.has_template) {
      return `<button type="button" class="btn btn-sm btn-primary" data-create-sheet data-coupon="${esc(it.coupon_row_no)}" data-test="${esc(it.test_name)}">+ Buat Sheet</button>`;
    }
    return '<span class="muted" title="Isi Qty jenis pengujian ini di Permintaan Uji dulu">Qty belum diisi</span>';
  }

  // Preparation = Pengecekan Spesimen (marking, cutting, machining specimen): tidak ada form
  // di sini, statusnya mengikuti sheet. Semua coupon & jenis pengujian ditampilkan, termasuk yang
  // tidak punya template sheet (tetap di-marking, dipotong, dan di-machining).
  function preparationBodyHtml(t) {
    const { stage, items, stats } = t;
    const mc = t.extra.machining;
    const mcButtons = mc.status === 'belum'
      ? '<button type="button" class="btn btn-primary" data-machining="start">Mulai Machining</button>'
      : mc.status === 'proses'
        ? '<button type="button" class="btn btn-primary" data-machining="finish">Selesai Machining</button>'
        : (stats.created ? '' : '<button type="button" class="btn btn-sm" data-machining="reopen">Buka Kembali</button>');
    const mcHint = {
      belum: 'Tim machining menekan &ldquo;Mulai Machining&rdquo; saat pembuatan spesimen dimulai. Receiving harus sudah selesai.',
      proses: 'Pembuatan spesimen sedang dikerjakan. Tekan &ldquo;Selesai Machining&rdquo; bila semua spesimen sudah jadi.',
      selesai: 'Machining selesai — tim inspeksi sekarang dapat membuat dan mengisi sheet Pengecekan Spesimen.'
    }[mc.status];
    return `
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Machining Spesimen <span class="en">(pembuatan spesimen oleh tim machining)</span></p>
          <div>${mcButtons}</div>
        </div>
        <div class="info-facts">
          <div class="info-fact"><span>Status</span><strong>${machiningPillHtml(mc.status)}</strong></div>
          <div class="info-fact"><span>Dimulai</span><strong>${mc.started_at ? esc(formatDateTimeID(mc.started_at)) : '-'}</strong></div>
          <div class="info-fact"><span>Selesai</span><strong>${mc.finished_at ? esc(formatDateTimeID(mc.finished_at)) : '-'}</strong></div>
          <div class="info-fact"><span>${mc.status === 'proses' ? 'Berjalan selama' : 'Durasi pengerjaan'}</span><strong>${mc.started_at ? esc(fmtDurationID(mc.started_at, mc.finished_at)) : '-'}</strong></div>
          <div class="info-fact"><span>PIC Machining</span><strong>${esc(stage.pic) || '-'}</strong></div>
        </div>
        <p class="muted" style="margin:10px 0 0;">${mcHint}</p>
      </div>
      <div class="task-stats">
        <div class="task-stat"><b>${stats.coupons}</b><span>Coupon</span></div>
        <div class="task-stat"><b>${stats.specimens}</b><span>Total spesimen</span></div>
        <div class="task-stat"><b>${stats.required}</b><span>Sheet dibutuhkan</span></div>
        <div class="task-stat ok"><b>${stats.finals}</b><span>Sheet Final</span></div>
      </div>
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Spesimen &amp; Marking <span class="en">(otomatis dari Permintaan Uji, diteruskan ke Pengecekan Spesimen)</span></p>
          <button type="button" class="btn btn-sm" id="btnGotoSpecimenList">Buka Pengecekan Spesimen</button>
        </div>
        <div class="task-table-wrap"><table class="task-table">
          <thead><tr><th>Coupon / Sample Marking</th><th>Jenis Pengujian</th><th>Specimen Marking</th><th>Status Sheet</th><th></th></tr></thead>
          <tbody>${items.map(it => `
            <tr>
              <td>${couponCellHtml(it)}</td>
              <td><strong>${esc(it.test_name)}</strong><br><span class="muted">Qty ${esc(it.qty) || '-'}${it.method ? ' &middot; ' + esc(it.method) : ''}</span></td>
              <td>${markingChipsHtml(it)}</td>
              <td>${it.sheet_status
                ? `<span class="badge badge-${it.sheet_status === 'final' ? 'final' : 'draft'}">${it.sheet_status === 'final' ? 'Final' : 'Draft'}</span>`
                : (it.has_template ? '<span class="st-pill st-pending">Belum dibuat</span>' : '<span class="muted">-</span>')}</td>
              <td>${sheetActionHtml(it)}</td>
            </tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada Jenis Pengujian yang dicentang pada Permintaan Uji.</td></tr>'}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <p class="section-title">Info Tahap Preparation</p>
        <form id="woPrepForm" class="form-grid">
          <div class="field"><label>PIC Preparation</label>${woPicSelect(stage.pic)}</div>
          <div class="field" style="justify-content:flex-end; align-items:flex-start;"><button type="submit" class="btn">Simpan PIC</button></div>
        </form>
        <p class="muted" style="margin-top:12px;">Status tahap ini otomatis: Berjalan begitu machining dimulai, dan Selesai bila semua sheet Pengecekan Spesimen yang dibutuhkan sudah dibuat dan berstatus Final.</p>
      </div>`;
  }

  function testingBodyHtml(t) {
    const s = t.stats;
    return `
      <datalist id="testEquipmentList">${[...new Set([...EQUIPMENT.map(eq => eq.name), ...TEST_EQUIPMENT])].map(m => `<option value="${esc(m)}">`).join('')}</datalist>
      <div class="task-stats">
        <div class="task-stat"><b>${s.total}</b><span>Total pengujian</span></div>
        <div class="task-stat ok"><b>${s.done}</b><span>Selesai</span></div>
        <div class="task-stat"><b>${s.running}</b><span>Sedang diuji</span></div>
        <div class="task-stat"><b>${s.total - s.done - s.running}</b><span>Belum dimulai</span></div>
      </div>
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Pelaksanaan Pengujian <span class="en">(baris otomatis dari Jenis Pengujian di Permintaan Uji)</span></p>
          <div class="task-head-actions">
            <button type="button" class="btn btn-sm" id="btnGotoSpecimenList">Lihat Pengecekan Spesimen</button>
            <button type="button" class="btn btn-sm" id="btnMarkAllTested">Tandai semua selesai</button>
          </div>
        </div>
        <div class="task-table-wrap"><table class="task-table">
          <thead><tr><th>Coupon / Sample Marking</th><th>Jenis Pengujian &amp; Specimen Marking</th><th>Tgl. Uji</th><th>Alat</th><th>Status</th><th>Catatan</th><th>Lembar Hasil Uji</th></tr></thead>
          <tbody>${t.items.map(it => `
            <tr data-task-row data-key="${esc(it.key)}">
              <td>${couponCellHtml(it)}</td>
              <td class="test-cell">
                <strong>${esc(it.test_name)}</strong><br><span class="muted">Qty ${esc(it.qty) || '-'}${it.method ? ' &middot; ' + esc(it.method) : ''}</span>
                <div class="test-cell-mk">${markingChipsHtml(it)}</div>
                ${it.sheet_status ? `<div class="test-cell-sheet muted">Spesimen: ${it.sheet_status === 'final' ? 'Final' : 'Draft'}</div>` : ''}
              </td>
              <td><input type="date" data-f="tested_date" value="${esc(it.tested_date)}"></td>
              <td><input type="text" data-f="equipment" list="testEquipmentList" autocomplete="off" value="${esc(it.equipment)}" placeholder="Pilih / ketik"></td>
              <td><select data-f="status">${woSelectOptions(TEST_STATUS_OPTIONS, it.status)}</select></td>
              <td><input type="text" data-f="note" value="${esc(it.note)}" placeholder="Catatan"></td>
              <td class="test-cell-report">${it.report_status ? `<div>${sheetBadge(it.report_status)}</div>` : ''}${reportActionHtml(it)}</td>
            </tr>`).join('') || '<tr><td colspan="7" class="muted">Belum ada Jenis Pengujian yang dicentang pada Permintaan Uji.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }

  function reportingBodyHtml(t) {
    const s = t.stats;
    return `
      <div class="task-stats">
        <div class="task-stat"><b>${s.total}</b><span>Total pengujian</span></div>
        <div class="task-stat"><b>${s.with_result}</b><span>Hasil terisi</span></div>
        <div class="task-stat ok"><b>${s.accepted}</b><span>Accepted</span></div>
        <div class="task-stat bad"><b>${s.rejected}</b><span>Rejected</span></div>
      </div>
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Input Hasil Pengujian <span class="en">(baris otomatis dari Permintaan Uji, tanggal uji dari tahap Testing)</span></p>
          <button type="button" class="btn btn-sm" id="btnGotoTesting">Buka halaman Testing</button>
        </div>
        <div class="task-table-wrap"><table class="task-table">
          <thead><tr><th>Coupon / Sample Marking</th><th>Jenis Pengujian</th><th>Tgl. Uji</th><th>Hasil</th><th>Nilai / Ringkasan</th><th>Catatan</th></tr></thead>
          <tbody>${t.items.map(it => `
            <tr data-task-row data-key="${esc(it.key)}">
              <td>${couponCellHtml(it)}</td>
              <td><strong>${esc(it.test_name)}</strong><br><span class="muted">Qty ${esc(it.qty) || '-'}</span></td>
              <td>${it.tested_date ? esc(formatDateOnly(it.tested_date)) : '<span class="muted">-</span>'}</td>
              <td><select data-f="result">${woSelectOptions(TEST_RESULT_OPTIONS, it.result)}</select></td>
              <td><input type="text" data-f="result_value" value="${esc(it.result_value)}" placeholder="mis. UTS 512 MPa"></td>
              <td><input type="text" data-f="note" value="${esc(it.note)}" placeholder="Catatan"></td>
            </tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada Jenis Pengujian yang dicentang pada Permintaan Uji.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }

  function reviewBodyHtml(t) {
    const s = t.extra.results_stats;
    const auto = t.extra.auto.map(a => `
      <div class="check-row ${a.ok ? 'ok' : 'bad'}">
        <span class="check-icon">${a.ok ? '&#10003;' : '&#10007;'}</span>
        <div class="check-text">${esc(a.label)}<span class="en">Otomatis dari data tahap sebelumnya</span></div>
        ${a.ok ? '<span class="st-pill st-final">Terpenuhi</span>' : '<span class="st-pill st-pending">Belum</span>'}
      </div>`).join('');
    const manual = t.extra.manual.map(m => `
      <div class="check-row ${m.value === 'Y' ? 'ok' : m.value === 'N' ? 'bad' : ''}">
        <span class="check-icon">${m.value === 'Y' ? '&#10003;' : m.value === 'N' ? '&#10007;' : '&#8226;'}</span>
        <div class="check-text">${esc(m.label)}<span class="en">Dicek manual oleh reviewer</span></div>
        ${woSeg(`check-${m.key}`, `data-check="${esc(m.key)}"`, m.value, [['Y', 'Ya'], ['N', 'Tidak']])}
      </div>`).join('');
    return `
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Laporan yang Diperiksa <span class="en">(hanya baca, dari tahap Reporting)</span></p>
          <span class="muted">No. Laporan: <strong>${esc(t.extra.report_no) || '-'}</strong></span>
        </div>
        <p class="muted" style="margin:0 0 10px;">Accepted ${s.accepted} &middot; Rejected ${s.rejected} &middot; Belum ada hasil ${s.total - s.with_result} &middot; dari ${s.total} pengujian</p>
        <div class="task-table-wrap"><table class="task-table">
          <thead><tr><th>Coupon / Sample Marking</th><th>Jenis Pengujian</th><th>Tgl. Uji</th><th>Hasil</th><th>Nilai / Ringkasan</th></tr></thead>
          <tbody>${t.extra.results.map(it => `
            <tr>
              <td>${couponCellHtml(it)}</td>
              <td><strong>${esc(it.test_name)}</strong><br><span class="muted">Qty ${esc(it.qty) || '-'}</span></td>
              <td>${it.tested_date ? esc(formatDateOnly(it.tested_date)) : '-'}</td>
              <td>${resultBadge(it.result)}</td>
              <td>${esc(it.result_value) || '-'}</td>
            </tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada pengujian.</td></tr>'}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <p class="section-title">Checklist Pemeriksaan <span class="en">${t.stats.ok} dari ${t.stats.total} butir terpenuhi</span></p>
        ${auto}${manual}
      </div>`;
  }

  function releasedBodyHtml(t) {
    const e = t.extra;
    const fc = e.final_check || { coupons: 0, test_types: 0, total_specimens: 0, result_sheets: 0, by_test: [] };
    const woId = t.work_order.id;
    return `
      <div class="lhu-layout">
        <div class="card">
          <p class="section-title">Ringkasan Approval <span class="en">(hanya baca, dari tahap Review &amp; Approval)</span></p>
          <div class="info-facts">
            <div class="info-fact"><span>Disetujui oleh</span><strong>${esc(e.approved_by) || '-'}</strong></div>
            <div class="info-fact"><span>Tanggal Approval</span><strong>${e.approved_date ? esc(formatDateOnly(e.approved_date)) : '-'}</strong></div>
            <div class="info-fact"><span>No. Laporan</span><strong>${esc(e.report_no) || '-'}</strong></div>
          </div>
          ${e.approval_notes ? `<p class="muted" style="margin-top:10px;"><strong>Catatan Approval:</strong> ${esc(e.approval_notes)}</p>` : ''}
        </div>
        <div class="card">
          <p class="section-title">Dokumen <span class="en">LHU</span></p>
          <div class="lhu-doc-row">
            <div>
              <strong>${e.lhu_number ? esc(e.lhu_number) + '.pdf' : 'Belum diterbitkan'}</strong>
              <span class="st-pill ${e.lhu_number ? 'st-final' : 'st-pending'}">${e.lhu_number ? 'Diterbitkan' : 'Belum Diterbitkan'}</span>
              <p class="muted" style="margin:4px 0 0;">Standard Material Test Report</p>
            </div>
            <button type="button" class="btn btn-sm" data-open-wo-print="${woId}">Buka Dokumen (PDF)</button>
          </div>
          <p class="muted" style="margin-top:10px;">Memakai format cetak Work Order yang sudah ada (DPI-LP-FR-25) &mdash; dokumen LHU tersendiri belum dibangun.</p>
        </div>
      </div>
      <div class="card">
        <p class="section-title">Ringkasan Hasil Pengujian <span class="en">(Final Check, hanya baca)</span></p>
        <div class="task-stats">
          <div class="task-stat"><b>${fc.coupons}</b><span>Coupon</span></div>
          <div class="task-stat"><b>${fc.test_types}</b><span>Jenis Pengujian</span></div>
          <div class="task-stat ok"><b>${fc.total_specimens}</b><span>Total Specimen</span></div>
          <div class="task-stat ok"><b>${fc.result_sheets}</b><span>Result Sheet Final</span></div>
        </div>
        <div class="task-table-wrap"><table class="task-table">
          <thead><tr><th>No.</th><th>Jenis Pengujian</th><th>Jumlah Specimen</th></tr></thead>
          <tbody>${fc.by_test.map((r, i) => `
            <tr><td>${i + 1}</td><td>${esc(r.test_name)}</td><td>${r.qty}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada data.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }

  function releasedInfoCardHtml(t) {
    const { stage, extra } = t;
    const checklist = [
      'Nomor LHU akan digenerate otomatis',
      'PDF LHU akan dibuat',
      'Data hasil pengujian akan dikunci',
      'Work Order berubah menjadi Complete'
    ];
    return `
      <div class="lhu-layout">
        <div class="card">
          <p class="section-title">Informasi Penerbitan LHU</p>
          <div class="form-grid">
            <div class="field"><label>Nomor LHU <span class="en">dibuat otomatis</span></label>
              <input type="text" value="${esc(extra.lhu_number) || 'Belum diterbitkan'}" disabled></div>
            <div class="field"><label>${esc(stage.date_label)}</label><input type="date" name="task_date" value="${esc(stage.task_date)}"></div>
            <div class="field"><label>Versi</label><input type="text" value="Rev. 0" disabled></div>
            <div class="field"><label>PIC Issued</label>${woPicSelect(stage.pic)}</div>
            <div class="field full"><label>Template Laporan</label>
              <select disabled><option>Standard Material Test Report</option></select></div>
            <div class="field full"><label>Catatan Tahap</label><textarea name="notes">${esc(stage.notes)}</textarea></div>
          </div>
        </div>
        <div class="lhu-info-box">
          <p class="lhu-info-title"><span aria-hidden="true">&#8505;&#65039;</span> Setelah LHU diterbitkan</p>
          <ul>${checklist.map(c => `<li><span aria-hidden="true">&#10003;</span> ${esc(c)}</li>`).join('')}</ul>
        </div>
      </div>`;
  }

  function approvalCardHtml(t) {
    const a = t.approval || {};
    return `
      <div class="card">
        <p class="section-title">Approval <span class="en">— keputusan atas laporan</span></p>
        <div class="field"><label>Keputusan</label>
          ${woSeg('approval_status', '', a.status || '', [['', 'Menunggu'], ['approved', 'Disetujui'], ['rejected', 'Ditolak / Revisi']])}
        </div>
        <div class="form-grid" style="margin-top:14px;">
          <div class="field"><label>Nama Approver</label><input type="text" name="approver_name" value="${esc(a.name)}"></div>
          <div class="field"><label>Tanggal Approval <span class="en">Date</span></label><input type="date" name="approval_date" value="${esc(a.date)}"></div>
        </div>
        <div class="field" style="margin-top:14px;">${signaturePadHtml('approver_signature', 'Tanda Tangan', 'Signature', a.signature)}</div>
        <div class="field" style="margin-top:14px;"><label>Catatan Approval</label><textarea name="approval_notes">${esc(a.notes)}</textarea></div>
      </div>`;
  }

  // ----- Receiving: upload foto / dokumen evidence sample (belum / sudah dimarking) -----

  const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

  function fmtFileSize(bytes) {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  // Foto dari kamera bisa 5-12 MB; dikecilkan dulu supaya database tidak cepat penuh.
  async function prepareEvidenceFile(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.2 * 1024 * 1024) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob && blob.size < file.size) {
        return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
      }
    } catch (e) { /* pakai file asli */ }
    return file;
  }

  function evidenceTileHtml(f) {
    const url = `/api/work-order-files/${f.id}`;
    const isImage = f.mime_type.startsWith('image/');
    return `
      <div class="ev-tile">
        <a href="${url}" target="_blank" rel="noopener" class="ev-thumb" title="Buka ${esc(f.filename)}">
          ${isImage ? `<img src="${url}" alt="${esc(f.filename)}" loading="lazy">` : '<span class="ev-doc">PDF</span>'}
        </a>
        <div class="ev-meta"><span class="ev-name" title="${esc(f.filename)}">${esc(f.filename)}</span><small>${fmtFileSize(f.size_bytes)}</small></div>
        <button type="button" class="ev-del" data-ev-del="${f.id}" title="Hapus file" aria-label="Hapus file">&times;</button>
      </div>`;
  }

  function evidenceListHtml(label, files) {
    return `
      <div class="ev-list">
        <p class="ev-list-title">${esc(label)} <span>${files.length}</span></p>
        ${files.length ? `<div class="ev-tiles">${files.map(evidenceTileHtml).join('')}</div>` : '<p class="ev-empty">Belum ada file</p>'}
      </div>`;
  }

  function receivingEvidenceCardHtml() {
    return `
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Evidence Sample <span class="en">(foto / dokumen kondisi sampel, sebelum &amp; sesudah marking)</span></p>
          <button type="button" class="btn btn-sm" id="btnEvidencePrint">Cetak Lampiran Foto</button>
        </div>
        <input type="file" id="evFileInput" accept="image/*,application/pdf" multiple hidden>
        <div id="woEvidence"><p class="muted">Memuat evidence...</p></div>
        <p class="muted" style="margin-top:12px;">Format JPG / PNG / WEBP / GIF atau PDF, maksimal 10 MB per file. File langsung tersimpan saat diunggah (tidak perlu menekan Simpan).</p>
      </div>`;
  }

  function initReceivingEvidence(t) {
    const woId = t.work_order.id;
    const box = document.getElementById('woEvidence');
    const input = document.getElementById('evFileInput');
    if (!box || !input) return;
    const printBtn = document.getElementById('btnEvidencePrint');
    if (printBtn) printBtn.addEventListener('click', () => window.open(`/work-orders/${woId}/evidence/print`, '_blank'));
    let files = [];
    let target = null;

    const draw = () => {
      const forCoupon = (rowNo, state) => files.filter(f => f.coupon_row_no === rowNo && f.marking_state === state);
      const general = files.filter(f => f.coupon_row_no == null || !['before', 'after'].includes(f.marking_state));
      const couponGroups = t.items.map(it => `
        <div class="ev-group">
          <div class="ev-group-head">
            ${couponCellHtml(it)}
            <div class="ev-actions">
              <button type="button" class="btn btn-sm" data-ev-upload="${it.coupon_row_no}|before">+ Belum dimarking</button>
              <button type="button" class="btn btn-sm" data-ev-upload="${it.coupon_row_no}|after">+ Sudah dimarking</button>
            </div>
          </div>
          <div class="ev-lists">
            ${evidenceListHtml('Belum dimarking', forCoupon(it.coupon_row_no, 'before'))}
            ${evidenceListHtml('Sudah dimarking', forCoupon(it.coupon_row_no, 'after'))}
          </div>
        </div>`).join('');
      box.innerHTML = `
        ${couponGroups}
        <div class="ev-group">
          <div class="ev-group-head">
            <div class="task-id-cell"><strong>Dokumen umum</strong><span class="muted">Surat pengantar, berita acara, dll</span></div>
            <div class="ev-actions"><button type="button" class="btn btn-sm" data-ev-upload="|">+ Foto / Dokumen</button></div>
          </div>
          <div class="ev-lists">${evidenceListHtml('Dokumen umum', general)}</div>
        </div>`;

      box.querySelectorAll('[data-ev-upload]').forEach(btn => btn.addEventListener('click', () => {
        const [coupon, marking] = btn.dataset.evUpload.split('|');
        target = { coupon, marking };
        input.click();
      }));
      box.querySelectorAll('[data-ev-del]').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('Hapus file ini?')) return;
        try {
          await api(`/api/work-order-files/${btn.dataset.evDel}`, { method: 'DELETE' });
          files = files.filter(f => String(f.id) !== btn.dataset.evDel);
          draw();
        } catch (err) {
          toast(err.message, 'error');
        }
      }));
    };

    const load = async () => {
      try {
        files = (await api(`/api/work-orders/${woId}/files?task=receiving`)).files;
        draw();
      } catch (err) {
        box.innerHTML = `<p class="muted">Gagal memuat evidence: ${esc(err.message)}</p>`;
      }
    };

    // Upload langsung dikirim; jangan ikut menandai form tahap sebagai "belum disimpan".
    ['change', 'input'].forEach(evt => input.addEventListener(evt, e => e.stopPropagation()));
    input.addEventListener('change', async () => {
      const chosen = Array.from(input.files);
      input.value = '';
      if (!target || !chosen.length) return;
      const { coupon, marking } = target;
      box.classList.add('is-uploading');
      let uploaded = 0;
      for (const original of chosen) {
        const file = await prepareEvidenceFile(original);
        if (file.size > EVIDENCE_MAX_BYTES) { toast(`${original.name}: ukuran maksimal 10 MB`, 'error'); continue; }
        const qs = new URLSearchParams({ task: 'receiving', marking });
        if (coupon !== '') qs.set('coupon', coupon);
        try {
          await api(`/api/work-orders/${woId}/files?${qs}`, {
            method: 'POST',
            headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) },
            body: file
          });
          uploaded += 1;
        } catch (err) {
          toast(`${original.name}: ${err.message}`, 'error');
        }
      }
      box.classList.remove('is-uploading');
      if (uploaded) toast(`${uploaded} file diunggah`, 'success');
      await load();
    });

    load();
  }

  function woTaskFormHtml(t) {
    const { stage, extra } = t;
    const lockedBanner = t.locked
      ? `<div class="locked-banner"><span aria-hidden="true">&#128274;</span> Work Order sudah <strong>Complete</strong> &mdash; data tahap ini terkunci, tidak bisa diedit lagi setelah LHU diterbitkan.</div>`
      : '';
    const fieldsetOpen = `<fieldset class="task-fieldset"${t.locked ? ' disabled' : ''}>`;

    if (stage.key === 'released') {
      // Report Issued: kartu Informasi Penerbitan LHU + Ringkasan Approval/Final Check/Dokumen,
      // beda dari 4 tahap "form" lain (bukan sekadar extraFields di kartu generik).
      return `
        ${lockedBanner}
        <form id="woTaskForm">
          ${fieldsetOpen}
            ${releasedInfoCardHtml(t)}
            ${releasedBodyHtml(t)}
            <div id="woTaskProblems"></div>
            <div class="form-actions">
              <div><span class="muted">${stage.updated_at ? 'Terakhir disimpan: ' + esc(formatDateTimeID(stage.updated_at)) : 'Belum pernah disimpan'}</span></div>
              <div class="right">
                <button type="submit" class="btn" data-status="draft">Simpan Draft</button>
                <button type="submit" class="btn btn-primary" data-status="final">Terbitkan LHU</button>
              </div>
            </div>
          </fieldset>
        </form>`;
    }

    let extraFields = '';
    if (stage.key === 'receiving') {
      extraFields = `<div class="field"><label>Diserahkan oleh <span class="en">Delivered by</span></label><input type="text" name="delivered_by" value="${esc(extra.delivered_by)}" placeholder="Nama pengirim / kurir"></div>`;
    } else if (stage.key === 'reporting') {
      extraFields = `<div class="field"><label>No. Laporan <span class="en">Report No.</span></label><input type="text" name="report_no" value="${esc(extra.report_no)}"></div>`;
    }
    const body = { receiving: receivingBodyHtml, testing: testingBodyHtml, reporting: reportingBodyHtml,
      review: reviewBodyHtml }[stage.key](t)
      + (stage.key === 'receiving' ? receivingEvidenceCardHtml() : '');

    return `
      ${lockedBanner}
      <form id="woTaskForm">
        ${fieldsetOpen}
          <div class="card">
            <p class="section-title">Info Tahap ${esc(stage.label)}</p>
            <div class="form-grid">
              <div class="field"><label>PIC ${esc(stage.label)}</label>${woPicSelect(stage.pic)}</div>
              <div class="field"><label>${esc(stage.date_label)}</label><input type="date" name="task_date" value="${esc(stage.task_date)}"></div>
              ${extraFields}
              <div class="field full"><label>Catatan Tahap</label><textarea name="notes">${esc(stage.notes)}</textarea></div>
            </div>
          </div>
          ${body}
          ${stage.kind === 'approval' ? approvalCardHtml(t) : ''}
          <div id="woTaskProblems"></div>
          <div class="form-actions">
            <div><span class="muted">${stage.updated_at ? 'Terakhir disimpan: ' + esc(formatDateTimeID(stage.updated_at)) : 'Belum pernah disimpan'}</span></div>
            <div class="right">
              <button type="submit" class="btn" data-status="draft">Simpan sebagai Draft</button>
              <button type="submit" class="btn btn-primary" data-status="final">Simpan &amp; Selesaikan Tahap</button>
            </div>
          </div>
        </fieldset>
      </form>`;
  }

  function woTaskRailHtml(t) {
    const { work_order: wo, stages, stage } = t;
    const done = stages.filter(s => isStageDone(s.status)).length;
    const pct = Math.round((done / stages.length) * 100);
    return `
      <aside class="card tw-rail">
        <div class="tw-rail-head">
          <span class="wo-task-eyebrow">Work Order</span>
          <strong>${esc(wo.job_number)}</strong>
          <span class="muted">${esc(wo.company) || '-'}</span>
          <span class="muted">${esc(wo.project_name) || '-'}</span>
          <div class="wo-progress-bar" style="margin-top:12px;"><div style="width:${pct}%"></div></div>
          <span class="muted">${done} dari ${stages.length} tahap selesai</span>
        </div>
        <nav class="tw-stages">
          ${stages.map((s, i) => `
            <button type="button" class="tw-stage st-${s.status}${s.key === stage.key ? ' active' : ''}" data-wo-stage="${s.key}">
              <span class="tw-stage-dot">${stageDot(s.status, i)}</span>
              <span class="tw-stage-text"><strong>${esc(s.label)}</strong><small>${esc(s.hint)}</small></span>
            </button>`).join('')}
        </nav>
      </aside>`;
  }

  function renderWoTask() {
    const t = state.woTask;
    if (!t) { state.view = 'wo-list'; render(); return; }
    state.woTaskDirty = false;
    const { work_order: wo, stage } = t;

    pageTitle.textContent = 'Tasks';
    pageSubtitle.textContent = `Work Order ${wo.job_number} — ${stage.label}`;
    topbarActions.innerHTML = `
      <button class="btn" id="btnTaskAll">Semua Tasks</button>
      <button class="btn" id="btnTaskBack">Detail Work Order</button>
    `;
    document.getElementById('btnTaskAll').addEventListener('click', () => {
      if (!confirmLeaveTask()) return;
      state.view = 'wo-tasks'; render();
    });
    document.getElementById('btnTaskBack').addEventListener('click', () => {
      if (!confirmLeaveTask()) return;
      openWorkOrderForm(wo.id);
    });

    contentEl.innerHTML = `
      <div class="tw">
        ${woTaskRailHtml(t)}
        <section class="tw-main">
          <div class="tw-stage-head">
            <span class="wo-stage-icon">${WO_STAGE_ICONS[stage.key]}</span>
            <div><h2>${esc(stage.label)}</h2><p class="muted">${esc(stage.hint)}</p></div>
            ${stagePill(stage.status)}
          </div>
          ${stage.kind === 'derived' ? preparationBodyHtml(t) : woTaskFormHtml(t)}
        </section>
      </div>
    `;

    contentEl.querySelectorAll('.tw-rail [data-wo-stage]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.woStage === stage.key || !confirmLeaveTask()) return;
      openWoTask(wo.id, btn.dataset.woStage);
    }));
    contentEl.querySelectorAll('[data-open-sheet]').forEach(btn => btn.addEventListener('click', () => {
      if (!confirmLeaveTask()) return;
      openSpecimenForm(btn.dataset.openSheet);
    }));
    contentEl.querySelectorAll('[data-open-report]').forEach(btn => btn.addEventListener('click', () => {
      if (!confirmLeaveTask()) return;
      openTestReportForm(btn.dataset.openReport, wo.id, stage.key);
    }));
    contentEl.querySelectorAll('[data-create-report]').forEach(btn => btn.addEventListener('click', () => {
      if (!confirmLeaveTask()) return;
      createTestReportForRow(wo.id, btn.dataset.coupon, btn.dataset.test, stage.key);
    }));

    if (stage.kind === 'derived') bindWoPreparationEvents(t);
    else bindWoTaskFormEvents(t);
    bindSheetShortcuts(t);
    if (stage.key === 'receiving') initReceivingEvidence(t);
  }

  // Pintasan ke modul Pengecekan Spesimen dari Preparation & Testing. "Buat Sheet" membawa
  // Permintaan Uji + coupon + jenis pengujian ke wizard pembuat sheet.
  function bindSheetShortcuts(t) {
    const go = (prefill) => {
      if (!confirmLeaveTask()) return;
      state.view = 'specimen-list';
      if (prefill) {
        state.specimenCreatorOpen = true;
        state.specimenCreatorPrefill = { requestId: t.work_order.test_request_id, ...prefill };
      }
      render();
    };
    const list = document.getElementById('btnGotoSpecimenList');
    if (list) list.addEventListener('click', () => go(null));
    contentEl.querySelectorAll('[data-create-sheet]').forEach(btn => btn.addEventListener('click', () =>
      go({ couponRowNo: btn.dataset.coupon, testName: btn.dataset.test })));
  }

  // ---------- Lembar Hasil Uji (tahap Testing) ----------
  // Beda dari Pengecekan Spesimen (marking/cutting/machining, milik tahap Preparation): sheet ini
  // langsung berfungsi sebagai Laporan Hasil Uji — sekali diisi & difinalisasi, halaman yang sama
  // yang diekspor jadi PDF. category='bending' memakai isian sesuai form resmi Detech
  // (DE.1/TR/02/BEND.SEC); kategori lain memakai isian umum sampai form resminya ada.

  const RESULT_OPTIONS = [['', 'Belum ada hasil'], ['accepted', 'Accepted'], ['rejected', 'Rejected']];

  async function createTestReportForRow(woId, couponRowNo, testName, stageKey) {
    try {
      const created = await api(`/api/work-orders/${woId}/test-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_row_no: Number(couponRowNo), test_name: testName })
      });
      toast('Lembar Hasil Uji dibuat', 'success');
      openTestReportLoaded(created, woId, stageKey);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function openTestReportForm(id, woId, stageKey) {
    state.view = 'test-report-form';
    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;
    try {
      const data = await api(`/api/test-reports/${id}`);
      openTestReportLoaded(data, woId, stageKey);
    } catch (e) {
      toast(e.message, 'error');
      openWoTask(woId, stageKey);
    }
  }

  function openTestReportLoaded(data, woId, stageKey) {
    state.view = 'test-report-form';
    state.testReport = data;
    state.testReportElements = { ...((data.fields || {}).elements || {}) };
    state.testReportFerrite = JSON.parse(JSON.stringify((data.fields || {}).ferrite || {}));
    state.testReportRows = (data.rows && data.rows.length) ? data.rows.map(r => ({ ...r })) : [{ marking_specimen: '', observation: '', result: '' }];
    state.testReportDirty = false;
    state.testReportReturn = { woId, stageKey };
    render();
  }

  function confirmLeaveTestReport() {
    return !state.testReportDirty || confirm('Perubahan pada Lembar Hasil Uji ini belum disimpan. Tetap pindah halaman?');
  }

  function blankTestReportRow() {
    if (state.testReport && state.testReport.template === 'flat') return { marking_specimen: '', length: '', od: '', wt: '', e: '', h: '', first: '', second: '' };
    if (state.testReport && state.testReport.template_fwb) return { marking_specimen: '', remarks: [], result: '' };
    if (state.testReport && state.testReport.category === 'charpy') {
      const last = state.testReportRows[state.testReportRows.length - 1];
      return { marking_specimen: '', notch_position: last ? last.notch_position : '', impact: '', lateral: '', remarks: '' };
    }
    return { marking_specimen: '', observation: '', result: '' };
  }

  const CHARPY_NOTCH_POSITIONS = ['Weld Center Line', 'Base Metal', 'HAZ', 'Fusion Line', 'Fusion Line + 2 mm'];

  function testReportRowsHtml() {
    if (state.testReport && state.testReport.template === 'flat') {
      const cols = [['length', 'Length of Pipe (mm)'], ['od', 'Outside Diameter D (mm)'], ['wt', 'Wall Thickness t (mm)'], ['e', 'Deformation e'], ['h', 'H (mm) — kosong = dihitung'], ['first', 'First Step Test Result'], ['second', 'Second Step Test Result']];
      return `<table class="task-table">
        <thead><tr><th>Specimen No.</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead>
        <tbody>${state.testReportRows.map((r, idx) => `
          <tr data-trow="${idx}">
            <td><input type="text" data-tfield="marking_specimen" value="${esc(r.marking_specimen)}"></td>
            ${cols.map(c => `<td><input type="text" ${['first', 'second'].includes(c[0]) ? '' : 'inputmode="decimal"'} data-tfield="${c[0]}" value="${esc(r[c[0]] || '')}"></td>`).join('')}
            <td><button type="button" class="btn btn-sm btn-danger" data-trow-remove="${idx}">&#128465;</button></td>
          </tr>`).join('')}</tbody>
      </table>
      <p class="muted" style="margin:6px 0 0;">H dihitung otomatis dari D, t dan e (H = (1+e)t / (e + t/D)); isi kolom H hanya bila ingin menimpa. Satu halaman cetak memuat 2 spesimen; spesimen berikutnya dicetak di halaman lanjutan.</p>`;
    }
    if (state.testReport && state.testReport.template_fwb) {
      const sel = document.getElementById('testReportTemplate');
      const key = (sel && sel.value) || state.testReport.template;
      const crit = state.testReport.template_fwb[key] || [];
      return `<table class="task-table">
        <thead><tr><th>Specimen No.</th>${crit.map((c, i) => `<th>Remarks ${i + 1}</th>`).join('')}<th>Test Result</th><th></th></tr></thead>
        <tbody>${state.testReportRows.map((r, idx) => `
          <tr data-trow="${idx}">
            <td><input type="text" data-tfield="marking_specimen" value="${esc(r.marking_specimen)}"></td>
            ${crit.map((c, i) => `<td><input type="text" data-tremark="${i}" value="${esc((r.remarks || [])[i] || '')}" placeholder="${esc(c)}"></td>`).join('')}
            <td><select data-tfield="result">${woSelectOptions(RESULT_OPTIONS, r.result)}</select></td>
            <td><button type="button" class="btn btn-sm btn-danger" data-trow-remove="${idx}">&#128465;</button></td>
          </tr>`).join('')}</tbody>
      </table>
      <p class="muted" style="margin:6px 0 0;">Kriteria penerimaan sudah tercetak dari form standar. Remarks yang dikosongkan memakai teks bawaan form (abu-abu).</p>`;
    }
    if (state.testReport && state.testReport.category === 'charpy') {
      return `<datalist id="charpyNotchList">${CHARPY_NOTCH_POSITIONS.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <table class="task-table">
        <thead><tr><th>Specimen No.</th><th>V-Notch Position</th><th>Impact Value (J)</th><th>Lateral Expansion (mm)</th><th>Remarks</th><th></th></tr></thead>
        <tbody>${state.testReportRows.map((r, idx) => `
          <tr data-trow="${idx}">
            <td><input type="text" data-tfield="marking_specimen" value="${esc(r.marking_specimen)}"></td>
            <td><input type="text" list="charpyNotchList" data-tfield="notch_position" value="${esc(r.notch_position)}"></td>
            <td><input type="text" inputmode="decimal" data-tfield="impact" value="${esc(r.impact)}"></td>
            <td><input type="text" inputmode="decimal" data-tfield="lateral" value="${esc(r.lateral)}"></td>
            <td><input type="text" data-tfield="remarks" value="${esc(r.remarks)}" placeholder="-"></td>
            <td><button type="button" class="btn btn-sm btn-danger" data-trow-remove="${idx}">&#128465;</button></td>
          </tr>`).join('')}</tbody>
      </table>
      <p class="muted" style="margin:6px 0 0;">Baris dengan V-Notch Position yang sama berurutan dicetak sebagai satu blok; Average dihitung otomatis per blok. Form EQT: dari 5 spesimen, nilai tertinggi &amp; terendah dibuang untuk Average.</p>`;
    }
    return `<table class="task-table">
      <thead><tr><th>Specimen No.</th><th>Observation</th><th>Result</th><th></th></tr></thead>
      <tbody>${state.testReportRows.map((r, idx) => `
        <tr data-trow="${idx}">
          <td><input type="text" data-tfield="marking_specimen" value="${esc(r.marking_specimen)}" placeholder="mis. ABN.9.1-BR1"></td>
          <td><input type="text" data-tfield="observation" value="${esc(r.observation)}" placeholder="Observation"></td>
          <td><select data-tfield="result">${woSelectOptions(RESULT_OPTIONS, r.result)}</select></td>
          <td><button type="button" class="btn btn-sm btn-danger" data-trow-remove="${idx}">&#128465;</button></td>
        </tr>`).join('')}</tbody>
    </table>`;
  }

  function rerenderTestReportRows() {
    document.getElementById('testReportRowsWrap').innerHTML = testReportRowsHtml();
    bindTestReportRowEvents();
  }

  function bindTestReportRowEvents() {
    const wrap = document.getElementById('testReportRowsWrap');
    wrap.addEventListener('input', handleTestReportRowInput);
    wrap.addEventListener('change', handleTestReportRowInput);
    wrap.querySelectorAll('[data-trow-remove]').forEach(btn => btn.addEventListener('click', () => {
      if (state.testReportRows.length <= 1) { toast('Minimal harus ada 1 baris', 'error'); return; }
      state.testReportRows.splice(Number(btn.dataset.trowRemove), 1);
      state.testReportDirty = true;
      rerenderTestReportRows();
    }));
  }

  function handleTestReportRowInput(e) {
    const idx = e.target.dataset.trow !== undefined ? e.target.dataset.trow : e.target.closest('[data-trow]')?.dataset.trow;
    if (idx === undefined) return;
    const row = state.testReportRows[Number(idx)];
    if (row && e.target.dataset.tremark !== undefined) {
      row.remarks = row.remarks || [];
      row.remarks[Number(e.target.dataset.tremark)] = e.target.value;
      state.testReportDirty = true;
      return;
    }
    if (!row || !e.target.dataset.tfield) return;
    row[e.target.dataset.tfield] = e.target.value;
    state.testReportDirty = true;
  }

  function testReportBendFieldsHtml(r) {
    const pair = (label, codeName, actualName, codeVal, actualVal, placeholder) => `
      <div class="field"><label>${esc(label)} <span class="en">Code</span></label><input type="text" name="${codeName}" value="${esc(codeVal)}" placeholder="${esc(placeholder || '')}"></div>
      <div class="field"><label>${esc(label)} <span class="en">Actual</span></label><input type="text" name="${actualName}" value="${esc(actualVal)}"></div>`;
    return `
      <div class="card">
        <p class="section-title">Dimensi Pengujian Bend <span class="en">sesuai form DE.1/TR/02/BEND.SEC</span></p>
        <div class="form-grid">
          ${pair('Test Specimen Width (mm)', 'specimen_width_code', 'specimen_width_actual', r.specimen_width_code, r.specimen_width_actual)}
          ${pair('Former Diameter (mm)', 'former_diameter_code', 'former_diameter_actual', r.former_diameter_code, r.former_diameter_actual)}
          ${pair('Bend Angle (Degree)', 'bend_angle_code', 'bend_angle_actual', r.bend_angle_code, r.bend_angle_actual, '180')}
          ${pair('Shoulder Distance (mm)', 'shoulder_distance_code', 'shoulder_distance_actual', r.shoulder_distance_code, r.shoulder_distance_actual)}
        </div>
      </div>`;
  }

  function testReportCharpyFieldsHtml(r) {
    const f = r.fields || {};
    return `
      <div class="card">
        <p class="section-title">Spesimen Charpy <span class="en">sesuai form DE.1/TR/05 &amp; 06 CHARPY</span></p>
        <div class="form-grid">
          <div class="field"><label>Specimen Size (mm)</label><input type="text" name="field_specimen_size" value="${esc(f.specimen_size)}"></div>
          <div class="field"><label>Test Temp (&deg;C)</label><input type="text" name="field_test_temp" value="${esc(f.test_temp)}" placeholder="mis. -20"></div>
          <div class="field"><label>Sample Orientation</label><input type="text" name="field_orientation" list="charpyOrientList" value="${esc(f.orientation)}">
            <datalist id="charpyOrientList"><option value="Transversal"><option value="Longitudinal"></datalist></div>
        </div>
      </div>`;
  }

  // Form Chemical: satu isian per elemen (daftar elemen mengikuti varian form yang dipilih).
  function testReportElementsHtml(templateKey) {
    const labels = ((state.testReport || {}).template_elements || {})[templateKey] || [];
    return `<div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr));">${labels.map(l => `
      <div class="field"><label>${esc(l)}</label><input type="text" inputmode="decimal" data-element="${esc(l)}" value="${esc(state.testReportElements[l] || '')}" placeholder="%"></div>`).join('')}</div>`;
  }

  // Form Ferrite: tiap lokasi (Base Metal / HAZ / Weld Metal) punya n, PT dan hitungan titik Pi per medan.
  function testReportFerriteHtml(templateKey) {
    const locs = ((state.testReport || {}).template_locations || {})[templateKey] || [];
    return locs.map(name => {
      const d = state.testReportFerrite[name] || {};
      const pi = d.pi || [];
      return `<div class="ferrite-loc" data-floc="${esc(name)}" style="margin-bottom:16px;">
        <p class="section-title" style="margin-top:0;">${esc(name)}</p>
        <div class="form-grid">
          <div class="field"><label>n <span class="en">jumlah medan (maks. 30)</span></label><input type="text" inputmode="numeric" data-ffield="n" value="${esc(d.n || '30')}"></div>
          <div class="field"><label>PT <span class="en">jumlah titik pada grid</span></label><input type="text" inputmode="numeric" data-ffield="pt" value="${esc(d.pt || '16')}"></div>
        </div>
        <label style="display:block;margin:8px 0 4px;">Pi per medan <span class="en">(hitungan titik yang kena ferrit, medan 1&ndash;30)</span></label>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;">${Array.from({ length: 30 }, (_, i) => `
          <div class="field" style="margin:0;"><label style="font-size:11px;">${i + 1}</label><input type="text" inputmode="decimal" data-fpi="${i}" value="${esc(pi[i] || '')}"></div>`).join('')}</div>
      </div>`;
    }).join('');
  }

  function bindTestReportFerriteEvents() {
    const wrap = document.getElementById('testReportFerriteWrap');
    if (!wrap) return;
    wrap.addEventListener('input', e => {
      const loc = e.target.closest('[data-floc]');
      if (!loc) return;
      const name = loc.dataset.floc;
      const d = state.testReportFerrite[name] || (state.testReportFerrite[name] = { n: '30', pt: '16', pi: [] });
      if (e.target.dataset.ffield) d[e.target.dataset.ffield] = e.target.value;
      else if (e.target.dataset.fpi !== undefined) { d.pi = d.pi || []; d.pi[Number(e.target.dataset.fpi)] = e.target.value; }
      state.testReportDirty = true;
    });
  }

  function bindTestReportElementEvents() {
    const wrap = document.getElementById('testReportElementsWrap');
    if (!wrap) return;
    wrap.addEventListener('input', e => {
      if (!e.target.dataset.element) return;
      state.testReportElements[e.target.dataset.element] = e.target.value;
      state.testReportDirty = true;
    });
  }

  function renderTestReportForm() {
    const r = state.testReport || {};
    const tr = r.test_request || {};
    const coupon = r.coupon || {};
    const sig = r.approved_signatory;

    pageTitle.textContent = 'Lembar Hasil Uji';
    pageSubtitle.textContent = `${r.title || ''} — ${esc(tr.job_number || '')}`;
    topbarActions.innerHTML = `
      <button class="btn" id="btnReportBack">&larr; Kembali ke Testing</button>
      <button type="button" class="btn" id="btnReportExportPdf">Export PDF</button>
    `;
    document.getElementById('btnReportBack').addEventListener('click', () => {
      if (!confirmLeaveTestReport()) return;
      openWoTask(state.testReportReturn.woId, state.testReportReturn.stageKey);
    });
    document.getElementById('btnReportExportPdf').addEventListener('click', () =>
      window.open(`/test-reports/${r.id}/print`, '_blank'));

    contentEl.innerHTML = `
      <form id="testReportForm">
        <div class="card">
          <p class="section-title">Info Pengujian <span class="en">(hanya baca, dari Permintaan Uji &amp; Work Order)</span></p>
          <div class="info-facts">
            ${infoFactHtml('No. Pekerjaan', esc(tr.job_number) || '-')}
            ${infoFactHtml('Perusahaan', esc(tr.company) || '-')}
            ${infoFactHtml('Nama Projek', esc(tr.project_name) || '-')}
            ${infoFactHtml('Coupon', esc(coupon.label) || '-')}
            ${infoFactHtml('Sample Marking', esc(r.sample_marking) || '-')}
            ${infoFactHtml('Jenis Pengujian', esc(r.test_name) || '-')}
            ${infoFactHtml('Qty', esc(r.qty) || '-')}
            ${infoFactHtml('WPS No', esc(coupon.no_wps) || '-')}
            ${infoFactHtml('Material Type/Grade', esc(coupon.material_type_grade) || '-')}
            ${infoFactHtml('Material Size', esc(coupon.material_size) || '-')}
            ${infoFactHtml('Test Weldment Thickness', esc(coupon.thickness) || '-')}
            ${infoFactHtml('Welding Position', esc(coupon.welding_position) || '-')}
            ${infoFactHtml('Welding Process', esc(coupon.welding_process) || '-')}
          </div>
        </div>

        ${(r.template_options || []).length ? `
        <div class="card">
          <p class="section-title">Form Laporan <span class="en">format cetak mengikuti form resmi Detech</span></p>
          <div class="form-grid">
            <div class="field full"><label>Jenis Form</label>
              <select name="template" id="testReportTemplate">${r.template_options.map(o => `<option value="${esc(o.key)}" ${o.key === r.template ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
              <small class="muted">Default dipilih dari data coupon: ada WPS / proses las &rarr; Weld, selain itu Material.</small></div>
          </div>
        </div>` : ''}

        <div class="card">
          <p class="section-title">Info Laporan</p>
          <div class="form-grid">
            <div class="field"><label>No. Laporan <span class="en">Report No.</span></label><input type="text" name="report_no" value="${esc(r.report_no)}"></div>
            <div class="field"><label>Tanggal Diuji <span class="en">Date of Tested</span></label><input type="date" name="date_tested" value="${esc(r.date_tested)}"></div>
            <div class="field"><label>Environment Temp</label><input type="text" name="environment_temp" value="${esc(r.environment_temp)}" placeholder="25 &plusmn; 2 &deg;C"></div>
            <div class="field"><label>Test Method</label><input type="text" name="test_method" value="${esc(r.test_method) || esc(r.method)}"></div>
            <div class="field"><label>Reference Code</label><input type="text" name="reference_code" value="${esc(r.reference_code)}"></div>
            <div class="field"><label>Testing Purpose</label><input type="text" name="testing_purpose" value="${esc(r.testing_purpose)}"></div>
            ${(r.template_options || []).length ? `
            <div class="field"><label>PQR No <span class="en">form Weld</span></label><input type="text" name="pqr_no" value="${esc(r.pqr_no)}"></div>
            <div class="field"><label>Heat No</label><input type="text" name="heat_no" value="${esc(r.heat_no)}"></div>` : ''}
          </div>
        </div>

        ${r.category === 'bending' ? testReportBendFieldsHtml(r) : ''}
        ${r.category === 'charpy' ? testReportCharpyFieldsHtml(r) : ''}

        ${r.template_locations ? `
        <div class="card">
          <p class="section-title">Ferrite Content <span class="en">dicetak sebagai halaman utama + Lampiran #16 per lokasi; rata-rata, s, 95% CI &amp; % RA dihitung otomatis</span></p>
          <div class="form-grid"><div class="field"><label>Sample Identification</label><input type="text" name="field_sample_id" value="${esc((r.fields || {}).sample_id)}"></div></div>
          <div id="testReportFerriteWrap" style="margin-top:12px;">${testReportFerriteHtml(r.template)}</div>
        </div>` : ''}
        ${r.template_elements ? `
        <div class="card">
          <p class="section-title">Elements Analyzed (%) <span class="en">isi hanya elemen yang terukur; kolom kosong tercetak kosong</span></p>
          <div id="testReportElementsWrap">${testReportElementsHtml(r.template)}</div>
        </div>` : (r.template_locations ? '' : `
        <div class="card">
          <p class="section-title">Hasil per Spesimen</p>
          <div id="testReportRowsWrap">${testReportRowsHtml()}</div>
          <button type="button" class="btn btn-sm" id="btnAddReportRow" style="margin-top:10px;">+ Tambah Baris</button>
        </div>`)}

        <div class="card">
          <p class="section-title">Info Tambahan</p>
          <div class="form-grid">
            <div class="field"><label>Testing Machine Used</label><input type="text" name="testing_machine" value="${esc(r.testing_machine)}" placeholder="Hydraulic Press Machine, Capacity : 400 Bar"></div>
            <div class="field"><label>Welder's Name</label><input type="text" name="welder_name" value="${esc(r.welder_name)}"></div>
            <div class="field"><label>Witnessed By</label><input type="text" name="witnessed_by" value="${esc(r.witnessed_by)}"></div>
            <div class="field"><label>Test Conducted by</label><input type="text" name="test_conducted_by" value="${esc(r.test_conducted_by) || esc(r.testing_pic)}"></div>
            <div class="field full"><label>Remarks</label><textarea name="remarks">${esc(r.remarks)}</textarea></div>
          </div>
        </div>

        <div class="card">
          <p class="section-title">Approval <span class="en">diisi otomatis dari tahap Review &amp; Approval</span></p>
          ${sig ? `
            <div class="info-facts">
              ${infoFactHtml('Approved Signatory', esc(sig.name) || '-')}
              ${infoFactHtml('Status', sig.status === 'approved' ? 'Disetujui' : (sig.status === 'rejected' ? 'Ditolak' : 'Menunggu'))}
            </div>
            ${sig.signature ? `<img src="${sig.signature}" alt="Tanda tangan" style="max-height:70px; margin-top:8px;">` : ''}
          ` : '<p class="muted">Belum ada approval dari tahap Review &amp; Approval.</p>'}
        </div>

        <div class="form-actions">
          <div><button type="button" class="btn btn-danger" id="btnReportDelete">Hapus</button></div>
          <div class="right">
            <button type="submit" class="btn" data-status="draft">Simpan sebagai Draft</button>
            <button type="submit" class="btn btn-primary" data-status="final">Simpan &amp; Finalisasi</button>
          </div>
        </div>
      </form>`;

    bindTestReportFormEvents();
  }

  function bindTestReportFormEvents() {
    const form = document.getElementById('testReportForm');
    const markDirty = () => { state.testReportDirty = true; };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    form.querySelectorAll('button[type="submit"]').forEach(b => {
      b.addEventListener('click', () => { state.testReportPendingStatus = b.dataset.status; });
    });
    form.addEventListener('submit', onTestReportSubmit);

    const addRowBtn = document.getElementById('btnAddReportRow');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => {
        state.testReportRows.push(blankTestReportRow());
        state.testReportDirty = true;
        rerenderTestReportRows();
      });
      bindTestReportRowEvents();
    }
    bindTestReportElementEvents();
    bindTestReportFerriteEvents();

    // Ganti varian form (Weld <-> Material): observasi bawaan ikut berganti selama belum diubah manual.
    const tplSel = document.getElementById('testReportTemplate');
    if (tplSel) {
      const DEFAULT_OBS = { 'bend-sec': 'No Open Discontinuity was Observed', 'bend-mat': 'No Crack was Observed' };
      let prev = tplSel.value;
      tplSel.addEventListener('change', () => {
        const elWrap = document.getElementById('testReportElementsWrap');
        if (elWrap) elWrap.innerHTML = testReportElementsHtml(tplSel.value);
        const ferWrap = document.getElementById('testReportFerriteWrap');
        if (ferWrap) ferWrap.innerHTML = testReportFerriteHtml(tplSel.value);   // data tersimpan per nama lokasi   // nilai tersimpan per label elemen, jadi ikut terbawa
        if (state.testReport.template_fwb) rerenderTestReportRows();
        const oldObs = DEFAULT_OBS[prev], newObs = DEFAULT_OBS[tplSel.value];
        if (oldObs && newObs) {
          state.testReportRows.forEach(row => { if (row.observation === oldObs) row.observation = newObs; });
          rerenderTestReportRows();
        }
        prev = tplSel.value;
      });
    }

    document.getElementById('btnReportDelete').addEventListener('click', () => deleteTestReport(state.testReport.id));
  }

  async function onTestReportSubmit(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.fields = state.testReport && state.testReport.template_elements ? { elements: state.testReportElements }
      : (state.testReport && state.testReport.template_locations ? { ferrite: state.testReportFerrite } : {});
    Object.keys(payload).filter(k => k.startsWith('field_')).forEach(k => { payload.fields[k.slice(6)] = payload[k]; delete payload[k]; });
    payload.status = state.testReportPendingStatus || 'draft';
    payload.rows = state.testReportRows;
    try {
      state.testReport = await api(`/api/test-reports/${state.testReport.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      state.testReportRows = state.testReport.rows.map(r => ({ ...r }));
      state.testReportElements = { ...((state.testReport.fields || {}).elements || {}) };
      state.testReportFerrite = JSON.parse(JSON.stringify((state.testReport.fields || {}).ferrite || {}));
      state.testReportDirty = false;
      toast(payload.status === 'final' ? 'Lembar Hasil Uji difinalisasi' : 'Draft tersimpan', 'success');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function deleteTestReport(id) {
    if (!confirm('Hapus Lembar Hasil Uji ini? Tindakan tidak dapat dibatalkan.')) return;
    try {
      await api(`/api/test-reports/${id}`, { method: 'DELETE' });
      toast('Lembar Hasil Uji dihapus', 'success');
      state.testReportDirty = false;
      openWoTask(state.testReportReturn.woId, state.testReportReturn.stageKey);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function bindWoPreparationEvents(t) {
    document.querySelectorAll('[data-machining]').forEach(btn => btn.addEventListener('click', async () => {
      const action = btn.dataset.machining;
      if (action === 'reopen' && !confirm('Buka kembali machining? Status kembali menjadi "Sedang machining".')) return;
      btn.disabled = true;
      try {
        state.woTask = await api(`/api/work-orders/${t.work_order.id}/machining`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
        toast({ start: 'Machining dimulai', finish: 'Machining selesai — spesimen siap diinspeksi', reopen: 'Machining dibuka kembali' }[action], 'success');
        state.queueCountsAt = 0;
        render();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    }));

    document.getElementById('woPrepForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        state.woTask = await api(`/api/work-orders/${t.work_order.id}/tasks/preparation`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pic: e.target.pic.value })
        });
        toast('PIC Preparation tersimpan', 'success');
        render();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function bindWoTaskFormEvents(t) {
    const form = document.getElementById('woTaskForm');
    initSignaturePads();

    const markDirty = () => { state.woTaskDirty = true; };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    form.querySelectorAll('canvas.signature-pad').forEach(c => c.addEventListener('pointerup', markDirty));
    form.querySelectorAll('[data-sig-clear]').forEach(b => b.addEventListener('click', markDirty));

    form.querySelectorAll('button[type="submit"]').forEach(b => {
      b.addEventListener('click', () => { state.woTaskPendingStatus = b.dataset.status; });
    });
    form.addEventListener('submit', onWoTaskSubmit);

    const markAllReceived = document.getElementById('btnMarkAllReceived');
    if (markAllReceived) markAllReceived.addEventListener('click', () => {
      form.querySelectorAll('[data-task-row]').forEach(tr => {
        const yes = tr.querySelector('input[data-f="received"][value="Y"]');
        if (yes) yes.checked = true;
        const cond = tr.querySelector('select[data-f="condition"]');
        if (cond && !cond.value) cond.value = 'Baik';
      });
      markDirty();
    });

    const markAllTested = document.getElementById('btnMarkAllTested');
    if (markAllTested) markAllTested.addEventListener('click', () => {
      form.querySelectorAll('[data-task-row] select[data-f="status"]').forEach(sel => { sel.value = 'selesai'; });
      markDirty();
    });

    const gotoTesting = document.getElementById('btnGotoTesting');
    if (gotoTesting) gotoTesting.addEventListener('click', () => {
      if (!confirmLeaveTask()) return;
      openWoTask(t.work_order.id, 'testing');
    });

    form.querySelectorAll('[data-open-wo-print]').forEach(btn => btn.addEventListener('click', () => {
      window.open(`/work-orders/${btn.dataset.openWoPrint}/print`, '_blank');
    }));
  }

  async function onWoTaskSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const t = state.woTask;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.status = state.woTaskPendingStatus || 'draft';

    payload.items = Array.from(form.querySelectorAll('[data-task-row]')).map(tr => {
      const item = { key: tr.dataset.key };
      tr.querySelectorAll('[data-f]').forEach(el => {
        if (el.type === 'radio') { if (el.checked) item[el.dataset.f] = el.value; }
        else item[el.dataset.f] = el.value;
      });
      return item;
    });
    payload.checks = {};
    form.querySelectorAll('input[data-check]:checked').forEach(el => { payload.checks[el.dataset.check] = el.value; });
    form.querySelectorAll('canvas.signature-pad').forEach(canvas => {
      payload[canvas.dataset.sig] = canvas.dataset.hasSignature === 'true' ? canvas.toDataURL('image/png') : '';
    });

    const problemsEl = document.getElementById('woTaskProblems');
    problemsEl.innerHTML = '';
    try {
      state.woTask = await api(`/api/work-orders/${t.work_order.id}/tasks/${t.stage.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      toast(payload.status === 'final' ? `Tahap ${t.stage.label} diselesaikan` : 'Draft tersimpan', 'success');
      state.queueCountsAt = 0;
      render();
    } catch (err) {
      if (Array.isArray(err.problems) && err.problems.length) {
        problemsEl.innerHTML = `
          <div class="task-problems">
            <strong>Tahap ${esc(t.stage.label)} belum bisa diselesaikan:</strong>
            <ul>${err.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
            <span class="muted">Lengkapi hal di atas, atau simpan sebagai Draft dulu.</span>
          </div>`;
        problemsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Tahap belum bisa diselesaikan — lihat daftar di bawah', 'error');
      } else {
        toast(err.message, 'error');
      }
    }
  }

  // ----- Tasks: ringkasan semua Work Order -----

  async function renderWoTasks() {
    pageTitle.textContent = 'Tasks';
    pageSubtitle.textContent = 'Pengerjaan tiap Work Order — Receiving hingga Report Issued';
    topbarActions.innerHTML = '';
    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;

    let data;
    try {
      data = await api('/api/work-order-progress');
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat data: ${esc(e.message)}</p></div>`;
      return;
    }
    const { stages, rows } = data;

    if (!rows.length) {
      contentEl.innerHTML = `
        <div class="card empty-state">
          <p class="card-title">Belum ada Work Order</p>
          <p class="card-desc">Tasks muncul setelah ada Work Order — buat dari Permintaan Uji yang sudah Final.</p>
        </div>`;
      return;
    }

    const currentKey = r => { const s = r.stages.find(x => !isStageDone(x.status)); return s ? s.key : 'done'; };
    const counts = {};
    rows.forEach(r => { const k = currentKey(r); counts[k] = (counts[k] || 0) + 1; });
    const inProgress = rows.filter(r => currentKey(r) !== 'done').length;

    contentEl.innerHTML = `
      <div class="card" style="padding-bottom:8px;">
        <p class="card-title">Posisi Work Order saat ini</p>
        <p class="card-desc" style="margin-bottom:14px;">${inProgress} Work Order sedang berjalan &middot; ${counts.done || 0} sudah selesai semua tahap</p>
        <div class="pipe-strip">
          ${stages.map(s => `
            <div class="pipe-cell" title="${esc(s.hint)}">
              <span class="pipe-icon">${WO_STAGE_ICONS[s.key]}</span>
              <span class="pipe-count">${counts[s.key] || 0}</span>
              <span class="pipe-label">${esc(s.label)}</span>
            </div>`).join('')}
          <div class="pipe-cell done">
            <span class="pipe-icon">&#127937;</span>
            <span class="pipe-count">${counts.done || 0}</span>
            <span class="pipe-label">Selesai</span>
          </div>
        </div>
      </div>

      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar Progress Work Order</p>
          <p class="card-desc">Klik kotak status untuk langsung membuka form tahapnya</p>
        </div>
        <div id="woTasksTableArea"></div>
        <div class="tk-legend">
          ${['final', 'draft', 'pending', 'rejected', 'na'].map(st =>
            `<span><span class="tk-chip tk-chip-static st-${st}">${STAGE_STATUS_GLYPH[st]}</span> ${esc(STAGE_STATUS_LABELS[st])}</span>`).join('')}
        </div>
      </div>`;

    renderSearchablePaginatedTable({
      key: 'wo-tasks',
      containerEl: document.getElementById('woTasksTableArea'),
      allRows: rows,
      searchFields: ['job_number', 'company', 'project_name'],
      searchPlaceholder: 'Cari No. Pekerjaan, Perusahaan, atau Nama Projek...',
      renderTableHtml: (pageRows) => `
        <table class="data-table">
          <thead><tr>
            <th>Work Order</th>
            ${stages.map(s => `<th class="tk-th">${esc(s.label)}</th>`).join('')}
            <th>Progress</th><th></th>
          </tr></thead>
          <tbody>${pageRows.map(r => `
            <tr>
              <td><strong>${esc(r.job_number)}</strong><br><span class="muted">${esc(r.company)}${r.project_name ? ' &middot; ' + esc(r.project_name) : ''}</span></td>
              ${r.stages.map(s => `
                <td class="tk-td"><button type="button" class="tk-chip st-${s.status}" data-open-task="${r.work_order_id}:${s.key}"
                  title="${esc(s.label)} — ${esc(STAGE_STATUS_LABELS[s.status])}${s.pic ? ' · PIC ' + esc(s.pic) : ''}">${STAGE_STATUS_GLYPH[s.status]}</button></td>`).join('')}
              <td><span class="mini-bar"><div style="width:${r.percent}%"></div></span><strong>${r.percent}%</strong></td>
              <td class="tk-actions">
                <button type="button" class="btn btn-sm btn-primary" data-open-task="${r.work_order_id}:${firstOpenStageKey(r.stages)}">Kerjakan</button>
                <button type="button" class="btn btn-sm" data-open-wo="${r.work_order_id}">Detail WO</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>`,
      bindRowEvents: (container) => {
        container.querySelectorAll('[data-open-task]').forEach(btn => btn.addEventListener('click', () => {
          const [woId, key] = btn.dataset.openTask.split(':');
          openWoTask(woId, key);
        }));
        container.querySelectorAll('[data-open-wo]').forEach(btn =>
          btn.addEventListener('click', () => openWorkOrderForm(btn.dataset.openWo)));
      }
    });
  }

  function applyQueueCounts(counts) {
    state.queueCountsAt = Date.now();
    document.querySelectorAll('.nav-badge[data-badge]').forEach(badge => {
      const n = (counts || {})[badge.dataset.badge] || 0;
      badge.textContent = n;
      badge.hidden = n === 0;
    });
  }

  // Jumlah antrian di sidebar; diperbarui paling sering tiap 5 detik supaya tidak membebani server.
  async function refreshQueueBadges(force) {
    if (!force && state.queueCountsAt && Date.now() - state.queueCountsAt < 5000) return;
    state.queueCountsAt = Date.now();
    try {
      applyQueueCounts((await api('/api/queues/summary')).counts);
    } catch (e) { /* badge hanya pelengkap */ }
  }

  const QUEUE_DEFS = {
    receiving: {
      title: 'Receiving Queue',
      subtitle: 'Antrian penerimaan — sampel yang belum diterima',
      unit: 'Sampel menunggu',
      empty: 'Tidak ada sampel yang menunggu penerimaan. Semua sudah diterima.'
    },
    preparation: {
      title: 'Preparation Queue',
      subtitle: 'Antrian persiapan — sampel sudah diterima, menunggu machining, marking, dan pemeriksaan spesimen',
      unit: 'Spesimen menunggu',
      empty: 'Tidak ada sampel yang menunggu persiapan.'
    },
    testing: {
      title: 'Testing Queue',
      subtitle: 'Antrian pengujian — spesimen yang lolos pemeriksaan dan siap diuji',
      unit: 'Pengujian menunggu',
      empty: 'Tidak ada pengujian yang menunggu.'
    },
    review: {
      title: 'Review & Approval Queue',
      subtitle: 'Antrian review — laporan hasil uji yang menunggu pemeriksaan dan approval',
      unit: 'Laporan menunggu',
      empty: 'Tidak ada laporan yang menunggu review.'
    }
  };

  function queueWoCellHtml(r) {
    return `<strong>${esc(r.job_number)}</strong><br><span class="muted">${esc(r.company)}${r.project_name ? ' &middot; ' + esc(r.project_name) : ''}</span>
      <div class="q-date">Tgl. Testing: ${r.testing_date ? esc(formatDateOnly(r.testing_date)) : '-'}</div>`;
  }

  function queueSheetButtonHtml(r) {
    if (r.sheet_id) return `<button type="button" class="btn btn-sm" data-open-sheet="${r.sheet_id}">Buka Sheet</button>`;
    if (r.machining_status !== 'selesai') {
      return '<button type="button" class="btn btn-sm" disabled title="Tim machining perlu menekan Selesai Machining dulu">Menunggu machining</button>';
    }
    return `<button type="button" class="btn btn-sm" data-q-create data-req="${r.test_request_id}" data-coupon="${esc(r.coupon_row_no)}" data-test="${esc(r.test_name)}">+ Buat Sheet</button>`;
  }

  const QUEUE_TABLES = {
    receiving: {
      head: ['Work Order', 'Sampel', 'Jenis Pengujian', 'Spesimen', 'Status', ''],
      row: r => `
        <td>${queueWoCellHtml(r)}</td>
        <td>${couponCellHtml(r)}</td>
        <td>${r.tests.map(t => esc(t)).join('<br>') || '<span class="muted">-</span>'}</td>
        <td><span class="qty-pill">${r.specimens}</span></td>
        <td>${r.received === 'N' ? '<span class="st-pill st-rejected">Tidak diterima</span>' : '<span class="st-pill st-pending">Belum diterima</span>'}</td>
        <td class="q-actions"><button type="button" class="btn btn-sm btn-primary" data-q-open="${r.work_order_id}:receiving">Terima &rarr;</button></td>`
    },
    preparation: {
      head: ['Work Order', 'Sampel', 'Jenis Pengujian', 'Specimen Marking', 'Machining', 'Status Sheet', ''],
      row: r => `
        <td>${queueWoCellHtml(r)}</td>
        <td>${couponCellHtml(r)}</td>
        <td><strong>${esc(r.test_name)}</strong><br><span class="muted">Qty ${esc(r.qty) || '-'}${r.method ? ' &middot; ' + esc(r.method) : ''}</span></td>
        <td>${markingChipsHtml(r)}</td>
        <td>${machiningPillHtml(r.machining_status)}</td>
        <td>${r.sheet_status
          ? `<span class="badge badge-${r.sheet_status === 'final' ? 'final' : 'draft'}">${r.sheet_status === 'final' ? 'Final' : 'Draft'}</span>`
          : '<span class="st-pill st-pending">Belum dibuat</span>'}</td>
        <td class="q-actions">${queueSheetButtonHtml(r)}
          <button type="button" class="btn btn-sm" data-q-open="${r.work_order_id}:preparation">Detail</button></td>`
    },
    testing: {
      head: ['Work Order', 'Sampel', 'Jenis Pengujian', 'Specimen Marking', 'Status', ''],
      row: r => `
        <td>${queueWoCellHtml(r)}</td>
        <td>${couponCellHtml(r)}</td>
        <td><strong>${esc(r.test_name)}</strong><br><span class="muted">Qty ${esc(r.qty) || '-'}${r.method ? ' &middot; ' + esc(r.method) : ''}</span></td>
        <td>${markingChipsHtml(r)}</td>
        <td>${r.status === 'proses' ? '<span class="st-pill st-draft">Sedang diuji</span>' : '<span class="st-pill st-pending">Belum dimulai</span>'}</td>
        <td class="q-actions">${r.sheet_id ? `<button type="button" class="btn btn-sm" data-open-sheet="${r.sheet_id}">Buka Sheet</button>` : ''}
          <button type="button" class="btn btn-sm btn-primary" data-q-open="${r.work_order_id}:testing">Uji &rarr;</button></td>`
    },
    review: {
      head: ['Work Order', 'No. Laporan', 'Hasil Pengujian', 'Checklist', 'Status', ''],
      row: r => `
        <td>${queueWoCellHtml(r)}</td>
        <td><strong>${esc(r.report_no) || '-'}</strong></td>
        <td>Accepted ${r.results.accepted} &middot; Rejected ${r.results.rejected}<br><span class="muted">dari ${r.results.total} pengujian</span></td>
        <td>${r.checklist_ok}/${r.checklist_total} butir</td>
        <td>${r.review_status === 'rejected' ? '<span class="st-pill st-rejected">Perlu revisi</span>' : '<span class="st-pill st-pending">Menunggu review</span>'}</td>
        <td class="q-actions"><button type="button" class="btn btn-sm btn-primary" data-q-open="${r.work_order_id}:review">Review &rarr;</button></td>`
    }
  };

  async function renderQueue(name) {
    const def = QUEUE_DEFS[name];
    pageTitle.textContent = def.title;
    pageSubtitle.textContent = def.subtitle;
    topbarActions.innerHTML = `<button class="btn" id="btnQueueRefresh">Muat ulang</button>`;
    document.getElementById('btnQueueRefresh').addEventListener('click', () => renderQueue(name));

    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat antrian...</p></div>`;
    let data;
    try {
      data = await api(`/api/queues/${name}`);
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat antrian: ${esc(e.message)}</p></div>`;
      return;
    }
    if (state.view !== `queue-${name}`) return;   // pengguna sudah pindah halaman
    applyQueueCounts(data.counts);

    const rows = data.rows;
    const woCount = new Set(rows.map(r => r.work_order_id)).size;
    const specimenTotal = rows.reduce((sum, r) => sum + (r.specimens != null ? r.specimens : (parseInt(r.qty, 10) || 0)), 0);
    const thirdTile = name === 'review'
      ? `<div class="task-stat bad"><b>${rows.filter(r => r.review_status === 'rejected').length}</b><span>Perlu revisi</span></div>`
      : `<div class="task-stat"><b>${specimenTotal}</b><span>Total spesimen</span></div>`;

    contentEl.innerHTML = `
      <div class="task-stats">
        <div class="task-stat ${rows.length ? '' : 'ok'}"><b>${rows.length}</b><span>${esc(def.unit)}</span></div>
        <div class="task-stat"><b>${woCount}</b><span>Work Order terkait</span></div>
        ${thirdTile}
      </div>
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">${esc(def.title)}</p>
          <p class="card-desc">Diurutkan berdasarkan tanggal testing terdekat</p>
        </div>
        <div id="queueTableArea"></div>
      </div>`;

    const table = QUEUE_TABLES[name];
    renderSearchablePaginatedTable({
      key: `queue-${name}`,
      containerEl: document.getElementById('queueTableArea'),
      allRows: rows,
      searchFields: ['job_number', 'company', 'project_name', 'sample_marking', 'test_name', 'test_names_text', 'report_no'],
      searchPlaceholder: 'Cari No. Pekerjaan, Perusahaan, Sample Marking, atau Jenis Pengujian...',
      emptyHtml: `<p class="muted" style="padding:24px;">${esc(def.empty)}</p>`,
      renderTableHtml: (pageRows) => `
        <table class="data-table queue-table">
          <thead><tr>${table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${pageRows.map(r => `<tr>${table.row(r)}</tr>`).join('')}</tbody>
        </table>`,
      bindRowEvents: (container) => {
        container.querySelectorAll('[data-q-open]').forEach(btn => btn.addEventListener('click', () => {
          const [woId, key] = btn.dataset.qOpen.split(':');
          openWoTask(woId, key);
        }));
        container.querySelectorAll('[data-open-sheet]').forEach(btn =>
          btn.addEventListener('click', () => openSpecimenForm(btn.dataset.openSheet)));
        container.querySelectorAll('[data-q-create]').forEach(btn => btn.addEventListener('click', () => {
          state.view = 'specimen-list';
          state.specimenCreatorOpen = true;
          state.specimenCreatorPrefill = { requestId: btn.dataset.req, couponRowNo: btn.dataset.coupon, testName: btn.dataset.test };
          render();
        }));
      }
    });
  }

  // ---------- hasil & laporan (daftar LHU) ----------
  // Bukan sumber data baru: hanya membaca Work Order yang lhu_number-nya sudah terisi (dibuat
  // otomatis di tahap Report Issued). Status distribusi disimpan/diedit di sini, bukan di tahap
  // Report Issued lagi, sesuai permintaan klien memisahkan penerbitan dari pengiriman LHU.

  const LHU_DIST_LABELS = { belum_dikirim: 'Menunggu Kirim', sent: 'Sent', delivered: 'Delivered' };
  const LHU_DIST_PILL = { belum_dikirim: 'st-pending', sent: 'st-draft', delivered: 'st-final' };
  const LHU_DIST_METHODS = ['Email', 'Kurir', 'Portal Customer', 'Diambil Langsung'];

  async function renderLhuList() {
    pageTitle.textContent = 'Hasil & Laporan';
    pageSubtitle.textContent = 'Daftar Laporan Hasil Uji (LHU)';
    topbarActions.innerHTML = '';

    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;

    let rows = [];
    try {
      rows = (await api('/api/lhu-reports')).items;
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat data: ${esc(e.message)}</p></div>`;
      return;
    }

    if (!rows.length) {
      contentEl.innerHTML = `
        <div class="card empty-state">
          <p class="card-title">Belum ada LHU</p>
          <p class="card-desc">LHU muncul di sini otomatis setelah tahap Report Issued pada suatu Work Order diselesaikan.</p>
        </div>`;
      return;
    }

    const total = rows.length;
    const sentCount = rows.filter(r => ['sent', 'delivered'].includes(r.distribution_status)).length;
    const pendingCount = total - sentCount;
    const pct = n => (total ? Math.round((n / total) * 1000) / 10 : 0);

    contentEl.innerHTML = `
      <div class="task-stats" style="margin-bottom:20px;">
        <div class="task-stat"><b>${total}</b><span>Total LHU</span></div>
        <div class="task-stat ok"><b>${sentCount}</b><span>Sudah Dikirim &middot; ${pct(sentCount)}%</span></div>
        <div class="task-stat"><b>${pendingCount}</b><span>Menunggu Kirim &middot; ${pct(pendingCount)}%</span></div>
      </div>
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <p class="card-title">Daftar LHU</p>
            <p class="card-desc">${total} LHU tersimpan</p>
          </div>
          <select id="lhuStatusFilter" style="max-width:220px;">
            <option value="">Semua Status Distribusi</option>
            ${Object.entries(LHU_DIST_LABELS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}
          </select>
        </div>
        <div id="lhuTableArea"></div>
      </div>`;

    const ui = { status: '' };
    const filterSelect = document.getElementById('lhuStatusFilter');
    const drawTable = () => {
      const filtered = ui.status ? rows.filter(r => r.distribution_status === ui.status) : rows;
      renderSearchablePaginatedTable({
        key: 'lhu-reports',
        containerEl: document.getElementById('lhuTableArea'),
        allRows: filtered,
        searchFields: ['lhu_number', 'job_number', 'company', 'project_name'],
        searchPlaceholder: 'Cari No. LHU, No. WO, Perusahaan, atau Nama Proyek...',
        emptyHtml: '<p class="muted">Tidak ada LHU dengan status tersebut.</p>',
        renderTableHtml: (pageRows) => `
          <table class="data-table">
            <thead><tr>
              <th>No. LHU</th><th>Rev.</th><th>No. Work Order</th><th>Perusahaan</th><th>Nama Proyek</th>
              <th>Tanggal Terbit</th><th>Status Distribusi</th><th></th>
            </tr></thead>
            <tbody>${pageRows.map(r => `
              <tr>
                <td><strong>${esc(r.lhu_number)}</strong></td>
                <td>${r.revision}</td>
                <td>${esc(r.job_number)}</td>
                <td>${esc(r.company)}</td>
                <td>${esc(r.project_name)}</td>
                <td>${r.lhu_issue_date ? esc(formatDateOnly(r.lhu_issue_date)) : '-'}</td>
                <td><span class="st-pill ${LHU_DIST_PILL[r.distribution_status]}">${esc(LHU_DIST_LABELS[r.distribution_status])}</span></td>
                <td><button class="btn btn-sm" data-lhu-view="${r.id}">Lihat</button></td>
              </tr>`).join('')}</tbody>
          </table>`,
        bindRowEvents: (container) => {
          container.querySelectorAll('[data-lhu-view]').forEach(btn => btn.addEventListener('click', () => {
            state.lhuViewId = btn.dataset.lhuView;
            state.view = 'lhu-detail';
            render();
          }));
        }
      });
    };
    filterSelect.addEventListener('change', () => { ui.status = filterSelect.value; drawTable(); });
    drawTable();
  }

  const LHU_EVENT_STATUS_LABELS = { sent: 'Sent', delivered: 'Delivered' };

  function fmtFileSizeLhu(bytes) {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  async function renderLhuDetail() {
    pageTitle.textContent = 'Hasil & Laporan';
    pageSubtitle.textContent = 'Detail LHU';
    topbarActions.innerHTML = `
      <button class="btn" id="btnLhuBack">&larr; Kembali ke Daftar</button>
      <button class="btn btn-primary" id="btnLhuDownload">Download PDF</button>`;
    document.getElementById('btnLhuBack').addEventListener('click', () => { state.view = 'lhu-list'; render(); });

    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;

    let r;
    try {
      r = await api(`/api/lhu-reports/${state.lhuViewId}`);
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat data: ${esc(e.message)}</p></div>`;
      return;
    }

    document.getElementById('btnLhuDownload').addEventListener('click', () => window.open(`/work-orders/${r.id}/print`, '_blank'));

    const wo = r.work_order;
    const a = r.approval;
    const fc = r.final_check;

    contentEl.innerHTML = `
      <div class="lhu-hero">
        <div class="lhu-hero-main">
          <span class="lhu-hero-icon" aria-hidden="true">&#128220;</span>
          <div>
            <p class="lhu-hero-label">Laporan Hasil Uji (LHU)</p>
            <p class="lhu-hero-title">${esc(r.lhu_number)} <span class="lhu-hero-rev">Rev. ${r.revision}</span></p>
            <p class="lhu-hero-sub">
              <span aria-hidden="true">&#128295;</span> Work Order: ${esc(wo.job_number)} &nbsp;
              <span aria-hidden="true">&#127970;</span> ${esc(wo.project_name)} &nbsp;
              <span aria-hidden="true">&#128100;</span> ${esc(wo.company)}
            </p>
          </div>
        </div>
        <div class="lhu-hero-stats">
          <div><span>Status LHU</span><span class="st-pill st-final">Issued</span></div>
          <div><span>Status Distribusi</span><span class="st-pill ${LHU_DIST_PILL[r.distribution_status]}">${esc(LHU_DIST_LABELS[r.distribution_status])}</span></div>
          <div><span>Tanggal Terbit</span><strong>${r.lhu_issue_date ? esc(formatDateOnly(r.lhu_issue_date)) : '-'}</strong></div>
        </div>
      </div>

      <div class="lhu-layout">
        <div>
          <div class="card">
            <p class="section-title">Informasi LHU</p>
            <div class="info-facts">
              <div class="info-fact"><span>No. LHU</span><strong>${esc(r.lhu_number)}</strong></div>
              <div class="info-fact"><span>Versi</span><strong>Rev. ${r.revision}</strong></div>
              <div class="info-fact"><span>Tanggal Terbit</span><strong>${r.lhu_issue_date ? esc(formatDateOnly(r.lhu_issue_date)) : '-'}</strong></div>
              <div class="info-fact"><span>Template Laporan</span><strong>${esc(r.template)}</strong></div>
            </div>
          </div>

          <div class="card">
            <div class="task-card-head">
              <p class="section-title">Informasi Work Order</p>
              <button type="button" class="btn btn-sm" id="btnLhuOpenWo">Lihat Work Order &#8599;</button>
            </div>
            <div class="info-facts">
              <div class="info-fact"><span>No. Work Order</span><strong>${esc(wo.job_number)}</strong></div>
              <div class="info-fact"><span>Nama Proyek</span><strong>${esc(wo.project_name)}</strong></div>
              <div class="info-fact"><span>Perusahaan</span><strong>${esc(wo.company)}</strong></div>
              <div class="info-fact"><span>Tgl. Request</span><strong>${wo.received_date ? esc(formatDateOnly(wo.received_date)) : '-'}</strong></div>
              <div class="info-fact"><span>Target Penyelesaian</span><strong>${wo.lhu_target_date ? esc(formatDateOnly(wo.lhu_target_date)) : '-'}</strong></div>
            </div>
          </div>

          <div class="card">
            <p class="section-title">Persetujuan</p>
            <div class="info-facts">
              <div class="info-fact"><span>Disetujui Oleh</span><strong>${esc(a.approved_by) || '-'}</strong></div>
              <div class="info-fact"><span>Tanggal Approval</span><strong>${a.approved_date ? esc(formatDateOnly(a.approved_date)) : '-'}</strong></div>
            </div>
            ${a.approval_notes ? `<p class="muted" style="margin-top:10px;"><strong>Catatan Approval:</strong> ${esc(a.approval_notes)}</p>` : ''}
          </div>

          <div class="card">
            <p class="section-title">Ringkasan Pengujian</p>
            <div class="task-stats">
              <div class="task-stat"><b>${fc.coupons}</b><span>Coupon</span></div>
              <div class="task-stat"><b>${fc.test_types}</b><span>Jenis Pengujian</span></div>
              <div class="task-stat ok"><b>${fc.total_specimens}</b><span>Total Specimen</span></div>
              <div class="task-stat ok"><b>${fc.result_sheets}</b><span>Result Sheet</span></div>
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <p class="section-title">Dokumen LHU</p>
            <div class="lhu-doc-row">
              <div>
                <strong>${esc(r.lhu_number)}.pdf</strong>
                <p class="muted" style="margin:4px 0 0;">${esc(r.template)}</p>
              </div>
              <button type="button" class="btn btn-sm" id="btnLhuOpenPrint2">Buka Dokumen (PDF)</button>
            </div>
            <p class="muted" style="margin:8px 0 14px;">Memakai format cetak Work Order yang sudah ada (DPI-LP-FR-25) &mdash; dokumen LHU tersendiri belum dibangun.</p>
            <p class="muted" style="margin:0 0 10px;">Foto kondisi sampel saat penerimaan: <a href="/work-orders/${r.id}/evidence/print" target="_blank" rel="noopener">Cetak Lampiran Foto Penerimaan</a></p>
            <p class="lhu-sub-title">Attachment Pendukung</p>
            <input type="file" id="lhuAttInput" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.zip,.xlsx,.xls,.docx,.doc" hidden>
            <div id="lhuAttList"><p class="muted">Memuat attachment...</p></div>
            <button type="button" class="btn btn-sm" id="btnLhuAttUpload" style="margin-top:10px;">+ Tambah Attachment</button>
          </div>

          <div class="card">
            <div class="task-card-head">
              <p class="section-title">Informasi Distribusi</p>
              <button type="button" class="btn btn-sm" id="btnLhuDistAdd">+ Tambah Distribusi</button>
            </div>
            <div id="lhuDistForm"></div>
            <div id="lhuDistList"><p class="muted">Memuat riwayat distribusi...</p></div>
          </div>

          <div class="card">
            <p class="section-title">Riwayat Status</p>
            <div id="lhuTimeline">
              ${r.timeline.map(t => `
                <div class="lhu-timeline-row">
                  <span class="lhu-timeline-dot"></span>
                  <div>
                    <div class="lhu-timeline-head"><strong>${esc(t.label)}</strong><span class="muted">${esc(formatDateTimeID(t.date))}</span></div>
                    <div class="muted">${esc(t.note)}</div>
                  </div>
                </div>`).join('') || '<p class="muted">Belum ada riwayat.</p>'}
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('btnLhuOpenPrint2').addEventListener('click', () => window.open(`/work-orders/${r.id}/print`, '_blank'));
    document.getElementById('btnLhuOpenWo').addEventListener('click', () => openWorkOrderForm(r.id));

    initLhuAttachments(r.id);
    initLhuDistributions(r.id);
  }

  function initLhuAttachments(woId) {
    const listEl = document.getElementById('lhuAttList');
    const input = document.getElementById('lhuAttInput');
    const uploadBtn = document.getElementById('btnLhuAttUpload');

    const draw = (items) => {
      listEl.innerHTML = items.length
        ? `<ul class="lhu-att-list">${items.map(a => `
            <li>
              <span class="lhu-att-icon" aria-hidden="true">&#128196;</span>
              <div class="lhu-att-meta"><strong>${esc(a.filename)}</strong><span class="muted">${fmtFileSizeLhu(a.size_bytes)} &middot; ${esc(formatDateOnly(String(a.created_at).slice(0, 10)))}</span></div>
              <a href="/api/lhu-attachments/${a.id}" class="btn btn-sm" download>Download</a>
              <button type="button" class="btn btn-sm btn-danger" data-att-del="${a.id}">Hapus</button>
            </li>`).join('')}</ul>`
        : '<p class="muted">Belum ada attachment.</p>';
      listEl.querySelectorAll('[data-att-del]').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('Hapus attachment ini?')) return;
        try {
          await api(`/api/lhu-attachments/${btn.dataset.attDel}`, { method: 'DELETE' });
          load();
        } catch (err) { toast(err.message, 'error'); }
      }));
    };

    const load = async () => {
      try {
        const { items } = await api(`/api/lhu-reports/${woId}/attachments`);
        draw(items);
      } catch (err) {
        listEl.innerHTML = `<p class="muted">Gagal memuat: ${esc(err.message)}</p>`;
      }
    };

    uploadBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast('Ukuran file maksimal 10 MB', 'error'); return; }
      try {
        await api(`/api/lhu-reports/${woId}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
          body: file
        });
        toast('Attachment diunggah', 'success');
        load();
      } catch (err) { toast(err.message, 'error'); }
    });

    load();
  }

  function initLhuDistributions(woId) {
    const listEl = document.getElementById('lhuDistList');
    const formArea = document.getElementById('lhuDistForm');
    const addBtn = document.getElementById('btnLhuDistAdd');

    const proofInput = document.createElement('input');
    proofInput.type = 'file';
    proofInput.accept = 'image/jpeg,image/png,image/webp,application/pdf';
    proofInput.hidden = true;
    listEl.parentElement.appendChild(proofInput);
    let proofTargetId = null;
    proofInput.addEventListener('change', async () => {
      const file = proofInput.files[0];
      proofInput.value = '';
      if (!file || !proofTargetId) return;
      if (file.size > 10 * 1024 * 1024) { toast('Ukuran file maksimal 10 MB', 'error'); return; }
      try {
        await api(`/api/lhu-distributions/${proofTargetId}/proof`, {
          method: 'POST',
          headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) },
          body: file
        });
        toast('Bukti kirim diunggah', 'success');
        loadList();
      } catch (err) { toast(err.message, 'error'); }
    });

    const drawList = (items) => {
      listEl.innerHTML = items.length
        ? `<div class="task-table-wrap"><table class="task-table">
            <thead><tr><th>No.</th><th>Tanggal Kirim</th><th>Metode</th><th>Penerima</th><th>Status</th><th>Bukti Kirim</th><th></th></tr></thead>
            <tbody>${items.map((d, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${d.sent_date ? esc(formatDateOnly(d.sent_date)) : '-'}</td>
                <td>${esc(d.method) || '-'}</td>
                <td>${esc(d.recipient) || '-'}</td>
                <td><span class="st-pill ${LHU_DIST_PILL[d.status]}">${esc(LHU_DIST_LABELS[d.status])}</span></td>
                <td>${d.has_proof
                  ? `<a href="/api/lhu-distributions/${d.id}/proof" target="_blank" rel="noopener" class="btn btn-sm">Lihat</a>`
                  : `<button type="button" class="btn btn-sm" data-dist-proof="${d.id}">Unggah</button>`}</td>
                <td><button type="button" class="btn btn-sm btn-danger" data-dist-del="${d.id}">Hapus</button></td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : '<p class="muted">Belum ada riwayat distribusi.</p>';

      listEl.querySelectorAll('[data-dist-proof]').forEach(btn => btn.addEventListener('click', () => {
        proofTargetId = btn.dataset.distProof;
        proofInput.click();
      }));
      listEl.querySelectorAll('[data-dist-del]').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('Hapus riwayat distribusi ini?')) return;
        try {
          await api(`/api/lhu-distributions/${btn.dataset.distDel}`, { method: 'DELETE' });
          loadList();
        } catch (err) { toast(err.message, 'error'); }
      }));
    };

    const loadList = async () => {
      try {
        const { items } = await api(`/api/lhu-reports/${woId}/distributions`);
        drawList(items);
      } catch (err) {
        listEl.innerHTML = `<p class="muted">Gagal memuat: ${esc(err.message)}</p>`;
      }
    };

    addBtn.addEventListener('click', () => {
      if (formArea.innerHTML) { formArea.innerHTML = ''; return; }
      formArea.innerHTML = `
        <form id="lhuDistAddForm" class="lhu-dist-add">
          <div class="form-grid">
            <div class="field"><label>Tanggal Kirim</label><input type="date" name="sent_date" required></div>
            <div class="field"><label>Cara Kirim</label>
              <select name="method"><option value="">- Pilih -</option>${LHU_DIST_METHODS.map(m => `<option>${esc(m)}</option>`).join('')}</select></div>
            <div class="field"><label>Penerima</label><input type="text" name="recipient" placeholder="Nama / instansi / email penerima" required></div>
            <div class="field"><label>Status</label>
              <select name="status">${Object.entries(LHU_EVENT_STATUS_LABELS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
          </div>
          <div class="form-actions"><div></div><div class="right"><button type="submit" class="btn btn-primary">Simpan Distribusi</button></div></div>
        </form>`;
      document.getElementById('lhuDistAddForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.target).entries());
        try {
          await api(`/api/lhu-reports/${woId}/distributions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
          toast('Distribusi ditambahkan', 'success');
          render();   // muat ulang seluruh halaman: hero + riwayat + status distribusi terkini
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    loadList();
  }

  // ---------- pengaturan ----------

  async function renderSettings() {
    pageTitle.textContent = 'Pengaturan';
    pageSubtitle.textContent = 'Pengaturan aplikasi DETECH LIMS';
    topbarActions.innerHTML = '';

    contentEl.innerHTML = `
      <div class="card">
        <p class="card-title" style="color: var(--danger);">Reset Data</p>
        <p class="card-desc">
          Menghapus semua data transaksional — Permintaan Uji, Work Order, Tasks, Pengecekan
          Spesimen, dan Lembar Hasil Uji beserta file/sertifikat yang menyertainya — supaya bisa
          input data dari awal untuk pengujian end-to-end. <strong>Master Data</strong> (Customer,
          Equipment, Tipe Spesimen, dan daftar lainnya) tidak ikut terhapus. Aksi ini
          <strong>tidak bisa dibatalkan</strong>.
        </p>
        <div class="field" style="max-width:360px; margin-top:16px;">
          <label>Ketik <strong>HAPUS</strong> untuk mengaktifkan tombol reset</label>
          <input type="text" id="resetConfirmInput" autocomplete="off" placeholder="HAPUS">
        </div>
        <button type="button" id="btnResetData" class="btn btn-danger" disabled style="margin-top:8px;">
          Hapus Semua Data Transaksional
        </button>
      </div>`;

    const input = document.getElementById('resetConfirmInput');
    const btn = document.getElementById('btnResetData');
    input.addEventListener('input', () => {
      btn.disabled = input.value.trim() !== 'HAPUS';
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Menghapus...';
      try {
        await api('/api/admin/reset-data', { method: 'POST' });
        toast('Semua data transaksional berhasil dihapus', 'success');
        input.value = '';
        state.editingId = null;
        state.woEditingId = null;
        renderSettings();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Hapus Semua Data Transaksional';
      }
    });
  }

  // ---------- router ----------

  const VIEW_TO_NAV_KEY = {
    dashboard: 'dashboard',
    list: 'permintaan-uji', form: 'permintaan-uji',
    'wo-list': 'work-order', 'wo-form': 'work-order', 'wo-task': 'work-order', 'test-report-form': 'work-order',
    'wo-tasks': 'tasks',
    'queue-receiving': 'q-receiving', 'queue-preparation': 'q-preparation',
    'queue-testing': 'q-testing', 'queue-review': 'q-review',
    'master-data': 'manajemen-data',
    timeline: 'timeline',
    'specimen-list': 'pengecekan-spesimen', 'specimen-form': 'pengecekan-spesimen',
    'lhu-list': 'hasil-laporan', 'lhu-detail': 'hasil-laporan',
    settings: 'pengaturan'
  };

  function syncNavActive() {
    const key = VIEW_TO_NAV_KEY[state.view];
    document.querySelectorAll('.nav-item[data-nav]').forEach(n => n.classList.toggle('active', n.dataset.nav === key));
  }

  function render() {
    syncNavActive();
    refreshQueueBadges();
    renderWorkflowSteps();
    if (state.view === 'dashboard') renderDashboard();
    else if (state.view === 'timeline') renderTimeline();
    else if (state.view === 'list') renderList();
    else if (state.view === 'wo-list') renderWorkOrderList();
    else if (state.view === 'wo-form') renderWorkOrderForm();
    else if (state.view === 'wo-tasks') renderWoTasks();
    else if (state.view === 'wo-task') renderWoTask();
    else if (state.view === 'test-report-form') renderTestReportForm();
    else if (state.view.startsWith('queue-')) renderQueue(state.view.slice(6));
    else if (state.view === 'master-data') renderMasterData();
    else if (state.view === 'specimen-list') renderSpecimenList();
    else if (state.view === 'specimen-form') renderSpecimenForm();
    else if (state.view === 'lhu-list') renderLhuList();
    else if (state.view === 'lhu-detail') renderLhuDetail();
    else if (state.view === 'settings') renderSettings();
    else renderForm();
  }

  // ---------- workflow progress steps ----------

  const WORKFLOW_STEPS = [
    { key: 'permintaan-uji', label: 'Permintaan Uji', views: ['list', 'form'] },
    { key: 'work-order', label: 'Work Order', views: ['wo-list', 'wo-form'] },
    { key: 'pengecekan-spesimen', label: 'Pengecekan Spesimen', views: ['specimen-list', 'specimen-form'] }
  ];

  function goToWorkflowStep(key) {
    if (key === 'permintaan-uji') { state.view = 'list'; state.editingId = null; }
    else if (key === 'work-order') { state.view = 'wo-list'; state.woEditingId = null; }
    else if (key === 'pengecekan-spesimen') { state.view = 'specimen-list'; }
    render();
  }

  function renderWorkflowSteps() {
    const el = document.getElementById('workflowSteps');
    if (!el) return;
    const activeIdx = WORKFLOW_STEPS.findIndex(s => s.views.includes(state.view));
    if (activeIdx === -1) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;

    el.innerHTML = WORKFLOW_STEPS.map((s, i) => {
      const status = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'upcoming';
      const connector = i < WORKFLOW_STEPS.length - 1 ? `<div class="step-connector ${i < activeIdx ? 'done' : ''}"></div>` : '';
      return `
        <div class="workflow-step ${status}" data-step-nav="${s.key}" role="button" tabindex="0">
          <div class="step-circle">${status === 'done' ? '&#10003;' : (i + 1)}</div>
          <div class="step-label">${esc(s.label)}</div>
        </div>
        ${connector}
      `;
    }).join('');

    el.querySelectorAll('[data-step-nav]').forEach(node => {
      node.addEventListener('click', () => goToWorkflowStep(node.dataset.stepNav));
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToWorkflowStep(node.dataset.stepNav); }
      });
    });
  }

  // ---------- Pengecekan Spesimen (DPI-LP-FR-26-1..4) ----------

  const SPECIMEN_CATEGORY_LABELS = { tensile: 'Tensile', bending: 'Bending', charpy: 'Charpy Impact', nickbreak: 'Nick Break', hic: 'HIC / SSCC / SCC', general: 'Umum' };
  const SPECIMEN_NO_SHAPE = ['charpy', 'nickbreak', 'hic', 'general'];
  // Form resmi sederhana: tiap dimensi = pasangan kolom Code/Actual, lalu Accepted Y/N.
  const SIMPLE_SPECIMEN_DIMS = {
    nickbreak: [['width', 'Width'], ['thickness', 'Thickness'], ['notch_depth', 'Notch Depth'], ['length', 'Length']],
    hic: [['width', 'Width'], ['thickness', 'Thickness'], ['length', 'Length']]
  };
  const SPECIMEN_SHAPE_LABELS = { flat: 'Flat', round: 'Round' };
  const SPECIMEN_LOCATIONS = ['Base Metal', 'Weld Metal', 'HAZ', 'Fusion Line', 'Fusion Line +2', 'Fusion Line +5'];

  function couponRowLabel(row) {
    const types = [...(row.coupon_type || [])];
    if (row.coupon_type_other) types.push(row.coupon_type_other);
    const typeText = types.length ? types.join(', ') : (row.material_type_grade || '-');
    const refText = row.ref_code ? ` (Ref: ${row.ref_code})` : '';
    return `Coupon #${row.row_no} — ${typeText}${refText}`;
  }

  function blankSpecimenRow(category, shape, marking) {
    const defaultMarking = marking || '';
    if (category === 'tensile') {
      const pointField = shape === 'round' ? { diameter: '', area: '' } : { width: '', thickness: '', area: '' };
      const measurements = {
        points: [{ ...pointField }, { ...pointField }, { ...pointField }],
        gauge_length_code: '', gauge_length_actual: '',
        radius_code: '', radius_actual: '',
        reduce_section_code: '', reduce_section_actual: '',
        total_length_code: '', total_length_actual: ''
      };
      if (shape === 'round') { measurements.diameter_code = ''; measurements.diameter_actual = ''; }
      else {
        measurements.width_code = ''; measurements.width_actual = '';
        measurements.thickness_code = ''; measurements.thickness_actual = '';
      }
      return { marking_specimen: defaultMarking, type_lt: 'L', measurements };
    }
    if (category === 'bending') {
      const measurements = shape === 'round'
        ? { diameter_code: '', diameter_actual: '', length_code: '', length_actual: '' }
        : {
            width_code: '', width_actual: '', thickness_code: '', thickness_actual: '',
            radius_code: '', radius_actual: '', length_code: '', length_actual: ''
          };
      return { marking_specimen: defaultMarking, type_lt: 'T', accepted: 'Y', measurements };
    }
    if (category === 'nickbreak' || category === 'hic') {
      const measurements = {};
      SIMPLE_SPECIMEN_DIMS[category].forEach(([key]) => { measurements[key + '_code'] = ''; measurements[key + '_actual'] = ''; });
      return { marking_specimen: defaultMarking, type_lt: 'T', accepted: 'Y', measurements };
    }
    if (category === 'general') {
      return {
        marking_specimen: defaultMarking, type_lt: 'L', accepted: 'Y',
        measurements: {
          length_code: '', length_actual: '', width_code: '', width_actual: '',
          thickness_code: '', thickness_actual: '', note: ''
        }
      };
    }
    return {
      marking_specimen: defaultMarking, type_lt: 'L', location: 'Weld Metal', accepted: 'Y',
      measurements: {
        length_code: '', length_actual: '', width_code: '', width_actual: '', thickness_code: '', thickness_actual: '',
        v_notch_l: '', v_notch_r: '', profile_radius: true, profile_depth: true, profile_width: true
      }
    };
  }

  function ltSelectHtml(idx, value) {
    return `<select data-srow="${idx}" data-sfield="type_lt">
      <option value="L" ${value === 'L' ? 'selected' : ''}>L</option>
      <option value="T" ${value === 'T' ? 'selected' : ''}>T</option>
    </select>`;
  }

  function ynSelectHtml(idx, value) {
    return `<select data-srow="${idx}" data-sfield="accepted">
      <option value="Y" ${value === 'Y' ? 'selected' : ''}>Y</option>
      <option value="N" ${value === 'N' ? 'selected' : ''}>N</option>
    </select>`;
  }

  function tensileRowHtml(row, idx, shape) {
    const m = row.measurements;
    const span = m.points.length;
    return m.points.map((p, pIdx) => {
      const first = pIdx === 0;
      return `<tr>
        ${first ? `
          <td rowspan="${span}"><input type="text" data-srow="${idx}" data-sfield="marking_specimen" value="${esc(row.marking_specimen)}" style="width:100px;" placeholder="Marking Specimen"></td>
          <td rowspan="${span}">${ltSelectHtml(idx, row.type_lt)}</td>` : ''}
        <td class="pt-col">${String.fromCharCode(65 + pIdx)}</td>
        ${shape === 'round'
          ? `<td><input type="text" data-srow="${idx}" data-spoint="${pIdx}" data-pfield="diameter" value="${esc(p.diameter)}" style="width:52px;"></td>`
          : `<td><input type="text" data-srow="${idx}" data-spoint="${pIdx}" data-pfield="width" value="${esc(p.width)}" style="width:52px;"></td>
             <td><input type="text" data-srow="${idx}" data-spoint="${pIdx}" data-pfield="thickness" value="${esc(p.thickness)}" style="width:52px;"></td>`}
        <td><input type="text" data-srow="${idx}" data-spoint="${pIdx}" data-pfield="area" value="${esc(p.area)}" style="width:62px;"></td>
        ${first ? `
          <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="gauge_length_code" value="${esc(m.gauge_length_code)}" style="width:48px;"></td>
          <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="gauge_length_actual" value="${esc(m.gauge_length_actual)}" style="width:48px;"></td>
          ${shape === 'round' ? `
            <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="diameter_code" value="${esc(m.diameter_code)}" style="width:48px;"></td>
            <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="diameter_actual" value="${esc(m.diameter_actual)}" style="width:48px;"></td>
          ` : `
            <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="width_code" value="${esc(m.width_code)}" style="width:48px;"></td>
            <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="width_actual" value="${esc(m.width_actual)}" style="width:48px;"></td>
            <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="thickness_code" value="${esc(m.thickness_code)}" style="width:48px;"></td>
            <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="thickness_actual" value="${esc(m.thickness_actual)}" style="width:48px;"></td>
          `}
          <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="radius_code" value="${esc(m.radius_code)}" style="width:48px;"></td>
          <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="radius_actual" value="${esc(m.radius_actual)}" style="width:48px;"></td>
          <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="reduce_section_code" value="${esc(m.reduce_section_code)}" style="width:48px;"></td>
          <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="reduce_section_actual" value="${esc(m.reduce_section_actual)}" style="width:48px;"></td>
          <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="total_length_code" value="${esc(m.total_length_code)}" style="width:48px;"></td>
          <td rowspan="${span}"><input type="text" data-srow="${idx}" data-mfield="total_length_actual" value="${esc(m.total_length_actual)}" style="width:48px;"></td>
          <td rowspan="${span}"><button type="button" class="btn btn-sm btn-danger" data-sremove="${idx}">&#128465;</button></td>
        ` : ''}
      </tr>`;
    }).join('');
  }

  function bendingRowHtml(row, idx, shape) {
    const m = row.measurements;
    const dims = shape === 'round' ? `
      <td><input type="text" data-srow="${idx}" data-mfield="diameter_code" value="${esc(m.diameter_code)}" style="width:52px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="diameter_actual" value="${esc(m.diameter_actual)}" style="width:52px;"></td>
    ` : `
      <td><input type="text" data-srow="${idx}" data-mfield="width_code" value="${esc(m.width_code)}" style="width:52px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="width_actual" value="${esc(m.width_actual)}" style="width:52px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="thickness_code" value="${esc(m.thickness_code)}" style="width:52px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="thickness_actual" value="${esc(m.thickness_actual)}" style="width:52px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="radius_code" value="${esc(m.radius_code)}" style="width:52px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="radius_actual" value="${esc(m.radius_actual)}" style="width:52px;"></td>
    `;
    return `<tr>
      <td><input type="text" data-srow="${idx}" data-sfield="marking_specimen" value="${esc(row.marking_specimen)}" style="width:100px;" placeholder="Marking Specimen"></td>
      <td>${ltSelectHtml(idx, row.type_lt)}</td>
      ${dims}
      <td><input type="text" data-srow="${idx}" data-mfield="length_code" value="${esc(m.length_code)}" style="width:52px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="length_actual" value="${esc(m.length_actual)}" style="width:52px;"></td>
      <td>${ynSelectHtml(idx, row.accepted)}</td>
      <td><button type="button" class="btn btn-sm btn-danger" data-sremove="${idx}">&#128465;</button></td>
    </tr>`;
  }

  function charpyRowHtml(row, idx) {
    const m = row.measurements;
    return `<tr>
      <td><input type="text" data-srow="${idx}" data-sfield="marking_specimen" value="${esc(row.marking_specimen)}" style="width:100px;" placeholder="Marking Specimen"></td>
      <td>${ltSelectHtml(idx, row.type_lt)}</td>
      <td>
        <select data-srow="${idx}" data-sfield="location">
          ${SPECIMEN_LOCATIONS.map(l => `<option value="${esc(l)}" ${row.location === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" data-srow="${idx}" data-mfield="length_code" value="${esc(m.length_code)}" style="width:46px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="length_actual" value="${esc(m.length_actual)}" style="width:46px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="width_code" value="${esc(m.width_code)}" style="width:46px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="width_actual" value="${esc(m.width_actual)}" style="width:46px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="thickness_code" value="${esc(m.thickness_code)}" style="width:46px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="thickness_actual" value="${esc(m.thickness_actual)}" style="width:46px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="v_notch_l" value="${esc(m.v_notch_l)}" style="width:46px;"></td>
      <td><input type="text" data-srow="${idx}" data-mfield="v_notch_r" value="${esc(m.v_notch_r)}" style="width:46px;"></td>
      <td><input type="checkbox" data-srow="${idx}" data-mfield="profile_radius" ${m.profile_radius ? 'checked' : ''}></td>
      <td><input type="checkbox" data-srow="${idx}" data-mfield="profile_depth" ${m.profile_depth ? 'checked' : ''}></td>
      <td><input type="checkbox" data-srow="${idx}" data-mfield="profile_width" ${m.profile_width ? 'checked' : ''}></td>
      <td>${ynSelectHtml(idx, row.accepted)}</td>
      <td><button type="button" class="btn btn-sm btn-danger" data-sremove="${idx}">&#128465;</button></td>
    </tr>`;
  }

  // Layout umum untuk jenis pengujian yang belum punya form resmi (Hardness, Microstructure, PMI, dst).
  function generalRowHtml(row, idx) {
    const m = row.measurements;
    const dim = field => `<td><input type="text" data-srow="${idx}" data-mfield="${field}" value="${esc(m[field])}" style="width:52px;"></td>`;
    return `<tr>
      <td><input type="text" data-srow="${idx}" data-sfield="marking_specimen" value="${esc(row.marking_specimen)}" style="width:100px;" placeholder="Marking Specimen"></td>
      <td>${ltSelectHtml(idx, row.type_lt)}</td>
      ${dim('length_code')}${dim('length_actual')}${dim('width_code')}${dim('width_actual')}${dim('thickness_code')}${dim('thickness_actual')}
      <td>${ynSelectHtml(idx, row.accepted)}</td>
      <td><input type="text" data-srow="${idx}" data-mfield="note" value="${esc(m.note)}" style="width:120px;" placeholder="Catatan"></td>
      <td><button type="button" class="btn btn-sm btn-danger" data-sremove="${idx}">&#128465;</button></td>
    </tr>`;
  }

  function simpleDimsRowHtml(row, idx, category) {
    const m = row.measurements;
    const input = field => `<td><input type="text" data-srow="${idx}" data-mfield="${field}" value="${esc(m[field])}" style="width:52px;"></td>`;
    return `<tr>
      <td><input type="text" data-srow="${idx}" data-sfield="marking_specimen" value="${esc(row.marking_specimen)}" style="width:100px;" placeholder="Marking Specimen"></td>
      <td>${ltSelectHtml(idx, row.type_lt)}</td>
      ${SIMPLE_SPECIMEN_DIMS[category].map(([key]) => input(key + '_code') + input(key + '_actual')).join('')}
      <td>${ynSelectHtml(idx, row.accepted)}</td>
      <td><button type="button" class="btn btn-sm btn-danger" data-sremove="${idx}">&#128465;</button></td>
    </tr>`;
  }

  function specimenTableHtml(category, shape, rows) {
    if (category === 'nickbreak' || category === 'hic') {
      const dims = SIMPLE_SPECIMEN_DIMS[category];
      return `
        <table class="test-items-table specimen-table">
          <thead>
            <tr>
              <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>L/T</th>
              ${dims.map(([, label]) => `<th colspan="2">${label}</th>`).join('')}
              <th rowspan="2">Accepted<br>Y/N</th><th rowspan="2"></th>
            </tr>
            <tr>${dims.map(() => '<th>Code</th><th>Actual</th>').join('')}</tr>
          </thead>
          <tbody>${rows.map((r, i) => simpleDimsRowHtml(r, i, category)).join('')}</tbody>
        </table>`;
    }
    if (category === 'general') {
      return `
        <table class="test-items-table specimen-table">
          <thead>
            <tr>
              <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>L/T</th>
              <th colspan="2">Length</th><th colspan="2">Width / Diameter</th><th colspan="2">Thickness</th>
              <th rowspan="2">Accepted<br>Y/N</th><th rowspan="2">Catatan</th><th rowspan="2"></th>
            </tr>
            <tr><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th></tr>
          </thead>
          <tbody>${rows.map((r, i) => generalRowHtml(r, i)).join('')}</tbody>
        </table>`;
    }
    if (category === 'tensile') {
      const isRound = shape === 'round';
      return `
        <table class="test-items-table specimen-table">
          <thead>
            <tr>
              <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>L/T</th>
              <th colspan="${isRound ? 3 : 4}">3 Point Measurement</th>
              <th colspan="2">Gauge Length</th>
              <th colspan="2">${isRound ? 'Diameter' : 'Width'}</th>
              ${isRound ? '' : '<th colspan="2">Thickness</th>'}
              <th colspan="2">Radius</th>
              <th colspan="2">Reduce Section Length</th>
              <th colspan="2">Total Length</th>
              <th rowspan="2"></th>
            </tr>
            <tr>
              ${isRound ? '<th>Point</th><th>Diameter</th><th>Area</th>' : '<th>Point</th><th>Width</th><th>Thickness</th><th>Area</th>'}
              <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
              ${isRound ? '' : '<th>Code</th><th>Actual</th>'}
              <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
            </tr>
          </thead>
          <tbody>${rows.map((r, i) => tensileRowHtml(r, i, shape)).join('')}</tbody>
        </table>`;
    }
    if (category === 'bending') {
      const isRound = shape === 'round';
      return `
        <table class="test-items-table specimen-table">
          <thead>
            <tr>
              <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>L/T</th>
              <th colspan="2">${isRound ? 'Diameter' : 'Width'}</th>
              ${isRound ? '' : '<th colspan="2">Thickness</th><th colspan="2">Radius</th>'}
              <th colspan="2">Length</th>
              <th rowspan="2">Accepted<br>Y/N</th><th rowspan="2"></th>
            </tr>
            <tr>
              <th>Code</th><th>Actual</th>
              ${isRound ? '' : '<th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>'}
              <th>Code</th><th>Actual</th>
            </tr>
          </thead>
          <tbody>${rows.map((r, i) => bendingRowHtml(r, i, shape)).join('')}</tbody>
        </table>`;
    }
    return `
      <table class="test-items-table specimen-table">
        <thead>
          <tr>
            <th rowspan="2">Marking Specimen</th><th rowspan="2">Type<br>L/T</th><th rowspan="2">Location</th>
            <th colspan="2">Length</th><th colspan="2">Width</th><th colspan="2">Thickness</th>
            <th colspan="2">Center V-Notch</th><th colspan="3">Profile Projector Check</th>
            <th rowspan="2">Accepted<br>Y/N</th><th rowspan="2"></th>
          </tr>
          <tr>
            <th>Code</th><th>Actual</th><th>Code</th><th>Actual</th><th>Code</th><th>Actual</th>
            <th>L</th><th>R</th><th>Radius</th><th>Depth</th><th>Width</th>
          </tr>
        </thead>
        <tbody>${rows.map((r, i) => charpyRowHtml(r, i)).join('')}</tbody>
      </table>`;
  }

  // ----- Gambar spesimen (sesuai kategori & bentuk) -----

  function specDiagramCardHtml(insp) {
    if (!window.SpecimenDiagrams) return '';
    const title = insp.category === 'general' && insp.test_name
      ? insp.test_name
      : `${SPECIMEN_CATEGORY_LABELS[insp.category] || ''}${insp.shape ? ' - ' + SPECIMEN_SHAPE_LABELS[insp.shape] : ''}`;
    return `
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Gambar Spesimen <span class="en">(${esc(title)})</span></p>
          <label class="spec-diagram-pick">Nilai untuk spesimen
            <select id="specDiagramRow"></select>
          </label>
        </div>
        <div id="specDiagram" class="spec-diagram"></div>
        <p class="muted" style="margin-top:8px;">Arahkan kursor atau klik kolom di tabel Data Spesimen untuk menyorot dimensinya. Angka pada gambar adalah ukuran <em>Actual</em> spesimen yang dipilih; klik dimensi pada gambar untuk mengisinya.</p>
      </div>`;
  }

  function applySpecDiagramHighlight() {
    const box = document.getElementById('specDiagram');
    if (!box) return;
    const keys = state.specDiagramHl || [];
    box.querySelectorAll('.sd-dim').forEach(g => g.classList.toggle('active', keys.includes(g.dataset.key)));
  }

  function refreshSpecDiagram() {
    const box = document.getElementById('specDiagram');
    const sel = document.getElementById('specDiagramRow');
    if (!box || !sel || !window.SpecimenDiagrams || !state.specimenRows.length) return;
    const insp = state.specimenData;
    const previous = Number(sel.value) || 0;
    sel.innerHTML = state.specimenRows.map((r, i) =>
      `<option value="${i}">${esc(r.marking_specimen || 'Spesimen ' + (i + 1))}</option>`).join('');
    sel.value = String(Math.min(previous, state.specimenRows.length - 1));
    const row = state.specimenRows[Number(sel.value)];
    const typeInput = document.getElementById('specTypeOfSpecimenInput');
    box.innerHTML = SpecimenDiagrams.render(insp.category, insp.shape, {
      idPrefix: 'sdf',
      variant: SpecimenDiagrams.variantOf(typeInput ? typeInput.value : insp.type_of_specimen),
      values: SpecimenDiagrams.rowValues(insp.category, insp.shape, row)
    });
    applySpecDiagramHighlight();
  }

  function specInputKeys(el) {
    if (!el || el.dataset.srow === undefined) return [];
    const insp = state.specimenData;
    return SpecimenDiagrams.keysForInput(insp.category, insp.shape, {
      mfield: el.dataset.mfield, pfield: el.dataset.pfield, spoint: el.dataset.spoint
    });
  }

  function bindSpecDiagramEvents() {
    const wrap = document.getElementById('specimenRowsWrap');
    const box = document.getElementById('specDiagram');
    const sel = document.getElementById('specDiagramRow');
    if (!wrap || !box || !sel || !window.SpecimenDiagrams) return;
    state.specDiagramHl = [];

    const setHl = keys => { state.specDiagramHl = keys; applySpecDiagramHighlight(); };
    wrap.addEventListener('focusin', e => { setHl(specInputKeys(e.target)); const r = e.target.dataset.srow; if (r !== undefined && sel.value !== r) { sel.value = r; refreshSpecDiagram(); } });
    wrap.addEventListener('focusout', () => setHl([]));
    wrap.addEventListener('mouseover', e => { const k = specInputKeys(e.target); if (k.length) setHl(k); });
    wrap.addEventListener('mouseout', () => setHl(specInputKeys(document.activeElement)));
    sel.addEventListener('change', refreshSpecDiagram);

    // klik dimensi di gambar -> fokus ke kolom Actual yang sesuai pada baris terpilih
    box.addEventListener('click', e => {
      const g = e.target.closest('.sd-dim');
      if (!g) return;
      const candidates = Array.from(wrap.querySelectorAll(`[data-srow="${sel.value}"]`))
        .filter(el => specInputKeys(el).includes(g.dataset.key));
      const target = candidates.find(el => /_actual$|^v_notch|^profile_|^point/.test(el.dataset.mfield || '') || el.dataset.pfield) || candidates[0];
      if (target) target.focus();
    });
    box.addEventListener('mouseover', e => { const g = e.target.closest('.sd-dim'); if (g) setHl([g.dataset.key]); });
    box.addEventListener('mouseout', () => setHl(specInputKeys(document.activeElement)));

    refreshSpecDiagram();
  }

  function rerenderSpecimenRows() {
    document.getElementById('specimenRowsWrap').innerHTML =
      specimenTableHtml(state.specimenData.category, state.specimenData.shape, state.specimenRows);
    bindSpecRemoveButtons();
    refreshSpecDiagram();
  }

  function bindSpecRemoveButtons() {
    document.querySelectorAll('[data-sremove]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.specimenRows.length <= 1) { toast('Minimal harus ada 1 baris', 'error'); return; }
        state.specimenRows.splice(Number(btn.dataset.sremove), 1);
        rerenderSpecimenRows();
      });
    });
  }

  function handleSpecimenInput(e) {
    const t = e.target;
    const rowIdx = t.dataset.srow;
    if (rowIdx === undefined) return;
    const row = state.specimenRows[Number(rowIdx)];
    if (!row) return;

    if (t.dataset.sfield) {
      row[t.dataset.sfield] = t.value;
    } else if (t.dataset.spoint !== undefined) {
      const point = row.measurements.points[Number(t.dataset.spoint)];
      point[t.dataset.pfield] = t.value;
      if (t.dataset.pfield === 'width' || t.dataset.pfield === 'thickness') {
        const w = parseFloat(point.width), th = parseFloat(point.thickness);
        if (!isNaN(w) && !isNaN(th)) point.area = (w * th).toFixed(2);
      } else if (t.dataset.pfield === 'diameter') {
        const d = parseFloat(point.diameter);
        if (!isNaN(d)) point.area = (Math.PI * (d / 2) * (d / 2)).toFixed(2);
      }
      if (t.dataset.pfield !== 'area') {
        const areaInput = document.querySelector(`[data-srow="${rowIdx}"][data-spoint="${t.dataset.spoint}"][data-pfield="area"]`);
        if (areaInput) areaInput.value = point.area || '';
      }
    } else if (t.dataset.mfield) {
      row.measurements[t.dataset.mfield] = t.type === 'checkbox' ? t.checked : t.value;
    }
    refreshSpecDiagram();
  }

  async function openSpecimenForm(id) {
    state.view = 'specimen-form';
    state.specimenEditingId = id;
    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;
    try {
      state.specimenData = await api(`/api/specimen-inspections/${id}`);
      const insp = state.specimenData;
      state.specimenRows = (insp.rows && insp.rows.length)
        ? insp.rows
        : (insp.markings && insp.markings.length
            ? insp.markings.map(m => blankSpecimenRow(insp.category, insp.shape, m))
            : [blankSpecimenRow(insp.category, insp.shape, insp.sample_marking || '')]);
    } catch (e) {
      toast(e.message, 'error');
      state.view = 'specimen-list';
      render();
      return;
    }
    try {
      const shapeParam = state.specimenData.shape || '';
      state.specimenTypes = (await api(`/api/specimen-types?category=${state.specimenData.category}&shape=${shapeParam}`)).types;
    } catch (e) {
      state.specimenTypes = [];
    }
    render();
  }

  function renderSpecimenForm() {
    const insp = state.specimenData || {};
    const tr = insp.test_request || {};
    const category = insp.category;
    const shape = insp.shape;

    pageTitle.textContent = 'Pengecekan Spesimen';
    pageSubtitle.textContent = `${SPECIMEN_CATEGORY_LABELS[category] || ''}${shape ? ' - ' + SPECIMEN_SHAPE_LABELS[shape] : ''} — ${esc(tr.job_number || '')}`;
    topbarActions.innerHTML = `
      <button class="btn" id="btnSpecBack">&larr; Kembali ke Daftar</button>
      <button type="button" class="btn" id="btnSpecExportPdf">Export PDF</button>
    `;
    document.getElementById('btnSpecBack').addEventListener('click', () => { state.view = 'specimen-list'; render(); });
    document.getElementById('btnSpecExportPdf').addEventListener('click', () =>
      window.open(`/specimen-inspections/${state.specimenEditingId}/print`, '_blank'));

    contentEl.innerHTML = `
      <datalist id="specRefCodeList">
        ${REF_CODES.map(p => `<option value="${esc(p)}">`).join('')}
      </datalist>
      <datalist id="specTypeList">
        ${(state.specimenTypes || []).map(t => `<option value="${esc(t.name)}">`).join('')}
      </datalist>
      <form id="specForm">
        <div class="card">
          <p class="section-title">Info Permintaan <span class="en">(hanya baca)</span></p>
          <div class="form-grid">
            <div class="field"><label>No. Pekerjaan</label><input type="text" value="${esc(tr.job_number)}" disabled></div>
            <div class="field"><label>Pelanggan</label><input type="text" value="${esc(tr.on_behalf_owner)}" disabled></div>
            <div class="field"><label>Kategori</label><input type="text" value="${esc(category === 'general' && insp.test_name ? insp.test_name : (SPECIMEN_CATEGORY_LABELS[category] || ''))}${shape ? ' - ' + esc(SPECIMEN_SHAPE_LABELS[shape]) : ''}" disabled></div>
            <div class="field"><label>Coupon Test <span class="en">(untuk telusur, tidak tercetak di PDF)</span></label><input type="text" value="${insp.coupon ? esc(couponRowLabel(insp.coupon)) : '-'}" disabled></div>
          </div>
        </div>

        <div class="card">
          <p class="section-title">Info Pengecekan</p>
          <div class="form-grid">
            <div class="field">
              <label>Tanggal <span class="en">Date</span></label>
              <input type="date" name="inspection_date" value="${esc(insp.inspection_date)}">
            </div>
            <div class="field">
              <label>Tipe Spesimen <span class="en">Type of Specimen</span></label>
              <input type="text" list="specTypeList" autocomplete="off" id="specTypeOfSpecimenInput" name="type_of_specimen" value="${esc(insp.type_of_specimen)}" placeholder="Pilih atau ketik baru...">
            </div>
            <div class="field">
              <label>Kode Acuan <span class="en">Ref. Code</span></label>
              <input type="text" list="specRefCodeList" autocomplete="off" name="ref_code" value="${esc(insp.ref_code)}">
            </div>
            <div class="field">
              <label>Marking</label>
              <input type="text" name="marking" value="${esc(insp.marking || insp.sample_marking || tr.customer_id || '')}">
            </div>
          </div>
        </div>

        ${specDiagramCardHtml(insp)}

        <div class="card">
          <p class="section-title">Data Spesimen</p>
          <div id="specimenRowsWrap" style="overflow-x:auto;">
            ${specimenTableHtml(category, shape, state.specimenRows)}
          </div>
          <button type="button" class="btn btn-sm" id="btnAddSpecRow" style="margin-top:10px;">+ Tambah Baris</button>
        </div>

        <div class="card">
          <p class="section-title">Approval</p>
          <div class="signature-columns">
            <div class="signature-column">
              <div class="field">
                <label>Inspected by</label>
                <input type="text" name="inspected_by_name" value="${esc(insp.inspected_by_name)}">
              </div>
              <div class="field">
                ${signaturePadHtml('inspected_by_signature', 'Tanda Tangan', 'Signature', insp.inspected_by_signature)}
              </div>
            </div>
            <div class="signature-column">
              <div class="field">
                <label>Approved by</label>
                <input type="text" name="approved_by_name" value="${esc(insp.approved_by_name)}">
              </div>
              <div class="field">
                ${signaturePadHtml('approved_by_signature', 'Tanda Tangan', 'Signature', insp.approved_by_signature)}
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <div>
            <button type="button" class="btn btn-danger" id="btnSpecDelete">Hapus</button>
          </div>
          <div class="right">
            <button type="submit" class="btn" data-status="draft">Simpan sebagai Draft</button>
            <button type="submit" class="btn btn-primary" data-status="final">Simpan &amp; Finalisasi</button>
          </div>
        </div>
      </form>
    `;

    bindSpecimenFormEvents();
    bindSpecDiagramEvents();
    initSignaturePads();
  }

  function applySelectedSpecimenTypeToRow(row) {
    const input = document.getElementById('specTypeOfSpecimenInput');
    const match = input && (state.specimenTypes || []).find(t => t.name === input.value);
    if (!match) return;
    const codeValues = match.code_values || {};
    Object.keys(codeValues).forEach(k => { row.measurements[k] = codeValues[k]; });
  }

  function bindSpecimenFormEvents() {
    document.getElementById('btnAddSpecRow').addEventListener('click', () => {
      const insp = state.specimenData;
      const nextIdx = state.specimenRows.length + 1;
      const marking = (insp.sample_marking && insp.code) ? `${insp.sample_marking}-${insp.code}${nextIdx}` : '';
      const row = blankSpecimenRow(insp.category, insp.shape, marking);
      applySelectedSpecimenTypeToRow(row);
      state.specimenRows.push(row);
      rerenderSpecimenRows();
    });

    document.getElementById('specimenRowsWrap').addEventListener('input', handleSpecimenInput);
    document.getElementById('specimenRowsWrap').addEventListener('change', handleSpecimenInput);

    document.getElementById('specTypeOfSpecimenInput').addEventListener('input', (e) => {
      refreshSpecDiagram();   // gambar mengikuti Tipe Spesimen (mis. Full Section / BjTS memakai gambar spesimen utuh)
      const match = (state.specimenTypes || []).find(t => t.name === e.target.value);
      if (!match) return;
      state.specimenRows.forEach(row => applySelectedSpecimenTypeToRow(row));
      rerenderSpecimenRows();
      toast(`Kolom Code diisi dari tipe "${match.name}"`, 'success');
    });

    document.getElementById('btnSpecDelete').addEventListener('click', () => deleteSpecimenInspection(state.specimenEditingId));

    document.getElementById('specForm').addEventListener('submit', onSpecimenSubmit);
    contentEl.querySelectorAll('button[type="submit"]').forEach(b => {
      b.addEventListener('click', () => { state.specimenPendingStatus = b.dataset.status; });
    });

    bindSpecRemoveButtons();
  }

  async function onSpecimenSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.status = state.specimenPendingStatus || 'draft';
    payload.rows = state.specimenRows;

    contentEl.querySelectorAll('canvas.signature-pad').forEach(canvas => {
      payload[canvas.dataset.sig] = canvas.dataset.hasSignature === 'true' ? canvas.toDataURL('image/png') : '';
    });

    try {
      state.specimenData = await api(`/api/specimen-inspections/${state.specimenEditingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      toast('Pengecekan Spesimen tersimpan', 'success');
      state.view = 'specimen-list';
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function deleteSpecimenInspection(id) {
    if (!confirm('Hapus Pengecekan Spesimen ini? Tindakan tidak dapat dibatalkan.')) return;
    try {
      await api(`/api/specimen-inspections/${id}`, { method: 'DELETE' });
      toast('Pengecekan Spesimen dihapus', 'success');
      state.view = 'specimen-list';
      render();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function renderSpecimenList() {
    pageTitle.textContent = 'Pengecekan Spesimen';
    pageSubtitle.textContent = 'Pengecekan Spesimen — DPI-LP-FR-26';
    topbarActions.innerHTML = `<button class="btn btn-primary" id="btnNewSpec">+ Buat Pengecekan Baru</button>`;
    document.getElementById('btnNewSpec').addEventListener('click', () => {
      state.specimenCreatorOpen = !state.specimenCreatorOpen;
      renderSpecimenList();
    });

    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;

    let rows = [];
    let requests = [];
    let workOrders = [];
    try {
      rows = await api('/api/specimen-inspections');
      requests = (await api('/api/requests')).filter(r => r.status === 'final');
      workOrders = await api('/api/work-orders');
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat data: ${esc(e.message)}</p></div>`;
      return;
    }

    // Antrian kerja tim inspeksi: spesimen yang sudah selesai di-machining (siap diinspeksi) dan yang
    // masih menunggu/berjalan di machining. Sheet inspeksi hanya bisa dibuat setelah machining selesai.
    const activeWo = workOrders.filter(w => w.stage && w.stage.statuses
      && !['final', 'na'].includes(w.stage.statuses.preparation) && w.stage.statuses.receiving === 'final');
    const readyWo = activeWo.filter(w => w.machining_status === 'selesai');
    const inMachiningWo = activeWo.filter(w => w.machining_status !== 'selesai');
    const readyHtml = (readyWo.length || inMachiningWo.length) ? `
      <div class="card">
        <p class="card-title">Siap Diinspeksi</p>
        <p class="card-desc">${readyWo.length} Work Order selesai machining &middot; ${inMachiningWo.length} masih menunggu / sedang machining</p>
        <div class="dash-action-list">
          ${readyWo.map(w => `
            <div class="dash-action-item">
              <div>
                <strong>${esc(w.job_number)}</strong><span class="muted"> &middot; ${esc(w.company)}</span>
                <p class="dash-action-hint"><span class="st-pill st-final">Machining selesai</span>${w.machining_finished_at ? ' &middot; ' + esc(formatDateTimeID(w.machining_finished_at)) + ' &middot; durasi ' + esc(fmtDurationID(w.machining_started_at, w.machining_finished_at)) : ''}</p>
              </div>
              <button class="btn btn-sm btn-primary" data-ready-spec="${w.test_request_id}">Buat Pengecekan</button>
            </div>`).join('')}
          ${inMachiningWo.map(w => `
            <div class="dash-action-item">
              <div>
                <strong>${esc(w.job_number)}</strong><span class="muted"> &middot; ${esc(w.company)}</span>
                <p class="dash-action-hint">${machiningPillHtml(w.machining_status)}</p>
              </div>
              <button class="btn btn-sm" data-machining-open="${w.id}">Lihat Machining</button>
            </div>`).join('')}
        </div>
      </div>` : '';

    const creatorHtml = state.specimenCreatorOpen ? `
      <div class="card">
        <p class="section-title">Buat Pengecekan Spesimen Baru</p>
        <form id="specCreateForm" class="form-grid">
          <div class="field">
            <label>Permintaan Uji</label>
            <select id="specCreateRequest">
              <option value="">- Pilih -</option>
              ${requests.map(r => `<option value="${r.id}">${esc(r.job_number)} — ${esc(r.company)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Coupon Test</label>
            <select id="specCreateCoupon" disabled>
              <option value="">- Pilih Permintaan Uji dulu -</option>
            </select>
          </div>
          <div class="field">
            <label>Jenis Pengujian</label>
            <select id="specCreateTestName" disabled>
              <option value="">- Pilih Coupon Test dulu -</option>
            </select>
            <p class="muted" id="specCreateHint" style="margin:2px 0 0;"></p>
          </div>
          <div class="field" id="specCreateShapeWrap" style="display:none;">
            <label>Bentuk <span class="en">Auto-terisi dari jenis coupon, tetap bisa diubah manual</span></label>
            <select id="specCreateShape">
              <option value="flat">Flat</option>
              <option value="round">Round</option>
            </select>
          </div>
          <div class="field" id="specCreateQtyWrap" style="display:none;">
            <label>Qty diminta</label>
            <input type="text" id="specCreateQty" disabled>
          </div>
          <div class="field" style="justify-content:flex-end;">
            <button type="submit" class="btn btn-primary">Buat</button>
          </div>
        </form>
        ${requests.length === 0 ? '<p class="muted" style="margin-top:8px;">Belum ada Permintaan Uji berstatus Final.</p>' : ''}
      </div>
    ` : '';

    if (!rows.length) {
      contentEl.innerHTML = creatorHtml + readyHtml + `
        <div class="card empty-state">
          <p class="card-title">Belum ada Pengecekan Spesimen</p>
          <p class="card-desc">Klik &ldquo;+ Buat Pengecekan Baru&rdquo; untuk mulai membuat sheet Tensile/Bending/Charpy Impact.</p>
        </div>`;
    } else {
      contentEl.innerHTML = creatorHtml + readyHtml + `
        <div class="card" style="padding:0;">
          <div style="padding:22px 24px 8px;">
            <p class="card-title">Daftar Pengecekan Spesimen</p>
            <p class="card-desc">${rows.length} sheet tersimpan</p>
          </div>
          <div id="specTableArea"></div>
        </div>`;

      renderSearchablePaginatedTable({
        key: 'specimen-inspections',
        containerEl: document.getElementById('specTableArea'),
        allRows: rows,
        searchFields: ['job_number', 'company'],
        searchPlaceholder: 'Cari No. Pekerjaan atau Perusahaan...',
        renderTableHtml: (pageRows) => `
          <table class="data-table">
            <thead><tr><th>No. Pekerjaan</th><th>Perusahaan</th><th>Coupon</th><th>Jenis Pengujian</th><th>Qty</th><th>Tanggal</th><th>Status</th><th></th></tr></thead>
            <tbody>${pageRows.map(r => `
              <tr>
                <td><strong>${esc(r.job_number)}</strong></td>
                <td>${esc(r.company)}</td>
                <td>${r.coupon_row_no ? 'Coupon #' + esc(r.coupon_row_no) : '-'}</td>
                <td>${esc(r.test_name || SPECIMEN_CATEGORY_LABELS[r.category] || r.category)}${r.shape ? ' - ' + esc(SPECIMEN_SHAPE_LABELS[r.shape] || r.shape) : ''}</td>
                <td>${esc(r.qty) || '-'}</td>
                <td>${esc(r.inspection_date) || '-'}</td>
                <td><span class="badge badge-${r.status === 'final' ? 'final' : 'draft'}">${r.status === 'final' ? 'Final' : 'Draft'}</span></td>
                <td>
                  <button class="btn btn-sm" data-spec-edit="${r.id}">Buka</button>
                  <button class="btn btn-sm" data-spec-pdf="${r.id}">Export PDF</button>
                  <button class="btn btn-sm btn-danger" data-spec-del="${r.id}">Hapus</button>
                </td>
              </tr>`).join('')}</tbody>
          </table>`,
        bindRowEvents: (container) => {
          container.querySelectorAll('[data-spec-edit]').forEach(btn =>
            btn.addEventListener('click', () => openSpecimenForm(btn.dataset.specEdit)));
          container.querySelectorAll('[data-spec-pdf]').forEach(btn =>
            btn.addEventListener('click', () => window.open(`/specimen-inspections/${btn.dataset.specPdf}/print`, '_blank')));
          container.querySelectorAll('[data-spec-del]').forEach(btn =>
            btn.addEventListener('click', () => deleteSpecimenInspection(btn.dataset.specDel)));
        }
      });
    }

    contentEl.querySelectorAll('[data-ready-spec]').forEach(btn => btn.addEventListener('click', () => {
      state.specimenCreatorOpen = true;
      state.specimenCreatorPrefill = { requestId: btn.dataset.readySpec };
      render();
    }));
    contentEl.querySelectorAll('[data-machining-open]').forEach(btn =>
      btn.addEventListener('click', () => openWoTask(btn.dataset.machiningOpen, 'preparation')));

    if (state.specimenCreatorOpen) {
      const couponSelect = document.getElementById('specCreateCoupon');
      const testNameSelect = document.getElementById('specCreateTestName');
      const shapeWrap = document.getElementById('specCreateShapeWrap');
      const shapeSelect = document.getElementById('specCreateShape');
      const qtyWrap = document.getElementById('specCreateQtyWrap');
      const qtyInput = document.getElementById('specCreateQty');
      let availableTests = [];

      const hintEl = document.getElementById('specCreateHint');
      const resetTestNameSelect = (placeholder) => {
        availableTests = [];
        hintEl.textContent = '';
        testNameSelect.innerHTML = `<option value="">${placeholder}</option>`;
        testNameSelect.disabled = true;
        shapeWrap.style.display = 'none';
        qtyWrap.style.display = 'none';
      };

      const reqSelect = document.getElementById('specCreateRequest');

      const loadCoupons = async (testRequestId) => {
        resetTestNameSelect('- Pilih Coupon Test dulu -');
        if (!testRequestId) {
          couponSelect.innerHTML = '<option value="">- Pilih Permintaan Uji dulu -</option>';
          couponSelect.disabled = true;
          return;
        }
        couponSelect.disabled = true;
        couponSelect.innerHTML = '<option value="">Memuat...</option>';
        try {
          const data = await api(`/api/requests/${testRequestId}`);
          const couponRows = data.coupon_tests || [];
          couponSelect.innerHTML = couponRows.map(c => `<option value="${c.row_no}">${esc(couponRowLabel(c))}</option>`).join('')
            || '<option value="">Belum ada Coupon Test</option>';
          couponSelect.disabled = false;
        } catch (err) {
          couponSelect.innerHTML = '<option value="">Gagal memuat Coupon Test</option>';
          toast(err.message, 'error');
        }
      };

      const loadTests = async (testRequestId, rowNo) => {
        resetTestNameSelect('Memuat...');
        if (!testRequestId || !rowNo) { resetTestNameSelect('- Pilih Coupon Test dulu -'); return; }
        try {
          const data = await api(`/api/requests/${testRequestId}/coupon-tests/${rowNo}/available-tests`);
          availableTests = data.available || [];
          if (!availableTests.length) {
            let reason = 'Semua Jenis Pengujian pada Coupon ini sudah dibuat sheetnya';
            if (data.missing_qty && data.missing_qty.length) reason = `Qty belum diisi di Permintaan Uji untuk: ${data.missing_qty.join(', ')}`;
            else if (!data.checked_count) reason = 'Coupon ini belum memilih Jenis Pengujian di Permintaan Uji';
            testNameSelect.innerHTML = `<option value="">${esc(reason)}</option>`;
            testNameSelect.disabled = true;
            return;
          }
          testNameSelect.innerHTML = '<option value="">- Pilih -</option>' +
            availableTests.map(t => `<option value="${esc(t.test_name)}">${esc(t.test_name)} (Qty: ${esc(t.qty)})</option>`).join('');
          testNameSelect.disabled = false;
          if (data.missing_qty && data.missing_qty.length) {
            hintEl.textContent = `Belum bisa dibuat karena Qty kosong di Permintaan Uji: ${data.missing_qty.join(', ')}`;
          }
        } catch (err) {
          testNameSelect.innerHTML = '<option value="">Gagal memuat Jenis Pengujian</option>';
          toast(err.message, 'error');
        }
      };

      const applyChosenTest = () => {
        const chosen = availableTests.find(t => t.test_name === testNameSelect.value);
        if (!chosen) { shapeWrap.style.display = 'none'; qtyWrap.style.display = 'none'; return; }
        qtyWrap.style.display = '';
        qtyInput.value = chosen.qty;
        if (SPECIMEN_NO_SHAPE.includes(chosen.category)) {
          shapeWrap.style.display = 'none';
        } else {
          shapeWrap.style.display = '';
          shapeSelect.value = chosen.suggested_shape || 'flat';
        }
      };

      reqSelect.addEventListener('change', (e) => loadCoupons(e.target.value));
      couponSelect.addEventListener('change', () => loadTests(reqSelect.value, couponSelect.value));
      testNameSelect.addEventListener('change', applyChosenTest);

      document.getElementById('specCreateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const testRequestId = document.getElementById('specCreateRequest').value;
        if (!testRequestId) { toast('Pilih Permintaan Uji dulu', 'error'); return; }
        const couponRowNo = couponSelect.value;
        if (!couponRowNo) { toast('Pilih Coupon Test dulu', 'error'); return; }
        const testName = testNameSelect.value;
        if (!testName) { toast('Pilih Jenis Pengujian dulu', 'error'); return; }
        const chosen = availableTests.find(t => t.test_name === testName);
        const shape = chosen && !SPECIMEN_NO_SHAPE.includes(chosen.category) ? shapeSelect.value : null;
        try {
          const created = await api(`/api/requests/${testRequestId}/specimen-inspections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test_name: testName, shape, coupon_row_no: Number(couponRowNo) })
          });
          toast('Pengecekan Spesimen dibuat', 'success');
          state.specimenCreatorOpen = false;
          openSpecimenForm(created.id);
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      // Dari Dashboard / Tasks: isi Permintaan Uji (+ coupon + jenis pengujian bila ada) otomatis.
      const prefill = state.specimenCreatorPrefill;
      state.specimenCreatorPrefill = null;
      if (prefill && [...reqSelect.options].some(o => o.value === String(prefill.requestId))) {
        reqSelect.value = String(prefill.requestId);
        await loadCoupons(reqSelect.value);
        if (prefill.couponRowNo && [...couponSelect.options].some(o => o.value === String(prefill.couponRowNo))) {
          couponSelect.value = String(prefill.couponRowNo);
          await loadTests(reqSelect.value, couponSelect.value);
          if (prefill.testName && [...testNameSelect.options].some(o => o.value === prefill.testName)) {
            testNameSelect.value = prefill.testName;
            applyChosenTest();
          }
        }
      }
    }
  }

  // ---------- master data ----------

  const MASTER_TABS = [
    { key: 'welding-processes', label: 'Welding Process' },
    { key: 'welding-positions', label: 'Welding Position' },
    { key: 'ref-codes', label: 'Ref. Code' },
    { key: 'coupon-types', label: 'Coupon Type' },
    { key: 'test-methods', label: 'Metode Tes' },
    { key: 'wo-pics', label: 'PIC Work Order' },
    { key: 'customers', label: 'Customer' },
    { key: 'specimen-types', label: 'Tipe Spesimen' },
    { key: 'test-type-codes', label: 'Kode Jenis Pengujian' },
    { key: 'equipment', label: 'Equipment' }
  ];

  async function loadWoPics() {
    try {
      const r = await api('/api/master/wo-pics');
      WO_PICS = r.items;
    } catch (e) {
      WO_PICS = [];
    }
  }

  async function renderMasterData() {
    pageTitle.textContent = 'Master Data';
    pageSubtitle.textContent = 'Kelola daftar master yang dipakai sebagai pilihan di form';
    topbarActions.innerHTML = '';

    const activeTab = state.masterTab || MASTER_TABS[0].key;
    state.masterTab = activeTab;

    const tabsHtml = MASTER_TABS.map(t => `
      <button type="button" class="btn btn-sm ${t.key === activeTab ? 'btn-primary' : ''}" data-master-tab="${t.key}">${esc(t.label)}</button>
    `).join('');

    contentEl.innerHTML = `
      <div class="card" style="padding:16px 24px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap;">${tabsHtml}</div>
      </div>
      <div id="masterTabContent"><div class="card"><p class="muted">Memuat data...</p></div></div>
    `;

    contentEl.querySelectorAll('[data-master-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.masterTab = btn.dataset.masterTab;
        renderMasterData();
      });
    });

    if (activeTab === 'customers') {
      await renderCustomerMaster();
    } else if (activeTab === 'specimen-types') {
      await renderSpecimenTypeMaster();
    } else if (activeTab === 'test-type-codes') {
      await renderTestTypeCodeMaster();
    } else if (activeTab === 'equipment') {
      await renderEquipmentMaster();
    } else {
      await renderSimpleMaster(activeTab, MASTER_TABS.find(t => t.key === activeTab).label);
    }
  }

  async function renderSimpleMaster(key, label) {
    let items = [];
    try {
      items = (await api(`/api/master/${key}`)).items;
    } catch (e) {
      items = [];
    }

    const wrap = document.getElementById('masterTabContent');

    wrap.innerHTML = `
      <div class="card">
        <p class="section-title">Tambah ${esc(label)}</p>
        <form id="masterAddForm" class="form-grid" style="grid-template-columns: 1fr auto;">
          <div class="field">
            <label>Nama</label>
            <input type="text" id="masterNameInput" placeholder="${esc(label)}" autocomplete="off">
          </div>
          <div class="field" style="justify-content: flex-end;">
            <button type="submit" class="btn btn-primary">+ Tambah</button>
          </div>
        </form>
      </div>
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar ${esc(label)}</p>
          <p class="card-desc">${items.length} data tersimpan</p>
        </div>
        <div id="masterListArea"></div>
      </div>
    `;

    renderSearchablePaginatedTable({
      key: `master-${key}`,
      containerEl: document.getElementById('masterListArea'),
      allRows: items,
      searchFields: ['name'],
      searchPlaceholder: `Cari ${label}...`,
      emptyHtml: `<p class="muted" style="padding:0 24px 16px;">Belum ada data. Tambahkan lewat form di atas.</p>`,
      renderTableHtml: (pageRows) => `
        <table class="data-table">
          <thead><tr><th>Nama</th><th></th></tr></thead>
          <tbody>${pageRows.map(it => `
            <tr>
              <td>${esc(it.name)}</td>
              <td><button class="btn btn-sm btn-danger" data-master-del="${it.id}">Hapus</button></td>
            </tr>`).join('')}</tbody>
        </table>`,
      bindRowEvents: (container) => {
        container.querySelectorAll('[data-master-del]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Hapus data ini dari master?')) return;
            try {
              await api(`/api/master/${key}/${btn.dataset.masterDel}`, { method: 'DELETE' });
              toast('Data dihapus', 'success');
              renderMasterData();
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        });
      }
    });

    document.getElementById('masterAddForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('masterNameInput');
      const name = input.value.trim();
      if (!name) return;
      try {
        await api(`/api/master/${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        toast('Data ditambahkan', 'success');
        renderMasterData();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  async function renderCustomerMaster() {
    await loadCustomers();
    const wrap = document.getElementById('masterTabContent');

    wrap.innerHTML = `
      <div class="card">
        <p class="section-title">Tambah Customer</p>
        <form id="custAddForm" class="form-grid">
          <div class="field">
            <label>ID Perusahaan</label>
            <input type="text" id="custIdInput" placeholder="ID Perusahaan" autocomplete="off">
          </div>
          <div class="field">
            <label>Atas Nama Perusahaan</label>
            <input type="text" id="custOwnerInput" placeholder="Atas Nama Perusahaan" autocomplete="off">
          </div>
          <div class="field" style="justify-content: flex-end;">
            <button type="submit" class="btn btn-primary">+ Tambah</button>
          </div>
        </form>
      </div>
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar Customer</p>
          <p class="card-desc">${CUSTOMERS.length} data tersimpan</p>
        </div>
        <div id="custTableArea"></div>
      </div>
    `;

    renderSearchablePaginatedTable({
      key: 'customers',
      containerEl: document.getElementById('custTableArea'),
      allRows: CUSTOMERS,
      searchFields: ['customer_id', 'on_behalf_owner'],
      searchPlaceholder: 'Cari ID atau nama perusahaan...',
      renderTableHtml: (pageRows) => `
        <table class="data-table">
          <thead><tr><th>ID Perusahaan</th><th>Atas Nama Perusahaan</th><th></th></tr></thead>
          <tbody>${pageRows.map(c => `
            <tr>
              <td>${esc(c.customer_id)}</td>
              <td>${esc(c.on_behalf_owner)}</td>
              <td><button class="btn btn-sm btn-danger" data-cust-del="${c.id}">Hapus</button></td>
            </tr>`).join('')}</tbody>
        </table>`,
      bindRowEvents: (container) => {
        container.querySelectorAll('[data-cust-del]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Hapus customer ini dari master?')) return;
            try {
              await api(`/api/customers/${btn.dataset.custDel}`, { method: 'DELETE' });
              toast('Customer dihapus', 'success');
              renderMasterData();
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        });
      }
    });

    document.getElementById('custAddForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const customerId = document.getElementById('custIdInput').value.trim();
      const owner = document.getElementById('custOwnerInput').value.trim();
      if (!customerId || !owner) return;
      try {
        await api('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: customerId, on_behalf_owner: owner })
        });
        toast('Customer ditambahkan', 'success');
        renderMasterData();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function specimenCodeFields(category, shape) {
    if (category === 'tensile') {
      const base = [{ key: 'gauge_length_code', label: 'Gauge Length' }];
      base.push(shape === 'round' ? { key: 'diameter_code', label: 'Diameter' } : { key: 'width_code', label: 'Width' });
      if (shape !== 'round') base.push({ key: 'thickness_code', label: 'Thickness' });
      base.push(
        { key: 'radius_code', label: 'Radius' },
        { key: 'reduce_section_code', label: 'Reduce Section Length' },
        { key: 'total_length_code', label: 'Total Length' }
      );
      return base;
    }
    if (category === 'bending') {
      if (shape === 'round') return [{ key: 'diameter_code', label: 'Diameter' }, { key: 'length_code', label: 'Length' }];
      return [
        { key: 'width_code', label: 'Width' }, { key: 'thickness_code', label: 'Thickness' },
        { key: 'radius_code', label: 'Radius' }, { key: 'length_code', label: 'Length' }
      ];
    }
    if (category === 'nickbreak') {
      return [
        { key: 'width_code', label: 'Width' }, { key: 'thickness_code', label: 'Thickness' },
        { key: 'notch_depth_code', label: 'Notch Depth' }, { key: 'length_code', label: 'Length' }
      ];
    }
    if (category === 'hic') {
      return [{ key: 'width_code', label: 'Width' }, { key: 'thickness_code', label: 'Thickness' }, { key: 'length_code', label: 'Length' }];
    }
    return [
      { key: 'length_code', label: 'Length' }, { key: 'width_code', label: 'Width' }, { key: 'thickness_code', label: 'Thickness' }
    ];
  }

  async function renderSpecimenTypeMaster() {
    const wrap = document.getElementById('masterTabContent');
    state.specimenTypeCategory = state.specimenTypeCategory || 'tensile';
    state.specimenTypeShape = state.specimenTypeShape || 'flat';
    const category = state.specimenTypeCategory;
    const noShape = SPECIMEN_NO_SHAPE.includes(category);
    const shape = noShape ? '' : state.specimenTypeShape;
    const fields = specimenCodeFields(category, shape);

    let types = [];
    try {
      types = (await api(`/api/specimen-types?category=${category}&shape=${shape}`)).types;
    } catch (e) {
      types = [];
    }

    wrap.innerHTML = `
      <div class="card">
        <p class="section-title">Pilih Kategori</p>
        <div class="form-grid">
          <div class="field">
            <label>Kategori</label>
            <select id="stypeCategory">
              <option value="tensile" ${category === 'tensile' ? 'selected' : ''}>Tensile</option>
              <option value="bending" ${category === 'bending' ? 'selected' : ''}>Bending</option>
              <option value="charpy" ${category === 'charpy' ? 'selected' : ''}>Charpy Impact</option>
              <option value="nickbreak" ${category === 'nickbreak' ? 'selected' : ''}>Nick Break</option>
              <option value="hic" ${category === 'hic' ? 'selected' : ''}>HIC / SSCC / SCC</option>
            </select>
          </div>
          <div class="field" id="stypeShapeWrap" style="${noShape ? 'display:none;' : ''}">
            <label>Bentuk</label>
            <select id="stypeShape">
              <option value="flat" ${shape === 'flat' ? 'selected' : ''}>Flat</option>
              <option value="round" ${shape === 'round' ? 'selected' : ''}>Round</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card">
        <p class="section-title">Tambah Tipe Spesimen</p>
        <form id="stypeAddForm" class="form-grid">
          <div class="field">
            <label>Nama Tipe</label>
            <input type="text" id="stypeNameInput" placeholder="Nama Tipe Spesimen">
          </div>
          ${fields.map(f => `
            <div class="field">
              <label>${esc(f.label)} <span class="en">Code</span></label>
              <input type="text" data-stype-field="${f.key}" placeholder="${esc(f.label)} Code">
            </div>`).join('')}
          <div class="field" style="justify-content:flex-end;">
            <button type="submit" class="btn btn-primary">+ Tambah</button>
          </div>
        </form>
      </div>

      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar Tipe Spesimen &mdash; ${esc(SPECIMEN_CATEGORY_LABELS[category])}${shape ? ' - ' + esc(SPECIMEN_SHAPE_LABELS[shape]) : ''}</p>
          <p class="card-desc">${types.length} tipe tersimpan &mdash; dipakai untuk auto-isi kolom Code di form Pengecekan Spesimen</p>
        </div>
        <div id="stypeTableArea"></div>
      </div>
    `;

    renderSearchablePaginatedTable({
      key: `specimen-types-${category}-${shape}`,
      containerEl: document.getElementById('stypeTableArea'),
      allRows: types,
      searchFields: ['name'],
      searchPlaceholder: 'Cari Tipe Spesimen...',
      emptyHtml: `<p class="muted" style="padding:0 24px 16px;">Belum ada tipe untuk kombinasi ini. Tambahkan lewat form di atas.</p>`,
      renderTableHtml: (pageRows) => `
        <table class="data-table">
          <thead><tr><th>Nama Tipe</th>${fields.map(f => `<th>${esc(f.label)}</th>`).join('')}<th></th></tr></thead>
          <tbody>${pageRows.map(t => `
            <tr>
              <td>${esc(t.name)}</td>
              ${fields.map(f => `<td>${esc((t.code_values || {})[f.key] || '-')}</td>`).join('')}
              <td><button class="btn btn-sm btn-danger" data-stype-del="${t.id}">Hapus</button></td>
            </tr>`).join('')}</tbody>
        </table>`,
      bindRowEvents: (container) => {
        container.querySelectorAll('[data-stype-del]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Hapus tipe spesimen ini?')) return;
            try {
              await api(`/api/specimen-types/${btn.dataset.stypeDel}`, { method: 'DELETE' });
              toast('Tipe spesimen dihapus', 'success');
              renderSpecimenTypeMaster();
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        });
      }
    });

    document.getElementById('stypeCategory').addEventListener('change', (e) => {
      state.specimenTypeCategory = e.target.value;
      renderSpecimenTypeMaster();
    });
    const shapeSelectEl = document.getElementById('stypeShape');
    if (shapeSelectEl) {
      shapeSelectEl.addEventListener('change', (e) => {
        state.specimenTypeShape = e.target.value;
        renderSpecimenTypeMaster();
      });
    }

    document.getElementById('stypeAddForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('stypeNameInput').value.trim();
      if (!name) { toast('Nama tipe tidak boleh kosong', 'error'); return; }
      const codeValues = {};
      document.querySelectorAll('[data-stype-field]').forEach(input => {
        codeValues[input.dataset.stypeField] = input.value;
      });
      try {
        await api('/api/specimen-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, shape, name, code_values: codeValues })
        });
        toast('Tipe spesimen ditambahkan', 'success');
        renderSpecimenTypeMaster();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  async function renderTestTypeCodeMaster() {
    let codes = [];
    try {
      codes = (await api('/api/test-type-codes')).codes;
    } catch (e) {
      codes = [];
    }

    const wrap = document.getElementById('masterTabContent');

    wrap.innerHTML = `
      <div class="card">
        <p class="section-title">Tambah Jenis Pengujian</p>
        <form id="ttcAddForm" class="form-grid" style="grid-template-columns: 2fr 1fr auto;">
          <div class="field">
            <label>Jenis Pengujian</label>
            <input type="text" id="ttcNameInput" placeholder="Nama Jenis Pengujian">
          </div>
          <div class="field">
            <label>Kode</label>
            <input type="text" id="ttcCodeInput" placeholder="Kode">
          </div>
          <div class="field" style="justify-content:flex-end;">
            <button type="submit" class="btn btn-primary">+ Tambah</button>
          </div>
        </form>
      </div>
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar Kode Jenis Pengujian</p>
          <p class="card-desc">${codes.length} data tersimpan &mdash; dipakai untuk auto-isi Marking Specimen di Pengecekan Spesimen</p>
        </div>
        <div id="ttcTableArea"></div>
      </div>
    `;

    renderSearchablePaginatedTable({
      key: 'test-type-codes',
      containerEl: document.getElementById('ttcTableArea'),
      allRows: codes,
      searchFields: ['test_name', 'code'],
      searchPlaceholder: 'Cari Jenis Pengujian atau Kode...',
      renderTableHtml: (pageRows) => `
        <table class="data-table">
          <thead><tr><th>Jenis Pengujian</th><th>Kode</th><th></th></tr></thead>
          <tbody>${pageRows.map(c => `
            <tr>
              <td>${esc(c.test_name)}</td>
              <td><input type="text" data-ttc-name="${esc(c.test_name)}" value="${esc(c.code)}" style="width:80px;"></td>
              <td><button class="btn btn-sm btn-danger" data-ttc-del="${c.id}">Hapus</button></td>
            </tr>`).join('')}</tbody>
        </table>`,
      bindRowEvents: (container) => {
        container.querySelectorAll('[data-ttc-name]').forEach(input => {
          input.addEventListener('change', async () => {
            try {
              await api('/api/test-type-codes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test_name: input.dataset.ttcName, code: input.value.trim() })
              });
              toast('Kode diperbarui', 'success');
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        });
        container.querySelectorAll('[data-ttc-del]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Hapus kode ini?')) return;
            try {
              await api(`/api/test-type-codes/${btn.dataset.ttcDel}`, { method: 'DELETE' });
              toast('Kode dihapus', 'success');
              renderTestTypeCodeMaster();
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        });
      }
    });

    document.getElementById('ttcAddForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const testName = document.getElementById('ttcNameInput').value.trim();
      const code = document.getElementById('ttcCodeInput').value.trim();
      if (!testName || !code) { toast('Jenis Pengujian dan Kode tidak boleh kosong', 'error'); return; }
      try {
        await api('/api/test-type-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test_name: testName, code })
        });
        toast('Kode ditambahkan', 'success');
        renderTestTypeCodeMaster();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  async function loadEquipment() {
    try {
      EQUIPMENT = (await api('/api/equipment')).items;
    } catch (e) {
      EQUIPMENT = [];
    }
  }

  const EQUIPMENT_STATUS_OPTIONS = [
    ['active', 'Active'], ['maintenance', 'Under Maintenance'],
    ['calibration_due', 'Calibration Due'], ['out_of_service', 'Out of Service']
  ];
  const EQUIPMENT_STATUS_LABELS = Object.fromEntries(EQUIPMENT_STATUS_OPTIONS);

  function equipmentStatusBadge(eq) {
    const overdue = eq.next_calibration_due && eq.next_calibration_due < todayISODate() && eq.status !== 'out_of_service';
    const status = overdue && eq.status === 'active' ? 'calibration_due' : eq.status;
    return `<span class="eq-status eq-status-${esc(status)}">${esc(EQUIPMENT_STATUS_LABELS[status] || status)}</span>${
      overdue && eq.status !== 'calibration_due' ? ' <span class="eq-overdue-flag" title="Tanggal kalibrasi berikutnya sudah lewat">&#9888; Lewat jatuh tempo</span>' : ''}`;
  }

  function todayISODate() {
    return new Date().toISOString().slice(0, 10);
  }

  async function renderEquipmentMaster() {
    const wrap = document.getElementById('masterTabContent');
    let items = [];
    try {
      items = (await api('/api/equipment')).items;
    } catch (e) {
      items = [];
    }
    EQUIPMENT = items;

    const editing = state.equipmentEditingId ? items.find(i => i.id === state.equipmentEditingId) : null;
    const f = editing || {};

    wrap.innerHTML = `
      <div class="card">
        <p class="section-title">${editing ? `Edit Equipment — ${esc(editing.name)}` : 'Tambah Equipment'}</p>
        <form id="eqForm">
          <p class="subcard-title">Informasi Umum</p>
          <div class="form-grid">
            <div class="field"><label>Equipment ID</label><input type="text" name="equipment_id" value="${esc(f.equipment_id)}" placeholder="mis. EQ-UTM-01" ${editing ? '' : 'autocomplete="off"'}></div>
            <div class="field"><label>Equipment Name</label><input type="text" name="name" value="${esc(f.name)}" autocomplete="off"></div>
            <div class="field"><label>Category</label><input type="text" name="category" value="${esc(f.category)}" list="eqCategoryList" autocomplete="off" placeholder="mis. Mechanical Testing"></div>
            <div class="field"><label>Manufacturer</label><input type="text" name="manufacturer" value="${esc(f.manufacturer)}" autocomplete="off"></div>
            <div class="field"><label>Model</label><input type="text" name="model" value="${esc(f.model)}" autocomplete="off"></div>
            <div class="field"><label>Serial Number</label><input type="text" name="serial_number" value="${esc(f.serial_number)}" autocomplete="off"></div>
          </div>
          <p class="subcard-title" style="margin-top:16px;">Status</p>
          <div class="form-grid">
            <div class="field"><label>Status</label>
              <select name="status">${EQUIPMENT_STATUS_OPTIONS.map(([v, label]) => `<option value="${v}" ${(f.status || 'active') === v ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
            </div>
          </div>
          <p class="subcard-title" style="margin-top:16px;">Kalibrasi</p>
          <div class="form-grid">
            <div class="field"><label>Calibration Number</label><input type="text" name="calibration_number" value="${esc(f.calibration_number)}" autocomplete="off"></div>
            <div class="field"><label>Last Calibration Date</label><input type="date" name="last_calibration_date" value="${esc(f.last_calibration_date)}"></div>
            <div class="field"><label>Next Calibration Due</label><input type="date" name="next_calibration_due" value="${esc(f.next_calibration_due)}"></div>
          </div>
          <div class="form-actions">
            <div>${editing ? `<button type="button" class="btn" id="eqCancelEdit">Batal Edit</button>` : ''}</div>
            <div class="right"><button type="submit" class="btn btn-primary">${editing ? 'Simpan Perubahan' : '+ Tambah Equipment'}</button></div>
          </div>
        </form>
      </div>
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar Equipment</p>
          <p class="card-desc">${items.length} alat tersimpan &mdash; namanya menjadi saran di kolom Alat pada tahap Testing</p>
        </div>
        <div id="eqTableArea"></div>
      </div>
      <datalist id="eqCategoryList">${[...new Set(items.map(i => i.category).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    `;

    renderSearchablePaginatedTable({
      key: 'equipment',
      containerEl: document.getElementById('eqTableArea'),
      allRows: items,
      searchFields: ['equipment_id', 'name', 'category', 'manufacturer', 'serial_number'],
      searchPlaceholder: 'Cari Equipment ID, Nama, Category, atau Serial Number...',
      emptyHtml: `<p class="muted" style="padding:0 24px 16px;">Belum ada Equipment. Tambahkan lewat form di atas.</p>`,
      renderTableHtml: (pageRows) => `
        <table class="data-table">
          <thead><tr><th>Equipment ID</th><th>Nama</th><th>Category</th><th>Status</th><th>Next Calibration</th><th>Sertifikat</th><th></th></tr></thead>
          <tbody>${pageRows.map(eq => `
            <tr>
              <td><strong>${esc(eq.equipment_id)}</strong></td>
              <td>${esc(eq.name)}<br><span class="muted">${esc(eq.manufacturer) || '-'}${eq.model ? ' ' + esc(eq.model) : ''}</span></td>
              <td>${esc(eq.category) || '-'}</td>
              <td>${equipmentStatusBadge(eq)}</td>
              <td>${eq.next_calibration_due ? esc(formatDateOnly(eq.next_calibration_due)) : '-'}</td>
              <td>
                ${eq.has_certificate
                  ? `<a href="/api/equipment/${eq.id}/certificate" target="_blank" rel="noopener" class="btn btn-sm">Lihat</a> <button type="button" class="btn btn-sm btn-danger" data-eq-cert-del="${eq.id}">&times;</button>`
                  : `<button type="button" class="btn btn-sm" data-eq-cert-upload="${eq.id}">Unggah</button>`}
              </td>
              <td>
                <button class="btn btn-sm" data-eq-edit="${eq.id}">Edit</button>
                <button class="btn btn-sm btn-danger" data-eq-del="${eq.id}">Hapus</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>`,
      bindRowEvents: (container) => {
        container.querySelectorAll('[data-eq-edit]').forEach(btn => btn.addEventListener('click', () => {
          state.equipmentEditingId = Number(btn.dataset.eqEdit);
          renderEquipmentMaster();
        }));
        container.querySelectorAll('[data-eq-del]').forEach(btn => btn.addEventListener('click', async () => {
          if (!confirm('Hapus Equipment ini dari master?')) return;
          try {
            await api(`/api/equipment/${btn.dataset.eqDel}`, { method: 'DELETE' });
            toast('Equipment dihapus', 'success');
            if (state.equipmentEditingId === Number(btn.dataset.eqDel)) state.equipmentEditingId = null;
            renderEquipmentMaster();
          } catch (err) {
            toast(err.message, 'error');
          }
        }));
        container.querySelectorAll('[data-eq-cert-del]').forEach(btn => btn.addEventListener('click', async () => {
          if (!confirm('Hapus sertifikat kalibrasi ini?')) return;
          try {
            await api(`/api/equipment/${btn.dataset.eqCertDel}/certificate`, { method: 'DELETE' });
            toast('Sertifikat dihapus', 'success');
            renderEquipmentMaster();
          } catch (err) {
            toast(err.message, 'error');
          }
        }));
        container.querySelectorAll('[data-eq-cert-upload]').forEach(btn => btn.addEventListener('click', () => {
          uploadEquipmentCertificate(btn.dataset.eqCertUpload);
        }));
      }
    });

    document.getElementById('eqForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(e.target).entries());
      if (!payload.equipment_id.trim() || !payload.name.trim()) { toast('Equipment ID dan Equipment Name wajib diisi', 'error'); return; }
      try {
        if (editing) {
          await api(`/api/equipment/${editing.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
          toast('Equipment diperbarui', 'success');
          state.equipmentEditingId = null;
        } else {
          await api('/api/equipment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
          toast('Equipment ditambahkan', 'success');
        }
        renderEquipmentMaster();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    const cancelBtn = document.getElementById('eqCancelEdit');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { state.equipmentEditingId = null; renderEquipmentMaster(); });
  }

  function uploadEquipmentCertificate(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast('Ukuran sertifikat maksimal 10 MB', 'error'); return; }
      try {
        await api(`/api/equipment/${id}/certificate`, {
          method: 'POST',
          headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) },
          body: file
        });
        toast('Sertifikat diunggah', 'success');
        renderEquipmentMaster();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    input.click();
  }

  async function loadWeldingProcesses() {
    try {
      const r = await api('/api/welding-processes');
      WELDING_PROCESSES = r.weldingProcesses;
    } catch (e) {
      WELDING_PROCESSES = [];
    }
  }

  async function loadWeldingPositions() {
    try {
      const r = await api('/api/welding-positions');
      WELDING_POSITIONS = r.weldingPositions;
    } catch (e) {
      WELDING_POSITIONS = [];
    }
  }

  async function loadRefCodes() {
    try {
      const r = await api('/api/ref-codes');
      REF_CODES = r.refCodes;
    } catch (e) {
      REF_CODES = [];
    }
  }

  async function loadCouponTypes() {
    try {
      const r = await api('/api/coupon-types');
      COUPON_TYPES = r.couponTypes;
    } catch (e) {
      COUPON_TYPES = [];
    }
  }

  async function loadTestMethods() {
    try {
      const r = await api('/api/test-methods');
      TEST_METHODS = r.testMethods;
    } catch (e) {
      TEST_METHODS = [];
    }
  }

  async function loadCustomers() {
    try {
      const r = await api('/api/customers');
      CUSTOMERS = r.customers;
    } catch (e) {
      CUSTOMERS = [];
    }
  }

  function findOwnerByCustomerId(custId) {
    if (!custId) return null;
    const owners = [...new Set(CUSTOMERS.filter(c => c.customer_id === custId).map(c => c.on_behalf_owner))];
    return owners.length === 1 ? owners[0] : null;
  }

  function findCustomerIdByOwner(owner) {
    if (!owner) return null;
    const ids = [...new Set(CUSTOMERS.filter(c => c.on_behalf_owner === owner).map(c => c.customer_id))];
    return ids.length === 1 ? ids[0] : null;
  }

  async function init() {
    try {
      const r = await api('/api/test-types');
      TEST_TYPES = r.testTypes;
    } catch (e) {
      TEST_TYPES = [];
    }
    await loadWeldingProcesses();
    await loadWeldingPositions();
    await loadRefCodes();
    await loadCouponTypes();
    await loadWoPics();
    await loadTestMethods();
    await loadCustomers();
    await loadEquipment();
    render();
  }

  init();
})();

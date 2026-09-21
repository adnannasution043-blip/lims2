(function () {
  const contentEl = document.getElementById('content');
  const topbarActions = document.getElementById('topbarActions');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  const toastEl = document.getElementById('toast');

  let TEST_TYPES = [];
  let WO_STEPS = [];
  let WELDING_PROCESSES = [];
  let WELDING_POSITIONS = [];
  let REF_CODES = [];
  let COUPON_TYPES = [];
  let WO_PICS = [];
  let TEST_METHODS = [];
  let CUSTOMERS = [];
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
      } else if (key === 'timeline') {
        state.view = 'timeline';
        render();
      } else if (key === 'tasks') {
        state.view = 'wo-tasks';
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
    const draftWO = workOrders.filter(w => w.status !== 'final').length;
    const finalWO = workOrders.length - draftWO;
    const draftSpecimens = specimens.filter(s => s.status !== 'final').length;
    const finalSpecimens = specimens.length - draftSpecimens;

    const specimenRequestIds = new Set(specimens.map(s => s.test_request_id));
    const needsWO = requests.filter(r => r.status === 'final' && !r.work_order_id);
    const needsSpecimen = workOrders.filter(w => w.status === 'final' && !specimenRequestIds.has(w.test_request_id));
    const actionCount = needsWO.length + needsSpecimen.length;

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
      ...workOrders.map(w => ({ type: 'wo', label: `Work Order ${w.job_number}`, sub: w.company, status: w.status, created_at: w.created_at })),
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
            <p class="dash-stat-sub">${draftWO} draft &middot; ${finalWO} final</p>
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
                    <p class="dash-action-hint">Work Order Final, belum ada Pengecekan Spesimen</p>
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
                  <span class="badge badge-${a.status === 'final' ? 'final' : 'draft'}">${a.status === 'final' ? 'Final' : 'Draft'}</span>
                </div>`).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    contentEl.querySelectorAll('[data-action-wo]').forEach(btn =>
      btn.addEventListener('click', () => createWorkOrder(btn.dataset.actionWo)));
    contentEl.querySelectorAll('[data-action-spec]').forEach(btn =>
      btn.addEventListener('click', () => {
        state.view = 'specimen-list';
        state.specimenCreatorOpen = true;
        state.specimenCreatorPrefillRequestId = btn.dataset.actionSpec;
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
      else if (wo.status === 'final' && sheets.every(s => s.status === 'final')) stage = 'done';
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
          <div class="tl-title">${esc(st.title)}${st.status ? ` <span class="badge badge-${st.status === 'final' ? 'final' : 'draft'}">${st.status === 'final' ? 'Final' : 'Draft'}</span>` : ''}</div>
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
              Saya menyatakan bahwa seluruh data pada formulir Tinjauan Permintaan Pengujian ini telah saya periksa dengan benar dan saya <strong>menyetujui</strong> pengajuan permintaan pengujian ini sesuai dengan persyaratan yang berlaku.
              <span class="en">I confirm that all information on this Testing Requirements Review form has been checked and is correct, and I agree to submit this testing request in accordance with the applicable requirements.</span>
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
              <td><span class="badge badge-${r.status === 'final' ? 'final' : 'draft'}">${r.status === 'final' ? 'Final' : 'Draft'}</span></td>
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

  function renderWorkOrderForm() {
    const wo = state.woData || {};
    const tr = wo.test_request || {};

    pageTitle.textContent = 'Work Order';
    pageSubtitle.textContent = `Work Order — ${esc(tr.job_number || '')}`;
    topbarActions.innerHTML = `
      <button class="btn" id="btnWoBack">&larr; Kembali ke Daftar</button>
      <button type="button" class="btn" id="btnWoExportPdf">Export PDF</button>
    `;
    document.getElementById('btnWoBack').addEventListener('click', () => { state.view = 'wo-list'; render(); });
    document.getElementById('btnWoExportPdf').addEventListener('click', () =>
      window.open(`/work-orders/${state.woEditingId}/print`, '_blank'));

    const couponRows = wo.coupon_tests || [];
    const couponSummary = couponRows.map((row, idx) => {
      const types = [...(row.coupon_type || [])];
      if (row.coupon_type_other) types.push(row.coupon_type_other);
      const checkedItems = [
        ...(row.test_items || []).filter(ti => ti.checked),
        ...(row.other_tests || []).filter(ot => ot.test_name)
      ];
      const itemsText = checkedItems.length
        ? checkedItems.map(ti => `${esc(ti.test_name)} (Qty ${esc(ti.qty) || '-'}, ${esc(ti.method) || '-'})`).join('; ')
        : '-';
      return `
        <div class="wo-coupon-row">
          <div class="wo-coupon-summary">
            <strong>Coupon #${idx + 1}</strong> &mdash; ${esc(types.join(', ')) || '-'}<br>
            <span class="muted">${esc(row.material_type_grade) || '-'} &middot; Ref. Code: ${esc(row.ref_code) || '-'}</span><br>
            <span class="muted">Jenis Pengujian: ${itemsText}</span>
          </div>
          <div class="field">
            <label>Sample Marking</label>
            <input type="text" data-row-no="${row.row_no}" data-sample-marking value="${esc(row.sample_marking)}">
          </div>
        </div>`;
    }).join('');

    const stepFields = WO_STEPS.map(step => `
      <div class="field">
        <label>${esc(step.label)}</label>
        <select name="${step.key}">
          <option value="">-</option>
          ${WO_PICS.map(p => `<option value="${esc(p.name)}" ${wo[step.key] === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>`).join('');

    contentEl.innerHTML = `
      <div id="woProgressSlot" data-wo-id="${esc(wo.id)}"></div>
      <form id="woForm">

        <div class="card">
          <p class="section-title">Info Permintaan <span class="en">(dari Tinjauan Permintaan Pengujian, hanya baca)</span></p>
          <div class="form-grid">
            <div class="field"><label>Nomor Pekerjaan</label><input type="text" value="${esc(tr.job_number)}" disabled></div>
            <div class="field"><label>Tgl. Request</label><input type="text" value="${esc(tr.received_date)}" disabled></div>
            <div class="field"><label>Perusahaan</label><input type="text" value="${esc(tr.company)}" disabled></div>
            <div class="field"><label>Atas Nama Perusahaan</label><input type="text" value="${esc(tr.on_behalf_owner)}" disabled></div>
            <div class="field"><label>ID Perusahaan</label><input type="text" value="${esc(tr.customer_id)}" disabled></div>
            <div class="field"><label>Nama Projek</label><input type="text" value="${esc(tr.project_name)}" disabled></div>
            <div class="field"><label>Customer Witness</label><input type="text" value="${esc(tr.witness_status) || '-'}" disabled></div>
          </div>
        </div>

        <div class="card">
          <p class="section-title">Info Work Order</p>
          <div class="form-grid">
            <div class="field">
              <label>Tgl. Testing <span class="en">Testing Date</span></label>
              <input type="date" name="testing_date" value="${esc(wo.testing_date)}">
            </div>
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
          <p class="section-title">Sample Marking per Coupon Test</p>
          <div id="woCouponRows">${couponSummary || '<p class="muted">Tidak ada coupon test pada permintaan ini.</p>'}</div>
        </div>

        <div class="card">
          <p class="section-title">Description of Process</p>
          <div class="form-grid">${stepFields}</div>
        </div>

        <div class="card">
          <p class="section-title">Approval</p>
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
            <button type="submit" class="btn" data-status="draft">Simpan sebagai Draft</button>
            <button type="submit" class="btn btn-primary" data-status="final">Simpan &amp; Finalisasi</button>
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
    contentEl.querySelectorAll('button[type="submit"]').forEach(b => {
      b.addEventListener('click', () => { state.woPendingStatus = b.dataset.status; });
    });
  }

  async function onWorkOrderSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.status = state.woPendingStatus || 'draft';

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

  // ---------- work order: tasks (Receiving .. Released) ----------
  // Enam tahap per Work Order. Baris kerja (coupon, jenis pengujian, qty, sample marking)
  // datang dari server yang menurunkannya dari Permintaan Uji — form tahap hanya mengisi
  // hasil di atasnya, jadi tidak ada data yang diketik ulang. Detail Work Order hanya
  // MENAMPILKAN progress; semua form pengisian ada di menu Tasks.

  const WO_STAGE_ICONS = {
    receiving: '&#128229;', preparation: '&#9879;', testing: '&#128202;',
    reporting: '&#128196;', review: '&#9989;', released: '&#128228;'
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
  const RELEASE_METHODS = ['Email', 'Kurir', 'Portal Customer', 'Diambil Langsung'];

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

  function woProgressInfoHtml(p) {
    return `
      <div class="card wo-progress">
        <div class="wo-progress-head">
          <div>
            <p class="card-title">Progress Pengerjaan</p>
            <p class="card-desc" style="margin-bottom:12px;">${p.done_count} dari ${p.total} tahap selesai &mdash; halaman ini hanya menampilkan info, pengisian form ada di menu Tasks</p>
          </div>
          <div class="wo-progress-side">
            <div class="wo-progress-pct">${p.percent}%</div>
            <button type="button" class="btn btn-sm btn-primary" data-wo-stage="${firstOpenStageKey(p.stages)}">Kerjakan di Tasks &rarr;</button>
          </div>
        </div>
        <div class="wo-progress-bar"><div style="width:${p.percent}%"></div></div>
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
    const slot = document.getElementById('woProgressSlot');
    if (!slot) return;
    slot.innerHTML = `<div class="card"><p class="muted">Memuat progress pengerjaan...</p></div>`;
    let progress = null;
    try {
      progress = await api(`/api/work-orders/${woId}/progress`);
    } catch (e) { /* progress adalah tambahan; form Work Order tetap bisa dipakai */ }
    const current = document.getElementById('woProgressSlot');
    if (!current || current.dataset.woId !== String(woId)) return;
    if (!progress) { current.innerHTML = ''; return; }
    current.innerHTML = woProgressInfoHtml(progress);
    current.querySelectorAll('[data-wo-stage]').forEach(btn =>
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

  // Preparation = Pengecekan Spesimen (marking, cutting, machining specimen): tidak ada
  // form di sini, statusnya mengikuti sheet.
  function preparationBodyHtml(t) {
    const { stage, items, stats } = t;
    const empty = !stats.required && !stats.created;
    return `
      <div class="task-stats">
        <div class="task-stat"><b>${stats.required}</b><span>Sheet dibutuhkan</span></div>
        <div class="task-stat"><b>${stats.created}</b><span>Sheet dibuat</span></div>
        <div class="task-stat ok"><b>${stats.finals}</b><span>Sheet Final</span></div>
      </div>
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Pengecekan Spesimen <span class="en">(marking, cutting, machining specimen dicatat lewat sheet)</span></p>
          <button type="button" class="btn btn-sm" id="btnGotoSpecimenList">Buka Pengecekan Spesimen</button>
        </div>
        ${empty ? '<p class="muted">Tidak ada Jenis Pengujian pada Work Order ini yang memerlukan sheet Pengecekan Spesimen, jadi tahap ini otomatis tidak berlaku.</p>' : `
        <div class="task-table-wrap"><table class="task-table">
          <thead><tr><th>Coupon / Sample Marking</th><th>Jenis Pengujian</th><th>Status Sheet</th><th></th></tr></thead>
          <tbody>${items.map(it => `
            <tr>
              <td>${couponCellHtml(it)}</td>
              <td><strong>${esc(it.test_name)}</strong><br><span class="muted">Qty ${esc(it.qty) || '-'}</span></td>
              <td>${it.sheet_status
                ? `<span class="badge badge-${it.sheet_status === 'final' ? 'final' : 'draft'}">${it.sheet_status === 'final' ? 'Final' : 'Draft'}</span>`
                : '<span class="st-pill st-pending">Belum dibuat</span>'}</td>
              <td>${it.sheet_id
                ? `<button type="button" class="btn btn-sm" data-open-sheet="${it.sheet_id}">Buka</button>`
                : '<button type="button" class="btn btn-sm btn-primary" data-create-sheet>+ Buat Sheet</button>'}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`}
      </div>
      <div class="card">
        <p class="section-title">Info Tahap Preparation</p>
        <form id="woPrepForm" class="form-grid">
          <div class="field"><label>PIC Preparation</label>${woPicSelect(stage.pic)}</div>
          <div class="field" style="justify-content:flex-end; align-items:flex-start;"><button type="submit" class="btn">Simpan PIC</button></div>
        </form>
        <p class="muted" style="margin-top:12px;">Status tahap ini mengikuti sheet Pengecekan Spesimen secara otomatis: Selesai bila semua sheet yang dibutuhkan sudah dibuat dan berstatus Final.</p>
      </div>`;
  }

  function testingBodyHtml(t) {
    const s = t.stats;
    return `
      <datalist id="testEquipmentList">${TEST_EQUIPMENT.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
      <div class="task-stats">
        <div class="task-stat"><b>${s.total}</b><span>Total pengujian</span></div>
        <div class="task-stat ok"><b>${s.done}</b><span>Selesai</span></div>
        <div class="task-stat"><b>${s.running}</b><span>Sedang diuji</span></div>
        <div class="task-stat"><b>${s.total - s.done - s.running}</b><span>Belum dimulai</span></div>
      </div>
      <div class="card">
        <div class="task-card-head">
          <p class="section-title">Pelaksanaan Pengujian <span class="en">(baris otomatis dari Jenis Pengujian di Permintaan Uji)</span></p>
          <button type="button" class="btn btn-sm" id="btnMarkAllTested">Tandai semua selesai</button>
        </div>
        <div class="task-table-wrap"><table class="task-table">
          <thead><tr><th>Coupon / Sample Marking</th><th>Jenis Pengujian</th><th>Tgl. Uji</th><th>Alat</th><th>Status</th><th>Catatan</th></tr></thead>
          <tbody>${t.items.map(it => `
            <tr data-task-row data-key="${esc(it.key)}">
              <td>${couponCellHtml(it)}</td>
              <td><strong>${esc(it.test_name)}</strong><br><span class="muted">Qty ${esc(it.qty) || '-'}${it.method ? ' &middot; ' + esc(it.method) : ''}</span>
                ${it.sheet_status ? `<div style="margin-top:4px;">${sheetBadge(it.sheet_status)}</div>` : ''}</td>
              <td><input type="date" data-f="tested_date" value="${esc(it.tested_date)}"></td>
              <td><input type="text" data-f="equipment" list="testEquipmentList" autocomplete="off" value="${esc(it.equipment)}" placeholder="Pilih / ketik"></td>
              <td><select data-f="status">${woSelectOptions(TEST_STATUS_OPTIONS, it.status)}</select></td>
              <td><input type="text" data-f="note" value="${esc(it.note)}" placeholder="Catatan"></td>
            </tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada Jenis Pengujian yang dicentang pada Permintaan Uji.</td></tr>'}
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
    return `
      <div class="card">
        <p class="section-title">Laporan yang Dikirim <span class="en">(hanya baca, dari tahap sebelumnya)</span></p>
        <div class="info-facts">
          <div class="info-fact"><span>No. Laporan</span><strong>${esc(e.report_no) || '-'}</strong></div>
          <div class="info-fact"><span>Disetujui oleh</span><strong>${esc(e.approved_by) || '-'}</strong></div>
          <div class="info-fact"><span>Tanggal approval</span><strong>${e.approved_date ? esc(formatDateOnly(e.approved_date)) : '-'}</strong></div>
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

  function woTaskFormHtml(t) {
    const { stage, extra } = t;
    let extraFields = '';
    if (stage.key === 'receiving') {
      extraFields = `<div class="field"><label>Diserahkan oleh <span class="en">Delivered by</span></label><input type="text" name="delivered_by" value="${esc(extra.delivered_by)}" placeholder="Nama pengirim / kurir"></div>`;
    } else if (stage.key === 'reporting') {
      extraFields = `<div class="field"><label>No. Laporan <span class="en">Report No.</span></label><input type="text" name="report_no" value="${esc(extra.report_no)}"></div>`;
    } else if (stage.key === 'released') {
      extraFields = `
        <div class="field"><label>Cara Pengiriman</label>
          <select name="method"><option value="">- Pilih -</option>${RELEASE_METHODS.map(m =>
            `<option ${extra.method === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Penerima <span class="en">Recipient</span></label><input type="text" name="recipient" value="${esc(extra.recipient)}" placeholder="Nama / instansi penerima"></div>
        <div class="field"><label>No. Resi / Referensi</label><input type="text" name="reference" value="${esc(extra.reference)}" placeholder="No. resi, ID email, dll"></div>`;
    }
    const body = { receiving: receivingBodyHtml, testing: testingBodyHtml, reporting: reportingBodyHtml,
      review: reviewBodyHtml, released: releasedBodyHtml }[stage.key](t);
    const finalLabel = stage.key === 'released' ? 'Simpan &amp; Tandai Terkirim' : 'Simpan &amp; Selesaikan Tahap';

    return `
      <form id="woTaskForm">
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
            <button type="submit" class="btn btn-primary" data-status="final">${finalLabel}</button>
          </div>
        </div>
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

    if (stage.kind === 'derived') bindWoPreparationEvents(t);
    else bindWoTaskFormEvents(t);
  }

  function bindWoPreparationEvents(t) {
    const goSpecimenList = (prefill) => {
      state.view = 'specimen-list';
      if (prefill) {
        state.specimenCreatorOpen = true;
        state.specimenCreatorPrefillRequestId = t.work_order.test_request_id;
      }
      render();
    };
    document.getElementById('btnGotoSpecimenList').addEventListener('click', () => goSpecimenList(false));
    contentEl.querySelectorAll('[data-create-sheet]').forEach(btn => btn.addEventListener('click', () => goSpecimenList(true)));

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
    pageSubtitle.textContent = 'Pengerjaan tiap Work Order — Receiving hingga Released';
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

  // ---------- router ----------

  const VIEW_TO_NAV_KEY = {
    dashboard: 'dashboard',
    list: 'permintaan-uji', form: 'permintaan-uji',
    'wo-list': 'work-order', 'wo-form': 'work-order', 'wo-task': 'work-order',
    'wo-tasks': 'tasks',
    'master-data': 'manajemen-data',
    timeline: 'timeline',
    'specimen-list': 'pengecekan-spesimen', 'specimen-form': 'pengecekan-spesimen'
  };

  function syncNavActive() {
    const key = VIEW_TO_NAV_KEY[state.view];
    document.querySelectorAll('.nav-item[data-nav]').forEach(n => n.classList.toggle('active', n.dataset.nav === key));
  }

  function render() {
    syncNavActive();
    renderWorkflowSteps();
    if (state.view === 'dashboard') renderDashboard();
    else if (state.view === 'timeline') renderTimeline();
    else if (state.view === 'list') renderList();
    else if (state.view === 'wo-list') renderWorkOrderList();
    else if (state.view === 'wo-form') renderWorkOrderForm();
    else if (state.view === 'wo-tasks') renderWoTasks();
    else if (state.view === 'wo-task') renderWoTask();
    else if (state.view === 'master-data') renderMasterData();
    else if (state.view === 'specimen-list') renderSpecimenList();
    else if (state.view === 'specimen-form') renderSpecimenForm();
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

  const SPECIMEN_CATEGORY_LABELS = { tensile: 'Tensile', bending: 'Bending', charpy: 'Charpy Impact' };
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

  function specimenTableHtml(category, shape, rows) {
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

  function rerenderSpecimenRows() {
    document.getElementById('specimenRowsWrap').innerHTML =
      specimenTableHtml(state.specimenData.category, state.specimenData.shape, state.specimenRows);
    bindSpecRemoveButtons();
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
            <div class="field"><label>Kategori</label><input type="text" value="${esc(SPECIMEN_CATEGORY_LABELS[category] || '')}${shape ? ' - ' + esc(SPECIMEN_SHAPE_LABELS[shape]) : ''}" disabled></div>
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
    try {
      rows = await api('/api/specimen-inspections');
      requests = (await api('/api/requests')).filter(r => r.status === 'final');
    } catch (e) {
      contentEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat data: ${esc(e.message)}</p></div>`;
      return;
    }

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
      contentEl.innerHTML = creatorHtml + `
        <div class="card empty-state">
          <p class="card-title">Belum ada Pengecekan Spesimen</p>
          <p class="card-desc">Klik &ldquo;+ Buat Pengecekan Baru&rdquo; untuk mulai membuat sheet Tensile/Bending/Charpy Impact.</p>
        </div>`;
    } else {
      contentEl.innerHTML = creatorHtml + `
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

    if (state.specimenCreatorOpen) {
      const couponSelect = document.getElementById('specCreateCoupon');
      const testNameSelect = document.getElementById('specCreateTestName');
      const shapeWrap = document.getElementById('specCreateShapeWrap');
      const shapeSelect = document.getElementById('specCreateShape');
      const qtyWrap = document.getElementById('specCreateQtyWrap');
      const qtyInput = document.getElementById('specCreateQty');
      let availableTests = [];

      const resetTestNameSelect = (placeholder) => {
        availableTests = [];
        testNameSelect.innerHTML = `<option value="">${placeholder}</option>`;
        testNameSelect.disabled = true;
        shapeWrap.style.display = 'none';
        qtyWrap.style.display = 'none';
      };

      document.getElementById('specCreateRequest').addEventListener('change', async (e) => {
        const testRequestId = e.target.value;
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
      });

      couponSelect.addEventListener('change', async () => {
        const testRequestId = document.getElementById('specCreateRequest').value;
        const rowNo = couponSelect.value;
        resetTestNameSelect('Memuat...');
        if (!testRequestId || !rowNo) { resetTestNameSelect('- Pilih Coupon Test dulu -'); return; }
        try {
          const data = await api(`/api/requests/${testRequestId}/coupon-tests/${rowNo}/available-tests`);
          availableTests = data.available || [];
          if (!availableTests.length) {
            testNameSelect.innerHTML = '<option value="">Semua Jenis Pengujian pada Coupon ini sudah dibuat sheetnya</option>';
            testNameSelect.disabled = true;
            return;
          }
          testNameSelect.innerHTML = '<option value="">- Pilih -</option>' +
            availableTests.map(t => `<option value="${esc(t.test_name)}">${esc(t.test_name)} (Qty: ${esc(t.qty)})</option>`).join('');
          testNameSelect.disabled = false;
        } catch (err) {
          testNameSelect.innerHTML = '<option value="">Gagal memuat Jenis Pengujian</option>';
          toast(err.message, 'error');
        }
      });

      testNameSelect.addEventListener('change', () => {
        const chosen = availableTests.find(t => t.test_name === testNameSelect.value);
        if (!chosen) { shapeWrap.style.display = 'none'; qtyWrap.style.display = 'none'; return; }
        qtyWrap.style.display = '';
        qtyInput.value = chosen.qty;
        if (chosen.category === 'charpy') {
          shapeWrap.style.display = 'none';
        } else {
          shapeWrap.style.display = '';
          shapeSelect.value = chosen.suggested_shape || 'flat';
        }
      });

      document.getElementById('specCreateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const testRequestId = document.getElementById('specCreateRequest').value;
        if (!testRequestId) { toast('Pilih Permintaan Uji dulu', 'error'); return; }
        const couponRowNo = couponSelect.value;
        if (!couponRowNo) { toast('Pilih Coupon Test dulu', 'error'); return; }
        const testName = testNameSelect.value;
        if (!testName) { toast('Pilih Jenis Pengujian dulu', 'error'); return; }
        const chosen = availableTests.find(t => t.test_name === testName);
        const shape = chosen && chosen.category !== 'charpy' ? shapeSelect.value : null;
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

      if (state.specimenCreatorPrefillRequestId) {
        const prefillId = String(state.specimenCreatorPrefillRequestId);
        state.specimenCreatorPrefillRequestId = null;
        const reqSelect = document.getElementById('specCreateRequest');
        if ([...reqSelect.options].some(o => o.value === prefillId)) {
          reqSelect.value = prefillId;
          reqSelect.dispatchEvent(new Event('change'));
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
    { key: 'test-type-codes', label: 'Kode Jenis Pengujian' }
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
    return [
      { key: 'length_code', label: 'Length' }, { key: 'width_code', label: 'Width' }, { key: 'thickness_code', label: 'Thickness' }
    ];
  }

  async function renderSpecimenTypeMaster() {
    const wrap = document.getElementById('masterTabContent');
    state.specimenTypeCategory = state.specimenTypeCategory || 'tensile';
    state.specimenTypeShape = state.specimenTypeShape || 'flat';
    const category = state.specimenTypeCategory;
    const shape = category === 'charpy' ? '' : state.specimenTypeShape;
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
            </select>
          </div>
          <div class="field" id="stypeShapeWrap" style="${category === 'charpy' ? 'display:none;' : ''}">
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
    try {
      const r2 = await api('/api/work-order-steps');
      WO_STEPS = r2.steps;
    } catch (e) {
      WO_STEPS = [];
    }
    await loadWeldingProcesses();
    await loadWeldingPositions();
    await loadRefCodes();
    await loadCouponTypes();
    await loadWoPics();
    await loadTestMethods();
    await loadCustomers();
    render();
  }

  init();
})();

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
  let state = { view: 'list', editingId: null, couponRows: [] };

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
      test_items: TEST_TYPES.map(name => ({ test_name: name, checked: false, qty: '', method: '' }))
    };
  }

  // ---------- nav ----------

  document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.nav;
      if (key === 'permintaan-uji' || key === 'work-order' || key === 'manajemen-data') {
        document.querySelectorAll('.nav-item[data-nav]').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
      }
      if (key === 'permintaan-uji') {
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
      } else if (key === 'keluar') {
        toast('Logout belum tersedia di tahap ini', 'error');
      } else {
        toast('Modul ini akan tersedia di tahap berikutnya', 'error');
      }
    });
  });

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

    const trs = rows.map(r => `
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
      </tr>`).join('');

    contentEl.innerHTML = `
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar Tinjauan Permintaan Pengujian</p>
          <p class="card-desc">${rows.length} permintaan tersimpan</p>
        </div>
        <table class="data-table">
          <thead><tr>
            <th>No. Pekerjaan</th><th>Perusahaan</th><th>Nama Projek</th><th>Tgl. Diterima</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`;

    contentEl.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => openForm(btn.dataset.edit)));
    contentEl.querySelectorAll('[data-pdf]').forEach(btn =>
      btn.addEventListener('click', () => window.open(`/requests/${btn.dataset.pdf}/print`, '_blank')));
    contentEl.querySelectorAll('[data-open-wo]').forEach(btn =>
      btn.addEventListener('click', () => openWorkOrderForm(btn.dataset.openWo)));
    contentEl.querySelectorAll('[data-create-wo]').forEach(btn =>
      btn.addEventListener('click', () => createWorkOrder(btn.dataset.createWo)));
    contentEl.querySelectorAll('[data-del]').forEach(btn =>
      btn.addEventListener('click', () => deleteRequest(btn.dataset.del)));
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

  function renderForm() {
    const f = state.formData || {};
    pageTitle.textContent = state.editingId ? 'Edit Permintaan Uji' : 'Permintaan Uji Baru';
    pageSubtitle.textContent = 'Tinjauan Permintaan Pengujian — Testing Requirements Review';
    topbarActions.innerHTML = `
      <button class="btn" id="btnBack">&larr; Kembali ke Daftar</button>
      ${state.editingId ? `<button type="button" class="btn" id="btnExportPdf">Export PDF</button>` : ''}
    `;
    document.getElementById('btnBack').addEventListener('click', () => { state.view = 'list'; render(); });
    if (state.editingId) {
      document.getElementById('btnExportPdf').addEventListener('click', () =>
        window.open(`/requests/${state.editingId}/print`, '_blank'));
    }

    contentEl.innerHTML = `
      <datalist id="weldingProcessList">
        ${WELDING_PROCESSES.map(p => `<option value="${esc(p)}">`).join('')}
      </datalist>
      <datalist id="weldingPositionList">
        ${WELDING_POSITIONS.map(p => `<option value="${esc(p)}">`).join('')}
      </datalist>
      <datalist id="refCodeList">
        ${REF_CODES.map(p => `<option value="${esc(p)}">`).join('')}
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
              <input type="text" name="customer_id" value="${esc(f.customer_id)}">
            </div>
            <div class="field">
              <label>Atas Nama Perusahaan <span class="en">On Behalf Owner</span></label>
              <input type="text" name="on_behalf_owner" value="${esc(f.on_behalf_owner)}">
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
  }

  function couponRowHtml(row, idx) {
    const typeBoxes = COUPON_TYPES.map(t => `
      <label><input type="checkbox" data-row="${idx}" data-coupon-type="${t}" ${row.coupon_type.includes(t) ? 'checked' : ''}> ${t}</label>
    `).join('');

    const itemRows = row.test_items.map((ti, tIdx) => {
      const isCharpy = ti.test_name === 'Charpy Impact Test';
      return `
        <tr>
          <td><input type="checkbox" data-row="${idx}" data-item="${tIdx}" data-item-field="checked" ${ti.checked ? 'checked' : ''}></td>
          <td class="test-item-name">${esc(ti.test_name)}</td>
          <td style="width:70px;"><input type="text" data-row="${idx}" data-item="${tIdx}" data-item-field="qty" value="${esc(ti.qty)}" placeholder="Qty"></td>
          <td><input type="text" data-row="${idx}" data-item="${tIdx}" data-item-field="method" value="${esc(ti.method)}" placeholder="Metode tes"></td>
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
            </div>
          </td>
        </tr>` : ''}
      `;
    }).join('');

    return `
      <div class="coupon-row">
        <div class="coupon-row-header">
          <strong>Coupon Test #${idx + 1}</strong>
          <button type="button" class="btn btn-sm btn-danger" data-remove-row="${idx}">Hapus baris</button>
        </div>
        <div class="coupon-row-body">
          <div class="coupon-left">
            <div class="field full">
              <label>Coupon Test</label>
              <div class="checkbox-group">
                ${typeBoxes}
                <input type="text" style="width:140px;" placeholder="Lainnya (mis. Joint Pipe)" data-row="${idx}" data-coupon-type-other value="${esc(row.coupon_type_other)}">
              </div>
            </div>
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
            <div class="field full">
              <label>Testing Purpose</label>
              <input type="text" data-row="${idx}" data-field="testing_purpose" value="${esc(row.testing_purpose)}">
            </div>
            <div class="field full">
              <label>Note</label>
              <textarea data-row="${idx}" data-field="note">${esc(row.note)}</textarea>
            </div>
          </div>
          <div class="coupon-right">
            <table class="test-items-table">
              <thead><tr><th></th><th>Jenis Pengujian</th><th>Jumlah</th><th>Metode Tes</th></tr></thead>
              <tbody>${itemRows}</tbody>
            </table>
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

    const trs = rows.map(r => `
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
      </tr>`).join('');

    contentEl.innerHTML = `
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar Work Order</p>
          <p class="card-desc">${rows.length} Work Order tersimpan</p>
        </div>
        <table class="data-table">
          <thead><tr>
            <th>No. Pekerjaan</th><th>Perusahaan</th><th>Nama Projek</th><th>Tgl. Testing</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`;

    contentEl.querySelectorAll('[data-wo-edit]').forEach(btn =>
      btn.addEventListener('click', () => openWorkOrderForm(btn.dataset.woEdit)));
    contentEl.querySelectorAll('[data-wo-pdf]').forEach(btn =>
      btn.addEventListener('click', () => window.open(`/work-orders/${btn.dataset.woPdf}/print`, '_blank')));
    contentEl.querySelectorAll('[data-wo-del]').forEach(btn =>
      btn.addEventListener('click', () => deleteWorkOrder(btn.dataset.woDel)));
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
      const checkedItems = (row.test_items || []).filter(ti => ti.checked);
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
          <div class="form-grid">
            <div class="field">
              <label>Prepared by <span class="en">QA/QC Admin</span></label>
              <input type="text" name="prepared_by_name" value="${esc(wo.prepared_by_name)}">
            </div>
            <div class="field">
              <label>Checked by <span class="en">QA/QC Manager</span></label>
              <input type="text" name="checked_by_name" value="${esc(wo.checked_by_name)}">
            </div>
            <div class="field">
              <label>Approved by <span class="en">Technical Manager</span></label>
              <input type="text" name="approved_by_name" value="${esc(wo.approved_by_name)}">
            </div>
            <div class="field">
              <label>Tanggal Approval <span class="en">Date</span></label>
              <input type="date" name="approval_date" value="${esc(wo.approval_date)}">
            </div>
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

  // ---------- router ----------

  function render() {
    if (state.view === 'list') renderList();
    else if (state.view === 'wo-list') renderWorkOrderList();
    else if (state.view === 'wo-form') renderWorkOrderForm();
    else if (state.view === 'master-data') renderMasterData();
    else renderForm();
  }

  // ---------- master data: PIC Work Order ----------

  async function loadWoPics() {
    try {
      const r = await api('/api/wo-pics');
      WO_PICS = r.woPics;
    } catch (e) {
      WO_PICS = [];
    }
  }

  async function renderMasterData() {
    pageTitle.textContent = 'Master Data';
    pageSubtitle.textContent = 'Kelola daftar nama PIC untuk form Work Order';
    topbarActions.innerHTML = '';

    contentEl.innerHTML = `<div class="card"><p class="muted">Memuat data...</p></div>`;
    await loadWoPics();

    const rows = WO_PICS.map(p => `
      <tr>
        <td>${esc(p.name)}</td>
        <td><button class="btn btn-sm btn-danger" data-pic-del="${p.id}">Hapus</button></td>
      </tr>`).join('');

    contentEl.innerHTML = `
      <div class="card">
        <p class="section-title">Tambah PIC</p>
        <form id="picForm" class="form-grid" style="grid-template-columns: 1fr auto;">
          <div class="field">
            <label>Nama PIC</label>
            <input type="text" id="picNameInput" placeholder="Nama PIC" autocomplete="off">
          </div>
          <div class="field" style="justify-content: flex-end;">
            <button type="submit" class="btn btn-primary">+ Tambah</button>
          </div>
        </form>
      </div>
      <div class="card" style="padding:0;">
        <div style="padding:22px 24px 8px;">
          <p class="card-title">Daftar PIC</p>
          <p class="card-desc">${WO_PICS.length} PIC tersimpan &mdash; dipakai di dropdown Description of Process pada form Work Order</p>
        </div>
        ${WO_PICS.length ? `
        <table class="data-table">
          <thead><tr><th>Nama</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : `<p class="muted" style="padding:0 24px 22px;">Belum ada PIC. Tambahkan lewat form di atas.</p>`}
      </div>
    `;

    document.getElementById('picForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('picNameInput');
      const name = input.value.trim();
      if (!name) return;
      try {
        await api('/api/wo-pics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        toast('PIC ditambahkan', 'success');
        renderMasterData();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    contentEl.querySelectorAll('[data-pic-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Hapus PIC ini dari master data?')) return;
        try {
          await api(`/api/wo-pics/${btn.dataset.picDel}`, { method: 'DELETE' });
          toast('PIC dihapus', 'success');
          renderMasterData();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
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
    render();
  }

  init();
})();

// Dropdown dengan kotak pencarian untuk SEMUA <select> di aplikasi.
//
// Setiap <select> (kecuali `multiple` atau yang diberi atribut data-native) dibungkus tombol yang membuka daftar
// pilihan beserta kotak "Cari...". <select> aslinya tetap ada (disembunyikan) sehingga form, FormData, nilai yang
// diatur lewat kode, dan event 'change' yang sudah dipakai di app.js tetap bekerja tanpa perubahan: memilih dari daftar
// mengisi select.value lalu memicu event 'input' dan 'change' seperti dropdown biasa.
//
// Select yang muncul belakangan (halaman dirender ulang lewat innerHTML) dipasang otomatis lewat MutationObserver;
// label, status nonaktif, dan isi pilihan disinkronkan berkala karena kode sering mengubah select.value tanpa event.
(function () {
  const enhanced = new Set();
  let open = null;   // { sel, wrap, btn, pop, input, list, items, active }

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const canEnhance = el => el && el.tagName === 'SELECT' && !el.multiple && !('native' in el.dataset) && !el.dataset.ssReady;

  function labelOf(sel) {
    const o = sel.options[sel.selectedIndex];
    return o ? o.text : '';
  }

  function enhance(sel) {
    if (!canEnhance(sel)) return;
    sel.dataset.ssReady = '1';
    const wrap = document.createElement('span');
    wrap.className = 'ss';
    const inline = sel.getAttribute('style');
    if (inline) wrap.setAttribute('style', inline);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ss-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const aria = sel.getAttribute('aria-label') || (sel.id && document.querySelector(`label[for="${CSS.escape(sel.id)}"]`) || {}).textContent;
    if (aria) btn.setAttribute('aria-label', aria.trim());
    const text = document.createElement('span');
    text.className = 'ss-text';
    btn.appendChild(text);
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(btn);
    wrap.appendChild(sel);
    sel.classList.add('ss-native');
    sel.tabIndex = -1;
    const state = { sel, wrap, btn, text, last: null };
    enhanced.add(state);
    sync(state);

    btn.addEventListener('click', () => (open && open.sel === sel ? close() : openFor(state)));
    btn.addEventListener('keydown', e => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openFor(state); }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); openFor(state, e.key); }
    });
    sel.addEventListener('focus', () => btn.focus());   // kode lama yang memanggil select.focus()
    sel.addEventListener('change', () => sync(state));
  }

  function sync(st) {
    if (!st.sel.isConnected) {
      if (!st.wrap.isConnected || !st.wrap.contains(st.sel)) { enhanced.delete(st); if (st.wrap.isConnected && !st.wrap.contains(st.sel)) st.wrap.remove(); }
      return;
    }
    const label = labelOf(st.sel);
    const disabled = st.sel.disabled || st.sel.matches(':disabled');
    const hidden = st.sel.hidden;
    const key = label + '|' + disabled + '|' + hidden + '|' + st.sel.value;
    if (key === st.last) return;
    st.last = key;
    st.text.textContent = label || ' ';
    st.btn.title = label;
    st.btn.disabled = disabled;
    st.wrap.hidden = hidden;
    st.btn.classList.toggle('ss-placeholder', !st.sel.value);
  }

  function openFor(st, firstChar) {
    close();
    const { sel, btn } = st;
    const pop = document.createElement('div');
    pop.className = 'ss-pop';
    pop.innerHTML = '<input type="search" class="ss-search" placeholder="Cari..." autocomplete="off" aria-label="Cari pilihan"><ul class="ss-list" role="listbox"></ul>';
    document.body.appendChild(pop);
    const input = pop.querySelector('input'), list = pop.querySelector('ul');
    open = { ...st, pop, input, list, items: [], active: -1 };
    btn.setAttribute('aria-expanded', 'true');
    render('');
    place();
    input.focus();
    if (firstChar) { input.value = firstChar; render(firstChar); }

    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (open.active >= 0) choose(open.items[open.active]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') close();
    });
    list.addEventListener('mousedown', e => e.preventDefault());   // jaga fokus di kotak cari
    list.addEventListener('click', e => {
      const li = e.target.closest('li[data-i]');
      if (li && !li.classList.contains('disabled')) choose(Number(li.dataset.i));
    });
  }

  function render(q) {
    const { sel, list } = open;
    const words = norm(q).split(' ').filter(Boolean);
    const items = [];
    [...sel.options].forEach((o, i) => {
      if (o.hidden) return;
      const t = norm(o.text);
      if (words.every(w => t.includes(w))) items.push(i);
    });
    open.items = items;
    const selIdx = sel.selectedIndex;
    list.innerHTML = items.length
      ? items.map(i => {
        const o = sel.options[i];
        return `<li role="option" data-i="${i}" class="${o.disabled ? 'disabled' : ''}${i === selIdx ? ' selected' : ''}" aria-selected="${i === selIdx}">${escapeHtml(o.text) || '&nbsp;'}</li>`;
      }).join('')
      : '<li class="ss-empty">Tidak ada hasil</li>';
    const start = items.indexOf(selIdx);
    open.active = words.length ? items.findIndex(i => !sel.options[i].disabled) : start;
    highlight();
  }

  function move(d) {
    const { items, sel } = open;
    if (!items.length) return;
    let a = open.active;
    for (let n = 0; n < items.length; n++) {
      a = (a + d + items.length) % items.length;
      if (!sel.options[items[a]].disabled) break;
    }
    open.active = a;
    highlight();
  }

  function highlight() {
    const lis = open.list.querySelectorAll('li[data-i]');
    lis.forEach((li, k) => li.classList.toggle('active', k === open.active));
    const cur = lis[open.active];
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    const { sel } = open;
    const st = [...enhanced].find(x => x.sel === sel);
    if (sel.options[i] && !sel.options[i].disabled && sel.selectedIndex !== i) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close(true);
    if (st) sync(st);
  }

  function place() {
    const { btn, pop } = open;
    const r = btn.getBoundingClientRect();
    const w = Math.max(r.width, 240);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    pop.style.width = w + 'px';
    pop.style.left = left + 'px';
    const below = window.innerHeight - r.bottom, h = Math.min(pop.offsetHeight, 320);
    if (below < h + 12 && r.top > below) { pop.style.top = ''; pop.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
    else { pop.style.bottom = ''; pop.style.top = (r.bottom + 4) + 'px'; }
  }

  function close(refocus) {
    if (!open) return;
    const { pop, btn } = open;
    pop.remove();
    btn.setAttribute('aria-expanded', 'false');
    open = null;
    if (refocus) btn.focus();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  document.addEventListener('mousedown', e => { if (open && !open.pop.contains(e.target) && !open.btn.contains(e.target)) close(); });
  window.addEventListener('resize', () => close());
  window.addEventListener('scroll', e => { if (open && !open.pop.contains(e.target)) close(); }, true);

  const scan = root => {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'SELECT') enhance(root);
    else root.querySelectorAll && root.querySelectorAll('select').forEach(enhance);
  };
  const start = () => {
    scan(document.body);
    new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
    setInterval(() => enhanced.forEach(sync), 400);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

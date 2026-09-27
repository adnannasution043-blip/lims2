// Gambar teknis spesimen untuk halaman & cetak Pengecekan Spesimen.
// Satu modul dipakai bersama oleh browser (window.SpecimenDiagrams) dan server (require) supaya gambar
// di layar dan di PDF identik. Tensile Flat memakai gambar referensi dari Detech; bentuk lain digambar
// dengan gaya yang sama. Nilai (opsional) ditulis di samping label dimensi.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpecimenDiagrams = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LINE = '#3f68b5';

  const STYLE = `<style>
.sd-front{fill:#f3f6fb;stroke:${LINE};stroke-width:1.6}
.sd-top{fill:#e2e9f5;stroke:${LINE};stroke-width:1.6}
.sd-side{fill:#d3ddef;stroke:${LINE};stroke-width:1.6}
.sd-edge{stroke:${LINE};stroke-width:1.4;fill:none}
.sd-groove{fill:#b9c8e6;stroke:${LINE};stroke-width:1.4}
.sd-center{stroke:#9db3d9;stroke-width:1;fill:none;stroke-dasharray:14 4 3 4}
.sd-note{fill:#6b7a93;font-size:15px;font-family:'Segoe UI',Arial,sans-serif;font-style:italic}
.sd-dim line{stroke:${LINE};stroke-width:1.4;fill:none}
.sd-dim text{fill:${LINE};font-size:17px;font-family:'Segoe UI',Arial,sans-serif}
.sd-dim .sd-val{fill:#2b3a55;font-weight:600}
.sd-dim .hit{fill:transparent;stroke:none}
.sd-dim{cursor:pointer}
.sd-dot{fill:${LINE}}
.sd-dim.active line{stroke:#d4830f;stroke-width:2.4}
.sd-dim.active text{fill:#d4830f}
.sd-dim.active .sd-dot{fill:#d4830f}
</style>`;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function makeCtx(opts) {
    const id = (opts && opts.idPrefix) || 'sd';
    const unit = (opts && opts.unit) || 'mm';
    const values = (opts && opts.values) || {};
    const arrows = `marker-start="url(#${id}-arr)" marker-end="url(#${id}-arr)"`;
    const txt = v => (String(v).trim() !== '' && !isNaN(Number(v))) ? `${v} ${unit}` : String(v);
    const has = k => values[k] !== undefined && values[k] !== null && String(values[k]).trim() !== '';
    return {
      id,
      val: k => (has(k) ? `<tspan class="sd-val">= ${esc(txt(values[k]))}</tspan>` : ''),
      // garis dimensi berpanah
      arrow: (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${arrows}/>`,
      line: (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`,
      dim: (key, inner, hit) =>
        `<g class="sd-dim" data-key="${key}">${inner}<rect class="hit" x="${hit[0]}" y="${hit[1]}" width="${hit[2]}" height="${hit[3]}"/></g>`
    };
  }

  // ---------- Tensile Flat (gambar referensi Detech) ----------
  function tensileFlat(c) {
    const { dim, arrow, line, val } = c;
    return {
      viewBox: '0 0 1250 430',
      label: 'Diagram spesimen tensile flat',
      body: `
      <path class="sd-top" d="M20,90 L35,60 L365,60 A40 35 0 0 0 405,95 L955,95 A40 35 0 0 0 995,60 L1230,60 L1215,90 L980,90 A40 35 0 0 1 940,125 L390,125 A40 35 0 0 1 350,90 Z"/>
      <path class="sd-side" d="M1215,90 L1230,60 L1230,245 L1215,275 Z"/>
      <path class="sd-front" d="M20,90 L350,90 A40 35 0 0 0 390,125 L940,125 A40 35 0 0 0 980,90 L1215,90 L1215,275 L980,275 A40 35 0 0 0 940,240 L390,240 A40 35 0 0 0 350,275 L20,275 Z"/>
      <line class="sd-edge" x1="390" y1="125" x2="405" y2="95"/>
      <line class="sd-edge" x1="940" y1="125" x2="955" y2="95"/>
      ${dim('R', `${line(378, 80, 455, 40)}<path d="M378,80 l12,-1 l-5,-9 Z" fill="${LINE}"/><text x="462" y="46">Radius ${val('R')}</text>`, [370, 20, 300, 70])}
      ${['A', 'B', 'C'].map((p, i) => {
        const x = [480, 665, 850][i];
        return dim('T' + p, `${arrow(x, 125, x + 15, 95)}<text transform="translate(${x - 10},122) rotate(-65)">T${p}</text>`, [x - 25, 88, 50, 42]);
      }).join('')}
      ${['A', 'B', 'C'].map((p, i) => {
        const x = [480, 665, 850][i];
        return dim('W' + p, `${arrow(x, 129, x, 236)}<text transform="translate(${x - 10},183) rotate(-90)" text-anchor="middle">W${p} ${val('W' + p)}</text>`, [x - 35, 128, 45, 110]);
      }).join('')}
      ${dim('GL', `<circle class="sd-dot" cx="420" cy="165" r="5"/><circle class="sd-dot" cx="910" cy="165" r="5"/>${line(420, 170, 420, 312)}${line(910, 170, 910, 312)}${arrow(424, 305, 906, 305)}<text x="665" y="295" text-anchor="middle">Gauge Length ${val('GL')}</text>`, [415, 278, 500, 36])}
      ${dim('RS', `${line(390, 244, 390, 355)}${line(940, 244, 940, 355)}${arrow(394, 348, 936, 348)}<text x="665" y="338" text-anchor="middle">Reduced Section ${val('RS')}</text>`, [385, 320, 560, 36])}
      ${dim('TL', `${line(20, 279, 20, 398)}${line(1215, 279, 1215, 398)}${arrow(24, 392, 1211, 392)}<text x="617" y="382" text-anchor="middle">Total Length ${val('TL')}</text>`, [15, 364, 1205, 36])}`
    };
  }

  // ---------- Tensile Round (batang silinder, gaya sama) ----------
  function tensileRound(c) {
    const { dim, arrow, line, val, id } = c;
    return {
      viewBox: '0 0 1270 430',
      label: 'Diagram spesimen tensile round',
      body: `
      <path class="sd-front" style="fill:url(#${id}-cyl)" d="M20,115 L350,115 A40 35 0 0 0 390,150 L940,150 A40 35 0 0 0 980,115 L1230,115 L1230,265 L980,265 A40 35 0 0 0 940,230 L390,230 A40 35 0 0 0 350,265 L20,265 Z"/>
      <ellipse class="sd-side" cx="1230" cy="190" rx="18" ry="75"/>
      <path class="sd-edge" d="M20,115 A18 75 0 0 0 20,265"/>
      <line class="sd-center" x1="0" y1="190" x2="1270" y2="190"/>
      ${dim('R', `${line(378, 122, 455, 80)}<path d="M378,122 l12,-1 l-5,-9 Z" fill="${LINE}"/><text x="462" y="86">Radius ${val('R')}</text>`, [370, 60, 300, 70])}
      ${['A', 'B', 'C'].map((p, i) => {
        const x = [480, 665, 850][i];
        return dim('D' + p, `${arrow(x, 152, x, 228)}<text transform="translate(${x - 10},190) rotate(-90)" text-anchor="middle">D${p} ${val('D' + p)}</text>`, [x - 40, 148, 50, 84]);
      }).join('')}
      ${dim('GL', `<circle class="sd-dot" cx="420" cy="190" r="5"/><circle class="sd-dot" cx="910" cy="190" r="5"/>${line(420, 196, 420, 312)}${line(910, 196, 910, 312)}${arrow(424, 305, 906, 305)}<text x="665" y="295" text-anchor="middle">Gauge Length ${val('GL')}</text>`, [415, 278, 500, 36])}
      ${dim('RS', `${line(390, 234, 390, 355)}${line(940, 234, 940, 355)}${arrow(394, 348, 936, 348)}<text x="665" y="338" text-anchor="middle">Reduced Section ${val('RS')}</text>`, [385, 320, 560, 36])}
      ${dim('TL', `${line(20, 269, 20, 398)}${line(1230, 269, 1230, 398)}${arrow(24, 392, 1226, 392)}<text x="625" y="382" text-anchor="middle">Total Length ${val('TL')}</text>`, [15, 364, 1220, 36])}`
    };
  }

  // ---------- Balok 3D (Bending Flat, Charpy, Umum) ----------
  // fx0..fx1 = panjang (muka depan), fy0..fy1 = tebal, kedalaman miring = lebar.
  function block(c, o) {
    const { dim, arrow, line, val } = c;
    const fx0 = 150, fx1 = 750, fy0 = 150, fy1 = 225, dx = 60, dy = -44;
    const cx = (fx0 + fx1) / 2;
    const notch = !!o.notch;
    const frontPath = notch
      ? `M${fx0},${fy0} L${cx - 14},${fy0} L${cx},${fy0 + 22} L${cx + 14},${fy0} L${fx1},${fy0} L${fx1},${fy1} L${fx0},${fy1} Z`
      : `M${fx0},${fy0} L${fx1},${fy0} L${fx1},${fy1} L${fx0},${fy1} Z`;
    let body = `
      <path class="sd-top" d="M${fx0},${fy0} L${fx0 + dx},${fy0 + dy} L${fx1 + dx},${fy0 + dy} L${fx1},${fy0} Z"/>
      <path class="sd-side" d="M${fx1},${fy0} L${fx1 + dx},${fy0 + dy} L${fx1 + dx},${fy1 + dy} L${fx1},${fy1} Z"/>
      <path class="sd-front" d="${frontPath}"/>
      ${notch ? `<path class="sd-groove" d="M${cx - 14},${fy0} L${cx - 14 + dx},${fy0 + dy} L${cx + 14 + dx},${fy0 + dy} L${cx + 14},${fy0} Z"/>` : ''}
      ${dim('L', `${line(fx0, fy1 + 5, fx0, 290)}${line(fx1, fy1 + 5, fx1, 290)}${arrow(fx0 + 4, 282, fx1 - 4, 282)}<text x="${cx}" y="272" text-anchor="middle">Length ${val('L')}</text>`, [fx0, 255, fx1 - fx0, 36])}
      ${dim('T', `${line(fx0 - 5, fy0, 88, fy0)}${line(fx0 - 5, fy1, 88, fy1)}${arrow(96, fy0 + 3, 96, fy1 - 3)}<text transform="translate(82,${(fy0 + fy1) / 2}) rotate(-90)" text-anchor="middle">Thickness ${val('T')}</text>`, [60, fy0, 50, fy1 - fy0])}
      ${dim('W', `${line(fx1 + 5, fy1, fx1 + 40, fy1)}${line(fx1 + dx + 5, fy1 + dy, fx1 + dx + 40, fy1 + dy)}${arrow(fx1 + 36, fy1, fx1 + dx + 36, fy1 + dy)}<text x="${fx1 + dx + 46}" y="${fy1 + dy + 24}">Width ${val('W')}</text>`, [fx1 + 20, fy1 + dy - 6, 220, 80])}`;

    if (o.notchDims) {
      // jarak pusat V-notch ke ujung kiri / kanan, di atas sisi belakang muka atas
      const bx0 = fx0 + dx, bx1 = fx1 + dx, bcx = cx + dx, by = fy0 + dy;
      body += `
      ${dim('NL', `${line(bx0, by - 4, bx0, by - 40)}${line(bcx, by - 4, bcx, by - 40)}${arrow(bx0 + 4, by - 32, bcx - 4, by - 32)}<text x="${(bx0 + bcx) / 2}" y="${by - 40}" text-anchor="middle">Notch L ${val('NL')}</text>`, [bx0, by - 60, bcx - bx0, 60])}
      ${dim('NR', `${line(bx1, by - 4, bx1, by - 40)}${arrow(bcx + 4, by - 32, bx1 - 4, by - 32)}<text x="${(bcx + bx1) / 2}" y="${by - 40}" text-anchor="middle">Notch R ${val('NR')}</text>`, [bcx, by - 60, bx1 - bcx, 60])}`;
    }
    if (o.notch) {
      // detail profil V-notch (dicek dengan profile projector), di bawah label Width
      const oy = 62;
      body += `
      <text class="sd-note" x="880" y="${oy + 204}">Detail V-notch (diperbesar)</text>
      <g transform="translate(870,${oy + 250}) scale(1.2) translate(-870,-${oy + 250})">
      <path class="sd-edge" d="M870,${250 + oy} L925,${250 + oy} L950,${296 + oy} Q956,${306 + oy} 962,${296 + oy} L987,${250 + oy} L1040,${250 + oy}"/>
      ${dim('PW', `${line(925, 246 + oy, 925, 236 + oy)}${line(987, 246 + oy, 987, 236 + oy)}${arrow(929, 240 + oy, 983, 240 + oy)}<text x="956" y="${232 + oy}" text-anchor="middle">Width ${val('PW')}</text>`, [920, 215 + oy, 75, 34])}
      ${dim('PD', `${line(1000, 250 + oy, 1050, 250 + oy)}${line(966, 300 + oy, 1050, 300 + oy)}${arrow(1040, 254 + oy, 1040, 296 + oy)}<text transform="translate(1030,${275 + oy}) rotate(-90)" text-anchor="middle">Depth ${val('PD')}</text>`, [1010, 250 + oy, 50, 50])}
      ${dim('PR', `${line(936, 336 + oy, 955, 309 + oy)}<path d="M957,${306 + oy} L954.6,${316.5 + oy} L948,${311.9 + oy} Z" fill="${LINE}"/><text x="930" y="${346 + oy}" text-anchor="end">Radius ${val('PR')}</text>`, [820, 300 + oy, 140, 52])}
      </g>`;
    }
    if (o.radiusInset) {
      // penampang: lebar x tebal dengan radius sisi
      body += `
      <text class="sd-note" x="880" y="228">Penampang</text>
      <rect class="sd-front" x="880" y="245" width="110" height="60" rx="14"/>
      ${dim('R', `${line(1012, 328, 984, 300)}<path d="M982,298 L986,308 L992,302 Z" fill="${LINE}"/><text x="1018" y="334">Radius ${val('R')}</text>`, [960, 290, 240, 60])}`;
    }
    return {
      viewBox: o.notch ? '0 0 1120 440' : (o.radiusInset ? '0 0 1200 360' : '0 0 1080 360'),
      label: o.label,
      body
    };
  }

  const bendingFlat = c => block(c, { radiusInset: true, label: 'Diagram spesimen bending flat' });
  const charpy = c => block(c, { notch: true, notchDims: true, label: 'Diagram spesimen charpy impact (V-notch)' });
  const general = c => block(c, { label: 'Diagram spesimen umum' });

  // ---------- Bending Round (batang silinder) ----------
  function bendingRound(c) {
    const { dim, arrow, line, val, id } = c;
    return {
      viewBox: '0 0 1000 270',
      label: 'Diagram spesimen bending round',
      body: `
      <rect class="sd-front" style="fill:url(#${id}-cyl)" x="100" y="70" width="660" height="100"/>
      <ellipse class="sd-side" cx="760" cy="120" rx="18" ry="50"/>
      <path class="sd-edge" d="M100,70 A18 50 0 0 0 100,170"/>
      <line class="sd-center" x1="70" y1="120" x2="800" y2="120"/>
      ${dim('L', `${line(100, 176, 100, 236)}${line(760, 176, 760, 236)}${arrow(104, 228, 756, 228)}<text x="430" y="218" text-anchor="middle">Length ${val('L')}</text>`, [100, 200, 660, 40])}
      ${dim('D', `${line(772, 70, 830, 70)}${line(772, 170, 830, 170)}${arrow(822, 74, 822, 166)}<text x="836" y="126">Diameter ${val('D')}</text>`, [780, 66, 210, 108])}`
    };
  }

  const DIAGRAMS = {
    'tensile:flat': tensileFlat,
    'tensile:round': tensileRound,
    'bending:flat': bendingFlat,
    'bending:round': bendingRound,
    charpy,
    general
  };

  function keyOf(category, shape) {
    if (category === 'tensile' || category === 'bending') return `${category}:${shape === 'round' ? 'round' : 'flat'}`;
    return category === 'charpy' ? 'charpy' : 'general';
  }

  function defs(id) {
    return `<defs>
      <marker id="${id}-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="${LINE}"/></marker>
      <linearGradient id="${id}-cyl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4ecf8"/><stop offset="0.45" stop-color="#fbfcfe"/><stop offset="1" stop-color="#c3d0e8"/></linearGradient>
    </defs>`;
  }

  // opts: { values: {KEY: 'nilai'}, unit: 'mm', idPrefix: 'sd1' }
  function render(category, shape, opts) {
    const c = makeCtx(opts);
    const d = DIAGRAMS[keyOf(category, shape)](c);
    return `<svg class="sd-svg" viewBox="${d.viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(d.label)}" style="width:100%;height:auto;display:block;">${STYLE}${defs(c.id)}${d.body}</svg>`;
  }

  // Nilai "actual" satu baris data spesimen -> { KEY: nilai } untuk ditulis di gambar.
  function rowValues(category, shape, row) {
    const m = (row && row.measurements) || {};
    const pts = m.points || [];
    const out = {};
    const put = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = v; };
    if (category === 'tensile') {
      ['A', 'B', 'C'].forEach((p, i) => {
        if (shape === 'round') put('D' + p, (pts[i] || {}).diameter);
        else put('W' + p, (pts[i] || {}).width);
      });
      put('GL', m.gauge_length_actual); put('RS', m.reduce_section_actual);
      put('TL', m.total_length_actual); put('R', m.radius_actual);
    } else if (category === 'bending') {
      if (shape === 'round') { put('D', m.diameter_actual); put('L', m.length_actual); }
      else { put('W', m.width_actual); put('T', m.thickness_actual); put('R', m.radius_actual); put('L', m.length_actual); }
    } else if (category === 'charpy') {
      put('L', m.length_actual); put('W', m.width_actual); put('T', m.thickness_actual);
      put('NL', m.v_notch_l); put('NR', m.v_notch_r);
      if (m.profile_radius) out.PR = '✓';
      if (m.profile_depth) out.PD = '✓';
      if (m.profile_width) out.PW = '✓';
    } else {
      put('L', m.length_actual); put('W', m.width_actual); put('T', m.thickness_actual);
    }
    return out;
  }

  // Kolom/input tabel -> dimensi mana di gambar yang disorot. ds = { mfield, pfield, spoint }.
  function keysForInput(category, shape, ds) {
    const idx = ds.spoint !== undefined ? Number(ds.spoint) : null;
    if (idx !== null && ds.pfield) {
      const letter = 'ABC'[idx];
      if (!letter) return [];
      if (ds.pfield === 'width') return ['W' + letter];
      if (ds.pfield === 'thickness') return ['T' + letter];
      if (ds.pfield === 'diameter') return ['D' + letter];
      return [];
    }
    const base = String(ds.mfield || '').replace(/_(code|actual)$/, '');
    if (category === 'tensile') {
      const map = { gauge_length: ['GL'], reduce_section: ['RS'], total_length: ['TL'], radius: ['R'], width: ['WA', 'WB', 'WC'], thickness: ['TA', 'TB', 'TC'], diameter: ['DA', 'DB', 'DC'] };
      return map[base] || [];
    }
    if (category === 'bending') {
      return ({ width: ['W'], thickness: ['T'], radius: ['R'], length: ['L'], diameter: ['D'] })[base] || [];
    }
    if (category === 'charpy') {
      return ({ length: ['L'], width: ['W'], thickness: ['T'], v_notch_l: ['NL'], v_notch_r: ['NR'], profile_radius: ['PR'], profile_depth: ['PD'], profile_width: ['PW'] })[base] || [];
    }
    return ({ length: ['L'], width: ['W'], thickness: ['T'] })[base] || [];
  }

  return { render, rowValues, keysForInput, keyOf };
}));

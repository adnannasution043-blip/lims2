// Merender "template grid" (hasil tools/xlsx-to-template.js dari form Excel resmi Detech) menjadi HTML.
// Laporan yang dicetak = form aslinya; data diisikan ke sel lewat alamat sel ("J12") atau lewat daftar
// baris berulang (mis. baris spesimen). Teks asli form yang tidak di-override tetap tampil apa adanya
// (judul, label, Term & Conditions, alamat perusahaan, nama penandatangan).
const fs = require('fs');
const path = require('path');
const { esc } = require('./printCommon');

const cache = {};
function loadTemplate(key) {
  if (!cache[key]) cache[key] = JSON.parse(fs.readFileSync(path.join(__dirname, 'reportTemplates', `${key}.json`), 'utf8'));
  return cache[key];
}

// opts:
//   values   : { 'J12': 'DE.1.26.0001', ... }  -> menimpa teks sel
//   repeat   : { row: 39, items: [ {A: 'SB1', D: '...', O: 'Accepted'}, ... ] } -> baris `row` digandakan per item;
//              nilai per kolom huruf ({kolom: teks}); item kosong dilewati. Dipakai untuk baris spesimen.
//   hideRows : [nomorBaris,...] -> baris disembunyikan
//   spans    : { AD18: 7 } -> sel diperlebar (colspan) & rata kiri, untuk isian panjang di sel yang aslinya hanya memuat "-"
//   overlays : [ { ref:'AC50', toRef:'AJ54', src:dataUrl } ] -> gambar (mis. tanda tangan) menempel di sel `ref`, seluas kotak ref..toRef

// Kotak piksel dari sel `ref` sampai `toRef` (inklusif) di grid template.
function cellBox(tpl, ref, toRef) {
  const parse = r => { const m = /^([A-Z]+)(\d+)$/.exec(r); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { c: c - 1, r: Number(m[2]) }; };
  const a = parse(ref), b = parse(toRef || ref);
  const x = tpl.cols.slice(0, a.c).reduce((s, w) => s + w, 0);
  const w = tpl.cols.slice(a.c, b.c + 1).reduce((s, v) => s + v, 0);
  let y = 0, h = 0;
  for (const row of tpl.rows) { if (row.r < a.r) y += row.h; else if (row.r <= b.r) h += row.h; }
  return { x, y, w, h };
}

function renderTemplateTable(tpl, opts = {}) {
  const values = opts.values || {};
  const hide = new Set(opts.hideRows || []);
  const rep = opts.repeat;
  const widthTotal = tpl.cols.reduce((a, b) => a + b, 0);

  const hosts = {};
  (opts.overlays || []).filter(o => o.src).forEach(o => { hosts[o.ref] = { ...cellBox(tpl, o.ref, o.toRef), src: o.src }; });

  // Teks yang diisikan ke sel nowrap tanpa colspan meluber ke sel kosong di sebelahnya (seperti di Excel),
  // jadi sel itu menyerap sel kosong berikutnya supaya tidak terpotong.
  const spans = opts.spans || {};
  const spill = (cells) => {
    const out = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (spans[c.ref]) {
        out.push({ ...c, cs: spans[c.ref], left: true });
        i += spans[c.ref] - 1;
        continue;
      }
      const val = values[c.ref];
      if (!c.cs && !c.rs && val !== undefined && val !== '' && /white-space:nowrap/.test(tpl.styles[c.s]) && !/text-align:center/.test(tpl.styles[c.s])) {
        let span = 1;
        while (i + 1 < cells.length) {
          const n = cells[i + 1];
          if (n.cs || n.rs || (n.v !== undefined && n.v !== '') || (values[n.ref] !== undefined && values[n.ref] !== '') || hosts[n.ref]) break;
          span++; i++;
        }
        out.push(span > 1 ? { ...c, cs: span } : c);
      } else out.push(c);
    }
    return out;
  };

  const cellHtml = (cell, rowNo, override) => {
    const attrs = [];
    if (hosts[cell.ref]) {
      const h = hosts[cell.ref];
      if (cell.rs) attrs.push(`rowspan="${cell.rs}"`);
      if (cell.cs) attrs.push(`colspan="${cell.cs}"`);
      return `<td class="s${cell.s} rt-host" ${attrs.join(' ')}><img style="width:${h.w}px;height:${h.h}px" src="${esc(h.src)}" alt=""></td>`;
    }
    if (cell.rs) attrs.push(`rowspan="${cell.rs}"`);
    if (cell.cs) attrs.push(`colspan="${cell.cs}"`);
    const v = override !== undefined ? override : (values[cell.ref] !== undefined ? values[cell.ref] : cell.v);
    if (cell.left) attrs.push('style="text-align:left"');
    return `<td class="s${cell.s}" ${attrs.join(' ')}>${v === undefined || v === '' ? '' : esc(v)}</td>`;
  };

  const rowsHtml = [];
  for (const row of tpl.rows) {
    if (hide.has(row.r)) continue;
    if (rep && rep.row === row.r) {
      (rep.items || []).forEach((item, i) => {
        const cells = row.cells.map(c => {
          const letter = c.ref.replace(/\d+/g, '');
          return cellHtml(c, row.r, item[letter] !== undefined ? item[letter] : (c.v !== undefined && !rep.keepStatic ? '' : c.v));
        }).join('');
        rowsHtml.push(`<tr style="height:${row.h}px">${cells}</tr>`);
      });
      continue;
    }
    rowsHtml.push(`<tr style="height:${row.h}px">${spill(row.cells).map(c => cellHtml(c, row.r)).join('')}</tr>`);
  }

  const css = tpl.styles.map((s, i) => `.rt .s${i}{${s}}`).join('\n');
  const imgs = (tpl.images || []).map(im =>
    `<img class="rt-img" style="left:${im.x}px;top:${im.y}px;width:${im.w}px;height:${im.h}px" src="data:${im.mime};base64,${im.data}" alt="">`).join('');

  return {
    css: `.rt{position:relative;width:${widthTotal}px}
.rt table{border-collapse:collapse;table-layout:fixed;width:${widthTotal}px}
.rt td{padding:0 2px;overflow:hidden;line-height:1.15}
.rt-img{position:absolute;pointer-events:none}
.rt td.rt-host{position:relative;overflow:visible;padding:0}
.rt td.rt-host img{position:absolute;left:0;top:0;object-fit:contain;z-index:2}
${css}`,
    html: `<div class="rt"><table><colgroup>${tpl.cols.map(w => `<col style="width:${w}px">`).join('')}</colgroup><tbody>${rowsHtml.join('')}</tbody></table>${imgs}</div>`,
    width: widthTotal
  };
}

module.exports = { loadTemplate, renderTemplateTable, cellBox };

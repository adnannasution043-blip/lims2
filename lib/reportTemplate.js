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
//   blocks   : { from: 35, to: 38, items: [ { 'A+0': 'FWB-1', 'AF+0': 'Accepted', 'Y+1': 'No inclusion' }, ... ] }
//              -> seluruh baris from..to digandakan per item (rowspan ikut); nilai ditimpa per kolom+offset baris
//                 (offset 0 = baris `from`); sel yang tidak disebut tetap memakai teks bawaan form (mis. kriteria).
//   groups   : { row: 40, otherRow: 41, skipRows: [41,42], items: [ { first: {C:'Base Metal', P:'87'}, rows: [ {A:'1',H:'80'}, ... ] } ] }
//              -> blok baris dgn sel rowspan (mis. V-Notch Position & Average): tiap item = satu blok sebanyak
//              `rows.length` baris; baris pertama memakai pola `row` (sel ber-rowspan diperluas), sisanya pola `otherRow`.
//   photos   : { s1: dataUrl, ... } -> foto unggahan ditempatkan pada kotak `tpl.slots` (id sama); slot tanpa foto dibiarkan kosong
//   hideRows : [nomorBaris,...] -> baris disembunyikan
//   spans    : { AD18: 7 } -> sel diperlebar (colspan) & rata kiri, untuk isian panjang di sel yang aslinya hanya memuat "-"
//   overlays : [ { ref:'AC50', toRef:'AJ54', src:dataUrl } ] -> gambar (mis. tanda tangan) menempel di sel `ref`, seluas kotak ref..toRef

// Teks rumus: "a/b" menjadi pecahan bertingkat; "x 100" di ujung dibiarkan di luar pecahan; "P ̅" (P + garis atas) dan "_p" (subskrip).
function mathHtml(sh) {
  const fix = t => esc(t).split(' ̅').join('̄').split(' ̄').join('̄').replace(/_([A-Za-z0-9]+)/g, '<sub>$1</sub>');
  if (!sh.math || !sh.text.includes('/')) return fix(sh.text);
  let text = sh.text, tail = '';
  const m = /\s+x\s+([0-9]+)\s*$/.exec(text);
  if (m) { tail = ' × ' + m[1]; text = text.slice(0, m.index); }
  const i = text.indexOf('/');
  return `<span class="rt-frac"><span>${fix(text.slice(0, i))}</span><span>${fix(text.slice(i + 1))}</span></span>${esc(tail)}`;
}

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
      if (!c.rs && val !== undefined && val !== '' && /white-space:nowrap/.test(tpl.styles[c.s]) && !/text-align:center/.test(tpl.styles[c.s])) {
        let span = c.cs || 1;
        const startSpan = span;
        while (i + 1 < cells.length) {
          const n = cells[i + 1];
          if (n.rs || (n.v !== undefined && n.v !== '') || (values[n.ref] !== undefined && values[n.ref] !== '') || hosts[n.ref] || /border-(top|bottom|left|right):/.test(tpl.styles[n.s] || '')) break;
          span += n.cs || 1; i++;
        }
        if (span === startSpan) { out.push(c); continue; }
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
    return `<td class="s${cell.s}${cell.fill ? ' rt-fill' : ''}" ${attrs.join(' ')}>${v === undefined || v === '' ? '' : esc(v)}</td>`;
  };

  const grp = opts.groups;
  const blk = opts.blocks;
  const skip = new Set(grp ? grp.skipRows || [] : []);
  if (blk) for (let n = blk.from + 1; n <= blk.to; n++) skip.add(n);
  const blockRows = () => {
    const out = [];
    const tplRows = tpl.rows.filter(x => x.r >= blk.from && x.r <= blk.to);
    for (const item of blk.items || []) {
      for (const row of tplRows) {
        const off = row.r - blk.from;
        const cells = row.cells.map(c => {
          const key = c.ref.replace(/[0-9]+/g, '') + '+' + off;
          return cellHtml(item[key] !== undefined ? { ...c, fill: false } : c, row.r, item[key]);
        }).join('');
        out.push(`<tr style="height:${row.h}px">${cells}</tr>`);
      }
    }
    return out;
  };
  const rowByNo = n => tpl.rows.find(r => r.r === n);
  const groupRows = () => {
    const out = [];
    for (const item of grp.items || []) {
      const n = item.rows.length;
      item.rows.forEach((vals, i) => {
        const pattern = i === 0 ? rowByNo(grp.row) : rowByNo(grp.otherRow);
        const cells = pattern.cells.map(c => {
          const letter = c.ref.replace(/[0-9]+/g, '');
          const text = vals[letter] !== undefined ? vals[letter] : (i === 0 && item.first && item.first[letter] !== undefined ? item.first[letter] : '');
          const cc = { ...(c.rs ? { ...c, rs: n > 1 ? n : undefined } : c), fill: text !== '' };
          return cellHtml(cc, pattern.r, text);
        }).join('');
        out.push(`<tr style="height:${pattern.h}px">${cells}</tr>`);
      });
    }
    return out;
  };

  // Garis lurus dari drawing Excel disisipkan sebagai baris tabel setinggi 0 tepat di posisi aslinya, supaya ikut
  // bergeser bila baris di atasnya memanjang (posisi absolut akan menabrak isi form).
  const lines = (tpl.shapes || []).filter(sh => sh.type === 'line' && sh.h < 3).sort((a, b) => a.y - b.y);
  let nextLine = 0, yTop = 0;
  const lineRow = sh => `<tr class="rt-linerow" style="height:0"><td colspan="${tpl.cols.length}" style="padding:0;height:0;border-top:1px solid ${sh.color}"></td></tr>`;
  const rowsHtml = [];
  for (const row of tpl.rows) {
    while (nextLine < lines.length && lines[nextLine].y <= yTop + 0.5) rowsHtml.push(lineRow(lines[nextLine++]));
    yTop += row.h;
    if (hide.has(row.r) || skip.has(row.r)) continue;
    if (grp && grp.row === row.r) { rowsHtml.push(...groupRows()); continue; }
    if (blk && blk.from === row.r) { rowsHtml.push(...blockRows()); continue; }
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

  // `scope` memisahkan kelas gaya antar template bila beberapa form dicetak dalam satu dokumen (laporan + lampiran)
  const pre = opts.scope ? '.rt.' + opts.scope : '.rt';
  while (nextLine < lines.length) rowsHtml.push(lineRow(lines[nextLine++]));

  const css = tpl.styles.map((s, i) => `${pre} .s${i}{${s}}`).join('\n');
  const photoImgs = (tpl.slots || []).filter(sl => (opts.photos || {})[sl.id]).map(sl =>
    `<img class="rt-img" style="left:${sl.x}px;top:${sl.y}px;width:${sl.w}px;height:${sl.h}px;object-fit:contain" src="${esc(opts.photos[sl.id])}" alt="">`).join('');
  const imgs = photoImgs + (tpl.images || []).map(im =>
    `<img class="rt-img" style="left:${im.x}px;top:${im.y}px;width:${im.w}px;height:${im.h}px" src="data:${im.mime};base64,${im.data}" alt="">`).join('');

  // kotak teks & garis dari drawing Excel (rumus s/√n, garis pemisah footer)
  const shapesHtml = (tpl.shapes || []).map(sh => {
    if (sh.type === 'line') return sh.h < 3 ? '' : `<div class="rt-shape" style="left:${sh.x}px;top:${sh.y}px;width:${sh.w}px;height:${sh.h}px;border-top:1px solid ${sh.color}"></div>`;
    // simbol tunggal (mis. P berbar) menutupi huruf polos pada sel di bawahnya
    const cover = sh.math && !sh.text.includes('/') ? 'background:#fff;' : '';
    return `<div class="rt-shape rt-math" style="left:${sh.x}px;top:${sh.y}px;min-width:${sh.w}px;font-size:${sh.size}pt;${cover}">${mathHtml(sh)}</div>`;
  }).join('');

  return {
    css: `.rt{position:relative}
.rt table{border-collapse:collapse;table-layout:fixed}
.rt td{padding:0 2px;overflow:hidden;line-height:1.15}
.rt-img{position:absolute;pointer-events:none}
.rt-shape{position:absolute;pointer-events:none;white-space:nowrap}
.rt-math{font-family:'Cambria Math',Cambria,'Times New Roman',serif;line-height:1.1}
.rt-frac{display:inline-block;vertical-align:middle;text-align:center}
.rt-frac>span{display:block;padding:0 2px}
.rt-frac>span:first-child{border-bottom:1px solid #000}
.rt.rt td.rt-fill{font-family:'Arial Narrow',Arial,sans-serif;font-size:9pt}
.rt td.rt-host{position:relative;overflow:visible;padding:0}
.rt td.rt-host img{position:absolute;left:0;top:0;object-fit:contain;z-index:2}
${css}`,
    html: `<div class="rt ${opts.scope || ''}" style="width:${widthTotal}px"><table style="width:${widthTotal}px"><colgroup>${tpl.cols.map(w => `<col style="width:${w}px">`).join('')}</colgroup><tbody>${rowsHtml.join('')}</tbody></table>${imgs}${shapesHtml}</div>`,
    width: widthTotal
  };
}

module.exports = { loadTemplate, renderTemplateTable, cellBox };

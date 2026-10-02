// Alat pengembangan: membaca form Excel resmi Detech (.xlsx) dan menyimpannya sebagai "template grid" JSON
// (kolom, baris, sel, gabungan sel, gaya, gambar logo). Template ini dirender ulang jadi halaman cetak oleh
// lib/reportTemplate.js — jadi laporan yang dicetak mengikuti bentuk form aslinya, dan data hanya diisikan
// ke sel tertentu (lewat alamat sel seperti "J12"). Dijalankan manual saat form baru/berubah:
//   node tools/xlsx-to-template.js "<file.xlsx>" <output.json> [namaSheet]
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// ---------- pembaca zip minimal ----------
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('bukan file zip');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < total; n++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    const lhNameLen = buf.readUInt16LE(localOff + 26), lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.slice(dataStart, dataStart + csize);
    files[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const text = f => (f ? f.toString('utf8') : '');
const attr = (s, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(s); return m ? m[1] : null; };
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, '\n').replace(/&#13;/g, '').replace(/&amp;/g, '&');

function colLetterToIdx(letters) { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
function colIdxToLetter(i) { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function parseRef(ref) { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { c: colLetterToIdx(m[1]), r: Number(m[2]) - 1 }; }

// ---------- tema warna ----------
function themeColors(themeXml) {
  const out = [];
  const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  for (const k of order) {
    const m = new RegExp(`<a:${k}>([\\s\\S]*?)</a:${k}>`).exec(themeXml);
    let rgb = '000000';
    if (m) { const v = /(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"/.exec(m[1]); if (v) rgb = v[1]; }
    out.push(rgb);
  }
  return out;
}
function applyTint(hex, tint) {
  if (!tint) return hex;
  const ch = [0, 2, 4].map(i => parseInt(hex.substr(i, 2), 16));
  const out = ch.map(c => Math.round(tint < 0 ? c * (1 + tint) : c + (255 - c) * tint));
  return out.map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}
function colorOf(tag, theme) {
  if (!tag) return null;
  const rgb = attr(tag, 'rgb');
  if (rgb) return '#' + rgb.slice(-6);
  const th = attr(tag, 'theme');
  if (th !== null) return '#' + applyTint(theme[Number(th)] || '000000', Number(attr(tag, 'tint') || 0));
  const idx = attr(tag, 'indexed');
  if (idx !== null) return idx === '64' ? null : '#000000';
  return null;
}

// ---------- gaya ----------
function parseStyles(xml, theme) {
  const fonts = [...xml.matchAll(/<font>([\s\S]*?)<\/font>|<font\/>/g)].map(m => {
    const b = m[1] || '';
    const sz = attr((/<sz [^>]*>/.exec(b) || [''])[0], 'val');
    return {
      bold: /<b\/>|<b val="1"\/>/.test(b), italic: /<i\/>|<i val="1"\/>/.test(b), underline: /<u\/>|<u val="single"\/>/.test(b),
      size: sz ? Number(sz) : 11, color: colorOf((/<color [^>]*>/.exec(b) || [''])[0], theme),
      name: attr((/<name [^>]*>/.exec(b) || [''])[0], 'val') || 'Calibri'
    };
  });
  const fillsBlock = (/<fills[^>]*>([\s\S]*?)<\/fills>/.exec(xml) || [0, ''])[1];
  const fills = [...fillsBlock.matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map(m => {
    const pf = /<patternFill([^>]*)>([\s\S]*?)<\/patternFill>|<patternFill([^>]*)\/>/.exec(m[1]);
    if (!pf) return null;
    const type = attr(pf[1] || pf[3] || '', 'patternType');
    if (type !== 'solid') return null;
    return colorOf((/<fgColor [^>]*>/.exec(pf[2] || '') || [''])[0], theme);
  });
  const bordersBlock = (/<borders[^>]*>([\s\S]*?)<\/borders>/.exec(xml) || [0, ''])[1];
  const borders = [...bordersBlock.matchAll(/<border[^>]*?(?:\/>|>([\s\S]*?)<\/border>)/g)].map(m => {
    const b = m[1] || '';
    const side = name => {
      const mm = new RegExp(`<${name}( [^>]*)?(?:/>|>([\\s\\S]*?)</${name}>)`).exec(b);
      if (!mm) return null;
      const style = attr(mm[1] || '', 'style');
      if (!style) return null;
      return { style, color: colorOf((/<color [^>]*>/.exec(mm[2] || '') || [''])[0], theme) || '#000000' };
    };
    return { left: side('left'), right: side('right'), top: side('top'), bottom: side('bottom') };
  });
  const cellXfsBlock = (/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml) || [0, ''])[1];
  const xfs = [...cellXfsBlock.matchAll(/<xf ([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map(m => {
    const al = /<alignment ([^>]*)\/?>/.exec(m[2] || '');
    return {
      font: Number(attr(m[1], 'fontId') || 0), fill: Number(attr(m[1], 'fillId') || 0), border: Number(attr(m[1], 'borderId') || 0),
      h: al ? attr(al[1], 'horizontal') : null, v: al ? attr(al[1], 'vertical') : null, wrap: al ? attr(al[1], 'wrapText') === '1' : false,
      indent: al ? Number(attr(al[1], 'indent') || 0) : 0
    };
  });
  return { fonts, fills, borders, xfs };
}
const BORDER_W = { thin: 1, hair: 1, medium: 2, thick: 3, dotted: 1, dashed: 1, double: 3, mediumDashed: 2 };
const BORDER_S = { dotted: 'dotted', hair: 'dotted', dashed: 'dashed', mediumDashed: 'dashed', double: 'double' };

function xfToCss(xf, st) {
  const f = st.fonts[xf.font] || {};
  const css = [];
  css.push(`font-family:'${f.name || 'Calibri'}',Arial,sans-serif`);
  css.push(`font-size:${(f.size || 11)}pt`);
  if (f.bold) css.push('font-weight:700');
  if (f.italic) css.push('font-style:italic');
  if (f.underline) css.push('text-decoration:underline');
  if (f.color) css.push(`color:${f.color}`);
  const fill = st.fills[xf.fill];
  if (fill) css.push(`background:${fill}`);
  const b = st.borders[xf.border] || {};
  for (const side of ['left', 'right', 'top', 'bottom']) {
    if (b[side]) css.push(`border-${side}:${BORDER_W[b[side].style] || 1}px ${BORDER_S[b[side].style] || 'solid'} ${b[side].color}`);
  }
  const h = xf.h === 'centerContinuous' ? 'center' : xf.h;
  if (h && h !== 'general') css.push(`text-align:${h}`);
  css.push(`vertical-align:${xf.v === 'top' ? 'top' : xf.v === 'center' ? 'middle' : 'bottom'}`);
  if (xf.wrap) css.push('white-space:pre-wrap;word-break:break-word'); else css.push('white-space:nowrap');
  if (xf.indent) css.push(`padding-left:${xf.indent * 9}px`);
  return css.join(';');
}

// ---------- utama ----------
function convert(xlsxPath, sheetName) {
  const files = readZip(fs.readFileSync(xlsxPath));
  const wb = text(files['xl/workbook.xml']);
  const sheets = [...wb.matchAll(/<sheet ([^>]*?)\/>/g)].map(m => ({ name: decode(attr(m[1], 'name')), rid: attr(m[1], 'r:id'), state: attr(m[1], 'state') }));
  const chosen = sheetName ? sheets.find(s => s.name === sheetName) : sheets.find(s => s.state !== 'hidden');
  const rels = text(files['xl/_rels/workbook.xml.rels']);
  const target = new RegExp(`<Relationship [^>]*Id="${chosen.rid}"[^>]*>`).exec(rels)[0];
  const sheetPath = 'xl/' + attr(target, 'Target').replace(/^\/?(xl\/)?/, '');
  const sheetXml = text(files[sheetPath]);

  const theme = themeColors(text(files['xl/theme/theme1.xml']));
  const st = parseStyles(text(files['xl/styles.xml']), theme);

  const ssXml = text(files['xl/sharedStrings.xml']);
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));

  // kolom
  const colWidths = [];
  const colsBlock = /<cols>([\s\S]*?)<\/cols>/.exec(sheetXml);
  const defaultW = Number(attr((/<sheetFormatPr [^>]*>/.exec(sheetXml) || [''])[0], 'defaultColWidth') || 8.43);
  const defaultRowH = Number(attr((/<sheetFormatPr [^>]*>/.exec(sheetXml) || [''])[0], 'defaultRowHeight') || 15);
  const hiddenCols = new Set();
  if (colsBlock) {
    for (const m of colsBlock[1].matchAll(/<col ([^>]*?)\/>/g)) {
      const min = Number(attr(m[1], 'min')), max = Number(attr(m[1], 'max'));
      const w = Number(attr(m[1], 'width') || defaultW);
      for (let c = min; c <= Math.min(max, 200); c++) { colWidths[c - 1] = w; if (attr(m[1], 'hidden') === '1') hiddenCols.add(c - 1); }
    }
  }
  const widthPx = w => Math.round(w * 7 + 5);

  // sel gabungan
  const merges = [...sheetXml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g)].map(m => ({ a: parseRef(m[1]), b: parseRef(m[2]) }));

  // baris & sel
  const rowsOut = [];
  let maxCol = 0, maxRow = 0;
  const cellMap = new Map();
  for (const rm of sheetXml.matchAll(/<row ([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(rm[1], 'r')) - 1;
    const ht = attr(rm[1], 'ht');
    const hidden = attr(rm[1], 'hidden') === '1';
    const row = { r, h: hidden ? 0 : Math.round((ht ? Number(ht) : defaultRowH) * 96 / 72), cells: [] };
    for (const cm of (rm[2] || '').matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      const { c } = parseRef(ref);
      const t = attr(cm[1], 't');
      const s = Number(attr(cm[1], 's') || 0);
      const vRaw = (/<v>([\s\S]*?)<\/v>/.exec(cm[2] || '') || [0, null])[1];
      let v = '';
      if (t === 's' && vRaw !== null) v = shared[Number(vRaw)] || '';
      else if (t === 'inlineStr') v = decode([...(cm[2] || '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
      else if (vRaw !== null) v = decode(vRaw);
      const cell = { c, ref, v, s };
      row.cells.push(cell);
      cellMap.set(`${row.r}:${c}`, cell);
      maxCol = Math.max(maxCol, c); maxRow = Math.max(maxRow, r);
    }
    rowsOut.push(row);
  }
  for (const m of merges) { maxCol = Math.max(maxCol, m.b.c); maxRow = Math.max(maxRow, m.b.r); }

  const mergeAt = new Map();
  const covered = new Set();
  for (const m of merges) {
    mergeAt.set(`${m.a.r}:${m.a.c}`, { rs: m.b.r - m.a.r + 1, cs: m.b.c - m.a.c + 1 });
    for (let r = m.a.r; r <= m.b.r; r++) for (let c = m.a.c; c <= m.b.c; c++) if (r !== m.a.r || c !== m.a.c) covered.add(`${r}:${c}`);
  }

  // area cetak (nama terdefinisi Print_Area) membatasi kolom/baris
  let lastCol = maxCol, lastRow = maxRow, firstRow = 0;
  // Print_Area bisa ada per sheet (localSheetId = urutan sheet di workbook); ambil milik sheet terpilih.
  const chosenIdx = sheets.indexOf(chosen);
  const paAll = [...wb.matchAll(/<definedName([^>]*name="_xlnm.Print_Area"[^>]*)>([^<]*)<\/definedName>/g)];
  const paHit = paAll.find(m => Number(attr(m[1], 'localSheetId')) === chosenIdx) || (paAll.length === 1 ? paAll[0] : null);
  const pa = paHit ? [null, paHit[2]] : null;
  if (pa) {
    const m = /\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/.exec(pa[1]);
    if (m) { lastCol = colLetterToIdx(m[3]); lastRow = Number(m[4]) - 1; firstRow = Number(m[2]) - 1; }
  }

  // styles unik -> css
  const styleCss = [];
  const styleIdx = {};
  const cssFor = s => {
    const css = xfToCss(st.xfs[s] || st.xfs[0], st);
    if (!(css in styleIdx)) { styleIdx[css] = styleCss.length; styleCss.push(css); }
    return styleIdx[css];
  };

  const cols = [];
  for (let c = 0; c <= lastCol; c++) cols.push(hiddenCols.has(c) ? 0 : widthPx(colWidths[c] || defaultW));

  const rowByIdx = new Map(rowsOut.map(r => [r.r, r]));
  const gridRows = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const row = rowByIdx.get(r);
    const cells = [];
    for (let c = 0; c <= lastCol; c++) {
      if (covered.has(`${r}:${c}`)) continue;
      const cell = cellMap.get(`${r}:${c}`);
      const mg = mergeAt.get(`${r}:${c}`);
      // sel tanpa isi & tanpa gaya khusus tetap perlu ada agar tabel tidak bergeser
      const out = { c, ref: colIdxToLetter(c) + (r + 1), s: cssFor(cell ? cell.s : 0) };
      if (cell && cell.v !== '') out.v = cell.v;
      if (mg) { if (mg.rs > 1) out.rs = Math.min(mg.rs, lastRow - r + 1); if (mg.cs > 1) out.cs = Math.min(mg.cs, lastCol - c + 1); }
      cells.push(out);
    }
    // Seperti Excel: teks yang tidak di-wrap meluber ke sel kosong di kanannya. Di tabel HTML luberan itu
    // terpotong, jadi sel berteks digabung (colspan) dengan sel kosong berikutnya sampai bertemu sel berisi.
    for (let i = 0; i < cells.length; i++) {
      const cur = cells[i];
      const css = styleCss[cur.s] || '';
      if (cur.v === undefined || cur.rs || /white-space:pre-wrap|text-align:(center|right)/.test(css)) continue;
      while (i + 1 < cells.length) {
        const nxt = cells[i + 1];
        if (nxt.v !== undefined || nxt.rs) break;
        cur.cs = (cur.cs || 1) + (nxt.cs || 1);
        cells.splice(i + 1, 1);
      }
    }
    gridRows.push({ r: r + 1, h: row ? row.h : Math.round(defaultRowH * 96 / 72), cells });
  }

  // gambar (logo, dll.)
  const images = [];
  const shapes = [];   // kotak teks (mis. rumus) dan garis lurus dari drawing
  const drawRel = (new RegExp(`<Relationship [^>]*Type="[^"]*drawing"[^>]*>`).exec(text(files[sheetPath.replace('worksheets/', 'worksheets/_rels/') + '.rels'])) || [''])[0];
  if (drawRel) {
    const dTarget = attr(drawRel, 'Target').replace('../', 'xl/');
    const dXml = text(files[dTarget]);
    const dRels = text(files[dTarget.replace('drawings/', 'drawings/_rels/') + '.rels']);
    for (const am of dXml.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:\1>/g)) {
      const body = am[2];
      const from = /<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(-?\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(-?\d+)<\/xdr:rowOff><\/xdr:from>/.exec(body);
      const to = /<xdr:to><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(-?\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(-?\d+)<\/xdr:rowOff><\/xdr:to>/.exec(body);
      const emb = /r:embed="([^"]+)"/.exec(body);
      if (from && !emb) {
        const EMU0 = 9525;
        const colX0 = c => cols.slice(0, c).reduce((a, b) => a + b, 0);
        const rowY0 = r => gridRows.slice(0, Math.max(0, r - firstRow)).reduce((a, b) => a + b.h, 0);
        const x0 = colX0(Number(from[1])) + Number(from[2]) / EMU0;
        const y0 = rowY0(Number(from[3])) + Number(from[4]) / EMU0;
        const ext0 = /<xdr:ext cx="([0-9]+)" cy="([0-9]+)"/.exec(body);
        const x1 = to ? colX0(Number(to[1])) + Number(to[2]) / EMU0 : x0 + (ext0 ? Number(ext0[1]) / EMU0 : 0);
        const y1 = to ? rowY0(Number(to[3])) + Number(to[4]) / EMU0 : y0 + (ext0 ? Number(ext0[2]) / EMU0 : 0);
        if (/<xdr:cxnSp/.test(body)) {
          const col = /<a:ln[^>]*>\s*<a:solidFill>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(body);
          shapes.push({ type: 'line', x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0), color: col ? '#' + col[1] : '#000000' });
        } else if (/<xdr:sp[ >]/.test(body)) {
          // mc:Fallback memuat teks biasa (rumus Office Math tidak bisa dirender), pakai itu bila ada
          const src = /<mc:Fallback[\s\S]*?<\/mc:Fallback>/.exec(body);
          const txt = [...(src ? src[0] : body).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => decode(m[1])).join('');
          const sz = /sz="([0-9]+)"/.exec(src ? src[0] : body);
          if (txt.trim()) shapes.push({ type: 'text', x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0), text: txt, size: sz ? Number(sz[1]) / 100 : 9, math: body.includes('<a14:m>') });
        }
        continue;
      }
      if (!from || !emb) continue;
      const rel = new RegExp(`<Relationship [^>]*Id="${emb[1]}"[^>]*>`).exec(dRels);
      if (!rel) continue;
      const mediaPath = 'xl/' + attr(rel[0], 'Target').replace('../', '');
      const data = files[mediaPath];
      if (!data) continue;
      const ext = path.extname(mediaPath).slice(1).toLowerCase().replace('jpg', 'jpeg');
      // posisi dalam px dari pojok kiri atas area cetak
      const EMU = 9525;
      // kolom di luar area cetak dihitung selebar kolom default
      const colX = c => cols.slice(0, c).reduce((a, b) => a + b, 0) + Math.max(0, c - cols.length) * widthPx(defaultW);
      const rowY = r => gridRows.slice(0, Math.max(0, r - firstRow)).reduce((a, b) => a + b.h, 0);
      const totalW = cols.reduce((a, b) => a + b, 0);
      let x = colX(Number(from[1])) + Number(from[2]) / EMU;
      const y = rowY(Number(from[3])) + Number(from[4]) / EMU;
      const x2 = to ? colX(Number(to[1])) + Number(to[2]) / EMU : x + 150;
      const y2 = to ? rowY(Number(to[3])) + Number(to[4]) / EMU : y + 60;
      let w = x2 - x;
      const h = y2 - y;
      // Gambar yang jatuh di luar area cetak form (mis. logo akreditasi pada form MAT) digeser masuk ke tepi kanan,
      // dengan rasio asli gambar (lebar anchor di Excel bergantung pada lebar kolom default sehingga bisa gepeng).
      if (x + w > totalW && ext === 'png' && data.length > 24) w = h * (data.readUInt32BE(16) / data.readUInt32BE(20));
      if (x + w > totalW) x = Math.max(0, totalW - w);
      images.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), mime: 'image/' + ext, data: data.toString('base64') });
    }
  }

  const ps = (/<pageSetup [^>]*>/.exec(sheetXml) || [''])[0];
  return {
    source: path.basename(xlsxPath), sheet: chosen.name,
    orientation: attr(ps, 'orientation') || 'portrait', paper: attr(ps, 'paperSize') || '9',
    cols, rows: gridRows, styles: styleCss, images, shapes
  };
}

if (require.main === module) {
  const [, , input, output, sheet] = process.argv;
  if (!input || !output) { console.error('pemakaian: node tools/xlsx-to-template.js <file.xlsx> <output.json> [sheet]'); process.exit(1); }
  const tpl = convert(input, sheet);
  fs.writeFileSync(output, JSON.stringify(tpl));
  console.log(`${tpl.source} [${tpl.sheet}] -> ${output}: ${tpl.cols.length} kolom, ${tpl.rows.length} baris, ${tpl.images.length} gambar, ${tpl.styles.length} gaya`);
}

module.exports = { convert, readZip };

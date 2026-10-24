// (Dev tool) Melengkapi garis kanan/bawah sel gabungan pada template yang sudah ada, tanpa membuat ulang template.
// Konverter lama mengambil gaya sel gabungan hanya dari sel kiri-atas, padahal Excel menggambar garis kanan dari sel
// paling kanan dan garis bawah dari sel paling bawah rentangnya -> kotak di laporan terbuka di sisi kanan/bawah.
// Skrip ini membaca ulang Excel sumber (tools/xlsx-to-template.js yang sudah diperbaiki) dan hanya menambahkan
// garis yang hilang pada sel gabungan; isi, ukuran, dan penyesuaian template lainnya tidak disentuh.
// pemakaian: node tools/fix-merged-borders.js "<folder berisi Excel form, dicari sampai subfolder>"
const path = require('path');
const fs = require('fs');
const { convert } = require(path.join(__dirname, 'xlsx-to-template.js'));

const root = path.resolve(process.argv[2] || '.');
const tplDir = path.join(__dirname, '..', 'lib', 'reportTemplates');
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const all = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.xlsx$/i.test(e.name)) all.push(p); } })(root);
const byName = new Map(all.map(p => [norm(path.basename(p)), p]));
const sideOf = (css, side) => (new RegExp(`border-${side}:[^;]+`).exec(css) || [null])[0];

for (const f of fs.readdirSync(tplDir).filter(x => x.endsWith('.json'))) {
  const file = path.join(tplDir, f);
  const tpl = JSON.parse(fs.readFileSync(file, 'utf8'));
  const src = byName.get(norm(tpl.source || ''));
  if (!src) { console.log(f.padEnd(26), 'sumber tidak ditemukan:', tpl.source); continue; }
  let fresh;
  try { fresh = convert(src, tpl.sheet); } catch (e) { console.log(f.padEnd(26), 'gagal baca:', e.message); continue; }
  const freshCell = new Map();
  fresh.rows.forEach(row => row.cells.forEach(c => freshCell.set(c.ref, { ...c, css: fresh.styles[c.s] })));
  const idx = new Map(tpl.styles.map((s, i) => [s, i]));
  let fixed = 0;
  tpl.rows.forEach(row => row.cells.forEach(c => {
    if (!(c.rs > 1 || c.cs > 1)) return;
    const n = freshCell.get(c.ref);
    if (!n || (n.rs || 1) !== (c.rs || 1) || (n.cs || 1) !== (c.cs || 1)) return;
    let css = tpl.styles[c.s];
    for (const side of ['right', 'bottom']) {
      const b = sideOf(n.css, side);
      if (b && !sideOf(css, side)) css = css.replace(/;?$/, ';' + b);
    }
    if (css === tpl.styles[c.s]) return;
    if (!idx.has(css)) { idx.set(css, tpl.styles.length); tpl.styles.push(css); }
    c.s = idx.get(css);
    fixed++;
  }));
  if (fixed) fs.writeFileSync(file, JSON.stringify(tpl));
  console.log(f.padEnd(26), fixed ? `${fixed} sel gabungan dilengkapi garisnya` : '-');
}

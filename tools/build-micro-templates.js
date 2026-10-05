// (Dev tool) Membuat template folder "Microstructure Metallography Test": foto contoh pada form dibuang dan diganti `slots`
// (kotak foto yang diisi foto unggahan saat cetak). Form Thickness tidak punya foto contoh: kotak fotonya diambil dari
// sel gabungan "Microstructure Photograph".
// pemakaian: node tools/build-micro-templates.js "<folder Excel Microstructure Metallography Test>"
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..') + path.sep;
const { convert } = require(path.join(__dirname, 'xlsx-to-template.js'));
const dir = path.resolve(process.argv[2] || '.') + path.sep;
const file = (a, b) => fs.readdirSync(dir).find(f => f.includes(a) && (b ? f.includes(b) : !f.includes('THICKNESS')));
const jobs = [
  ['MICROSTRUCTURE-Weld', null, 'micro-weld'], ['MICROSTRUCTURE-MAT', null, 'micro-mat'],
  ['THICKNESS-Weld', 'THICKNESS', 'micro-thick-weld'], ['THICKNESS-MAT', 'THICKNESS', 'micro-thick-mat']
];
const PHOTO_MIN = 100000;   // panjang base64; foto jauh di atas logo
for (const [a, b, key] of jobs) {
  const t = convert(dir + file(a, b));
  const photos = t.images.filter(i => i.data.length >= PHOTO_MIN).sort((p, q) => p.x - q.x);
  t.images = t.images.filter(i => i.data.length < PHOTO_MIN);
  if (photos.length) {
    t.slots = photos.map((p, i) => ({ id: 's' + (i + 1), x: p.x, y: p.y, w: p.w, h: p.h, label: i === 0 ? 'Foto sampel (makro)' : 'Foto mikrostruktur' }));
  } else {
    // kotak foto = sel gabungan di bawah judul "Microstructure Photograph" (kolom H, rowspan besar)
    const head = t.rows.find(r => r.cells.some(c => String(c.v || '').trim() === 'Microstructure Photograph'));
    const body = t.rows.find(r => r.r === head.r + 1).cells.find(c => c.c === 7 && c.rs);
    const x = t.cols.slice(0, body.c).reduce((s, w) => s + w, 0), w = t.cols.slice(body.c, body.c + body.cs).reduce((s, v) => s + v, 0);
    const y = t.rows.filter(r => r.r < head.r + 1).reduce((s, r) => s + r.h, 0), h = t.rows.filter(r => r.r >= head.r + 1 && r.r < head.r + 1 + body.rs).reduce((s, r) => s + r.h, 0);
    t.slots = [{ id: 's1', x: x + 2, y: y + 2, w: w - 4, h: h - 4, label: 'Foto mikrostruktur' }];
  }
  fs.writeFileSync(ROOT + 'lib/reportTemplates/' + key + '.json', JSON.stringify(t));
  console.log(key.padEnd(18), 'rows', t.rows.length, 'slots', t.slots.map(s => [s.x, s.y, s.w, s.h].join(',')).join(' | '));
}

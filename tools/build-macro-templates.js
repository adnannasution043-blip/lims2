// (Dev tool) Membuat template folder "Macro-Etching & Examinition": foto makro contoh pada form dibuang dan diganti satu
// `slot` foto (diisi foto unggahan saat cetak); gambar statis kecil (logo, sketsa ukuran las fillet) tetap.
// pemakaian: node tools/build-macro-templates.js "<folder Excel Macro-Etching & Examinition>"
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..') + path.sep;
const { convert } = require(path.join(__dirname, 'xlsx-to-template.js'));
const dir = path.resolve(process.argv[2] || '.') + path.sep;
const file = s => fs.readdirSync(dir).find(f => f.includes(s));
const jobs = [['MAC-MAT', 'macro-mat'], ['(Butt Weld)', 'macro-butt'], ['(Fillet Weld)', 'macro-fillet']];
const PHOTO_MIN = 100000;   // panjang base64; foto jauh di atas logo/sketsa
for (const [src, key] of jobs) {
  const t = convert(dir + file(src));
  const photos = t.images.filter(i => i.data.length >= PHOTO_MIN);
  t.images = t.images.filter(i => i.data.length < PHOTO_MIN);
  t.slots = photos.map((p, i) => ({ id: 's' + (i + 1), x: p.x, y: p.y, w: p.w, h: p.h, label: 'Foto makro', fit: 'cover' }));   // foto memenuhi bingkai agar label putih di atasnya tetap di atas foto
  fs.writeFileSync(ROOT + 'lib/reportTemplates/' + key + '.json', JSON.stringify(t));
  console.log(key.padEnd(13), 'rows', t.rows.length, 'static img', t.images.length, 'slots', t.slots.map(s => [s.x, s.y, s.w, s.h].join(',')).join(' | '));
}

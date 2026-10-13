// (Dev tool) Membuat template form dari folder "Form Report_Update01" yang tidak memakai mesin tabel Tensile:
// Flaring (flaring), Peel (peel) dan Grain Size (grain + grain-att). Compression dan Geser Las dibuat oleh build-tensile-templates.js.
//   node tools/build-update01-templates.js "<folder Form Report_Update01>"
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..') + path.sep;
const { convert } = require(path.join(__dirname, 'xlsx-to-template.js'));
const base = path.resolve(process.argv[2] || '.');
const PHOTO_MIN = 100000;   // panjang base64; foto contoh jauh di atas logo
// Lampiran Grain Size: dua foto contoh dibuang dan diganti satu slot foto; kotak angka contoh (penomoran garis ukur) dibuang
const grainAtt = t => {
  const photos = t.images.filter(i => i.data.length >= PHOTO_MIN).sort((a, b) => b.w * b.h - a.w * a.h);
  t.images = t.images.filter(i => i.data.length < PHOTO_MIN);
  t.shapes = t.shapes.filter(sh => sh.type !== 'text');
  const p = photos[0];
  t.slots = [{ id: 's1', x: p.x, y: p.y, w: p.w, h: p.h, label: 'Foto mikrostruktur', fit: 'contain' }];
};
const jobs = [['Flaring Test', '14-FLAR', 'Sheet1', 'flaring'], ['Peel Test', '23-PEEL', 'Sheet1', 'peel'],
  ['Determination of the apparent grain size test', '22-GRAIN-SIZE', 'MT (grainsize)', 'grain'],
  ['Determination of the apparent grain size test', '22-GRAIN-SIZE', 'Att. 1', 'grain-att', grainAtt]];
for (const [folder, part, sheet, key, post] of jobs) {
  const dir = path.join(base, folder);
  if (!fs.existsSync(dir)) continue;
  const file = fs.readdirSync(dir).find(f => f.includes(part));
  if (!file) continue;
  const t = convert(path.join(dir, file), sheet);
  if (post) post(t);
  fs.writeFileSync(ROOT + 'lib/reportTemplates/' + key + '.json', JSON.stringify(t));
  console.log(key.padEnd(9), 'rows', t.rows.length);
}

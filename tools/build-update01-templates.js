// (Dev tool) Membuat template form dari folder "Form Report_Update01" yang tidak memakai mesin tabel Tensile:
// Flaring (flaring), Peel (peel) dan Grain Size (grain + grain-att) SEM-EDX (sem + sem-edx) Salt Spray (salt + salt-photos) dan HIC (hic + hic-result + hic-log). Compression dan Geser Las dibuat oleh build-tensile-templates.js.
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
// SEM-EDX: semua gambar selain logo (lebar 215) adalah foto/gambar tempel dari alat -> dijadikan slot foto
const semSlots = labels => t => {
  const pics = t.images.filter(i => i.w !== 215).sort((a, b) => a.y - b.y);
  t.images = t.images.filter(i => i.w === 215);
  t.slots = pics.map((p, i) => ({ id: 's' + (i + 1), x: p.x, y: p.y, w: p.w, h: p.h, label: labels[i] || 'Gambar', fit: 'contain' }));
};
// Salt Spray: empat foto contoh (Before/After x Front/Back) -> empat slot, urut: baris atas kiri-kanan, baris bawah kiri-kanan
const saltSlots = t => {
  const pics = t.images.filter(i => i.w !== 215).sort((a, b) => ((a.y > 450 ? 1 : 0) * 10000 + a.x) - ((b.y > 450 ? 1 : 0) * 10000 + b.x));
  t.images = t.images.filter(i => i.w === 215);
  const labels = ['Before - Front Side', 'After - Front Side', 'Before - Back Side', 'After - Back Side'];
  t.slots = pics.map((p, i) => ({ id: 's' + (i + 1), x: p.x, y: p.y, w: p.w, h: p.h, label: labels[i], fit: 'contain' }));
};
const jobs = [['Flaring Test', '14-FLAR', 'Sheet1', 'flaring'], ['Peel Test', '23-PEEL', 'Sheet1', 'peel'],
  ['Determination of the apparent grain size test', '22-GRAIN-SIZE', 'MT (grainsize)', 'grain'],
  ['Determination of the apparent grain size test', '22-GRAIN-SIZE', 'Att. 1', 'grain-att', grainAtt],
  ['Sem-EDX test', 'SEM-EDX', '1', 'sem', semSlots(['Foto SEM'])],
  ['Sem-EDX test', 'SEM-EDX', '2', 'sem-edx', semSlots(['Spektrum EDX', 'Tabel hasil EDX'])],
  ['Salt Spray Test', 'SALT-SPRAY', '1', 'salt'],
  ['Salt Spray Test', 'SALT-SPRAY', '2', 'salt-photos', saltSlots],
  ['Hydrogen Induced Cracking Test (HIC)', 'HIC-MAT', '1', 'hic'],
  ['Hydrogen Induced Cracking Test (HIC)', 'HIC-MAT', '2', 'hic-result'],
  ['Hydrogen Induced Cracking Test (HIC)', 'HIC-MAT', '3', 'hic-log']];
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

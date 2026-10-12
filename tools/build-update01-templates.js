// (Dev tool) Membuat template form dari folder "Form Report_Update01" yang tidak memakai mesin tabel Tensile:
// Flaring (flaring) dan Peel (peel). Compression dan Geser Las dibuat oleh build-tensile-templates.js.
//   node tools/build-update01-templates.js "<folder Form Report_Update01>"
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..') + path.sep;
const { convert } = require(path.join(__dirname, 'xlsx-to-template.js'));
const base = path.resolve(process.argv[2] || '.');
const jobs = [['Flaring Test', '14-FLAR', 'Sheet1', 'flaring'], ['Peel Test', '23-PEEL', 'Sheet1', 'peel']];
for (const [folder, part, sheet, key] of jobs) {
  const dir = path.join(base, folder);
  if (!fs.existsSync(dir)) continue;
  const file = fs.readdirSync(dir).find(f => f.includes(part));
  if (!file) continue;
  const t = convert(path.join(dir, file), sheet);
  fs.writeFileSync(ROOT + 'lib/reportTemplates/' + key + '.json', JSON.stringify(t));
  console.log(key.padEnd(9), 'rows', t.rows.length);
}

// (Dev tool) Membuat template folder "Tensile Test" (5 form) dan "Through Thickness Test" (1 form, tn-ttt). Nama sheet laporan
// berbeda-beda per workbook. Jalankan sekali per folder:
//   node tools/build-tensile-templates.js "<folder Excel Tensile Test>"
//   node tools/build-tensile-templates.js "<folder Excel Through Thickness Test>"
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..') + path.sep;
const { convert } = require(path.join(__dirname, 'xlsx-to-template.js'));
const dir = path.resolve(process.argv[2] || '.') + path.sep;
const jobs = [['FULL.SEC', 'Sheet1', 'tn-full'], ['RED.SEC', 'Sheet1', 'tn-red'], ['TENSILE-Bolt', 'Sheet1 (2)', 'tn-bolt'], ['TENSILE-MAT', '8 TS (1)', 'tn-mat'], ['All.Weld', 'Sheet1', 'tn-weld'], ['TTT-MAT', 'Sheet1', 'tn-ttt']];
for (const [part, sheet, key] of jobs) {
  const file = fs.readdirSync(dir).find(f => f.includes(part));
  if (!file) continue;   // form milik folder lain
  const t = convert(dir + file, sheet);
  fs.writeFileSync(ROOT + 'lib/reportTemplates/' + key + '.json', JSON.stringify(t));
  console.log(key.padEnd(9), 'rows', t.rows.length);
}

// Menjalankan semua tes di folder ini: `npm test`.
//
// Tes memakai database palsu (pool tiruan di dalam tiap file), jadi tidak butuh Postgres maupun server yang berjalan.
// Tiap file dijalankan sebagai proses terpisah; sebuah file lulus bila keluar dengan kode 0. Untuk menjalankan satu file:
//   node test/auth.test.js
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && (!only.length || only.some(o => f.includes(o)))).sort();
let failed = 0;
const started = Date.now();
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', env: { ...process.env, AUTH_DISABLE: '', ADMIN_USERNAME: '', ADMIN_PASSWORD: '' } });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${f}  (${((Date.now() - t0) / 1000).toFixed(1)} dtk)`);
  if (!ok) console.log((r.stdout || '') + (r.stderr || ''));
}
console.log(`\n${files.length - failed}/${files.length} file lulus dalam ${((Date.now() - started) / 1000).toFixed(1)} dtk`);
process.exit(failed ? 1 : 0);

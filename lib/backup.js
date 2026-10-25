// Backup database (halaman Pengaturan): seluruh isi tabel dalam satu file .sql yang bisa dipulihkan dengan psql.
// Isinya data saja (INSERT), termasuk file unggahan yang tersimpan sebagai BYTEA; struktur tabel dibuat oleh aplikasi
// sendiri (db/init.js) saat server dijalankan. Data diambil dalam satu transaksi REPEATABLE READ supaya konsisten,
// dibaca bertahap lewat cursor dan langsung dialirkan ke browser (tidak ditampung seluruhnya di memori).
// Hanya Administrator (atau siapa pun bila penerapan login dimatikan) yang boleh mengunduh: file ini memuat semua data.

const qi = name => '"' + String(name).replace(/"/g, '""') + '"';
const lit = v => "'" + String(v).replace(/'/g, "''") + "'";

// Urutan tabel: induk dulu (foreign key), supaya INSERT tidak melanggar relasi saat dipulihkan
function orderTables(tables, fks) {
  const deps = new Map(tables.map(t => [t, new Set()]));
  fks.forEach(f => { if (f.child !== f.parent && deps.has(f.child) && deps.has(f.parent)) deps.get(f.child).add(f.parent); });
  const out = [], done = new Set(), busy = new Set();
  const visit = t => {
    if (done.has(t)) return;
    if (busy.has(t)) return;   // relasi melingkar: urutan apa adanya
    busy.add(t);
    [...deps.get(t)].sort().forEach(visit);
    busy.delete(t);
    done.add(t);
    out.push(t);
  };
  [...tables].sort().forEach(visit);
  return out;
}

function valueSql(v, type) {
  if (v === null || v === undefined) return 'NULL';
  if (type === 'bytea') return "'\\x" + v + "'";   // kolom diambil sebagai encode(..., 'hex')
  return lit(v);
}

async function writeDump(client, write, now = new Date()) {
  const { rows: tableRows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  const { rows: fks } = await client.query(
    `SELECT cl.relname AS child, pl.relname AS parent FROM pg_constraint c
     JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class pl ON pl.oid = c.confrelid
     JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.contype = 'f' AND n.nspname = 'public'`);
  const { rows: colRows } = await client.query(
    `SELECT table_name, column_name, data_type, column_default FROM information_schema.columns
     WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
  const tables = orderTables(tableRows.map(r => r.table_name), fks);
  const colsOf = t => colRows.filter(c => c.table_name === t);

  const wib = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  write(`-- DETECH LIMS - backup database\n-- Dibuat: ${wib} WIB\n` +
    `-- Berisi seluruh data (termasuk file unggahan). Simpan di tempat aman.\n` +
    `-- Cara memulihkan: jalankan aplikasi sekali pada database tujuan (membuat struktur tabel), lalu:\n` +
    `--   psql "<DATABASE_URL>" -f <file ini>\n` +
    `-- Semua data yang ada di database tujuan akan DIGANTI dengan isi backup ini.\n\n` +
    `SET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\nBEGIN;\n\n`);
  if (tables.length) write(`TRUNCATE TABLE ${tables.map(qi).join(', ')} RESTART IDENTITY CASCADE;\n\n`);

  const counts = {};
  for (const t of tables) {
    const cols = colsOf(t);
    if (!cols.length) continue;
    const select = cols.map(c => (c.data_type === 'bytea' ? `encode(${qi(c.column_name)}, 'hex')` : `${qi(c.column_name)}::text`) + ' AS ' + qi(c.column_name)).join(', ');
    const head = `INSERT INTO ${qi(t)} (${cols.map(c => qi(c.column_name)).join(', ')}) VALUES\n`;
    counts[t] = 0;
    write(`-- ${t}\n`);
    await client.query(`DECLARE backup_cur NO SCROLL CURSOR FOR SELECT ${select} FROM ${qi(t)}`);
    for (;;) {
      const { rows } = await client.query('FETCH 200 FROM backup_cur');
      if (!rows.length) break;
      // beberapa baris per INSERT; baris berisi file besar ditulis sendiri-sendiri
      let batch = [], size = 0;
      const flush = () => { if (batch.length) write(head + batch.join(',\n') + ';\n'); batch = []; size = 0; };
      for (const r of rows) {
        const tuple = '(' + cols.map(c => valueSql(r[c.column_name], c.data_type)).join(', ') + ')';
        batch.push(tuple);
        size += tuple.length;
        counts[t]++;
        if (batch.length >= 50 || size > 1000000) flush();
      }
      flush();
    }
    await client.query('CLOSE backup_cur');
    write('\n');
  }

  // nomor ID berikutnya (SERIAL) melanjutkan dari data yang dipulihkan
  for (const c of colRows) {
    const m = /^nextval\('([^']+)'::regclass\)$/.exec(c.column_default || '');
    if (!m || !tables.includes(c.table_name)) continue;
    write(`SELECT setval(${lit(m[1])}, COALESCE((SELECT MAX(${qi(c.column_name)}) FROM ${qi(c.table_name)}), 0) + 1, false);\n`);
  }
  write('\nCOMMIT;\n');
  return counts;
}

function registerBackupRoutes(app, deps) {
  const { pool } = deps;

  app.get('/api/admin/backup', async (req, res) => {
    if (req.user && !req.user.is_admin) return res.status(403).json({ error: 'Hanya Administrator yang boleh mengunduh backup database.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const stamp = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="detech-lims-backup-${stamp}.sql"`);
      res.setHeader('Cache-Control', 'no-store');
      await writeDump(client, chunk => res.write(chunk));
      await client.query('COMMIT');
      res.end();
      pool.query(`INSERT INTO audit_log (user_id, username, method, path, status, ip) VALUES ($1, $2, 'GET', '/api/admin/backup', 200, $3)`,
        [req.user ? req.user.id : null, req.user ? req.user.username : '', String(req.ip || '').slice(0, 64)]).catch(() => {});
    } catch (err) {
      console.error(err);
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Gagal membuat backup database' });
      else res.end('\n-- BACKUP GAGAL: file ini tidak lengkap, jangan dipakai untuk memulihkan.\n');
    } finally {
      if (client) client.release();
    }
  });
}

module.exports = { registerBackupRoutes, writeDump, orderTables };

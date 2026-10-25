// Witness oleh client (tahap Testing): Daftar Kehadiran Witness (DPI-LP-FR-63) dan Berita Acara Witness (DPI-LP-FR-39).
// Satu Work Order boleh punya beberapa sesi witness. Tiap sesi: tanggal/waktu/tempat/agenda, coupon yang disaksikan,
// daftar hadir (nama, perusahaan, HP, email, tanda tangan digambar di layar) dan penanda tangan DETECH.
// Nomor BA otomatis: nnnn/DPI/ADM-BA/<bulan Romawi>/<tahun>, urut per tahun tanggal witness.
// Kedua dokumen dicetak dari data ini dan ikut menjadi lampiran LHU coupon yang disaksikan. Nama peserta juga mengisi
// Witnessed By pada Lembar Hasil Uji coupon itu yang masih kosong (format "Nama of Perusahaan").
const { LOGO_BASE64, esc } = require('./printCommon');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DEFAULT_PLACE = 'Laboratorium Pengujian Material PT Detech Profesional Indonesia';
const DEFAULT_SIGNER = { name: 'Fajar Pangestu, S.Tr.T.', title: 'Manager Teknis' };
const LAB_ADDRESS = 'Bizpoint Modern Multi Business, Point 1, Blok Guangzhou No. 10, Sukamulya, Cikupa, Kab. Tangerang, Telp: +6221 59644285';
const FOOTER_ADDRESS = 'Bizpoint Modern Multi Business, Point 1, Blok Guangzhou No.10, Kel. Sukamulya, Kec. Cikupa, Kab. Tangerang, Banten 15710, Telp: +6221 59644285, Email: marketing@detech.co.id';
const MAX_ATTENDEES = 40;
const SIG_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const MAX_SIG = 200000;

const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const sig = v => (typeof v === 'string' && SIG_RE.test(v) && v.length <= MAX_SIG ? v : '');
const asArray = v => { if (Array.isArray(v)) return v; try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } };
const asObject = v => { if (v && typeof v === 'object' && !Array.isArray(v)) return v; try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; } };

function todayWIB() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function cleanSession(b) {
  const attendees = asArray(b.attendees).slice(0, MAX_ATTENDEES)
    .map(a => ({ name: str(a && a.name, 120), company: str(a && a.company, 160), phone: str(a && a.phone, 40), email: str(a && a.email, 120), signature: sig(a && a.signature) }))
    .filter(a => a.name || a.company);
  const signer = asObject(b.detech_signer);
  return {
    session_date: isoDate(b.session_date) || todayWIB(),
    session_time: str(b.session_time, 40),
    place: str(b.place, 300) || DEFAULT_PLACE,
    agenda: str(b.agenda, 300),
    coupon_rows: [...new Set(asArray(b.coupon_rows).map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((x, y) => x - y),
    attendees,
    detech_signer: { name: str(signer.name, 120), title: str(signer.title, 120), signature: sig(signer.signature) },
    notes: str(b.notes, 1000)
  };
}

const rowOut = r => ({ ...r, coupon_rows: asArray(r.coupon_rows), attendees: asArray(r.attendees), detech_signer: asObject(r.detech_signer) });

// "Nama of Perusahaan" untuk Witnessed By (dipisah koma seperti isian Lembar)
function witnessText(attendees) {
  return attendees.filter(a => a.name).map(a => (a.company ? `${a.name} of ${a.company}` : a.name)).join(', ');
}

// coupon yang dicakup sesi; kosong = semua coupon Work Order
const coveredRows = (s, wo) => (s.coupon_rows.length ? s.coupon_rows : (wo.coupon_tests || []).map(c => c.row_no));

function testsOf(c) {
  return [...(c.test_items || []).filter(t => t.checked), ...(c.other_tests || []).filter(t => String(t.test_name || '').trim())];
}

function materialText(c) {
  const types = [...(c.coupon_type || []), c.coupon_type_other || ''].map(x => String(x).trim()).filter(Boolean).join(', ');
  const t = String(c.thickness || '').trim();
  return [types, c.material_type_grade, t ? (/mm/i.test(t) ? t : t + ' mm') + ' Thickness' : ''].map(x => String(x || '').trim()).filter(Boolean).join(', ');
}

function longDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return { day: DAYS[d.getUTCDay()], date: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(), short: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` };
}

// ---------- cetak ----------
const DOC_CSS = `
  .wd { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10pt; padding: 26px 34px 20px; min-height: 1055px; display: flex; flex-direction: column; }
  .wd-grow { flex: 1; }
  .wd table { border-collapse: collapse; width: 100%; }
  .wd-head td { border: 1px solid #000; text-align: center; vertical-align: middle; padding: 4px; }
  .wd-head img { height: 46px; }
  .wd-title { font-weight: bold; font-size: 13pt; }
  .wd-sub { font-style: italic; font-size: 11pt; }
  .wd-info { margin: 14px 0; }
  .wd-info td { padding: 3px 4px; vertical-align: top; }
  .wd-info td.l { width: 190px; font-weight: bold; }
  .wd-info td.c { width: 12px; }
  .wd-grid th, .wd-grid td { border: 1px solid #000; padding: 4px 5px; vertical-align: middle; font-size: 9.5pt; }
  .wd-grid th { background: #d9d9d9; -webkit-print-color-adjust: exact; print-color-adjust: exact; text-align: center; }
  .wd-grid td.n { text-align: center; width: 34px; }
  .wd-grid td.sig { width: 120px; height: 40px; padding: 2px; text-align: center; }
  .wd-grid img.sig { max-height: 38px; max-width: 116px; }
  .wd-foot { border-top: 1px solid #0E3270; margin-top: 12px; padding-top: 4px; font-size: 7.6pt; display: flex; justify-content: space-between; gap: 12px; }
  .wd-foot b { display: block; }
  .ba-logo { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 3px solid #0E3270; padding-bottom: 6px; }
  .ba-logo img { height: 46px; }
  .ba-title { text-align: center; margin: 16px 0 2px; font-weight: bold; font-size: 13pt; text-decoration: underline; }
  .ba-no { text-align: center; margin-bottom: 14px; }
  .ba p { margin: 4px 0; line-height: 1.45; text-align: justify; }
  .ba-info { margin: 8px 0 12px; width: 70% !important; }
  .ba-info td { border: 1px solid #000; padding: 3px 6px; }
  .ba-info td.l { width: 170px; }
  .ba-sign { margin-top: 10px; table-layout: fixed; }
  .ba-sign td { border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px; height: 96px; font-size: 9pt; }
  .ba-sign .co { font-weight: bold; min-height: 26px; }
  .ba-sign .sp { height: 42px; display: flex; align-items: center; justify-content: center; }
  .ba-sign .sp img { max-height: 40px; max-width: 100%; }
  .ba-sign .nm { text-decoration: underline; }
`;

function footHtml(formNo, page, total, withCompany) {
  return `<div class="wd-foot"><div>${withCompany ? `<b>PT DETECH PROFESIONAL INDONESIA</b>${esc(FOOTER_ADDRESS)}<br>` : ''}Form No.: ${esc(formNo)}</div><div style="white-space:nowrap">Hal. (page) : ${page} / ${total}</div></div>`;
}

function attendancePage(s, wo) {
  const tr = wo.test_request || {};
  const d = longDate(s.session_date);
  const rows = s.attendees.slice();
  while (rows.length < 12) rows.push(null);
  return `<div class="paper"><div class="wd">
    <table class="wd-head"><tr><td style="width:160px"><img src="data:image/png;base64,${LOGO_BASE64}" alt="DETECH"></td>
      <td><div class="wd-title">DAFTAR KEHADIRAN</div><div class="wd-sub">ATTENDANCE LIST</div></td><td style="width:160px"></td></tr></table>
    <table class="wd-info">
      <tr><td class="l">AGENDA <i>(AGENDA)</i></td><td class="c">:</td><td>${esc(s.agenda || 'Witness Pengujian Material ' + (tr.company || ''))}</td></tr>
      <tr><td class="l">TANGGAL <i>(DATE)</i></td><td class="c">:</td><td>${esc(d.short)}</td></tr>
      <tr><td class="l">WAKTU <i>(TIME)</i></td><td class="c">:</td><td>${esc(s.session_time) || '-'}</td></tr>
      <tr><td class="l">TEMPAT <i>(PLACE)</i></td><td class="c">:</td><td>${esc(s.place)}</td></tr>
    </table>
    <table class="wd-grid">
      <thead><tr><th>NO.<br><i>(NO)</i></th><th>NAMA<br><i>(NAME)</i></th><th>PERUSAHAAN<br><i>(COMPANY)</i></th><th>NO. HP<br><i>(PHONE NUMBER)</i></th><th>EMAIL<br><i>(EMAIL)</i></th><th>TANDA TANGAN<br><i>(SIGNATURE)</i></th></tr></thead>
      <tbody>${rows.map((a, i) => `<tr><td class="n">${i + 1}</td><td>${a ? esc(a.name) : ''}</td><td>${a ? esc(a.company) : ''}</td><td>${a ? esc(a.phone) : ''}</td><td>${a ? esc(a.email) : ''}</td><td class="sig">${a && a.signature ? `<img class="sig" src="${a.signature}" alt="">` : ''}</td></tr>`).join('')}</tbody>
    </table>
    <div class="wd-grow"></div>
    ${footHtml('DPI-LP-FR-63, Rev. 0, Date of Issued 04/07/2022', 1, 1, false)}
  </div></div>`;
}

function minutesPages(s, wo) {
  const tr = wo.test_request || {};
  const d = longDate(s.session_date);
  const rows = coveredRows(s, wo);
  const coupons = (wo.coupon_tests || []).filter(c => rows.includes(c.row_no));
  let no = 0;
  const body = coupons.map(c => {
    const tests = testsOf(c);
    const list = tests.length ? tests : [{ test_name: '-', qty: '' }];
    no++;
    return list.map((t, i) => `<tr>${i === 0 ? `<td class="n" rowspan="${list.length}">${no}</td><td rowspan="${list.length}" style="text-align:center">${esc(c.report_no) || '-'}</td><td rowspan="${list.length}">${esc(materialText(c)) || '-'}</td>` : ''}<td>${esc(t.test_name)}</td><td style="text-align:center">${esc(t.qty) || '-'}</td></tr>`).join('');
  }).join('');
  const reportNos = coupons.map(c => c.report_no).filter(Boolean);
  const signer = { ...DEFAULT_SIGNER, ...Object.fromEntries(Object.entries(s.detech_signer || {}).filter(e => e[1])) };
  const cells = [{ company: 'PT Detech Profesional Indonesia', name: signer.name, title: signer.title, signature: signer.signature }]
    .concat(s.attendees.filter(a => a.name).map(a => ({ company: a.company, name: a.name, signature: a.signature })));
  while (cells.length % 4) cells.push(null);
  const signRows = [];
  for (let i = 0; i < cells.length; i += 4) signRows.push(cells.slice(i, i + 4));
  return `<div class="paper"><div class="wd ba">
    <div class="ba-logo"><img src="data:image/png;base64,${LOGO_BASE64}" alt="DETECH"></div>
    <div class="ba-title">BERITA ACARA WITNESS</div>
    <div class="ba-no">${esc(s.ba_no)}</div>
    <p>Pada Hari ${d.day}, Tanggal ${d.date} Bulan ${d.month} Tahun ${d.year} Telah dilaksanakan Penyaksian Pengujian di Laboratorium PT Detech Profesional Indonesia yang Beralamatkan :<br>${esc(LAB_ADDRESS)}<br>Dengan diperoleh hasil penyaksian pengujian sebagai berikut :</p>
    <table class="ba-info">
      <tr><td class="l">Perusahaan</td><td>: ${esc(tr.company) || '-'}</td></tr>
      <tr><td class="l">Atas Nama Perusahaan</td><td>: ${esc(tr.on_behalf_owner) || '-'}</td></tr>
      <tr><td class="l">PO No.</td><td>: ${esc(tr.po_number) || '-'}</td></tr>
      <tr><td class="l">Job No.</td><td>: ${esc(tr.job_number) || '-'}</td></tr>
      <tr><td class="l">Project Name</td><td>: ${esc(tr.project_name) || '-'}</td></tr>
      <tr><td class="l">Testing Date</td><td>: ${esc(d.short)}</td></tr>
    </table>
    <table class="wd-grid">
      <thead><tr><th>No.</th><th>Report No.</th><th>Deskripsi Material</th><th>Jenis Pengujian</th><th>Jumlah Spesimen Uji</th></tr></thead>
      <tbody>${body || '<tr><td colspan="5" style="text-align:center">-</td></tr>'}</tbody>
    </table>
    <p style="margin-top:10px">Hasil pengujian tersebut sesuai dengan Report No. ${esc(reportNos.join(', ') || '-')} terlampir.<br>Demikian berita acara ini dibuat dengan sebenarnya sehingga dapat dipergunakan sebagaimana mestinya.</p>
    <p style="text-align:right;margin-top:10px">Tangerang, ${d.date} ${d.month} ${d.year}</p>
    <p>Disaksikan secara langsung oleh,</p>
    <table class="ba-sign">${signRows.map(r => `<tr>${r.map(c => c ? `<td><div class="co">${esc(c.company) || '&nbsp;'}</div><div class="sp">${c.signature ? `<img src="${c.signature}" alt="">` : ''}</div><div class="nm">${esc(c.name)}</div>${c.title ? `<div>${esc(c.title)}</div>` : ''}</td>` : '<td></td>').join('')}</tr>`).join('')}</table>
    <div class="wd-grow"></div>
    ${footHtml('DPI-LP-FR-39, Rev. 1, Date of Issued 10/06/2025', 1, 1, true)}
  </div></div>`;
}

// Halaman dokumen witness (Daftar Hadir lalu BA) untuk satu sesi; dipakai halaman cetak sendiri dan lampiran LHU
function sessionPages(s, wo, doc) {
  const out = [];
  if (doc !== 'ba') out.push(attendancePage(s, wo));
  if (doc !== 'dh') out.push(minutesPages(s, wo));
  return out;
}

function standaloneHtml(title, pages) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; } html, body { margin: 0; padding: 0; }
  body { background: #ddd; }
  .toolbar { position: sticky; top: 0; background: #0E3270; color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; z-index: 10; font-family: Arial, sans-serif; }
  .toolbar button { background: #AA0000; border: none; padding: 8px 18px; font-weight: bold; color: #fff; border-radius: 4px; cursor: pointer; font-size: 10pt; }
  .paper { width: 734px; margin: 16px auto; background: #fff; box-shadow: 0 0 8px rgba(0,0,0,.25); }
  @media print { body { background: #fff; } .toolbar { display: none; } .paper { box-shadow: none; margin: 0; width: auto; break-after: page; } .paper:last-child { break-after: auto; } }
  ${DOC_CSS}
  </style></head><body><div class="toolbar"><span>${esc(title)}</span><button onclick="window.print()">Print / Simpan sebagai PDF</button></div>${pages.join('\n')}</body></html>`;
}

function registerWitnessRoutes(app, deps) {
  const { pool, getFullWorkOrder } = deps;

  const loadSession = async id => {
    const { rows } = await pool.query('SELECT * FROM witness_sessions WHERE id = $1', [id]);
    return rows.length ? rowOut(rows[0]) : null;
  };

  // Witnessed By pada Lembar coupon yang disaksikan, hanya yang masih kosong dan belum Final
  async function fillWitnessedBy(s, wo) {
    const text = witnessText(s.attendees);
    if (!text) return 0;
    const { rowCount } = await pool.query(
      `UPDATE test_reports SET witnessed_by = $1, updated_at = NOW()
       WHERE test_request_id = $2 AND coupon_row_no = ANY($3) AND COALESCE(witnessed_by, '') = '' AND status <> 'final'`,
      [text, wo.test_request_id, coveredRows(s, wo)]);
    return rowCount || 0;
  }

  async function nextBaNo(dateIso) {
    const year = Number(dateIso.slice(0, 4)), month = Number(dateIso.slice(5, 7));
    const { rows } = await pool.query('SELECT COALESCE(MAX(ba_seq), 0) AS m FROM witness_sessions WHERE ba_year = $1', [year]);
    const seq = Number(rows[0].m) + 1;
    return { seq, year, no: `${String(seq).padStart(4, '0')}/DPI/ADM-BA/${ROMAN[month - 1]}/${year}` };
  }

  app.get('/api/work-orders/:id/witness', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM witness_sessions WHERE work_order_id = $1 ORDER BY session_date, id', [req.params.id]);
      res.json({ sessions: rows.map(rowOut) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat data witness' });
    }
  });

  app.post('/api/work-orders/:id/witness', async (req, res) => {
    try {
      const wo = await getFullWorkOrder(req.params.id);
      if (!wo) return res.status(404).json({ error: 'Work Order tidak ditemukan' });
      const s = cleanSession(req.body || {});
      if (!s.agenda) s.agenda = 'Witness Pengujian Material ' + ((wo.test_request || {}).company || '');
      let ba;
      for (let attempt = 0; attempt < 3; attempt++) {
        ba = await nextBaNo(s.session_date);
        try {
          const { rows } = await pool.query(
            `INSERT INTO witness_sessions (work_order_id, ba_no, ba_seq, ba_year, session_date, session_time, place, agenda, coupon_rows, attendees, detech_signer, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
            [wo.id, ba.no, ba.seq, ba.year, s.session_date, s.session_time, s.place, s.agenda, JSON.stringify(s.coupon_rows), JSON.stringify(s.attendees), JSON.stringify(s.detech_signer), s.notes]);
          const saved = rowOut(rows[0]);
          const filled = await fillWitnessedBy(saved, wo);
          return res.status(201).json({ ...saved, filled_reports: filled });
        } catch (err) {
          if (err.code !== '23505') throw err;   // nomor BA bentrok dengan sesi lain yang disimpan bersamaan: ambil nomor berikutnya
        }
      }
      res.status(409).json({ error: 'Nomor Berita Acara bentrok, coba simpan lagi' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan sesi witness' });
    }
  });

  app.put('/api/witness-sessions/:sid', async (req, res) => {
    try {
      const cur = await loadSession(req.params.sid);
      if (!cur) return res.status(404).json({ error: 'Not found' });
      const wo = await getFullWorkOrder(cur.work_order_id);
      const s = cleanSession(req.body || {});
      const baNo = str((req.body || {}).ba_no, 60) || cur.ba_no;
      const { rows } = await pool.query(
        `UPDATE witness_sessions SET ba_no=$1, session_date=$2, session_time=$3, place=$4, agenda=$5, coupon_rows=$6, attendees=$7,
           detech_signer=$8, notes=$9, updated_at=NOW() WHERE id=$10 RETURNING *`,
        [baNo, s.session_date, s.session_time, s.place, s.agenda || cur.agenda, JSON.stringify(s.coupon_rows), JSON.stringify(s.attendees), JSON.stringify(s.detech_signer), s.notes, cur.id]);
      const saved = rowOut(rows[0]);
      const filled = wo ? await fillWitnessedBy(saved, wo) : 0;
      res.json({ ...saved, filled_reports: filled });
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Nomor Berita Acara sudah dipakai sesi lain' });
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan sesi witness' });
    }
  });

  app.delete('/api/witness-sessions/:sid', async (req, res) => {
    try {
      const { rowCount } = await pool.query('DELETE FROM witness_sessions WHERE id = $1', [req.params.sid]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus sesi witness' });
    }
  });

  // ?doc=dh (Daftar Hadir) | ba (Berita Acara) | kosong (keduanya)
  app.get('/witness-sessions/:sid/print', async (req, res) => {
    try {
      const s = await loadSession(req.params.sid);
      const wo = s && await getFullWorkOrder(s.work_order_id);
      if (!wo) return res.status(404).send('Sesi witness tidak ditemukan');
      const doc = ['dh', 'ba'].includes(req.query.doc) ? req.query.doc : '';
      const title = doc === 'dh' ? `Daftar Hadir Witness - ${(wo.test_request || {}).job_number || ''}` : `Berita Acara Witness ${s.ba_no}`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(standaloneHtml(title, sessionPages(s, wo, doc)));
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal membuat dokumen witness');
    }
  });

  // Lampiran LHU: dokumen semua sesi witness yang mencakup coupon itu
  async function witnessAttachment(wo, rowNo) {
    const { rows } = await pool.query('SELECT * FROM witness_sessions WHERE work_order_id = $1 ORDER BY session_date, id', [wo.id]);
    const pages = rows.map(rowOut).filter(s => coveredRows(s, wo).includes(rowNo)).flatMap(s => sessionPages(s, wo, ''));
    return pages.length ? { css: DOC_CSS, pages } : null;
  }

  // Witnessed By untuk Lembar baru: dari sesi witness yang mencakup coupon itu
  async function witnessDefault(wo, rowNo) {
    const { rows } = await pool.query('SELECT * FROM witness_sessions WHERE work_order_id = $1 ORDER BY session_date, id', [wo.id]);
    const people = rows.map(rowOut).filter(s => coveredRows(s, wo).includes(rowNo)).flatMap(s => s.attendees);
    const seen = new Set();
    return witnessText(people.filter(a => { const k = (a.name + '|' + a.company).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }));
  }

  return { witnessAttachment, witnessDefault };
}

module.exports = { registerWitnessRoutes, cleanSession, witnessText, materialText, longDate, sessionPages, DEFAULT_SIGNER, DEFAULT_PLACE };

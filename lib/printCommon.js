// Helper bersama untuk halaman-halaman cetak (Tinjauan Permintaan Pengujian & Work Order):
// logo DETECH sebagai data URI, escaping HTML, dan format tanggal dd/mm/yy.
const fs = require('fs');
const path = require('path');

const LOGO_BASE64 = fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'detech-logo.png')).toString('base64');

function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return esc(s || '');
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

module.exports = { LOGO_BASE64, esc, fmtDate };

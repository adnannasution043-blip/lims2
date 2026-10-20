// Syarat kelengkapan data sebelum sebuah sheet boleh difinalisasi (permintaan klien: "harus isi data untuk bisa lanjut
// ke finalisasi, terutama data spesimen, data pengujian"). Draft tetap boleh disimpan setengah jadi; pemeriksaan ini
// hanya berlaku saat status diminta 'final'. Hasilnya daftar kekurangan (kosong = lengkap) yang ditampilkan ke pengguna.

const filled = v => String(v == null ? '' : v).trim() !== '';
const MAX_LISTED = 6;

function summarize(problems) {
  if (problems.length <= MAX_LISTED) return problems;
  return problems.slice(0, MAX_LISTED).concat(`... dan ${problems.length - MAX_LISTED} kekurangan lainnya`);
}

// ----- Pengecekan Spesimen -----

// Ukuran "Actual" (hasil ukur teknisi) yang wajib per kategori/bentuk; "Code" berasal dari master Tipe Spesimen.
function specimenActualKeys(category, shape) {
  const round = shape === 'round';
  if (category === 'tensile') {
    return ['gauge_length', ...(round ? ['diameter'] : ['width', 'thickness']), 'radius', 'reduce_section', 'total_length'];
  }
  if (category === 'bending') return round ? ['diameter', 'length'] : ['width', 'thickness', 'radius', 'length'];
  if (category === 'charpy') return ['length', 'width', 'thickness'];
  if (category === 'nickbreak') return ['width', 'thickness', 'notch_depth', 'length'];
  if (category === 'hic') return ['width', 'thickness', 'length'];
  return [];
}
const DIM_LABEL = {
  gauge_length: 'Gauge Length', diameter: 'Diameter', width: 'Width', thickness: 'Thickness', radius: 'Radius',
  reduce_section: 'Reduce Section Length', total_length: 'Total Length', length: 'Length', notch_depth: 'Notch Depth'
};

function specimenSheetProblems(sheet, rows) {
  const s = sheet || {};
  const out = [];
  if (!filled(s.inspection_date)) out.push('Tanggal pemeriksaan belum diisi');
  if (!filled(s.inspected_by_name)) out.push('Nama pemeriksa (Inspected By) belum diisi');
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) out.push('Belum ada baris spesimen');

  const category = s.category || 'general';
  const keys = specimenActualKeys(category, s.shape);
  list.forEach((r, i) => {
    const row = r || {};
    const m = row.measurements || {};
    const name = filled(row.marking_specimen) ? `Spesimen ${String(row.marking_specimen).trim()}` : `Baris ${i + 1}`;
    const miss = [];
    if (!filled(row.marking_specimen)) miss.push('Marking Specimen');
    keys.forEach(k => { if (!filled(m[k + '_actual'])) miss.push(`${DIM_LABEL[k]} (Actual)`); });
    if (category === 'tensile') {
      const pts = Array.isArray(m.points) ? m.points : [];
      const need = s.shape === 'round' ? ['diameter'] : ['width', 'thickness'];
      if (!pts.length || pts.some(p => need.some(k => !filled((p || {})[k])))) miss.push('3 Point Measurement');
    }
    if (category === 'charpy') {
      if (!filled(row.location)) miss.push('Location');
      if (!filled(m.v_notch_l) || !filled(m.v_notch_r)) miss.push('Center V-Notch');
    }
    // jenis pengujian tanpa form resmi: cukup satu ukuran Actual
    if (category === 'general' && !['length', 'width', 'thickness'].some(k => filled(m[k + '_actual']))) miss.push('minimal satu ukuran Actual');
    if (category !== 'tensile' && !filled(row.accepted)) miss.push('Accepted Y/N');
    if (miss.length) out.push(`${name}: ${miss.join(', ')}`);
  });
  return summarize(out);
}

// ----- Lembar Hasil Uji -----

// Isian bawaan / identitas yang terisi otomatis, jadi tidak dihitung sebagai "data hasil uji"
const PRESET_KEYS = new Set(['marking_specimen', 'kind', 'orient', 'observation', 'defect', 'notch_position', 'location',
  'sample_id', 'spec', 'type_specimen', 'test_speed', 'test_temp', 'specimen_size', 'orientation', 'sketch']);

function hasEnteredValue(v, key) {
  if (key && PRESET_KEYS.has(key)) return false;
  if (Array.isArray(v)) return v.some(x => hasEnteredValue(x));
  if (v && typeof v === 'object') return Object.keys(v).some(k => hasEnteredValue(v[k], k));
  return filled(v);
}

// Form Bend / Flaring: tiap spesimen wajib diberi hasil Accepted/Rejected
const RESULT_TEMPLATES = ['bend-sec', 'bend-mat', 'flaring'];

function testReportProblems({ kind, template, body, photoCount }) {
  const b = body || {};
  const out = [];
  if (!filled(b.date_tested)) out.push('Date of Tested belum diisi');
  if (!filled(b.test_conducted_by)) out.push('Test Conducted By belum diisi');

  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!hasEnteredValue(rows) && !hasEnteredValue(b.fields || {}) && !(photoCount > 0)) {
    out.push('Belum ada data hasil pengujian yang diisi');
    return summarize(out);
  }

  const label = (r, i) => (filled((r || {}).marking_specimen) ? `Spesimen ${String(r.marking_specimen).trim()}` : `Baris ${i + 1}`);
  rows.forEach((r, i) => {
    const row = r || {};
    if (kind === 'charpy' && !filled(row.impact)) out.push(`${label(row, i)}: Impact Energy belum diisi`);
    if (kind === 'tn' && !['load', 'strength', 'yield', 'tensile'].some(k => filled(row[k]))) out.push(`${label(row, i)}: hasil uji tarik (beban / kekuatan) belum diisi`);
    if ((kind === 'nb' || kind === 'fwb' || RESULT_TEMPLATES.includes(template)) && !filled(row.result)) out.push(`${label(row, i)}: Result belum dipilih`);
  });
  return summarize(out);
}

module.exports = { specimenSheetProblems, testReportProblems, specimenActualKeys };

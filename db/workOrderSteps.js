// Tahapan proses tetap pada Work Order (DPI-LP-FR-25), tiap tahap punya satu kolom PIC di work_orders.
const PROCESS_STEPS = [
  { key: 'receiving_pic', label: 'Receiving' },
  { key: 'machining_pic', label: 'Machining' },
  { key: 'inspection_pic', label: 'Inspection' },
  { key: 'testing_pic', label: 'Testing' },
  { key: 'reporting_pic', label: 'Reporting' },
  { key: 'doc_checked_pic', label: 'Doc. Checked' }
];

module.exports = { PROCESS_STEPS };

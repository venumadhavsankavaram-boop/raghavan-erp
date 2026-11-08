/* 72 — Custom Report Builder: many more data sources, columns, filters, preview.
   Extends REPORT_SOURCES (13-reports-teacher-performance.js) and upgrades the builder UI. */
(function(){
  'use strict';
  if (typeof REPORT_SOURCES === 'undefined') return;

  const G = (fn, dflt) => { try { const v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } };
  const arr = fn => { const v = G(fn, []); return Array.isArray(v) ? v : []; };
  const num = v => Number(v) || 0;
  const nm = o => ((o && (o.lastName || '')) + ' ' + (o && (o.firstName || ''))).trim();
  const stuById = id => arr(() => students).find(s => s.id === id);
  const stfById = id => arr(() => staffList).find(s => s.staffId === id || s.id === id);
  const prettify = k => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());
  const inRange = (d, f, t) => { d = d || ''; return (!f || d >= f) && (!t || d <= t); };
  const classOpts = () => arr(() => CLASS_LEVELS);
  const secOpts = () => arr(() => SECTIONS);

  /* Auto columns from the keys of the first records (scalars only) */
  function autoCols(list, skip) {
    const keys = [], seen = {};
    skip = skip || ['id', 'password', 'passwordHash', 'photo', 'photoData', 'signature'];
    list.slice(0, 60).forEach(r => Object.keys(r || {}).forEach(k => {
      if (seen[k] || skip.includes(k)) return;
      const v = r[k];
      if (v !== null && typeof v === 'object') return;
      seen[k] = 1; keys.push(k);
    }));
    return keys.map(k => ({ key: k, label: prettify(k) }));
  }
  function autoSource(label, group, listFn, extra) {
    const s = Object.assign({ label, group, columns: [], auto: true, listFn, getRows() { return listFn(); } }, extra || {});
    Object.defineProperty(s, 'columns', { get() { const c = autoCols(listFn()); return c.length ? c : (s.fallback || []).map(k => ({ key: k, label: prettify(k) })); }, enumerable: true, configurable: true });
    return s;
  }

  /* ---------- finance cache (one computation per generate) ---------- */
  let finCache = null;
  const fin = s => { if (!finCache) finCache = {}; return finCache[s.id] || (finCache[s.id] = computeStudentFinance(s)); };
  const catCol = (cat, what, label) => ({ key: 'fin_' + cat + '_' + what, label, compute: s => num(fin(s).perCat[cat] && fin(s).perCat[cat][what]) });

  /* ---------- STUDENTS: many more columns ---------- */
  const routeOf = s => arr(() => transportRoutes).find(r => r.id === s.transportRouteId);
  const stopOf = s => { const r = routeOf(s); return r && (r.stops || []).find(t => t.id === s.transportStopId || t.name === s.transportStopId); };
  const roomOf = s => arr(() => hostelRooms).find(r => r.id === s.hostelRoomId);
  const sibs = s => (s.siblingIds || []).map(id => nm(stuById(id))).filter(Boolean).join(', ');
  const stu = REPORT_SOURCES.students;
  stu.group = 'People';
  const stuExtra = [
    ['rollNo', 'Roll No'], ['motherName', 'Mother Name'], ['motherPhone', 'Mother Phone'], ['contact', 'Contact'],
    ['fatherAddress', 'Address (Father)'], ['motherAddress', 'Address (Mother)'], ['blood', 'Blood Group'],
    ['religion', 'Religion'], ['caste', 'Caste'], ['casteName', 'Sub-Caste'], ['category', 'Category'], ['nationality', 'Nationality'],
    ['motherTongue', 'Mother Tongue'], ['birthPlace', 'Birth Place'], ['pen', 'PEN'], ['aadhar', 'Aadhar'],
    ['fatherOccupation', 'Father Occupation'], ['fatherIncome', 'Father Income'], ['motherOccupation', 'Mother Occupation'], ['motherIncome', 'Mother Income'],
    ['fatherAadhar', 'Father Aadhar'], ['motherAadhar', 'Mother Aadhar'],
    ['prevSchool', 'Previous School'], ['isNewAdmission', 'New Admission'], ['isRTE', 'RTE'], ['needsTransport', 'Needs Transport'], ['isBoarder', 'Boarder'],
    ['transferDate', 'Transfer Date'], ['transferReason', 'Transfer Reason'],
  ];
  const have = new Set(stu.columns.map(c => c.key));
  stuExtra.forEach(([k, l]) => { if (!have.has(k)) stu.columns.push({ key: k, label: l }); });
  stu.columns.push(
    { key: 'fullName', label: 'Full Name', compute: s => nm(s) },
    { key: 'routeName', label: 'Bus Route', compute: s => (routeOf(s) || {}).name || '' },
    { key: 'busNo', label: 'Bus No', compute: s => (routeOf(s) || {}).busNumber || '' },
    { key: 'stopName', label: 'Bus Stop', compute: s => (stopOf(s) || {}).name || '' },
    { key: 'hostelRoom', label: 'Hostel Room', compute: s => { const r = roomOf(s); return r ? (r.blockName || '') + ' ' + (r.roomNumber || '') : ''; } },
    { key: 'siblings', label: 'Siblings', compute: sibs },
    { key: 'fin_expected', label: 'Total Fee (all)', compute: s => num(fin(s).totals.expected) },
    { key: 'fin_discount', label: 'Concession (all)', compute: s => num(fin(s).totals.discount) },
    { key: 'fin_collected', label: 'Fee Paid (all)', compute: s => num(fin(s).totals.collected) },
    { key: 'fin_due', label: 'Fee Due (all)', compute: s => num(fin(s).totals.receivable) },
    catCol('fee', 'receivable', 'Tuition Due'), catCol('bus', 'receivable', 'Bus Due'), catCol('hostel', 'receivable', 'Hostel Due'), catCol('stock', 'receivable', 'Stock Due')
  );
  stu.defaultCols = ['admissionNo', 'firstName', 'lastName', 'className', 'section', 'gender', 'dob', 'fatherName', 'fatherPhone', 'email', 'status', 'admDate'];
  stu.filters = [{ id: 'gender', label: 'Gender', opts: () => ['Male', 'Female', 'Other'], test: (s, v) => (s.gender || '') === v },
                 { id: 'cat', label: 'Category', opts: () => Array.from(new Set(arr(() => students).map(s => s.category).filter(Boolean))), test: (s, v) => s.category === v },
                 { id: 'trans', label: 'Transport', opts: () => ['Yes', 'No'], test: (s, v) => (s.needsTransport === 'Yes') === (v === 'Yes') },
                 { id: 'board', label: 'Boarder', opts: () => ['Yes', 'No'], test: (s, v) => (s.isBoarder === 'Yes') === (v === 'Yes') },
                 { id: 'due', label: 'Fee status', opts: () => ['Has dues', 'Fully paid'], test: (s, v) => (num(fin(s).totals.receivable) > 0) === (v === 'Has dues') }];
  /* the students source previously ignored its own date-of-joining; add a joining-date range */
  stu.dateField = s => s.admDate;

  /* ---------- FEES & ACCOUNTS ---------- */
  const pay = REPORT_SOURCES.payments;
  pay.group = 'Fees & Accounts';
  pay.columns.push(
    { key: 'className', label: 'Class', compute: p => (stuById(p.studentId) || {}).className || p.classAtPayment || '' },
    { key: 'section', label: 'Section', compute: p => (stuById(p.studentId) || {}).section || '' },
    { key: 'admissionNo', label: 'Admission No', compute: p => (stuById(p.studentId) || {}).admissionNo || '' },
    { key: 'net', label: 'Net Amount', compute: p => num(p.amount) - 0 },
    { key: 'instalment', label: 'Instalment' }, { key: 'note', label: 'Note' }, { key: 'ref', label: 'Reference' },
    { key: 'chequeNo', label: 'Cheque No' }, { key: 'chequeBank', label: 'Cheque Bank' }, { key: 'chequeStatus', label: 'Cheque Status' },
    { key: 'collectedBy', label: 'Collected By' }, { key: 'classAtPayment', label: 'Class At Payment' },
    { key: 'voided', label: 'Voided', compute: p => p.voided ? 'Yes' : 'No' });
  pay.dateField = p => p.date;
  pay.defaultCols = ['date', 'studentName', 'category', 'mode', 'amount', 'discount', 'receiptNo'];
  pay.filters = [
    { id: 'mode', label: 'Mode', opts: () => Array.from(new Set(arr(() => payments).map(p => p.mode).filter(Boolean))), test: (p, v) => p.mode === v },
    { id: 'cat', label: 'Category', opts: () => Array.from(new Set(arr(() => payments).map(p => feeLabelFor(p)))), test: (p, v) => feeLabelFor(p) === v },
    { id: 'cls', label: 'Class', opts: classOpts, test: (p, v) => ((stuById(p.studentId) || {}).className || p.classAtPayment) === v },
    { id: 'v', label: 'Voided', opts: () => ['Not voided', 'Voided only'], test: (p, v) => !!p.voided === (v === 'Voided only') }];
  pay.baseFilter = null;
  pay.getRows = function (f) { return arr(() => payments).filter(p => !p.voided); }; // default excludes voided; the Voided filter below re-includes
  pay.getRowsAll = function () { return arr(() => payments); };

  REPORT_SOURCES.studentFees = {
    label: 'Student Fee Dues & Collection', group: 'Fees & Accounts', hasClassSection: true,
    columns: [
      { key: 'admissionNo', label: 'Admission No' }, { key: 'name', label: 'Student', compute: s => nm(s) },
      { key: 'className', label: 'Class' }, { key: 'section', label: 'Section' }, { key: 'fatherName', label: 'Father' }, { key: 'fatherPhone', label: 'Father Phone' },
      catCol('fee', 'expected', 'Tuition Fee'), catCol('fee', 'discount', 'Tuition Concession'), catCol('fee', 'collected', 'Tuition Paid'), catCol('fee', 'receivable', 'Tuition Due'),
      catCol('bus', 'expected', 'Bus Fee'), catCol('bus', 'collected', 'Bus Paid'), catCol('bus', 'receivable', 'Bus Due'),
      catCol('hostel', 'expected', 'Hostel Fee'), catCol('hostel', 'collected', 'Hostel Paid'), catCol('hostel', 'receivable', 'Hostel Due'),
      catCol('stock', 'expected', 'Stock Fee'), catCol('stock', 'collected', 'Stock Paid'), catCol('stock', 'receivable', 'Stock Due'),
      { key: 'extra', label: 'Other / Old Dues', compute: s => fin(s).extras.reduce((a, e) => a + (e.paid ? 0 : Math.max(num(e.amount) - Math.min(num(e.paidAmount), num(e.amount)), 0)), 0) },
      { key: 'tExp', label: 'Total Fee', compute: s => num(fin(s).totals.expected) }, { key: 'tDisc', label: 'Total Concession', compute: s => num(fin(s).totals.discount) },
      { key: 'tPaid', label: 'Total Paid', compute: s => num(fin(s).totals.collected) }, { key: 'tDue', label: 'Total Due', compute: s => num(fin(s).totals.receivable) },
    ],
    defaultCols: ['admissionNo', 'name', 'className', 'section', 'tExp', 'tDisc', 'tPaid', 'tDue'],
    filters: [{ id: 'due', label: 'Dues', opts: () => ['Has dues', 'Fully paid'], test: (s, v) => (num(fin(s).totals.receivable) > 0) === (v === 'Has dues') }],
    getRows(f) {
      let l = arr(() => students);
      if (f.className) l = l.filter(s => s.className === f.className);
      if (f.section) l = l.filter(s => s.section === f.section);
      if (f.status && f.status !== 'all') l = l.filter(s => f.status === 'Active' ? isActive(s) : !isActive(s));
      return l;
    },
  };
  REPORT_SOURCES.extraFees = {
    label: 'Extra Fees & Old Dues', group: 'Fees & Accounts',
    columns: [
      { key: 'admissionNo', label: 'Admission No', compute: e => (stuById(e.studentId) || {}).admissionNo || '' },
      { key: 'student', label: 'Student', compute: e => nm(stuById(e.studentId)) }, { key: 'className', label: 'Class', compute: e => (stuById(e.studentId) || {}).className || '' },
      { key: 'name', label: 'Fee Name' }, { key: 'kind', label: 'Type' }, { key: 'amount', label: 'Amount' },
      { key: 'paidAmount', label: 'Paid Amount' }, { key: 'paid', label: 'Fully Paid', compute: e => e.paid ? 'Yes' : 'No' },
      { key: 'balance', label: 'Balance', compute: e => e.paid ? 0 : Math.max(num(e.amount) - Math.min(num(e.paidAmount), num(e.amount)), 0) }, { key: 'date', label: 'Date' },
    ],
    dateField: e => e.date, filters: [{ id: 'paid', label: 'Status', opts: () => ['Unpaid / part-paid', 'Paid'], test: (e, v) => !!e.paid === (v === 'Paid') }],
    getRows() { return arr(() => studentExtraFees); },
  };
  REPORT_SOURCES.discounts = {
    label: 'Concessions / Discounts', group: 'Fees & Accounts',
    columns: [
      { key: 'admissionNo', label: 'Admission No', compute: d => (stuById(d.studentId) || {}).admissionNo || '' },
      { key: 'student', label: 'Student', compute: d => nm(stuById(d.studentId)) }, { key: 'className', label: 'Class', compute: d => (stuById(d.studentId) || {}).className || '' },
      { key: 'type', label: 'Type' }, { key: 'appliesTo', label: 'Applies To' }, { key: 'mode', label: 'Mode' }, { key: 'value', label: 'Value' },
      { key: 'status', label: 'Status' }, { key: 'requestedBy', label: 'Requested By' }, { key: 'approvedBy', label: 'Approved By' }, { key: 'reason', label: 'Reason' },
    ],
    filters: [{ id: 'st', label: 'Status', opts: () => ['Approved', 'Pending', 'Rejected'], test: (d, v) => d.status === v }],
    getRows() { return arr(() => studentDiscounts); },
  };
  REPORT_SOURCES.refunds = autoSource('Fee Refunds', 'Fees & Accounts', () => arr(() => feeRefunds), { dateField: r => r.date || r.refundDate || r.createdAt , fallback: ['date','studentName','amount','mode','reason'] });
  REPORT_SOURCES.feeHistory = autoSource('Previous Years Fee History', 'Fees & Accounts', () => arr(() => feeYearHistory), { fallback: ['studentName','className','year','total','paid','due'] });
  REPORT_SOURCES.acctExpenses = autoSource('Accounts — Expenses', 'Fees & Accounts', () => arr(() => acctExpenses), { dateField: r => r.date , fallback: ['date','category','description','amount','mode'] });
  REPORT_SOURCES.acctIncome = autoSource('Accounts — Other Income', 'Fees & Accounts', () => arr(() => acctIncome), { dateField: r => r.date , fallback: ['date','head','description','amount','mode'] });
  REPORT_SOURCES.acctVouchers = autoSource('Accounts — Journal Vouchers', 'Fees & Accounts', () => arr(() => acctJournalVouchers), { dateField: r => r.date , fallback: ['date','voucherNo','narration','amount'] });
  REPORT_SOURCES.acctBanks = autoSource('Accounts — Bank Accounts', 'Fees & Accounts', () => arr(() => acctBankAccounts), { fallback: ['name','accountNo','openingBalance','openingDate'] });

  /* ---------- ACADEMIC ---------- */
  const att = REPORT_SOURCES.attendance; att.group = 'Academic';
  att.columns.push({ key: 'admissionNo', label: 'Admission No' }, { key: 'fatherName', label: 'Father' }, { key: 'fatherPhone', label: 'Father Phone' },
    { key: 'total', label: 'Total Days', compute: s => { const a = computeAttendanceStats(s.id); return num(a.present) + num(a.absent) + num(a.late); } });
  att.defaultCols = ['name', 'className', 'section', 'present', 'absent', 'late', 'pct'];
  att.filters = [{ id: 'low', label: 'Attendance', opts: () => ['Below 75%', 'Below 85%', '95% and above'], test: (s, v) => { const p = num(computeAttendanceStats(s.id).pct); return v === 'Below 75%' ? p < 75 : v === 'Below 85%' ? p < 85 : p >= 95; } }];

  REPORT_SOURCES.attendanceLog = {
    label: 'Attendance — Daily Log', group: 'Academic', hasClassSection: true,
    columns: [{ key: 'date', label: 'Date' }, { key: 'admissionNo', label: 'Admission No', compute: a => (stuById(a.studentId) || {}).admissionNo || '' },
      { key: 'student', label: 'Student', compute: a => nm(stuById(a.studentId)) }, { key: 'className', label: 'Class', compute: a => (stuById(a.studentId) || {}).className || '' },
      { key: 'section', label: 'Section', compute: a => (stuById(a.studentId) || {}).section || '' }, { key: 'status', label: 'Status' }, { key: 'session', label: 'Session' }],
    dateField: a => a.date, noStatusFilter: true,
    filters: [{ id: 'st', label: 'Mark', opts: () => ['Present', 'Absent', 'Late', 'Leave'], test: (a, v) => String(a.status || '').toLowerCase().startsWith(v.toLowerCase().slice(0, 4)) }],
    getRows(f) {
      return arr(() => attendanceRecords).filter(a => {
        const s = stuById(a.studentId); if (!s) return false;
        return (!f.className || s.className === f.className) && (!f.section || s.section === f.section);
      });
    },
  };
  REPORT_SOURCES.marks = {
    label: 'Exam Marks (per subject)', group: 'Academic', hasClassSection: true, noStatusFilter: true,
    columns: [{ key: 'exam', label: 'Exam', compute: r => ((arr(() => examDefs).find(e => e.id === r.examId)) || {}).name || r.examId },
      { key: 'admissionNo', label: 'Admission No', compute: r => (stuById(r.studentId) || {}).admissionNo || '' },
      { key: 'student', label: 'Student', compute: r => nm(stuById(r.studentId)) }, { key: 'className', label: 'Class', compute: r => (stuById(r.studentId) || {}).className || '' },
      { key: 'section', label: 'Section', compute: r => (stuById(r.studentId) || {}).section || '' }, { key: 'subject', label: 'Subject' }, { key: 'marks', label: 'Marks' }],
    filters: [{ id: 'ex', label: 'Exam', opts: () => arr(() => examDefs).map(e => e.name), test: (r, v) => (((arr(() => examDefs).find(e => e.id === r.examId)) || {}).name) === v },
              { id: 'sub', label: 'Subject', opts: () => Array.from(new Set(arr(() => examResults).map(r => r.subject).filter(Boolean))).sort(), test: (r, v) => r.subject === v }],
    getRows(f) {
      return arr(() => examResults).filter(r => {
        const s = stuById(r.studentId); if (!s) return false;
        return (!f.className || s.className === f.className) && (!f.section || s.section === f.section);
      });
    },
  };
  REPORT_SOURCES.marksSummary = {
    label: 'Exam Marks — Student Totals', group: 'Academic', hasClassSection: true, noStatusFilter: true,
    columns: [{ key: 'exam', label: 'Exam' }, { key: 'admissionNo', label: 'Admission No' }, { key: 'student', label: 'Student' }, { key: 'className', label: 'Class' }, { key: 'section', label: 'Section' },
      { key: 'subjects', label: 'Subjects' }, { key: 'total', label: 'Total Marks' }, { key: 'avg', label: 'Average' }],
    filters: [{ id: 'ex', label: 'Exam', opts: () => arr(() => examDefs).map(e => e.name), test: (r, v) => r.exam === v }],
    getRows(f) {
      const map = {};
      arr(() => examResults).forEach(r => {
        const s = stuById(r.studentId); if (!s) return;
        if (f.className && s.className !== f.className) return;
        if (f.section && s.section !== f.section) return;
        const ex = (arr(() => examDefs).find(e => e.id === r.examId) || {}).name || r.examId;
        const k = r.examId + '|' + r.studentId;
        const o = map[k] || (map[k] = { exam: ex, admissionNo: s.admissionNo, student: nm(s), className: s.className, section: s.section, subjects: 0, total: 0 });
        const m = parseFloat(r.marks); if (!isNaN(m)) { o.subjects++; o.total += m; }
      });
      return Object.values(map).map(o => Object.assign(o, { total: Math.round(o.total * 100) / 100, avg: o.subjects ? Math.round(o.total / o.subjects * 100) / 100 : '' }));
    },
  };
  REPORT_SOURCES.exams = {
    label: 'Exams (schedule)', group: 'Academic',
    columns: [{ key: 'name', label: 'Exam' }, { key: 'examType', label: 'Type' }, { key: 'startDate', label: 'Start' }, { key: 'endDate', label: 'End' },
      { key: 'classes', label: 'Classes', compute: e => Object.keys(e.classSubjects || {}).join(', ') }],
    dateField: e => e.startDate, getRows() { return arr(() => examDefs); },
  };
  REPORT_SOURCES.timetable = {
    label: 'Timetable', group: 'Academic', hasClassSection: true, noStatusFilter: true,
    columns: [{ key: 'className', label: 'Class' }, { key: 'section', label: 'Section' }, { key: 'day', label: 'Day' }, { key: 'period', label: 'Period' }, { key: 'subject', label: 'Subject' },
      { key: 'teacher', label: 'Teacher', compute: t => nm(stfById(t.staffId)) || t.staffId || '' }],
    getRows(f) { return arr(() => timetableEntries).filter(t => (!f.className || t.className === f.className) && (!f.section || t.section === f.section)); },
  };
  REPORT_SOURCES.subjects = autoSource('Subjects', 'Academic', () => arr(() => subjectsList));
  REPORT_SOURCES.holidays = autoSource('Holidays', 'Academic', () => arr(() => holidays), { dateField: h => h.date || h.startDate });

  /* ---------- STAFF ---------- */
  const stf = REPORT_SOURCES.staff; stf.group = 'Staff';
  [['gender', 'Gender'], ['dob', 'Date of Birth'], ['doj', 'Date of Joining'], ['qualification', 'Qualification'], ['experience', 'Experience'], ['salary', 'Salary'],
   ['address', 'Address'], ['classTeacherClass', 'Class Teacher Of']].forEach(([k, l]) => stf.columns.push({ key: k, label: l }));
  stf.columns.push({ key: 'fullName', label: 'Full Name', compute: s => nm(s) });
  stf.defaultCols = ['staffId', 'firstName', 'lastName', 'department', 'designation', 'phone', 'email', 'status'];
  stf.dateField = s => s.doj;

  REPORT_SOURCES.staffAttendance = {
    label: 'Staff Attendance (summary)', group: 'Staff', hasDept: true, noStatusFilter: true, dateField: null,
    columns: [{ key: 'staffId', label: 'Staff ID' }, { key: 'name', label: 'Name', compute: s => nm(s) }, { key: 'department', label: 'Department' },
      { key: 'present', label: 'Present', compute: s => s._p }, { key: 'absent', label: 'Absent', compute: s => s._a }, { key: 'other', label: 'Leave / Other', compute: s => s._o }],
    getRows(f) {
      const recs = arr(() => staffAttendanceRecords);
      return arr(() => staffList).filter(s => !f.department || s.department === f.department).map(s => {
        const mine = recs.filter(r => (r.staffId === s.staffId) && inRange(r.date, f.fromDate, f.toDate));
        const c = k => mine.filter(r => String(r.status || '').toLowerCase().startsWith(k)).length;
        return Object.assign({}, s, { _p: c('pres'), _a: c('abs'), _o: mine.length - c('pres') - c('abs') });
      });
    }, usesRange: true,
  };
  REPORT_SOURCES.staffLeave = autoSource('Staff Leave Requests', 'Staff', () => arr(() => _staffLeaveCache), { dateField: l => l.fromDate });
  REPORT_SOURCES.payroll = {
    label: 'Staff Payroll', group: 'Staff',
    columns: [{ key: 'month', label: 'Month' }, { key: 'staffId', label: 'Staff ID' }, { key: 'name', label: 'Name', compute: p => nm(stfById(p.staffId)) },
      { key: 'department', label: 'Department', compute: p => (stfById(p.staffId) || {}).department || '' },
      { key: 'basic', label: 'Basic' }, { key: 'grossSalary', label: 'Gross' }, { key: 'totalDeductions', label: 'Deductions' }, { key: 'netSalary', label: 'Net Pay' }],
    filters: [{ id: 'mo', label: 'Month', opts: () => Array.from(new Set(arr(() => staffPayrollRecords).map(p => p.month).filter(Boolean))).sort().reverse(), test: (p, v) => p.month === v }],
    getRows() { return arr(() => staffPayrollRecords); },
  };

  /* ---------- OPERATIONS ---------- */
  REPORT_SOURCES.inventoryItems = autoSource('Inventory — Items / Stock', 'Operations', () => arr(() => inventoryItems));
  REPORT_SOURCES.inventorySales = {
    label: 'Inventory — Sales', group: 'Operations',
    columns: [{ key: 'date', label: 'Date' }, { key: 'itemName', label: 'Item' }, { key: 'buyerType', label: 'Buyer Type' }, { key: 'buyerName', label: 'Buyer' },
      { key: 'qty', label: 'Qty' }, { key: 'unitPrice', label: 'Unit Price' }, { key: 'totalAmount', label: 'Total' }, { key: 'paidAmount', label: 'Paid' },
      { key: 'balance', label: 'Balance', compute: s => num(s.totalAmount) - num(s.paidAmount) }],
    dateField: s => s.date, getRows() { return arr(() => inventorySales); },
  };
  REPORT_SOURCES.libraryBooks = autoSource('Library — Books', 'Operations', () => arr(() => libraryBooks));
  REPORT_SOURCES.libraryIssues = {
    label: 'Library — Issues & Returns', group: 'Operations',
    columns: [{ key: 'bookTitle', label: 'Book' }, { key: 'borrowerName', label: 'Borrower' }, { key: 'issueDate', label: 'Issued' }, { key: 'dueDate', label: 'Due' },
      { key: 'returnDate', label: 'Returned' }, { key: 'status', label: 'Status' }, { key: 'fineAmount', label: 'Fine' }],
    dateField: i => i.issueDate, filters: [{ id: 'st', label: 'Status', opts: () => Array.from(new Set(arr(() => libraryIssues).map(i => i.status).filter(Boolean))), test: (i, v) => i.status === v }],
    getRows() { return arr(() => libraryIssues); },
  };
  REPORT_SOURCES.hostelRooms = {
    label: 'Hostel — Rooms & Occupancy', group: 'Operations',
    columns: [{ key: 'blockName', label: 'Block' }, { key: 'roomNumber', label: 'Room' }, { key: 'roomType', label: 'Type' }, { key: 'capacity', label: 'Capacity' },
      { key: 'occupied', label: 'Occupied', compute: r => arr(() => students).filter(s => s.hostelRoomId === r.id && s.isBoarder === 'Yes' && isActive(s)).length },
      { key: 'fee', label: 'Fee' }, { key: 'wardenName', label: 'Warden' }],
    getRows() { return arr(() => hostelRooms); },
  };
  REPORT_SOURCES.hostelBoarders = {
    label: 'Hostel — Boarders', group: 'Operations', hasClassSection: true,
    columns: [{ key: 'admissionNo', label: 'Admission No' }, { key: 'name', label: 'Student', compute: s => nm(s) }, { key: 'className', label: 'Class' }, { key: 'section', label: 'Section' },
      { key: 'room', label: 'Room', compute: s => { const r = roomOf(s); return r ? (r.blockName || '') + ' ' + (r.roomNumber || '') : ''; } },
      { key: 'warden', label: 'Warden', compute: s => (roomOf(s) || {}).wardenName || '' }, { key: 'fatherPhone', label: 'Father Phone' }],
    getRows(f) { return arr(() => students).filter(s => s.isBoarder === 'Yes' && (!f.className || s.className === f.className) && (!f.section || s.section === f.section) && (f.status === 'all' || (f.status === 'Inactive' ? !isActive(s) : isActive(s)))); },
  };
  REPORT_SOURCES.transportRoutes = {
    label: 'Transport — Routes & Stops', group: 'Operations',
    columns: [{ key: 'name', label: 'Route' }, { key: 'busNumber', label: 'Bus No' }, { key: 'driverName', label: 'Driver' }, { key: 'driverPhone', label: 'Driver Phone' },
      { key: 'stopsCount', label: 'Stops', compute: r => (r.stops || []).length }, { key: 'stops', label: 'Stop List', compute: r => (r.stops || []).map(t => t.name + (t.fare ? ' (' + t.fare + ')' : '')).join(', ') },
      { key: 'students', label: 'Students', compute: r => arr(() => students).filter(s => s.transportRouteId === r.id && isActive(s)).length }],
    getRows() { return arr(() => transportRoutes); },
  };
  REPORT_SOURCES.transportRoster = {
    label: 'Transport — Student Roster', group: 'Operations', hasClassSection: true,
    columns: [{ key: 'admissionNo', label: 'Admission No' }, { key: 'name', label: 'Student', compute: s => nm(s) }, { key: 'className', label: 'Class' }, { key: 'section', label: 'Section' },
      { key: 'route', label: 'Route', compute: s => (routeOf(s) || {}).name || '' }, { key: 'bus', label: 'Bus No', compute: s => (routeOf(s) || {}).busNumber || '' },
      { key: 'stop', label: 'Stop', compute: s => (stopOf(s) || {}).name || '' }, { key: 'fare', label: 'Fare', compute: s => (stopOf(s) || {}).fare || '' }, { key: 'fatherPhone', label: 'Father Phone' }],
    filters: [{ id: 'rt', label: 'Route', opts: () => arr(() => transportRoutes).map(r => r.name), test: (s, v) => (routeOf(s) || {}).name === v }],
    getRows(f) { return arr(() => students).filter(s => s.needsTransport === 'Yes' && (!f.className || s.className === f.className) && (!f.section || s.section === f.section) && (f.status === 'all' || (f.status === 'Inactive' ? !isActive(s) : isActive(s)))); },
  };

  /* ---------- ADMISSIONS, COMMS, SYSTEM ---------- */
  REPORT_SOURCES.inquiries = autoSource('Admission Enquiries', 'Admissions & Other', () => arr(() => admissionInquiries), { dateField: r => r.date || r.createdAt });
  REPORT_SOURCES.messages = autoSource('Messages Sent', 'Admissions & Other', () => arr(() => commsMessages), { dateField: r => String(r.date || r.sentAt || r.createdAt || '').slice(0, 10) });
  REPORT_SOURCES.users = autoSource('System Users', 'Admissions & Other', () => arr(() => users), {});
  REPORT_SOURCES.users.columns; // getter only

  /* ---------- builder UI ---------- */
  const GROUP_ORDER = ['People', 'Fees & Accounts', 'Academic', 'Staff', 'Operations', 'Admissions & Other'];
  const srcGroup = k => REPORT_SOURCES[k].group || 'People';
  let lastPreview = null;

  async function preload() {
    const tryLoad = (key, fn) => { try { return typeof fn === 'function' ? ensureDataLoaded(key, fn) : null; } catch (e) { return null; } };
    await Promise.all([
      tryLoad('payments', G(() => loadPaymentsData)), tryLoad('attendanceRecords', G(() => loadAttendanceRecordsData)),
      tryLoad('examResults', G(() => loadExamResultsData)), tryLoad('staffAttendanceRecords', G(() => loadStaffAttendance)),
      tryLoad('staffList', G(() => loadStaff)), tryLoad('inventorySales', G(() => loadInventorySales)),
      G(() => loadStaffPayroll) ? Promise.resolve(G(() => loadStaffPayroll)()).catch(() => 0) : null,
    ].filter(Boolean));
  }

  function colsFor(src) { return src.columns; }
  function defaultKeys(src) { return (src.defaultCols && src.defaultCols.length) ? src.defaultCols : colsFor(src).slice(0, 12).map(c => c.key); }

  function renderBuilder(body) {
    const src = REPORT_SOURCES[customReportSource] || REPORT_SOURCES.students;
    const cols = colsFor(src);
    if (!customReportSelectedCols || !customReportSelectedCols.some(k => cols.find(c => c.key === k))) customReportSelectedCols = defaultKeys(src);
    const groups = GROUP_ORDER.map(g => ({ g, keys: Object.keys(REPORT_SOURCES).filter(k => srcGroup(k) === g) })).filter(x => x.keys.length);
    body.innerHTML = `
      <p style="font-size:0.85rem;color:var(--ink-soft);margin-bottom:14px;max-width:680px">Build your own report from <b>any part of the ERP</b>: pick a data source, tick the columns, narrow it down with filters, <b>preview</b> the result, then download as Excel or PDF.</p>
      <div class="form-grid" style="max-width:460px;margin-bottom:14px">
        <div class="f-field full"><label>Data Source</label>
          <select id="crSource" onchange="onCustomReportSourceChange(this.value)">
            ${groups.map(x => `<optgroup label="${x.g}">${x.keys.map(k => `<option value="${k}" ${k === customReportSource ? 'selected' : ''}>${REPORT_SOURCES[k].label}</option>`).join('')}</optgroup>`).join('')}
          </select></div></div>
      <div id="crFilters" class="ms-toolbar-left" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px"></div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap">
        <label style="font-size:0.8rem;font-weight:600;color:var(--navy)">Columns to include <span id="crColCount" style="font-weight:400;color:var(--ink-soft)"></span></label>
        <button type="button" class="btn btn-ghost btn-sm" onclick="crSetCols('all')">Select all</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="crSetCols('none')">Clear</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="crSetCols('default')">Standard set</button>
      </div>
      <div class="disc-checklist" style="max-width:760px;margin-bottom:18px">
        ${cols.map(c => `<label class="disc-check-item"><input type="checkbox" class="cr-col-check" value="${c.key}" ${customReportSelectedCols.includes(c.key) ? 'checked' : ''} onchange="crColCount()"> ${c.label}</label>`).join('')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <button class="btn btn-ghost" onclick="crPreview()">👁 Preview</button>
        <button class="btn btn-ghost" onclick="generateCustomReport('excel')">📥 Generate Excel</button>
        <button class="btn btn-primary" onclick="generateCustomReport('pdf')">📄 Generate PDF</button>
      </div>
      <div id="crPreview"></div>`;
    renderFilters();
    crColCount();
  }

  function renderFilters() {
    const box = document.getElementById('crFilters'); if (!box) return;
    const src = REPORT_SOURCES[customReportSource];
    let h = '';
    if (src.hasClassSection) {
      h += `<select id="crClass"><option value="">All Classes</option>${classOpts().map(c => `<option>${c}</option>`).join('')}</select>`;
      h += `<select id="crSection"><option value="">All Sections</option>${secOpts().map(s => `<option value="${s}">Section ${s}</option>`).join('')}</select>`;
    }
    if (src.hasDept) h += `<select id="crDept"><option value="">All Departments</option>${arr(() => staffDepartments).map(d => `<option>${d}</option>`).join('')}</select>`;
    if ((src.hasClassSection || src.hasDept) && !src.noStatusFilter) h += `<select id="crStatus"><option value="Active" selected>Active</option><option value="Inactive">Inactive</option><option value="all">All</option></select>`;
    else if (src.hasClassSection || src.hasDept) h += `<input type="hidden" id="crStatus" value="all">`;
    (src.filters || []).forEach(fl => {
      h += `<select class="cr-xf" data-fid="${fl.id}"><option value="">${fl.label}: All</option>${fl.opts().map(o => `<option>${String(o).replace(/</g, '&lt;')}</option>`).join('')}</select>`;
    });
    if (src.hasDateRange || src.dateField || src.usesRange) {
      h += `<label style="font-size:0.82rem;display:flex;align-items:center;gap:6px">From <input type="date" id="crFromDate"></label>`;
      h += `<label style="font-size:0.82rem;display:flex;align-items:center;gap:6px">To <input type="date" id="crToDate"></label>`;
    }
    h += `<input type="search" id="crSearch" placeholder="🔎 Search within results" style="min-width:200px;padding:9px 12px;border:1px solid var(--line,#d9d6e6);border-radius:10px;background:#fff">`;
    box.innerHTML = h;
  }

  function getFilters() {
    const src = REPORT_SOURCES[customReportSource];
    const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
    const f = { className: v('crClass'), section: v('crSection'), department: v('crDept'), status: v('crStatus') || (src.noStatusFilter ? 'all' : 'Active'),
      fromDate: v('crFromDate'), toDate: v('crToDate'), search: v('crSearch'), x: {} };
    document.querySelectorAll('.cr-xf').forEach(s => { if (s.value) f.x[s.dataset.fid] = s.value; });
    return f;
  }

  function buildRows() {
    finCache = null;
    const src = REPORT_SOURCES[customReportSource];
    const f = getFilters();
    const selected = Array.from(document.querySelectorAll('.cr-col-check:checked')).map(c => c.value);
    const cols = colsFor(src).filter(c => selected.includes(c.key));
    let items = (customReportSource === 'payments' ? (f.x.v === 'Voided only' ? src.getRowsAll().filter(p => p.voided) : src.getRows(f)) : src.getRows(f)) || [];
    // legacy date range for payments + generic date field
    const df = src.hasDateRange && !src.dateField ? (p => p.date) : src.dateField;
    if (df && (f.fromDate || f.toDate)) items = items.filter(it => inRange(df(it), f.fromDate, f.toDate));
    (src.filters || []).forEach(fl => { if (f.x[fl.id] && !(customReportSource === 'payments' && fl.id === 'v')) items = items.filter(it => fl.test(it, f.x[fl.id])); });
    let rows = items.map(item => {
      const row = {};
      cols.forEach(c => { let val = c.compute ? c.compute(item) : item[c.key]; if (val === undefined || val === null) val = ''; if (typeof val === 'boolean') val = val ? 'Yes' : 'No'; row[c.label] = val; });
      return row;
    });
    if (f.search) { const q = f.search.toLowerCase(); rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))); }
    return { rows, cols, src };
  }

  window.crColCount = function () {
    const n = document.querySelectorAll('.cr-col-check:checked').length, t = document.querySelectorAll('.cr-col-check').length;
    const e = document.getElementById('crColCount'); if (e) e.textContent = '(' + n + ' of ' + t + ' selected)';
  };
  window.crSetCols = function (mode) {
    const src = REPORT_SOURCES[customReportSource], def = defaultKeys(src);
    document.querySelectorAll('.cr-col-check').forEach(c => { c.checked = mode === 'all' ? true : mode === 'none' ? false : def.includes(c.value); });
    crColCount();
  };
  window.crPreview = async function () {
    const box = document.getElementById('crPreview'); if (!box) return;
    box.innerHTML = '<p style="font-size:0.85rem;color:var(--ink-soft)">Loading…</p>';
    try { await preload(); } catch (e) {}
    const r = buildRows();
    if (!r.cols.length) { box.innerHTML = '<p style="color:#c0392b;font-size:0.85rem">Select at least one column.</p>'; return; }
    if (!r.rows.length) { box.innerHTML = '<p style="font-size:0.88rem;color:var(--ink-soft)">No records match these filters.</p>'; return; }
    const show = r.rows.slice(0, 10), keys = Object.keys(show[0]);
    box.innerHTML = `<div style="font-size:0.88rem;font-weight:600;margin-bottom:6px">${r.rows.length} record${r.rows.length === 1 ? '' : 's'} found${r.rows.length > 10 ? ' — showing the first 10' : ''}</div>
      <div style="overflow:auto;max-width:100%;border:1px solid var(--line,#e5e7eb);border-radius:8px"><table style="border-collapse:collapse;font-size:0.8rem;width:100%">
      <thead><tr>${keys.map(k => `<th style="text-align:left;padding:6px 8px;background:#f3f4f8;white-space:nowrap">${String(k).replace(/</g, '&lt;')}</th>`).join('')}</tr></thead>
      <tbody>${show.map(row => `<tr>${keys.map(k => `<td style="padding:5px 8px;border-top:1px solid #eee;white-space:nowrap">${String(row[k]).replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };

  renderCustomReportBuilder = renderBuilder;
  renderCustomReportFilters = renderFilters;
  getCustomReportFilters = getFilters;
  onCustomReportSourceChange = function (val) { customReportSource = val; customReportSelectedCols = null; renderReportsBody(); };
  generateCustomReport = async function (format) {
    try { await preload(); } catch (e) {}
    const r = buildRows();
    if (!r.cols.length) { showToast('Select at least one column.'); return; }
    if (!r.rows.length) { showToast('No data matches these filters.'); return; }
    if (format === 'excel') exportRowsToExcel('custom_report_' + customReportSource + '.xlsx', r.src.label.slice(0, 31).replace(/[\\\/\?\*\[\]:]/g, ' '), r.rows);
    else exportRowsToPDF('Custom Report — ' + r.src.label, r.rows.length + ' record(s)', r.rows);
  };
  window.__crSources = REPORT_SOURCES;
})();

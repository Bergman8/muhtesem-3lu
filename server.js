const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const { initDB, saveDB, UPLOADS_DIR } = require('./dbEngine');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    else if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
  }
}));
app.use('/uploads', express.static(UPLOADS_DIR));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage });

// Document Management Storage Config
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, 'documents');
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'doc-' + uniqueSuffix + ext);
  }
});
const docUpload = multer({ storage: docStorage });

// Initialize Database Engine with Auto-repair capability
let db = initDB();

// Helper to get device info from User-Agent
function getDeviceInfo(userAgent) {
  if (!userAgent) return "Bilinməyən Cihaz";
  let device = "Masaüstü (Desktop)";
  if (/mobile/i.test(userAgent)) device = "Mobil (Mobile)";
  else if (/tablet|ipad/i.test(userAgent)) device = "Planşet (Tablet)";
  
  let browser = "Bilinməyən Brauzer";
  if (/chrome|crios/i.test(userAgent) && !/edge|opr|opios/i.test(userAgent)) browser = "Chrome";
  else if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) browser = "Safari";
  else if (/firefox|fxios/i.test(userAgent)) browser = "Firefox";
  else if (/edge|edg/i.test(userAgent)) browser = "Edge";
  else if (/opr|opera/i.test(userAgent)) browser = "Opera";
  
  return `${device} - ${browser}`;
}

// Helper to record activity logs
function addActivityLog(user, action, details = "") {
  const newLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    user: user || "Sistem",
    action,
    details
  };
  db.activityLogs.unshift(newLog);
  saveDB(db);
}

// Convert Excel Column letters ("A", "B", "AA"...) to 0-based column indexes
function colLetterToIndex(colStr) {
  if (!colStr) return -1;
  const str = colStr.trim().toUpperCase();
  let index = 0;
  for (let i = 0; i < str.length; i++) {
    index = index * 26 + (str.charCodeAt(i) - 64);
  }
  return index - 1;
}

// Format date strings cleanly
function formatDateStr(val, isDateField = false) {
  if (val === undefined || val === null) return "";
  if (isDateField && typeof val === 'number') {
    // Excel date serial number conversion
    const date = xlsx.SSF.parse_date_code(val);
    if (date) {
      const dd = String(date.d).padStart(2, '0');
      const mm = String(date.m).padStart(2, '0');
      const yyyy = date.y;
      return `${dd}.${mm}.${yyyy}`;
    }
  }
  const str = String(val).trim();
  return str;
}

// -------------------------------------------------------------
// AUTH API
// -------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username.toLowerCase() === (username || '').toLowerCase() && u.password === password);
  
  if (!user) {
    return res.status(401).json({ success: false, message: "İstifadəçi adı və ya şifrə yanlışdır!" });
  }

  if (!user.active) {
    return res.status(403).json({ success: false, message: "Hesabınız deaktiv edilib. Rəhbərliklə əlaqə saxlayın." });
  }

  // Get client IP and Device Info
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  const cleanIp = ip === '::1' ? '127.0.0.1' : ip.replace(/^.*:/, '');
  const userAgent = req.headers['user-agent'] || '';
  const deviceInfo = getDeviceInfo(userAgent);

  const loginLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    username: user.username,
    name: user.name,
    role: user.role,
    ip: cleanIp,
    device: deviceInfo
  };

  if (!db.loginLogs) db.loginLogs = [];
  db.loginLogs.unshift(loginLog);
  // Keep last 100 entries to avoid bloating the database
  if (db.loginLogs.length > 100) {
    db.loginLogs = db.loginLogs.slice(0, 100);
  }

  addActivityLog(user.name, "Sistemə giriş etdi", `IP: ${cleanIp} | Cihaz: ${deviceInfo}`);
  saveDB(db);

  return res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

app.get('/api/login-logs', (req, res) => {
  res.json({ success: true, logs: db.loginLogs || [] });
});

// -------------------------------------------------------------
// USERS MANAGEMENT (Hesablar - Qəşəm Only)
// -------------------------------------------------------------
app.get('/api/users', (req, res) => {
  res.json({ success: true, users: db.users });
});

app.post('/api/users', (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ success: false, message: "Bütün xanaları doldurun." });
  }
  
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ success: false, message: "Bu istifadəçi adı artıq mövcuddur." });
  }

  const newUser = {
    id: `u-${Date.now()}`,
    username: username.toLowerCase(),
    password,
    name,
    role: role || 'operator',
    active: true
  };

  db.users.push(newUser);
  addActivityLog("Qəşəm", `Yeni istifadəçi hesabı yaradıldı: ${name} (${username})`);
  saveDB(db);
  res.json({ success: true, user: newUser });
});

app.put('/api/users/:id', (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ success: false, message: "İstifadəçi tapılmadı" });

  const { name, password, role, active } = req.body;
  if (name !== undefined) user.name = name;
  if (password !== undefined && password !== "") user.password = password;
  if (role !== undefined) user.role = role;
  if (active !== undefined) user.active = Boolean(active);

  addActivityLog("Qəşəm", `İstifadəçi hesabı yeniləndi: ${user.name}`);
  saveDB(db);
  res.json({ success: true, user });
});

app.delete('/api/users/:id', (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ success: false, message: "İstifadəçi tapılmadı" });

  if (user.username === 'qesem') {
    return res.status(400).json({ success: false, message: "Baş yönetici hesabını silmək olmaz!" });
  }

  user.active = false;
  addActivityLog("Qəşəm", `İstifadəçi hesabı deaktiv edildi: ${user.name}`);
  saveDB(db);
  res.json({ success: true, message: "Hesab deaktiv edildi" });
});

// -------------------------------------------------------------
// EXCEL IMPORT & STUDENTS API
// -------------------------------------------------------------
app.post('/api/students/import-excel', upload.single('excelFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Excel faylı seçilməyib." });
    }

    const colMap = JSON.parse(req.body.columnMap || '{}');
    // colMap expected: { nameCol, passportCol, emailCol, birthDateCol, passIssueCol, passExpiryCol, customFields: [{ label: "Ata Adı", col: "G" }] }

    const nameIdx = colLetterToIndex(colMap.nameCol);
    const surnameIdx = colLetterToIndex(colMap.surnameCol);
    const passportIdx = colLetterToIndex(colMap.passportCol);
    const emailIdx = colLetterToIndex(colMap.emailCol);
    const birthDateIdx = colLetterToIndex(colMap.birthDateCol);
    const passIssueIdx = colLetterToIndex(colMap.passIssueCol);
    const passExpiryIdx = colLetterToIndex(colMap.passExpiryCol);

    const customFieldSpecs = Array.isArray(colMap.customFields) ? colMap.customFields : [];

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length === 0) {
      return res.status(400).json({ success: false, message: "Excel faylı boşdur." });
    }

    let addedCount = 0;
    // Skip header row if first row has text headers
    const startRow = (typeof rawData[0][nameIdx] === 'string' && rawData[0][nameIdx].toLowerCase().includes('ad')) ? 1 : 0;

    for (let i = startRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const rawName = nameIdx >= 0 ? formatDateStr(row[nameIdx]) : '';
      const rawSurname = surnameIdx >= 0 ? formatDateStr(row[surnameIdx]) : '';
      const passportNo = passportIdx >= 0 ? formatDateStr(row[passportIdx]) : '';
      const email = emailIdx >= 0 ? formatDateStr(row[emailIdx]) : '';
      const birthDate = birthDateIdx >= 0 ? formatDateStr(row[birthDateIdx], true) : '';
      const passIssueDate = passIssueIdx >= 0 ? formatDateStr(row[passIssueIdx], true) : '';
      const passExpiryDate = passExpiryIdx >= 0 ? formatDateStr(row[passExpiryIdx], true) : '';

      if (!rawName && !rawSurname && !passportNo) continue; // Skip completely empty rows

      let firstName = rawName;
      let surname = rawSurname;

      if (!surname && firstName.includes(' ')) {
        const parts = firstName.split(' ');
        surname = parts.pop();
        firstName = parts.join(' ');
      }

      // Extract custom fields from row
      const customFieldsObj = {};
      customFieldSpecs.forEach(spec => {
        if (spec.label && spec.col) {
          const colIdx = colLetterToIndex(spec.col);
          if (colIdx >= 0 && row[colIdx] !== undefined) {
            customFieldsObj[spec.label.trim()] = formatDateStr(row[colIdx]);
          }
        }
      });

      const newStudent = {
        id: `std-${Date.now()}-${i}`,
        name: firstName || "Tələbə",
        surname: surname || "",
        passportNo: passportNo || `P-${Math.floor(100000 + Math.random() * 900000)}`,
        email: email || "yoxdur@mail.com",
        birthDate: birthDate || "",
        passIssueDate: passIssueDate || "",
        passExpiryDate: passExpiryDate || "",
        customFields: customFieldsObj,
        addedAt: new Date().toISOString()
      };

      db.students.push(newStudent);
      addedCount++;
    }

    addActivityLog("Qəşəm", `Excel-dən ${addedCount} tələbə məlumatı bazaya əlavə edildi.`);
    saveDB(db);
    res.json({ success: true, count: addedCount, students: db.students });
  } catch (err) {
    console.error("Excel import error:", err);
    res.status(500).json({ success: false, message: "Excel oxunarkən xəta baş verdi: " + err.message });
  }
});

app.get('/api/students', (req, res) => {
  res.json({ success: true, students: db.students });
});

app.post('/api/students', (req, res) => {
  const { name, surname, passportNo, email, birthDate, passIssueDate, passExpiryDate, customFields, emailPassword } = req.body;
  if (!name || !passportNo) {
    return res.status(400).json({ success: false, message: "Ad və Pasport No mütləqdir." });
  }

  const student = {
    id: `std-${Date.now()}`,
    name,
    surname: surname || "",
    passportNo,
    email: email || "",
    emailPassword: emailPassword || "",
    birthDate: birthDate || "",
    passIssueDate: passIssueDate || "",
    passExpiryDate: passExpiryDate || "",
    customFields: customFields || {},
    addedAt: new Date().toISOString()
  };

  db.students.push(student);
  addActivityLog(req.body.operator || "Sistem", `Yeni tələbə əlavə edildi: ${name} ${surname}`);
  saveDB(db);
  res.json({ success: true, student });
});

app.put('/api/students/:id', (req, res) => {
  const student = db.students.find(s => s.id === req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Tələbə tapılmadı" });

  const { name, surname, passportNo, email, birthDate, passIssueDate, passExpiryDate, customFields, parentName, parentPhone, emailPassword } = req.body;
  if (name !== undefined) student.name = name;
  if (surname !== undefined) student.surname = surname;
  if (passportNo !== undefined) student.passportNo = passportNo;
  if (email !== undefined) student.email = email;
  if (birthDate !== undefined) student.birthDate = birthDate;
  if (passIssueDate !== undefined) student.passIssueDate = passIssueDate;
  if (passExpiryDate !== undefined) student.passExpiryDate = passExpiryDate;
  if (customFields !== undefined) student.customFields = customFields;
  if (parentName !== undefined) student.parentName = parentName;
  if (parentPhone !== undefined) student.parentPhone = parentPhone;
  if (emailPassword !== undefined) student.emailPassword = emailPassword;

  addActivityLog(req.body.operator || "Sistem", `Tələbə məlumatları düzəliş edildi: ${student.name} ${student.surname}`);
  saveDB(db);
  res.json({ success: true, student });
});

app.delete('/api/students/:id', (req, res) => {
  const idx = db.students.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Tələbə tapılmadı" });

  const deleted = db.students.splice(idx, 1)[0];
  addActivityLog(req.body.operator || "Sistem", `Tələbə bazadan silindi: ${deleted.name} ${deleted.surname}`);
  saveDB(db);
  res.json({ success: true, message: "Tələbə silindi" });
});

// -------------------------------------------------------------
// UNIVERSITIES & ROUNDS API
// -------------------------------------------------------------
app.get('/api/universities', (req, res) => {
  res.json({ success: true, universities: db.universities });
});

app.post('/api/universities/scrape', async (req, res) => {
  try {
    const url = "https://www.yok.gov.tr/tr/university?type=1";
    const response = await axios.get(url, { timeout: 8000 });
    const $ = cheerio.load(response.data);
    const scrapedUnis = [];

    $('.university-list-item, table tr, .list-group-item, a').each((i, el) => {
      const txt = $(el).text().trim();
      if (txt.includes('Üniversitesi') || txt.includes('ÜNİVERSİTESİ')) {
        if (!scrapedUnis.includes(txt) && txt.length < 90) {
          scrapedUnis.push(txt);
        }
      }
    });

    if (scrapedUnis.length > 0) {
      scrapedUnis.forEach(uniName => {
        if (!db.universities.some(u => u.name.toLowerCase() === uniName.toLowerCase())) {
          db.universities.push({
            id: `uni-${Date.now()}-${Math.floor(Math.random()*1000)}`,
            name: uniName,
            code: `YOK-${Math.floor(1000 + Math.random()*9000)}`,
            currentRound: "1. Tur",
            startDate: "01.08.2026",
            endDate: "31.08.2026",
            rounds: [{ roundName: "1. Tur", startDate: "01.08.2026", endDate: "31.08.2026", status: "active" }]
          });
        }
      });
      addActivityLog("Sistem", `YÖK saytından ${scrapedUnis.length} universitet uğurla skrayp edildi.`);
      saveDB(db);
    }
    
    res.json({ success: true, count: scrapedUnis.length, universities: db.universities });
  } catch (err) {
    console.warn("Live scrape failed, relying on pre-seeded dataset:", err.message);
    res.json({ success: true, count: db.universities.length, message: "Saytdan yükləmə zamanı gecikmə yarandı, mövcud universitetlərin siyahısı təqdim olunur.", universities: db.universities });
  }
});

app.put('/api/universities/:id', (req, res) => {
  const uni = db.universities.find(u => u.id === req.params.id);
  if (!uni) return res.status(404).json({ success: false, message: "Universitet tapılmadı" });

  const { name, code, startDate, endDate, currentRound, quotas, location, mapsUrl, rounds } = req.body;
  if (name !== undefined) uni.name = name;
  if (code !== undefined) uni.code = code;
  if (startDate !== undefined) uni.startDate = startDate;
  if (endDate !== undefined) uni.endDate = endDate;
  if (currentRound !== undefined) uni.currentRound = currentRound;
  if (quotas !== undefined) uni.quotas = quotas;
  if (location !== undefined) uni.location = location;
  if (mapsUrl !== undefined) uni.mapsUrl = mapsUrl;
  if (rounds !== undefined && Array.isArray(rounds)) {
    uni.rounds = rounds;
    if (rounds.length > 0) {
      const activeRound = rounds[rounds.length - 1];
      uni.currentRound = activeRound.roundName;
      uni.startDate = activeRound.startDate;
      uni.endDate = activeRound.endDate;
    }
  }

  addActivityLog(req.body.operator || "Rəhbərlik", `Universitet məlumatları yeniləndi (Takvim): ${uni.name}`);
  saveDB(db);
  io.emit('dataChanged', { type: 'university', action: 'update', id: uni.id });
  res.json({ success: true, university: uni });
});

app.post('/api/universities/:id/rounds', (req, res) => {
  const uni = db.universities.find(u => u.id === req.params.id);
  if (!uni) return res.status(404).json({ success: false, message: "Universitet tapılmadı" });

  const { roundName, startDate, endDate } = req.body;
  if (!roundName || !startDate || !endDate) {
    return res.status(400).json({ success: false, message: "Bütün tur məlumatlarını doldurun." });
  }

  if (!uni.rounds) uni.rounds = [];
  uni.rounds.push({ roundName, startDate, endDate, status: "active" });
  uni.currentRound = roundName;
  uni.startDate = startDate;
  uni.endDate = endDate;

  addActivityLog(req.body.operator || "Rəhbərlik", `${uni.name} üçün yeni tur açıldı: ${roundName} (${startDate} - ${endDate})`);
  saveDB(db);
  res.json({ success: true, university: uni });
});

// -------------------------------------------------------------
// APPLICATIONS & YOXLANIŞ WORKFLOW API
// -------------------------------------------------------------
app.get('/api/applications', (req, res) => {
  res.json({ success: true, applications: db.applications, verifications: db.verifications });
});

app.post('/api/applications', (req, res) => {
  const { studentId, universityId, createdBy } = req.body;
  const student = db.students.find(s => s.id === studentId);
  const uni = db.universities.find(u => u.id === universityId);

  if (!student || !uni) {
    return res.status(400).json({ success: false, message: "Tələbə və ya Universitet seçilməyib." });
  }

  // Check if application already exists for this round
  const existing = db.applications.find(a => a.studentId === studentId && a.universityId === universityId && a.round === uni.currentRound);
  if (existing) {
    return res.status(400).json({ success: false, message: `Bu tələbə artıq ${uni.name} (${uni.currentRound}) üçün müraciət edib!` });
  }

  const appId = `app-${Date.now()}`;
  const newApp = {
    id: appId,
    studentId: student.id,
    studentName: `${student.name} ${student.surname}`.trim(),
    passportNo: student.passportNo,
    universityId: uni.id,
    universityName: uni.name,
    round: uni.currentRound,
    createdBy: createdBy || "İşçi",
    createdAt: new Date().toISOString(),
    status: "Kontrol Bekleniyor"
  };

  db.applications.push(newApp);

  // Automatically create entry in Yoxlanış queue
  const verificationItem = {
    id: `ver-${Date.now()}`,
    applicationId: appId,
    studentId: student.id,
    studentName: `${student.name} ${student.surname}`.trim(),
    passportNo: student.passportNo,
    universityId: uni.id,
    universityName: uni.name,
    round: uni.currentRound,
    createdBy: createdBy || "İşçi",
    checkedBy: null,
    previousCheckedBy: null,
    status: "Kontrol Bekleniyor", // Red stage
    deadlineDate: uni.endDate,
    updatedAt: new Date().toISOString()
  };

  db.verifications.push(verificationItem);
  addActivityLog(createdBy || "İşçi", `${student.name} ${student.surname} -> ${uni.name} başvuru olundu. Yoxlanış bölməsinə göndərildi.`);
  saveDB(db);

  // Real-time notification to all connected clients
  io.emit('newVerification', verificationItem);
  io.emit('dataChanged', { type: 'application', action: 'create' });

  res.json({ success: true, application: newApp, verification: verificationItem });
});

app.post('/api/applications/:id/admission-result', (req, res) => {
  const { result, operator } = req.body;
  const appItem = db.applications.find(a => a.id === req.params.id);
  if (!appItem) return res.status(404).json({ success: false, message: "Müraciət tapılmadı." });

  appItem.admissionResult = result; // 'Qəbul' or 'Rədd'
  
  addActivityLog(operator || "Sistem", `${appItem.studentName} üçün ${appItem.universityName} müraciəti qərarı: ${result}`);
  saveDB(db);
  
  io.emit('dataChanged', { type: 'application', action: 'update', id: appItem.id });
  res.json({ success: true, application: appItem });
});

// Re-send single application to verification
app.post('/api/applications/:id/reverify', (req, res) => {
  const appItem = db.applications.find(a => a.id === req.params.id);
  if (!appItem) return res.status(404).json({ success: false, message: "Başvuru tapılmadı" });

  const verItem = db.verifications.find(v => v.applicationId === appItem.id);
  const previousChecker = verItem ? (verItem.checkedBy || verItem.previousCheckedBy) : null;

  appItem.status = "Kontrol Bekleniyor";

  if (verItem) {
    verItem.previousCheckedBy = previousChecker || verItem.checkedBy;
    verItem.checkedBy = null;
    verItem.status = "Kontrol Bekleniyor";
    verItem.updatedAt = new Date().toISOString();
  } else {
    db.verifications.push({
      id: `ver-${Date.now()}`,
      applicationId: appItem.id,
      studentId: appItem.studentId,
      studentName: appItem.studentName,
      passportNo: appItem.passportNo,
      universityId: appItem.universityId,
      universityName: appItem.universityName,
      round: appItem.round,
      createdBy: appItem.createdBy,
      checkedBy: null,
      previousCheckedBy: previousChecker,
      status: "Kontrol Bekleniyor",
      updatedAt: new Date().toISOString()
    });
  }

  addActivityLog(req.body.operator || "Sistem", `${appItem.studentName} (${appItem.universityName}) təkrar yoxlanışa göndərildi.`);
  saveDB(db);
  res.json({ success: true, message: "Təkrar yoxlanışa göndərildi" });
});

// Re-verify ALL applications for a university
app.post('/api/universities/:id/reverify-all', (req, res) => {
  const uni = db.universities.find(u => u.id === req.params.id);
  if (!uni) return res.status(404).json({ success: false, message: "Universitet tapılmadı" });

  const uniApps = db.applications.filter(a => a.universityId === uni.id);
  let count = 0;

  uniApps.forEach(appItem => {
    appItem.status = "Kontrol Bekleniyor";
    const verItem = db.verifications.find(v => v.applicationId === appItem.id);
    if (verItem) {
      verItem.previousCheckedBy = verItem.checkedBy || verItem.previousCheckedBy;
      verItem.checkedBy = null;
      verItem.status = "Kontrol Bekleniyor";
      verItem.updatedAt = new Date().toISOString();
      count++;
    }
  });

  addActivityLog(req.body.operator || "Rəhbərlik", `${uni.name} üzrə bütün (${count}) müraciətlər təkrar yoxlanışa göndərildi.`);
  saveDB(db);
  res.json({ success: true, count, message: `${count} müraciət təkrar yoxlanışa göndərildi.` });
});

app.delete('/api/applications/:id', (req, res) => {
  const idx = db.applications.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Başvuru tapılmadı" });

  const deleted = db.applications.splice(idx, 1)[0];
  db.verifications = db.verifications.filter(v => v.applicationId !== deleted.id);

  addActivityLog(req.body.operator || "Sistem", `${deleted.studentName} üçün ${deleted.universityName} müraciəti silindi.`);
  saveDB(db);
  res.json({ success: true, message: "Müraciət silindi" });
});

// -------------------------------------------------------------
// YOXLANIŞ ACTIONS & RE-VERIFICATION CONSTRAINTS
// -------------------------------------------------------------
app.get('/api/verifications', (req, res) => {
  res.json({ success: true, verifications: db.verifications });
});

// Claim verification task (Moves to Kontrol Ediliyor - Yellow)
app.post('/api/verifications/:id/claim', (req, res) => {
  const verItem = db.verifications.find(v => v.id === req.params.id);
  if (!verItem) return res.status(404).json({ success: false, message: "Yoxlanış elementi tapılmadı" });

  const { username, userRole, managerOverride } = req.body;

  // Strict Re-verification Constraint:
  // "Təkrar yoxlanışa göndərilərsə əgər həmin uşaq bu səfər yöneticinin icazəsi olmadan o yoxlanışı edən şəxsdən başqa bir şəxs yoxlamanı götürməlidir."
  if (verItem.previousCheckedBy && verItem.previousCheckedBy.toLowerCase() === (username || '').toLowerCase()) {
    if (userRole !== 'admin' && !managerOverride && !verItem.allowedPreviousChecker) {
      return res.status(403).json({
        success: false,
        recheckLocked: true,
        message: `Təkrar yoxlanış xəbərdarlığı: Siz bu tələbəni əvvəl yoxlamısınız! Bu yoxlanışı başqa operator aparmalıdır və ya Yönetici (Qəşəm) tərəfindən icazə verilməlidir.`
      });
    }
  }

  verItem.status = "Kontrol Ediliyor";
  verItem.checkedBy = username;
  verItem.updatedAt = new Date().toISOString();

  // Update application status
  const appItem = db.applications.find(a => a.id === verItem.applicationId);
  if (appItem) {
    appItem.status = "Kontrol Ediliyor";
  }

  addActivityLog(username, `${verItem.studentName} (${verItem.universityName}) yoxlanışını öz üzərinə götürdü (Yoxlanılır).`);
  saveDB(db);
  io.emit('dataChanged', { type: 'verification', action: 'claim' });
  res.json({ success: true, verification: verItem });
});

// Complete verification (Moves to Kontrol Edildi - Green)
app.post('/api/verifications/:id/complete', (req, res) => {
  const verItem = db.verifications.find(v => v.id === req.params.id);
  if (!verItem) return res.status(404).json({ success: false, message: "Yoxlanış elementi tapılmadı" });

  const { username } = req.body;
  verItem.status = "Kontrol Edildi";
  verItem.checkedBy = username || verItem.checkedBy;
  verItem.updatedAt = new Date().toISOString();

  const appItem = db.applications.find(a => a.id === verItem.applicationId);
  if (appItem) {
    appItem.status = "Kontrol Edildi";
  }

  addActivityLog(username || verItem.checkedBy, `${verItem.studentName} (${verItem.universityName}) yoxlanışı tamamlandı (Yoxlanıldı).`);
  saveDB(db);
  io.emit('dataChanged', { type: 'verification', action: 'complete' });
  res.json({ success: true, verification: verItem });
});

// Allow a previous checker to verify again (Qəşəm only)
app.post('/api/verifications/:id/allow-recheck', (req, res) => {
  const { role } = req.query;
  if (role !== 'admin') {
    return res.status(403).json({ success: false, message: "Bu icazəni yalnız Yönetici (Qəşəm) verə bilər." });
  }

  const verItem = db.verifications.find(v => v.id === req.params.id);
  if (!verItem) return res.status(404).json({ success: false, message: "Yoxlanış tapılmadı" });

  const { allowed } = req.body;
  verItem.allowedPreviousChecker = Boolean(allowed);

  addActivityLog("Qəşəm", `${verItem.studentName} üçün təkrar yoxlanış icazəsi: ${allowed ? 'İcazə Verildi' : 'Ləğv Edildi'}`);
  saveDB(db);
  res.json({ success: true, verification: verItem });
});

// -------------------------------------------------------------
// DASHBOARD & ACTIVITY LOGS API
// -------------------------------------------------------------
app.get('/api/dashboard/stats', (req, res) => {
  // Aggregate university applications count
  const uniStatsMap = {};
  db.applications.forEach(app => {
    uniStatsMap[app.universityName] = (uniStatsMap[app.universityName] || 0) + 1;
  });

  const recentUnis = Object.keys(uniStatsMap).map(uniName => ({
    name: uniName,
    applicantCount: uniStatsMap[uniName]
  })).sort((a, b) => b.applicantCount - a.applicantCount).slice(0, 10);

  const recentStudents = db.students.slice(-10).reverse();

  res.json({
    success: true,
    totalStudents: db.students.length,
    totalUniversities: db.universities.length,
    totalApplications: db.applications.length,
    pendingVerifications: db.verifications.filter(v => v.status === 'Kontrol Bekleniyor').length,
    recentUnis,
    recentStudents
  });
});

app.get('/api/activity-logs', (req, res) => {
  res.json({ success: true, activityLogs: db.activityLogs });
});

app.put('/api/activity-logs/:id', (req, res) => {
  const { role } = req.query;
  if (role !== 'admin') {
    return res.status(403).json({ success: false, message: "Fəaliyyət jurnalını sadəcə Yönetici (Qəşəm) redaktə edə bilər!" });
  }

  const log = db.activityLogs.find(l => l.id === req.params.id);
  if (!log) return res.status(404).json({ success: false, message: "Log tapılmadı" });

  const { action, details } = req.body;
  if (action) log.action = action;
  if (details !== undefined) log.details = details;

  saveDB(db);
  res.json({ success: true, log });
});

app.delete('/api/activity-logs/:id', (req, res) => {
  const { role } = req.query;
  if (role !== 'admin') {
    return res.status(403).json({ success: false, message: "Fəaliyyət jurnalını sadəcə Yönetici (Qəşəm) silə bilər!" });
  }

  const idx = db.activityLogs.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Log tapılmadı" });

  db.activityLogs.splice(idx, 1);
  saveDB(db);
  res.json({ success: true, message: "Log silindi" });
});

// -------------------------------------------------------------
// KITAB SATIŞLARI (Jale / Qəşəm) API
// -------------------------------------------------------------
app.get('/api/books', (req, res) => {
  res.json({ success: true, books: db.books, sales: db.sales });
});

app.post('/api/books', upload.single('bookImage'), (req, res) => {
  const { name, coursePrice, nonCoursePrice } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: "Kitabın adını daxil edin." });
  }

  let imageUrl = '/uploads/default-book.png';
  if (req.file) {
    imageUrl = `/uploads/${req.file.filename}`;
  } else if (req.body.imageUrl) {
    imageUrl = req.body.imageUrl;
  }

  const newBook = {
    id: `book-${Date.now()}`,
    name,
    coursePrice: Number(coursePrice) || 0,
    nonCoursePrice: Number(nonCoursePrice) || 0,
    imageUrl,
    addedAt: new Date().toISOString()
  };

  db.books.push(newBook);
  addActivityLog("Jalə", `Yeni kitab əlavə edildi: ${name}`);
  saveDB(db);
  res.json({ success: true, book: newBook });
});

app.post('/api/books/:id/import-sales', upload.single('excelFile'), (req, res) => {
  try {
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ success: false, message: "Kitab tapılmadı" });

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Excel faylı seçilməyib." });
    }

    const colMap = JSON.parse(req.body.columnMap || '{}');
    const nameIdx = colLetterToIndex(colMap.nameCol);
    const paymentIdx = colLetterToIndex(colMap.paymentCol);
    const priceTypeIdx = colLetterToIndex(colMap.priceTypeCol);
    const dateIdx = colLetterToIndex(colMap.dateCol);
    const deliveredIdx = colLetterToIndex(colMap.deliveredCol);

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length === 0) {
      return res.status(400).json({ success: false, message: "Excel faylı boşdur." });
    }

    let addedCount = 0;
    const startRow = (typeof rawData[0][nameIdx] === 'string' && rawData[0][nameIdx].toLowerCase().includes('ad')) ? 1 : 0;

    for (let i = startRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const studentName = nameIdx >= 0 ? formatDateStr(row[nameIdx]) : '';
      if (!studentName) continue;

      const rawPayment = paymentIdx >= 0 ? formatDateStr(row[paymentIdx]) : '';
      let paymentType = 'Nağd';
      if (rawPayment.toLowerCase().includes('kart')) paymentType = 'Kart';
      else if (rawPayment.toLowerCase().includes('nisyə') || rawPayment.toLowerCase().includes('kredit')) paymentType = 'Nisyə';

      const rawPriceType = priceTypeIdx >= 0 ? formatDateStr(row[priceTypeIdx]) : '';
      const priceType = rawPriceType.toLowerCase().includes('xaric') ? 'nonkursiçi' : 'kursiçi';
      const finalPrice = priceType === 'kursiçi' ? book.coursePrice : book.nonCoursePrice;

      const saleDate = dateIdx >= 0 ? formatDateStr(row[dateIdx], true) : new Date().toLocaleDateString('tr-TR');

      const rawDelivered = deliveredIdx >= 0 ? formatDateStr(row[deliveredIdx]) : '';
      const delivered = (rawDelivered.toLowerCase().includes('hə') || rawDelivered.toLowerCase().includes('bəli') || rawDelivered === '1' || rawDelivered.toLowerCase().includes('yes') || rawDelivered.toLowerCase().includes('təhvil'));

      const saleItem = {
        id: `sale-${Date.now()}-${i}`,
        bookId: book.id,
        bookName: book.name,
        studentName,
        priceType,
        price: finalPrice,
        paymentType,
        date: saleDate,
        delivered: Boolean(delivered),
        teacherHandedOver: false
      };

      db.sales.push(saleItem);
      addedCount++;
    }

    addActivityLog("Jalə", `Excel-dən ${book.name} üçün ${addedCount} ədəd satış qeydə alındı.`);
    saveDB(db);
    res.json({ success: true, count: addedCount, sales: db.sales });
  } catch (err) {
    console.error("Book sales Excel import error:", err);
    res.status(500).json({ success: false, message: "Satış siyahısı idxal edilərkən xəta baş verib: " + err.message });
  }
});

app.post('/api/books/:id/sales', (req, res) => {
  const book = db.books.find(b => b.id === req.params.id);
  if (!book) return res.status(404).json({ success: false, message: "Kitab tapılmadı" });

  const { studentName, priceType, paymentType, date, delivered } = req.body;
  if (!studentName) {
    return res.status(400).json({ success: false, message: "Tələbə adını daxil edin." });
  }

  const finalPrice = priceType === 'kursiçi' ? book.coursePrice : book.nonCoursePrice;
  const saleItem = {
    id: `sale-${Date.now()}`,
    bookId: book.id,
    bookName: book.name,
    studentName,
    priceType: priceType || 'kursiçi',
    price: finalPrice,
    paymentType: paymentType || 'Nağd', // Kart, Nağd, Nisyə
    date: date || new Date().toLocaleDateString('tr-TR'),
    delivered: Boolean(delivered),
    teacherHandedOver: false
  };

  db.sales.push(saleItem);
  addActivityLog("Jalə", `Kitab satışı qeydə alındı: ${studentName} - ${book.name} (${finalPrice} AZN, ${paymentType})`);
  saveDB(db);
  res.json({ success: true, sale: saleItem });
});

// Batch mark sales as delivered up to row N
app.post('/api/books/:id/batch-deliver', (req, res) => {
  const bookId = req.params.id;
  const { upToRowNumber } = req.body;
  const limit = parseInt(upToRowNumber, 10);

  if (isNaN(limit) || limit <= 0) {
    return res.status(400).json({ success: false, message: "Düzgün sıra nömrəsi daxil edin." });
  }

  const bookSales = db.sales.filter(s => s.bookId === bookId);
  let updatedCount = 0;

  for (let i = 0; i < Math.min(limit, bookSales.length); i++) {
    if (!bookSales[i].delivered) {
      bookSales[i].delivered = true;
      updatedCount++;
    }
  }

  addActivityLog("Jalə", `${updatedCount} ədəd satış ${limit}-ci sıraya qədər təhvil verildi olaraq qeyd edildi.`);
  saveDB(db);
  res.json({ success: true, count: updatedCount });
});

// Toggle single sale delivery
app.post('/api/books/sales/:saleId/toggle-deliver', (req, res) => {
  const sale = db.sales.find(s => s.id === req.params.saleId);
  if (!sale) return res.status(404).json({ success: false, message: "Satış tapılmadı" });

  sale.delivered = !sale.delivered;
  saveDB(db);
  res.json({ success: true, sale });
});

// Hand over cash to teacher
app.post('/api/books/sales/handover-teacher', (req, res) => {
  const { saleIds } = req.body;
  if (!Array.isArray(saleIds)) return res.status(400).json({ success: false, message: "Satış siyahısı yanlışdır." });

  let totalAmount = 0;
  saleIds.forEach(id => {
    const sale = db.sales.find(s => s.id === id);
    if (sale) {
      sale.teacherHandedOver = true;
      totalAmount += sale.price;
    }
  });

  addActivityLog("Jalə", `Müəllimə məbləğ təhvil verildi: ${totalAmount} AZN (${saleIds.length} ədəd satış).`);
  saveDB(db);
  res.json({ success: true, totalAmount });
});

// -------------------------------------------------------------
// SYSTEM RESET & DOCUMENT VAULT APIS
// -------------------------------------------------------------
const decodeUtf8 = (str) => {
  if (!str) return "";
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch (e) {
    return str;
  }
};

app.post('/api/system/reset-students', (req, res) => {
  const { role } = req.query;
  if (role !== 'admin') {
    return res.status(403).json({ success: false, message: "Bu əməliyyatı yalnız Yönetici (Qəşəm) yerinə yetirə bilər." });
  }

  db.students = [];
  db.applications = [];
  db.verifications = [];
  db.documents = [];

  // Also clean documents directory on disk
  try {
    const docDir = path.join(UPLOADS_DIR, 'documents');
    if (fs.existsSync(docDir)) {
      const files = fs.readdirSync(docDir);
      for (const file of files) {
        fs.unlinkSync(path.join(docDir, file));
      }
    }
  } catch (err) {
    console.error("Failed to clean documents directory on reset:", err);
  }

  addActivityLog("Qəşəm", "BÜTÜN tələbə məlumatları, müraciətlər, yoxlanışlar və sənədlər sıfırlandı.");
  saveDB(db);
  res.json({ success: true, message: "Bütün tələbə məlumatları və sənədlər uğurla sıfırlandı." });
});

app.post('/api/documents/clear-all', (req, res) => {
  const { operator } = req.body;
  db.documents = [];

  try {
    const docDir = path.join(UPLOADS_DIR, 'documents');
    if (fs.existsSync(docDir)) {
      const files = fs.readdirSync(docDir);
      for (const file of files) {
        fs.unlinkSync(path.join(docDir, file));
      }
    }
  } catch (err) {
    console.error("Failed to clean documents directory:", err);
  }

  addActivityLog(operator || "Sistem", "Bütün sənəd arşivi təmizləndi.");
  saveDB(db);
  res.json({ success: true, message: "Bütün sənədlər uğurla təmizləndi." });
});

app.get('/api/documents', (req, res) => {
  res.json({ success: true, documents: db.documents || [] });
});

app.post('/api/documents/upload', docUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "Fayl seçilməyib." });
  }

  const { studentId, folderName, customName, operator } = req.body;
  
  let targetFolder = folderName || "Mütəferrik";
  let targetStudentId = studentId || null;
  let targetStudentName = null;
  let isMatched = false;

  if (targetStudentId) {
    const student = db.students.find(s => s.id === targetStudentId);
    if (student) {
      targetStudentName = `${student.name} ${student.surname}`.trim();
      isMatched = true;
      if (!folderName) {
        targetFolder = targetStudentName;
      }
    }
  } else if (folderName) {
    // Check if any other file in this folder is already matched to a student
    const existingMatch = db.documents.find(d => d.folderName === folderName && d.isMatched);
    if (existingMatch) {
      targetStudentId = existingMatch.studentId;
      targetStudentName = existingMatch.studentName;
      isMatched = true;
    } else {
      // Try to fuzzy match student based on folderName
      const normalize = (str) => {
        return str.toLowerCase()
          .replace(/ı/g, 'i')
          .replace(/ə/g, 'e')
          .replace(/ö/g, 'o')
          .replace(/ü/g, 'u')
          .replace(/ğ/g, 'g')
          .replace(/ç/g, 'c')
          .replace(/ş/g, 's')
          .replace(/[^a-z0-9]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      };
      const folderNameNorm = normalize(folderName);
      const matchedStudent = db.students.find(s => {
        const nameNorm = normalize(s.name);
        const surnameNorm = normalize(s.surname);
        const fullNameNorm1 = normalize(`${s.name} ${s.surname}`);
        const fullNameNorm2 = normalize(`${s.surname} ${s.name}`);
        return fullNameNorm1 === folderNameNorm || fullNameNorm2 === folderNameNorm ||
               (folderNameNorm.includes(nameNorm) && folderNameNorm.includes(surnameNorm));
      });
      if (matchedStudent) {
        targetStudentId = matchedStudent.id;
        targetStudentName = `${matchedStudent.name} ${matchedStudent.surname}`.trim();
        isMatched = true;
      }
    }
  }

  if (!db.documents) db.documents = [];

  const decodedFilename = decodeUtf8(req.file.originalname);
  const docItem = {
    id: `doc-${Date.now()}`,
    studentId: targetStudentId,
    studentName: targetStudentName,
    filename: req.file.filename,
    customName: customName ? customName : decodedFilename,
    filePath: `/uploads/documents/${req.file.filename}`,
    uploadedBy: operator || "Sistem",
    uploadDate: new Date().toLocaleDateString('tr-TR'),
    folderName: targetFolder,
    isMatched: isMatched
  };

  db.documents.push(docItem);
  addActivityLog(operator || "Sistem", `${targetFolder} qovluğu üçün sənəd yükləndi: ${docItem.customName}`);
  saveDB(db);
  res.json({ success: true, document: docItem });
});

app.put('/api/documents/:id/rename', (req, res) => {
  if (!db.documents) db.documents = [];
  const doc = db.documents.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: "Sənəd tapılmadı" });

  const { customName, operator } = req.body;
  const oldName = doc.customName;
  doc.customName = customName;

  addActivityLog(operator || "Sistem", `Sənəd adı dəyişdirildi: ${oldName} -> ${customName}`);
  saveDB(db);
  res.json({ success: true, document: doc });
});

app.delete('/api/documents/:id', (req, res) => {
  if (!db.documents) db.documents = [];
  const idx = db.documents.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Sənəd tapılmadı" });

  const doc = db.documents[idx];
  const filePath = path.join(UPLOADS_DIR, 'documents', doc.filename);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Failed to delete file from disk:", err);
  }

  db.documents.splice(idx, 1);
  addActivityLog(req.body.operator || "Sistem", `Sənəd silindi: ${doc.customName}`);
  saveDB(db);
  res.json({ success: true, message: "Sənəd silindi." });
});

// Batch Folder Upload with auto student folder mapping
app.post('/api/documents/upload-folder', docUpload.array('files', 5000), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "Yükləmək üçün heç bir fayl seçilməyib." });
    }

    const relativePaths = JSON.parse(req.body.relativePaths || '[]');
    const operator = req.body.operator || "Sistem";

    if (!db.documents) db.documents = [];

    let matchedCount = 0;
    let unmatchedCount = 0;
    const matchedFolders = new Set();
    const unmatchedFolders = new Set();

    // Determine if there is a single root folder shared by all paths
    let hasSingleRoot = false;
    if (relativePaths.length > 0) {
      const firstPath = relativePaths[0].replace(/\\/g, '/');
      const firstRoot = firstPath.split('/')[0];
      
      hasSingleRoot = relativePaths.every(p => {
        const norm = p.replace(/\\/g, '/');
        const parts = norm.split('/');
        return parts.length >= 2 && parts[0] === firstRoot;
      });
    }

    req.files.forEach((file, index) => {
      const rawRelPath = relativePaths[index] || "";
      const relPath = rawRelPath.replace(/\\/g, '/');
      const parts = relPath.split('/');
      
      let studentFolderName = "Naməlum";
      if (hasSingleRoot) {
        studentFolderName = parts[1] || "Naməlum";
      } else {
        studentFolderName = parts[0] || "Naməlum";
      }

      studentFolderName = studentFolderName.trim();

      // Normalize letters for case-insensitive phonetic match in Azerbaijani/Turkish names
      const normalize = (str) => {
        return str.toLowerCase()
          .replace(/ı/g, 'i')
          .replace(/ə/g, 'e')
          .replace(/ö/g, 'o')
          .replace(/ü/g, 'u')
          .replace(/ğ/g, 'g')
          .replace(/ç/g, 'c')
          .replace(/ş/g, 's')
          .replace(/[^a-z0-9]/g, ' ') // Remove special chars/punctuation
          .replace(/\s+/g, ' ')
          .trim();
      };

      const folderNameNorm = normalize(studentFolderName);

      // Find matching student using intelligent fuzzy/phonetic match
      const matchedStudent = db.students.find(s => {
        const nameNorm = normalize(s.name);
        const surnameNorm = normalize(s.surname);
        const fullNameNorm1 = normalize(`${s.name} ${s.surname}`); // "meherrem eliyev"
        const fullNameNorm2 = normalize(`${s.surname} ${s.name}`); // "eliyev meherrem"
        
        // 1. Exact match (either order)
        if (fullNameNorm1 === folderNameNorm || fullNameNorm2 === folderNameNorm) {
          return true;
        }

        // 2. Folder name contains both name and surname in any form
        if (folderNameNorm.includes(nameNorm) && folderNameNorm.includes(surnameNorm)) {
          return true;
        }

        // 3. Folder name is a substring of student full name (e.g. folder "Meherrem" matches "Meherrem Aliyev")
        if (fullNameNorm1.includes(folderNameNorm) && folderNameNorm.length >= 4) {
          return true;
        }

        return false;
      });

      const decodedFilename = decodeUtf8(file.originalname);
      const docItem = {
        id: `doc-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
        filename: file.filename,
        customName: decodedFilename,
        filePath: `/uploads/documents/${file.filename}`,
        uploadedBy: operator,
        uploadDate: new Date().toLocaleDateString('tr-TR'),
        folderName: studentFolderName
      };

      if (matchedStudent) {
        docItem.studentId = matchedStudent.id;
        docItem.studentName = `${matchedStudent.name} ${matchedStudent.surname}`.trim();
        docItem.isMatched = true;
        matchedCount++;
        matchedFolders.add(docItem.studentName);
      } else {
        docItem.studentId = null;
        docItem.studentName = studentFolderName; // Keep track of folder name for manually mapping
        docItem.isMatched = false;
        unmatchedCount++;
        unmatchedFolders.add(studentFolderName);
      }

      db.documents.push(docItem);
    });

    addActivityLog(operator, `Toplu Qovluq Yükləndi: ${matchedFolders.size} qovluq tələbə ilə eşləşdi, ${unmatchedFolders.size} qovluq eşləşmədi.`);
    saveDB(db);

    res.json({
      success: true,
      matchedCount,
      unmatchedCount,
      matchedFoldersCount: matchedFolders.size,
      unmatchedFoldersCount: unmatchedFolders.size,
      documents: db.documents
    });
  } catch (err) {
    console.error("Folder upload error:", err);
    res.status(500).json({ success: false, message: "Qovluq toplu yüklənərkən xəta baş verdi: " + err.message });
  }
});

// Link unmatched document to student
app.post('/api/documents/:id/link-student', (req, res) => {
  if (!db.documents) db.documents = [];
  const doc = db.documents.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: "Sənəd tapılmadı" });

  const { studentId, operator } = req.body;
  const student = db.students.find(s => s.id === studentId);
  if (!student) return res.status(404).json({ success: false, message: "Tələbə tapılmadı" });

  doc.studentId = student.id;
  doc.studentName = `${student.name} ${student.surname}`.trim();
  doc.isMatched = true;

  addActivityLog(operator || "Sistem", `Sənəd (${doc.customName}) ${doc.studentName} ilə eşləşdirildi.`);
  saveDB(db);
  res.json({ success: true, document: doc });
});

// Link folder name to a student (or unlink if studentId is empty)
app.post('/api/documents/link-folder', (req, res) => {
  if (!db.documents) db.documents = [];
  const { folderName, studentId, operator } = req.body;

  let count = 0;
  if (studentId) {
    const student = db.students.find(s => s.id === studentId);
    if (!student) return res.status(404).json({ success: false, message: "Tələbə tapılmadı" });

    db.documents.forEach(doc => {
      if (doc.folderName === folderName) {
        doc.studentId = student.id;
        doc.studentName = `${student.name} ${student.surname}`.trim();
        doc.isMatched = true;
        count++;
      }
    });
    addActivityLog(operator || "Sistem", `Qovluq (${folderName}) ${student.name} ${student.surname} ilə əlaqələndirildi.`);
  } else {
    // Unlink action
    db.documents.forEach(doc => {
      if (doc.folderName === folderName) {
        doc.studentId = null;
        doc.studentName = null;
        doc.isMatched = false;
        count++;
      }
    });
    addActivityLog(operator || "Sistem", `Qovluq (${folderName}) şagird əlaqəsi ləğv edildi.`);
  }

  saveDB(db);
  res.json({ success: true, count });
});

// Delete folder and its files
app.post('/api/documents/delete-folder', (req, res) => {
  if (!db.documents) db.documents = [];
  const { folderName, operator } = req.body;

  const docsToDelete = db.documents.filter(doc => doc.folderName === folderName);

  docsToDelete.forEach(doc => {
    const filePath = path.join(UPLOADS_DIR, 'documents', doc.filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error("Failed to delete file from disk:", err);
    }
  });

  db.documents = db.documents.filter(doc => doc.folderName !== folderName);

  addActivityLog(operator || "Sistem", `Qovluq (${folderName}) və daxilindəki ${docsToDelete.length} sənəd silindi.`);
  saveDB(db);
  res.json({ success: true, count: docsToDelete.length });
});

// Extension Activity Log Endpoint
app.post('/api/activity', (req, res) => {
  const { operator, message } = req.body;
  addActivityLog(operator || "Extension", message || "Müraciət əməliyyatı");
  saveDB(db);
  res.json({ success: true });
});

// -------------------------------------------------------------
// CHAT MESSAGING API
// -------------------------------------------------------------
app.get('/api/chats', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ success: false, message: "İstifadəçi adı daxil edilməyib." });
  
  if (!db.chats) db.chats = [];
  const userChats = db.chats.filter(c => c.participants.includes(username));
  res.json({ success: true, chats: userChats });
});

app.get('/api/chats/all', (req, res) => {
  const { code } = req.query;
  if (code !== '2580') {
    return res.status(403).json({ success: false, message: "İcazə verilmədi. Yanlış Access Code." });
  }
  res.json({ success: true, chats: db.chats || [] });
});


const userSockets = {};

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`✅ Yeni istifadəçi qoşuldu: ${socket.id}`);
  
  // Send current online count to all clients
  io.emit('onlineCount', io.engine.clientsCount);

  // Register user mapping
  socket.on('registerUser', (username) => {
    if (!username) return;
    socket.username = username;
    if (!userSockets[username]) {
      userSockets[username] = [];
    }
    if (!userSockets[username].includes(socket.id)) {
      userSockets[username].push(socket.id);
    }
    console.log(`Registered: ${username} on socket ${socket.id}`);
    io.emit('onlineUsers', Object.keys(userSockets).filter(k => userSockets[k].length > 0));
  });

  // Handle incoming chat message
  socket.on('sendChatMessage', ({ sender, receiver, text }) => {
    if (!sender || !receiver || !text) return;

    if (!db.chats) db.chats = [];

    const participants = [sender, receiver].sort();
    const convId = participants.join('-');

    let conv = db.chats.find(c => c.id === convId);
    if (!conv) {
      conv = {
        id: convId,
        participants: participants,
        messages: []
      };
      db.chats.push(conv);
    }

    const newMsg = {
      sender,
      receiver,
      text,
      timestamp: new Date().toISOString()
    };

    conv.messages.push(newMsg);
    saveDB(db);

    // Send back the message to sender and receiver
    const recipientSockets = userSockets[receiver] || [];
    const senderSockets = userSockets[sender] || [];
    const qesemSockets = userSockets['qesem'] || []; // always send to Qeşem if active
    
    // Broadcast to all sockets of sender, receiver, and optionally qesem
    const targets = new Set([...recipientSockets, ...senderSockets, ...qesemSockets]);
    targets.forEach(socketId => {
      io.to(socketId).emit('chatMessage', { convId, message: newMsg });
    });
  });

  socket.on('disconnect', () => {
    console.log(`❌ İstifadəçi ayrıldı: ${socket.id}`);
    
    if (socket.username && userSockets[socket.username]) {
      userSockets[socket.username] = userSockets[socket.username].filter(id => id !== socket.id);
      if (userSockets[socket.username].length === 0) {
        delete userSockets[socket.username];
      }
    }
    
    io.emit('onlineCount', io.engine.clientsCount);
    io.emit('onlineUsers', Object.keys(userSockets).filter(k => userSockets[k].length > 0));
  });
});

// -------------------------------------------------------------
// 📨 CENTRAL EMAIL CLIENT API
// -------------------------------------------------------------
async function fetchEmails(emailAddress, appPassword, folderName = 'INBOX', page = 1, limit = 15) {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: emailAddress,
      pass: appPassword
    },
    logger: false
  });

  client.on('error', err => {
    console.error('[IMAP Fetch Client Error]:', err.message);
  });

  await client.connect();
  let lock = await client.getMailboxLock(folderName);
  let messages = [];
  let totalCount = 0;
  try {
    totalCount = client.mailbox.exists;
    if (totalCount > 0) {
      const pageInt = parseInt(page) || 1;
      const limitInt = parseInt(limit) || 15;
      
      const end = totalCount - (pageInt - 1) * limitInt;
      const start = Math.max(1, end - limitInt + 1);

      if (end >= 1 && start <= end) {
        const range = `${start}:${end}`;

        for await (let msg of client.fetch(range, { envelope: true, source: true, flags: true })) {
          let parsed;
          try {
            parsed = await simpleParser(msg.source);
          } catch (parseErr) {
            console.error("Error parsing email source:", parseErr);
            parsed = {
              subject: msg.envelope.subject || '(Mövzu Yoxdur)',
              from: msg.envelope.from ? msg.envelope.from[0].name || msg.envelope.from[0].address : '-',
              to: msg.envelope.to ? msg.envelope.to[0].address : '-',
              date: msg.envelope.date || new Date(),
              text: 'Məktubun oxunması zamanı xəta yarandı.',
              html: 'Məktubun oxunması zamanı xəta yarandı.'
            };
          }
          
          messages.unshift({
            id: msg.uid.toString(),
            uid: msg.uid,
            messageId: parsed.messageId || msg.envelope.messageId,
            subject: parsed.subject || msg.envelope.subject || '(Mövzu Yoxdur)',
            from: parsed.from ? parsed.from.text : (msg.envelope.from ? msg.envelope.from[0].address : '-'),
            to: parsed.to ? parsed.to.text : (msg.envelope.to ? msg.envelope.to[0].address : '-'),
            date: parsed.date || msg.envelope.date || new Date(),
            text: parsed.text || '',
            html: parsed.html || parsed.textAsHtml || parsed.text || '',
            unread: !msg.flags.has('\\Seen')
          });
        }
      }
    }
  } finally {
    lock.release();
  }
  await client.logout();
  return { emails: messages, totalCount };
}

app.get('/api/emails/:studentId', async (req, res) => {
  const student = db.students.find(s => s.id === req.params.studentId);
  if (!student) return res.status(404).json({ success: false, message: "Tələbə tapılmadı" });

  if (!student.email || !student.emailPassword) {
    return res.status(400).json({
      success: false,
      message: "Bu şagird üçün email və ya Gmail Uygulama Şifrəsi (App Password) daxil edilməyib!"
    });
  }

  const { folder, page, limit } = req.query;

  try {
    const result = await fetchEmails(student.email, student.emailPassword, folder || 'INBOX', page || 1, limit || 15);
    res.json({ 
      success: true, 
      emails: result.emails, 
      totalCount: result.totalCount,
      currentPage: parseInt(page) || 1,
      totalPages: Math.ceil(result.totalCount / (parseInt(limit) || 15))
    });
  } catch (err) {
    console.error("IMAP Fetch Error:", err);
    let errMsg = "Gmail bağlantısı qurularkən xəta baş verdi: " + err.message;
    if (err.message.includes('AUTHENTICATIONFAILED')) {
      errMsg = "Gmail hesabı ilə bağlantı qurulmadı. Zəhmət olmasa email ünvanını və 16 rəqəmli Uygulama Şifrəsini (App Password) düzgün daxil etdiyinizdən və Gmail sazlamalarında IMAP-ın aktiv olmasından əmin olun.";
    }
    res.status(500).json({ success: false, message: errMsg });
  }
});

app.post('/api/emails/:studentId/reply', async (req, res) => {
  const student = db.students.find(s => s.id === req.params.studentId);
  if (!student) return res.status(404).json({ success: false, message: "Tələbə tapılmadı" });

  if (!student.email || !student.emailPassword) {
    return res.status(400).json({
      success: false,
      message: "Bu şagird üçün email və ya Gmail Uygulama Şifrəsi (App Password) daxil edilməyib!"
    });
  }

  const { to, subject, body, messageId } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ success: false, message: "Kimə, Mövzu və Mətn sahələri doldurulmalıdır!" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: student.email,
        pass: student.emailPassword
      }
    });

    const mailOptions = {
      from: student.email,
      to,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      text: body,
      headers: {}
    };

    if (messageId) {
      mailOptions.headers['In-Reply-To'] = messageId;
      mailOptions.headers['References'] = messageId;
    }

    await transporter.sendMail(mailOptions);
    addActivityLog(req.body.operator || "Sistem", `${student.name} ${student.surname} poçtundan e-poçt cavabı göndərildi: ${to}`);
    res.json({ success: true, message: "E-poçt cavabı uğurla göndərildi!" });
  } catch (err) {
    console.error("SMTP Send Error:", err);
    res.status(500).json({ success: false, message: "E-poçt göndərilərkən xəta baş verdi: " + err.message });
  }
});

// -------------------------------------------------------------
// 🔄 ROUND-ROBIN BACKGROUND EMAIL POLLER
// -------------------------------------------------------------
const emailCheckersState = {};
let currentCheckIndex = 0;

async function backgroundEmailPoller() {
  const studentsToPoll = db.students.filter(s => s.email && s.emailPassword);
  if (studentsToPoll.length === 0) return;

  if (currentCheckIndex >= studentsToPoll.length) {
    currentCheckIndex = 0;
  }

  const std = studentsToPoll[currentCheckIndex];
  currentCheckIndex++;

  try {
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: std.email,
        pass: std.emailPassword
      },
      logger: false
    });

    client.on('error', err => {
      console.warn('[IMAP Poll Client Error]:', err.message);
    });

    await client.connect();
    let lock = await client.getMailboxLock('INBOX');
    try {
      const count = client.mailbox.exists;
      if (count > 0) {
        const lastMsgGenerator = client.fetch(count.toString(), { envelope: true });
        for await (let msg of lastMsgGenerator) {
          const stateKey = std.id;
          const currentLastUid = msg.uid;

          if (!emailCheckersState[stateKey]) {
            // Initial load of this inbox state
            emailCheckersState[stateKey] = { lastUid: currentLastUid };
          } else if (currentLastUid > emailCheckersState[stateKey].lastUid) {
            // New message arrived!
            emailCheckersState[stateKey].lastUid = currentLastUid;

            const fromDisplay = msg.envelope.from ? msg.envelope.from[0].name || msg.envelope.from[0].address : 'Naməlum';
            const subjectDisplay = msg.envelope.subject || '(Mövzu Yoxdur)';

            // Emit to connected operators
            io.emit('newEmailNotification', {
              studentId: std.id,
              studentName: `${std.name} ${std.surname}`,
              from: fromDisplay,
              subject: subjectDisplay
            });
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    // Avoid spamming logs for normal network/auth timeouts
    console.warn(`[Mail Poller] Background check failed for ${std.email}:`, err.message);
  }
}

// Check one mailbox every 20 seconds
setInterval(backgroundEmailPoller, 20000);

// Launch Express + Socket.IO Server
server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`Muhteşem 3 lü Kursu Server is running on port ${PORT}`);
  console.log(`🌐 Real-time Socket.IO aktiv`);
  console.log(`Open http://localhost:${PORT} in your browser.`);
  console.log(`=================================================`);
});

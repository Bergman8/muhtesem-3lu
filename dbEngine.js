const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure required directories exist
[DATA_DIR, BACKUP_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Comprehensive list of Turkish Universities (Pre-seeded for instant availability)
const INITIAL_UNIVERSITIES = [
  "Boğaziçi Üniversitesi",
  "Orta Doğu Teknik Üniversitesi (ODTÜ)",
  "İstanbul Teknik Üniversitesi (İTÜ)",
  "Hacettepe Üniversitesi",
  "Ankara Üniversitesi",
  "İstanbul Üniversitesi",
  "İstanbul Üniversitesi-Cerrahpaşa",
  "Marmara Üniversitesi",
  "Ege Üniversitesi",
  "Yıldız Teknik Üniversitesi",
  "Dokuz Eylül Üniversitesi",
  "Gazi Üniversitesi",
  "İzmir Yüksek Teknoloji Enstitüsü",
  "İhsan Doğramacı Bilkent Üniversitesi",
  "Koç Üniversitesi",
  "Sabancı Üniversitesi",
  "Bahçeşehir Üniversitesi",
  "Yeditepe Üniversitesi",
  "Anadolu Üniversitesi",
  "Eskişehir Osmangazi Üniversitesi",
  "Selçuk Üniversitesi",
  "Akdeniz Üniversitesi",
  "Bursa Uludağ Üniversitesi",
  "Çukurova Üniversitesi",
  "Karadeniz Teknik Üniversitesi",
  "Ondokuz Mayıs Üniversitesi",
  "Sakarya Üniversitesi",
  "Kocaeli Üniversitesi",
  "Süleyman Demirel Üniversitesi",
  "Pamukkale Üniversitesi",
  "Mersin Üniversitesi",
  "Çanakkale Onsekiz Mart Üniversitesi",
  "Erciyes Üniversitesi",
  "Fırat Üniversitesi",
  "İnönü Üniversitesi",
  "Harran Üniversitesi",
  "Gaziantep Üniversitesi",
  "Atatürk Üniversitesi",
  "Dicle Üniversitesi",
  "Van Yüzüncü Yıl Üniversitesi",
  "Manisa Celal Bayar Üniversitesi",
  "Muğla Sıtkı Koçman Üniversitesi",
  "Balıkesir Üniversitesi",
  "Aydın Adnan Menderes Üniversitesi",
  "Afyon Kocatepe Üniversitesi",
  "Kütahya Dumlupınar Üniversitesi",
  "Bolu Abant İzzet Baysal Üniversitesi",
  "Zonguldak Bülent Ecevit Üniversitesi",
  "Karabük Üniversitesi",
  "Kırıkkale Üniversitesi",
  "Niğde Ömer Halisdemir Üniversitesi",
  "Aksaray Üniversitesi",
  "Giresun Üniversitesi",
  "Rize Recep Tayyip Erdoğan Üniversitesi",
  "Trabzon Üniversitesi",
  "Artvin Çoruh Üniversitesi",
  "Kars Kafkas Üniversitesi",
  "Erzincan Binali Yıldırım Üniversitesi",
  "Sivas Cumhuriyet Üniversitesi",
  "Malatya Turgut Özal Üniversitesi",
  "Kilis 7 Aralık Üniversitesi",
  "Adıyaman Üniversitesi",
  "Kahramanmaraş Sütçü İmam Üniversitesi",
  "Hatay Mustafa Kemal Üniversitesi",
  "Osmaniye Korkut Ata Üniversitesi",
  "İskenderun Teknik Üniversitesi",
  "Bandırma Onyedi Eylül Üniversitesi",
  "Alanya Alaaddin Keykubat Üniversitesi",
  "Tekirdağ Namık Kemal Üniversitesi",
  "Kırklareli Üniversitesi",
  "Trakya Üniversitesi",
  "Kırşehir Ahi Evran Üniversitesi",
  "Nevşehir Hacı Bektaş Veli Üniversitesi",
  "Yozgat Bozok Üniversitesi",
  "Tokat Gaziosmanpaşa Üniversitesi",
  "Amasya Üniversitesi",
  "Kastamonu Üniversitesi",
  "Sinop Üniversitesi",
  "Bartın Üniversitesi",
  "Düzce Üniversitesi",
  "Hitit Üniversitesi",
  "Bilecik Şeyh Edebali Üniversitesi",
  "Uşak Üniversitesi",
  "Burdur Mehmet Akif Ersoy Üniversitesi",
  "Yalova Üniversitesi",
  "Karamanoglu Mehmetbey Üniversitesi",
  "Bayburt Üniversitesi",
  "Gümüşhane Üniversitesi",
  "Iğdır Üniversitesi",
  "Ağrı İbrahim Çeçen Üniversitesi",
  "Muş Alparslan Üniversitesi",
  "Bingöl Üniversitesi",
  "Siirt Üniversitesi",
  "Batman Üniversitesi",
  "Şırnak Üniversitesi",
  "Hakkari Üniversitesi",
  "Mardin Artuklu Üniversitesi",
  "Özyeğin Üniversitesi",
  "TOBB Ekonomi ve Teknoloji Üniversitesi",
  "Atılım Üniversitesi",
  "Başkent Üniversitesi",
  "Çankaya Üniversitesi",
  "Kadir Has Üniversitesi",
  "Işık Üniversitesi",
  "İstanbul Bilgi Üniversitesi",
  "İstanbul Aydın Üniversitesi",
  "İstanbul Medipol Üniversitesi",
  "İstanbul Gelişim Üniversitesi",
  "İstanbul Kültür Üniversitesi",
  "İstanbul Ticaret Üniversitesi",
  "İstinye Üniversitesi",
  "Özay GÜNSEL Kıbrıs Üniversitesi",
  "Doğu Akdeniz Üniversitesi",
  "Yakın Doğu Üniversitesi",
  "Girne Amerikan Üniversitesi"
].map((name, index) => ({
  id: `uni-${index + 1}`,
  name: name,
  code: `YOK-${1000 + index}`,
  currentRound: "1. Tur",
  startDate: "01.08.2026",
  endDate: "31.08.2026",
  rounds: [
    { roundName: "1. Tur", startDate: "01.08.2026", endDate: "31.08.2026", status: "active" }
  ]
}));

const DEFAULT_USERS = [
  { id: "u-afet", username: "afet", password: "afet2026", name: "Afət xanım", role: "rahbar", active: true },
  { id: "u-revan", username: "revan", password: "revan2026", name: "Rəvan", role: "operator", active: true },
  { id: "u-kerim", username: "kerim", password: "kerim2026", name: "Kərim", role: "operator", active: true },
  { id: "u-qesem", username: "qesem", password: "qesem2026", name: "Qəşəm", role: "admin", active: true },
  { id: "u-jale", username: "jale", password: "jale2026", name: "Jalə", role: "sales", active: true }
];

function createDefaultData() {
  return {
    users: DEFAULT_USERS,
    universities: INITIAL_UNIVERSITIES,
    students: [],
    applications: [],
    verifications: [],
    books: [],
    sales: [],
    activityLogs: [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        user: "Sistem",
        action: "Sistem uğurla başladıldı və Verilənlər Bazası hazırlandı.",
        details: "İlkin istifadəçilər və YÖK universitetləri yükləndi."
      }
    ],
    lastAutoRepair: null
  };
}

function validateDB(data) {
  if (!data || typeof data !== 'object') return false;
  const requiredKeys = ['users', 'universities', 'students', 'applications', 'verifications', 'books', 'sales', 'activityLogs'];
  for (const key of requiredKeys) {
    if (!Array.isArray(data[key])) return false;
  }
  return true;
}

function initDB() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (validateDB(parsed)) {
        console.log("Database file successfully validated.");
        return parsed;
      } else {
        console.warn("Database structure invalid. Initiating auto-repair...");
      }
    } catch (err) {
      console.error("Error reading database file. Attempting backup restore...", err.message);
    }
  }

  // Auto-Repair / Restore from Backups
  const backupFiles = fs.existsSync(BACKUP_DIR) 
    ? fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup-') && f.endsWith('.json')).sort().reverse()
    : [];

  for (const file of backupFiles) {
    try {
      const backupPath = path.join(BACKUP_DIR, file);
      const raw = fs.readFileSync(backupPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (validateDB(parsed)) {
        console.log(`Auto-repair: Restored database from snapshot ${file}`);
        parsed.lastAutoRepair = new Date().toISOString();
        parsed.activityLogs.unshift({
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          user: "Auto-Repair System",
          action: `Zədələnmiş verilənlər bazası ${file} nüsxəsindən bərpa edildi.`,
          details: "Avtomatik bərpa mexanizmi işə düşdü."
        });
        saveDB(parsed);
        return parsed;
      }
    } catch (e) {
      console.warn(`Backup file ${file} was unreadable, trying next...`);
    }
  }

  console.log("No valid backups found. Initializing clean default database...");
  const defaultData = createDefaultData();
  saveDB(defaultData);
  return defaultData;
}

function saveDB(data) {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    // Write primary db
    fs.writeFileSync(DB_FILE, jsonStr, 'utf8');

    // Create snapshot backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, jsonStr, 'utf8');

    // Keep max 20 latest backups
    const backupFiles = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort();

    if (backupFiles.length > 20) {
      const toDelete = backupFiles.slice(0, backupFiles.length - 20);
      toDelete.forEach(f => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (e) {}
      });
    }
  } catch (err) {
    console.error("Critical error saving database:", err);
  }
}

module.exports = {
  initDB,
  saveDB,
  DATA_DIR,
  UPLOADS_DIR
};

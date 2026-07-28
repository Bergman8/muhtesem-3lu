// Global Application State
let currentUser = null;
let allStudents = [];
let allUniversities = [];
let allApplications = [];
let allVerifications = [];
let allActivityLogs = [];
let allBooks = [];
let allSales = [];
let selectedUniId = null;
let selectedBookId = null;
let selectedFileStudentId = null;
let knownVerificationIds = new Set();
let isInitialLoad = true;
let allDocuments = [];

// Initialize App on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('muhtesem_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      initAppSession();
    } catch (e) {
      localStorage.removeItem('muhtesem_user');
    }
  }

  // Folder Upload Input Change Listener
  const folderInput = document.getElementById('folder-upload-file-input');
  if (folderInput) {
    folderInput.addEventListener('change', function() {
      const files = this.files;
      const box = document.getElementById('selected-folder-info-box');
      if (files.length > 0) {
        const firstPath = files[0].webkitRelativePath || files[0].name;
        const normalizedPath = firstPath.replace(/\\/g, '/');
        const rootFolder = normalizedPath.split('/')[0] || "Seçilmiş Qovluq";
        box.style.display = 'flex';
        box.innerHTML = `
          <i class="fa-solid fa-folder" style="color:#fbbf24; font-size: 20px;"></i>
          <div>Seçilən Qovluq: <strong>${rootFolder}</strong><br><span style="font-size:11px; color:var(--text-dim);">${files.length} ədəd sənəd tapıldı</span></div>
        `;
      } else {
        box.style.display = 'none';
      }
    });
  }
});

// Quick Login Preset Handler
function selectQuickLogin(username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
  document.getElementById('login-form').dispatchEvent(new Event('submit'));
}

// Handle Login Submission
async function handleLogin(e) {
  if (e) e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errorEl = document.getElementById('login-error');
  errorEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('muhtesem_user', JSON.stringify(currentUser));
      initAppSession();
    } else {
      errorEl.textContent = data.message;
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = "Serverlə əlaqə qurula bilmədi.";
    errorEl.style.display = 'block';
  }
}

function toggleSidebar(hide) {
  if (hide) {
    document.body.classList.add('sidebar-hidden');
    localStorage.setItem('sidebar_hidden', 'true');
  } else {
    document.body.classList.remove('sidebar-hidden');
    localStorage.setItem('sidebar_hidden', 'false');
  }
}

// Initialize Application Session and Permissions
function initAppSession() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app-wrapper').style.display = 'flex';

  // Restore Sidebar Hidden State
  if (localStorage.getItem('sidebar_hidden') === 'true') {
    document.body.classList.add('sidebar-hidden');
  } else {
    document.body.classList.remove('sidebar-hidden');
  }

  // Set Profile Display
  document.getElementById('user-display-name').textContent = currentUser.name;
  document.getElementById('user-avatar-initial').textContent = currentUser.name.charAt(0).toUpperCase();

  let roleLabel = "Operator";
  if (currentUser.role === 'rahbar') roleLabel = "Rəhbər";
  else if (currentUser.role === 'admin') roleLabel = "Yönetici (Qəşəm)";
  else if (currentUser.role === 'sales') roleLabel = "Kitab Satışları (Jalə)";
  document.getElementById('user-display-role').textContent = roleLabel;

  // Role-based Element Visibility
  const isAdmin = currentUser.role === 'admin';
  const isSales = currentUser.role === 'sales' || isAdmin;
  const isRahbar = currentUser.role === 'rahbar' || isAdmin;

  // Manage Navigation Items
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });

  const salesBtn = document.getElementById('nav-sales-btn');
  if (salesBtn) salesBtn.style.display = isSales ? 'flex' : 'none';

  const activityLogSection = document.getElementById('activity-log-section');
  if (activityLogSection) {
    // Hidden from Rəvan & Kərim (Operators)
    if (currentUser.role === 'operator') {
      activityLogSection.style.display = 'none';
    } else {
      activityLogSection.style.display = 'block';
      const notice = document.getElementById('log-role-notice');
      if (notice) {
        notice.textContent = isAdmin ? "Baxış və Redaktə Yetkisi: Yönetici" : "Baxış Yetkisi: Rəhbər (Düzəliş olunmur)";
      }
    }
  }

  // Set Default View
  if (currentUser.role === 'sales') {
    switchView('sales-view');
  } else {
    switchView('home-view');
  }

  // Initial Data Fetch
  loadAllData();

  // Start Background Sync & Real-time Notifications Polling
  startRealtimePolling();

  // Start Socket.IO Real-time Connection
  initSocketIO();
}

// Handle Logout
function handleLogout() {
  localStorage.removeItem('muhtesem_user');
  currentUser = null;
  document.getElementById('app-wrapper').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
}

// View Switcher
function switchView(viewId) {
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

  const targetPanel = document.getElementById(viewId);
  if (targetPanel) targetPanel.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (navItem) navItem.classList.add('active');

  // Update Page Title
  const titles = {
    'home-view': 'Ana Sayfa',
    'students-view': 'Öğrenci Bilgileri',
    'student-detail-panel-view': 'Tələbə Redaktə və Detal Paneli',
    'universities-view': 'Üniversitetlər Paneli',
    'verification-view': '3 Aşamalı Yoxlanış Paneli',
    'files-view': 'Şagird Sənədləri (Dosyalar)',
    'sales-view': 'Kitab Satışları Paneli',
    'accounts-view': 'Sistem Hesabları (Hesablar)'
  };
  document.getElementById('current-view-title').textContent = titles[viewId] || 'Portal';

  // Scroll window to top on every navigation/view switch
  window.scrollTo(0, 0);

  // Refresh view specific data
  if (viewId === 'home-view') renderHomeView();
  else if (viewId === 'students-view') renderStudentsView();
  else if (viewId === 'universities-view') renderUniversitiesView();
  else if (viewId === 'verification-view') renderVerificationView();
  else if (viewId === 'files-view') renderFilesView();
  else if (viewId === 'sales-view') renderSalesView();
  else if (viewId === 'accounts-view') renderAccountsView();
}

// -------------------------------------------------------------
// DATA LOADERS
// -------------------------------------------------------------
async function loadAllData() {
  showAutoSaveIndicator();
  await Promise.all([
    fetchStudents(),
    fetchUniversities(),
    fetchApplications(),
    fetchActivityLogs(),
    fetchBooks(),
    fetchDocuments()
  ]);

  if (isInitialLoad) {
    allVerifications.forEach(v => {
      knownVerificationIds.add(v.id);
    });
    isInitialLoad = false;
  }

  updatePendingBadge();
  const currentView = document.querySelector('.view-panel.active').id;
  switchView(currentView);
}

function showAutoSaveIndicator() {
  const pill = document.getElementById('autosave-pill');
  if (pill) {
    pill.style.opacity = '1';
    setTimeout(() => { pill.style.opacity = '0.8'; }, 2000);
  }
}

async function fetchStudents() {
  try {
    const res = await fetch('/api/students');
    const data = await res.json();
    if (data.success) allStudents = data.students;
  } catch (e) {}
}

async function fetchUniversities() {
  try {
    const res = await fetch('/api/universities');
    const data = await res.json();
    if (data.success) allUniversities = data.universities;
  } catch (e) {}
}

async function fetchApplications() {
  try {
    const res = await fetch('/api/applications');
    const data = await res.json();
    if (data.success) {
      allApplications = data.applications;
      allVerifications = data.verifications;
    }
  } catch (e) {}
}

async function fetchActivityLogs() {
  try {
    const res = await fetch('/api/activity-logs');
    const data = await res.json();
    if (data.success) allActivityLogs = data.activityLogs;
  } catch (e) {}
}

async function fetchBooks() {
  try {
    const res = await fetch('/api/books');
    const data = await res.json();
    if (data.success) {
      allBooks = data.books;
      allSales = data.sales;
    }
  } catch (e) {}
}

async function fetchDocuments() {
  try {
    const res = await fetch('/api/documents');
    const data = await res.json();
    if (data.success) allDocuments = data.documents;
  } catch (e) {}
}

function updatePendingBadge() {
  const pendingCount = allVerifications.filter(v => v.status === 'Kontrol Bekleniyor').length;
  const badge = document.getElementById('nav-pending-badge');
  if (badge) {
    badge.textContent = pendingCount;
    badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
  }
  document.getElementById('stat-pending-count').textContent = pendingCount;
}

// -------------------------------------------------------------
// 1. ANA SAYFA VIEW RENDERER
// -------------------------------------------------------------
async function renderHomeView() {
  document.getElementById('stat-students-count').textContent = allStudents.length;
  document.getElementById('stat-unis-count').textContent = allUniversities.length;
  document.getElementById('stat-apps-count').textContent = allApplications.length;

  // Aggregate Recent University Applications
  const uniStatsMap = {};
  allApplications.forEach(app => {
    uniStatsMap[app.universityName] = (uniStatsMap[app.universityName] || 0) + 1;
  });

  const recentUnisEl = document.getElementById('home-recent-unis');
  const sortedUnis = Object.keys(uniStatsMap).map(name => ({ name, count: uniStatsMap[name] }))
    .sort((a, b) => b.count - a.count).slice(0, 6);

  if (sortedUnis.length === 0) {
    recentUnisEl.innerHTML = `<div class="empty-state">Hələ heç bir universitetə müraciət edilməyib.</div>`;
  } else {
    recentUnisEl.innerHTML = sortedUnis.map((item, idx) => `
      <div class="uni-item" style="cursor:default; margin-bottom:8px;">
        <span class="uni-name"><strong>${idx + 1}.</strong> ${item.name}</span>
        <span class="uni-count-badge" style="background:var(--primary); color:white;">${item.count} nəfər</span>
      </div>
    `).join('');
  }

  // Recent Students List Box
  const recentStudentsEl = document.getElementById('home-recent-students');
  const lastStudents = allStudents.slice(-6).reverse();

  if (lastStudents.length === 0) {
    recentStudentsEl.innerHTML = `<div class="empty-state">Hələ tələbə məlumatı daxil edilməyib.</div>`;
  } else {
    recentStudentsEl.innerHTML = lastStudents.map((std, idx) => `
      <div class="uni-item" style="cursor:default; margin-bottom:8px;">
        <span class="uni-name"><strong>${idx + 1}.</strong> ${std.name} ${std.surname}</span>
        <span class="uni-count-badge">${std.passportNo}</span>
      </div>
    `).join('');
  }

  // Activity Log Section (Role Filtered)
  if (currentUser.role !== 'operator') {
    const tbody = document.getElementById('activity-logs-tbody');
    if (allActivityLogs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center">Jurnal boşdur</td></tr>`;
    } else {
      tbody.innerHTML = allActivityLogs.map(log => `
        <tr>
          <td>${new Date(log.timestamp).toLocaleString('az-AZ')}</td>
          <td><strong>${log.user}</strong></td>
          <td>${log.action}</td>
          <td>${log.details || '-'}</td>
          <td class="admin-edit-col">
            ${currentUser.role === 'admin' ? `
              <button class="btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="editActivityLog('${log.id}')"><i class="fa-solid fa-pen"></i></button>
              <button class="btn-secondary" style="padding:4px 8px; font-size:11px; color:var(--red);" onclick="deleteActivityLog('${log.id}')"><i class="fa-solid fa-trash"></i></button>
            ` : `<span style="color:var(--text-dim); font-size:11px;">Baxış</span>`}
          </td>
        </tr>
      `).join('');
    }
  }
}

async function editActivityLog(id) {
  const log = allActivityLogs.find(l => l.id === id);
  if (!log) return;
  const newAction = prompt("Fəaliyyət mətnini redaktə edin:", log.action);
  if (newAction !== null) {
    await fetch(`/api/activity-logs/${id}?role=admin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: newAction })
    });
    loadAllData();
  }
}

async function deleteActivityLog(id) {
  if (confirm("Bu log yazısını silməyə əminsiniz?")) {
    await fetch(`/api/activity-logs/${id}?role=admin`, { method: 'DELETE' });
    loadAllData();
  }
}

// -------------------------------------------------------------
// 2. ÖĞRENCİ BİLGİLERİ VIEW RENDERER
// -------------------------------------------------------------
function getUniqueCustomFieldKeys() {
  const keys = new Set();
  allStudents.forEach(s => {
    if (s.customFields && typeof s.customFields === 'object') {
      Object.keys(s.customFields).forEach(k => keys.add(k));
    }
  });
  return Array.from(keys);
}

function renderStudentsView() {
  const tbody = document.getElementById('students-tbody');
  const query = (document.getElementById('student-search-input').value || '').toLowerCase();

  // Update table headers dynamically
  const tableHeadTr = document.querySelector('#students-view .data-table thead tr');
  if (tableHeadTr) {
    tableHeadTr.innerHTML = `
      <th>AD SOYAD</th>
      <th>PASAPORT NO</th>
      <th>EMAİL</th>
      <th style="width: 250px;">ƏMƏLİYYATLAR</th>
    `;
  }

  const filtered = allStudents.filter(s => 
    `${s.name} ${s.surname}`.toLowerCase().includes(query) ||
    s.passportNo.toLowerCase().includes(query) ||
    s.email.toLowerCase().includes(query) ||
    Object.values(s.customFields || {}).some(val => String(val).toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Tələbə tapılmadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(s => `
    <tr style="cursor:pointer" onclick="openStudentDetailView('${s.id}')">
      <td><strong>${s.name} ${s.surname}</strong></td>
      <td><span class="badge-count" style="background:rgba(255,255,255,0.1); color:white;">${s.passportNo}</span></td>
      <td>
        <div style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${s.email || '-'}
        </div>
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn-primary" style="padding:4px 8px; font-size:12px; background:var(--blue);" onclick="event.stopPropagation(); openStudentQuickView('${s.id}')">
            <i class="fa-solid fa-eye"></i> Bax
          </button>
          <button class="btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="event.stopPropagation(); openStudentDetailView('${s.id}')">
            <i class="fa-solid fa-pen"></i> Düzəlt
          </button>
          <button class="btn-secondary" style="padding:4px 8px; font-size:12px; color:var(--red);" onclick="event.stopPropagation(); deleteStudent('${s.id}')">
            <i class="fa-solid fa-trash"></i> Sil
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openStudentQuickView(id) {
  const s = allStudents.find(std => std.id === id);
  if (!s) return;

  const basicList = document.getElementById('quick-view-basic-list');
  const customList = document.getElementById('quick-view-custom-list');

  // Populate basic info
  basicList.innerHTML = `
    <div style="margin-bottom:8px;">
      <div style="font-size:12px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">Ad Soyad</div>
      <div style="font-size:14px; font-weight:700; color:white;">${s.name} ${s.surname}</div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:12px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">Pasport No</div>
      <div style="font-size:14px; font-weight:700; color:var(--yellow);">${s.passportNo}</div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:12px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">Email</div>
      <div style="font-size:14px; font-weight:600; color:white; word-break:break-all;">${s.email || '-'}</div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:12px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">Doğum Tarixi</div>
      <div style="font-size:14px; font-weight:600; color:white;">${s.birthDate || '-'}</div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:12px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">Pasport Verilmə Tarixi</div>
      <div style="font-size:14px; font-weight:600; color:white;">${s.passIssueDate || '-'}</div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:12px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">Pasport Bitmə Tarixi</div>
      <div style="font-size:14px; font-weight:600; color:white;">${s.passExpiryDate || '-'}</div>
    </div>
  `;

  // Populate custom info
  if (s.customFields && Object.keys(s.customFields).length > 0) {
    customList.innerHTML = Object.entries(s.customFields).map(([key, val]) => `
      <div style="margin-bottom:8px;">
        <div style="font-size:12px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">${key}</div>
        <div style="font-size:14px; font-weight:600; color:white; white-space: normal; word-break: break-all;">${val || '-'}</div>
      </div>
    `).join('');
  } else {
    customList.innerHTML = `<div style="font-size:13px; color:var(--text-dim); font-style:italic; margin-top:12px;">Əlavə məlumat daxil edilməyib.</div>`;
  }

  openModal('view-student-quick-modal');
}

function filterStudents() {
  renderStudentsView();
}

// Open Student Details View Panel (Full Page Panel instead of Popup)
function openStudentDetailView(id = null) {
  const titleEl = document.getElementById('student-detail-title');
  const deleteBtn = document.getElementById('btn-delete-student-detail');
  const customContainer = document.getElementById('student-custom-fields-grid');
  
  // Clear dynamic container
  customContainer.innerHTML = "";

  if (!id) {
    // New Student Mode
    titleEl.innerHTML = `<i class="fa-solid fa-user-plus"></i> Yeni Tələbə Əlavə Et`;
    deleteBtn.style.display = "none";
    
    document.getElementById('student-detail-id').value = "";
    document.getElementById('student-detail-name').value = "";
    document.getElementById('student-detail-surname').value = "";
    document.getElementById('student-detail-passport').value = "";
    document.getElementById('student-detail-email').value = "";
    document.getElementById('student-detail-birth').value = "";
    document.getElementById('student-detail-pass-issue').value = "";
    document.getElementById('student-detail-pass-expiry').value = "";
  } else {
    // Edit Student Mode
    const std = allStudents.find(s => s.id === id);
    if (!std) return;

    titleEl.innerHTML = `<i class="fa-solid fa-user-gear"></i> Tələbə Məlumatları və Redaktə`;
    deleteBtn.style.display = "inline-flex";

    document.getElementById('student-detail-id').value = std.id;
    document.getElementById('student-detail-name').value = std.name;
    document.getElementById('student-detail-surname').value = std.surname;
    document.getElementById('student-detail-passport').value = std.passportNo;
    document.getElementById('student-detail-email').value = std.email;
    document.getElementById('student-detail-birth').value = std.birthDate;
    document.getElementById('student-detail-pass-issue').value = std.passIssueDate;
    document.getElementById('student-detail-pass-expiry').value = std.passExpiryDate;

    // Render Custom Fields nicely
    if (std.customFields && typeof std.customFields === 'object') {
      Object.entries(std.customFields).forEach(([key, val]) => {
        addStudentCustomFieldRow(key, val);
      });
    }
  }

  switchView('student-detail-panel-view');
}

// Add Dynamic Custom Field Input Row to student details page
function addStudentCustomFieldRow(keyVal = '', valueVal = '') {
  const container = document.getElementById('student-custom-fields-grid');
  const div = document.createElement('div');
  div.className = 'student-custom-card-row';
  div.style.cssText = 'display:flex; gap:12px; align-items:center; width:100%;';
  div.innerHTML = `
    <div style="flex:1;">
      <input type="text" class="student-custom-key form-control" placeholder="Məlumat Başlığı (Məs: Ata Adı, Telefon)" value="${keyVal}" style="width:100%; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); color: white; padding: 10px 14px; border-radius: var(--radius-sm);">
    </div>
    <div style="flex:2;">
      <input type="text" class="student-custom-value form-control" placeholder="Məlumatın Dəyəri (Məs: VÜQAR, +994...)" value="${valueVal}" style="width:100%; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); color: white; padding: 10px 14px; border-radius: var(--radius-sm);">
    </div>
    <button type="button" class="btn-secondary" style="color:var(--red); padding:10px 14px;" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-trash"></i>
    </button>
  `;
  container.appendChild(div);
}

// Triggers form submission from header button
function submitStudentDetailForm() {
  document.getElementById('student-detail-form').dispatchEvent(new Event('submit', { cancelable: true }));
}

// Handles Student Detail Form Submit (POST/PUT)
async function handleSaveStudentDetailForm(e) {
  e.preventDefault();
  const id = document.getElementById('student-detail-id').value;

  // Gather custom fields
  const customFieldsObj = {};
  document.querySelectorAll('#student-custom-fields-grid .student-custom-card-row').forEach(row => {
    const key = row.querySelector('.student-custom-key').value.trim();
    const val = row.querySelector('.student-custom-value').value.trim();
    if (key) {
      customFieldsObj[key] = val;
    }
  });

  const payload = {
    name: document.getElementById('student-detail-name').value.trim(),
    surname: document.getElementById('student-detail-surname').value.trim(),
    passportNo: document.getElementById('student-detail-passport').value.trim(),
    email: document.getElementById('student-detail-email').value.trim(),
    birthDate: document.getElementById('student-detail-birth').value.trim(),
    passIssueDate: document.getElementById('student-detail-pass-issue').value.trim(),
    passExpiryDate: document.getElementById('student-detail-pass-expiry').value.trim(),
    customFields: customFieldsObj,
    operator: currentUser.name
  };

  const url = id ? `/api/students/${id}` : '/api/students';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      // Reload and return to main list view
      await loadAllData();
      switchView('students-view');
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert("Yadda saxlanma zamanı xəta baş verdi.");
  }
}

// Handle Delete Student directly from the detail panel
async function handleDeleteStudentFromDetail() {
  const id = document.getElementById('student-detail-id').value;
  if (!id) return;
  if (confirm("Bu tələbəni silməyə əminsiniz?")) {
    await fetch(`/api/students/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: currentUser.name })
    });
    await loadAllData();
    switchView('students-view');
  }
}

// Redirects old modal clicks to new detail view page
function openAddStudentModal() {
  openStudentDetailView();
}

async function deleteStudent(id) {
  if (confirm("Bu tələbəni bazadan silməyə əminsiniz?")) {
    await fetch(`/api/students/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: currentUser.name })
    });
    loadAllData();
  }
}

// Excel Import Modal Handlers
function addCustomFieldMappingRow(labelVal = '', colVal = '') {
  const container = document.getElementById('custom-fields-mapping-container');
  const div = document.createElement('div');
  div.className = 'custom-map-item';
  div.style.cssText = 'display:flex; gap:10px; margin-top:8px; align-items:center;';
  div.innerHTML = `
    <input type="text" class="custom-label-input" placeholder="Məlumat Adı (Məs: Ata Adı, Telefon)" value="${labelVal}" style="flex:2;">
    <input type="text" class="custom-col-input" placeholder="Sütun (Məs: G)" value="${colVal}" style="flex:1; text-transform:uppercase;">
    <button type="button" class="btn-secondary" style="color:var(--red); padding:8px 10px;" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(div);
}

function openExcelImportModal() {
  document.getElementById('custom-fields-mapping-container').innerHTML = "";
  openModal('excel-modal');
}

async function handleExcelUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('excel-file-input');
  if (!fileInput.files[0]) return alert("Fayl seçin!");

  const customFieldsSpecs = [];
  document.querySelectorAll('#custom-fields-mapping-container .custom-map-item').forEach(item => {
    const label = item.querySelector('.custom-label-input').value.trim();
    const col = item.querySelector('.custom-col-input').value.trim();
    if (label && col) {
      customFieldsSpecs.push({ label, col });
    }
  });

  const columnMap = {
    nameCol: document.getElementById('map-name').value,
    surnameCol: document.getElementById('map-surname') ? document.getElementById('map-surname').value : '',
    passportCol: document.getElementById('map-passport').value,
    emailCol: document.getElementById('map-email').value,
    birthDateCol: document.getElementById('map-birth').value,
    passIssueCol: document.getElementById('map-issue').value,
    passExpiryCol: document.getElementById('map-expiry').value,
    customFields: customFieldsSpecs
  };

  const formData = new FormData();
  formData.append('excelFile', fileInput.files[0]);
  formData.append('columnMap', JSON.stringify(columnMap));

  const res = await fetch('/api/students/import-excel', {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (data.success) {
    alert(`Uğurlu! ${data.count} tələbə məlumatı bazaya əlavə edildi.`);
    closeModal('excel-modal');
    loadAllData();
  } else {
    alert("Xəta: " + data.message);
  }
}

// Book Sales Excel Import Handlers
function openBookSalesExcelImportModal() {
  if (!selectedBookId) return alert("Hər hansı bir kitab seçilməyib!");
  document.getElementById('book-sales-excel-target-id').value = selectedBookId;
  document.getElementById('book-sales-excel-file-input').value = "";
  openModal('book-sales-excel-modal');
}

async function handleBookSalesExcelUpload(e) {
  e.preventDefault();
  const bookId = document.getElementById('book-sales-excel-target-id').value;
  const fileInput = document.getElementById('book-sales-excel-file-input');

  if (!fileInput.files[0]) return alert("Fayl seçin!");

  const columnMap = {
    nameCol: document.getElementById('map-sale-student').value,
    paymentCol: document.getElementById('map-sale-payment').value,
    priceTypeCol: document.getElementById('map-sale-price-type').value,
    dateCol: document.getElementById('map-sale-date').value,
    deliveredCol: document.getElementById('map-sale-delivered').value
  };

  const formData = new FormData();
  formData.append('excelFile', fileInput.files[0]);
  formData.append('columnMap', JSON.stringify(columnMap));

  try {
    const res = await fetch(`/api/books/${bookId}/import-sales`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      alert(`Uğurlu! Excel-dən bu kitab üçün ${data.count} ədəd satış məlumatı bazaya əlavə edildi.`);
      closeModal('book-sales-excel-modal');
      loadAllData();
    } else {
      alert("Xəta: " + data.message);
    }
  } catch (err) {
    alert("Excel faylı yüklənərkən xəta baş verdi: " + err.message);
  }
}

// -------------------------------------------------------------
// 3. ÜNİVERSİTETLƏR VIEW RENDERER
// -------------------------------------------------------------
function renderUniversitiesView() {
  const menuList = document.getElementById('uni-menu-list');
  const query = (document.getElementById('uni-search-input').value || '').toLowerCase();

  const filtered = allUniversities.filter(u => u.name.toLowerCase().includes(query));

  if (!selectedUniId && filtered.length > 0) {
    selectedUniId = filtered[0].id;
  }

  menuList.innerHTML = filtered.map(u => {
    const appCount = allApplications.filter(a => a.universityId === u.id).length;
    const isActive = u.id === selectedUniId;
    return `
      <div class="uni-item ${isActive ? 'active' : ''}" onclick="selectUniversity('${u.id}')">
        <span class="uni-name">${u.name}</span>
        <span class="uni-count-badge">${appCount}</span>
      </div>
    `;
  }).join('');

  renderUniversityDetailPanel();
}

function filterUniList() {
  renderUniversitiesView();
}

function selectUniversity(id) {
  selectedUniId = id;
  renderUniversitiesView();
}

function renderUniversityDetailPanel() {
  const panel = document.getElementById('uni-detail-panel');
  if (!selectedUniId) {
    panel.innerHTML = `<div class="empty-state-large"><h3>Universitet seçilməyib</h3></div>`;
    return;
  }

  const uni = allUniversities.find(u => u.id === selectedUniId);
  if (!uni) return;

  const uniApps = allApplications.filter(a => a.universityId === uni.id);
  const isRahbarOrAdmin = currentUser.role === 'rahbar' || currentUser.role === 'admin';

  panel.innerHTML = `
    <div class="uni-detail-header flex-between">
      <div>
        <h2><i class="fa-solid fa-building-columns"></i> ${uni.name}</h2>
        <span class="badge-count" style="background:var(--primary); margin-top:6px; display:inline-block;">Kodu: ${uni.code}</span>
      </div>
      <div class="action-buttons">
        <button class="btn-secondary" onclick="openApplyModal('${uni.id}')"><i class="fa-solid fa-plus"></i> Müraciət Əlavə Et</button>
        <button class="btn-secondary" onclick="reverifyAllUniApps('${uni.id}')"><i class="fa-solid fa-rotate-left"></i> Hamsını Yenidən Yoxlanışa Göndər</button>
        ${isRahbarOrAdmin ? `<button class="btn-primary" onclick="openUniEditModal('${uni.id}')"><i class="fa-solid fa-pen"></i> Düzenle</button>` : ''}
      </div>
    </div>

    <!-- Round & Deadline Info -->
    <div class="stats-grid margin-top">
      <div class="stat-card">
        <div class="stat-icon purple"><i class="fa-solid fa-user-group"></i></div>
        <div class="stat-data">
          <span class="stat-value">${uniApps.length}</span>
          <span class="stat-label">Başvuran Tələbə Sayı</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><i class="fa-solid fa-layer-group"></i></div>
        <div class="stat-data">
          <span class="stat-value">${uni.currentRound || '1. Tur'}</span>
          <span class="stat-label">Cari Tur</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange"><i class="fa-solid fa-calendar-days"></i></div>
        <div class="stat-data">
          <span class="stat-value" style="font-size:16px;">${uni.startDate} - ${uni.endDate}</span>
          <span class="stat-label">Başvuru Tarixləri</span>
        </div>
      </div>
    </div>

    ${isRahbarOrAdmin ? `
      <div style="margin: 16px 0; text-align: right;">
        <button class="btn-secondary" onclick="openNewRoundModal('${uni.id}')"><i class="fa-solid fa-calendar-plus"></i> Yeni Tur Aç (2. Tur / 3. Tur)</button>
      </div>
    ` : ''}

    <!-- Applicants Table -->
    <div class="panel-box full-width margin-top">
      <div class="panel-header">
        <h3><i class="fa-solid fa-users"></i> Universitetə Müraciət Edən Şagirdlər</h3>
      </div>
      <div class="panel-content">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>AD - SOYAD</th>
                <th>PASAPORT NO</th>
                <th>BAŞVURU FORMU</th>
                <th>YOXLANIŞ STATUSU</th>
              </tr>
            </thead>
            <tbody>
              ${uniApps.length === 0 ? `<tr><td colspan="4" class="text-center">Hələ başvuru edən olmayıb.</td></tr>` : 
                uniApps.map(app => {
                  let badgeClass = "red";
                  if (app.status === "Kontrol Ediliyor") badgeClass = "yellow";
                  else if (app.status === "Kontrol Edildi") badgeClass = "green";

                  return `
                    <tr style="cursor:pointer" onclick="openApplicantDetailModal('${app.id}')">
                      <td><strong>${app.studentName}</strong></td>
                      <td>${app.passportNo}</td>
                      <td><span class="badge-count" style="background:rgba(99,102,241,0.2); color:#818cf8;">Form #${app.id.substr(-5)}</span></td>
                      <td><span class="badge-status ${badgeClass}">${app.status}</span></td>
                    </tr>
                  `;
                }).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// Open Applicant Detail Pop-up Modal
function openApplicantDetailModal(appId) {
  const appItem = allApplications.find(a => a.id === appId);
  if (!appItem) return;

  const student = allStudents.find(s => s.id === appItem.studentId);
  const verItem = allVerifications.find(v => v.applicationId === appItem.id);

  let checkersHtml = "";
  if (verItem) {
    if (verItem.previousCheckedBy) {
      checkersHtml = `
        <p><strong>1-ci Yoxlayan (Əvvəlki):</strong> <span class="badge-count" style="background:rgba(255,255,255,0.08); color:white; padding: 2px 6px;">${verItem.previousCheckedBy}</span></p>
        <p><strong>2-ci Yoxlayan (Sonrakı):</strong> <span class="badge-count" style="background:rgba(99,102,241,0.2); color:white; padding: 2px 6px;">${verItem.checkedBy || 'Gözləyir...'}</span></p>
      `;
    } else {
      checkersHtml = `<p><strong>Yoxlanış Edən Şəxs:</strong> <span class="badge-count" style="background:rgba(255,255,255,0.08); color:white; padding: 2px 6px;">${verItem.checkedBy || 'Hələ yoxlanılmayıb'}</span></p>`;
    }
  } else {
    checkersHtml = `<p><strong>Yoxlanış Edən Şəxs:</strong> Hələ yoxlanılmayıb</p>`;
  }

  let customFieldsHtml = "";
  if (student && student.customFields && typeof student.customFields === 'object') {
    const entries = Object.entries(student.customFields);
    if (entries.length > 0) {
      customFieldsHtml = `<div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">
        <h4 style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">Əlavə Məlumatlar:</h4>
        ${entries.map(([k, v]) => `<p><strong>${k}:</strong> ${v || '-'}</p>`).join('')}
      </div>`;
    }
  }

  const modalBody = document.getElementById('applicant-detail-body');
  modalBody.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-data">
          <span class="stat-label">Tələbə Adı Soyadı:</span>
          <span class="stat-value" style="font-size:18px; color:var(--primary);">${appItem.studentName}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-data">
          <span class="stat-label">Pasport No:</span>
          <span class="stat-value" style="font-size:18px;">${appItem.passportNo}</span>
        </div>
      </div>
    </div>

    <div class="column-mapping-box margin-top">
      <p><strong>Universitet:</strong> ${appItem.universityName} (${appItem.round})</p>
      <p><strong>Başvuru Edən Şəxs:</strong> ${appItem.createdBy}</p>
      ${checkersHtml}
      <p><strong>Yoxlanış Statusu:</strong> <span class="badge-status ${appItem.status === 'Kontrol Edildi' ? 'green' : (appItem.status === 'Kontrol Ediliyor' ? 'yellow' : 'red')}">${appItem.status}</span></p>
      ${customFieldsHtml}
    </div>

    <div class="modal-footer margin-top" style="background:transparent; padding:0;">
      <button class="btn-secondary" style="color:var(--red);" onclick="deleteApplication('${appItem.id}')"><i class="fa-solid fa-trash"></i> Sil</button>
      <button class="btn-secondary" onclick="closeModal('applicant-detail-modal'); openStudentDetailView('${appItem.studentId}')"><i class="fa-solid fa-pen"></i> Düzenle</button>
      <button class="btn-primary" onclick="reverifySingleApp('${appItem.id}')"><i class="fa-solid fa-rotate-left"></i> Yenidən Yoxlanışa Göndər</button>
    </div>
  `;

  openModal('applicant-detail-modal');
}

async function reverifySingleApp(appId) {
  await fetch(`/api/applications/${appId}/reverify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator: currentUser.name })
  });
  closeModal('applicant-detail-modal');
  loadAllData();
}

async function reverifyAllUniApps(uniId) {
  if (confirm("Bu universitet üzrə BÜTÜN müraciətləri təkrar yoxlanışa göndərməyə əminsiniz?")) {
    await fetch(`/api/universities/${uniId}/reverify-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: currentUser.name })
    });
    loadAllData();
  }
}

async function deleteApplication(appId) {
  if (confirm("Bu müraciəti silməyə əminsiniz?")) {
    await fetch(`/api/applications/${appId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: currentUser.name })
    });
    closeModal('applicant-detail-modal');
    loadAllData();
  }
}

function openApplyModal(uniId) {
  const uni = allUniversities.find(u => u.id === uniId);
  if (!uni) return;

  document.getElementById('apply-target-uni-id').value = uni.id;
  document.getElementById('apply-target-uni-name').value = uni.name;

  const select = document.getElementById('apply-select-student');
  select.innerHTML = allStudents.map(s => `<option value="${s.id}">${s.name} ${s.surname} (${s.passportNo})</option>`).join('');

  openModal('apply-uni-modal');
}

async function handleCreateApplication(e) {
  e.preventDefault();
  const uniId = document.getElementById('apply-target-uni-id').value;
  const studentId = document.getElementById('apply-select-student').value;

  const res = await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      universityId: uniId,
      studentId: studentId,
      createdBy: currentUser.name
    })
  });

  const data = await res.json();
  if (data.success) {
    closeModal('apply-uni-modal');
    loadAllData();
  } else {
    alert(data.message);
  }
}

function openUniEditModal(uniId) {
  const uni = allUniversities.find(u => u.id === uniId);
  if (!uni) return;

  document.getElementById('edit-uni-id').value = uni.id;
  document.getElementById('edit-uni-name').value = uni.name;
  document.getElementById('edit-uni-start').value = uni.startDate;
  document.getElementById('edit-uni-end').value = uni.endDate;

  openModal('uni-edit-modal');
}

async function handleSaveUniDetails(e) {
  e.preventDefault();
  const id = document.getElementById('edit-uni-id').value;
  const payload = {
    name: document.getElementById('edit-uni-name').value.trim(),
    startDate: document.getElementById('edit-uni-start').value.trim(),
    endDate: document.getElementById('edit-uni-end').value.trim(),
    operator: currentUser.name
  };

  const res = await fetch(`/api/universities/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.success) {
    closeModal('uni-edit-modal');
    loadAllData();
  }
}

function openNewRoundModal(uniId) {
  document.getElementById('round-uni-id').value = uniId;
  openModal('new-round-modal');
}

async function handleCreateNewRound(e) {
  e.preventDefault();
  const uniId = document.getElementById('round-uni-id').value;
  const payload = {
    roundName: document.getElementById('round-name-select').value,
    startDate: document.getElementById('round-start-date').value.trim(),
    endDate: document.getElementById('round-end-date').value.trim(),
    operator: currentUser.name
  };

  const res = await fetch(`/api/universities/${uniId}/rounds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.success) {
    closeModal('new-round-modal');
    loadAllData();
  }
}

// -------------------------------------------------------------
// 4. YOXLANIŞ VIEW RENDERER (Kanban 3-Stage)
// -------------------------------------------------------------
function renderVerificationView() {
  const colBekleniyor = document.getElementById('col-bekleniyor');
  const colEdiliyor = document.getElementById('col-ediliyor');
  const colEdildi = document.getElementById('col-edildi');

  const listBekleniyor = allVerifications.filter(v => v.status === 'Kontrol Bekleniyor');
  const listEdiliyor = allVerifications.filter(v => v.status === 'Kontrol Ediliyor');
  const listEdildi = allVerifications.filter(v => v.status === 'Kontrol Edildi');

  document.getElementById('count-bekleniyor').textContent = listBekleniyor.length;
  document.getElementById('count-ediliyor').textContent = listEdiliyor.length;
  document.getElementById('count-edildi').textContent = listEdildi.length;

  // Render Red Column
  colBekleniyor.innerHTML = listBekleniyor.length === 0 ? `<div class="empty-state">Yoxlanış gözləyən müraciət yoxdur.</div>` :
    listBekleniyor.map(item => `
      <div class="kanban-card">
        <div class="card-title">${item.studentName}</div>
        <div class="card-subtitle"><i class="fa-solid fa-university"></i> ${item.universityName} (${item.round})</div>
        <div class="card-info-row">
          <span>Pasport: ${item.passportNo}</span>
          <span>Son Tarix: ${item.deadlineDate || '-'}</span>
        </div>
        ${item.previousCheckedBy ? `<div style="font-size:11px; color:var(--yellow); margin-top:4px;"><i class="fa-solid fa-triangle-exclamation"></i> Əvvəl yoxlayan: ${item.previousCheckedBy}</div>` : ''}
        <div class="card-actions">
          <button class="btn-card-action claim" onclick="claimVerification('${item.id}', false)">
            <i class="fa-solid fa-hand"></i> Yoxlanışı Üzərinə Götür
          </button>
        </div>
      </div>
    `).join('');

  // Render Yellow Column
  colEdiliyor.innerHTML = listEdiliyor.length === 0 ? `<div class="empty-state">Yoxlanılan müraciət yoxdur.</div>` :
    listEdiliyor.map(item => `
      <div class="kanban-card">
        <div class="card-title">${item.studentName}</div>
        <div class="card-subtitle"><i class="fa-solid fa-university"></i> ${item.universityName}</div>
        <div class="card-info-row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
          ${item.previousCheckedBy ? `<span>1-ci Yoxlayan (Əvvəlki): <strong>${item.previousCheckedBy}</strong></span>` : ''}
          <span>${item.previousCheckedBy ? '2-ci Yoxlayan (Sonrakı)' : 'Yoxlayan'}: <strong>${item.checkedBy}</strong></span>
        </div>
        <div class="card-actions">
          <button class="btn-card-action complete" onclick="completeVerification('${item.id}')">
            <i class="fa-solid fa-check-double"></i> Yoxlanıldı Olaraq Qeyd Et
          </button>
        </div>
      </div>
    `).join('');

  // Render Green Column
  colEdildi.innerHTML = listEdildi.length === 0 ? `<div class="empty-state">Tamamlanmış yoxlanış yoxdur.</div>` :
    listEdildi.map(item => `
      <div class="kanban-card">
        <div class="card-title">${item.studentName}</div>
        <div class="card-subtitle"><i class="fa-solid fa-university"></i> ${item.universityName}</div>
        <div class="card-info-row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
          ${item.previousCheckedBy ? `<span>1-ci Yoxlayan (Əvvəlki): <strong>${item.previousCheckedBy}</strong></span>` : ''}
          <span>${item.previousCheckedBy ? '2-ci Yoxlayan (Sonrakı)' : 'Təsdiqləyən'}: <strong>${item.checkedBy}</strong></span>
          <span class="badge-status green" style="margin-top: 4px;">Yoxlanıldı</span>
        </div>
      </div>
    `).join('');
}

// Claim Verification with Strict Re-verification Check
async function claimVerification(id, managerOverride = false) {
  const res = await fetch(`/api/verifications/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: currentUser.name,
      userRole: currentUser.role,
      managerOverride
    })
  });

  const data = await res.json();
  if (data.success) {
    loadAllData();
  } else if (data.recheckLocked) {
    if (currentUser.role === 'admin') {
      if (confirm(`${data.message}\n\nYönetici (Qəşəm) olaraq icazə verib bu yoxlanışı öz üzərinizə götürmək istəyirsiniz?`)) {
        claimVerification(id, true);
      }
    } else {
      alert(data.message);
    }
  } else {
    alert(data.message);
  }
}

async function completeVerification(id) {
  const res = await fetch(`/api/verifications/${id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser.name })
  });

  const data = await res.json();
  if (data.success) {
    loadAllData();
  }
}

// -------------------------------------------------------------
// 5. SATIŞLAR VIEW RENDERER (Jale & Qəşəm)
// -------------------------------------------------------------
function renderSalesView() {
  const grid = document.getElementById('books-grid');
  const catalogContainer = document.getElementById('book-catalog-container');
  const detailContainer = document.getElementById('book-detail-view-container');

  if (selectedBookId) {
    catalogContainer.style.display = 'none';
    detailContainer.style.display = 'block';
    renderSelectedBookSales();
  } else {
    catalogContainer.style.display = 'block';
    detailContainer.style.display = 'none';
  }

  if (allBooks.length === 0) {
    grid.innerHTML = `<div class="empty-state-large" style="grid-column:span 4;"><h3>Hələ kitab əlavə edilməyib.</h3></div>`;
    return;
  }

  grid.innerHTML = allBooks.map(b => {
    const isSelected = b.id === selectedBookId;
    const salesCount = allSales.filter(s => s.bookId === b.id).length;
    return `
      <div class="book-card ${isSelected ? 'active' : ''}" onclick="selectBook('${b.id}')">
        <div class="book-img-wrapper">
          <img src="${b.imageUrl}" alt="${b.name}" onerror="this.src='https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400';">
        </div>
        <div class="book-details">
          <h4>${b.name}</h4>
          <div class="price-pills">
            <span class="price-pill course">Kursiçi: ${b.coursePrice} AZN</span>
            <span class="price-pill noncourse">Xaric: ${b.nonCoursePrice} AZN</span>
          </div>
          <div class="card-info-row">
            <span>Satış sayı: <strong>${salesCount} ədəd</strong></span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function selectBook(id) {
  selectedBookId = id;
  renderSalesView();
}

function closeBookDetailView() {
  selectedBookId = null;
  renderSalesView();
}

function renderSelectedBookSales() {
  const container = document.getElementById('selected-book-sales-container');
  const titleEl = document.getElementById('selected-book-title');

  if (!selectedBookId) {
    container.innerHTML = "";
    return;
  }

  const book = allBooks.find(b => b.id === selectedBookId);
  if (!book) return;

  if (titleEl) {
    titleEl.innerHTML = `<i class="fa-solid fa-book"></i> ${book.name} - Satış Siyahısı`;
  }

  const bookSales = allSales.filter(s => s.bookId === book.id);
  const handedOverSales = bookSales.filter(s => !s.teacherHandedOver);
  const pendingTeacherCash = handedOverSales.reduce((sum, s) => sum + Number(s.price), 0);

  container.innerHTML = `
    <div class="panel-header flex-between" style="border-top: none; background: transparent; padding-top: 0; padding-left: 0; padding-right: 0;">
      <h3>Satış və Təhvil Qeydiyyatı</h3>
      <button class="btn-primary" onclick="openAddSaleModal('${book.id}')"><i class="fa-solid fa-cart-plus"></i> Yeni Satış Qeydə Al</button>
    </div>
    
    <div class="panel-content" style="padding-left: 0; padding-right: 0;">
      <!-- Batch Delivery Control Bar -->
      <div class="column-mapping-box flex-between margin-top" style="margin-top:0;">
        <div style="display:flex; align-items:center; gap:12px;">
          <label><strong>Flan nömrəyə qədər təhvil verildi:</strong></label>
          <input type="number" id="batch-deliver-input" min="1" placeholder="Məs: 5" style="width:100px; padding:6px 10px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); color: white; border-radius: var(--radius-sm);">
          <button class="btn-secondary" onclick="handleBatchDeliver('${book.id}')">Təhvil Verildi İcra Et</button>
        </div>

        <div style="display:flex; align-items:center; gap:16px;">
          <span>Müəllimə təhvil veriləsi məbləğ: <strong>${pendingTeacherCash.toFixed(2)} AZN</strong></span>
          <button class="btn-primary" style="background:var(--green);" onclick="handleHandoverTeacher('${book.id}')">Müəllimə Təhvil Verildi</button>
        </div>
      </div>

      <!-- Sales Table -->
      <div class="table-responsive margin-top">
        <table class="data-table">
          <thead>
            <tr>
              <th>№</th>
              <th>TƏLƏBƏ ADI SOYADI</th>
              <th>ÖDƏNİŞ NÖVÜ</th>
              <th>MƏBLƏĞ</th>
              <th>TARİX</th>
              <th>TƏHVİL VERİLDİ</th>
              <th>MÜƏLLİMƏ TƏHVİL</th>
            </tr>
          </thead>
          <tbody>
            ${bookSales.length === 0 ? `<tr><td colspan="7" class="text-center">Bu kitab üzrə hələ satış edilməyib.</td></tr>` : 
              bookSales.map((s, idx) => `
                <tr>
                  <td><strong>${idx + 1}</strong></td>
                  <td>${s.studentName}</td>
                  <td><span class="badge-count" style="background:rgba(255,255,255,0.1); color:white;">${s.paymentType}</span></td>
                  <td><strong>${s.price} AZN</strong></td>
                  <td>${s.date}</td>
                  <td>
                    <input type="checkbox" ${s.delivered ? 'checked' : ''} onchange="toggleSaleDelivery('${s.id}')" style="width:18px; height:18px; cursor:pointer;">
                    <span style="font-size:12px; margin-left:6px;">${s.delivered ? 'Təhvil Verildi' : 'Verilməyib'}</span>
                  </td>
                  <td>
                    <span class="badge-status ${s.teacherHandedOver ? 'green' : 'red'}">${s.teacherHandedOver ? 'Təhvil Verildi' : 'Gözləyir'}</span>
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openAddBookModal() {
  openModal('add-book-modal');
}

async function handleCreateBook(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('name', document.getElementById('book-name').value.trim());
  formData.append('coursePrice', document.getElementById('book-course-price').value);
  formData.append('nonCoursePrice', document.getElementById('book-noncourse-price').value);
  formData.append('imageUrl', document.getElementById('book-image-url').value.trim());

  const fileInput = document.getElementById('book-image-file');
  if (fileInput.files[0]) {
    formData.append('bookImage', fileInput.files[0]);
  }

  const res = await fetch('/api/books', {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (data.success) {
    closeModal('add-book-modal');
    loadAllData();
  }
}

function openAddSaleModal(bookId) {
  document.getElementById('sale-book-id').value = bookId;
  document.getElementById('sale-student-name').value = "";
  document.getElementById('sale-date').value = new Date().toLocaleDateString('tr-TR');
  openModal('add-sale-modal');
}

async function handleRecordSale(e) {
  e.preventDefault();
  const bookId = document.getElementById('sale-book-id').value;
  const payload = {
    studentName: document.getElementById('sale-student-name').value.trim(),
    priceType: document.getElementById('sale-price-type').value,
    paymentType: document.getElementById('sale-payment-type').value,
    date: document.getElementById('sale-date').value.trim()
  };

  const res = await fetch(`/api/books/${bookId}/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.success) {
    closeModal('add-sale-modal');
    loadAllData();
  }
}

async function handleBatchDeliver(bookId) {
  const val = document.getElementById('batch-deliver-input').value;
  if (!val) return alert("Sıra nömrəsi daxil edin!");

  await fetch(`/api/books/${bookId}/batch-deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upToRowNumber: val })
  });

  loadAllData();
}

async function toggleSaleDelivery(saleId) {
  await fetch(`/api/books/sales/${saleId}/toggle-deliver`, { method: 'POST' });
  loadAllData();
}

async function handleHandoverTeacher(bookId) {
  const bookSales = allSales.filter(s => s.bookId === bookId && !s.teacherHandedOver);
  if (bookSales.length === 0) return alert("Təhvil veriləsi ödəniş yoxdur.");

  const saleIds = bookSales.map(s => s.id);
  await fetch('/api/books/sales/handover-teacher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saleIds })
  });

  loadAllData();
}

// -------------------------------------------------------------
// 6. HESABLAR VIEW RENDERER (Qəşəm Only)
// -------------------------------------------------------------
async function renderAccountsView() {
  const tbody = document.getElementById('accounts-tbody');
  const res = await fetch('/api/users');
  const data = await res.json();

  if (!data.success) return;

  tbody.innerHTML = data.users.map(u => `
    <tr>
      <td><strong>${u.username}</strong></td>
      <td>${u.name}</td>
      <td><span class="badge-count" style="background:var(--primary); color:white;">${u.role}</span></td>
      <td><span class="badge-status ${u.active ? 'green' : 'red'}">${u.active ? 'Aktiv' : 'Deaktiv'}</span></td>
      <td>
        <button class="btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="openEditUserModal('${u.id}')"><i class="fa-solid fa-key"></i> Düzəlt / Şifrə</button>
        ${u.username !== 'qesem' ? `
          <button class="btn-secondary" style="padding:4px 8px; font-size:12px; color:var(--red);" onclick="deactivateUser('${u.id}')"><i class="fa-solid fa-user-xmark"></i> Deaktiv Et</button>
        ` : ''}
      </td>
    </tr>
  `).join('');

  // Render Recheck Overrides
  const overrideTbody = document.getElementById('recheck-permissions-tbody');
  if (overrideTbody) {
    const lockedVerifications = allVerifications.filter(v => v.previousCheckedBy);
    if (lockedVerifications.length === 0) {
      overrideTbody.innerHTML = `<tr><td colspan="6" class="text-center">Təkrar yoxlanışda olan tələbə müraciəti yoxdur.</td></tr>`;
      return;
    }

    overrideTbody.innerHTML = lockedVerifications.map(v => {
      const isAllowed = Boolean(v.allowedPreviousChecker);
      return `
        <tr>
          <td><strong>${v.studentName}</strong></td>
          <td>${v.universityName} (${v.round})</td>
          <td><span class="badge-count" style="background:rgba(255,255,255,0.08); color:white;">${v.previousCheckedBy}</span></td>
          <td><span class="badge-status ${v.status === 'Kontrol Edildi' ? 'green' : (v.status === 'Kontrol Ediliyor' ? 'yellow' : 'red')}">${v.status}</span></td>
          <td>
            <span class="badge-status ${isAllowed ? 'green' : 'yellow'}">
              ${isAllowed ? 'İcazə Verilib' : 'Giriş Bloklanıb'}
            </span>
          </td>
          <td>
            <button class="btn-secondary" style="padding:4px 8px; font-size:12px; ${isAllowed ? 'color:var(--red);' : 'color:var(--green);'}" onclick="toggleRecheckPermission('${v.id}', ${!isAllowed})">
              <i class="fa-solid ${isAllowed ? 'fa-ban' : 'fa-check'}"></i> ${isAllowed ? 'İcazəni Ləğv Et' : 'İcazə Ver'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

async function toggleRecheckPermission(verId, allowed) {
  try {
    const res = await fetch(`/api/verifications/${verId}/allow-recheck?role=admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed })
    });
    const data = await res.json();
    if (data.success) {
      loadAllData();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert("Xəta baş verdi: " + err.message);
  }
}

function openAddUserModal() {
  document.getElementById('user-edit-id').value = "";
  document.getElementById('user-username').value = "";
  document.getElementById('user-name').value = "";
  document.getElementById('user-password').value = "";
  openModal('user-modal');
}

async function openEditUserModal(id) {
  const res = await fetch('/api/users');
  const data = await res.json();
  const user = data.users.find(u => u.id === id);
  if (!user) return;

  document.getElementById('user-edit-id').value = user.id;
  document.getElementById('user-username').value = user.username;
  document.getElementById('user-name').value = user.name;
  document.getElementById('user-password').value = "";
  document.getElementById('user-role-select').value = user.role;
  openModal('user-modal');
}

async function handleSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById('user-edit-id').value;
  const payload = {
    username: document.getElementById('user-username').value.trim(),
    name: document.getElementById('user-name').value.trim(),
    password: document.getElementById('user-password').value.trim(),
    role: document.getElementById('user-role-select').value
  };

  const url = id ? `/api/users/${id}` : '/api/users';
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.success) {
    closeModal('user-modal');
    renderAccountsView();
  } else {
    alert(data.message);
  }
}

async function deactivateUser(id) {
  if (confirm("Bu hesabı deaktiv etməyə əminsiniz?")) {
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    renderAccountsView();
  }
}

// Global Modal Helpers
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// Background Polling and Real-time Notification System
let pollingIntervalId = null;
function startRealtimePolling() {
  if (pollingIntervalId) clearInterval(pollingIntervalId);

  // Request browser Notification permissions
  if (window.Notification && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  pollingIntervalId = setInterval(async () => {
    if (!currentUser) return;

    try {
      const res = await fetch('/api/applications');
      const data = await res.json();
      if (data.success) {
        const newVerifications = data.verifications;

        newVerifications.forEach(item => {
          if (item.status === 'Kontrol Bekleniyor' && !knownVerificationIds.has(item.id)) {
            knownVerificationIds.add(item.id);

            // Notify operators revan, kerim, and afet (rahbar)
            const hasAccess = currentUser.role === 'operator' || currentUser.role === 'rahbar' || currentUser.role === 'admin';
            if (hasAccess) {
              showRealtimeNotification(item);
            }
          }
        });

        // Silently sync state in background
        allApplications = data.applications;
        allVerifications = data.verifications;
        updatePendingBadge();

        // Dynamically update view if user is currently looking at Yoxlanış or Dashboard
        const activeView = document.querySelector('.view-panel.active').id;
        if (activeView === 'verification-view') {
          renderVerificationView();
        } else if (activeView === 'home-view') {
          renderHomeView();
        }
      }
    } catch (err) {
      console.warn("Realtime sync poll failed quietly:", err);
    }
  }, 4000); // Check for new tasks every 4 seconds
}

function showRealtimeNotification(item) {
  const title = "Yeni Yoxlanış Müraciəti!";
  const body = `${item.studentName} -> ${item.universityName} (${item.round}) üçün yoxlanış tələb olunur.`;

  // 1. HTML5 System Web Notification
  if (window.Notification && Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, {
        body: body,
        icon: '/uploads/default-book.png'
      });
      notification.onclick = () => {
        window.focus();
        switchView('verification-view');
      };
    } catch (e) {
      console.warn("Failed to trigger system notification:", e);
    }
  }

  // 2. Beautiful In-App Toast Alert
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-card';
  toast.onclick = () => {
    switchView('verification-view');
    toast.remove();
  };

  toast.innerHTML = `
    <div class="toast-icon"><i class="fa-solid fa-bell"></i></div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-body">${body}</div>
    </div>
    <button type="button" class="toast-close" onclick="event.stopPropagation(); this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  // Auto-remove toast after 8 seconds
  setTimeout(() => {
    if (toast && toast.parentElement) {
      toast.remove();
    }
  }, 8000);
}

// Socket.IO Real-time Client Connection
let socket = null;
function initSocketIO() {
  if (typeof io === 'undefined') {
    console.warn('Socket.IO client not loaded, falling back to polling only.');
    return;
  }

  socket = io();

  socket.on('connect', () => {
    console.log('🔌 Socket.IO bağlantısı quruldu:', socket.id);
  });

  // Instant notification when a new verification is created
  socket.on('newVerification', (item) => {
    if (!currentUser) return;
    if (knownVerificationIds.has(item.id)) return;
    knownVerificationIds.add(item.id);

    const hasAccess = currentUser.role === 'operator' || currentUser.role === 'rahbar' || currentUser.role === 'admin';
    if (hasAccess) {
      showRealtimeNotification(item);
    }
  });

  // When any data changes, silently refresh the active view
  socket.on('dataChanged', async (info) => {
    if (!currentUser) return;
    try {
      await loadAllData();
      const activeView = document.querySelector('.view-panel.active');
      if (activeView) {
        const viewId = activeView.id;
        if (viewId === 'verification-view') renderVerificationView();
        else if (viewId === 'home-view') renderHomeView();
      }
    } catch (e) {
      console.warn('Socket dataChanged refresh failed:', e);
    }
  });

  // Show online user count
  socket.on('onlineCount', (count) => {
    const badge = document.getElementById('online-count-badge');
    if (badge) badge.textContent = count;
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket.IO bağlantı kəsildi');
  });
}

// -------------------------------------------------------------
// 7. DOSYALAR (DOCUMENT VAULT) VIEW RENDERER
// -------------------------------------------------------------
let selectedFolder = null;

function renderFilesView() {
  const grid = document.getElementById('folders-grid-list');
  const searchInput = (document.getElementById('folder-search-input').value || '').toLowerCase();

  // Group all documents by their folderName
  const foldersMap = {};
  allDocuments.forEach(doc => {
    const fName = doc.folderName || "Mütəferrik";
    if (!foldersMap[fName]) {
      foldersMap[fName] = {
        name: fName,
        docCount: 0,
        studentId: doc.studentId,
        studentName: doc.studentName,
        isMatched: doc.isMatched
      };
    }
    foldersMap[fName].docCount++;
    if (doc.studentId) {
      foldersMap[fName].studentId = doc.studentId;
      foldersMap[fName].studentName = doc.studentName;
      foldersMap[fName].isMatched = true;
    }
  });

  const folderList = Object.values(foldersMap);

  // Filter folders
  const filteredFolders = folderList.filter(f =>
    f.name.toLowerCase().includes(searchInput) ||
    (f.studentName && f.studentName.toLowerCase().includes(searchInput))
  );

  if (filteredFolders.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-large" style="grid-column: 1 / -1; padding: 48px;">
        <i class="fa-solid fa-folder-open" style="font-size:48px; opacity:0.3; margin-bottom:12px;"></i>
        <h4>Heç bir qovluq tapılmadı</h4>
        <p style="font-size:13px; color:var(--text-dim); margin-top:4px;">Başlamaq üçün "Qovluq Yüklə (Toplu)" düyməsi ilə şagird qovluqlarını əlavə edin.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredFolders.map(f => {
    const isLinked = f.isMatched;
    const cardBorder = isLinked ? 'border-color: rgba(99, 102, 241, 0.3);' : 'border-color: rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.02);';
    const folderIcon = isLinked ? 'fa-folder' : 'fa-folder-open';
    const iconColor = isLinked ? 'color: var(--primary);' : 'color: var(--yellow);';
    const linkBadge = isLinked 
      ? `<span style="font-size:11px; color:var(--text-dim); display:inline-flex; align-items:center; gap:4px; margin-top:6px; background:rgba(255,255,255,0.04); padding:2px 8px; border-radius:10px;"><i class="fa-solid fa-link" style="color:var(--green);"></i> ${f.studentName}</span>`
      : `<span style="font-size:11px; color:var(--yellow); display:inline-flex; align-items:center; gap:4px; margin-top:6px; background:rgba(251,191,36,0.1); padding:2px 8px; border-radius:10px;"><i class="fa-solid fa-link-slash"></i> Təyin edilməyib</span>`;

    return `
      <div class="folder-card" onclick="openFolderDetail('${f.name.replace(/'/g, "\\'")}')" style="${cardBorder}">
        <i class="fa-solid ${folderIcon}" style="${iconColor} font-size:32px;"></i>
        <div class="folder-name" style="margin-top:10px; font-weight:600;">${f.name}</div>
        <div class="folder-count" style="font-size:12px; color:var(--text-dim);">${f.docCount} sənəd</div>
        <div>${linkBadge}</div>
      </div>
    `;
  }).join('');
}

function openFolderDetail(folderName) {
  selectedFolder = folderName;
  selectedFileStudentId = null;
  
  // Scroll window to top
  window.scrollTo(0, 0);

  document.getElementById('files-folders-container').style.display = 'none';
  document.getElementById('unmatched-folder-view-container').style.display = 'none';
  document.getElementById('student-folder-view-container').style.display = 'block';

  document.getElementById('direct-upload-folder-name').value = folderName;
  document.getElementById('selected-student-folder-title').innerHTML = `<i class="fa-solid fa-folder-open"></i> ${folderName} qovluğu`;

  // Find if this folder is matched to a student
  const folderDocs = allDocuments.filter(d => d.folderName === folderName);
  const matchDoc = folderDocs.find(d => d.isMatched);
  
  const mappingTitle = document.getElementById('mapping-status-title');
  const mappingSubtitle = document.getElementById('mapping-status-subtitle');
  const mappingActions = document.getElementById('mapping-actions-container');

  if (matchDoc) {
    mappingTitle.innerHTML = `<i class="fa-solid fa-link" style="color:var(--green); margin-right:6px;"></i> Qovluq Əlaqəsi: ƏLAQƏLƏNDİRİLİB`;
    mappingSubtitle.textContent = `Bu qovluq ${matchDoc.studentName} şagirdi ilə əlaqələndirilmişdir.`;
    mappingActions.innerHTML = `
      <button class="btn-secondary" style="padding:6px 12px; font-size:12px; color:var(--red); border-color:rgba(239,68,68,0.3);" onclick="linkFolderToStudent('${folderName.replace(/'/g, "\\'")}', '')">
        <i class="fa-solid fa-link-slash"></i> Əlaqəni Kəs
      </button>
    `;
    document.getElementById('selected-student-folder-subtitle').textContent = `Əlaqəli Şagird: ${matchDoc.studentName} | Qovluq daxilindəki sənədlərin siyahısı`;
  } else {
    mappingTitle.innerHTML = `<i class="fa-solid fa-link-slash" style="color:var(--yellow); margin-right:6px;"></i> Qovluq Əlaqəsi: TƏYİN EDİLMƏYİB`;
    mappingSubtitle.textContent = `Bu qovluq bazada heç bir şagirdlə əlaqələndirilməyib.`;
    const optionsHtml = allStudents.map(s => `<option value="${s.id}">${s.name} ${s.surname} (${s.passportNo})</option>`).join('');
    mappingActions.innerHTML = `
      <select class="select-input" style="padding:6px 10px; font-size:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:var(--radius-sm);">
        <option value="">-- Şagird Seçin --</option>
        ${optionsHtml}
      </select>
      <button class="btn-primary" style="padding:6px 12px; font-size:12px; background:var(--green);" onclick="linkFolderToStudent('${folderName.replace(/'/g, "\\'")}', this.previousElementSibling.value)">
        <i class="fa-solid fa-circle-check"></i> Əlaqələndir
      </button>
    `;
    document.getElementById('selected-student-folder-subtitle').textContent = `Əlaqəli Şagird: Təyin edilməyib | Qovluq daxilindəki sənədlərin siyahısı`;
  }

  const tbody = document.getElementById('student-folder-files-tbody');

  if (folderDocs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 24px; color: var(--text-dim);">Qovluq daxilində sənəd tapılmadı.</td></tr>`;
  } else {
    tbody.innerHTML = folderDocs.map(d => `
      <tr>
        <td><strong>${d.customName}</strong></td>
        <td style="font-size:12px; color:var(--text-dim); font-family:monospace;">${d.filename}</td>
        <td>${d.uploadDate}</td>
        <td><span class="badge-count" style="background:rgba(255,255,255,0.08); color:white;">${d.uploadedBy}</span></td>
        <td>
          <div style="display:flex; gap:8px;">
            <a href="${d.filePath}" target="_blank" class="btn-secondary" style="padding:6px 10px; font-size:12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none;">
              <i class="fa-solid fa-up-right-from-square"></i> Aç / Yüklə
            </a>
            <button class="btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="renameDocument('${d.id}')">
              <i class="fa-solid fa-pen"></i> Adı Dəyiş
            </button>
            <button class="btn-secondary" style="padding:6px 10px; font-size:12px; color:var(--red);" onclick="deleteDocument('${d.id}')">
              <i class="fa-solid fa-trash"></i> Sil
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

async function linkFolderToStudent(folderName, studentId) {
  try {
    const res = await fetch('/api/documents/link-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName, studentId, operator: currentUser.name })
    });
    const data = await res.json();
    if (data.success) {
      await loadAllData();
      openFolderDetail(folderName);
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert("Əməliyyat zamanı xəta baş verdi: " + err.message);
  }
}

function openUnmatchedSingleFolderDetail(folderName) {
  selectedFileStudentId = null;
  
  // Scroll window to top
  window.scrollTo(0, 0);

  document.getElementById('files-folders-container').style.display = 'none';
  document.getElementById('student-folder-view-container').style.display = 'none';
  document.getElementById('unmatched-folder-view-container').style.display = 'block';

  // Set dynamic titles
  document.getElementById('unmatched-folder-title').innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:var(--yellow);"></i> Eşləşməyən Qovluq: ${folderName}`;
  document.getElementById('unmatched-folder-subtitle').textContent = `Bu qovluğun adı bazadakı heç bir şagirdlə uyğunlaşmadı. Zəhmət olmasa, hansı şagirdə məxsus olduğunu təyin edin.`;

  const tbody = document.getElementById('unmatched-folder-files-tbody');
  const unmatchedDocs = allDocuments.filter(d => d.isMatched === false && d.studentName === folderName);

  if (unmatchedDocs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding: 24px; color: var(--text-dim);">Bu qovluqda eşləşməyən sənəd yoxdur.</td></tr>`;
    return;
  }

  const optionsHtml = allStudents.map(s => `<option value="${s.id}">${s.name} ${s.surname} (${s.passportNo})</option>`).join('');
  const fileListStr = unmatchedDocs.map(d => d.customName).join(', ');

  tbody.innerHTML = `
    <tr>
      <td><strong style="color:var(--yellow);"><i class="fa-solid fa-folder-closed"></i> ${folderName}</strong></td>
      <td>
        <div style="font-size:12px; color:white; font-family:monospace; max-width: 380px; white-space: normal; word-break: break-all;">
          <strong>${unmatchedDocs.length} fayl:</strong> ${fileListStr}
        </div>
      </td>
      <td>
        <select class="select-input" style="width:100%; max-width:280px; padding:8px 12px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); color: white; border-radius: var(--radius-sm);">
          <option value="">-- Şagird Seçin --</option>
          ${optionsHtml}
        </select>
      </td>
      <td>
        <div style="display:flex; gap:8px;">
          <button class="btn-primary" style="padding:6px 12px; font-size:12px; background:var(--green);" onclick="linkUnmatchedFolder('${folderName.replace(/'/g, "\\'")}', this.parentElement.parentElement.previousElementSibling.querySelector('select').value)">
            <i class="fa-solid fa-circle-check"></i> Qovluğu Eşləşdir (Təsdiqlə)
          </button>
          <button class="btn-secondary" style="padding:6px 12px; font-size:12px; color:var(--red);" onclick="deleteUnmatchedFolder('${folderName.replace(/'/g, "\\'")}')">
            <i class="fa-solid fa-trash"></i> Qovluğu Sil
          </button>
        </div>
      </td>
    </tr>
  `;
}

function backToFoldersList() {
  selectedFileStudentId = null;
  selectedFolder = null;
  document.getElementById('student-folder-view-container').style.display = 'none';
  document.getElementById('unmatched-folder-view-container').style.display = 'none';
  document.getElementById('files-folders-container').style.display = 'block';
  renderFilesView();
}

function openUploadDocumentModal() {
  const select = document.getElementById('doc-upload-student-select');
  if (allStudents.length === 0) {
    alert("Əvvəlcə tələbə daxil etməlisiniz!");
    return;
  }

  select.innerHTML = allStudents.map(s => `
    <option value="${s.id}">${s.name} ${s.surname} (${s.passportNo})</option>
  `).join('');

  document.getElementById('doc-upload-custom-name').value = "";
  document.getElementById('doc-upload-file-input').value = "";

  openModal('upload-document-modal');
}

function openUploadFolderModal() {
  document.getElementById('folder-upload-file-input').value = "";
  const infoBox = document.getElementById('selected-folder-info-box');
  if (infoBox) {
    infoBox.style.display = 'none';
    infoBox.innerHTML = '';
  }
  document.getElementById('folder-upload-progress-container').style.display = 'none';
  document.getElementById('folder-upload-progress-bar').style.width = '0%';
  document.getElementById('btn-submit-folder-upload').disabled = false;
  openModal('upload-folder-modal');
}

async function handleDocumentUpload(e) {
  e.preventDefault();
  const select = document.getElementById('doc-upload-student-select');
  const fileInput = document.getElementById('doc-upload-file-input');
  const nameInput = document.getElementById('doc-upload-custom-name');

  if (!fileInput.files[0]) return alert("Fayl seçin!");
  if (!select.value) return alert("Tələbə seçin!");

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('studentId', select.value);
  formData.append('customName', nameInput.value.trim());
  formData.append('operator', currentUser.name);

  try {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      closeModal('upload-document-modal');
      await loadAllData();
      renderFilesView();
    } else {
      alert("Xəta: " + data.message);
    }
  } catch (err) {
    alert("Yükləmə zamanı xəta baş verdi: " + err.message);
  }
}

async function handleDirectDocumentUpload(e) {
  e.preventDefault();
  const folderName = document.getElementById('direct-upload-folder-name').value;
  const fileInput = document.getElementById('direct-upload-file-input');
  const nameInput = document.getElementById('direct-upload-custom-name');

  if (!fileInput.files[0]) return alert("Fayl seçin!");

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('folderName', folderName);
  formData.append('customName', nameInput.value.trim());
  formData.append('operator', currentUser.name);

  try {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      nameInput.value = "";
      fileInput.value = "";
      await loadAllData();
      openFolderDetail(folderName);
    } else {
      alert("Xəta: " + data.message);
    }
  } catch (err) {
    alert("Yükləmə zamanı xəta baş verdi: " + err.message);
  }
}

function handleFolderUploadSubmit(e) {
  e.preventDefault();
  const fileInput = document.getElementById('folder-upload-file-input');
  const files = fileInput.files;

  if (files.length === 0) return alert("Zəhmət olmasa bir qovluq seçin.");

  const progressContainer = document.getElementById('folder-upload-progress-container');
  const progressBar = document.getElementById('folder-upload-progress-bar');
  const progressText = document.getElementById('folder-upload-progress-text');
  const submitBtn = document.getElementById('btn-submit-folder-upload');

  progressContainer.style.display = 'block';
  submitBtn.disabled = true;

  const formData = new FormData();
  const relativePaths = [];

  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
    relativePaths.push(files[i].webkitRelativePath || files[i].name);
  }

  formData.append('relativePaths', JSON.stringify(relativePaths));
  formData.append('operator', currentUser.name);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/documents/upload-folder', true);

  xhr.upload.onprogress = function(event) {
    if (event.lengthComputable) {
      const pct = Math.round((event.loaded / event.total) * 100);
      progressBar.style.width = pct + '%';
      progressText.textContent = `Fayllar serverə ötürülür: ${pct}%`;
    }
  };

  xhr.onload = async function() {
    submitBtn.disabled = false;
    if (xhr.status === 200) {
      const res = JSON.parse(xhr.responseText);
      alert(`Toplu qovluq yüklənməsi tamamlandı!\n\nEşləşən: ${res.matchedFoldersCount} qovluq\nEşləşməyən: ${res.unmatchedFoldersCount} qovluq (əllə seçilməlidir).`);
      closeModal('upload-folder-modal');
      await loadAllData();
      renderFilesView();
    } else {
      alert("Toplu qovluq yüklənərkən xəta baş verdi.");
    }
  };

  xhr.onerror = function() {
    submitBtn.disabled = false;
    alert("Yükləmə zamanı şəbəkə xətası baş verdi.");
  };

  xhr.send(formData);
}

async function linkUnmatchedFolder(folderName, studentId) {
  if (!studentId) return alert("Zəhmət olmasa siyahıdan bir tələbə seçin!");

  try {
    const res = await fetch('/api/documents/link-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName, studentId, operator: currentUser.name })
    });
    const data = await res.json();
    if (data.success) {
      await loadAllData();
      backToFoldersList();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert("Xəta baş verdi: " + err.message);
  }
}

async function deleteUnmatchedFolder(folderName) {
  if (confirm(`"${folderName}" qovluğunu və daxilindəki bütün sənədləri silmək istədiyinizə əminsiniz?`)) {
    try {
      const res = await fetch('/api/documents/delete-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName, operator: currentUser.name })
      });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
        backToFoldersList();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Silinmə zamanı xəta baş verdi: " + err.message);
    }
  }
}

async function renameDocument(docId) {
  const doc = allDocuments.find(d => d.id === docId);
  if (!doc) return;

  const newName = prompt("Sənəd üçün yeni adı daxil edin:", doc.customName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return alert("Sənəd adı boş ola bilməz!");

  try {
    const res = await fetch(`/api/documents/${docId}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customName: trimmed, operator: currentUser.name })
    });
    const data = await res.json();
    if (data.success) {
      await loadAllData();
      if (selectedFolder) {
        openFolderDetail(selectedFolder);
      } else {
        renderFilesView();
      }
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert("Xəta baş verdi: " + err.message);
  }
}

async function deleteDocument(docId) {
  if (confirm("Bu sənədi silməyə əminsiniz? (Fayl diskdən tamamilə silinəcək)")) {
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: currentUser.name })
      });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
        if (selectedFolder) {
          openFolderDetail(selectedFolder);
        } else {
          renderFilesView();
        }
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Silinmə zamanı xəta baş verdi: " + err.message);
    }
  }
}

// Qəşəm System Reset Handler
async function resetAllStudentData() {
  if (confirm("DİQQƏT! Bu əməliyyat BÜTÜN tələbə məlumatlarını, müraciətlərini, yoxlanış qeydlərini və yüklənmiş sənədləri tamamilə siləcək.\n\nDavam etmək istədiyinizə əminsiniz?")) {
    const code = prompt("Təsdiqləmək üçün 'SIFIRLA' yazın:");
    if (code !== 'SIFIRLA') {
      alert("Təsdiqləmə kodu yanlış daxil edildi. Əməliyyat ləğv olundu.");
      return;
    }

    try {
      const res = await fetch('/api/system/reset-students?role=admin', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        alert("Bütün tələbə məlumatları uğurla sıfırlandı!");
        selectedFileStudentId = null;
        isInitialLoad = true;
        knownVerificationIds.clear();
        await loadAllData();
        switchView('home-view');
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Sıfırlama zamanı xəta baş verdi: " + err.message);
    }
  }
}

async function clearAllDocumentsArchive() {
  if (confirm("Bütün yüklənmiş sənədləri silmək və sənədlər arşivini tamamilə təmizləmək istədiyinizə əminsiniz? (Şagird siyahısı silinməyəcək)")) {
    try {
      const res = await fetch('/api/documents/clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: currentUser.name })
      });
      const data = await res.json();
      if (data.success) {
        alert("Bütün sənəd arşivi uğurla təmizləndi!");
        selectedFileStudentId = null;
        await loadAllData();
        backToFoldersList();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Təmizlənmə zamanı xəta baş verdi: " + err.message);
    }
  }
}

// ⚙️ Railway-a deploy edəndə bu URL-i dəyişdirin, məs: 'https://muhtesem3lu.up.railway.app/api'
const API_BASE = 'http://localhost:3000/api';

let allStudents = [];
let allUniversities = [];
let activeSession = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Check if there's an active session
  const stored = await chrome.storage.local.get('activeSession');
  if (stored.activeSession) {
    activeSession = stored.activeSession;
    showActiveView();
  }

  await loadData();

  document.getElementById('btn-start').addEventListener('click', startSession);
  document.getElementById('btn-finish').addEventListener('click', finishSession);
  document.getElementById('btn-cancel').addEventListener('click', cancelSession);
});

async function loadData() {
  try {
    const [studentsRes, unisRes] = await Promise.all([
      fetch(`${API_BASE}/students`),
      fetch(`${API_BASE}/universities`)
    ]);

    const studentsData = await studentsRes.json();
    const unisData = await unisRes.json();

    if (studentsData.success) {
      allStudents = studentsData.students || [];
      const studentSelect = document.getElementById('student-select');
      studentSelect.innerHTML = '<option value="">-- Tələbə Seçin --</option>';
      allStudents.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} ${s.surname} (${s.passportNo})`;
        studentSelect.appendChild(opt);
      });
    }

    if (unisData.success) {
      allUniversities = unisData.universities || [];
      const uniSelect = document.getElementById('university-select');
      uniSelect.innerHTML = '<option value="">-- Universitet Seçin --</option>';
      allUniversities.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        uniSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('API xətası:', err);
  }
}

function cleanTryosNo(val) {
  if (!val) return '';
  // Remove leading /, . characters and spaces
  return val.replace(/^[\/\.\s,]+/, '').trim();
}

async function startSession() {
  const studentId = document.getElementById('student-select').value;
  const uniId = document.getElementById('university-select').value;
  const operator = document.getElementById('operator-input').value.trim();

  if (!studentId) {
    alert('Zəhmət olmasa tələbə seçin.');
    return;
  }
  if (!uniId) {
    alert('Zəhmət olmasa universitet seçin.');
    return;
  }

  const student = allStudents.find(s => s.id === studentId);
  const uni = allUniversities.find(u => u.id === uniId);

  if (!student || !uni) return;

  // Build fields list from student data
  const fields = [];

  // Default company-wide fields (always at the top)
  fields.push({ label: 'Şifrə', value: 'muhtesem3lu.026' });
  fields.push({ label: 'Adres', value: 'C. CABBARLI 28' });
  fields.push({ label: 'Telefon', value: '+994508252533' });

  if (student.name) fields.push({ label: 'Ad', value: student.name });
  if (student.surname) fields.push({ label: 'Soyad', value: student.surname });
  if (student.passportNo) fields.push({ label: 'Pasport No', value: student.passportNo });
  if (student.email) fields.push({ label: 'E-mail', value: student.email });
  if (student.birthDate) fields.push({ label: 'Doğum Tarixi', value: student.birthDate });
  if (student.passIssueDate) fields.push({ label: 'Pasport Verilmə', value: student.passIssueDate });
  if (student.passExpiryDate) fields.push({ label: 'Pasport Bitmə', value: student.passExpiryDate });

  // Add custom fields
  if (student.customFields && typeof student.customFields === 'object') {
    for (const [key, val] of Object.entries(student.customFields)) {
      if (val && String(val).trim()) {
        // Clean TRYÖS no values
        let cleanedVal = String(val).trim();
        if (key.toLowerCase().includes('tryös') || key.toLowerCase().includes('tryos')) {
          cleanedVal = cleanTryosNo(cleanedVal);
        }
        fields.push({ label: key, value: cleanedVal });
      }
    }
  }

  activeSession = {
    studentId: student.id,
    studentName: `${student.name} ${student.surname}`,
    universityId: uni.id,
    universityName: uni.name,
    operator: operator || 'Operator',
    fields: fields,
    startedAt: new Date().toISOString()
  };

  await chrome.storage.local.set({ activeSession });

  // Notify content scripts about the new session
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'SESSION_STARTED',
        session: activeSession
      }).catch(() => {});
    }
  } catch (e) { /* ignore */ }

  showActiveView();
}

function showActiveView() {
  if (!activeSession) return;

  document.getElementById('setup-view').style.display = 'none';
  document.getElementById('active-view').style.display = 'block';

  document.getElementById('active-student-name').textContent = activeSession.studentName;
  document.getElementById('active-uni-name').textContent = activeSession.universityName;

  const fieldsContainer = document.getElementById('info-fields-list');
  fieldsContainer.innerHTML = '';

  activeSession.fields.forEach(field => {
    const row = document.createElement('div');
    row.className = 'info-row';
    row.innerHTML = `
      <span class="info-label">${field.label}</span>
      <div class="info-value-container">
        <span class="info-value">${field.value}</span>
        <button class="btn-copy" data-value="${field.value.replace(/"/g, '&quot;')}" title="Kopyala">📋</button>
      </div>
    `;
    fieldsContainer.appendChild(row);
  });

  // Attach copy event listeners
  fieldsContainer.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const val = btn.getAttribute('data-value');
      try {
        await navigator.clipboard.writeText(val);
        const original = btn.textContent;
        btn.textContent = '✅';
        btn.style.background = 'rgba(16, 185, 129, 0.2)';
        setTimeout(() => {
          btn.textContent = '📋';
          btn.style.background = '';
        }, 1200);
      } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = val;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '📋'; }, 1200);
      }
    });
  });
}

async function finishSession() {
  if (!activeSession) return;

  // Create application in the system (adds to university list + sends to verification)
  try {
    const res = await fetch(`${API_BASE}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: activeSession.studentId,
        universityId: activeSession.universityId,
        createdBy: activeSession.operator || 'Extension'
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Başvuru uğurla tamamlandı!\n\n${activeSession.studentName} → ${activeSession.universityName}\n\nŞagird universitetin listinə əlavə olundu və yoxlanışa göndərildi.`);
    } else {
      alert(`⚠️ ${data.message}`);
      return; // Don't clear session if it failed
    }
  } catch (e) {
    alert('❌ Server ilə əlaqə qurulmadı. Zəhmət olmasa serverin işlədiyini yoxlayın.');
    return;
  }

  await clearSession();
}

async function cancelSession() {
  if (!confirm('Müraciəti ləğv etmək istəyirsiniz?')) return;
  await clearSession();
}

async function clearSession() {
  activeSession = null;
  await chrome.storage.local.remove('activeSession');

  // Notify content scripts
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SESSION_ENDED' }).catch(() => {});
    }
  } catch (e) { /* ignore */ }

  document.getElementById('setup-view').style.display = 'block';
  document.getElementById('active-view').style.display = 'none';
}

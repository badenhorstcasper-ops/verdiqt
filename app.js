import { put, get, getAll, remove, getSetting, setSetting, uid, exportAllData, importData } from './db.js';

const CONTENT_URL = 'https://raw.githubusercontent.com/badenhorstcasper-ops/verdiqt-content/main/verdiqt-content.json';
let CONTENT = null;
let currentCase = null;
let currentStep = 0;
let deferredInstall = null;

// ── BOOT ──────────────────────────────────────────────────────
async function boot() {
  await loadContent();
  registerSW();
  setupRouter();
  setupSidebar();
  setupOfflineDetection();
  setupInstallPrompt();
  await renderDashboard();
  await updateBadges();
  await loadSettings();
  checkForUpdate();
}

// ── CONTENT ───────────────────────────────────────────────────
async function loadContent() {
  try {
    const cached = await getSetting('legal_content');
    if (cached) {
      CONTENT = cached;
    } else {
      const res = await fetch('/verdiqt-content.json');
      CONTENT = await res.json();
      await setSetting('legal_content', CONTENT);
    }
    document.getElementById('content-version').textContent =
      `v${CONTENT.version} · ${CONTENT.legal_currency?.primary_code?.split(',')[0] || '2025 Code'}`;
  } catch (e) {
    console.error('Content load failed', e);
  }
}

// ── SERVICE WORKER ─────────────────────────────────────────────
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner('App update available — reload to get the latest version.');
        }
      });
    });
  });
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data.type === 'UPDATE_STATUS') {
      if (e.data.hasUpdate) {
        const v = e.data.remote?.version || '';
        showUpdateBanner(`Legal content update available${v ? ' — v' + v : ''}. Press install to update.`);
      }
    }
    if (e.data.type === 'UPDATE_COMPLETE') {
      loadContent();
      hideUpdateBanner();
      showToast(`Legal content updated to v${e.data.version}`);
    }
    if (e.data.type === 'UPDATE_ERROR') {
      showToast('Update failed — please try again.', 'error');
    }
  });
}

async function checkForUpdate() {
  if (!navigator.onLine || !navigator.serviceWorker?.controller) return;
  const sub = await getSetting('live_update_active');
  if (!sub) return;
  navigator.serviceWorker.controller.postMessage('CHECK_UPDATE');
}

function showUpdateBanner(msg) {
  const b = document.getElementById('update-banner');
  document.getElementById('update-banner-text').textContent = msg;
  b.classList.add('visible');
  document.getElementById('update-install-btn').onclick = () => {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage('INSTALL_UPDATE');
    } else {
      location.reload();
    }
  };
}

function hideUpdateBanner() {
  document.getElementById('update-banner').classList.remove('visible');
}

// ── ROUTER ────────────────────────────────────────────────────
const SCREENS = {
  dashboard: renderDashboard,
  clients: renderClients,
  'new-client': renderNewClient,
  upload: renderUpload,
  cases: renderCases,
  'new-case': renderNewCase,
  charges: renderCharges,
  hearing: renderHearing,
  decision: renderDecision,
  findings: renderFindings,
  documents: renderDocuments,
  ccma: renderCCMA,
  invoice: renderInvoice,
  settings: renderSettings,
  'ai-settings': renderAISettings,
};

function setupRouter() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const screen = el.dataset.screen;
      if (screen) navigate(screen);
    });
  });
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });
  document.getElementById('page-content').addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) navigate(nav.dataset.nav);
  });
}

function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const el = document.getElementById('screen-' + screen);
  if (el) el.classList.add('active');

  document.querySelectorAll(`.nav-item[data-screen="${screen}"]`).forEach(n => n.classList.add('active'));

  const titles = {
    dashboard: 'Dashboard', clients: 'Client vault', 'new-client': 'Add client',
    upload: 'Upload document', cases: 'All cases', 'new-case': 'New case',
    charges: 'Charge builder', hearing: 'Hearing flow', decision: 'Decision engine',
    findings: 'Findings & sanction', documents: 'Generate & share', ccma: 'CCMA tracker',
    invoice: 'Invoices', settings: 'Settings', 'ai-settings': 'AI assistant',
  };
  document.getElementById('page-title').textContent = titles[screen] || screen;

  if (SCREENS[screen]) SCREENS[screen]();

  if (window.innerWidth <= 680) closeSidebar();
  document.getElementById('page-content').scrollTo(0, 0);
}

// ── SIDEBAR MOBILE ─────────────────────────────────────────────
function setupSidebar() {
  const toggle = document.getElementById('menu-toggle');
  const overlay = document.getElementById('sidebar-overlay');
  const sidebar = document.getElementById('sidebar');
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  });
  overlay.addEventListener('click', closeSidebar);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

// ── OFFLINE ────────────────────────────────────────────────────
function setupOfflineDetection() {
  const banner = document.getElementById('offline-banner');
  const update = () => banner.classList.toggle('visible', !navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

// ── INSTALL PROMPT ─────────────────────────────────────────────
function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    document.getElementById('install-prompt').classList.add('visible');
  });
  document.getElementById('install-btn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const result = await deferredInstall.userChoice;
    if (result.outcome === 'accepted') {
      document.getElementById('install-prompt').classList.remove('visible');
    }
    deferredInstall = null;
  });
  document.getElementById('install-dismiss').addEventListener('click', () => {
    document.getElementById('install-prompt').classList.remove('visible');
  });
}

// ── TOAST ──────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;color:#fff;background:${type === 'error' ? '#A32D2D' : '#166534'};box-shadow:0 2px 8px rgba(0,0,0,0.2);max-width:320px;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── BADGES ────────────────────────────────────────────────────
async function updateBadges() {
  const ccmaRecords = await getAll('ccma');
  const active = ccmaRecords.filter(r => r.status === 'active');
  const urgent = active.filter(r => {
    const days = Math.ceil((new Date(r.deadline) - new Date()) / 86400000);
    return days <= 20;
  });
  const alertBadge = document.getElementById('badge-alerts');
  const ccmaBadge = document.getElementById('badge-ccma');
  if (alertBadge) { alertBadge.textContent = urgent.length; alertBadge.style.display = urgent.length ? 'block' : 'none'; }
  if (ccmaBadge) { ccmaBadge.textContent = active.length; ccmaBadge.style.display = active.length ? 'block' : 'none'; }
}

// ── DASHBOARD ─────────────────────────────────────────────────
async function renderDashboard() {
  const [cases, clients, ccmaRecords, invoices] = await Promise.all([
    getAll('cases'), getAll('clients'), getAll('ccma'), getAll('invoices')
  ]);

  const active = cases.filter(c => c.status === 'active').length;
  const complete = cases.filter(c => c.status === 'complete').length;
  const urgentCCMA = ccmaRecords.filter(r => {
    const days = daysUntil(r.deadline);
    return r.status === 'active' && days <= 20;
  });

  document.getElementById('dashboard-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total cases</div><div class="stat-value bur">${cases.length}</div></div>
    <div class="stat-card"><div class="stat-label">Active clients</div><div class="stat-value">${clients.length}</div></div>
    <div class="stat-card"><div class="stat-label">In progress</div><div class="stat-value amber">${active}</div></div>
    <div class="stat-card"><div class="stat-label">CCMA deadlines</div><div class="stat-value ${urgentCCMA.length > 0 ? 'red' : 'green'}">${urgentCCMA.length}</div></div>
  `;

  const tbody = document.getElementById('dashboard-cases');
  const recent = [...cases].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  tbody.innerHTML = recent.length ? recent.map(c => `
    <tr onclick="window.navigate('cases')">
      <td>${c.ref}</td>
      <td>${c.clientName || '—'}</td>
      <td>${c.empName || '—'}</td>
      <td>${c.charge || '—'}</td>
      <td><span class="pill pill-${statusPill(c.status)}">${c.status || 'draft'}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--mg);padding:20px">No cases yet — create your first case to get started.</td></tr>';

  if (urgentCCMA.length) {
    document.getElementById('dashboard-alerts-card').style.display = 'block';
    document.getElementById('dashboard-alerts').innerHTML = urgentCCMA.map(r => {
      const days = daysUntil(r.deadline);
      const cls = days <= 2 ? 'red' : 'amber';
      return `<div class="notif notif-${cls === 'red' ? 'red' : 'amber'}" style="margin-bottom:6px">
        <strong>${r.caseRef}</strong> — ${r.empName} · ${days} day${days !== 1 ? 's' : ''} remaining · Deadline: ${formatDate(r.deadline)}
        <button class="btn" style="float:right;font-size:11px;padding:3px 8px" onclick="navigate('ccma')">View →</button>
      </div>`;
    }).join('');
    document.getElementById('dashboard-ccma-card').style.display = 'block';
    document.getElementById('dashboard-ccma').innerHTML = urgentCCMA.map(r => buildCCMACard(r)).join('');
  }
}

// ── CLIENTS ───────────────────────────────────────────────────
async function renderClients() {
  const clients = await getAll('clients');
  const list = document.getElementById('clients-list');
  if (!clients.length) {
    list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--mg)">No clients yet. Add your first client to get started.</div>';
    return;
  }
  list.innerHTML = clients.map(c => `
    <div class="client-row" onclick="openClient('${c.id}')">
      <div class="client-avatar">${initials(c.name)}</div>
      <div>
        <div class="client-name">${c.name}</div>
        <div class="client-sub">${c.industry || 'No industry'} · ${c.billing === 'org' ? 'Organisation member' : 'Per hearing'}</div>
      </div>
      <div style="margin-left:auto">
        <span class="pill pill-${c.billing === 'org' ? 'blue' : 'bur'}">${c.billing === 'org' ? 'Org member' : 'Invoiced'}</span>
      </div>
    </div>
  `).join('');

  document.getElementById('client-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    list.querySelectorAll('.client-row').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

async function openClient(id) {
  const client = await get('clients', id);
  if (!client) return;
  showToast(`Opened: ${client.name}`);
  navigate('cases');
}

async function renderNewClient() {
  document.getElementById('save-client-btn').onclick = saveClient;
}

async function saveClient() {
  const name = document.getElementById('nc-name').value.trim();
  if (!name) { showToast('Client name is required', 'error'); return; }
  const client = {
    id: uid(), name,
    reg: document.getElementById('nc-reg').value,
    industry: document.getElementById('nc-industry').value,
    size: document.getElementById('nc-size').value,
    contact: document.getElementById('nc-contact').value,
    email: document.getElementById('nc-email').value,
    phone: document.getElementById('nc-phone').value,
    billing: document.getElementById('nc-billing').value,
    notes: document.getElementById('nc-notes').value,
    createdAt: Date.now()
  };
  await put('clients', client);
  showToast(`Client "${name}" saved`);
  navigate('clients');
}

// ── UPLOAD ────────────────────────────────────────────────────
async function renderUpload() {
  await populateClientSelect('upload-client');
  setupUploadZone();
  renderRecentUploads();
}

function setupUploadZone() {
  const zone = document.getElementById('upload-dropzone');
  const input = document.getElementById('file-input');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
  input.addEventListener('change', () => handleFiles(input.files));
}

async function handleFiles(files) {
  const clientId = document.getElementById('upload-client').value;
  const type = document.getElementById('upload-type').value;
  const desc = document.getElementById('upload-desc').value;
  const result = document.getElementById('upload-result');

  for (const file of files) {
    if (file.size > 52428800) { showToast(`${file.name} exceeds 50MB limit`, 'error'); continue; }
    const reader = new FileReader();
    reader.onload = async e => {
      const doc = {
        id: uid(), clientId, type, desc,
        name: file.name, size: file.size,
        mimeType: file.type,
        data: e.target.result,
        createdAt: Date.now()
      };
      await put('docs', doc);
      result.innerHTML = `<div class="notif notif-green">"${file.name}" saved — linked to selected client and available in all future hearings.</div>`;
      setTimeout(() => result.innerHTML = '', 3000);
      renderRecentUploads();
    };
    reader.readAsDataURL(file);
  }
}

async function renderRecentUploads() {
  const docs = await getAll('docs');
  const recent = [...docs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const el = document.getElementById('recent-uploads');
  el.innerHTML = recent.length ? recent.map(d => `
    <div class="doc-file" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:0.5px solid var(--lg);border-radius:var(--radius-md);margin-bottom:5px;background:var(--off-white)">
      <div style="width:28px;height:28px;border-radius:6px;background:var(--bur-l);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;color:var(--bur);flex-shrink:0">${fileIcon(d.name)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.name}</div>
        <div style="font-size:10px;color:var(--mg)">${d.type} · ${formatDate(d.createdAt)}</div>
      </div>
      <button class="btn" style="font-size:10px;padding:3px 8px" onclick="deleteDoc('${d.id}')">Remove</button>
    </div>
  `).join('') : '<div style="color:var(--mg);font-size:12px;padding:10px 0">No documents uploaded yet.</div>';
}

async function deleteDoc(id) {
  await remove('docs', id);
  renderRecentUploads();
  showToast('Document removed');
}

window.deleteDoc = deleteDoc;
window.triggerFileInput = (accept) => {
  const input = document.getElementById('file-input');
  if (accept !== 'any') input.setAttribute('capture', 'environment');
  else input.removeAttribute('capture');
  input.click();
};

// ── CASES ─────────────────────────────────────────────────────
async function renderCases() {
  const [cases, clients] = await Promise.all([getAll('cases'), getAll('clients')]);
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const tbody = document.getElementById('cases-list');
  const render = (list) => {
    tbody.innerHTML = list.length ? list.map(c => `
      <tr onclick="loadCase('${c.id}')">
        <td>${c.ref}</td>
        <td>${clientMap[c.clientId] || c.clientName || '—'}</td>
        <td>${c.empName || '—'}</td>
        <td>${c.charge || '—'}</td>
        <td>${formatDate(c.date)}</td>
        <td><span class="pill pill-${statusPill(c.status)}">${c.status || 'draft'}</span></td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--mg);padding:20px">No cases found.</td></tr>';
  };
  render(cases.sort((a, b) => b.createdAt - a.createdAt));

  document.getElementById('case-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    render(cases.filter(c => JSON.stringify(c).toLowerCase().includes(q)));
  });
  document.getElementById('case-filter').addEventListener('change', e => {
    const v = e.target.value;
    render(v ? cases.filter(c => c.status === v) : cases);
  });
}

async function loadCase(id) {
  currentCase = await get('cases', id);
  showToast(`Case ${currentCase.ref} loaded`);
  navigate('hearing');
}

window.loadCase = loadCase;
window.navigate = navigate;

// ── NEW CASE ──────────────────────────────────────────────────
async function renderNewCase() {
  await populateClientSelect('case-client');
  const ref = 'VQ-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 900) + 100);
  document.getElementById('case-ref').value = ref;
  document.getElementById('case-date').value = new Date().toISOString().split('T')[0];

  document.getElementById('case-steward').addEventListener('change', e => {
    document.getElementById('shop-steward-warning').style.display = e.target.value === 'yes' ? 'block' : 'none';
  });

  document.getElementById('save-case-btn').onclick = saveCase;
}

async function saveCase() {
  const clientId = document.getElementById('case-client').value;
  const empName = document.getElementById('case-emp-name').value.trim();
  if (!clientId) { showToast('Please select a client', 'error'); return; }
  if (!empName) { showToast('Employee name is required', 'error'); return; }

  const clients = await getAll('clients');
  const client = clients.find(c => c.id === clientId);

  currentCase = {
    id: uid(),
    ref: document.getElementById('case-ref').value,
    clientId, clientName: client?.name || '',
    empName,
    empId: document.getElementById('case-emp-id').value,
    empPos: document.getElementById('case-emp-pos').value,
    empService: document.getElementById('case-emp-service').value,
    isSteward: document.getElementById('case-steward').value,
    priorRecord: document.getElementById('case-prior').value,
    sensitiveData: document.getElementById('case-sensitive').value,
    hasCode: document.getElementById('case-code').value,
    date: document.getElementById('case-date').value,
    time: document.getElementById('case-time').value,
    chairperson: document.getElementById('case-chair').value,
    initiator: document.getElementById('case-initiator').value,
    venue: document.getElementById('case-venue').value,
    status: 'active',
    hearingStep: 0,
    createdAt: Date.now()
  };
  await put('cases', currentCase);
  showToast(`Case ${currentCase.ref} created`);
  navigate('charges');
}

// ── CHARGES ───────────────────────────────────────────────────
async function renderCharges() {
  if (!CONTENT) return;
  const container = document.getElementById('charge-categories');
  container.innerHTML = Object.entries(CONTENT.charges).map(([key, charge]) => `
    <span style="display:inline-flex;align-items:center;gap:5px;background:var(--bur-l);color:var(--bur);border:0.5px solid var(--bur-border);border-radius:20px;padding:5px 12px;font-size:12px;cursor:pointer;margin:2px" onclick="selectCharge('${key}')">
      ${charge.label}
    </span>
  `).join('') + `
    <span style="display:inline-flex;align-items:center;gap:5px;background:var(--off-white);color:var(--mg);border:0.5px solid var(--lg);border-radius:20px;padding:5px 12px;font-size:12px;cursor:pointer;margin:2px" onclick="selectCharge('custom')">
      + Custom charge
    </span>
  `;
}

window.selectCharge = function(key) {
  const card = document.getElementById('charge-detail-card');
  card.style.display = 'block';
  if (key === 'custom') {
    document.getElementById('charge-detail-title').textContent = 'Custom charge wording';
    document.getElementById('charge-text').value = 'That the employee, on [DATE], [describe conduct], in contravention of [clause X of the Disciplinary Code].';
    document.getElementById('charge-authority').textContent = '';
    if (currentCase) { currentCase.charge = 'Custom misconduct'; currentCase.chargeKey = 'custom'; }
    return;
  }
  const charge = CONTENT.charges[key];
  if (!charge) return;
  document.getElementById('charge-detail-title').textContent = charge.label;
  document.getElementById('charge-text').value = charge.standard_wording;
  document.getElementById('charge-authority').textContent = `Legal authority: ${charge.authority}`;
  if (currentCase) { currentCase.charge = charge.label; currentCase.chargeKey = key; }
  card.scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('add-charge-btn')?.addEventListener('click', () => {
  document.getElementById('charge-detail-card').style.display = 'none';
});

// ── HEARING FLOW ──────────────────────────────────────────────
async function renderHearing() {
  if (!CONTENT) return;
  currentStep = currentCase?.hearingStep || 0;
  buildHearingProgress();
  renderHearingStep(currentStep);

  document.getElementById('hearing-next-btn').onclick = advanceHearing;
  document.getElementById('hearing-prev-btn').onclick = () => {
    if (currentStep > 0) { currentStep--; renderHearingStep(currentStep); buildHearingProgress(); }
  };
}

function buildHearingProgress() {
  const steps = CONTENT.hearing_steps;
  document.getElementById('hearing-step-progress').innerHTML = steps.map((s, i) => `
    <div class="step-pill ${i < currentStep ? 'done' : i === currentStep ? 'active' : ''}">${i < currentStep ? '✓ ' : ''}${s.title}</div>
    ${i < steps.length - 1 ? '<span class="step-arrow">›</span>' : ''}
  `).join('');
}

function renderHearingStep(idx) {
  if (!CONTENT?.hearing_steps) return;
  const step = CONTENT.hearing_steps[idx];
  if (!step) return;
  document.getElementById('hearing-step-title').textContent = `Step ${idx + 1} — ${step.title}`;
  document.getElementById('hearing-step-desc').textContent = step.description;
  document.getElementById('hearing-checklist').innerHTML = step.checklist.map((item, i) => `
    <label class="check-item" id="check-${idx}-${i}">
      <input type="checkbox" onchange="this.closest('.check-item').classList.toggle('checked', this.checked)"/>
      ${item}
    </label>
  `).join('');
  document.getElementById('hearing-prompts').innerHTML = step.prompts.map(p => `
    <div style="padding:6px 0;border-bottom:0.5px solid var(--lg);font-style:italic;color:var(--bur)">"${p}"</div>
  `).join('');
  document.getElementById('hearing-notes').value = '';
  document.getElementById('hearing-prev-btn').style.display = idx === 0 ? 'none' : 'inline-flex';
  const isLast = idx === CONTENT.hearing_steps.length - 1;
  document.getElementById('hearing-next-btn').textContent = isLast ? 'Complete hearing → Decision engine' : 'Complete stage →';
}

async function advanceHearing() {
  const notes = document.getElementById('hearing-notes').value;
  if (currentCase) {
    currentCase[`step_notes_${currentStep}`] = notes;
    currentCase.hearingStep = currentStep + 1;
    await put('cases', currentCase);
  }
  const isLast = currentStep === CONTENT.hearing_steps.length - 1;
  if (isLast) { navigate('decision'); return; }
  currentStep++;
  buildHearingProgress();
  renderHearingStep(currentStep);
}

// ── DECISION ENGINE ────────────────────────────────────────────
async function renderDecision() {
  if (!CONTENT) return;
  const container = document.getElementById('decision-factors');
  container.innerHTML = CONTENT.decision_factors.map((f, i) => `
    <div class="card" style="margin-bottom:10px">
      <div style="font-size:13px;font-weight:500;color:var(--dg);margin-bottom:10px">${i + 1}. ${f.label}</div>
      <div class="notif notif-blue" style="font-size:11px;margin-bottom:10px">${f.guidance}</div>
      <div class="field"><label>Your finding on this factor</label>
        <select id="df-${i}" onchange="updateDecisionTemplate(${i}, this.value)">
          <option value="">Select finding</option>
          <option value="yes">Finding in favour of employer / established</option>
          <option value="no">Finding in favour of employee / not established</option>
          <option value="partial">Partial — see reasoning below</option>
        </select>
      </div>
      <div class="field"><label>Record your reasoning</label>
        <textarea id="dt-${i}" rows="3" placeholder="Enter your reasoning..."></textarea>
      </div>
    </div>
  `).join('');

  document.getElementById('generate-risk-btn').onclick = generateRiskProfile;
}

window.updateDecisionTemplate = function(idx, val) {
  const factor = CONTENT.decision_factors[idx];
  const ta = document.getElementById('dt-' + idx);
  if (!ta || !factor) return;
  const templates = {
    rule_existed: { yes: factor.template_yes, no: factor.template_no },
    employee_aware: { yes: factor.template_yes, no: factor.template_no },
    rule_valid_reasonable: { yes: factor.template_yes, no: factor.template_no },
    breach_established: { yes: factor.template_yes, no: factor.template_no },
    consistency: { yes: factor.template_yes, partial: factor.template_inconsistent },
    harm: { yes: factor.template_significant, no: factor.template_minor },
    proportionality: { yes: factor.template_dismissal, no: factor.template_warning },
  };
  const t = templates[factor.id];
  if (t && t[val]) ta.value = t[val];
};

async function generateRiskProfile() {
  const factors = CONTENT.decision_factors;
  let score = 0; let flags = [];

  factors.forEach((f, i) => {
    const sel = document.getElementById('df-' + i)?.value;
    if (sel === 'yes') score++;
    else if (sel === 'no') {
      flags.push({ level: 'high', msg: `${f.label} — finding against employer` });
    } else if (sel === 'partial') {
      flags.push({ level: 'medium', msg: `${f.label} — partial finding, ensure reasoning is recorded` });
      score += 0.5;
    }
  });

  if (currentCase) {
    currentCase.decisionScore = score;
    await put('cases', currentCase);
  }

  let sanction = score >= 6 ? ['Dismissal with notice', 'Summary dismissal'] :
    score >= 4 ? ['Final written warning', 'Dismissal with notice'] :
    ['Written warning', 'Final written warning'];

  const profile = document.getElementById('risk-profile');
  profile.style.display = 'block';
  profile.innerHTML = `
    <div class="card">
      <div class="card-title">Risk profile</div>
      ${flags.map(f => `<div class="notif notif-${f.level === 'high' ? 'red' : 'amber'}" style="margin-bottom:6px">${f.msg}</div>`).join('')}
      ${score >= 5 ? '<div class="notif notif-green">Substantive fairness — majority of factors established in favour of employer.</div>' : ''}
      <div style="margin-top:10px;font-size:12px;color:var(--mg)">Suggested sanction range:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        ${sanction.map(s => `<span class="pill pill-bur">${s}</span>`).join('')}
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="navigate('findings')">Proceed to findings →</button>
      </div>
    </div>
  `;
  profile.scrollIntoView({ behavior: 'smooth' });
}

// ── FINDINGS ──────────────────────────────────────────────────
async function renderFindings() {
  const blocks = [
    { id: 'finding_guilt', label: 'Finding on guilt', placeholder: 'Having considered all the evidence and applying the balance of probabilities, I find the employee [GUILTY / NOT GUILTY] of the charge of [charge] because...' },
    { id: 'credibility', label: 'Credibility assessment', placeholder: 'The employer\'s witnesses were found credible in that... The employee\'s version was [credible / not credible] because...' },
    { id: 'mitigating', label: 'Mitigating factors', placeholder: 'The following mitigating factors were taken into account: length of service, clean record, personal circumstances...' },
    { id: 'aggravating', label: 'Aggravating factors', placeholder: 'The following aggravating factors were considered: prior warnings, severity of breach, breach of trust...' },
    { id: 'sanction_reason', label: 'Sanction reasoning', placeholder: 'Having weighed the mitigating and aggravating factors, and considering proportionality and consistency, I impose the following sanction because...' },
  ];

  document.getElementById('findings-blocks').innerHTML = blocks.map(b => `
    <div style="border-left:3px solid var(--bur);padding:10px 14px;background:var(--burl);border-radius:0 8px 8px 0;margin-bottom:10px">
      <div style="font-size:10px;font-weight:500;color:var(--bur);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">${b.label}</div>
      <textarea id="fb-${b.id}" rows="3" placeholder="${b.placeholder}" style="width:100%;border:none;background:transparent;font-size:13px;color:var(--dg);resize:vertical;line-height:1.6;font-family:Arial,sans-serif"></textarea>
    </div>
  `).join('');

  document.getElementById('finding-date').value = new Date().toISOString().split('T')[0];

  document.getElementById('finding-sanction').addEventListener('change', e => {
    const isDismissal = e.target.value.includes('dismissal');
    const notice = document.getElementById('ccma-deadline-notice');
    if (isDismissal) {
      const date = document.getElementById('finding-date').value;
      const deadline = date ? addDays(date, 30) : '30 days from today';
      notice.style.display = 'block';
      notice.className = 'notif notif-amber';
      notice.innerHTML = `<strong>CCMA referral deadline:</strong> The employee has 30 days from the date of dismissal to refer to the CCMA. Deadline: <strong>${formatDate(deadline)}</strong>. Verdiqt will track this automatically.`;
    } else {
      notice.style.display = 'none';
    }
  });

  document.getElementById('save-findings-btn').onclick = saveFindings;
}

async function saveFindings() {
  if (!currentCase) { showToast('No active case — please create or load a case first', 'error'); return; }
  const guilt = document.getElementById('finding-guilt').value;
  const sanction = document.getElementById('finding-sanction').value;
  if (!guilt || !sanction) { showToast('Please select a finding and sanction', 'error'); return; }

  currentCase.findings = {
    guilt, sanction,
    date: document.getElementById('finding-date').value,
    finding_guilt: document.getElementById('fb-finding_guilt')?.value,
    credibility: document.getElementById('fb-credibility')?.value,
    mitigating: document.getElementById('fb-mitigating')?.value,
    aggravating: document.getElementById('fb-aggravating')?.value,
    sanction_reason: document.getElementById('fb-sanction_reason')?.value,
  };
  currentCase.status = 'complete';
  await put('cases', currentCase);

  if (sanction.includes('dismissal')) {
    const deadline = addDays(currentCase.findings.date, 30);
    await put('ccma', {
      caseId: currentCase.id,
      caseRef: currentCase.ref,
      clientName: currentCase.clientName,
      empName: currentCase.empName,
      dismissalDate: currentCase.findings.date,
      deadline, status: 'active',
      charge: currentCase.charge,
      sanction
    });
    await updateBadges();
  }

  showToast('Findings saved');
  navigate('documents');
}

// ── DOCUMENTS ─────────────────────────────────────────────────
async function renderDocuments() {
  document.getElementById('approval-checklist').innerHTML = [
    'I have read the entire document and confirm it accurately reflects the evidence heard at the hearing.',
    'The finding on guilt is my own independent finding, reached on the balance of probabilities.',
    'The case law cited is relevant and I have satisfied myself as to its application to the facts.',
    'The sanction is proportionate and I have independently considered all mitigating and aggravating factors.',
    'The procedural compliance section is accurate — the hearing was conducted fairly.',
    'I understand that this document will form part of the official disciplinary record and may be reviewed by the CCMA.',
    'I accept sole professional responsibility for the contents of this document.',
  ].map(item => `
    <label class="check-item">
      <input type="checkbox" onchange="this.closest('.check-item').classList.toggle('checked', this.checked)"/>
      ${item}
    </label>
  `).join('');

  document.getElementById('approve-doc-btn').onclick = approveDocument;
}

window.generateDoc = async function(type) {
  if (!currentCase) { showToast('Load or create a case first', 'error'); return; }
  const aiKey = await getSetting('ai_key');
  const aiProvider = await getSetting('ai_provider') || 'anthropic';
  if (aiKey) {
    showToast('Generating AI draft...');
    await generateAIDraft(type, aiKey, aiProvider);
  } else {
    buildTemplateDraft(type);
  }
  document.getElementById('doc-draft-preview').style.display = 'block';
  document.getElementById('doc-draft-preview').scrollIntoView({ behavior: 'smooth' });
};

async function generateAIDraft(type, apiKey, provider) {
  const prompt = buildAIPrompt(type);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a South African labour law expert writing disciplinary hearing documents in CCMA award style. Always cite relevant South African case law. Calibrate to the Code of Good Practice: Dismissal (GG 53294, 4 September 2025). Write in formal legal English. Structure clearly with headings.`,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    document.getElementById('doc-preview-content').innerHTML = buildDocPreviewHTML(text, true);
    document.getElementById('doc-preview-content').classList.add('watermark');
  } catch (e) {
    showToast('AI generation failed — showing template draft', 'error');
    buildTemplateDraft(type);
  }
}

function buildAIPrompt(type) {
  const c = currentCase;
  if (!c) return '';
  return `Write a ${type.replace('_', ' ')} for the following disciplinary hearing:

EMPLOYER: ${c.clientName}
EMPLOYEE: ${c.empName}, ${c.empPos}, ${c.empService} service
CHARGE: ${c.charge}
PRIOR RECORD: ${c.priorRecord}
HEARING DATE: ${c.date}
CHAIRPERSON: ${c.chairperson}
FINDING: ${c.findings?.guilt || 'Guilty'}
SANCTION: ${c.findings?.sanction || 'Written warning'}

EMPLOYER'S EVIDENCE: ${c.step_notes_2 || 'As recorded in the hearing notes'}
EMPLOYEE'S VERSION: ${c.step_notes_3 || 'As recorded in the hearing notes'}
MITIGATING FACTORS: ${c.findings?.mitigating || 'To be completed'}
AGGRAVATING FACTORS: ${c.findings?.aggravating || 'To be completed'}
SANCTION REASONING: ${c.findings?.sanction_reason || 'To be completed'}

Format as a formal CCMA award-style document with:
1. Case particulars
2. Procedural fairness
3. Substantive fairness analysis (applying 2025 Code item 9 seven-factor test)
4. Credibility findings with reasoning
5. Finding on guilt
6. Sanction with proportionality analysis
7. Cite relevant case law including Sidumo v Rustenburg Platinum Mines (2007), Edcon v Pillemer (2010), and other applicable authorities
8. Disclaimer: "Produced with the assistance of Verdiqt — AI DRAFT — AWAITING CHAIRPERSON APPROVAL"`;
}

function buildTemplateDraft(type) {
  const c = currentCase || {};
  const content = `VERDIQT — DISCIPLINARY HEARING\n${type.replace('_', ' ').toUpperCase()}\n\nCase reference: ${c.ref || '[CASE REF]'}\nDate: ${formatDate(c.date)}\nEmployee: ${c.empName || '[EMPLOYEE]'}\nEmployer: ${c.clientName || '[EMPLOYER]'}\nCharge: ${c.charge || '[CHARGE]'}\n\nFINDING ON GUILT\n${c.findings?.finding_guilt || '[Finding to be completed]'}\n\nSANCTION\n${c.findings?.sanction || '[Sanction to be determined]'}\n\nSANCTION REASONING\n${c.findings?.sanction_reason || '[Reasoning to be completed]'}\n\nAI DRAFT — AWAITING CHAIRPERSON APPROVAL`;
  document.getElementById('doc-preview-content').innerHTML = buildDocPreviewHTML(content, true);
  document.getElementById('doc-preview-content').classList.add('watermark');
}

function buildDocPreviewHTML(text, isAI) {
  return text.split('\n').map(line => {
    if (!line.trim()) return '<br/>';
    if (line.match(/^[A-Z\s]+$/) && line.length < 60) return `<div style="font-size:12px;font-weight:500;color:var(--bur);margin:12px 0 4px;text-transform:uppercase;letter-spacing:0.5px;border-left:3px solid var(--bur);padding-left:8px">${line}</div>`;
    return `<div style="font-size:13px;line-height:1.7;margin-bottom:4px">${line}</div>`;
  }).join('');
}

async function approveDocument() {
  const checks = document.querySelectorAll('#approval-checklist input[type=checkbox]');
  const name = document.getElementById('approval-name').value.trim();
  const designation = document.getElementById('approval-designation').value.trim();
  const allChecked = Array.from(checks).every(c => c.checked);
  if (!allChecked) { showToast('Please confirm all attestation items', 'error'); return; }
  if (!name) { showToast('Please enter your full name', 'error'); return; }

  document.getElementById('doc-preview-content').classList.remove('watermark');
  if (currentCase) {
    currentCase.approvedBy = name;
    currentCase.approvedDesignation = designation;
    currentCase.approvedAt = Date.now();
    await put('cases', currentCase);
  }
  document.getElementById('share-card').style.display = 'block';
  showToast(`Document approved by ${name} — ready to save and share`);
}

window.shareDoc = function(method) {
  const actions = {
    device: () => showToast('In the full app: PDF saved to your chosen folder on this device'),
    drive: () => showToast('In the full app: Google Drive folder picker opens — you choose where to save'),
    email: () => { window.location.href = `mailto:?subject=Verdiqt Hearing Outcome — ${currentCase?.ref || ''}&body=Please find attached the disciplinary hearing outcome document.`; },
    whatsapp: () => { window.open(`https://wa.me/?text=Disciplinary hearing outcome for case ${currentCase?.ref || ''} — please contact the chairperson for the document.`); }
  };
  if (actions[method]) actions[method]();
};

// ── CCMA TRACKER ──────────────────────────────────────────────
async function renderCCMA() {
  const records = await getAll('ccma');
  const active = records.filter(r => r.status === 'active');
  const closed = records.filter(r => r.status !== 'active');

  const safe = active.filter(r => daysUntil(r.deadline) > 20).length;
  const amber = active.filter(r => { const d = daysUntil(r.deadline); return d <= 20 && d > 2; }).length;
  const danger = active.filter(r => daysUntil(r.deadline) <= 2).length;

  document.getElementById('ccma-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Active countdowns</div><div class="stat-value bur">${active.length}</div></div>
    <div class="stat-card"><div class="stat-label">Safe (20+ days)</div><div class="stat-value green">${safe}</div></div>
    <div class="stat-card"><div class="stat-label">Amber warning</div><div class="stat-value amber">${amber}</div></div>
    <div class="stat-card"><div class="stat-label">Red alert (≤2 days)</div><div class="stat-value red">${danger}</div></div>
  `;

  document.getElementById('ccma-active-list').innerHTML = active.length
    ? active.sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).map(r => buildCCMACard(r)).join('')
    : '<div class="notif notif-green">No active CCMA countdowns — all dismissal windows are closed or no dismissals recorded.</div>';

  document.getElementById('ccma-closed-list').innerHTML = closed.length
    ? closed.map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid var(--lg)">
        <div><div style="font-size:12px;font-weight:500">${r.caseRef} — ${r.empName}</div><div style="font-size:10px;color:var(--mg)">${r.clientName} · ${r.status === 'referred' ? 'CCMA referral received' : 'Window closed — no referral'}</div></div>
        <span class="pill pill-${r.status === 'referred' ? 'amber' : 'active'}">${r.status === 'referred' ? 'CCMA active' : 'Closed — safe'}</span>
      </div>
    `).join('')
    : '<div style="font-size:12px;color:var(--mg)">No closed cases yet.</div>';
}

function buildCCMACard(r) {
  const days = daysUntil(r.deadline);
  const cls = days <= 2 ? 'danger' : days <= 20 ? 'amber' : 'safe';
  const pct = Math.min(Math.round(((30 - days) / 30) * 100), 100);
  return `
    <div class="ccma-card ${cls}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div>
          <div style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${cls === 'danger' ? 'Red alert — act now' : cls === 'amber' ? 'Amber warning' : 'Within safe period'}</div>
          <div style="font-size:13px;font-weight:500">${r.caseRef} — ${r.empName}</div>
          <div style="font-size:11px;color:var(--mg);margin-top:2px">${r.clientName} · Dismissed: ${formatDate(r.dismissalDate)} · ${r.charge}</div>
        </div>
        <div style="text-align:right">
          <div class="ccma-countdown ${cls}">${days}</div>
          <div style="font-size:10px">days remaining</div>
          <div style="font-size:10px;color:var(--mg);margin-top:2px">Deadline: ${formatDate(r.deadline)}</div>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn" style="font-size:11px" onclick="alertEmployer('${r.caseId}')">Alert employer</button>
        <button class="btn" style="font-size:11px" onclick="markCCMA('${r.caseId}','referred')">Mark as referred</button>
        <button class="btn" style="font-size:11px" onclick="markCCMA('${r.caseId}','closed')">No referral received</button>
      </div>
    </div>
  `;
}

window.alertEmployer = async function(caseId) {
  const r = await get('ccma', caseId);
  if (!r) return;
  const msg = `Dear Client,\n\nPlease note that the 30-day CCMA referral window for ${r.empName} (case ${r.caseRef}) closes on ${formatDate(r.deadline)}.\n\nPlease advise whether a referral has been received from the employee.\n\nKind regards,\nVerdiqt Case Management`;
  window.location.href = `mailto:?subject=CCMA Referral Deadline Alert — ${r.caseRef}&body=${encodeURIComponent(msg)}`;
};

window.markCCMA = async function(caseId, status) {
  const r = await get('ccma', caseId);
  if (!r) return;
  r.status = status;
  await put('ccma', r);
  showToast(`Case marked as: ${status}`);
  renderCCMA();
  updateBadges();
};

// ── INVOICE ───────────────────────────────────────────────────
async function renderInvoice() {
  const mode = await getSetting('billing_mode') || 'invoice';
  const notice = document.getElementById('invoice-mode-notice');
  const form = document.getElementById('invoice-form-card');
  if (mode === 'org') {
    notice.className = 'notif notif-blue';
    notice.textContent = 'Employer organisation mode — invoice generation is disabled for this account. Change in Settings › Billing mode.';
    form.style.display = 'none';
    return;
  }
  notice.className = 'notif notif-bur';
  notice.textContent = 'Independent consultant mode — invoices are generated per hearing.';
  form.style.display = 'block';
  await populateClientSelect('inv-client');
  document.getElementById('inv-date').value = new Date().toISOString().split('T')[0];
  calcInvoice();
}

window.calcInvoice = function() {
  const rows = document.querySelectorAll('#invoice-items tr');
  let total = 0;
  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('input[type=number]:nth-of-type(1)')?.value || 0);
    const rate = parseFloat(row.querySelector('input[type=number]:nth-of-type(2)')?.value || 0);
    const amount = qty * rate;
    total += amount;
    const cell = row.querySelector('.line-total');
    if (cell) cell.textContent = 'R ' + amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 });
  });
  const el = document.getElementById('invoice-total');
  if (el) el.textContent = 'R ' + total.toLocaleString('en-ZA', { minimumFractionDigits: 2 });
};

window.generateInvoice = () => showToast('Invoice PDF generation — connect your PDF library in the full deployment');
window.emailInvoice = () => { window.location.href = `mailto:?subject=Invoice — Verdiqt Hearing Services&body=Please find attached your invoice.`; };
window.whatsappInvoice = () => { window.open('https://wa.me/?text=Your invoice for disciplinary hearing services is attached. Please contact me if you have any questions.'); };

// ── SETTINGS ──────────────────────────────────────────────────
async function loadSettings() {
  const keys = ['s-practice','s-name','s-email','s-phone','s-bank','s-acc','s-branch','s-acctype','s-rate-half','s-rate-full','s-rate-report','s-rate-letter','s-rate-travel','s-rate-consult','s-billing-mode','s-licence'];
  for (const k of keys) {
    const val = await getSetting(k);
    const el = document.getElementById(k);
    if (el && val) el.value = val;
  }
  const ver = document.getElementById('s-content-ver');
  if (ver && CONTENT) ver.value = CONTENT.version;
  const status = document.getElementById('s-sub-status');
  const sub = await getSetting('live_update_active');
  if (status) status.value = sub ? 'LiveUpdate — active' : 'No LiveUpdate subscription';
}

async function renderSettings() {
  await loadSettings();
  document.getElementById('save-settings-btn').onclick = saveSettings;
  document.getElementById('backup-btn').onclick = backupData;
  document.getElementById('restore-btn').onclick = () => document.getElementById('restore-input').click();
  document.getElementById('restore-input').addEventListener('change', restoreData);
}

async function saveSettings() {
  const keys = ['s-practice','s-name','s-email','s-phone','s-bank','s-acc','s-branch','s-acctype','s-rate-half','s-rate-full','s-rate-report','s-rate-letter','s-rate-travel','s-rate-consult','s-billing-mode','s-licence'];
  for (const k of keys) {
    const el = document.getElementById(k);
    if (el) await setSetting(k, el.value);
  }
  await setSetting('billing_mode', document.getElementById('s-billing-mode').value);
  showToast('Settings saved');
}

async function backupData() {
  const data = await exportAllData();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `verdiqt-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported');
}

async function restoreData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      await importData(ev.target.result);
      showToast('Backup restored successfully');
      renderDashboard();
    } catch { showToast('Restore failed — invalid backup file', 'error'); }
  };
  reader.readAsText(file);
}

// ── AI SETTINGS ────────────────────────────────────────────────
async function renderAISettings() {
  const key = await getSetting('ai_key');
  const provider = await getSetting('ai_provider');
  if (key) document.getElementById('ai-key').value = key;
  if (provider) document.getElementById('ai-provider').value = provider;

  document.getElementById('save-ai-btn').onclick = async () => {
    await setSetting('ai_key', document.getElementById('ai-key').value.trim());
    await setSetting('ai_provider', document.getElementById('ai-provider').value);
    showToast('AI settings saved');
  };

  document.getElementById('test-ai-btn').onclick = async () => {
    const k = document.getElementById('ai-key').value.trim();
    if (!k) { showToast('Enter an API key first', 'error'); return; }
    showToast('Testing connection...');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 10, messages: [{ role: 'user', content: 'Hello' }] })
      });
      if (res.ok) showToast('AI connection successful');
      else showToast('Connection failed — check your API key', 'error');
    } catch { showToast('Connection failed — check your internet connection', 'error'); }
  };
}

// ── HELPERS ────────────────────────────────────────────────────
async function populateClientSelect(id) {
  const clients = await getAll('clients');
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">Select client</option>' +
    clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function formatDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d)) return val;
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysUntil(dateStr) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.ceil((target - now) / 86400000);
}

function statusPill(status) {
  return { active: 'amber', complete: 'active', draft: 'grey', locked: 'bur' }[status] || 'grey';
}

function initials(name) {
  return name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'XX';
}

function fileIcon(name) {
  const ext = name?.split('.').pop().toLowerCase();
  return { pdf: 'PDF', doc: 'DOC', docx: 'DOC', jpg: 'IMG', jpeg: 'IMG', png: 'IMG', tiff: 'IMG', xlsx: 'XLS' }[ext] || 'DOC';
}

// ── START ──────────────────────────────────────────────────────
boot();

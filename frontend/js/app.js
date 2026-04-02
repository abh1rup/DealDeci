// ── DealDeci Pitch Decimator — Frontend ──

const PERSONAS = {
  'silicon-valley':       { label: 'Silicon Valley VC',       icon: '\u{1F680}' },
  'southeast-angel':      { label: 'Southeast Angel',         icon: '\u{1F91D}' },
  'university-vc':        { label: 'University Judge',        icon: '\u{1F393}' },
  'traditional-business': { label: 'Traditional Businessman', icon: '\u{1F4BC}' },
  'impact-investor':      { label: 'Impact Investor',         icon: '\u{1F30D}' },
  'serial-founder':       { label: 'Serial Founder',          icon: '\u26A1' },
  'corporate-vc':         { label: 'Corporate VC (CVC)',      icon: '\u{1F3E2}' },
  'pe-growth':            { label: 'PE / Growth Equity',      icon: '\u{1F4C8}' },
  'deep-tech':            { label: 'Deep Tech Investor',      icon: '\u{1F52C}' },
  'family-office':        { label: 'Family Office',           icon: '\u{1F6E1}\uFE0F' },
  'emerging-market':      { label: 'Emerging Markets VC',     icon: '\u{1F5FA}\uFE0F' },
  'fintech-specialist':   { label: 'Fintech Specialist',      icon: '\u{1F3E6}' },
};

let currentUser = null;
let analysisResults = [];
let activePersonaTab = null;
let selectedFile = null;
let sessionHistory = [];

// ── Default settings ─��
const DEFAULT_SETTINGS = {
  model: 'claude-haiku-4-5-20251001',
  depth: 'standard',
  strictness: 'balanced',
  autoEnhance: false,
  enabledPersonas: Object.keys(PERSONAS),
};

let settings = { ...DEFAULT_SETTINGS };

// ══════════════════════════════════════
// ── Init ──
// ══════════════════���═══════════════════
document.addEventListener('DOMContentLoaded', async () => {
  loadSettings();
  loadTheme();
  loadFontScale();
  buildPersonaToggles();
  buildAgentSelector();
  await checkAuth();
  setupUpload();
  loadSavedFiles();
  loadSaveFolder();
});

// ═══════════════════════════════════���══
// ── Auth (local admin) ─��
// ═════════════��════════════════════════
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const { user } = await res.json();
    currentUser = user;
    updateAuthUI();
  } catch {
    currentUser = null;
    updateAuthUI();
  }
}

function updateAuthUI() {
  const authArea = document.getElementById('authArea');
  if (currentUser) {
    authArea.innerHTML = `
      <div class="user-info">
        <div class="user-avatar-placeholder">${currentUser.name.charAt(0).toUpperCase()}</div>
        <span class="user-name">${currentUser.name}</span>
      </div>
      <button class="btn btn-outline btn-sm" onclick="logout()">Sign Out</button>`;
  } else {
    authArea.innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="openLogin()">Sign In</button>`;
  }
}

function openLogin() {
  document.getElementById('loginOverlay').classList.add('open');
  setTimeout(() => document.getElementById('loginUser').focus(), 100);
}

function closeLogin() {
  document.getElementById('loginOverlay').classList.remove('open');
  document.getElementById('loginError').textContent = '';
}

async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  if (!username || !password) {
    errorEl.textContent = 'Please enter username and password.';
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errorEl.textContent = err.error || 'Login failed.';
      return;
    }

    const { user } = await res.json();
    currentUser = user;
    updateAuthUI();
    closeLogin();
  } catch {
    errorEl.textContent = 'Connection error.';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  updateAuthUI();
}

// Handle Enter key in login form
function loginKeydown(e) {
  if (e.key === 'Enter') doLogin();
}

// ═══════��══════════════════════════════
// ── Sidebar ─��
// ══════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function updateSidebarHistory() {
  // Update from in-session history
  const list = document.getElementById('historyList');
  if (sessionHistory.length === 0) {
    list.innerHTML = '<div class="history-empty">No analyses yet. Upload a pitch to get started.</div>';
  } else {
    list.innerHTML = sessionHistory.map((h, i) => {
      const cls = h.avgScore >= 70 ? 'score-high' : h.avgScore >= 45 ? 'score-mid' : 'score-low';
      return `<div class="history-item" onclick="loadHistory(${i})">
        <span class="history-item-name">${escapeHtml(h.fileName)}</span>
        <span class="history-item-score ${cls}">${h.avgScore}</span>
      </div>`;
    }).join('');
  }

  document.getElementById('statTotal').textContent = sessionHistory.length;
  const avg = sessionHistory.length > 0
    ? Math.round(sessionHistory.reduce((a, h) => a + h.avgScore, 0) / sessionHistory.length)
    : 0;
  document.getElementById('statAvg').textContent = sessionHistory.length > 0 ? avg : '--';
  document.getElementById('statEnhanced').textContent = sessionHistory.filter(h => h.enhanced).length;

  // Also load persisted run history from server
  loadPersistedRuns();
}

async function loadPersistedRuns() {
  try {
    const res = await fetch('/api/runs');
    const { runs } = await res.json();
    const el = document.getElementById('statTotal');
    if (el && runs.length > sessionHistory.length) {
      el.textContent = runs.length;
      const totalAvg = Math.round(runs.reduce((s, r) => s + (r.avgScore || 0), 0) / runs.length);
      document.getElementById('statAvg').textContent = totalAvg;
    }
  } catch { /* ignore */ }
}

function loadHistory(index) {
  const h = sessionHistory[index];
  if (h && h.results) {
    analysisResults = h.results;
    renderResults();
    toggleSidebar();
  }
}

async function loadSavedFiles() {
  try {
    const res = await fetch('/api/files');
    const { files } = await res.json();
    const list = document.getElementById('savedFilesList');
    if (!list) return;
    if (files.length === 0) {
      list.innerHTML = '<div class="history-empty">No saved files yet.</div>';
      return;
    }
    list.innerHTML = files.slice(0, 10).map(f => `
      <a class="history-item" href="${f.url}" target="_blank" style="text-decoration:none;">
        <span class="history-item-name">${f.name}</span>
      </a>`).join('');
  } catch { /* ignore */ }
}

// ═══��════════════════════════════════��═
// ── Settings ──
// ═══════════════════��══════════════════
function loadSettings() {
  try {
    const saved = localStorage.getItem('dealdeci-settings');
    if (saved) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch { /* use defaults */ }
  applySettingsToUI();
}

function applySettingsToUI() {
  const el = (id) => document.getElementById(id);
  if (el('settingModel')) el('settingModel').value = settings.model;
  if (el('settingDepth')) el('settingDepth').value = settings.depth;
  if (el('settingStrictness')) el('settingStrictness').value = settings.strictness;
  if (el('settingAutoEnhance')) el('settingAutoEnhance').checked = settings.autoEnhance;
}

function buildPersonaToggles() {
  const container = document.getElementById('personaToggles');
  if (!container) return;
  container.innerHTML = Object.entries(PERSONAS).map(([key, p]) => {
    const checked = settings.enabledPersonas.includes(key) ? 'checked' : '';
    return `<label class="persona-toggle-item">
      <input type="checkbox" value="${key}" ${checked}>
      ${p.icon} ${p.label}
    </label>`;
  }).join('');
}

function openSettings() {
  applySettingsToUI();
  buildPersonaToggles();
  document.getElementById('settingsOverlay').classList.add('open');
}

function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('open');
}

function saveSettings() {
  settings.model = document.getElementById('settingModel').value;
  settings.depth = document.getElementById('settingDepth').value;
  settings.strictness = document.getElementById('settingStrictness').value;
  settings.autoEnhance = document.getElementById('settingAutoEnhance').checked;

  const checkboxes = document.querySelectorAll('#personaToggles input[type="checkbox"]');
  settings.enabledPersonas = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
  if (settings.enabledPersonas.length === 0) {
    settings.enabledPersonas = ['silicon-valley'];
    buildPersonaToggles();
  }

  localStorage.setItem('dealdeci-settings', JSON.stringify(settings));
  closeSettings();
}

function resetSettings() {
  settings = { ...DEFAULT_SETTINGS };
  applySettingsToUI();
  buildPersonaToggles();
  buildAgentSelector();
}

// ══════════════════════════════════════
// ── Agent Selector (main UI) ──
// ══════════════════════════════════════
function buildAgentSelector() {
  const container = document.getElementById('agentSelector');
  if (!container) return;
  container.innerHTML = Object.entries(PERSONAS).map(([key, p]) => {
    const checked = settings.enabledPersonas.includes(key) ? 'checked' : '';
    return `<label class="agent-select-chip ${checked ? 'selected' : ''}" data-key="${key}">
      <input type="checkbox" value="${key}" ${checked} onchange="updateAgentSelection(this)">
      <span class="agent-select-icon">${p.icon}</span>
      <span class="agent-select-label">${p.label}</span>
    </label>`;
  }).join('');
  updateAgentCountBadge();
}

function updateAgentSelection(checkbox) {
  const chip = checkbox.closest('.agent-select-chip');
  chip.classList.toggle('selected', checkbox.checked);
  // Sync to settings
  const checkboxes = document.querySelectorAll('#agentSelector input[type="checkbox"]');
  settings.enabledPersonas = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
  if (settings.enabledPersonas.length === 0) {
    settings.enabledPersonas = ['silicon-valley'];
    checkbox.checked = false;
    buildAgentSelector();
  }
  localStorage.setItem('dealdeci-settings', JSON.stringify(settings));
  updateAgentCountBadge();
}

function selectAllAgents() {
  settings.enabledPersonas = Object.keys(PERSONAS);
  localStorage.setItem('dealdeci-settings', JSON.stringify(settings));
  buildAgentSelector();
}

function deselectAllAgents() {
  settings.enabledPersonas = ['silicon-valley'];
  localStorage.setItem('dealdeci-settings', JSON.stringify(settings));
  buildAgentSelector();
}

function updateAgentCountBadge() {
  const badge = document.getElementById('agentCountBadge');
  if (badge) badge.textContent = `${settings.enabledPersonas.length} selected`;
}

// ══════════════════════════════════════
// ── Save Folder ──
// ══════════════════════════════════════
async function loadSaveFolder() {
  try {
    const res = await fetch('/api/save-folder');
    const { folder } = await res.json();
    document.getElementById('saveFolderPath').textContent = folder;
  } catch {
    document.getElementById('saveFolderPath').textContent = '(unknown)';
  }
}

async function changeSaveFolder() {
  const current = document.getElementById('saveFolderPath').textContent;
  const newFolder = prompt('Enter the full path for the save folder:', current);
  if (!newFolder || newFolder === current) return;
  try {
    const res = await fetch('/api/save-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: newFolder }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed');
    }
    const { folder } = await res.json();
    document.getElementById('saveFolderPath').textContent = folder;
  } catch (err) {
    showError(err.message);
  }
}

// ══════════════════════════════════════
// ── File Upload ──
// ══════════════════════════════════════
function setupUpload() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });
}

function handleFile(file) {
  const allowed = ['.pptx', '.ppt', '.docx', '.doc'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showError('Unsupported file format. Please upload PPTX or DOCX.');
    return;
  }
  selectedFile = file;
  document.getElementById('dropZone').classList.add('has-file');
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('launchBtn').disabled = false;
  hideError();
}

// ══════════════════════════════════════
// ��─ Analysis ──
// ════════════════════��═════════════════
async function runAnalysis() {
  if (!selectedFile) return;

  const btn = document.getElementById('launchBtn');
  const context = document.getElementById('contextInput').value.trim();

  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = 'AGENTS ACTIVATED...';
  hideError();
  showProgress();

  const formData = new FormData();
  formData.append('deck', selectedFile);
  if (context) formData.append('context', context);
  formData.append('settings', JSON.stringify({
    model: settings.model,
    depth: settings.depth,
    strictness: settings.strictness,
    enabledPersonas: settings.enabledPersonas,
  }));

  try {
    const res = await fetch('/api/analyze', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${res.status}`);
    }

    const data = await res.json();
    analysisResults = data.results || [];

    if (analysisResults.length === 0) throw new Error('No persona results returned. Check your API key.');

    completeProgress();

    const avgScore = Math.round(analysisResults.reduce((a, r) => a + (r.data?.scores?.overall || 0), 0) / analysisResults.length);
    sessionHistory.unshift({
      fileName: selectedFile.name, avgScore, results: analysisResults, enhanced: false, timestamp: new Date().toISOString(),
    });
    updateSidebarHistory();

    setTimeout(() => {
      hideProgress();
      renderResults();
      if (settings.autoEnhance) setTimeout(() => enhancePitch(), 500);
    }, 600);
  } catch (err) {
    hideProgress();
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = 'DECIMATE THE PITCH';
  }
}

// ══════════════════════════════════════
// ── Progress ──
// ════════════════════��═════════════════
function showProgress() {
  const section = document.getElementById('progressSection');
  const grid = document.getElementById('agentGrid');
  section.classList.add('show');

  const enabled = settings.enabledPersonas || Object.keys(PERSONAS);
  grid.innerHTML = enabled.map((key) => {
    const p = PERSONAS[key];
    return p ? `<div class="agent-chip running" id="agent-${key}"><div class="dot"></div>${p.icon} ${p.label}</div>` : '';
  }).join('');

  document.getElementById('progressFill').style.width = '15%';
  let pct = 15;
  window._progressInterval = setInterval(() => {
    pct = Math.min(pct + Math.random() * 10, 90);
    document.getElementById('progressFill').style.width = pct + '%';
  }, 800);
}

function completeProgress() {
  clearInterval(window._progressInterval);
  document.getElementById('progressFill').style.width = '100%';
  document.querySelectorAll('.agent-chip').forEach((chip) => {
    chip.classList.remove('running');
    chip.classList.add('done');
  });
}

function hideProgress() {
  document.getElementById('progressSection').classList.remove('show');
}

// ═════��═════════════════════════���══════
// ── Render Results ──
// ═════════════════���════════════════════
function renderResults() {
  const section = document.getElementById('resultsSection');
  section.classList.add('show');

  // Aggregate scores across ALL agents
  renderAggregateScores();

  document.getElementById('personaTabs').innerHTML = analysisResults.map((r, i) =>
    `<button class="persona-tab ${i === 0 ? 'active' : ''}" onclick="switchTab(${i})">${PERSONAS[r.persona]?.icon || ''} ${r.label}</button>`
  ).join('');

  activePersonaTab = 0;
  renderPersonaResult(0);
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
}

function renderAggregateScores() {
  const n = analysisResults.length;
  if (n === 0) return;

  const avg = (key) => Math.round(analysisResults.reduce((sum, r) => sum + (r.data?.scores?.[key] || 0), 0) / n);

  const scores = [
    { label: 'Overall', value: avg('overall') },
    { label: 'Market', value: avg('market') },
    { label: 'Defensibility', value: avg('defensibility') },
    { label: 'Traction', value: avg('traction') },
  ];

  const el = document.getElementById('aggregateScorecard');
  if (!el) return;
  el.innerHTML = scores.map((s) => {
    const cls = s.value >= 70 ? 'score-high' : s.value >= 45 ? 'score-mid' : 'score-low';
    const verdict = s.value >= 70 ? 'Strong' : s.value >= 45 ? 'Needs Work' : 'Vulnerable';
    return `<div class="score-cell aggregate">
      <div class="score-label">${s.label}</div>
      <div class="score-value ${cls}">${s.value}</div>
      <div class="score-verdict ${cls}">${verdict}</div>
      <div class="score-agents">${n} agents</div>
    </div>`;
  }).join('');
}

function switchTab(index) {
  activePersonaTab = index;
  document.querySelectorAll('.persona-tab').forEach((t, i) => t.classList.toggle('active', i === index));
  renderPersonaResult(index);
}

function renderPersonaResult(index) {
  const r = analysisResults[index];
  if (!r) return;
  const d = r.data;

  const scores = [
    { label: 'Overall', value: d.scores.overall },
    { label: 'Market', value: d.scores.market },
    { label: 'Defensibility', value: d.scores.defensibility },
    { label: 'Traction', value: d.scores.traction },
  ];

  document.getElementById('scorecard').innerHTML = scores.map((s) => {
    const cls = s.value >= 70 ? 'score-high' : s.value >= 45 ? 'score-mid' : 'score-low';
    const verdict = s.value >= 70 ? 'Strong' : s.value >= 45 ? 'Needs Work' : 'Vulnerable';
    return `<div class="score-cell">
      <div class="score-label">${s.label}</div>
      <div class="score-value ${cls}">${s.value}</div>
      <div class="score-verdict ${cls}">${verdict}</div>
    </div>`;
  }).join('');

  document.getElementById('vulnList').innerHTML = (d.vulnerabilities || []).map((v) => {
    const sevClass = v.severity === 'CRITICAL' ? 'sev-critical' : v.severity === 'HIGH' ? 'sev-high' : 'sev-medium';
    return `<div class="vuln-item">
      <div class="vuln-severity ${sevClass}">${v.severity}</div>
      <div class="vuln-title">${escapeHtml(v.title)}</div>
      <div class="vuln-desc">${escapeHtml(v.description)}</div>
    </div>`;
  }).join('');

  document.getElementById('qaList').innerHTML = (d.questions || []).map((q, i) => `
    <div class="qa-item" id="qa-${index}-${i}">
      <div class="qa-question" onclick="toggleQA('qa-${index}-${i}')">
        <div class="qa-q-label">Q${i + 1}</div>
        <div class="qa-q-text">${escapeHtml(q.question)}</div>
        <div class="qa-toggle">\u25BE</div>
      </div>
      <div class="qa-answer">
        <div class="qa-a-label">Suggested Response</div>
        <div class="qa-a-text">${escapeHtml(q.response)}</div>
      </div>
    </div>`).join('');

  // Recommendations
  const recList = document.getElementById('recList');
  const recs = d.recommendations || [];
  if (recs.length > 0) {
    document.getElementById('recSection').style.display = 'block';
    recList.innerHTML = recs.map((rec, i) => `
      <div class="rec-item" id="rec-${index}-${i}">
        <div class="rec-content">
          <div class="rec-num">R${i + 1}</div>
          <div class="rec-body">
            <div class="rec-title">${escapeHtml(rec.title)}</div>
            <div class="rec-desc">${escapeHtml(rec.description)}</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm rec-apply-btn" onclick="applyRecommendation(${index}, ${i})">Apply</button>
      </div>`).join('');
  } else {
    document.getElementById('recSection').style.display = 'none';
  }
}

function toggleQA(id) {
  document.getElementById(id).classList.toggle('open');
}

// ── Apply a recommendation → versioned document ──
async function applyRecommendation(personaIndex, recIndex) {
  const r = analysisResults[personaIndex];
  if (!r) return;
  const rec = r.data.recommendations[recIndex];
  if (!rec) return;

  const btn = document.querySelector(`#rec-${personaIndex}-${recIndex} .rec-apply-btn`);
  btn.disabled = true;
  btn.textContent = 'Applying...';

  try {
    const res = await fetch('/api/apply-recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendation: rec, persona: r.label }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to apply');
    }

    const { version, files, folder, format } = await res.json();
    btn.textContent = `V${version} Saved`;
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-outline');

    // Show download links + folder path
    const item = document.getElementById(`rec-${personaIndex}-${recIndex}`);
    const links = document.createElement('div');
    links.className = 'rec-files';
    links.innerHTML = files.map(f =>
      `<a href="${f.url}" target="_blank" class="rec-file-link">${f.name}</a>`
    ).join('') + `<span class="rec-folder-info">Saved to: ${escapeHtml(folder)}</span>`;
    item.appendChild(links);

    loadSavedFiles();
  } catch (err) {
    btn.textContent = 'Failed';
    showError(err.message);
  }
}

// ═══════════════��══════════════════════
// ── Enhance Pitch ──
// ══════════════════════════════════════
async function enhancePitch() {
  const btn = document.getElementById('enhanceBtn');
  const feedback = document.getElementById('enhanceFeedback')?.value || '';

  btn.disabled = true;
  btn.textContent = 'ENHANCING...';

  try {
    const res = await fetch('/api/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Enhancement failed');
    }

    const data = await res.json();
    renderEnhancement(data);

    if (sessionHistory.length > 0) {
      sessionHistory[0].enhanced = true;
      updateSidebarHistory();
    }
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ENHANCE MY PITCH';
  }
}

function renderEnhancement(data) {
  const resultDiv = document.getElementById('enhanceResult');
  resultDiv.classList.add('show');

  let html = `<div class="enhance-summary">${escapeHtml(data.summary)}</div>`;

  (data.sections || []).forEach((s) => {
    html += `<div class="enhance-change">
      <div class="enhance-change-title">${escapeHtml(s.title)}</div>
      <div class="enhance-change-original">${escapeHtml(s.original)}</div>
      <div class="enhance-change-improved">${escapeHtml(s.improved)}</div>
      <div class="enhance-change-rationale">${escapeHtml(s.rationale)}</div>
    </div>`;
  });

  html += `<div class="drive-actions">
    <a href="/api/download?format=html" class="btn btn-outline btn-sm" download>Download HTML</a>
    <a href="/api/download?format=txt" class="btn btn-outline btn-sm" download>Download TXT</a>
    <button class="btn btn-primary btn-sm" onclick="saveLocally()">Save to Project</button>
  </div>`;

  resultDiv.innerHTML = html;
  resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═════���════════════════════════════════
// ── Save locally ──
// ══════════════════════════════════════
async function saveLocally() {
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Save failed');
    }

    const { files } = await res.json();
    const driveActions = document.querySelector('.drive-actions');
    driveActions.innerHTML = files.map(f =>
      `<a href="${f.url}" target="_blank" class="btn btn-outline btn-sm">${f.name}</a>`
    ).join('') + `<span style="font-size:0.78rem;color:var(--success);">Saved to output/ folder</span>`;

    // Refresh sidebar saved files
    loadSavedFiles();
  } catch (err) {
    showError(err.message);
  }
}

// ═══════════════���══════════════════════
// ── Reset ──
// ��═════════════════════════════════════
function resetApp() {
  selectedFile = null;
  analysisResults = [];
  document.getElementById('fileInput').value = '';
  document.getElementById('dropZone').classList.remove('has-file');
  document.getElementById('fileName').textContent = '';
  document.getElementById('contextInput').value = '';
  document.getElementById('resultsSection').classList.remove('show');
  document.getElementById('launchBtn').disabled = true;
  document.getElementById('launchBtn').textContent = 'DECIMATE THE PITCH';
  const enhanceResult = document.getElementById('enhanceResult');
  if (enhanceResult) { enhanceResult.classList.remove('show'); enhanceResult.innerHTML = ''; }
  hideError();
  hideProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═════��════════════════════════════════
// ── Utils ──
// ��═════════════════════════════════════
function showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent = msg;
  box.classList.add('show');
}

function hideError() {
  document.getElementById('errorBox').classList.remove('show');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ══════════════════════════════════════
// ── Theme (Dark / Light) ──
// ══════════════════════════════════════
function loadTheme() {
  const saved = localStorage.getItem('dealdeci-theme');
  if (saved === 'light') document.body.classList.add('light-mode');
}

function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem('dealdeci-theme', isLight ? 'light' : 'dark');
}

// ══════════════════════════════════════
// ── Font Size ──
// ══════════════════════════════════════
let fontScale = 1;
const FONT_MIN = 0.8;
const FONT_MAX = 1.4;
const FONT_STEP = 0.1;

function loadFontScale() {
  const saved = parseFloat(localStorage.getItem('dealdeci-font-scale'));
  if (saved && saved >= FONT_MIN && saved <= FONT_MAX) fontScale = saved;
  applyFontScale();
}

function increaseFontSize() {
  fontScale = Math.min(fontScale + FONT_STEP, FONT_MAX);
  applyFontScale();
}

function decreaseFontSize() {
  fontScale = Math.max(fontScale - FONT_STEP, FONT_MIN);
  applyFontScale();
}

function applyFontScale() {
  document.documentElement.style.setProperty('--font-scale', fontScale);
  localStorage.setItem('dealdeci-font-scale', fontScale);
}

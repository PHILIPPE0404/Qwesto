'use strict';
const $ = id => document.getElementById(id);
let config = { split: { member: 60, platform: 40 } };
let currentUser = null;

function money(cents) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format((Number(cents) || 0) / 100);
}
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function text(id, value) { $(id).textContent = value == null ? '' : String(value); }
function setError(id, message) { text(id, message); show(id); }
function clearError(id) { text(id, ''); hide(id); }
async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Erreur ${response.status}`);
    error.code = body.code;
    throw error;
  }
  return body;
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR');
}
function showLogin() {
  ['passwordPanel', 'adminPanel', 'memberPanel'].forEach(hide);
  show('loginPanel');
  hide('logoutBtn');
  text('connectionLabel', 'Hors connexion');
  text('pageTitle', 'Bienvenue sur Qwesto');
  text('pageSub', 'Connecte-toi à ton espace de démonstration.');
}
function showPasswordChange() {
  hide('loginPanel'); hide('adminPanel'); hide('memberPanel'); show('passwordPanel');
  show('logoutBtn');
  text('pageTitle', 'Première connexion');
  text('pageSub', 'Change ton mot de passe temporaire.');
}
async function checkSession() {
  const data = await api('/api/me');
  if (!data.user) return showLogin();
  currentUser = data.user;
  if (currentUser.role === 'member' && currentUser.mustChangePassword) return showPasswordChange();
  hide('loginPanel'); hide('passwordPanel'); show('logoutBtn');
  text('connectionLabel', currentUser.role === 'admin' ? 'Administrateur connecté' : 'Membre connecté');
  if (currentUser.role === 'admin') {
    show('adminPanel'); hide('memberPanel');
    text('pageTitle', 'Espace administrateur');
    text('pageSub', 'Gestion des comptes de test et des simulations.');
    await loadAdmin();
  } else {
    hide('adminPanel'); show('memberPanel');
    text('pageTitle', `Bonjour ${currentUser.name || currentUser.username}`);
    text('pageSub', 'Espace membre de démonstration.');
    text('memberWelcome', `Bienvenue, ${currentUser.name || currentUser.username}`);
    await loadMember();
  }
}
async function loadConfig() {
  config = await api('/api/config');
  const member = config.split.member;
  const platform = config.split.platform;
  text('memberPercentLabel', `${member} % de démonstration`);
  text('platformPercentLabel', `${platform} % de démonstration`);
  text('memberSplitLabel', `${member} % du montant fictif`);
  const userBar = document.querySelector('.split-user');
  const platformBar = document.querySelector('.split-platform');
  if (userBar) userBar.style.width = `${member}%`;
  if (platformBar) platformBar.style.width = `${platform}%`;
  const legend = document.querySelector('.split-legend');
  if (legend) legend.innerHTML = `<span><i class="dot user-dot"></i> Membre <b>${member} %</b></span><span><i class="dot platform-dot"></i> Plateforme <b>${platform} %</b></span>`;
}
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); clearError('loginError');
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: $('username').value, password: $('password').value }) });
    currentUser = data.user;
    await checkSession();
  } catch (error) { setError('loginError', error.message); }
});
$('changePasswordForm').addEventListener('submit', async event => {
  event.preventDefault(); clearError('passwordError');
  const password = $('newPassword').value;
  if (password !== $('confirmPassword').value) return setError('passwordError', 'Les deux mots de passe ne correspondent pas.');
  try {
    await api('/api/change-password', { method: 'POST', body: JSON.stringify({ password }) });
    $('newPassword').value = ''; $('confirmPassword').value = '';
    await checkSession();
  } catch (error) { setError('passwordError', error.message); }
});
$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  currentUser = null; showLogin();
});
$('createMemberForm').addEventListener('submit', async event => {
  event.preventDefault();
  const result = $('createResult'); result.classList.remove('hidden', 'error-result'); result.textContent = 'Création en cours…';
  const payload = {
    fullName: $('memberName').value,
    username: $('memberUsername').value,
    tempPassword: $('memberTempPassword').value
  };
  try {
    const data = await api('/api/admin/members', { method: 'POST', body: JSON.stringify(payload) });
    result.textContent = `Compte créé : ${data.member.username}. Donne le mot de passe temporaire au membre par un canal privé. Il devra le changer dès sa première connexion.`;
    $('createMemberForm').reset();
    await loadAdmin();
  } catch (error) {
    result.textContent = error.message; result.classList.add('error-result');
  }
});
$('refreshAdmin').addEventListener('click', () => loadAdmin().catch(error => alert(error.message)));
async function loadAdmin() {
  const data = await api('/api/admin/overview');
  text('adminGross', money(data.totals.gross));
  text('adminMembers', money(data.totals.members));
  text('adminPlatform', money(data.totals.platform));
  text('adminTransactions', data.totals.transactions);
  text('memberCount', `${data.members.length} compte(s) de test`);
  const membersTable = $('membersTable'); membersTable.replaceChildren();
  if (!data.members.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5; cell.className = 'empty-cell'; cell.textContent = 'Aucun membre. Crée ton premier compte de test ci-dessus.'; row.append(cell); membersTable.append(row);
  }
  for (const member of data.members) {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = member.full_name;
    const username = document.createElement('td'); username.textContent = member.username;
    const amount = document.createElement('td'); amount.textContent = money(member.member_cents);
    const status = document.createElement('td'); status.textContent = member.active ? 'Actif' : 'Désactivé';
    const action = document.createElement('td');
    const button = document.createElement('button'); button.className = 'btn ghost small'; button.type = 'button'; button.textContent = member.active ? 'Désactiver' : 'Réactiver';
    button.addEventListener('click', async () => {
      try { await api(`/api/admin/members/${encodeURIComponent(member.id)}/status`, { method: 'PATCH', body: JSON.stringify({ active: !member.active }) }); await loadAdmin(); }
      catch (error) { alert(error.message); }
    });
    action.append(button); row.append(name, username, amount, status, action); membersTable.append(row);
  }
  const recentTable = $('recentTable'); recentTable.replaceChildren();
  if (!data.recent.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5; cell.className = 'empty-cell'; cell.textContent = 'Aucune simulation pour le moment.'; row.append(cell); recentTable.append(row);
  }
  for (const item of data.recent) {
    const row = document.createElement('tr');
    for (const value of [item.full_name, item.survey_title, money(item.gross_cents), money(item.member_cents), formatDate(item.created_at)]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    recentTable.append(row);
  }
}
async function loadMember() {
  const [summary, surveys] = await Promise.all([api('/api/member/summary'), api('/api/demo/surveys')]);
  text('memberBalance', money(summary.summary.member));
  text('memberGross', money(summary.summary.gross));
  text('memberTransactions', summary.summary.transactions);
  const grid = $('surveyGrid'); grid.replaceChildren();
  for (const survey of surveys.surveys) {
    const card = document.createElement('article'); card.className = 'survey-card';
    const badge = document.createElement('span'); badge.className = 'survey-badge'; badge.textContent = 'EXEMPLE FICTIF';
    const title = document.createElement('h3'); title.textContent = survey.title;
    const description = document.createElement('p'); description.textContent = survey.description;
    const meta = document.createElement('div'); meta.className = 'survey-meta'; meta.textContent = `${survey.category} · ${survey.minutes} min · Montant fictif ${money(survey.rewardCents)}`;
    const btn = document.createElement('button'); btn.className = 'btn primary'; btn.type = 'button'; btn.textContent = 'Simuler une fin de sondage';
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Simulation…';
      try {
        const result = await api('/api/demo/complete', { method: 'POST', body: JSON.stringify({ surveyId: survey.id }) });
        alert(`Simulation enregistrée. Part fictive du membre : ${money(result.memberCents)}. Aucun argent réel ne sera versé.`);
        await loadMember();
      } catch (error) { alert(error.message); btn.disabled = false; btn.textContent = 'Simuler une fin de sondage'; }
    });
    card.append(badge, title, description, meta, btn); grid.append(card);
  }
  const history = $('historyTable'); history.replaceChildren();
  if (!summary.history.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 4; cell.className = 'empty-cell'; cell.textContent = 'Aucune simulation. Choisis un exemple ci-dessus.'; row.append(cell); history.append(row);
  }
  for (const item of summary.history) {
    const row = document.createElement('tr');
    for (const value of [item.survey_title, money(item.gross_cents), money(item.member_cents), formatDate(item.created_at)]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    history.append(row);
  }
}

(async function start() {
  try { await loadConfig(); await checkSession(); }
  catch (error) { showLogin(); setError('loginError', `Le serveur n'est pas encore prêt : ${error.message}`); }
})();

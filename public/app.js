'use strict';

const $ = id => document.getElementById(id);
let currentUser = null;
let adminCache = { members: [], surveys: [], leaderboard: [], recent: [] };
let currentSurvey = null;
let podiumBusy = false;
let memberPage = 1;
const memberPageSize = 8;

const moneylessDate = value => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function setText(id, value) { $(id).textContent = value == null ? '' : String(value); }
function message(id, value, error = false) {
  const el = $(id); el.textContent = value; el.classList.remove('hidden', 'message-error');
  if (error) el.classList.add('message-error');
}
function clearMessage(id) { $(id).textContent = ''; $(id).classList.add('hidden'); $(id).classList.remove('message-error'); }
function node(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content !== undefined) el.textContent = content;
  return el;
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Erreur ${response.status}`);
    error.code = body.code;
    error.status = response.status;
    throw error;
  }
  return body;
}
function setPage(title, subtitle) { setText('pageTitle', title); setText('pageSub', subtitle); }
function showOnly(sectionId) {
  ['loginPanel', 'passwordPanel', 'adminPanel', 'memberPanel', 'surveyTakingPanel'].forEach(id => hide(id));
  show(sectionId);
}
function showLogin() {
  currentUser = null;
  showOnly('loginPanel');
  hide('logoutBtn');
  setText('connectionLabel', 'Hors connexion');
  setPage('Bienvenue sur Qwesto', 'Connecte-toi à ton espace privé.');
}
function showPasswordPanel() {
  showOnly('passwordPanel'); show('logoutBtn');
  setText('connectionLabel', 'Changement du mot de passe requis');
  setPage('Première connexion', 'Choisis un mot de passe personnel.');
}
async function checkSession() {
  const data = await api('/api/me');
  if (!data.user) return showLogin();
  currentUser = data.user;
  if (currentUser.role === 'member' && currentUser.mustChangePassword) return showPasswordPanel();
  show('logoutBtn');
  if (currentUser.role === 'admin') {
    showOnly('adminPanel');
    setText('connectionLabel', 'Administrateur connecté');
    setPage('Espace administrateur', 'Gère tes questionnaires et les membres de Qwesto.');
    await loadAdmin();
  } else {
    showOnly('memberPanel');
    setText('connectionLabel', 'Membre connecté');
    setPage('Espace membre', 'Découvre les questionnaires disponibles.');
    setText('memberWelcome', `Bonjour ${currentUser.name || currentUser.username}`);
    await loadMember();
  }
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); clearMessage('loginError');
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ username: $('username').value, password: $('password').value }) });
    $('password').value = '';
    await checkSession();
  } catch (error) { message('loginError', error.message, true); }
});
$('changePasswordForm').addEventListener('submit', async event => {
  event.preventDefault(); clearMessage('passwordError');
  const password = $('newPassword').value;
  if (password !== $('confirmPassword').value) return message('passwordError', 'Les deux mots de passe ne correspondent pas.', true);
  try {
    await api('/api/change-password', { method: 'POST', body: JSON.stringify({ password }) });
    $('newPassword').value = ''; $('confirmPassword').value = '';
    await checkSession();
  } catch (error) { message('passwordError', error.message, true); }
});
$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  showLogin();
});

async function loadAdmin() {
  const data = await api('/api/admin/overview');
  adminCache = data;
  setText('statSurveys', data.totals.surveys);
  setText('statPublished', `${data.totals.published} publié(s)`);
  setText('statResponses', data.totals.responses);
  setText('statMembers', data.totals.members);
  setText('statActive', data.members.filter(m => m.active).length);
  setText('surveyListCount', `${data.surveys.length} sondage(s)`);
  renderLeaderboardPreview(data.leaderboard);
  renderAdminSurveys(data.surveys);
  renderMembers(data.members);
  renderRecent(data.recent);
}
$('refreshAdmin').addEventListener('click', async () => {
  const button = $('refreshAdmin'); button.disabled = true; button.textContent = 'Chargement…';
  try { await loadAdmin(); } catch (error) { alert(error.message); }
  finally { button.disabled = false; button.textContent = '↻ Actualiser'; }
});

$('createMemberForm').addEventListener('submit', async event => {
  event.preventDefault(); clearMessage('createMemberMessage');
  const payload = {
    fullName: $('memberName').value.trim(),
    username: $('memberUsername').value.trim(),
    tempPassword: $('memberTempPassword').value
  };
  try {
    const result = await api('/api/admin/members', { method: 'POST', body: JSON.stringify(payload) });
    $('createMemberForm').reset();
    message('createMemberMessage', `Compte ${result.member.username} créé. Transmets son mot de passe temporaire en privé.`);
    await loadAdmin();
  } catch (error) { message('createMemberMessage', error.message, true); }
});

$('createSurveyForm').addEventListener('submit', async event => {
  event.preventDefault(); clearMessage('surveyCreateMessage');
  const payload = {
    title: $('surveyTitle').value.trim(),
    description: $('surveyDescription').value.trim(),
    category: $('surveyCategory').value.trim(),
    minutes: Number($('surveyMinutes').value),
    questions: $('surveyQuestions').value.split('\n').map(q => q.trim()).filter(Boolean)
  };
  try {
    const result = await api('/api/admin/surveys', { method: 'POST', body: JSON.stringify(payload) });
    $('createSurveyForm').reset(); $('surveyCategory').value = 'Général'; $('surveyMinutes').value = '5';
    message('surveyCreateMessage', `« ${result.survey.title} » a été créé en brouillon. Tu peux maintenant le publier.`);
    await loadAdmin();
  } catch (error) { message('surveyCreateMessage', error.message, true); }
});

function renderLeaderboardPreview(entries) {
  const container = $('leaderboardPreview'); container.replaceChildren();
  const top = entries.slice(0, 3);
  if (!top.length || top.every(m => Number(m.completed_count) === 0)) {
    container.append(node('div', 'empty-state', 'Les premières participations apparaîtront ici.'));
    return;
  }
  const order = [top[1], top[0], top[2]];
  order.forEach((member, index) => {
    if (!member) return;
    const place = index === 0 ? 2 : index === 1 ? 1 : 3;
    const card = node('div', `mini-podium-card place-${place}`);
    card.append(node('span', 'mini-place', `${place}e`), node('strong', '', member.full_name), node('small', '', `${member.completed_count} réponse(s)`));
    container.append(card);
  });
}

function renderAdminSurveys(surveys) {
  const list = $('adminSurveyList'); list.replaceChildren();
  if (!surveys.length) { list.append(node('div', 'empty-state', 'Aucun sondage créé pour l’instant.')); return; }
  for (const survey of surveys) {
    const card = node('article', 'survey-admin-card');
    const main = node('div', 'survey-admin-main');
    const heading = node('div', 'survey-admin-title');
    heading.append(node('h4', '', survey.title), node('span', `status-tag status-${survey.status}`, statusLabel(survey.status)));
    main.append(heading, node('p', 'muted survey-description', survey.description || 'Aucune description.'), node('small', 'survey-detail', `${survey.category} · ${survey.minutes} min · ${survey.question_count} question(s) · ${survey.response_count} réponse(s)`));
    const actions = node('div', 'survey-actions');
    if (survey.status === 'draft') actions.append(actionButton('Publier', 'button-primary small-button', () => changeSurveyStatus(survey.id, 'published')));
    if (survey.status === 'published') actions.append(actionButton('Dépublier', 'button-soft small-button', () => changeSurveyStatus(survey.id, 'draft')));
    if (survey.status !== 'archived') actions.append(actionButton('Archiver', 'button-soft small-button', () => changeSurveyStatus(survey.id, 'archived')));
    if (survey.response_count > 0) actions.append(actionButton('Voir réponses', 'button-soft small-button', () => openResponses(survey.id)));
    if (survey.status !== 'published' && Number(survey.response_count) === 0) actions.append(actionButton('Supprimer', 'button-danger small-button', () => deleteSurvey(survey.id)));
    card.append(main, actions); list.append(card);
  }
}
function actionButton(label, className, callback) {
  const button = node('button', `button ${className}`, label); button.type = 'button'; button.addEventListener('click', callback); return button;
}
function statusLabel(status) { return ({ draft: 'Brouillon', published: 'Publié', archived: 'Archivé' })[status] || status; }
async function changeSurveyStatus(id, status) {
  try { await api(`/api/admin/surveys/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadAdmin(); }
  catch (error) { alert(error.message); }
}
async function deleteSurvey(id) {
  if (!confirm('Supprimer définitivement ce brouillon/sondage archivé ?')) return;
  try { await api(`/api/admin/surveys/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadAdmin(); }
  catch (error) { alert(error.message); }
}

function renderMembers(members) {
  const q = $('memberSearch').value.trim().toLocaleLowerCase('fr');
  const statusFilter = $('memberStatusFilter').value;
  let filtered = members.filter(m => `${m.full_name} ${m.username}`.toLocaleLowerCase('fr').includes(q));
  if (statusFilter === 'active') filtered = filtered.filter(m => m.active);
  if (statusFilter === 'disabled') filtered = filtered.filter(m => !m.active);
  const pages = Math.max(1, Math.ceil(filtered.length / memberPageSize));
  memberPage = Math.min(memberPage, pages);
  const start = (memberPage - 1) * memberPageSize;
  const visible = filtered.slice(start, start + memberPageSize);
  setText('memberCount', `${filtered.length} membre(s)`);
  const tbody = $('membersTable'); tbody.replaceChildren();
  if (!visible.length) {
    const tr = node('tr'); const td = node('td', 'empty-cell', members.length ? 'Aucun résultat pour ces filtres.' : 'Aucun membre pour le moment.');
    td.colSpan = 6; tr.append(td); tbody.append(tr);
  }
  for (const member of visible) {
    const tr = node('tr');
    tr.append(node('td', 'table-name', member.full_name), node('td', 'muted', member.username), node('td', '', member.completed_count), node('td', 'muted', moneylessDate(member.last_activity)));
    const status = node('td'); status.append(node('span', `status-tag ${member.active ? 'status-published' : 'status-archived'}`, member.active ? 'Actif' : 'Désactivé'));
    const actions = node('td', 'table-actions');
    actions.append(actionButton('Historique', 'button-soft small-button', () => openMemberHistory(member.id)));
    actions.append(actionButton(member.active ? 'Désactiver' : 'Activer', 'button-soft small-button', async () => {
      try { await api(`/api/admin/members/${encodeURIComponent(member.id)}/status`, { method: 'PATCH', body: JSON.stringify({ active: !member.active }) }); await loadAdmin(); }
      catch (error) { alert(error.message); }
    }));
    actions.append(actionButton('Reset mdp', 'button-soft small-button', async () => {
      const password = prompt(`Nouveau mot de passe temporaire pour ${member.username} (12 caractères minimum) :`);
      if (password === null) return;
      if (password.length < 12) return alert('12 caractères minimum.');
      try { await api(`/api/admin/members/${encodeURIComponent(member.id)}/reset-password`, { method: 'POST', body: JSON.stringify({ tempPassword: password }) }); alert('Mot de passe réinitialisé. Le membre devra le changer.'); await loadAdmin(); }
      catch (error) { alert(error.message); }
    }));
    tr.append(status, actions); tbody.append(tr);
  }
  const pagination = $('memberPagination'); pagination.replaceChildren();
  if (filtered.length > memberPageSize) {
    const previous = actionButton('← Précédent', 'button-soft small-button', () => { memberPage = Math.max(1, memberPage - 1); renderMembers(members); });
    previous.disabled = memberPage === 1;
    const next = actionButton('Suivant →', 'button-soft small-button', () => { memberPage = Math.min(pages, memberPage + 1); renderMembers(members); });
    next.disabled = memberPage === pages;
    pagination.append(previous, node('span', 'muted', `Page ${memberPage} / ${pages}`), next);
  }
}
$('memberSearch').addEventListener('input', () => { memberPage = 1; renderMembers(adminCache.members); });
$('memberStatusFilter').addEventListener('change', () => { memberPage = 1; renderMembers(adminCache.members); });

$('exportMembers').addEventListener('click', () => {
  const rows = [['Nom', 'Identifiant', 'Participations', 'Dernière activité', 'Statut'], ...adminCache.members.map(m => [m.full_name, m.username, m.completed_count, moneylessDate(m.last_activity), m.active ? 'Actif' : 'Désactivé'])];
  const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = node('a'); a.href = url; a.download = 'qwesto-membres.csv'; a.click(); URL.revokeObjectURL(url);
});
function renderRecent(rows) {
  const tbody = $('recentTable'); tbody.replaceChildren();
  if (!rows.length) { const tr = node('tr'); const td = node('td', 'empty-cell', 'Aucune réponse reçue.'); td.colSpan = 3; tr.append(td); tbody.append(tr); return; }
  for (const row of rows) {
    const tr = node('tr'); tr.append(node('td', 'table-name', row.full_name), node('td', '', row.survey_title), node('td', 'muted', moneylessDate(row.completed_at))); tbody.append(tr);
  }
}

async function openMemberHistory(memberId) {
  try {
    const data = await api(`/api/admin/members/${encodeURIComponent(memberId)}/activity`);
    setText('memberHistoryTitle', `Historique — ${data.member.full_name}`);
    const root = $('memberHistoryContent'); root.replaceChildren();
    const summary = node('div', 'response-card');
    summary.append(node('h4', '', `@${data.member.username}`), node('p', 'muted', `Compte créé le ${moneylessDate(data.member.created_at)} · ${data.member.active ? 'Actif' : 'Désactivé'} · ${data.history.length} participation(s)`));
    root.append(summary);
    if (!data.history.length) root.append(node('div', 'empty-state', 'Aucune participation enregistrée.'));
    for (const item of data.history) {
      const row = node('div', 'history-row'); row.append(node('span', 'history-check', '✓'));
      const info = node('div', 'history-info'); info.append(node('strong', '', item.survey_title), node('small', 'muted', moneylessDate(item.completed_at)));
      row.append(info, node('span', 'status-tag status-published', 'Terminé')); root.append(row);
    }
    show('memberHistoryModal');
  } catch (error) { alert(error.message); }
}
$('closeMemberHistory').addEventListener('click', () => hide('memberHistoryModal'));
$('memberHistoryModal').addEventListener('click', event => { if (event.target.id === 'memberHistoryModal') hide('memberHistoryModal'); });

async function openResponses(surveyId) {
  try {
    const data = await api(`/api/admin/surveys/${encodeURIComponent(surveyId)}/responses`);
    setText('responsesTitle', `Réponses — ${data.survey.title}`);
    const root = $('responsesContent'); root.replaceChildren();
    if (!data.responses.length) root.append(node('div', 'empty-state', 'Aucune réponse reçue.'));
    for (const response of data.responses) {
      const card = node('article', 'response-card');
      card.append(node('h4', '', `${response.full_name} (@${response.username})`), node('small', 'muted', moneylessDate(response.completed_at)));
      const answers = Array.isArray(response.answers) ? response.answers : [];
      data.survey.questions.forEach((question, index) => {
        const block = node('div', 'response-answer'); block.append(node('strong', '', question), node('p', '', answers[index] || '—')); card.append(block);
      });
      root.append(card);
    }
    show('responsesModal');
  } catch (error) { alert(error.message); }
}
$('closeResponses').addEventListener('click', () => hide('responsesModal'));
$('responsesModal').addEventListener('click', event => { if (event.target.id === 'responsesModal') hide('responsesModal'); });

async function loadMember() {
  const data = await api('/api/member/dashboard');
  setText('memberCompleted', data.completed);
  setText('memberAvailable', data.surveys.length);
  renderMemberSurveys(data.surveys);
  renderMemberHistory(data.history);
}
function renderMemberSurveys(surveys) {
  const grid = $('memberSurveyList'); grid.replaceChildren();
  if (!surveys.length) { grid.append(node('div', 'empty-state', 'Aucun questionnaire publié pour le moment.')); return; }
  for (const survey of surveys) {
    const card = node('article', 'member-survey-card');
    const top = node('div', 'survey-card-top'); top.append(node('span', 'category-pill', survey.category), node('span', survey.completed ? 'completed-pill' : 'open-pill', survey.completed ? '✓ Terminé' : 'À faire'));
    card.append(top, node('h4', '', survey.title), node('p', 'muted', survey.description || 'Questionnaire proposé par Qwesto.'), node('small', 'survey-detail', `${survey.minutes} min · ${survey.question_count} question(s)`));
    const button = actionButton(survey.completed ? 'Déjà terminé' : 'Répondre au sondage', survey.completed ? 'button-soft small-button' : 'button-primary small-button', () => openSurvey(survey.id));
    button.disabled = survey.completed; card.append(button); grid.append(card);
  }
}
function renderMemberHistory(history) {
  const list = $('memberHistory'); list.replaceChildren();
  if (!history.length) { list.append(node('div', 'empty-state', 'Tu n’as pas encore terminé de questionnaire.')); return; }
  for (const item of history) {
    const row = node('div', 'history-row'); row.append(node('span', 'history-check', '✓'));
    const info = node('div', 'history-info'); info.append(node('strong', '', item.survey_title), node('small', 'muted', moneylessDate(item.completed_at)));
    row.append(info, node('span', 'status-tag status-published', 'Terminé')); list.append(row);
  }
}

async function openSurvey(id) {
  try {
    const data = await api(`/api/member/surveys/${encodeURIComponent(id)}`);
    if (data.survey.completed) return alert('Tu as déjà répondu à ce sondage.');
    currentSurvey = data.survey;
    setText('takingTitle', currentSurvey.title);
    setText('takingDescription', currentSurvey.description || 'Prends quelques instants pour répondre.');
    setText('takingMeta', `${currentSurvey.category} · environ ${currentSurvey.minutes} min · ${currentSurvey.questions.length} question(s)`);
    const fields = $('questionFields'); fields.replaceChildren();
    currentSurvey.questions.forEach((question, index) => {
      const group = node('div', 'question-group');
      const label = node('label', '', `${index + 1}. ${question}`); label.htmlFor = `answer-${index}`;
      const textarea = node('textarea', 'answer-input'); textarea.id = `answer-${index}`; textarea.name = `answer-${index}`; textarea.rows = 3; textarea.maxLength = 1000; textarea.required = true; textarea.placeholder = 'Ta réponse…';
      group.append(label, textarea); fields.append(group);
    });
    $('takingProgress').querySelector('span').style.width = '0%';
    hide('memberPanel'); show('surveyTakingPanel'); setPage('Répondre au questionnaire', currentSurvey.title);
    clearMessage('takingMessage');
  } catch (error) { alert(error.message); }
}
$('cancelSurvey').addEventListener('click', () => {
  currentSurvey = null; hide('surveyTakingPanel'); show('memberPanel'); setPage('Espace membre', 'Découvre les questionnaires disponibles.');
});
$('takeSurveyForm').addEventListener('input', () => {
  const fields = [...$('questionFields').querySelectorAll('textarea')];
  const completed = fields.filter(field => field.value.trim()).length;
  $('takingProgress').querySelector('span').style.width = `${fields.length ? completed / fields.length * 100 : 0}%`;
});
$('takeSurveyForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentSurvey) return;
  const button = $('takeSurveyForm').querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = 'Envoi des réponses…';
  const answers = [...$('questionFields').querySelectorAll('textarea')].map(field => field.value.trim());
  try {
    await api(`/api/member/surveys/${encodeURIComponent(currentSurvey.id)}/submit`, { method: 'POST', body: JSON.stringify({ answers }) });
    currentSurvey = null; hide('surveyTakingPanel'); show('memberPanel');
    setPage('Espace membre', 'Découvre les questionnaires disponibles.');
    await loadMember();
    alert('Merci ! Tes réponses ont bien été enregistrées.');
  } catch (error) { message('takingMessage', error.message, true); }
  finally { button.disabled = false; button.textContent = 'Envoyer mes réponses →'; }
});

// Podium reveal: 3rd place, 2nd place, a short pause, then the winner.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function closePodium() { hide('podiumOverlay'); podiumBusy = false; }
$('closePodium').addEventListener('click', closePodium);
$('podiumOverlay').addEventListener('click', event => { if (event.target.id === 'podiumOverlay') closePodium(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closePodium(); hide('responsesModal'); hide('memberHistoryModal'); }
});
function makeWinnerCard(member, place) {
  const card = node('div', `winner-card winner-${place}`);
  const number = node('span', 'winner-number', place === 'first' ? '1' : place === 'second' ? '2' : '3');
  const avatar = node('div', `pixel-person person-${place}`);
  avatar.append(node('span', 'person-hair'), node('span', 'person-face'), node('span', 'person-body'), node('span', 'person-leg left-leg'), node('span', 'person-leg right-leg'));
  const name = node('strong', 'winner-name', member ? member.full_name : 'En attente');
  const count = node('small', 'winner-count', member ? `${member.completed_count} réponse(s)` : 'Aucune participation');
  card.append(number, avatar, name, count);
  return card;
}
function podiumFill(position, member, rank) {
  const slot = $(`winner${position}`); slot.replaceChildren(); slot.append(makeWinnerCard(member, rank));
  slot.classList.remove('winner-show'); void slot.offsetWidth; slot.classList.add('winner-show');
}
async function playPodium() {
  if (podiumBusy) return;
  podiumBusy = true;
  const active = adminCache.leaderboard.filter(m => Number(m.completed_count) > 0).slice(0, 3);
  const third = active[2] || null, second = active[1] || null, first = active[0] || null;
  const overlay = $('podiumOverlay'); const count = $('countdownNumber'); const stage = $('podiumStage');
  show('podiumOverlay'); hide('podiumStage'); show('countdownNumber');
  ['winnerThird','winnerSecond','winnerFirst'].forEach(id => $(id).replaceChildren());
  setText('podiumTitle', 'Les membres à l’honneur');
  for (const n of ['3','2','1']) {
    if (!podiumBusy) return;
    setText('countdownNumber', n); count.classList.remove('count-pop'); void count.offsetWidth; count.classList.add('count-pop');
    await pause(650);
  }
  if (!podiumBusy) return;
  hide('countdownNumber'); show('podiumStage');
  setText('podiumCaption', '🥉 La troisième place !');
  podiumFill('Third', third, 'third'); await pause(1600);
  if (!podiumBusy) return;
  setText('podiumCaption', '🥈 La deuxième place !');
  podiumFill('Second', second, 'second'); await pause(1900);
  if (!podiumBusy) return;
  setText('podiumCaption', 'Un instant… et maintenant, le grand gagnant.');
  await pause(2300);
  if (!podiumBusy) return;
  setText('podiumCaption', '🏆 La première place revient à…');
  podiumFill('First', first, 'first');
  if (first) setText('podiumTitle', 'Notre grand gagnant !');
  else setText('podiumTitle', 'Le podium attend ses premiers participants');
  await pause(350);
  $('podiumStage').classList.add('champion-reveal');
  await pause(4500);
  closePodium();
}
$('playPodium').addEventListener('click', playPodium);

async function start() {
  try { await checkSession(); }
  catch (error) {
    showLogin();
    message('loginError', `Le serveur n'est pas prêt : ${error.message}`, true);
  }
}
start();

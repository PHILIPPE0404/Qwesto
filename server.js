'use strict';

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

if (!DATABASE_URL) throw new Error('DATABASE_URL manquant : ajoute la base PostgreSQL Render.');
if (ADMIN_PASSWORD.length < 20) throw new Error('ADMIN_PASSWORD doit contenir au moins 20 caractères.');
if (SESSION_SECRET.length < 64) throw new Error('SESSION_SECRET doit contenir au moins 64 caractères.');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '40kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(session({
  store: new PgSession({ pool, tableName: 'qwesto_sessions', createTableIfMissing: true }),
  name: 'qwesto.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessaie dans 15 minutes.' }
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Attends une minute.' }
});

function normalizeUsername(value) { return String(value || '').trim().toLowerCase(); }
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Connexion requise.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Accès administrateur requis.' });
  next();
}
async function requireMember(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'member') return res.status(403).json({ error: 'Espace membre uniquement.' });
  try {
    const result = await pool.query(
      'SELECT active, must_change_password FROM qwesto_members WHERE id=$1 LIMIT 1',
      [req.session.user.id]
    );
    const member = result.rows[0];
    if (!member || !member.active) return res.status(403).json({ error: 'Ce compte est désactivé.' });
    if (member.must_change_password) {
      req.session.user.mustChangePassword = true;
      return res.status(403).json({ error: 'Change ton mot de passe temporaire.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    req.session.user.mustChangePassword = false;
    next();
  } catch (error) { next(error); }
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
function validSurveyPayload(body) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const category = String(body.category || 'Général').trim();
  const questions = Array.isArray(body.questions)
    ? body.questions.map(q => String(q || '').trim()).filter(Boolean)
    : String(body.questions || '').split('\n').map(q => q.trim()).filter(Boolean);
  const minutes = Number(body.minutes || 5);
  if (title.length < 3 || title.length > 100) return { error: 'Le titre doit contenir de 3 à 100 caractères.' };
  if (description.length > 500) return { error: 'La description ne peut pas dépasser 500 caractères.' };
  if (category.length < 2 || category.length > 40) return { error: 'La catégorie doit contenir de 2 à 40 caractères.' };
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 90) return { error: 'La durée doit être comprise entre 1 et 90 minutes.' };
  if (questions.length < 1 || questions.length > 12) return { error: 'Ajoute de 1 à 12 questions (une par ligne).' };
  if (questions.some(q => q.length < 3 || q.length > 240)) return { error: 'Chaque question doit contenir de 3 à 240 caractères.' };
  return { value: { title, description, category, minutes, questions } };
}

async function initDatabase() {
  // Les tables membres et historiques existantes ne sont pas supprimées.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qwesto_members (
      id UUID PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      full_name VARCHAR(80) NOT NULL,
      password_hash TEXT NOT NULL,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS qwesto_demo_ledger (
      id BIGSERIAL PRIMARY KEY,
      tx_id VARCHAR(100) UNIQUE NOT NULL,
      member_id UUID NOT NULL REFERENCES qwesto_members(id),
      survey_id VARCHAR(40) NOT NULL,
      survey_title VARCHAR(160) NOT NULL,
      gross_cents INTEGER NOT NULL,
      member_cents INTEGER NOT NULL,
      platform_cents INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS qwesto_demo_ledger_member_idx ON qwesto_demo_ledger(member_id);
    CREATE TABLE IF NOT EXISTS qwesto_surveys (
      id UUID PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      category VARCHAR(40) NOT NULL DEFAULT 'Général',
      minutes INTEGER NOT NULL DEFAULT 5 CHECK (minutes BETWEEN 1 AND 90),
      questions JSONB NOT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      created_by VARCHAR(32) NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS qwesto_responses (
      id UUID PRIMARY KEY,
      survey_id UUID NOT NULL REFERENCES qwesto_surveys(id) ON DELETE CASCADE,
      member_id UUID NOT NULL REFERENCES qwesto_members(id) ON DELETE CASCADE,
      answers JSONB NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (survey_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS qwesto_responses_member_idx ON qwesto_responses(member_id, completed_at DESC);
    CREATE INDEX IF NOT EXISTS qwesto_responses_survey_idx ON qwesto_responses(survey_id, completed_at DESC);
  `);
}

app.get('/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, database: 'connected', mode: 'test', surveys: 'internal' });
}));
app.get('/api/config', (_req, res) => res.json({
  appName: 'Qwesto', mode: 'test',
  realSurveyProviderConnected: false,
  paypalEnabled: false,
  message: 'Les questionnaires sont publiés par ton administration. Les paiements et fournisseurs externes ne sont pas activés.'
}));
app.get('/api/me', asyncRoute(async (req, res) => {
  if (req.session.user?.role === 'member') {
    const result = await pool.query('SELECT active, must_change_password FROM qwesto_members WHERE id=$1 LIMIT 1', [req.session.user.id]);
    const member = result.rows[0];
    if (!member || !member.active) {
      return req.session.destroy(() => { res.clearCookie('qwesto.sid'); res.json({ user: null }); });
    }
    req.session.user.mustChangePassword = member.must_change_password;
  }
  res.json({ user: req.session.user || null });
}));

app.post('/api/login', loginLimiter, asyncRoute(async (req, res, next) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  if (username === 'admin') {
    const a = Buffer.from(password);
    const b = Buffer.from(ADMIN_PASSWORD);
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects.' });
    return req.session.regenerate(error => {
      if (error) return next(error);
      req.session.user = { role: 'admin', username: 'admin', name: 'Administrateur' };
      req.session.save(saveError => saveError ? next(saveError) : res.json({ ok: true, user: req.session.user }));
    });
  }
  const result = await pool.query('SELECT * FROM qwesto_members WHERE username=$1 LIMIT 1', [username]);
  const member = result.rows[0];
  if (!member || !member.active || !(await bcrypt.compare(password, member.password_hash))) {
    return res.status(401).json({ error: 'Identifiants incorrects ou compte désactivé.' });
  }
  req.session.regenerate(error => {
    if (error) return next(error);
    req.session.user = {
      role: 'member', id: member.id, username: member.username,
      name: member.full_name, mustChangePassword: member.must_change_password
    };
    req.session.save(saveError => saveError ? next(saveError) : res.json({ ok: true, user: req.session.user }));
  });
}));

app.post('/api/logout', requireAuth, (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('qwesto.sid');
    res.json({ ok: true });
  });
});

app.post('/api/change-password', requireAuth, writeLimiter, asyncRoute(async (req, res) => {
  if (req.session.user.role !== 'member') return res.status(400).json({ error: 'Action réservée aux membres.' });
  const password = String(req.body.password || '');
  if (password.length < 12 || password.length > 200) return res.status(400).json({ error: 'Choisis un mot de passe de 12 à 200 caractères.' });
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'UPDATE qwesto_members SET password_hash=$1, must_change_password=FALSE WHERE id=$2 AND active=TRUE RETURNING id',
    [hash, req.session.user.id]
  );
  if (!result.rowCount) return res.status(403).json({ error: 'Compte indisponible.' });
  req.session.user.mustChangePassword = false;
  res.json({ ok: true });
}));

app.get('/api/admin/overview', requireAdmin, asyncRoute(async (_req, res) => {
  const [members, surveys, recent, totals] = await Promise.all([
    pool.query(`SELECT m.id,m.username,m.full_name,m.active,m.created_at,
      COUNT(r.id)::int AS completed_count, MAX(r.completed_at) AS last_activity
      FROM qwesto_members m LEFT JOIN qwesto_responses r ON r.member_id=m.id
      GROUP BY m.id ORDER BY m.created_at DESC`),
    pool.query(`SELECT s.id,s.title,s.description,s.category,s.minutes,s.status,s.created_at,s.published_at,
      jsonb_array_length(s.questions) AS question_count, COUNT(r.id)::int AS response_count
      FROM qwesto_surveys s LEFT JOIN qwesto_responses r ON r.survey_id=s.id
      GROUP BY s.id ORDER BY s.created_at DESC`),
    pool.query(`SELECT r.id,r.completed_at,m.full_name,m.username,s.title AS survey_title
      FROM qwesto_responses r JOIN qwesto_members m ON m.id=r.member_id
      JOIN qwesto_surveys s ON s.id=r.survey_id
      ORDER BY r.completed_at DESC LIMIT 30`),
    pool.query(`SELECT COUNT(*)::int AS responses,
      (SELECT COUNT(*)::int FROM qwesto_members) AS members,
      (SELECT COUNT(*)::int FROM qwesto_surveys) AS surveys,
      (SELECT COUNT(*)::int FROM qwesto_surveys WHERE status='published') AS published
      FROM qwesto_responses`)
  ]);
  const leaderboard = members.rows.filter(m => m.active).slice().sort((a,b) =>
    Number(b.completed_count)-Number(a.completed_count) || String(a.username).localeCompare(String(b.username), 'fr')
  ).slice(0, 10);
  res.json({ members: members.rows, surveys: surveys.rows, recent: recent.rows, totals: totals.rows[0], leaderboard });
}));

app.post('/api/admin/members', requireAdmin, writeLimiter, asyncRoute(async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const fullName = String(req.body.fullName || '').trim();
  const tempPassword = String(req.body.tempPassword || '');
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || username === 'admin') return res.status(400).json({ error: 'Identifiant invalide : 3 à 32 caractères, sans espace.' });
  if (fullName.length < 2 || fullName.length > 80) return res.status(400).json({ error: 'Nom : 2 à 80 caractères.' });
  if (tempPassword.length < 12 || tempPassword.length > 200) return res.status(400).json({ error: 'Mot de passe temporaire : 12 à 200 caractères.' });
  const hash = await bcrypt.hash(tempPassword, 12);
  try {
    const result = await pool.query(
      'INSERT INTO qwesto_members (id,username,full_name,password_hash,must_change_password) VALUES ($1,$2,$3,$4,TRUE) RETURNING id,username,full_name,active,created_at',
      [crypto.randomUUID(), username, fullName, hash]
    );
    res.status(201).json({ ok: true, member: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Cet identifiant existe déjà.' });
    throw error;
  }
}));

app.patch('/api/admin/members/:id/status', requireAdmin, writeLimiter, asyncRoute(async (req, res) => {
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'Statut invalide.' });
  const result = await pool.query('UPDATE qwesto_members SET active=$1 WHERE id=$2 RETURNING id,username,full_name,active', [req.body.active, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Membre introuvable.' });
  res.json({ ok: true, member: result.rows[0] });
}));

app.post('/api/admin/members/:id/reset-password', requireAdmin, writeLimiter, asyncRoute(async (req, res) => {
  const tempPassword = String(req.body.tempPassword || '');
  if (tempPassword.length < 12 || tempPassword.length > 200) return res.status(400).json({ error: '12 à 200 caractères requis.' });
  const hash = await bcrypt.hash(tempPassword, 12);
  const result = await pool.query('UPDATE qwesto_members SET password_hash=$1,must_change_password=TRUE WHERE id=$2 RETURNING id', [hash, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Membre introuvable.' });
  res.json({ ok: true });
}));

app.get('/api/admin/members/:id/activity', requireAdmin, asyncRoute(async (req, res) => {
  const member = await pool.query(
    'SELECT id,username,full_name,active,created_at,must_change_password FROM qwesto_members WHERE id=$1 LIMIT 1',
    [req.params.id]
  );
  if (!member.rowCount) return res.status(404).json({ error: 'Membre introuvable.' });
  const history = await pool.query(
    `SELECT r.id,r.completed_at,s.title AS survey_title
     FROM qwesto_responses r JOIN qwesto_surveys s ON s.id=r.survey_id
     WHERE r.member_id=$1 ORDER BY r.completed_at DESC LIMIT 100`,
    [req.params.id]
  );
  res.json({ member: member.rows[0], history: history.rows });
}));

app.post('/api/admin/surveys', requireAdmin, writeLimiter, asyncRoute(async (req, res) => {
  const parsed = validSurveyPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { title, description, category, minutes, questions } = parsed.value;
  const result = await pool.query(
    `INSERT INTO qwesto_surveys (id,title,description,category,minutes,questions,created_by)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,'admin')
     RETURNING id,title,description,category,minutes,questions,status,created_at`,
    [crypto.randomUUID(), title, description, category, minutes, JSON.stringify(questions)]
  );
  res.status(201).json({ ok: true, survey: result.rows[0] });
}));

app.patch('/api/admin/surveys/:id/status', requireAdmin, writeLimiter, asyncRoute(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['draft', 'published', 'archived'].includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  const result = await pool.query(
    `UPDATE qwesto_surveys SET status=$1, updated_at=NOW(),
      published_at=CASE WHEN $1='published' THEN COALESCE(published_at,NOW()) ELSE published_at END
     WHERE id=$2 RETURNING id,status`,
    [status, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Sondage introuvable.' });
  res.json({ ok: true, survey: result.rows[0] });
}));

app.delete('/api/admin/surveys/:id', requireAdmin, writeLimiter, asyncRoute(async (req, res) => {
  const result = await pool.query("DELETE FROM qwesto_surveys s WHERE s.id=$1 AND s.status<>$2 AND NOT EXISTS (SELECT 1 FROM qwesto_responses r WHERE r.survey_id=s.id) RETURNING s.id", [req.params.id, 'published']);
  if (!result.rowCount) return res.status(409).json({ error: 'Impossible de supprimer un sondage publié. Archive-le d’abord.' });
  res.json({ ok: true });
}));

app.get('/api/member/dashboard', requireMember, asyncRoute(async (req, res) => {
  const [surveys, history, count] = await Promise.all([
    pool.query(`SELECT s.id,s.title,s.description,s.category,s.minutes,
      jsonb_array_length(s.questions) AS question_count,
      (r.id IS NOT NULL) AS completed
      FROM qwesto_surveys s LEFT JOIN qwesto_responses r
      ON r.survey_id=s.id AND r.member_id=$1
      WHERE s.status='published' ORDER BY s.published_at DESC NULLS LAST,s.created_at DESC`, [req.session.user.id]),
    pool.query(`SELECT r.id,r.completed_at,s.title AS survey_title
      FROM qwesto_responses r JOIN qwesto_surveys s ON s.id=r.survey_id
      WHERE r.member_id=$1 ORDER BY r.completed_at DESC LIMIT 50`, [req.session.user.id]),
    pool.query('SELECT COUNT(*)::int AS completed FROM qwesto_responses WHERE member_id=$1', [req.session.user.id])
  ]);
  res.json({ surveys: surveys.rows, history: history.rows, completed: count.rows[0].completed });
}));

app.get('/api/member/surveys/:id', requireMember, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT s.id,s.title,s.description,s.category,s.minutes,s.questions,
      EXISTS(SELECT 1 FROM qwesto_responses r WHERE r.survey_id=s.id AND r.member_id=$2) AS completed
     FROM qwesto_surveys s WHERE s.id=$1 AND s.status='published'`,
    [req.params.id, req.session.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Sondage introuvable ou non publié.' });
  res.json({ survey: result.rows[0] });
}));

app.post('/api/member/surveys/:id/submit', requireMember, writeLimiter, asyncRoute(async (req, res) => {
  const surveyResult = await pool.query(
    `SELECT id,questions FROM qwesto_surveys WHERE id=$1 AND status='published'`, [req.params.id]
  );
  if (!surveyResult.rowCount) return res.status(404).json({ error: 'Ce sondage n’est plus disponible.' });
  const questions = surveyResult.rows[0].questions;
  const answers = req.body.answers;
  if (!Array.isArray(answers) || answers.length !== questions.length) return res.status(400).json({ error: 'Réponses incomplètes.' });
  const cleaned = answers.map(a => String(a || '').trim());
  if (cleaned.some(a => a.length < 1 || a.length > 1000)) return res.status(400).json({ error: 'Chaque réponse doit contenir de 1 à 1000 caractères.' });
  try {
    await pool.query(
      'INSERT INTO qwesto_responses (id,survey_id,member_id,answers) VALUES ($1,$2,$3,$4::jsonb)',
      [crypto.randomUUID(), req.params.id, req.session.user.id, JSON.stringify(cleaned)]
    );
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Tu as déjà répondu à ce sondage.' });
    throw error;
  }
  res.status(201).json({ ok: true, message: 'Réponse enregistrée. Merci !' });
}));

app.get('/api/admin/surveys/:id/responses', requireAdmin, asyncRoute(async (req, res) => {
  const survey = await pool.query('SELECT id,title,questions FROM qwesto_surveys WHERE id=$1', [req.params.id]);
  if (!survey.rowCount) return res.status(404).json({ error: 'Sondage introuvable.' });
  const responses = await pool.query(
    `SELECT r.id,r.answers,r.completed_at,m.full_name,m.username
     FROM qwesto_responses r JOIN qwesto_members m ON m.id=r.member_id
     WHERE r.survey_id=$1 ORDER BY r.completed_at DESC LIMIT 200`, [req.params.id]
  );
  res.json({ survey: survey.rows[0], responses: responses.rows });
}));

app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: 0 }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((_req, res) => res.status(404).json({ error: 'Route introuvable.' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Erreur serveur. Consulte les logs Render.' });
});

async function start() {
  await initDatabase();
  const server = app.listen(PORT, '0.0.0.0', () => console.log(`Qwesto lancé sur le port ${PORT} (mode test)`));
  const shutdown = async () => {
    server.close(async () => { await pool.end(); process.exit(0); });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
start().catch(error => { console.error('Impossible de démarrer Qwesto :', error); process.exit(1); });

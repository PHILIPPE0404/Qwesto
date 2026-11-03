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
const MEMBER_PERCENT = Number(process.env.DEMO_MEMBER_PERCENT || 60);
const PLATFORM_PERCENT = 100 - MEMBER_PERCENT;

if (!DATABASE_URL) throw new Error('DATABASE_URL manquant : ajoute une base PostgreSQL Render.');
if (ADMIN_PASSWORD.length < 20) throw new Error('ADMIN_PASSWORD doit contenir au moins 20 caractères.');
if (SESSION_SECRET.length < 64) throw new Error('SESSION_SECRET doit contenir au moins 64 caractères.');
if (!Number.isInteger(MEMBER_PERCENT) || MEMBER_PERCENT < 1 || MEMBER_PERCENT > 99) {
  throw new Error('DEMO_MEMBER_PERCENT doit être un entier entre 1 et 99.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: 5,
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
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

app.use(session({
  store: new PgSession({ pool, tableName: 'qwesto_sessions', createTableIfMissing: true }),
  name: 'qwesto.demo.sid',
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

const DEMO_SURVEYS = [
  { id: 'demo-01', title: 'Habitudes numériques (démo)', description: 'Exemple fictif pour tester l’interface.', minutes: 6, rewardCents: 50, category: 'Technologie' },
  { id: 'demo-02', title: 'Préférences alimentaires (démo)', description: 'Exemple fictif pour tester le calcul 60/40.', minutes: 9, rewardCents: 85, category: 'Consommation' },
  { id: 'demo-03', title: 'Transports du quotidien (démo)', description: 'Exemple fictif ; aucune vraie récompense.', minutes: 12, rewardCents: 120, category: 'Vie quotidienne' }
];

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}
function safeUser(row) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    active: row.active,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at
  };
}
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Connexion requise.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Accès administrateur requis.' });
  next();
}
function requireMember(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'member') return res.status(403).json({ error: 'Espace membre uniquement.' });
  if (req.session.user.mustChangePassword) {
    return res.status(403).json({ error: 'Change ton mot de passe temporaire avant de continuer.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}
function constantTimeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function dollars(cents) { return (Number(cents || 0) / 100).toFixed(2); }

async function initDatabase() {
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
  `);
}

app.get('/health', (_req, res) => res.json({ ok: true, mode: 'demo-only' }));
app.get('/api/config', (_req, res) => res.json({ appName: 'Qwesto', mode: 'demo-only', providerConnected: false, paymentsEnabled: false, split: { member: MEMBER_PERCENT, platform: PLATFORM_PERCENT } }));
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.post('/api/login', loginLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || '');
    if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });

    if (username === 'admin') {
      if (!constantTimeEqual(password, ADMIN_PASSWORD)) return res.status(401).json({ error: 'Identifiants incorrects.' });
      req.session.regenerate(err => {
        if (err) return next(err);
        req.session.user = { role: 'admin', username: 'admin', name: 'Administrateur' };
        req.session.save(saveErr => saveErr ? next(saveErr) : res.json({ ok: true, user: req.session.user }));
      });
      return;
    }

    const result = await pool.query('SELECT * FROM qwesto_members WHERE username=$1 LIMIT 1', [username]);
    const member = result.rows[0];
    if (!member || !member.active || !(await bcrypt.compare(password, member.password_hash))) {
      return res.status(401).json({ error: 'Identifiants incorrects ou compte désactivé.' });
    }
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.user = {
        role: 'member', id: member.id, username: member.username,
        name: member.full_name, mustChangePassword: member.must_change_password
      };
      req.session.save(saveErr => saveErr ? next(saveErr) : res.json({ ok: true, user: req.session.user }));
    });
  } catch (error) { next(error); }
});

app.post('/api/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('qwesto.demo.sid');
    res.json({ ok: true });
  });
});

app.post('/api/change-password', requireAuth, async (req, res, next) => {
  try {
    if (req.session.user.role !== 'member') return res.status(400).json({ error: 'Action réservée aux membres.' });
    const password = String(req.body.password || '');
    if (password.length < 12) return res.status(400).json({ error: 'Choisis au moins 12 caractères.' });
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE qwesto_members SET password_hash=$1, must_change_password=FALSE WHERE id=$2', [hash, req.session.user.id]);
    req.session.user.mustChangePassword = false;
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/overview', requireAdmin, async (_req, res, next) => {
  try {
    const [members, totals, recent] = await Promise.all([
      pool.query(`SELECT m.id,m.username,m.full_name,m.active,m.created_at,
        COALESCE(SUM(l.member_cents),0)::bigint AS member_cents,
        COALESCE(SUM(l.gross_cents),0)::bigint AS gross_cents
        FROM qwesto_members m LEFT JOIN qwesto_demo_ledger l ON l.member_id=m.id
        GROUP BY m.id ORDER BY m.created_at DESC`),
      pool.query(`SELECT COALESCE(SUM(gross_cents),0)::bigint AS gross,
        COALESCE(SUM(member_cents),0)::bigint AS members,
        COALESCE(SUM(platform_cents),0)::bigint AS platform,
        COUNT(*)::int AS transactions FROM qwesto_demo_ledger`),
      pool.query(`SELECT l.tx_id,l.survey_title,l.gross_cents,l.member_cents,l.platform_cents,l.created_at,m.username,m.full_name
        FROM qwesto_demo_ledger l JOIN qwesto_members m ON m.id=l.member_id
        ORDER BY l.created_at DESC LIMIT 20`)
    ]);
    res.json({ members: members.rows, totals: totals.rows[0], recent: recent.rows, split: { member: MEMBER_PERCENT, platform: PLATFORM_PERCENT } });
  } catch (error) { next(error); }
});

app.post('/api/admin/members', requireAdmin, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const fullName = String(req.body.fullName || '').trim();
    const tempPassword = String(req.body.tempPassword || '');
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || username === 'admin') {
      return res.status(400).json({ error: 'Identifiant invalide : 3 à 32 caractères, sans espace.' });
    }
    if (fullName.length < 2 || fullName.length > 80) return res.status(400).json({ error: 'Nom affiché : 2 à 80 caractères.' });
    if (tempPassword.length < 12) return res.status(400).json({ error: 'Le mot de passe temporaire doit contenir au moins 12 caractères.' });
    const hash = await bcrypt.hash(tempPassword, 12);
    const id = crypto.randomUUID();
    const result = await pool.query(
      'INSERT INTO qwesto_members (id,username,full_name,password_hash,must_change_password) VALUES ($1,$2,$3,$4,TRUE) RETURNING id,username,full_name,active,created_at,must_change_password',
      [id, username, fullName, hash]
    );
    res.status(201).json({ ok: true, member: safeUser(result.rows[0]), message: 'Compte de démonstration créé. Le membre devra changer son mot de passe.' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Cet identifiant existe déjà.' });
    next(error);
  }
});

app.patch('/api/admin/members/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const active = req.body.active === true;
    const result = await pool.query('UPDATE qwesto_members SET active=$1 WHERE id=$2 RETURNING id,username,full_name,active', [active, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Membre introuvable.' });
    res.json({ ok: true, member: result.rows[0] });
  } catch (error) { next(error); }
});

app.post('/api/admin/members/:id/reset-password', requireAdmin, async (req, res, next) => {
  try {
    const tempPassword = String(req.body.tempPassword || '');
    if (tempPassword.length < 12) return res.status(400).json({ error: '12 caractères minimum.' });
    const hash = await bcrypt.hash(tempPassword, 12);
    const result = await pool.query('UPDATE qwesto_members SET password_hash=$1,must_change_password=TRUE WHERE id=$2 RETURNING id', [hash, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Membre introuvable.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/member/summary', requireMember, async (req, res, next) => {
  try {
    const [summary, history] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(gross_cents),0)::bigint AS gross,
        COALESCE(SUM(member_cents),0)::bigint AS member,
        COUNT(*)::int AS transactions FROM qwesto_demo_ledger WHERE member_id=$1`, [req.session.user.id]),
      pool.query(`SELECT tx_id,survey_title,gross_cents,member_cents,created_at FROM qwesto_demo_ledger WHERE member_id=$1 ORDER BY created_at DESC LIMIT 30`, [req.session.user.id])
    ]);
    res.json({ summary: summary.rows[0], history: history.rows, split: { member: MEMBER_PERCENT, platform: PLATFORM_PERCENT } });
  } catch (error) { next(error); }
});

app.get('/api/demo/surveys', requireMember, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ surveys: DEMO_SURVEYS, demo: true, message: 'Offres fictives : aucun sondage réel et aucune rémunération.' });
});

app.post('/api/demo/complete', requireMember, async (req, res, next) => {
  try {
    const survey = DEMO_SURVEYS.find(item => item.id === String(req.body.surveyId || ''));
    if (!survey) return res.status(404).json({ error: 'Sondage de démonstration introuvable.' });
    const txId = `DEMO-${crypto.randomUUID()}`;
    const memberCents = Math.round(survey.rewardCents * MEMBER_PERCENT / 100);
    const platformCents = survey.rewardCents - memberCents;
    await pool.query(`INSERT INTO qwesto_demo_ledger (tx_id,member_id,survey_id,survey_title,gross_cents,member_cents,platform_cents)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [txId, req.session.user.id, survey.id, survey.title, survey.rewardCents, memberCents, platformCents]);
    res.status(201).json({ ok: true, demo: true, grossCents: survey.rewardCents, memberCents, platformCents, message: 'Simulation enregistrée : ce montant est fictif et ne sera pas payé.' });
  } catch (error) { next(error); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((_req, res) => res.status(404).json({ error: 'Route introuvable.' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Erreur serveur. Consulte les logs Render.' });
});

async function start() {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => console.log(`Qwesto DEMO lancé sur le port ${PORT}`));
}
start().catch(error => { console.error('Impossible de démarrer Qwesto :', error); process.exit(1); });

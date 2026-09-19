const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 4173;
const root = __dirname;
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'northstar.sqlite'));

db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    ats_score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const seedCount = db.prepare('SELECT COUNT(*) AS count FROM resumes').get().count;
if (seedCount === 0) {
  const addResume = db.prepare('INSERT INTO resumes (title, ats_score, status) VALUES (?, ?, ?)');
  addResume.run('Product Designer · 2026', 92, 'recommended');
  addResume.run('General application · 2026', 84, 'draft');
}
if (db.prepare('SELECT COUNT(*) AS count FROM plan_items').get().count === 0) {
  const addPlan = db.prepare('INSERT INTO plan_items (title, description, completed, sort_order) VALUES (?, ?, ?, ?)');
  addPlan.run('Define your target roles', 'Product design · UX research', 1, 1);
  addPlan.run('Refresh your headline', 'Clear, specific, and searchable', 1, 2);
  addPlan.run('Practice your portfolio story', 'Build a 90-second project walkthrough', 0, 3);
  addPlan.run('Apply to three aligned roles', 'We found 12 opportunities to review', 0, 4);
}
if (db.prepare('SELECT COUNT(*) AS count FROM activity').get().count === 0) {
  const addActivity = db.prepare('INSERT INTO activity (kind, title, description) VALUES (?, ?, ?)');
  addActivity.run('feedback', 'Resume feedback is ready', 'Product Designer · 3 suggestions to review');
  addActivity.run('opportunity', 'You saved a new opportunity', 'Junior Product Designer · Lumen Labs');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function dashboard() {
  const resumes = db.prepare("SELECT id, title, ats_score AS atsScore, status, updated_at AS updatedAt FROM resumes ORDER BY CASE status WHEN 'recommended' THEN 0 ELSE 1 END, updated_at DESC, id DESC").all();
  const plan = db.prepare('SELECT id, title, description, completed FROM plan_items ORDER BY sort_order').all().map((item) => ({ ...item, completed: Boolean(item.completed) }));
  const activity = db.prepare('SELECT id, kind, title, description, created_at AS createdAt FROM activity ORDER BY id DESC LIMIT 5').all();
  return {
    user: { name: 'Alex Morgan', initials: 'AM' },
    metrics: { profileStrength: 78, applications: 14, activeApplications: 3, interviews: 4, coachSessions: 6 },
    resumes,
    plan,
    activity,
    nextSession: { title: 'Portfolio storytelling', date: 'Tomorrow · 4:30 PM', duration: '15 minutes with Northstar AI' }
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/dashboard') return json(res, 200, dashboard());
  if (req.method === 'POST' && pathname === '/api/resumes') {
    const body = await getBody(req);
    const title = String(body.title || '').trim() || 'Untitled resume';
    const result = db.prepare('INSERT INTO resumes (title, ats_score, status) VALUES (?, 0, ?)').run(title, 'draft');
    db.prepare('INSERT INTO activity (kind, title, description) VALUES (?, ?, ?)').run('resume', 'New resume workspace created', title);
    return json(res, 201, { id: Number(result.lastInsertRowid), title });
  }
  const planMatch = pathname.match(/^\/api\/plan\/(\d+)\/complete$/);
  if (req.method === 'PATCH' && planMatch) {
    const id = Number(planMatch[1]);
    const result = db.prepare('UPDATE plan_items SET completed = 1 WHERE id = ?').run(id);
    if (!result.changes) return json(res, 404, { error: 'Plan item not found' });
    return json(res, 200, { ok: true, plan: dashboard().plan });
  }
  if (req.method === 'POST' && pathname === '/api/coaching/session') {
    db.prepare('INSERT INTO activity (kind, title, description) VALUES (?, ?, ?)').run('session', 'Coaching session started', 'Portfolio storytelling');
    return json(res, 201, { ok: true, message: 'Your coaching session has started.' });
  }
  return json(res, 404, { error: 'API route not found' });
}

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function serveStatic(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return json(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  try {
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
    else serveStatic(res, pathname);
  } catch (error) {
    json(res, 400, { error: error.message });
  }
});

server.listen(PORT, () => console.log(`Northstar running at http://localhost:${PORT}`));
process.on('SIGINT', () => { db.close(); server.close(() => process.exit(0)); });

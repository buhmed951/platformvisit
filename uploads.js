// GET  /api/uploads            -> all shared batches (public, read-only)
// POST /api/uploads {action:'upload'|'delete', pin, ...}  -> PIN is verified HERE, on the server.
const crypto = require('crypto');
const store = require('../lib/store');

const KEEP_MS = 14 * 24 * 3600 * 1000;           // deletion window per upload
const PIN_HASH = process.env.ADMIN_PIN_HASH ||   // sha256('opd-dhofar:' + PIN); the PIN itself is never stored
  '12d345a62575e3eb885dfd6b489d154044edff2267aaf2d9d40633847bf5472c';
const MAX_ROWS = 30000;

const sha = p => crypto.createHash('sha256').update('opd-dhofar:' + String(p == null ? '' : p).trim()).digest('hex');
const pinOk = p => { const a = Buffer.from(sha(p)), b = Buffer.from(PIN_HASH); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = r => r.slice(0, 7).join('|');

function view(state, extra) {
  const now = Date.now();
  return Object.assign({
    now, keepDays: 14,
    batches: state.batches.map(b => ({ id: b.id, ts: b.ts, name: b.name, rows: b.rows, open: now - b.ts < KEEP_MS }))
  }, extra || {});
}

function cleanRows(raw) {
  if (!Array.isArray(raw) || !raw.length) return { err: 'لا توجد سجلات.' };
  if (raw.length > MAX_ROWS) return { err: 'عدد السجلات كبير جداً.' };
  const out = [];
  for (const r of raw) {
    if (!Array.isArray(r) || r.length !== 8) return { err: 'صيغة السجلات غير صحيحة.' };
    const [y, m, w, e, t, h, s, v] = r;
    if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) return { err: 'سنة أو شهر غير صالح.' };
    if (!Number.isFinite(v) || v < 0 || v > 1e7) return { err: 'قيمة زيارات غير صالحة.' };
    const strs = [w, e, t, h, s];
    if (strs.some(x => typeof x !== 'string' || !x.trim() || x.length > 100)) return { err: 'نص غير صالح في أحد الأعمدة.' };
    out.push([y, m, w.trim().toUpperCase(), e.trim().toUpperCase(), t.trim().toUpperCase(), h.trim().toUpperCase(), s.trim().toUpperCase(), Math.round(v)]);
  }
  return { rows: out };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => res.status(code).json(obj);
  try {
    if (req.method === 'GET') return send(200, view(await store.read()));
    if (req.method !== 'POST') return send(405, { error: 'method' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const state = await store.read();
    const now = Date.now();
    state.fails = (state.fails || []).filter(t => now - t < 15 * 60 * 1000);
    if (state.fails.length >= 5) return send(429, { error: 'locked', message: 'محاولات كثيرة خاطئة. حاول بعد 15 دقيقة.' });
    if (!pinOk(body.pin)) {
      state.fails.push(now); await store.write(state); await sleep(700);
      return send(403, { error: 'pin' });
    }
    state.fails = [];

    if (body.action === 'delete') {
      if (!state.batches.length) return send(404, { error: 'none' });
      const keep = state.batches.filter(b => now - b.ts >= KEEP_MS);       // locked batches can never be removed
      const deleted = state.batches.length - keep.length;
      if (!deleted) { await store.write(state); return send(409, { error: 'locked' }); }
      state.batches = keep; await store.write(state);
      return send(200, view(state, { deleted }));
    }

    if (body.action === 'upload') {
      const c = cleanRows(body.rows);
      if (c.err) return send(400, { error: 'invalid', message: c.err });
      const have = new Set(); state.batches.forEach(b => b.rows.forEach(r => have.add(key(r))));
      const fresh = c.rows.filter(r => { const k = key(r); if (have.has(k)) return false; have.add(k); return true; });
      if (fresh.length) {
        state.batches.push({ id: crypto.randomUUID(), ts: now, name: String(body.name || '').slice(0, 120), rows: fresh });
      }
      await store.write(state);
      return send(200, view(state, { added: fresh.length, skipped: c.rows.length - fresh.length }));
    }
    return send(400, { error: 'action' });
  } catch (e) {
    console.error(e);
    return send(500, { error: 'server', message: String(e.message || e) });
  }
};

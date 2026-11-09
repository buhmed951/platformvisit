// Storage adapter: Vercel Blob in production, a local JSON file for tests.
const fs = require('fs');
const KEY = 'opd/state.json';
const EMPTY = () => ({ batches: [], fails: [] });

async function read() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { list } = require('@vercel/blob');
    const { blobs } = await list({ prefix: KEY });
    const b = blobs.find(x => x.pathname === KEY);
    if (!b) return EMPTY();
    const r = await fetch(b.url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('blob read failed: ' + r.status);
    return await r.json();
  }
  const f = process.env.OPD_LOCAL_STORE;
  if (!f) throw new Error('No storage configured: connect a Vercel Blob store to this project.');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : EMPTY();
}

async function write(state) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require('@vercel/blob');
    await put(KEY, JSON.stringify(state), {
      access: 'public', addRandomSuffix: false, allowOverwrite: true,
      contentType: 'application/json', cacheControlMaxAge: 60
    });
    return;
  }
  fs.writeFileSync(process.env.OPD_LOCAL_STORE, JSON.stringify(state));
}
module.exports = { read, write };

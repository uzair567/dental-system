const { TABLES } = require('./store');

async function isOnline(serverUrl) {
  if (!serverUrl) return false;
  try {
    const res = await fetch(serverUrl.replace(/\/$/, '') + '/api/health', { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch (e) { return false; }
}

async function login(serverUrl, email, password) {
  const res = await fetch(serverUrl.replace(/\/$/, '') + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Login failed');
  return res.json();
}

async function syncNow(store, serverUrl, authToken, onLog) {
  const log = onLog || (() => {});
  if (!(await isOnline(serverUrl))) {
    log('Offline — changes are saved locally and will sync automatically once you\'re back online.');
    return { ok: false, reason: 'offline' };
  }
  if (!authToken) {
    log('Not signed in to the live server — sign in once to enable syncing.');
    return { ok: false, reason: 'unauthenticated' };
  }

  const meta = store.getMeta();
  const base = serverUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken };

  // 1) PUSH: send everything not yet synced
  const entities = {};
  const pushedIdsByTable = {};
  for (const table of TABLES) {
    const unsynced = store.unsynced(table);
    if (unsynced.length) {
      entities[table] = unsynced.map(({ _synced, ...rest }) => rest);
      pushedIdsByTable[table] = unsynced.map(r => r.id);
    }
  }

  if (Object.keys(entities).length) {
    const res = await fetch(base + '/api/sync/push', {
      method: 'POST', headers, body: JSON.stringify({ deviceId: meta.deviceId, entities })
    });
    if (!res.ok) { log('Push failed: ' + (await res.text())); return { ok: false, reason: 'push_failed' }; }
    const result = await res.json();
    for (const table of Object.keys(pushedIdsByTable)) store.markSynced(table, pushedIdsByTable[table]);
    log(`Pushed ${Object.values(result.synced || {}).reduce((a, b) => a + b, 0)} record(s) to the server.`);
  } else {
    log('Nothing new to push.');
  }

  // 2) PULL: fetch everything changed on the server since last pull
  const since = meta.lastPullAt || '1970-01-01T00:00:00.000Z';
  const pullRes = await fetch(base + '/api/sync/pull?since=' + encodeURIComponent(since), { headers });
  if (!pullRes.ok) { log('Pull failed: ' + (await pullRes.text())); return { ok: false, reason: 'pull_failed' }; }
  const pulled = await pullRes.json();
  for (const table of TABLES) {
    if (pulled.data[table] && pulled.data[table].length) {
      store.upsertFromServer(table, pulled.data[table]);
    }
  }
  store.setMeta({ lastPullAt: pulled.pulledAt });
  log(`Pulled latest changes from the server as of ${new Date(pulled.pulledAt).toLocaleTimeString()}.`);

  return { ok: true };
}

module.exports = { isOnline, login, syncNow };

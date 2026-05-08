const DB_NAME = 'verdiqt';
const DB_VERSION = 1;

const STORES = {
  cases:    { keyPath: 'id', indexes: ['clientId', 'status', 'createdAt'] },
  clients:  { keyPath: 'id', indexes: ['name'] },
  docs:     { keyPath: 'id', indexes: ['clientId', 'caseId'] },
  invoices: { keyPath: 'id', indexes: ['clientId', 'caseId', 'status'] },
  settings: { keyPath: 'key' },
  ccma:     { keyPath: 'caseId', indexes: ['deadline', 'status'] }
};

let _db = null;

export async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      Object.entries(STORES).forEach(([name, cfg]) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: cfg.keyPath });
          (cfg.indexes || []).forEach(idx => store.createIndex(idx, idx));
        }
      });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function put(store, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = e => reject(e.target.error);
  });
}

export async function get(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

export async function getAll(store, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    const req = indexName ? os.index(indexName).getAll(value) : os.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = e => reject(e.target.error);
  });
}

export async function remove(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

export async function getSetting(key, fallback = null) {
  const rec = await get('settings', key);
  return rec ? rec.value : fallback;
}

export async function setSetting(key, value) {
  return put('settings', { key, value });
}

export async function exportAllData() {
  const db = await openDB();
  const out = {};
  for (const store of Object.keys(STORES)) {
    out[store] = await getAll(store);
  }
  return JSON.stringify(out, null, 2);
}

export async function importData(json) {
  const data = JSON.parse(json);
  for (const [store, records] of Object.entries(data)) {
    for (const rec of records) await put(store, rec);
  }
}

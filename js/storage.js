// IndexedDB persistence for projects and media blobs (everything stays on the
// user's device). Falls back to memory when IndexedDB is unavailable.

const DB_NAME = 'luzmap';
const DB_VERSION = 1;

let dbPromise = null;
const memory = { projects: new Map(), media: new Map(), kv: new Map() };
let usingMemory = false;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      usingMemory = true;
      resolve(null);
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (_) {
      usingMemory = true;
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('IndexedDB indisponível, usando memória.', req.error);
      usingMemory = true;
      resolve(null);
    };
    req.onblocked = () => console.warn('IndexedDB bloqueado por outra aba.');
  });
  return dbPromise;
}

function friendlyError(err) {
  if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''))) {
    const e = new Error('Espaço de armazenamento do navegador esgotado. Exclua projetos ou mídias antigas.');
    e.code = 'quota';
    return e;
  }
  return err instanceof Error ? err : new Error(String(err));
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  if (!db) return fn(null, memory[storeName]);
  return new Promise((resolve, reject) => {
    let result;
    let t;
    try {
      t = db.transaction(storeName, mode);
    } catch (err) {
      reject(friendlyError(err));
      return;
    }
    const store = t.objectStore(storeName);
    Promise.resolve(fn(store, null)).then((r) => {
      result = r;
    }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(friendlyError(t.error));
    t.onabort = () => reject(friendlyError(t.error));
  });
}

const req2p = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const storage = {
  get isPersistentDB() {
    return !usingMemory;
  },
  ready: () => openDB().then(() => !usingMemory),

  async saveProject(project, thumb = null) {
    const rec = {
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt || Date.now(),
      createdAt: project.createdAt || Date.now(),
      surfaces: project.surfaces.length,
      thumb,
      data: JSON.parse(JSON.stringify(project)),
    };
    return tx('projects', 'readwrite', (store, mem) => {
      if (mem) mem.set(rec.id, rec);
      else store.put(rec);
      return rec;
    });
  },

  async getProject(id) {
    return tx('projects', 'readonly', (store, mem) => (mem ? mem.get(id) || null : req2p(store.get(id))));
  },

  async listProjects() {
    const all = await tx('projects', 'readonly', (store, mem) => (mem ? [...mem.values()] : req2p(store.getAll())));
    return (all || [])
      .map(({ id, name, updatedAt, createdAt, surfaces, thumb }) => ({ id, name, updatedAt, createdAt, surfaces, thumb }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async deleteProject(id) {
    return tx('projects', 'readwrite', (store, mem) => (mem ? mem.delete(id) : store.delete(id)));
  },

  async putMedia(rec) {
    return tx('media', 'readwrite', (store, mem) => {
      if (mem) mem.set(rec.id, rec);
      else store.put(rec);
      return rec.id;
    });
  },

  async getMedia(id) {
    return tx('media', 'readonly', (store, mem) => (mem ? mem.get(id) || null : req2p(store.get(id))));
  },

  async listMedia() {
    const all = await tx('media', 'readonly', (store, mem) => (mem ? [...mem.values()] : req2p(store.getAll())));
    return (all || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  async deleteMedia(id) {
    return tx('media', 'readwrite', (store, mem) => (mem ? mem.delete(id) : store.delete(id)));
  },

  async setKV(k, v) {
    return tx('kv', 'readwrite', (store, mem) => (mem ? mem.set(k, { k, v }) : store.put({ k, v })));
  },

  async getKV(k) {
    const r = await tx('kv', 'readonly', (store, mem) => (mem ? mem.get(k) || null : req2p(store.get(k))));
    return r ? r.v : null;
  },

  async estimate() {
    try {
      if (navigator.storage?.estimate) return await navigator.storage.estimate();
    } catch (_) {
      /* ignored */
    }
    return null;
  },

  async requestPersistence() {
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist();
      return true;
    } catch (_) {
      return false;
    }
  },
};

// Light preferences live in localStorage (wrapped: Safari private mode can throw).
export const prefs = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(`luzmap.${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`luzmap.${key}`, JSON.stringify(value));
    } catch (_) {
      /* ignored */
    }
  },
};

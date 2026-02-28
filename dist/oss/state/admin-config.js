// OSS stub — in-memory config
const _store = new Map();
export function init() {}
export function get(key) { return _store.has(key) ? JSON.parse(_store.get(key)) : undefined; }
export function set(key, value) { _store.set(key, JSON.stringify(value)); return value; }
export function getAll() { const o = {}; for (const [k,v] of _store) o[k] = JSON.parse(v); return o; }
function deleteKey(key) { _store.delete(key); }
export { deleteKey as delete };
export function setDefaults(defaults) { for (const [k,v] of Object.entries(defaults)) { if (!_store.has(k)) set(k,v); } }
export function setMany(entries) { for (const [k,v] of Object.entries(entries)) set(k,v); }
export function getAllWithMeta() { return []; }
export function has(key) { return _store.has(key); }
export function count() { return _store.size; }

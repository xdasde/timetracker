const P = 'tt.';

export function getCollection(name) {
  try { return JSON.parse(localStorage.getItem(P + name) || '[]'); }
  catch { return []; }
}

export function setCollection(name, data) {
  try { localStorage.setItem(P + name, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function addToCollection(name, item) {
  const col = getCollection(name);
  col.push(item);
  return setCollection(name, col);
}

export function removeFromCollection(name, id) {
  return setCollection(name, getCollection(name).filter(i => i.id !== id));
}

export function updateInCollection(name, id, updates) {
  return setCollection(name, getCollection(name).map(i => i.id === id ? { ...i, ...updates } : i));
}

export function getItem(name) {
  try { return JSON.parse(localStorage.getItem(P + name)); }
  catch { return null; }
}

export function setItem(name, value) {
  try { localStorage.setItem(P + name, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function removeItem(name) {
  localStorage.removeItem(P + name);
}

export function clearAll() {
  Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k));
}

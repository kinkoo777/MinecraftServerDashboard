const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getConfig, saveConfig, DATA_DIR, serverDir } = require('../config');

/* What the assistant keeps between chats:
   - memory: short notes the owner asked it to remember, put in front of every chat
   - undo:   the previous version of whatever it changed, so a change can be put back
   plus the line diff shown before the owner approves a file change. */

const id = () => crypto.randomBytes(4).toString('hex');
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } };
const writeJson = (file, data) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); };

/* ---- memory ---- */

const MEMORY_FILE = path.join(DATA_DIR, 'assistant-memory.json');
const MAX_NOTES = 40;

const memory = {
  list() { const l = readJson(MEMORY_FILE, []); return Array.isArray(l) ? l : []; },
  add(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!t) throw new Error('Nothing to remember');
    const list = this.list();
    if (list.some(n => n.text.toLowerCase() === t.toLowerCase())) return { ok: true, note: 'Already remembered.' };
    if (list.length >= MAX_NOTES) throw new Error(`Memory is full (${MAX_NOTES} notes) — forget one first`);
    const note = { id: id(), text: t, at: Date.now() };
    writeJson(MEMORY_FILE, [...list, note]);
    return { ok: true, id: note.id };
  },
  remove(noteId) {
    const list = this.list();
    const next = list.filter(n => n.id !== String(noteId));
    if (next.length === list.length) throw new Error('No such note — the ids are in the list of remembered notes');
    writeJson(MEMORY_FILE, next);
    return { ok: true };
  }
};

/* ---- undo ---- */

const UNDO_DIR = path.join(DATA_DIR, 'assistant-undo');
const UNDO_INDEX = path.join(UNDO_DIR, 'index.json');
const MAX_UNDO = 25;
const MAX_FILE = 5 * 1048576;

// a path inside the active server directory, or an error
function inServer(rel) {
  const root = path.resolve(serverDir());
  const full = path.resolve(root, String(rel || ''));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('That path is outside the server directory');
  return full;
}

const undo = {
  list() { const l = readJson(UNDO_INDEX, []); return Array.isArray(l) ? l : []; },

  _push(entry) {
    fs.mkdirSync(UNDO_DIR, { recursive: true });
    const e = { id: id(), at: Date.now(), server: path.resolve(serverDir()), ...entry };
    const list = [e, ...this.list()];
    for (const old of list.slice(MAX_UNDO)) if (old.copy) fs.rmSync(path.join(UNDO_DIR, old.copy), { force: true });
    writeJson(UNDO_INDEX, list.slice(0, MAX_UNDO));
    return e.id;
  },

  // Keep the current version of a file that is about to be written, changed or deleted.
  // Returns null when it can't be kept (a folder, or too large).
  file(rel, label) {
    const full = inServer(rel);
    const existed = fs.existsSync(full);
    if (existed) { const st = fs.statSync(full); if (!st.isFile() || st.size > MAX_FILE) return null; }
    let copy = null;
    if (existed) {
      fs.mkdirSync(UNDO_DIR, { recursive: true });
      copy = `${id()}.bak`;
      fs.copyFileSync(full, path.join(UNDO_DIR, copy));
    }
    return this._push({ kind: 'file', label, path: path.relative(path.resolve(serverDir()), full), existed, copy });
  },

  // Keep the current values of dashboard settings that are about to change.
  config(keys, label) {
    const c = getConfig();
    return this._push({ kind: 'config', label, values: Object.fromEntries(keys.map(k => [k, c[k]])) });
  },

  rename(from, to, label) {
    inServer(from); inServer(to);
    return this._push({ kind: 'rename', label, from, to });
  },

  // the change didn't happen after all
  drop(entryId) {
    if (!entryId) return;
    const list = this.list();
    const e = list.find(x => x.id === entryId);
    if (!e) return;
    if (e.copy) fs.rmSync(path.join(UNDO_DIR, e.copy), { force: true });
    writeJson(UNDO_INDEX, list.filter(x => x.id !== entryId));
  },

  // Put one change back (the newest when no id is given).
  revert(entryId) {
    const list = this.list();
    const e = entryId ? list.find(x => x.id === String(entryId)) : list[0];
    if (!e) throw new Error(entryId ? 'No such change — see list_changes' : 'There is nothing to undo');
    if (e.server !== path.resolve(serverDir())) throw new Error('That change was made on a different server — switch to it first');
    if (e.kind === 'file') {
      const full = inServer(e.path);
      if (e.existed) {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.copyFileSync(path.join(UNDO_DIR, e.copy), full);
      } else fs.rmSync(full, { force: true });
    } else if (e.kind === 'config') {
      saveConfig(e.values);
    } else if (e.kind === 'rename') {
      const from = inServer(e.from), to = inServer(e.to);
      if (!fs.existsSync(to)) throw new Error(`${e.to} no longer exists`);
      if (fs.existsSync(from)) throw new Error(`${e.from} exists again — it would be overwritten`);
      fs.renameSync(to, from);
    }
    this.drop(e.id);
    return { ok: true, undone: e.label };
  }
};

/* ---- line diff ---- */

// Lines that differ between two texts, with a little unchanged context:
// [{ t: '+' | '-' | ' ' | '…', s }]. Capped so it fits an approval card.
function diff(oldText, newText, max = 80) {
  const a = String(oldText || '').split(/\r?\n/), b = String(newText || '').split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let ea = a.length, eb = b.length;
  while (ea > start && eb > start && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const ma = a.slice(start, ea), mb = b.slice(start, eb);
  let ops = [];
  if (ma.length * mb.length <= 250000) {
    // longest common subsequence over the changed middle
    const w = mb.length + 1;
    const lcs = new Uint16Array((ma.length + 1) * w);
    for (let i = ma.length - 1; i >= 0; i--) for (let j = mb.length - 1; j >= 0; j--) {
      lcs[i * w + j] = ma[i] === mb[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
    let i = 0, j = 0;
    while (i < ma.length && j < mb.length) {
      if (ma[i] === mb[j]) { ops.push({ t: ' ', s: ma[i] }); i++; j++; }
      else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) ops.push({ t: '-', s: ma[i++] });
      else ops.push({ t: '+', s: mb[j++] });
    }
    while (i < ma.length) ops.push({ t: '-', s: ma[i++] });
    while (j < mb.length) ops.push({ t: '+', s: mb[j++] });
  } else {
    ops = [...ma.map(s => ({ t: '-', s })), ...mb.map(s => ({ t: '+', s }))];
  }
  ops = [...a.slice(Math.max(0, start - 2), start).map(s => ({ t: ' ', s })), ...ops, ...a.slice(ea, ea + 2).map(s => ({ t: ' ', s }))];
  // keep changed lines and two lines around them
  const keep = ops.map((o, k) => o.t !== ' ' || ops.slice(Math.max(0, k - 2), k + 3).some(x => x.t !== ' '));
  const out = [];
  ops.forEach((o, k) => {
    if (keep[k]) out.push({ t: o.t, s: o.s.length > 200 ? `${o.s.slice(0, 200)}…` : o.s });
    else if (out.length && out[out.length - 1].t !== '…') out.push({ t: '…', s: '' });
  });
  const changed = ops.filter(o => o.t !== ' ').length;
  if (out.length > max) return { changed, lines: [...out.slice(0, max), { t: '…', s: `${out.length - max} more lines` }] };
  return { changed, lines: out };
}

module.exports = { memory, undo, diff, inServer };

const fs = require('fs');

// Parse a .properties file preserving comments and line order.
function parse(text) {
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return { type: 'raw', line };
    const eq = line.indexOf('=');
    if (eq === -1) return { type: 'raw', line };
    return { type: 'kv', key: line.slice(0, eq).trim(), value: line.slice(eq + 1) };
  });
}

function readProperties(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const entry of parse(fs.readFileSync(file, 'utf8'))) {
    if (entry.type === 'kv') out[entry.key] = entry.value;
  }
  return out;
}

// Merge updates into the file, preserving comments/order; append new keys at the end.
function writeProperties(file, updates) {
  // strip line breaks so a stray newline in a value can't corrupt the file layout
  const clean = (v) => String(v).replace(/[\r\n]+/g, ' ');
  const entries = fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')) : [];
  const remaining = { ...updates };
  const lines = entries.map((e) => {
    if (e.type === 'kv' && e.key in remaining) {
      const v = clean(remaining[e.key]);
      delete remaining[e.key];
      return `${e.key}=${v}`;
    }
    return e.type === 'kv' ? `${e.key}=${e.value}` : e.line;
  });
  for (const [k, v] of Object.entries(remaining)) lines.push(`${clean(k).replace(/=/g, '')}=${clean(v)}`);
  fs.writeFileSync(file, lines.join('\n'));
}

module.exports = { readProperties, writeProperties };

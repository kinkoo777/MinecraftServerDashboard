/* Crash explainer: reads the console output of a run that failed and names the
   likely cause in plain language. Returns null when nothing is recognised.

   { id, title, detail, fix?, retry? }
     fix   — something the dashboard can do about it: { action, label, ... }
     retry — true when simply starting again may work (so auto-restart still makes sense) */

const FORGE_DEP_RE = /Mod ID: '([^']+)', Requested by: '([^']+)', Expected range: '([^']*)', Actual version: '([^']*)'/;
// NeoForge 1.21+: "Mod examplemod requires geckolib 4.4 or above" + "Currently, geckolib is not installed"
const NEO_DEP_RE = /Mod (\S+) requires (\S+) (.+)$/;
const NEO_MISSING_RE = /Currently, (\S+) is not installed/;
// Fabric: " - Mod 'Sodium Extra' (sodium-extra) 0.5.4 requires any version of sodium, which is missing!"
const FABRIC_MISSING_RE = /Mod '([^']+)' \(([^)]+)\) \S+ requires (.+?) of (?:mod )?'?([\w.-]+?)'?,? which is missing/;
const FABRIC_WRONG_RE = /Mod '([^']+)' \(([^)]+)\) \S+ requires (.+?) of (?:mod )?'?([^',]+?)'?(?: \(([\w.-]+)\))?, but only the wrong version is present: ([^!]+)!/;
const BUILTIN = new Set(['minecraft', 'forge', 'neoforge', 'fabricloader', 'fabric-loader', 'java']);

const list = (arr) => arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;

function missingMods(lines) {
  const missing = new Map(); // dependency id -> Set of mods that need it
  const wrong = [];          // { mod, dep, want, have }
  const add = (dep, by) => {
    if (!missing.has(dep)) missing.set(dep, new Set());
    if (by) missing.get(dep).add(by);
  };
  const neoWants = new Map();
  for (const line of lines) {
    let m;
    if ((m = FORGE_DEP_RE.exec(line))) {
      if (/MISSING/i.test(m[4])) add(m[1], m[2]);
      else wrong.push({ mod: m[2], dep: m[1], want: m[3], have: m[4] });
    } else if ((m = FABRIC_MISSING_RE.exec(line))) {
      add(m[4], m[1]);
    } else if ((m = FABRIC_WRONG_RE.exec(line))) {
      wrong.push({ mod: m[1], dep: m[5] || m[4], want: m[3], have: m[6].trim() });
    } else if ((m = NEO_MISSING_RE.exec(line))) {
      add(m[1], neoWants.get(m[1]));
    } else if ((m = NEO_DEP_RE.exec(line))) {
      neoWants.set(m[2], m[1]);
    }
  }
  return { missing, wrong };
}

function diagnose(lines, ctx = {}) {
  const text = lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/§./g, '')); // ANSI + Minecraft colour codes
  const has = (re) => text.find(l => re.test(l));

  const { missing, wrong } = missingMods(text);
  const installable = [...missing.keys()].filter(id => !BUILTIN.has(id.toLowerCase()));
  if (installable.length) {
    const who = [...new Set(installable.flatMap(id => [...missing.get(id)]))];
    return {
      id: 'missing-mods',
      title: `Missing mod${installable.length === 1 ? '' : 's'}: ${list(installable)}`,
      detail: `${who.length ? list(who) : 'One of your mods'} can't work without ${installable.length === 1 ? 'it' : 'them'}, so the server refuses to start.`,
      fix: { action: 'install-mods', ids: installable, label: installable.length === 1 ? `Install ${installable[0]}` : `Install ${installable.length} missing mods` }
    };
  }
  // a required built-in is missing or the wrong version: the mod is for another Minecraft/loader
  const builtin = wrong.find(w => BUILTIN.has(w.dep.toLowerCase())) ||
    [...missing.keys()].filter(id => BUILTIN.has(id.toLowerCase())).map(dep => ({ mod: [...missing.get(dep)][0] || 'A mod', dep, want: '', have: '' }))[0];
  if (builtin) {
    const what = builtin.dep.toLowerCase() === 'minecraft' ? 'Minecraft' : builtin.dep;
    return {
      id: 'wrong-version-mod',
      title: `${builtin.mod} is made for a different ${what} version`,
      detail: `It needs ${what} ${builtin.want}${builtin.have ? `, but this server has ${builtin.have}` : ''}. Remove it on the Content page, or install the build of it that matches ${ctx.mc ? `Minecraft ${ctx.mc}` : 'your server'}.`.replace(/\s+,/, ','),
      link: { href: '#plugins', label: 'Open Content' }
    };
  }
  if (wrong.length) {
    const w = wrong[0];
    return {
      id: 'wrong-dep-version',
      title: `${w.mod} needs a different version of ${w.dep}`,
      detail: `It needs ${w.dep} ${w.want}, but ${w.have} is installed. Update ${w.dep} on the Content page (or remove ${w.mod}).`,
      link: { href: '#plugins', label: 'Open Content' }
    };
  }

  if (has(/UnsupportedClassVersionError|compiled by a more recent version of the Java Runtime/)) {
    const line = has(/class file version (\d+)/);
    const need = line ? parseInt(/class file version (\d+)/.exec(line)[1], 10) - 44 : null;
    return {
      id: 'java-too-old',
      title: `This server needs a newer Java${need ? ` (Java ${need})` : ''}`,
      detail: 'The Java it was started with is too old. Clear Settings → Java path so the dashboard picks (and downloads) the right one, then press Start.',
      link: { href: '#settings', label: 'Open Settings' }
    };
  }

  if (has(/FAILED TO BIND TO PORT/)) {
    return {
      id: 'port-in-use',
      title: `Port ${ctx.port || 25565} is already in use`,
      detail: 'Another program is using the server\'s port — almost always a second copy of this server that is still running. Close it (or restart the computer), then press Start.'
    };
  }

  if (has(/Could not reserve enough space|Invalid (?:maximum|initial) heap size|Initial heap size set to a larger value|Too small (?:maximum|initial) heap/)) {
    return {
      id: 'bad-ram',
      title: 'The RAM setting does not work on this computer',
      detail: `Java could not get the memory it was asked for${ctx.maxRam ? ` (Max RAM ${ctx.maxRam})` : ''}. Lower Max RAM in Settings, and make sure Min RAM is not larger than Max RAM.`,
      link: { href: '#settings', label: 'Open Settings' }
    };
  }
  if (has(/java\.lang\.OutOfMemoryError/)) {
    return {
      id: 'out-of-memory',
      title: 'The server ran out of memory',
      detail: `It needs more than ${ctx.maxRam || 'its Max RAM'}. Raise Max RAM in Settings (modpacks usually want 4G–8G), or remove some mods.`,
      link: { href: '#settings', label: 'Open Settings' },
      retry: true
    };
  }

  if (has(/already locked \(possibly by other Minecraft instance|session\.lock.*(?:locked|in use)/)) {
    return {
      id: 'world-locked',
      title: 'The world is in use by another running server',
      detail: 'A second copy of the server still has this world open. Close it (or restart the computer), then press Start.'
    };
  }

  if (has(/invalid dist DEDICATED_SERVER|Attempted to load class net\/minecraft\/client|in environment type SERVER|Client environment required/)) {
    const line = has(/Mod (?:File|file)?:? ?\S*[\\/]mods[\\/]([^\\/\s]+\.jar)/) || has(/[\\/]mods[\\/]([^\\/\s]+\.jar)/);
    const jar = line ? /[\\/]mods[\\/]([^\\/\s]+\.jar)/.exec(line)[1] : null;
    return {
      id: 'client-only-mod',
      title: 'A client-only mod is installed on the server',
      detail: `${jar ? `${jar} looks like the cause. ` : ''}Mods that only change what you see (shaders, minimaps, menus…) crash a server. Remove ${jar ? 'it' : 'them'} on the Content page.`,
      link: { href: '#plugins', label: 'Open Content' }
    };
  }

  if (has(/[Dd]uplicate mod/)) {
    return {
      id: 'duplicate-mods',
      title: 'The same mod is installed twice',
      detail: 'Two files of the same mod are in the mods folder (usually an old and a new version). Delete the older one on the Content page.',
      link: { href: '#plugins', label: 'Open Content' }
    };
  }

  if (has(/Server downgrades are not supported|was saved in a newer version|Newer version! Server downgrades/)) {
    return {
      id: 'world-newer',
      title: 'This world was saved by a newer Minecraft version',
      detail: 'Minecraft can\'t open a world with an older version than the one that last saved it. Install that newer version in Settings → Server software, or restore an older backup on the World page.',
      link: { href: '#settings', label: 'Open Settings' }
    };
  }

  if (has(/Failed to load datapacks, can't proceed with server load/)) {
    return {
      id: 'world-incompatible',
      title: 'The world could not be loaded',
      detail: 'It contains data this server doesn\'t understand — usually it was made with mods (or a datapack) that are no longer installed. Put those mods back, or start a fresh world on the World page.',
      link: { href: '#world', label: 'Open World' }
    };
  }

  if (has(/Invalid or corrupt jarfile|Unable to access jarfile|Could not find or load main class/)) {
    return {
      id: 'broken-install',
      title: 'The server files are damaged or missing',
      detail: 'Reinstall the server in Settings → Server software. Your world and settings are kept.',
      link: { href: '#settings', label: 'Open Settings' }
    };
  }

  return null;
}

module.exports = { diagnose };

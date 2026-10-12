/* Command helper for the Console input: as you type it shows what the command
   expects and offers completions (commands, players, items, fixed choices).
   Tab or a click fills one in. */
App.cmdHelp = {
  // [command, arguments, what it does]. <required> [optional]; a|b|c are fixed choices.
  COMMANDS: [
    ['advancement', '<grant|revoke> <player> <everything|only|from|through|until> [advancement]', 'Give or take advancements'],
    ['ban', '<player> [reason]', 'Ban a player'],
    ['ban-ip', '<player> [reason]', 'Ban a player\'s IP address'],
    ['banlist', '[players|ips]', 'Show banned players'],
    ['clear', '[player] [item] [count]', 'Remove items from an inventory'],
    ['damage', '<player> <amount>', 'Hurt a player'],
    ['defaultgamemode', '<survival|creative|adventure|spectator>', 'Gamemode for new players'],
    ['deop', '<player>', 'Remove operator rights'],
    ['difficulty', '<peaceful|easy|normal|hard>', 'Change the difficulty'],
    ['effect', '<give|clear> <player> [effect] [seconds] [level]', 'Give or clear potion effects'],
    ['enchant', '<player> <enchantment> [level]', 'Enchant the item a player holds'],
    ['experience', '<add|set|query> <player> <amount> [points|levels]', 'Change a player\'s XP'],
    ['xp', '<add|set|query> <player> <amount> [points|levels]', 'Change a player\'s XP'],
    ['fill', '<x1> <y1> <z1> <x2> <y2> <z2> <block>', 'Fill an area with a block'],
    ['forceload', '<add|remove|query> [x] [z]', 'Keep chunks loaded'],
    ['gamemode', '<survival|creative|adventure|spectator> [player]', 'Change a player\'s gamemode'],
    ['gamerule', '<rule> [value]', 'Read or change a game rule'],
    ['give', '<player> <item> [count]', 'Give a player an item'],
    ['help', '[command]', 'List commands'],
    ['kick', '<player> [reason]', 'Kick a player'],
    ['kill', '[player]', 'Kill a player or entity'],
    ['list', '', 'Show who is online'],
    ['locate', '<structure|biome|poi> <name>', 'Find the nearest structure or biome'],
    ['me', '<action>', 'Say something as an action'],
    ['msg', '<player> <message>', 'Whisper to a player'],
    ['tell', '<player> <message>', 'Whisper to a player'],
    ['op', '<player>', 'Make a player an operator'],
    ['pardon', '<player>', 'Unban a player'],
    ['pardon-ip', '<ip>', 'Unban an IP address'],
    ['playsound', '<sound> <master|music|record|weather|block|hostile|neutral|player|ambient|voice> <player>', 'Play a sound to a player'],
    ['reload', '', 'Reload datapacks'],
    ['save-all', '[flush]', 'Save the world now'],
    ['save-off', '', 'Turn automatic saving off'],
    ['save-on', '', 'Turn automatic saving on'],
    ['say', '<message>', 'Send a chat message as the server'],
    ['seed', '', 'Show the world seed'],
    ['setblock', '<x> <y> <z> <block>', 'Place a block'],
    ['setworldspawn', '[x] [y] [z]', 'Set where new players spawn'],
    ['spawnpoint', '[player] [x] [y] [z]', 'Set a player\'s spawn point'],
    ['spectate', '[target] [player]', 'Make a spectator watch someone'],
    ['stop', '', 'Stop the server'],
    ['summon', '<entity> [x] [y] [z]', 'Spawn a mob or entity'],
    ['tag', '<player> <add|remove|list> [name]', 'Manage tags on a player'],
    ['teleport', '<player> <target>', 'Teleport a player (to a player or x y z)'],
    ['tp', '<player> <target>', 'Teleport a player (to a player or x y z)'],
    ['tellraw', '<player> <json>', 'Send a formatted chat message'],
    ['tick', '<query|rate|freeze|unfreeze|step|sprint>', 'Inspect or control the tick rate'],
    ['time', '<set|add|query> <day|noon|night|midnight|daytime|gametime>', 'Change or read the time'],
    ['title', '<player> <title|subtitle|actionbar|clear|reset|times> [text]', 'Show text on a player\'s screen'],
    ['weather', '<clear|rain|thunder> [seconds]', 'Change the weather'],
    ['whitelist', '<add|remove|list|on|off|reload> [player]', 'Manage the whitelist'],
    ['worldborder', '<set|add|center|get|damage|warning> [value]', 'Manage the world border'],
    ['tps', '', 'Show server performance (Paper)'],
    ['plugins', '', 'List plugins (Paper)'],
    ['version', '', 'Show the server version (Paper)']
  ],
  SELECTORS: ['@a', '@p', '@r', '@s', '@e'],
  LISTS: {
    rule: ['keepInventory', 'doDaylightCycle', 'doWeatherCycle', 'doMobSpawning', 'mobGriefing', 'doFireTick', 'pvp', 'playersSleepingPercentage',
      'randomTickSpeed', 'showDeathMessages', 'doImmediateRespawn', 'naturalRegeneration', 'doInsomnia', 'announceAdvancements', 'spawnRadius',
      'fallDamage', 'fireDamage', 'drowningDamage', 'freezeDamage', 'doTileDrops', 'doMobLoot', 'doEntityDrops', 'commandBlockOutput', 'sendCommandFeedback', 'maxEntityCramming'],
    effect: ['speed', 'slowness', 'haste', 'strength', 'instant_health', 'instant_damage', 'jump_boost', 'regeneration', 'resistance', 'fire_resistance',
      'water_breathing', 'invisibility', 'blindness', 'night_vision', 'hunger', 'weakness', 'poison', 'wither', 'absorption', 'saturation', 'glowing',
      'levitation', 'slow_falling', 'conduit_power', 'dolphins_grace', 'darkness'],
    enchantment: ['sharpness', 'smite', 'protection', 'fire_protection', 'feather_falling', 'blast_protection', 'projectile_protection', 'respiration',
      'aqua_affinity', 'thorns', 'depth_strider', 'frost_walker', 'knockback', 'fire_aspect', 'looting', 'sweeping_edge', 'efficiency', 'silk_touch',
      'unbreaking', 'fortune', 'power', 'punch', 'flame', 'infinity', 'luck_of_the_sea', 'lure', 'loyalty', 'impaling', 'riptide', 'channeling',
      'multishot', 'quick_charge', 'piercing', 'mending', 'swift_sneak', 'soul_speed', 'density', 'breach', 'wind_burst'],
    entity: ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'slime', 'blaze', 'ghast', 'wither', 'ender_dragon', 'warden', 'villager',
      'iron_golem', 'cow', 'pig', 'sheep', 'chicken', 'horse', 'wolf', 'cat', 'fox', 'bee', 'axolotl', 'allay', 'armor_stand', 'boat', 'minecart',
      'tnt', 'lightning_bolt', 'item', 'experience_orb', 'firework_rocket']
  },

  // What to show for the current input: { usage, argIndex, options:[{text,note}], replace:(text)=>newInput }
  async analyze(value) {
    const lead = value.startsWith('/') ? '/' : '';
    const body = value.slice(lead.length);
    const tokens = body.split(' ');
    const cur = tokens[tokens.length - 1].toLowerCase();
    const replace = (text) => lead + [...tokens.slice(0, -1), text].join(' ') + ' ';

    if (tokens.length === 1) {
      if (!cur) return null;
      const starts = this.COMMANDS.filter(c => c[0].startsWith(cur));
      const has = this.COMMANDS.filter(c => !c[0].startsWith(cur) && c[0].includes(cur));
      return { usage: null, options: starts.concat(has).slice(0, 8).map(c => ({ text: c[0], note: c[2] })), replace };
    }
    const cmd = this.COMMANDS.find(c => c[0] === tokens[0].toLowerCase());
    if (!cmd) return null;
    const args = cmd[1] ? cmd[1].split(' ') : [];
    const argIndex = tokens.length - 2;
    const spec = args[argIndex] || '';
    const name = spec.replace(/[<>\[\]]/g, '');
    let pool = [];
    if (name.includes('|')) pool = name.split('|');
    else if (name === 'player' || name === 'target') pool = [...App.players, ...this.SELECTORS];
    else if (name === 'item' || name === 'block') pool = (await App.pages.players.items()).map(it => it.id);
    else if (this.LISTS[name]) pool = this.LISTS[name];
    const starts = pool.filter(o => o.toLowerCase().startsWith(cur));
    if (cur) starts.sort((a, b) => a.length - b.length); // closest match first: "diamond" before "diamond_block"
    const has = cur ? pool.filter(o => !o.toLowerCase().startsWith(cur) && o.toLowerCase().includes(cur)) : [];
    const options = starts.concat(has).filter(o => o.toLowerCase() !== cur).slice(0, 10).map(o => ({ text: o }));
    return { usage: { cmd: cmd[0], args, note: cmd[2] }, argIndex, options, replace };
  },

  // Attach to an input + the bar above it.
  mount(input, bar) {
    let state = null, sel = 0, seq = 0;
    const accept = (i) => {
      if (!state || !state.options[i]) return false;
      input.value = state.replace(state.options[i].text);
      input.focus();
      update();
      return true;
    };
    const paint = () => {
      if (!state || (!state.usage && !state.options.length)) { bar.innerHTML = ''; bar.classList.remove('show'); return; }
      const u = state.usage;
      bar.classList.add('show');
      bar.innerHTML =
        (u ? `<div class="ch-usage"><b>${App.esc(u.cmd)}</b> ${u.args.map((a, i) =>
          `<span class="${i === state.argIndex ? 'ch-now' : ''}">${App.esc(a)}</span>`).join(' ')}<span class="ch-note">${App.esc(u.note)}</span></div>` : '') +
        (state.options.length ? `<div class="ch-opts">${state.options.map((o, i) =>
          `<button type="button" class="ch-opt${i === sel ? ' active' : ''}" data-i="${i}">${App.esc(o.text)}${o.note ? `<span>${App.esc(o.note)}</span>` : ''}</button>`).join('')}<span class="ch-tip">Tab to fill in</span></div>` : '');
      bar.querySelectorAll('.ch-opt').forEach(b => {
        b.onmousedown = (e) => e.preventDefault(); // keep the cursor in the input
        b.onclick = () => accept(+b.dataset.i);
      });
    };
    const update = async () => {
      const mine = ++seq;
      const s = await this.analyze(input.value);
      if (mine !== seq) return; // a newer keystroke got there first
      state = s; sel = 0;
      paint();
    };
    input.addEventListener('input', update);
    input.addEventListener('focus', update);
    return {
      // returns true when the key was used by the helper
      key(e) {
        if (!state || !state.options.length) return false;
        if (e.key === 'Tab') {
          e.preventDefault();
          if (e.shiftKey) { sel = (sel - 1 + state.options.length) % state.options.length; paint(); return true; }
          return accept(sel);
        }
        if (e.key === 'ArrowRight' && input.selectionStart === input.value.length && state.options.length > 1) {
          sel = (sel + 1) % state.options.length; paint(); e.preventDefault(); return true;
        }
        return false;
      },
      clear() { state = null; paint(); }
    };
  }
};

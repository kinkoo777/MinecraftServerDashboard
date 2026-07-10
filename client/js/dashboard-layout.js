/* Generic ordering/hide engine for the Dashboard's movable sections.
   Persists a per-browser layout in localStorage and mutates a plain
   { order, hidden } state object. Knows nothing about section content — the
   Dashboard page owns the HTML and wiring. */
App.dashLayout = {
  KEY: 'db-layout',

  // Build the live { order, hidden } state by merging any saved layout with the
  // canonical default id list, so a section added in a future update still shows
  // up (appended) and ids no longer known are dropped.
  load(defaultIds) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (_) { saved = {}; }
    const known = new Set(defaultIds);

    const order = Array.isArray(saved.order) ? saved.order.filter(id => known.has(id)) : [];
    for (const id of defaultIds) if (!order.includes(id)) order.push(id);

    const hidden = Array.isArray(saved.hidden) ? saved.hidden.filter(id => known.has(id)) : [];
    return { order, hidden };
  },

  save(state) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({ order: state.order, hidden: state.hidden }));
    } catch (_) { /* storage full / disabled — layout just won't persist */ }
  },

  reset() {
    try { localStorage.removeItem(this.KEY); } catch (_) {}
  },

  isHidden(state, id) { return state.hidden.includes(id); },

  // Swap a section with its neighbour. dir: -1 = up, +1 = down. Returns true if moved.
  move(state, id, dir) {
    const i = state.order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.order.length) return false;
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
    return true;
  },

  // Drag reorder: move `id` to sit where `beforeId` currently is. Returns true if moved.
  reorder(state, id, beforeId) {
    const from = state.order.indexOf(id);
    if (from < 0 || id === beforeId) return false;
    state.order.splice(from, 1);
    let to = beforeId ? state.order.indexOf(beforeId) : state.order.length;
    if (to < 0) to = state.order.length;
    state.order.splice(to, 0, id);
    return true;
  },

  toggleHidden(state, id) {
    const i = state.hidden.indexOf(id);
    if (i >= 0) state.hidden.splice(i, 1);
    else state.hidden.push(id);
  }
};

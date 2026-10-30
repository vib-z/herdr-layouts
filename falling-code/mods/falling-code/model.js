// Pure data preparation. No timers, process access or rendering.
export const HISTORY_LIMIT = 64;
export const COLUMN_WIDTH = 48;
const COLUMN_PITCH = COLUMN_WIDTH + 4;
const GLYPHS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:+=<>";
export const firstLine = value => String(value ?? "").split(/\r?\n/)[0];
export const machineOf = address => address.includes("/") ? address.slice(0, address.indexOf("/")) : null;
const localId = id => String(id ?? "").split("/").pop();

export function normalizeStatus(status, child = false) {
  if (status === "error") return "blocked";
  if (child && status === "done") return "idle";
  return ["working", "blocked", "done", "idle"].includes(status) ? status : null;
}

// agents() supplies native unseen-done semantics. Only raw children supplement it.
export function collectAgents(listed, raw, sectors) {
  const live = raw.filter(t => !t.state || t.state === "live");
  const rawByAddress = new Map(live.map(t => [t.address, t]));
  const result = new Map();
  for (const a of listed) {
    const t = rawByAddress.get(a.address);
    result.set(a.address, {
      ...a, title: a.title || t?.report?.title || a.program?.name || t?.program?.name || a.address,
      status: normalizeStatus(a.status) ?? "idle", child: false,
      kind: firstLine(t?.report?.kind), msg: firstLine(t?.report?.msg),
      machine: machineOf(a.address), status_ms: t?.status_ms ?? null,
    });
  }
  // Resolve descendants even if terminals() puts a child before its parent.
  let pending = live.filter(t => t.parent && !result.has(t.address));
  for (let pass = 0; pending.length && pass <= live.length; pass++) {
    const rest = [];
    for (const t of pending) {
      const parent = result.get(t.parent);
      const status = normalizeStatus(t.status, true);
      if (!parent) { rest.push(t); continue; }
      if (!status) continue; // A plain child shell is not a reporting agent.
      result.set(t.address, {
        address: t.address, pane: null, space: parent.space,
        space_name: parent.space_name, tab: parent.tab, tab_name: parent.tab_name,
        status, child: true, parent: t.parent, machine: machineOf(t.address),
        title: t.report?.title || t.title || t.name || t.program?.name || "Child agent",
        program: t.program, kind: firstLine(t.report?.kind), msg: firstLine(t.report?.msg),
        status_ms: t.status_ms ?? null,
      });
    }
    if (rest.length === pending.length) break;
    pending = rest;
  }
  // An orphan with usable layout labels must not disappear from attention.
  for (const t of pending) {
    const status = normalizeStatus(t.status, true);
    if (!status) continue;
    const sector = sectors.find(s => s.machine === machineOf(t.address) &&
      localId(s.id) === t.labels?.["herdr.space"]);
    const tab = sector?.tabs.find(tab => localId(tab.id) === t.labels?.["herdr.tab"]);
    result.set(t.address, {
      address: t.address, pane: null, space: sector?.id ?? `unplaced:${machineOf(t.address) ?? "local"}`,
      space_name: sector?.name ?? "Unplaced child", tab: tab?.id ?? "unplaced",
      tab_name: tab?.name ?? "No tab", status, child: true, parent: t.parent,
      machine: machineOf(t.address), title: t.report?.title || t.title || t.name || "Child agent",
      program: t.program, kind: firstLine(t.report?.kind), msg: firstLine(t.report?.msg),
      status_ms: t.status_ms ?? null,
    });
  }
  return [...result.values()];
}

export function readHistory(value) {
  try {
    const list = JSON.parse(value ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(a => a && typeof a.address === "string" &&
      typeof a.title === "string" && typeof a.space === "string").slice(-HISTORY_LIMIT);
  } catch { return []; }
}

export function remember(history, live) {
  const map = new Map(history.map(a => [a.address, a]));
  for (const a of live) {
    map.delete(a.address);
    map.set(a.address, { ...a, status_ms: null });
  }
  return [...map.values()].slice(-HISTORY_LIMIT);
}

// Absence is never an exit. Only an explicit finished record confirms it.
export function confirmMissing(history, live, snapshot, machineStates, failed = false) {
  const active = new Set(live.map(a => a.address));
  const rows = new Map((snapshot?.terminals ?? []).map(t => [t.address, t]));
  return history.filter(a => !active.has(a.address)).map(a => {
    const available = !failed && machineStates.some(m => m.name === machineOf(a.address) && m.layout === "ready");
    const record = rows.get(a.address);
    return { ...a, status: available && record?.state === "finished" ? "dead" : "unavailable" };
  });
}

export function precomputeFrames(address, lines = 10) {
  let seed = 2166136261;
  for (const char of address) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const glyphs = Array.from({ length: lines + 8 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return GLYPHS[seed % GLYPHS.length];
  });
  return Array.from({ length: 8 }, (_, frame) =>
    Array.from({ length: lines }, (_, row) => glyphs[(row - frame + glyphs.length) % glyphs.length]).join("\n"));
}

// Pack whole sector/tab fragments, preserving 48px columns. At most 20 per band.
// Overflow wraps into another band, never a horizontal strip of tiny agents.
export function packBands(list, sectors, width) {
  const available = Math.max(96, width);
  const groups = [];
  for (const a of list) {
    let group = groups.find(g => g.space === a.space && g.tab === a.tab);
    if (!group) {
      const sector = sectors.find(s => s.id === a.space);
      group = { space: a.space, tab: a.tab, name: a.space_name,
        tabName: a.tab_name, branch: sector?.branch ?? "", agents: [] };
      groups.push(group);
    }
    group.agents.push(a);
  }
  const bands = [];
  let band = { groups: [], width: 0, count: 0 };
  for (const group of groups) {
    let offset = 0;
    while (offset < group.agents.length) {
      const room = Math.min(20 - band.count, Math.floor((available - band.width - 30) / COLUMN_PITCH));
      if (room < 1 && band.count) { bands.push(band); band = { groups: [], width: 0, count: 0 }; continue; }
      const slice = group.agents.slice(offset, offset + Math.max(1, room));
      const fragment = { ...group, agents: slice, width: 30 + slice.length * COLUMN_PITCH };
      band.groups.push(fragment);
      band.width += fragment.width;
      band.count += slice.length;
      offset += slice.length;
    }
  }
  if (band.count) bands.push(band);
  return bands;
}

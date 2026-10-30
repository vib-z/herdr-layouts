// Data only. Never infer an exit from a missing live terminal.
export const BAND_ORDER = ["done", "working", "idle"];
export const JUMP_KEYS = "abcdefghi lopqrtuvwyz".replace(/ /g, "");
export const HISTORY_LIMIT = 64;
export const ROW_LIMIT = 64;
const WEEK = 7 * 86400000;
export const statusOf = (value, child = false) => {
  const word = typeof value === "object" ? value?.state : value;
  if (word === "error") return "blocked";
  if (word === "done" && child) return "idle";
  return ["blocked", "done", "working", "idle"].includes(word) ? word : null;
};

export function collectRows(listed, raw, allSpaces) {
  const live = new Map(raw.filter(t => t.state === "live").map(t => [t.address, t]));
  const rows = new Map(listed.map(a => {
    const terminal = live.get(a.address);
    return [a.address, {
      ...a, title: a.title || terminal?.report?.title || a.program?.name || a.address,
      status: statusOf(a.status) ?? "idle", child: false,
      status_ms: terminal?.status_ms ?? null,
      created_ms: terminal?.created_ms ?? null,
      settled: allSpaces.find(s => s.id === a.space)?.tabs.find(t => t.id === a.tab)?.settled ?? false
    }];
  }));
  // Repeat to resolve nested descendants regardless of the order the core supplied.
  for (let pass = 0; pass < raw.length; pass++) {
    let added = false;
    for (const t of live.values()) {
      if (rows.has(t.address) || !t.parent) continue;
      const parent = rows.get(t.parent);
      const status = statusOf(t.status, true);
      if (!parent || !status) continue;
      rows.set(t.address, {
        address: t.address, child: true, parent: t.parent, pane: null,
        space: parent.space, space_name: parent.space_name, tab: parent.tab,
        tab_name: parent.tab_name, tab_index: parent.tab_index,
        settled: parent.settled, title: t.title || t.report?.title || t.program?.name || t.address,
        program: t.program, status, status_ms: t.status_ms ?? null,
        created_ms: t.created_ms ?? null, focused: false
      });
      added = true;
    }
    if (!added) break;
  }
  return [...rows.values()].sort((a, b) => a.space.localeCompare(b.space) || a.address.localeCompare(b.address));
}

export function partitionRows(rows, options = {}, now = Date.now()) {
  const { space = "all", today = false, query = "", snoozed = {} } = options;
  const q = query.toLowerCase().trim();
  const blockers = rows.filter(a => a.status === "blocked");
  const matching = rows.filter(a => a.status !== "blocked" && !a.settled
    && (space === "all" || a.space === space)
    && (!today || a.status === "done")
    && !(snoozed[a.address] > now)
    && (!q || `${a.title} ${a.space_name} ${a.tab_name} ${a.address}`.toLowerCase().includes(q)));
  const rest = BAND_ORDER.flatMap(s => matching.filter(a => a.status === s)).slice(0, ROW_LIMIT);
  const ordered = [...blockers, ...rest];
  return { blockers, rest, ordered };
}

export function remember(history, rows, now = Date.now()) {
  const byAddress = new Map(history.filter(a => now - a.last_seen < WEEK).map(a => [a.address, a]));
  for (const row of rows) byAddress.set(row.address, { ...row, last_seen: now, closed: false, unavailable: false });
  return [...byAddress.values()].sort((a, b) => b.last_seen - a.last_seen).slice(0, HISTORY_LIMIT);
}

export function confirmHistory(history, snapshot, liveRows, now = Date.now()) {
  const current = new Set(liveRows.map(a => a.address));
  const all = Array.isArray(snapshot?.terminals) ? new Map(snapshot.terminals.map(t => [t.address, t])) : null;
  return history.map(a => {
    if (current.has(a.address)) return { ...a, closed: false, unavailable: false };
    const terminal = all?.get(a.address);
    // A reused address with a different lifetime is not the remembered program.
    // `hc ls --json` is compact and omits created_ms in 0.1.13. Addresses
    // identify a terminal forever on its core; compare lifetimes if supplied.
    const same = terminal && (!a.created_ms || !terminal.created_ms || terminal.created_ms === a.created_ms);
    if (same && terminal.state === "finished") return {
      ...a, closed: true, unavailable: false, checked_at: now,
      exit_code: terminal.exit_code ?? null, reason: terminal.reason ?? "finished"
    };
    return { ...a, closed: false, unavailable: true, checked_at: now };
  });
}

export function age(statusMs, now = Date.now()) {
  if (!Number.isFinite(statusMs) || statusMs <= 0) return "";
  const seconds = Math.max(0, Math.floor((now - statusMs) / 1000));
  if (seconds < 60) return "<1m";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function nextBlocked(rows, address) {
  const blocked = rows.filter(a => a.status === "blocked");
  if (!blocked.length) return null;
  return blocked[(blocked.findIndex(a => a.address === address) + 1) % blocked.length];
}

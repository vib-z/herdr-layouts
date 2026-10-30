export const HISTORY_LIMIT = 128;
export const EXIT_INTERVAL = 15000;
export const STATUS = { blocked: "needs you", working: "working", done: "done", idle: "idle", archived: "exited", unavailable: "unavailable" };
export const statusOf = value => value === "error" ? "blocked" : value;
const reported = new Set(["blocked", "working", "done", "idle"]);
export const plain = value => String(value ?? "")
  .replace(/(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\|\x9c|$)/g, "")
  .replace(/(?:\x1b[P^_X]|[\x90\x98\x9e\x9f])[\s\S]*?(?:\x1b\\|\x9c|$)/g, "")
  .replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, "")
  .replace(/\x1b[ -/]*[@-~]/g, "")
  .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ").trim();
const compare = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });
const machineOf = address => address.includes("/") ? address.slice(0, address.lastIndexOf("/")) : null;
export const basename = folder => plain(folder).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
export function titleOf(agent, terminal = {}) {
  const address = agent?.address || terminal.address;
  const title = plain(agent?.title);
  return (title !== plain(address) ? title : "") || plain(terminal.report?.title) ||
    plain(agent?.program?.name || terminal.program?.name) || address;
}

export function reportedModel(report = {}) {
  // The current report schema has no model field. Require an explicit marker in reported text.
  const match = `${plain(report.title)} ${plain(report.msg)}`.match(/\bmodel\s*[:=]\s*([a-z0-9][a-z0-9._/-]*)/i);
  return match?.[1] ?? null;
}
export function progressOf(report = {}) {
  return typeof report.progress === "number" && Number.isFinite(report.progress) && report.progress >= 0 && report.progress <= 100
    ? report.progress : null;
}
export function chips(row) {
  const items = [{ kind: "host", value: row.host }, { kind: "project", value: row.project }].filter(c => c.value);
  if (row.model) items.push({ kind: "model", value: row.model });
  return items;
}
export function collectRows(agents = [], terminals = [], spaces = []) {
  const raw = new Map(terminals.filter(t => t?.address).map(t => [t.address, t]));
  const result = new Map();
  const decorate = (a, t = {}) => {
    const space = spaces.find(s => s.id === a.space);
    const report = t.report ?? {};
    return { ...a, title: titleOf(a, t), host: space ? plain(space.machine) || "local" : "",
      project: basename(space?.folder) || plain(space?.name), status_ms: t.status_ms ?? null,
      model: reportedModel(report), progress: progressOf(report) };
  };
  for (const a of agents) {
    if (!a?.address || !reported.has(statusOf(a.status))) continue;
    result.set(a.address, decorate({ ...a, status: statusOf(a.status), child: false, rawDone: false }, raw.get(a.address)));
  }
  const location = terminal => {
    const visited = new Set();
    for (let t = terminal; t && !visited.has(t.address);) {
      visited.add(t.address);
      if (result.has(t.address)) return result.get(t.address);
      const machine = machineOf(t.address);
      const qualify = id => machine && id && !id.startsWith(`${machine}/`) ? `${machine}/${id}` : id;
      const space = spaces.find(s => (s.machine ?? null) === machine && s.id === qualify(t.labels?.["herdr.space"]));
      const tab = space?.tabs?.find(tab => tab.id === qualify(t.labels?.["herdr.tab"]));
      if (space && tab) return { space: space.id, space_name: space.name, tab: tab.id, tab_name: tab.name, tab_index: tab.index };
      t = raw.get(qualify(t.parent));
    }
    return { space: "", space_name: "unassigned", tab: "", tab_name: "child", tab_index: 0 };
  };
  for (const t of terminals) {
    if (!t?.address || !t.parent || result.has(t.address) || (t.state && t.state !== "live")) continue;
    const status = statusOf(t.status ?? t.report?.state);
    if (!reported.has(status)) continue;
    const loc = location(t);
    result.set(t.address, decorate({ address: t.address, space: loc.space, space_name: loc.space_name,
      tab: loc.tab, tab_name: loc.tab_name, tab_index: loc.tab_index, title: "", program: t.program,
      status: status === "done" ? "idle" : status, rawDone: status === "done", child: true, pane: null, focused: false }, t));
  }
  return [...result.values()];
}
export function preferences(read) {
  const group = read("fleet-tab.group");
  return { minimal: read("fleet-tab.minimal") === true, still: read("fleet-tab.still") === true,
    group: ["status", "host", "project"].includes(group) ? group : "status" };
}
export function toggleMinimal(read, write) {
  const value = !preferences(read).minimal;
  write("fleet-tab.minimal", value);
  return value;
}
export function groupRows(rows, query = "", grouping = "status") {
  const words = plain(query).toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const attention = rows.filter(a => a.status === "blocked");
  const rest = rows.filter(a => a.status !== "blocked" && words.every(word =>
    [a.title, a.host, a.project, a.space_name, a.tab_name, a.address].join(" ").toLocaleLowerCase().includes(word)));
  const groups = new Map();
  for (const a of rest) {
    // Confirmed history always remains distinct from unconfirmed losses, even when grouping by host.
    const key = ["archived", "unavailable"].includes(a.status) ? a.status :
      grouping === "host" ? a.host || "unknown host" : grouping === "project" ? a.project || "unknown project" : a.status;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  const rank = key => key === "archived" ? 10 : key === "unavailable" ? 11 :
    grouping === "status" ? ({ done: 0, working: 1, idle: 2 }[key] ?? 3) : 0;
  return { attention, groups: [...groups].sort(([a], [b]) => rank(a) - rank(b) || compare(a, b))
    .map(([key, items]) => ({ key, rows: items })) };
}
export function stateStart(row, previous, spaces, now) {
  const valid = value => Number.isFinite(value) && value > 0 && value <= now;
  const changed = previous && (previous.status !== row.status || Boolean(previous.rawDone) !== Boolean(row.rawDone));
  let start = changed ? now : valid(previous?.state_started_ms) ? previous.state_started_ms : null;
  if (valid(row.status_ms) && (start === null || row.status_ms > start)) start = row.status_ms;
  if (start === null) {
    const tab = spaces.find(s => s.id === row.space)?.tabs?.find(t => t.id === row.tab);
    start = (row.status === "working" ? [tab?.working_since, tab?.changed_at] : [tab?.changed_at]).find(valid) ?? now;
  }
  return start;
}
export function remember(previous, live, now, spaces = []) {
  const memory = new Map(previous.filter(a => a?.address).map(a => [a.address, a]));
  for (const a of live) {
    const old = memory.get(a.address);
    const state_started_ms = stateStart(a, old, spaces, now);
    memory.delete(a.address);
    memory.set(a.address, { address: a.address, title: a.title, space: a.space, space_name: a.space_name,
      tab: a.tab, tab_name: a.tab_name, tab_index: a.tab_index, child: a.child, host: a.host, project: a.project,
      program: a.program, status: a.status, rawDone: Boolean(a.rawDone), state_started_ms,
      model: a.model, progress: a.progress, lastSeen: now, missingSince: null, exit: null });
  }
  return [...memory.values()].slice(-HISTORY_LIMIT);
}
export function markMissing(history, live, terminals, now) {
  const present = new Set([...live, ...terminals].map(a => a.address));
  return history.map(a => !present.has(a.address) && !a.missingSince ? { ...a, missingSince: now } : a);
}
export function missingRows(history, live, terminals) {
  const present = new Set([...live, ...terminals].map(a => a.address));
  return history.filter(a => !present.has(a.address)).map(a => ({ ...a, focused: false,
    status: a.exit?.state === "finished" ? "archived" : "unavailable", model: null, progress: null }));
}
export function confirmExits(history, payload, liveAddresses) {
  if (!payload || !Array.isArray(payload.terminals)) throw new Error("Unexpected exit reply");
  const all = new Map(payload.terminals.map(t => [t.address, t]));
  return history.map(a => {
    if (liveAddresses.has(a.address)) return a;
    const t = all.get(a.address);
    return t?.state === "finished" ? { ...a, exit: { state: "finished", code: t.exit_code ?? null } } : a;
  });
}
export function elapsed(start, now) {
  if (!Number.isFinite(start) || start <= 0 || start > now) return "--";
  const seconds = Math.floor((now - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
export const identity = a => `${a.title}\n${a.space_name} / ${a.tab_name}\n${a.address}${a.child ? " (child, opens peek)" : ""}`;
export const focusCommand = a => ["archived", "unavailable"].includes(a.status) ? null :
  { name: a.child ? "terminal.peek" : "agent.focus", args: { terminal: a.address } };

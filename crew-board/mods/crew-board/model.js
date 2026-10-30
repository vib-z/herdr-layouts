// Pure state joins. Native unseen-done belongs to agents(), never raw child reports.
export const ROLES = ["THE HACKER", "THE DRIVER", "THE INSIDE MAN", "THE FORGER", "THE MUSCLE", "THE NEW GUY"];
export const HISTORY_LIMIT = 128;
export const statusOf = value => value === "error" ? "blocked" : value;
export function crewRole(address) {
  let hash = 2166136261;
  for (const ch of address) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return ROLES[hash % ROLES.length];
}
export function collectCrew(agents, terminals, spaces) {
  const raw = new Map(terminals.map(t => [t.address, t]));
  const result = new Map(agents.map(a => {
    const t = raw.get(a.address);
    const program = a.program ?? t?.program;
    return [a.address, { ...a, status: statusOf(a.status), child: false,
      program, title: a.title || t?.report?.title || program?.name || a.address,
      report: t?.report ?? {}, status_ms: t?.status_ms ?? null }];
  }));
  const location = terminal => {
    const visited = new Set();
    let t = terminal;
    while (t && !visited.has(t.address)) {
      visited.add(t.address);
      if (result.has(t.address)) return result.get(t.address);
      const labels = t.labels ?? {};
      const space = spaces.find(s => s.id === labels["herdr.space"] ||
        (s.machine && s.id === `${s.machine}/${labels["herdr.space"]}` && t.address.startsWith(`${s.machine}/`)));
      const tab = space?.tabs.find(tab => tab.id === labels["herdr.tab"] ||
        (space.machine && tab.id === `${space.machine}/${labels["herdr.tab"]}`));
      if (space && tab) return { space: space.id, space_name: space.name, tab: tab.id, tab_name: tab.name, tab_index: tab.index };
      t = raw.get(t.parent);
    }
    return { space: "unassigned", space_name: "Unassigned", tab: "child", tab_name: "Child terminal", tab_index: 0 };
  };
  for (const t of terminals) {
    if (!t.parent || result.has(t.address) || (t.state && t.state !== "live")) continue;
    const report = t.report ?? {};
    const status = statusOf(t.status ?? report.state);
    // An unreported shell is not an agent; it remains available in the live split tree.
    if (!["working", "blocked", "idle", "done"].includes(status)) continue;
    const loc = location(t);
    result.set(t.address, { ...loc, address: t.address, pane: null, child: true,
      title: report.title || t.program?.name || t.address, program: t.program,
      status: status === "done" ? "idle" : status, rawDone: status === "done",
      report, status_ms: t.status_ms ?? null });
  }
  return [...result.values()].sort((a, b) => a.address.localeCompare(b.address));
}
export function remember(previous, live, now) {
  const byAddress = new Map(previous.filter(x => x?.address).map(x => [x.address, x]));
  for (const a of live) {
    const old = byAddress.get(a.address);
    // Persist only display facts, never terminal output or credentials.
    byAddress.set(a.address, { address: a.address, title: a.title, space: a.space,
      space_name: a.space_name, tab: a.tab, tab_name: a.tab_name, child: a.child,
      program: a.program, lastSeen: now, status: a.status,
      exit: null, firstSeen: old?.firstSeen ?? now });
  }
  return [...byAddress.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, HISTORY_LIMIT);
}
export function missingCrew(history, live, terminals) {
  const present = new Set([...live.map(a => a.address), ...terminals.map(t => t.address)]);
  return history.filter(a => !present.has(a.address)).map(a => ({ ...a,
    status: a.exit?.state === "finished" ? "dead" : "unavailable" }));
}
export function confirmExits(history, payload, liveAddresses) {
  if (!payload || !Array.isArray(payload.terminals)) throw new Error("Unexpected core reply");
  const rows = new Map(payload.terminals.map(t => [t.address, t]));
  return history.map(a => {
    if (liveAddresses.has(a.address)) return a;
    const row = rows.get(a.address);
    return row?.state === "finished" ? { ...a, exit: { state: "finished", reason: row.reason ?? "exited", code: row.exit_code ?? null } } : a;
  });
}
export function elapsed(statusMs, now) {
  if (!Number.isFinite(statusMs) || statusMs <= 0 || statusMs > now) return "";
  const minutes = Math.floor((now - statusMs) / 60000);
  return minutes < 1 ? "<1m" : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function groupJobs(spaces, crew) {
  const jobs = spaces.map(s => ({ ...s, tabs: s.tabs.map(t => ({ ...t, crew: crew.filter(a => a.space === s.id && a.tab === t.id) })) }));
  for (const a of crew) {
    let job = jobs.find(s => s.id === a.space);
    if (!job) { job = { id: a.space, name: a.space_name, tabs: [] }; jobs.push(job); }
    let tab = job.tabs.find(t => t.id === a.tab);
    if (!tab) { tab = { id: a.tab, name: a.tab_name, active: false, crew: [] }; job.tabs.push(tab); }
    if (!tab.crew.some(x => x.address === a.address)) tab.crew.push(a);
  }
  return jobs;
}

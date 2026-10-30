// Pure data helpers. Native done belongs to agents(), never a child's raw report.
export const HISTORY_LIMIT = 48;
export const HISTORY_AGE = 24 * 60 * 60 * 1000;

export function statusOf(value, child = false) {
  const word = typeof value === "string" ? value : value?.state;
  if (word === "error") return "blocked";
  if (child && word === "done") return "idle";
  return ["working", "blocked", "done", "idle"].includes(word) ? word : null;
}

export function machineOf(address) {
  return address.includes("/") ? address.slice(0, address.lastIndexOf("/")) : null;
}

export function fullAddress(address, machine) {
  if (!address || typeof address !== "string") return null;
  return machine && !address.startsWith(`${machine}/`) ? `${machine}/${address}` : address;
}

export function agentTitle(agent, terminal) {
  return agent.title || terminal?.report?.title || agent.program?.name ||
    terminal?.program?.name || agent.address;
}

export function collectAgents(listed, raw) {
  const byAddress = new Map(raw.map(t => [t.address, t]));
  const found = new Map(listed.map(a => {
    const t = byAddress.get(a.address);
    return [a.address, { ...a, title: agentTitle(a, t), status: statusOf(a.status), child: false,
      machine: machineOf(a.address), msg: t?.report?.msg || "",
      created_ms: t?.created_ms ?? null }];
  }));
  // Repeat to resolve nested children regardless of the core's record order.
  for (let pass = 0; pass < raw.length; pass++) {
    let added = false;
    for (const t of raw) {
      if (found.has(t.address) || !t.parent || (t.state && t.state !== "live")) continue;
      const parentAddress = fullAddress(t.parent, machineOf(t.address));
      const parent = found.get(parentAddress);
      if (!parent) continue;
      const status = statusOf(t.status ?? t.report, true);
      if (!status) continue;
      found.set(t.address, { address: t.address, pane: null, child: true,
        space: parent.space, space_name: parent.space_name,
        tab: parent.tab, tab_index: parent.tab_index, tab_name: parent.tab_name,
        machine: machineOf(t.address), status, focused: false,
        title: agentTitle({ title: t.title, program: t.program, address: t.address }, t),
        msg: t.report?.msg || "", created_ms: t.created_ms ?? null });
      added = true;
    }
    if (!added) break;
  }
  return [...found.values()];
}

export function loadHistory(text, now) {
  try {
    const data = JSON.parse(text || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter(a => typeof a.address === "string" &&
      typeof a.lastSeen === "number" && now - a.lastSeen < HISTORY_AGE)
      .slice(0, HISTORY_LIMIT).map(a => ({ ...a, state: "unavailable" }));
  } catch { return []; }
}

export function remember(history, live, now) {
  const current = new Set(live.map(a => a.address));
  const missing = history.filter(a => !current.has(a.address) && now - a.lastSeen < HISTORY_AGE);
  return [...live.map(a => ({ address: a.address, title: a.title || a.address,
    space_name: a.space_name, tab_name: a.tab_name, machine: a.machine,
    created_ms: a.created_ms, lastSeen: now, state: "live" })), ...missing]
    .slice(0, HISTORY_LIMIT);
}

export function historyRows(stdout) {
  const data = JSON.parse(stdout);
  const rows = Array.isArray(data) ? data : data.terminals;
  if (!Array.isArray(rows)) throw new Error("No terminal list");
  return rows;
}

export function confirmHistory(history, liveAddresses, records) {
  // Local hc lists connected machines too, with their full machine/address identity.
  const byAddress = records && new Map(records.map(t => [t.address, t]));
  return history.map(a => {
    if (liveAddresses.has(a.address)) return a;
    const t = byAddress?.get(a.address);
    // CLI ls rows omit created_ms. Match their full address; reject an explicit
    // incarnation mismatch when a richer record does include the timestamp.
    const same = t && (t.created_ms == null || t.created_ms === a.created_ms);
    if (same && t.state === "finished") return { ...a, state: "dead",
      exit_code: t.exit_code ?? null, reason: t.reason || "finished" };
    return { ...a, state: "unavailable", exit_code: null, reason: "unconfirmed" };
  });
}

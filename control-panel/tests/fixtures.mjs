export const now = 1793314800000;
export const spaces = [
  { id: "s1", name: "api", active: true, machine: null, tabs: [
    { id: "a1", name: "token cache", index: 1, active: true },
    { id: "a2", name: "review policy", index: 2, settled: true }
  ] },
  { id: "s2", name: "web", machine: null, tabs: [
    { id: "b1", name: "login checks", index: 1 },
    { id: "b2", name: "design question", index: 2 }
  ] },
  { id: "remote/s3", name: "ops", machine: "remote", tabs: [
    { id: "remote/c1", name: "auth renewal", index: 1 },
    { id: "remote/c2", name: "cache health", index: 2 }
  ] }
];
const job = (address, title, status, spaceIndex, tabIndex, seconds = 90) => {
  const s = spaces[spaceIndex], tab = s.tabs[tabIndex];
  return { address, pane: `pane-${address}`, title, status, space: s.id, space_name: s.name,
    tab: tab.id, tab_name: tab.name, tab_index: tab.index, seq: 1, focused: address === "t1",
    program: { key: "agent", name: "Agent", agent: true }, seconds };
};
export const agents = [
  job("t1", "refresh token cache", "working", 0, 0, 194),
  job("t2", "review permission policy", "blocked", 0, 1, 383),
  job("t3", "check response contract", "working", 0, 0, 26),
  job("t4", "fix flaky login test", "done", 1, 0, 42),
  job("t5", "choose retry strategy", "blocked", 1, 1, 161),
  job("t6", "inspect cache fixtures", "idle", 1, 0, 67),
  job("remote/t7", "renew demo credentials", "blocked", 2, 0, 94),
  job("remote/t8", "check cache health", "working", 2, 1, 51)
];
export const terminals = [
  ...agents.map(a => ({ address: a.address, status: a.status, state: "live", name: a.title,
    status_ms: now - a.seconds * 1000, report: { state: a.status }, labels: {}, program: a.program })),
  { address: "t9", parent: "t1", name: "inspect fixture parity", status: "working", state: "live", status_ms: now - 23000 },
  { address: "t10", state: "live", name: "shell", program: { shell: true }, labels: { "herdr.space": "s1", "herdr.tab": "a1" } }
];
export const history = [{ address: "t12", title: "audit schema changes", space: "s2", space_name: "web",
  tab: "b1", tab_name: "login checks", tab_index: 1, child: false, lastSeen: now - 9000,
  exit: { state: "finished", reason: "exited", code: 0 } }];
export const lines = {
  t1: "validation batch ready", t2: "Approve fixture changes?", t3: "checking response schema",
  t4: "14 passed, 0 failed", t5: "Which retry policy should be used?", t6: "waiting for the next task",
  "remote/t7": "Demo credentials need renewal", "remote/t8": "cache checks running", t9: "comparing fixture snapshots"
};

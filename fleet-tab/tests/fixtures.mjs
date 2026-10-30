export const program = { name: "demo-agent", icon: "icons/demo-agent.svg", tint: true };
export const space = (id, name, machine, tabs, folder = "") => ({ id, name, machine, folder, active: id === "api", tabs });
export const tab = (id, name, active = false, settled = false) => ({ id, name, active, settled, index: 1, panes: 4, changed_at: 1000, working_since: 2000 });
export const spaces = [space("api", "api", null, [tab("build", "build", true), tab("review", "review", false, true)], "/projects/service"),
  space("edge/ops", "ops", "edge", [tab("edge/auth", "auth")], "/projects/tools")];
export const agent = (address, status, extra = {}) => ({ address, status, title: `task ${address}`, program,
  space: "api", space_name: "api", tab: "build", tab_name: "build", tab_index: 1, pane: `p-${address}`, ...extra });
export const agents = [agent("t1", "working", { focused: true }), agent("t2", "blocked", { title: "choose retry policy" }),
  agent("t3", "blocked", { title: "review policy", tab: "review", tab_name: "review" }),
  agent("edge/t4", "blocked", { title: "renew access", space: "edge/ops", space_name: "ops", tab: "edge/auth", tab_name: "auth" }),
  agent("t5", "done"), agent("t6", "idle"), agent("t7", "working", { title: "x".repeat(60) }),
  agent("t8", "working"), agent("t9", "idle"), agent("t10", "done")];
export const terminals = [...agents.map(a => ({ address: a.address, status: a.status, state: "live", program, status_ms: null,
  report: a.address === "t1" ? { title: "build", msg: "model: example-v1", progress: 26 } : {} })),
  { address: "edge/t11", parent: "t4", state: "live", status: "error", program, report: { title: "child decision" } },
  { address: "t12", parent: "t1", state: "live", status: "done", program, report: { title: "child complete" } },
  { address: "t13", state: "live", program: { name: "shell" } }];

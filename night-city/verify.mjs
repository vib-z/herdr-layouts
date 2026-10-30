// Static fixtures only. No Herdr binary, core, network or browser is started.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const layout = JSON.parse(await readFile(new URL("layouts/night-city.json", root), "utf8"));
const apartmentRow = layout.children.find(n => n.id === "night-city-apartments");
assert.equal(apartmentRow.type, "row");
assert.equal(apartmentRow.children[0].id, "night-city-attention");
assert.equal(apartmentRow.children[0].size.px, 330);
assert.equal(apartmentRow.children[1].content.tab, "active");
console.log("PASS: permanent attention rail is left of the terminals, away from bottom-right toasts");
const source = await readFile(new URL("mods/night-city/model.js", root), "utf8");
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const modelURL = url(source);
const { scene, remember, confirm, ghosts, towers, skylineGeometry, agentTitle, HISTORY_LIMIT, HISTORY_AGE } = await import(modelURL);
const now = Date.now();
const program = { name: "Demo agent", icon: null, tint: true, color: "#f1cf83" };
const spaces = ["api", "web", "ops", "docs"].map((name, i) => ({ id: `s${i}`, name,
  machine: i === 2 ? "remote" : null, active: i === 0,
  tabs: [0, 1].map(j => ({ id: `tab${i}-${j}`, name: j ? "verify" : "build", index: j + 1,
    active: j === 0, settled: i === 0 && j === 1 })) }));
const states = ["working", "blocked", "done", "idle", "working", "blocked", "idle", "working", "idle", "working"];
const agentList = states.map((status, i) => {
  const space = spaces[i % spaces.length], tab = space.tabs[i === 1 ? 1 : 0];
  return { address: `${space.machine ? "remote/" : ""}t${i + 1}`, pane: `p${i}`, space: space.id,
    space_name: space.name, tab: tab.id, tab_name: tab.name, tab_index: tab.index,
    status, title: `demo task ${i + 1}`, program, focused: i === 0 };
});
// One pane blocker in a settled tab, one remote blocker, one blocked child.
Object.assign(agentList[1], { space: "s0", space_name: "api", tab: "tab0-1", tab_name: "verify" });
Object.assign(agentList[5], { address: "remote/t6", space: "s2", space_name: "ops", tab: "tab2-0", tab_name: "build" });
const panes = agentList.map(a => ({ pane: a.pane, terminal: a.address, tab: a.tab,
  title: a.title, status: a.status, program: a.program, focused: a.focused }));
panes.push({ pane: "shell-pane", terminal: "shell", tab: "tab0-0", title: "unreported shell", status: null },
  { pane: "mod-pane", terminal: null, mod: "demo", tab: "tab0-0", title: "notes" });
const raw = agentList.map((a, i) => ({ address: a.address, status: a.status, state: "live", status_ms: now - i * 1000 }));
raw.push({ address: "child", parent: agentList[0].address, state: "live", status: "error", title: "review migration", status_ms: now, program },
  { address: "shell", state: "live" });
const data = scene(spaces, panes, agentList, raw);
assert.equal(data.list.length, 11);
assert.equal(data.blockers.length, 3);
assert(data.blockers.some(a => a.tab === "tab0-1"));
assert(data.blockers.some(a => a.address === "remote/t6"));
assert(data.blockers.some(a => a.address === "child" && a.child));
assert.equal(data.mapped.get(agentList[2].address).status, "done");
console.log("PASS: ten pane agents, hidden and remote blockers, blocked child, native unseen done");

assert.equal(agentTitle({ title: "pane task", program, address: "t1" }, { report: { title: "reported task" } }), "pane task");
assert.equal(agentTitle({ title: "", program, address: "t1" }, { report: { title: "reported task" } }), "reported task");
assert.equal(agentTitle({ title: "", program, address: "t1" }, {}), program.name);
assert.equal(agentTitle({ title: "", address: "t1" }, {}), "t1");
const reportOnly = scene(spaces, panes, [{ ...agentList[0], title: "" }], [
  { ...raw[0], report: { title: "refresh token cache" } },
  { address: "other", report: { title: "unrelated task" } },
  { address: "child-title", parent: agentList[0].address, state: "live", status: "working", report: { title: "review cache" } }]);
assert.equal(reportOnly.mapped.get(agentList[0].address).title, "refresh token cache");
assert.equal(reportOnly.mapped.get("child-title").title, "review cache");
console.log("PASS: title chain prefers agent title, joins reported title by address, then program and address");

const nested = scene(spaces, panes, agentList, [
  { address: "grandchild", parent: "child", state: "live", status: "done" }, ...raw,
  { address: "cycle-a", parent: "cycle-b", state: "live", status: "blocked" },
  { address: "cycle-b", parent: "cycle-a", state: "live", status: "blocked" }]);
assert.equal(nested.mapped.get("grandchild").status, "idle");
assert.equal(nested.mapped.get("grandchild").space, "s0");
assert(!nested.mapped.has("cycle-a"));
assert.equal(scene(spaces, panes, agentList, [...raw, { address: "outside", parent: "unknown", status: "blocked" }]).blockers.length, 3);
console.log("PASS: nested child inheritance, raw done normalization, unrelated and cyclic records excluded");

let history = remember([], data.list, raw, now);
const missing = data.list[0];
history = remember(history, data.list.slice(1), raw.filter(t => t.address !== missing.address), now + 1);
assert.equal(ghosts(history)[0].status, "unavailable");
let ended = confirm(history, { terminals: [{ address: missing.address, state: "finished", finished_ms: now - 600001 }] }, now);
assert.equal(ghosts(ended)[0].status, "dead");
assert.equal(ghosts(confirm(ended, null, now))[0].status, "unavailable");
assert.equal(ghosts(confirm(ended, { terminals: [{ address: missing.address, state: "live" }] }, now))[0].status, "unavailable");
assert(!ghosts(remember(ended, data.list, raw, now + 2)).some(a => a.address === missing.address));
assert.equal(remember([{ ...missing, lastSeen: now - HISTORY_AGE - 1 }], [], [], now).length, 0);
assert.equal(remember([], Array.from({ length: 100 }, (_, i) => ({ ...missing, address: `limit-${i}` })), [], now).length, HISTORY_LIMIT);
console.log("PASS: positive exit proof, failure/unavailable, return to live, bounded and expired history");

const modelTowers = towers(data, []);
assert.equal(modelTowers.at(-1).machine, "remote");
assert(modelTowers.flatMap(s => s.floors.flatMap(f => f.windows)).some(a => a.status === "shell"));
assert(modelTowers.flatMap(s => s.floors.flatMap(f => f.windows)).some(a => a.status === "mod"));
const crowded = towers({ ...data, panes: Array.from({ length: 60 }, (_, i) => ({ ...panes[0], pane: `crowd-${i}`, terminal: `crowd-${i}` })) }, []);
assert(crowded[0].width >= 14 * 60 + 18);
assert(towers({ ...data, spaces: [] }, ended).some(s => s.id === missing.space));
console.log("PASS: tower ordering, shell/mod panes, 60-pane overflow and retained closed-space exits");

// An element recorder exercises rendering/control paths, not GPUI rendering.
const host = globalThis.__nightCityFixture = { props: {}, spaces, panes, agents: agentList, raw,
  shared: new Map(), calls: [], active: true, platform: "macos", buttons: false, timers: [], storage: new Map() };
globalThis.localStorage = { getItem: k => host.storage.get(k) ?? null, setItem: (k, v) => host.storage.set(k, v) };
const stub = url(`
  const host = globalThis.__nightCityFixture;
  export class View {}
  function node(kind) {
    const o = { kind, kids: [], ops: [], handlers: {} };
    const p = new Proxy(o, { get(o, key) {
      if (key in o) return o[key];
      return (...args) => {
        if (key === "child") o.kids.push(args[0]);
        else if (key === "children") o.kids.push(...args[0]);
        else if (key === "when") { if (args[0]) args[1](p); }
        else if (key.startsWith("on_")) o.handlers[key] = args.at(-1);
        else o.ops.push([key, ...args]);
        return p;
      };
    }}); return p;
  }
  export const div = () => node("div"), svg = x => node("svg").child(x), image = x => node("image").child(x);
  export const h_flex = () => node("h_flex"), v_flex = () => node("v_flex");
  export const spaces = () => host.spaces, panes = () => host.panes, agents = () => host.agents, terminals = () => host.raw;
  export const props = () => host.props, focused = () => host.focus ?? null;
  export const theme = () => ({foreground:"#ffffff",muted:"#aabbcc",blocked:"#ff9097",chrome:"#111b31",canvas:"#080e20",border:"#334468"});
  export const shared = k => host.shared.get(k), setShared = (k,v) => host.shared.set(k,v);
  export const setAgentOrder = x => host.order = x;
  export const window = () => ({ active: host.active, platform: host.platform, buttons: host.buttons });
  export const run = (name, args) => host.calls.push({name,args});
  export const exec = async (command, args) => { host.exec = {command,args}; return {code:1,stdout:""}; };
`);
const mainSource = (await readFile(new URL("mods/night-city/main.js", root), "utf8"))
  .replaceAll('"gpui-kit"', JSON.stringify(stub)).replaceAll('"gpui-base"', JSON.stringify(stub))
  .replaceAll('"herdr"', JSON.stringify(stub)).replaceAll('"./model.js"', JSON.stringify(modelURL));
const { default: NightCity } = await import(url(mainSource));
const cx = { timer: { every: (ms, fn) => host.timers.push({ ms, fn }) }, notify() {},
  spawn: fn => { host.pending = fn(cx); }, stop_propagation() { host.stopped = true; } };
const flatten = tree => typeof tree === "object" && tree ? [tree, ...tree.kids.flatMap(flatten)] : [];
const withId = (tree, id) => flatten(tree).find(n => n.ops.some(([key, value]) => key === "id" && value === id));
const motions = tree => flatten(tree).flatMap(n => n.ops.filter(([key]) => ["loop", "frames", "transition", "spin"].includes(key)));
const textOf = tree => flatten(tree).flatMap(n => n.kids.filter(k => typeof k === "string"));
const roles = [{}, { role: "rail" }, { role: "rail", part: "title" },
  { role: "rail", part: "attention" }, { role: "pane", pane: "p0" }];
host.focus = { terminal: agentList[0].address };
const instance = new NightCity(); instance.init({}, cx);
for (const size of [{ width: 1600, height: 360 }, { width: 1000, height: 280 }]) {
  instance.size = size;
  const rendered = instance.render(cx);
  assert(withId(rendered, "night-city-city-scroll"));
  assert(withId(rendered, "glass-shell"));
  assert(withId(rendered, "glass-child"));
  assert(motions(rendered).length > 0);
}
console.log("PASS: skyline element construction at both target widths, shell and child windows");

for (const band of [{ width: 1600, height: 360 }, { width: 1000, height: 280 }]) {
  const geometry = skylineGeometry(modelTowers, band);
  assert(geometry.scale > 1 && geometry.scale <= 2.5);
  assert.equal(geometry.width, band.width);
  assert(geometry.height <= band.height - 40);
  assert(Math.max(...modelTowers.map(s => (s.height + 54) * geometry.scale)) + 24 <= geometry.height + 0.001);
  instance.size = band;
  const rendered = instance.render(cx);
  assert(withId(rendered, "night-city-horizon"));
  assert(withId(rendered, "night-city-street-scene").ops.some(([key]) => key === "justify_center"));
  assert(withId(rendered, `tower-${modelTowers[0].id}`).ops.some(([key, value]) => key === "w" && value === modelTowers[0].width * geometry.scale));
  assert(withId(rendered, `glass-${agentList[0].address}`).ops.some(([key, value]) => key === "h" && value === 18 * geometry.scale));
  assert(flatten(rendered).flatMap(n => n.ops).filter(([key]) => key === "text_size").every(([, value]) => value >= 10));
}
assert.equal(skylineGeometry(modelTowers, { width: 5000, height: 2000 }).scale, 2.5);
assert.equal(skylineGeometry(crowded, { width: 500, height: 180 }).scale, 1);
assert(skylineGeometry(crowded, { width: 500, height: 180 }).width > 500);
assert(Number.isFinite(skylineGeometry([], { width: 1000, height: 280 }).scale));
console.log("PASS: skyline fits both bands, scales complete towers/windows, centres on a horizon and keeps text at least 10px");

host.props = { role: "rail", part: "attention" };
const attention = instance.render(cx);
for (const blocker of data.blockers) assert(withId(attention, `attention-${blocker.address}`));
withId(attention, "attention-child").handlers.on_click({}, cx);
assert.equal(host.calls.at(-1).name, "terminal.peek");
withId(attention, "attention-remote/t6").handlers.on_click({}, cx);
assert.deepEqual(host.calls.at(-1), { name: "agent.focus", args: { terminal: "remote/t6" } });
assert(host.stopped);
instance.open({ status: "shell", pane: "shell-pane", address: "shell" });
assert.equal(host.calls.at(-1).name, "pane.focus");
const callCount = host.calls.length;
instance.open({ status: "dead", address: "gone" }); assert.equal(host.calls.length, callCount);
console.log("PASS: fixed attention lists all blockers; pane/child/remote click dispatch; dead is inert");

host.props = { role: "rail", part: "title" };
withId(instance.render(cx), "night-city-motion").handlers.on_click({}, cx);
host.props = {};
assert.equal(motions(instance.render(cx)).length, 0);
host.shared.set("night-city.still", false); host.active = false;
assert.equal(motions(instance.render(cx)).length, 0);
assert.equal(host.timers.length, 1); assert.equal(host.timers[0].ms, 10000);
host.props = { role: "pane", pane: "p1" }; assert(instance.render(cx));
host.props = { role: "rail" }; assert(instance.render(cx));
host.props = { role: "rail", part: "title" }; host.platform = "linux"; host.buttons = true;
assert(withId(instance.render(cx), "night-city-close"));
console.log("PASS: still/inactive modes remove all motion, all roles construct, one gentle data timer");

host.props = {}; host.active = true;
instance.history = ended; instance.lastCheck = 0;
instance.checkExits(cx); await host.pending;
assert.deepEqual(host.exec, { command: "hc", args: ["ls", "--all", "--json"] });
assert.equal(ghosts(instance.history)[0].status, "unavailable");
assert(!host.calls.some(c => /send|kill|close|new|split/.test(c.name)));
console.log("PASS: exit checks inherit app session, failed exec stays unavailable, no input/destructive dispatch");

// Fresh installs have no window focus, spaces, selected tab, panes or agents.
Object.assign(host, { spaces: [], panes: [], agents: [], raw: [], focus: null, active: false });
host.storage.clear();
const emptyViews = new Map();
const callsBeforeEmpty = host.calls.length;
for (const role of roles) {
  host.props = role;
  const view = new NightCity(); view.init({}, cx);
  const tree = view.render(cx);
  assert(tree, `empty role ${JSON.stringify(role)}`);
  emptyViews.set(role.part ?? role.role ?? "skyline", tree);
}
assert(textOf(emptyViews.get("skyline")).includes("Your skyline lights up when a space opens."));
assert(textOf(emptyViews.get("rail")).some(text => text.startsWith("No space / No tab")));
assert(textOf(emptyViews.get("attention")).includes("All windows quiet. Nothing needs you."));
assert(withId(emptyViews.get("title"), "night-city-motion"));
assert.deepEqual(host.order, []);
assert.equal(host.calls.length, callsBeforeEmpty);
console.log("PASS: every role constructs with zero spaces/tabs/panes/agents and null focus");

// One long reported title must stay complete in the data and hover identity.
const longTitle = "Review migration change and confirm the deployment checklist";
assert.equal(longTitle.length, 60);
const longAgent = { ...agentList[0], title: longTitle, status: "blocked" };
Object.assign(host, { spaces: [spaces[0]], agents: [longAgent],
  panes: [{ ...panes[0], title: longTitle, status: "blocked" }],
  raw: [{ ...raw[0], status: "blocked" }], focus: { terminal: longAgent.address }, active: true });
const longViews = new Map();
for (const role of roles) {
  host.props = role;
  const view = new NightCity(); view.init({}, cx);
  const tree = view.render(cx);
  assert(tree, `long-title role ${JSON.stringify(role)}`);
  longViews.set(role.part ?? role.role ?? "skyline", tree);
}
assert(textOf(longViews.get("attention")).includes(longTitle));
assert(textOf(longViews.get("pane")).includes(longTitle));
assert(textOf(longViews.get("rail")).some(text => text.endsWith(longTitle)));
assert(withId(longViews.get("skyline"), `glass-${longAgent.address}`).ops
  .some(([key, value]) => key === "tooltip" && value.startsWith(longTitle)));
assert(withId(longViews.get("attention"), `attention-${longAgent.address}`).ops
  .some(([key, value]) => key === "tooltip" && value.startsWith(longTitle)));
for (const key of ["attention", "pane", "rail"]) {
  assert(flatten(longViews.get(key)).some(n => n.ops.some(([key]) => key === "truncate") &&
    n.ops.some(([key, value]) => key === "min_w" && value === 0) && textOf(n).some(text => text.includes(longTitle))));
}
console.log("PASS: every role constructs with a 60-character title; titles truncate without losing full identity");

host.agents = [{ ...longAgent, title: "" }];
host.panes = [{ ...panes[0], title: "" }];
host.raw = [{ ...raw[0], status: "blocked", report: { title: "refresh token cache" } }];
for (const role of [{ role: "rail" }, { role: "rail", part: "attention" }, { role: "pane", pane: "p0" }]) {
  host.props = role;
  const view = new NightCity(); view.init({}, cx);
  assert(textOf(view.render(cx)).some(text => text.includes("refresh token cache")));
}
host.props = { role: "rail", part: "attention" };
host.raw = host.raw.map(({ status_ms, ...record }) => record);
const absentTime = instance.render(cx);
host.raw = host.raw.map(t => ({ ...t, status_ms: now }));
const presentTime = instance.render(cx);
assert.deepEqual(textOf(absentTime), textOf(presentTime));
assert(!textOf(absentTime).some(text => text === "?" || /elapsed/i.test(text)));
console.log("PASS: report-only task titles reach street, attention and pane header; missing status time draws no placeholder");

const recipe = await readFile(new URL("RECIPE.md", root), "utf8");
assert(recipe.includes("![Night City](preview.png)"));
assert(!/\b(?:lead|harness|sandbox|HC_SESSION|phase\w*)\b/i.test(recipe));
assert(recipe.includes("does not show remote towers, the river or the bridge"));
async function packageFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    return entry.isDirectory() ? packageFiles(path) : [path];
  }))).flat();
}
for (const file of await packageFiles(root)) {
  if (/(?:gpui-kit\.d\.ts|jsconfig\.json)$/.test(file.pathname) || !/\.(?:js|mjs|md|json|svg)$/.test(file.pathname)) continue;
  const content = await readFile(file, "utf8");
  assert(!/\/(?:Users|home)\/[^/\s]+/.test(content), `private home path in ${file.pathname.split("/").at(-1)}`);
  assert(!/[\u2013\u2014]/u.test(content), `text policy in ${file.pathname.split("/").at(-1)}`);
}
console.log("PASS: gallery recipe uses native root preview, discloses remote limits and has no job text or private home paths");
delete globalThis.__nightCityFixture;
delete globalThis.localStorage;

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runtime, find, nodes, textOf } from "./runtime.mjs";
import { agent } from "./fixtures.mjs";
import { S, rowHeight, rowsHeight } from "../mods/fleet-tab/spacing.js";
const click = (tree, id, cx) => find(tree, id).events.on_click({}, cx);

test("real renderer pins every blocker outside roster scrolling in both modes at both heights", async () => {
  const rt = await runtime(), sidebar = rt.create("sidebar");
  for (const height of [628, 828]) for (const minimal of [false, true]) for (const group of ["status", "host", "project"]) {
    rt.store.set("fleet-tab.minimal", minimal); rt.store.set("fleet-tab.group", group);
    sidebar.view.input.change("no possible match", rt.cx);
    const tree = sidebar.render(); tree.events.on_size_change({ width: 384, height }, rt.cx);
    const next = sidebar.render(), attention = find(next, "fleet-attention"), roster = find(next, "fleet-roster-scroll");
    assert.equal(nodes(attention).filter(n => n.idValue?.startsWith("fleet-row-")).length, 4);
    assert.equal(nodes(roster).filter(n => n.idValue?.startsWith("fleet-row-")).length, 0);
    assert.ok(textOf(attention).includes("ops / auth")); assert.ok(textOf(attention).includes("edge/t11"));
    assert.ok(find(attention, "fleet-attention-scroll").style.h[0] <= height * 0.48);
  }
});
test("actual controls persist minimal/group/motion choices; activity and space menus work", async () => {
  const rt = await runtime(), sidebar = rt.create("sidebar");
  click(sidebar.render(), "fleet-minimal", rt.cx); assert.equal(rt.store.get("fleet-tab.minimal"), true);
  assert.ok(rt.create("sidebar").render()); assert.equal(rt.store.get("fleet-tab.minimal"), true);
  click(sidebar.render(), "fleet-full", rt.cx); assert.equal(rt.store.get("fleet-tab.minimal"), false);
  click(sidebar.render(), "fleet-group", rt.cx); assert.equal(rt.state.overlays.at(-1).props.role, "group");
  const group = rt.create("group", { overlay: "group-popup" }); click(group.render(), "fleet-group-host", rt.cx);
  assert.equal(rt.store.get("fleet-tab.group"), "host"); assert.equal(rt.state.overlays.at(-1).closed, "group-popup");
  assert.ok(textOf(group.render()).includes("Host  ✓"));
  click(sidebar.render(), "fleet-activity", rt.cx); assert.equal(rt.state.overlays.at(-1).props.role, "activity");
  assert.ok(textOf(rt.create("activity").render()).includes("needs you 4"));
  const top = rt.create("topbar"); click(top.render(), "fleet-motion", rt.cx); assert.equal(rt.store.get("fleet-tab.still"), true);
  const menu = rt.create("spaces", { overlay: "space-popup" }); click(menu.render(), "fleet-space-edge/ops-edge/auth", rt.cx);
  assert.deepEqual(JSON.parse(JSON.stringify(rt.state.commands.slice(-2))), [{ name: "space.select", args: { id: "edge/ops" } }, { name: "tab.select", args: { id: "edge/auth" } }]);
});
test("pane agents focus, raw children peek, long titles truncate with full hover identity", async () => {
  const rt = await runtime(), sidebar = rt.create("sidebar"), tree = sidebar.render();
  click(tree, "fleet-row-t2", rt.cx); assert.equal(rt.state.commands.at(-1).name, "agent.focus");
  click(tree, "fleet-row-edge/t11", rt.cx); assert.equal(rt.state.commands.at(-1).name, "terminal.peek");
  assert.equal(rt.state.commands.at(-1).args.terminal, "edge/t11");
  const row = find(tree, "fleet-row-t7"); assert.ok(row.style.tooltip[0].includes("x".repeat(60)));
  assert.ok(nodes(row).some(n => n.style.truncate && textOf(n) === "x".repeat(60)));
  const pane = rt.create("pane", { pane: "p-t7" }); assert.ok(textOf(pane.render()).includes("x".repeat(60)));
  click(rt.create("tabs").render(), "fleet-tab-review", rt.cx); assert.equal(rt.state.commands.at(-1).args.id, "review");
});
test("all roles render empty, missing pane and unreported shell without exceptions", async () => {
  const rt = await runtime({ empty: true });
  for (const role of ["sidebar", "topbar", "tabs", "pane", "status", "group", "activity", "spaces"]) assert.ok(rt.create(role).render());
  assert.ok(textOf(rt.create("status").render()).includes("No space | No tab | 0 panes"));
  rt.state.panes = [{ pane: "shell", terminal: "t90", title: "shell", program: { name: "shell" } }];
  assert.ok(textOf(rt.create("pane", { pane: "shell" }).render()).includes("shell"));
});
test("native frames and data clocks pause inactive; still mode removes animation", async () => {
  const rt = await runtime(), sidebar = rt.create("sidebar");
  const animated = nodes(sidebar.render()).filter(n => n.style.frames);
  assert.ok(animated.length); assert.ok(animated.every(n => n.style.frames[1] === 400));
  rt.store.set("fleet-tab.still", true); assert.equal(nodes(sidebar.render()).some(n => n.style.frames), false);
  rt.store.set("fleet-tab.still", false); rt.state.active = false;
  assert.equal(nodes(sidebar.render()).some(n => n.style.frames), false);
  const before = rt.state.notifications; rt.state.timers.find(t => t.ms === 1000).fn(rt.cx); assert.equal(rt.state.notifications, before);
  sidebar.view.refreshExits(rt.cx); assert.equal(rt.state.checks.length, 0);
});
test("a null window renders all roles without an active workspace and skips animation, timers and reads", async () => {
  const rt = await runtime({ windowPresent: false }), sidebar = rt.create("sidebar");
  assert.equal(nodes(sidebar.render()).some(n => n.style.frames), false);
  // Remember agents before removing them, so an exit read would otherwise be due.
  rt.state.agents = []; rt.state.terminals = []; rt.state.spaces = []; rt.state.panes = [];
  assert.ok(textOf(sidebar.render()).includes("UNAVAILABLE"));
  for (const role of ["sidebar", "topbar", "tabs", "pane", "status", "group", "activity", "spaces"])
    assert.doesNotThrow(() => rt.create(role).render());
  const topbar = rt.create("topbar").render();
  assert.equal(topbar.style.pl[0], S.topbarInset);
  assert.equal(nodes(topbar).some(n => n.idValue?.startsWith("fleet-window-")), false);
  const notifications = rt.state.notifications;
  for (const timer of rt.state.timers) timer.fn(rt.cx);
  assert.equal(rt.state.notifications, notifications);
  assert.equal(rt.state.checks.length, 0); assert.equal(rt.state.jobs.length, 0);
});
test("tabs are amber pills and cards omit redundant status while retaining meaningful detail", async () => {
  const rt = await runtime(), tabs = rt.create("tabs").render();
  assert.equal(find(tabs, "fleet-tab-build").style.bg[0], "accent");
  for (const id of ["fleet-tab-build", "fleet-tab-review"]) assert.equal(find(tabs, id).style.rounded[0], 6);
  const sidebar = rt.create("sidebar"), tree = sidebar.render();
  assert.ok(!textOf(find(tree, "fleet-row-t8")).includes("working"));
  assert.ok(!textOf(find(tree, "fleet-row-t5")).includes("done"));
  assert.ok(textOf(find(tree, "fleet-row-t1")).includes("working · progress 26%"));
  assert.ok(textOf(find(tree, "fleet-row-t12")).includes("finished (child)"));
  for (const group of ["host", "project"]) {
    rt.store.set("fleet-tab.group", group);
    assert.ok(textOf(find(sidebar.render(), "fleet-row-t8")).includes("working"));
    assert.ok(textOf(find(sidebar.render(), "fleet-row-t5")).includes("done"));
  }
});
test("three pinned cards have room for their gaps at both target sizes and in both modes", async () => {
  const rt = await runtime(); rt.state.terminals = rt.state.terminals.filter(t => t.address !== "edge/t11");
  const sidebar = rt.create("sidebar");
  for (const [width, height] of [[320, 628], [384, 810], [384, 828]]) for (const minimal of [false, true]) {
    rt.store.set("fleet-tab.minimal", minimal);
    sidebar.render().events.on_size_change({ width, height }, rt.cx);
    const pinned = find(sidebar.render(), "fleet-attention-scroll");
    assert.equal(nodes(pinned).filter(n => n.idValue?.startsWith("fleet-row-")).length, 3);
    assert.equal(pinned.style.h[0], rowsHeight(3, minimal, true));
    assert.ok(nodes(pinned).filter(n => n.idValue?.startsWith("fleet-row-")).every(n => n.style.h[0] === rowHeight(minimal, true)));
    assert.ok(pinned.style.h[0] <= height * S.attentionShare);
  }
});
test("sidebar adapts at 1200 px without repeating commands or changing the selected mode", async () => {
  const rt = await runtime(); rt.store.set("fleet-tab.minimal", true);
  const topbar = rt.create("topbar").render();
  for (const width of [0, 1000, 1199, 1200, 1600, 1199, 0]) topbar.events.on_size_change({ width }, rt.cx);
  assert.deepEqual(JSON.parse(JSON.stringify(rt.state.commands)), [
    { name: "layout.resize", args: { id: "sidebar", px: 320 } },
    { name: "layout.resize", args: { id: "sidebar", px: 384 } },
    { name: "layout.resize", args: { id: "sidebar", px: 320 } }
  ]);
  assert.equal(rt.store.get("fleet-tab.minimal"), true);
  const layout = JSON.parse(await readFile(new URL("../layouts/fleet-tab.json", import.meta.url)));
  assert.equal(layout.children.find(n => n.id === "fleet-tab-body").children.find(n => n.id === "sidebar").min, 320);
});
test("exit checks handle failure, duplicate requests, revival and confirmed archive", async () => {
  const rt = await runtime(), sidebar = rt.create("sidebar"); sidebar.render();
  rt.state.agents = rt.state.agents.filter(a => a.address !== "t1"); rt.state.terminals = rt.state.terminals.filter(a => a.address !== "t1");
  assert.ok(textOf(sidebar.render()).includes("UNAVAILABLE"));
  rt.state.reply = { code: 1, stdout: "" }; sidebar.view.refreshExits(rt.cx); await Promise.all(rt.state.jobs);
  assert.ok(textOf(sidebar.render()).includes("Exit check unavailable"));
  let resolve; rt.state.reply = new Promise(r => { resolve = r; });
  sidebar.view.refreshExits(rt.cx); sidebar.view.refreshExits(rt.cx); assert.equal(rt.state.checks.length, 2);
  rt.state.terminals.push({ address: "t1", state: "live" }); resolve({ code: 0, stdout: '{"terminals":[{"address":"t1","state":"finished"}]}' });
  await Promise.all(rt.state.jobs); assert.equal(sidebar.view.history.find(a => a.address === "t1").exit, null);
  rt.state.terminals = rt.state.terminals.filter(a => a.address !== "t1");
  rt.state.reply = { code: 0, stdout: '{"terminals":[{"address":"t1","state":"finished","exit_code":0}]}' };
  sidebar.view.refreshExits(rt.cx); await Promise.all(rt.state.jobs);
  const archived = find(sidebar.render(), "fleet-row-t1"); assert.ok(textOf(archived).includes("exited · code 0"));
  assert.equal(archived.events.on_click, undefined); assert.ok(textOf(sidebar.render()).includes("ARCHIVED"));
  assert.deepEqual(JSON.parse(JSON.stringify(rt.state.checks[0])), ["ls", "--all", "--json"]);
});
test("package uses one active split tree, scoped pane headers and only three readable sizes", async () => {
  const layout = JSON.parse(await readFile(new URL("../layouts/fleet-tab.json", import.meta.url)));
  const walk = node => [node, ...(node.children ?? []).flatMap(walk)];
  const all = walk(layout); assert.equal(all.filter(n => n.content?.tab === "active").length, 1);
  const live = all.find(n => n.content?.tab === "active"); assert.equal(live.content.pane.header.content.props.role, "pane");
  assert.equal(live.content.pane.focus.color, "accent"); assert.equal(live.content.pane.radius, 0);
  const rt = await runtime(), sizes = new Set([layout.font_size]);
  for (const role of ["sidebar", "topbar", "tabs", "pane", "status", "group", "activity", "spaces"])
    for (const n of nodes(rt.create(role).render())) if (n.style.text_size) sizes.add(n.style.text_size[0]);
  assert.deepEqual([...sizes].sort((a, b) => a - b), [11, 13, 14]);
});

test("agent-only revival also defeats a stale exit reply; a closed copy cannot persist it", async () => {
  const rt = await runtime(), sidebar = rt.create("sidebar"); sidebar.render();
  rt.state.agents = rt.state.agents.filter(a => a.address !== "t1"); rt.state.terminals = rt.state.terminals.filter(a => a.address !== "t1");
  let resolve; rt.state.reply = new Promise(r => { resolve = r; }); sidebar.view.refreshExits(rt.cx);
  rt.state.agents.push(agent("t1", "working"));
  resolve({ code: 0, stdout: '{"terminals":[{"address":"t1","state":"finished"}]}' }); await Promise.all(rt.state.jobs);
  assert.equal(sidebar.view.history.find(a => a.address === "t1").exit, null);
  rt.state.agents = rt.state.agents.filter(a => a.address !== "t1");
  rt.state.reply = new Promise(r => { resolve = r; }); sidebar.view.refreshExits(rt.cx);
  const saved = rt.disk.get("fleet-tab.history"); sidebar.view.close();
  resolve({ code: 0, stdout: '{"terminals":[{"address":"t1","state":"finished"}]}' }); await Promise.all(rt.state.jobs);
  assert.equal(rt.disk.get("fleet-tab.history"), saved);
});

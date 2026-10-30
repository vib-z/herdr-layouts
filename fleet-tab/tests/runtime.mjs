import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as fixtures from "./fixtures.mjs";

const methods = new Set("h w p px py pt pl pr pb gap text_size line_height text_right text_color font_family font_semibold size_full w_full h_full size min_w max_w min_h flex_1 flex_none flex_shrink_1 flex items_center justify_center justify_between bg border border_color rounded cursor_pointer overflow_hidden overflow_x_scrollbar overflow_y_scrollbar truncate tooltip frames on_size_change on_click on_mouse_down hover".split(" "));
function element(kind) {
  const target = { kind, idValue: null, kids: [], style: {}, events: {} };
  let proxy;
  proxy = new Proxy(target, { get(object, key) {
    if (key in object) return object[key];
    if (key === "id") return value => { object.idValue = value; return proxy; };
    if (key === "child") return value => { object.kids.push(value); return proxy; };
    if (key === "children") return values => { object.kids.push(...values); return proxy; };
    if (key === "when") return (condition, fn) => condition ? fn(proxy) : proxy;
    if (!methods.has(key)) throw new Error(`Unexpected builder method: ${String(key)}`);
    return (...args) => {
      if (key.startsWith("on_")) object.events[key] = args.at(-1);
      else object.style[key] = args;
      return proxy;
    };
  } });
  return proxy;
}
export function nodes(tree) { return typeof tree !== "object" || tree === null ? [] : [tree, ...tree.kids.flatMap(nodes)]; }
export const find = (tree, id) => nodes(tree).find(node => node.idValue === id);
export const textOf = tree => typeof tree === "string" ? tree : tree?.kids?.map(textOf).join(" ") ?? "";

export async function runtime({ empty = false, windowPresent = true, store = new Map(), disk = new Map() } = {}) {
  const state = { agents: empty ? [] : structuredClone(fixtures.agents), terminals: empty ? [] : structuredClone(fixtures.terminals),
    spaces: empty ? [] : structuredClone(fixtures.spaces), panes: [], active: true, windowPresent, props: {}, commands: [], overlays: [], order: [],
    checks: [], reply: { code: 0, stdout: '{"terminals":[]}' }, timers: [], jobs: [], notifications: 0 };
  state.panes = state.agents.map(a => ({ pane: a.pane, terminal: a.address, tab: a.tab, title: a.title, status: a.status, focused: a.focused, program: a.program }));
  const context = vm.createContext({ Date, console, localStorage: { getItem: key => disk.get(key) ?? null, setItem: (key, value) => disk.set(key, value) } });
  const colorNames = "foreground muted dim accent accent_foreground chrome surface popover canvas selected hover border blocked".split(" ");
  const api = {
    agents: () => state.agents, terminals: () => state.terminals, spaces: () => state.spaces, panes: () => state.panes,
    focused: () => state.spaces.length ? { space: "api", tab: "build" } : null, props: () => state.props,
    theme: () => Object.fromEntries(colorNames.map(name => [name, name])), window: () => state.windowPresent ? ({ active: state.active, platform: "macos", buttons: false }) : null,
    shared: key => store.get(key), setShared: (key, value) => store.set(key, value), setAgentOrder: list => { state.order = list; },
    run: (name, args) => state.commands.push({ name, args }), hc: async args => { state.checks.push(args); return await state.reply; },
    openOverlay: options => state.overlays.push(options), closeOverlay: id => state.overlays.push({ closed: id })
  };
  const input = { new: options => {
    let value = options.value ?? "";
    return { handlers: {}, value: () => value, on(name, handler) { this.handlers[name] = handler; },
      change(next, cx) { value = next; this.handlers.change({}, cx); } };
  } };
  const modules = new Map();
  for (const [name, values] of Object.entries({ herdr: api, "gpui-kit": { View: class {}, div: () => element("div"), svg: path => element(`svg:${path}`) },
    "gpui-base": { h_flex: () => element("h_flex"), v_flex: () => element("v_flex"), InputState: input, Input: { new: () => element("input") } } })) {
    modules.set(name, new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }));
  }
  const model = new vm.SourceTextModule(await readFile(new URL("../mods/fleet-tab/model.js", import.meta.url), "utf8"), { context });
  modules.set("./model.js", model);
  modules.set("./spacing.js", new vm.SourceTextModule(await readFile(new URL("../mods/fleet-tab/spacing.js", import.meta.url), "utf8"), { context }));
  const main = new vm.SourceTextModule(await readFile(new URL("../mods/fleet-tab/main.js", import.meta.url), "utf8"), { context });
  await main.link(name => { if (!modules.has(name)) throw new Error(`Unknown import ${name}`); return modules.get(name); });
  await main.evaluate();
  const cx = { notify: () => state.notifications++, stop_propagation() {}, timer: { every: (ms, fn) => state.timers.push({ ms, fn }) },
    spawn: fn => state.jobs.push(fn(cx)) };
  const views = [];
  return { state, store, disk, cx, create(role, extra = {}) {
    state.props = { role, ...extra };
    const view = new main.namespace.default(); view.init({}, cx); views.push(view);
    return { view, render() { state.props = { role, ...extra }; return view.render(); } };
  } };
}

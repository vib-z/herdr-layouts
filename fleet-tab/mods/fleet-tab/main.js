import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { agents, terminals, spaces, panes, focused, props, run, theme, window as appWindow,
  shared, setShared, setAgentOrder, hc, openOverlay, closeOverlay } from "herdr";
import { HISTORY_LIMIT, EXIT_INTERVAL, STATUS, plain, collectRows, preferences, toggleMinimal, groupRows,
  stateStart, remember, markMissing, missingRows, confirmExits, elapsed, chips, identity, focusCommand, titleOf, statusOf } from "./model.js";

import { S, TYPE, px, titleInset, headerHeight, rowGap, rowHeight, pinnedReservation } from "./spacing.js";

const text = (value, tint = theme().foreground, size = TYPE.body) => div().text_size(size).line_height(px(S.line)).text_color(tint).child(String(value));
const base = () => v_flex().font_family("Geist Mono").text_size(TYPE.body).line_height(px(S.line)).text_color(theme().foreground);
const color = status => status === "blocked" ? theme().blocked : status === "working" ? theme().accent : status === "done" ? theme().foreground : theme().dim;
const liveRows = () => collectRows(agents(), terminals(), spaces());
const motion = () => !preferences(shared).still && appWindow().active;
const focus = a => { const command = focusCommand(a); if (command) run(command.name, command.args); };
const stateLabel = a => a.rawDone ? "finished (child)" : STATUS[a.status] ?? "shell";
function button(id, label, click, { selected = false, round = false } = {}) {
  return h_flex().id(id).h(S.control).px(S.inset).flex_none().items_center().justify_center().gap(S.gap)
    .text_size(TYPE.meta).line_height(px(S.line)).text_color(selected ? theme().accent_foreground : theme().muted)
    .bg(selected ? theme().accent : theme().chrome).when(round, el => el.rounded(S.pillRadius))
    .cursor_pointer().hover(el => el.bg(selected ? theme().accent : theme().hover))
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .on_click((_event, cx) => { cx.stop_propagation(); click(cx); }).child(label);
}
function glyph(a) {
  const resting = { blocked: "!", working: "●", done: "✓", idle: "·", archived: "×", unavailable: "?" };
  const element = text(resting[a.status] ?? "·", color(a.status), TYPE.body).id(`fleet-state-${a.address}`)
    .w(S.state).min_w(S.state).max_w(S.state).flex_none().overflow_hidden();
  if (a.status === "working" && motion()) element.frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 400);
  return element;
}
function programIcon(a) {
  const p = a.program;
  return div().w(S.icon).h(S.icon).flex_none().text_color(theme().muted).child(p?.icon && p.tint
    ? svg(p.icon).size(S.icon) : text(plain(p?.name).slice(0, 1).toUpperCase() || ">", theme().muted));
}
function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem("fleet-tab.history") ?? "[]");
    return Array.isArray(value) ? value.filter(a => a && typeof a.address === "string").slice(-HISTORY_LIMIT) : [];
  } catch (_) { return []; }
}
const popup = (role, width, height) => openOverlay({ mod: "fleet-tab", props: { role }, kind: "popup", width, height });

export default class FleetTab extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "sidebar";
    this.query = "";
    this.size = { width: S.sidebar, height: S.initialHeight };
    this.closed = false;
    this.pending = false;
    this.exitMessage = "";
    if (this.role === "sidebar") {
      this.history = readHistory();
      this.clocks = new Map(this.history.map(a => [a.address, a]));
      this.input = InputState.new({ placeholder: "Search agents, hosts, projects" });
      this.input.on("change", (_e, cx) => { this.query = this.input.value(); cx.notify(); });
      cx.timer.every(1000, cx => { if (!this.closed && appWindow().active) cx.notify(); });
      cx.timer.every(EXIT_INTERVAL, cx => this.refreshExits(cx));
    }
  }
  close() { this.closed = true; }
  rows() {
    const allSpaces = spaces(), raw = terminals(), live = collectRows(agents(), raw, allSpaces), now = Date.now();
    for (const a of live) this.clocks.set(a.address, { ...a, state_started_ms: stateStart(a, this.clocks.get(a.address), allSpaces, now) });
    const key = JSON.stringify([live.map(a => [a.address, a.title, a.space, a.space_name, a.tab, a.tab_name,
      a.status, a.rawDone, a.status_ms, a.host, a.project, a.model, a.progress, a.program]), raw.map(t => t.address)]);
    if (key !== this.liveKey) {
      this.liveKey = key;
      this.history = markMissing(remember(this.history, live, now, allSpaces), live, raw, now);
      localStorage.setItem("fleet-tab.history", JSON.stringify(this.history));
      const keep = new Set([...live, ...this.history].map(a => a.address));
      for (const address of this.clocks.keys()) if (!keep.has(address)) this.clocks.delete(address);
    }
    return [...live.map(a => ({ ...a, state_started_ms: this.clocks.get(a.address)?.state_started_ms })),
      ...missingRows(this.history, live, raw)];
  }
  refreshExits(cx) {
    if (this.closed || this.pending || !appWindow().active) return;
    if (!this.rows().some(a => a.status === "unavailable")) return;
    this.pending = true;
    cx.spawn(async cx => {
      try {
        const reply = await hc(["ls", "--all", "--json"]);
        if (reply.code !== 0) throw new Error("Exit check unavailable");
        if (this.closed) return;
        // Reconcile against the current live set, not the set captured before the request.
        this.rows();
        this.history = confirmExits(this.history, JSON.parse(reply.stdout), new Set([...agents(), ...terminals()].map(t => t.address)));
        localStorage.setItem("fleet-tab.history", JSON.stringify(this.history));
        this.exitMessage = "";
      } catch (_) { this.exitMessage = "Exit check unavailable"; }
      finally { this.pending = false; if (!this.closed && appWindow().active) cx.notify(); }
    });
  }
  row(a, minimal, pinned = false) {
    const dead = ["archived", "unavailable"].includes(a.status);
    const state = stateLabel(a);
    const time = elapsed(dead ? a.missingSince : a.state_started_ms, Date.now());
    const tip = `${identity(a)}\n${state}\n${dead ? "Time since disappearance observed" : "Time in observed state"}${a.model ? `\nReported model: ${a.model}` : ""}${a.progress != null ? `\nProgress: ${a.progress}%` : ""}`;
    const showDetail = preferences(shared).group !== "status" ||
      (minimal ? dead || a.rawDone : a.progress != null || a.child || a.exit?.code != null);
    const detail = dead ? `${state}${a.exit?.code != null ? ` · code ${a.exit.code}` : ""}` :
      `${state}${a.child && !a.rawDone ? " · child" : ""}${!minimal && a.progress != null ? ` · progress ${a.progress}%` : ""}`;
    const inset = minimal ? S.minimalPad : S.cardInset - S.stroke;
    const row = base().id(`fleet-row-${a.address}`).w_full().h(rowHeight(minimal, pinned, showDetail)).flex_none()
      .px(minimal ? S.inset : S.cardInset - S.stroke).py(inset).gap(rowGap(minimal))
      .rounded(minimal ? S.minimalRadius : S.cardRadius)
      .bg(a.focused ? theme().selected : minimal ? theme().chrome : theme().surface)
      .border(minimal ? S.none : S.stroke)
      .border_color(pinned ? theme().blocked : a.focused ? theme().accent : theme().surface)
      .tooltip(tip).when(!dead, el => el.cursor_pointer().hover(s => s.bg(theme().hover)).on_click(() => focus(a)));
    const title = h_flex().h(S.line).flex_none().gap(S.gap).items_center().min_w(S.none)
      .child(glyph(a)).child(programIcon(a))
      .child(text(a.title, dead ? theme().muted : theme().foreground, TYPE.title).font_family("Geist").font_semibold().flex_1().min_w(S.none).truncate())
      .child(text(time, theme().dim, TYPE.meta).w(S.elapsed).min_w(S.elapsed).max_w(S.elapsed).flex_none().text_right()
        .tooltip(dead ? "Since disappearance observed" : "Elapsed in observed state"));
    const secondary = (value, tint = theme().muted) => text(value, tint, TYPE.meta)
      .h(S.line).flex_none().pl(minimal ? titleInset : S.none).truncate();
    row.child(title);
    if (pinned) {
      return row.child(secondary(`${plain(a.space_name)} / ${plain(a.tab_name)}`))
        .child(secondary(`${a.address} · needs you${a.child ? " · child" : ""}`, theme().blocked));
    }
    if (minimal) {
      const location = `${plain(a.space_name)} / ${plain(a.tab_name)}${a.progress != null ? ` · progress ${a.progress}%` : ""}`;
      row.child(secondary(`${location}${showDetail ? ` · ${detail}` : ""}`));
    } else {
      row.child(h_flex().h(S.chip).flex_none().gap(S.gap).min_w(S.none).children(chips(a).map(c =>
        text(`${c.kind === "host" ? "@" : c.kind === "project" ? "/" : ""}${c.value}`, theme().muted, TYPE.meta)
          .h(S.chip).px(S.gap).py(S.nudge).rounded(S.minimalRadius).bg(theme().chrome).flex_shrink_1().min_w(S.none).truncate().tooltip(`${c.kind}: ${c.value}`))));
      if (showDetail) row.child(text(detail, color(a.status), TYPE.meta).h(S.line).flex_none().truncate());
    }
    return row;
  }
  label(value, count, tint = theme().dim) {
    return h_flex().h(headerHeight).pt(S.headerTop).pb(S.headerBottom).px(S.inset).flex_none().items_center().justify_between()
      .child(text(value.toUpperCase(), tint, TYPE.meta))
      .child(text(count, tint, TYPE.meta).w(S.elapsed).flex_none().text_right());
  }
  sidebar() {
    const all = this.rows(), prefs = preferences(shared), parts = groupRows(all, this.query, prefs.group);
    setAgentOrder([...parts.attention, ...parts.groups.flatMap(g => g.rows)].filter(a => focusCommand(a)).map(a => a.address));
    const attentionHeight = pinnedReservation(parts.attention.length, prefs.minimal, this.size.height);
    const attention = base().id("fleet-attention").flex_none()
      .child(this.label("Needs you", parts.attention.length, parts.attention.length ? theme().blocked : theme().dim));
    if (parts.attention.length) attention.child(base().id("fleet-attention-scroll").h(attentionHeight).min_h(S.none)
      .overflow_y_scrollbar().gap(rowGap(prefs.minimal)).children(parts.attention.map(a => this.row(a, prefs.minimal, true))));
    else attention.child(text("No agents waiting for you", theme().dim, TYPE.meta).px(S.inset).pb(S.gap));
    const roster = base().id("fleet-roster-scroll").flex_1().min_h(S.none).overflow_y_scrollbar();
    for (const group of parts.groups) roster.child(base().flex_none()
      .child(this.label(group.key, group.rows.length))
      .child(base().gap(rowGap(prefs.minimal)).children(group.rows.map(a => this.row(a, prefs.minimal)))));
    if (!parts.groups.length) roster.child(text(all.length ? "No other matches" : "No agents reporting yet", theme().dim, TYPE.body).px(S.inset).py(S.inset));
    return base().id("fleet-sidebar-root").size_full().min_h(S.none).bg(theme().chrome).p(S.inset)
      .on_size_change((size, cx) => {
        if (size.width !== this.size.width || size.height !== this.size.height) { this.size = size; cx.notify(); }
      })
      .child(base().flex_none().gap(S.gap)
        .child(h_flex().h(S.control).flex_none().items_center().justify_between()
          .child(text("AGENTS", theme().muted, TYPE.meta).pl(S.inset))
          .child(h_flex().gap(S.gap).child(button("fleet-full", "Cards", () => { if (preferences(shared).minimal) toggleMinimal(shared, setShared); }, { selected: !prefs.minimal, round: true }))
            .child(button("fleet-minimal", "Minimal", () => { if (!preferences(shared).minimal) toggleMinimal(shared, setShared); }, { selected: prefs.minimal, round: true }))))
        .child(h_flex().h(S.control).flex_none().gap(S.gap).items_center()
          .child(Input.new(this.input).flex_1().min_w(S.none).h(S.control).px(S.inset - S.stroke).line_height(px(S.line)).rounded(S.pillRadius).bg(theme().surface)
            .border(S.stroke).border_color(theme().border).text_size(TYPE.meta).text_color(theme().foreground))
          .child(button("fleet-group", "≡", () => popup("group", S.groupWidth, S.groupHeight), { round: true }).w(S.control).tooltip("Group by status, host or project"))
          .child(button("fleet-activity", "⌁", () => popup("activity", S.activityWidth, S.activityHeight), { round: true }).w(S.control).tooltip("Activity across all spaces"))))
      .child(attention).child(roster)
      .when(Boolean(this.exitMessage), el => el.child(text(this.exitMessage, theme().dim, TYPE.meta).px(S.inset).flex_none()));
  }
  topbar() {
    const space = spaces().find(s => s.active);
    return h_flex().id("fleet-topbar-root").size_full().pl(appWindow().platform === "macos" ? S.macInset : S.topbarInset).pr(S.gutter).gap(S.gutter).items_center()
      .bg(theme().chrome).font_family("Geist Mono")
      .on_size_change(({ width }) => {
        if (!Number.isFinite(width) || width <= 0) return;
        const sidebarWidth = width < S.breakpoint ? S.sidebarNarrow : S.sidebar;
        if (this.sidebarWidth === sidebarWidth) return;
        this.sidebarWidth = sidebarWidth;
        run("layout.resize", { id: "sidebar", px: sidebarWidth });
      })
      .child(text("FLEET TAB", theme().foreground, TYPE.body).font_semibold())
      .child(button("fleet-spaces", `${plain(space?.name) || "Choose space"} ▾`, () => popup("spaces", S.spacesWidth, S.spacesHeight)).min_w(S.none).truncate())
      .child(div().flex_1())
      .child(button("fleet-motion", preferences(shared).still ? "Motion off" : "Motion on", () => setShared("fleet-tab.still", !preferences(shared).still)))
      .child(button("fleet-command", "Command", () => run("app.palette")))
      .when(appWindow().buttons, el => el.children([
        button("fleet-window-min", "Min", () => run("window.minimize")),
        button("fleet-window-max", "Max", () => run("window.maximize")),
        button("fleet-window-close", "Close", () => run("window.close"))]));
  }
  tabs() {
    const space = spaces().find(s => s.active);
    return h_flex().id("fleet-tab-strip").size_full().px(S.gutter).gap(S.gap).items_center().bg(theme().canvas)
      .font_family("Geist Mono").overflow_x_scrollbar()
      .children((space?.tabs ?? []).map(tab => button(`fleet-tab-${tab.id}`, `${plain(tab.name)}${tab.settled ? " · settled" : ""}`,
        () => run("tab.select", { id: tab.id }), { selected: tab.active }).rounded(S.tabRadius).max_w(S.tabMax).truncate().tooltip(`${plain(tab.name)} · ${tab.panes} panes`)))
      .when(!space?.tabs?.length, el => el.child(text("No active tab. Use Command to start.", theme().dim, TYPE.meta)));
  }
  pane() {
    const p = panes().find(p => p.pane === props()?.pane);
    const a = agents().find(a => a.address === p?.terminal);
    const t = terminals().find(t => t.address === p?.terminal);
    const name = titleOf(a ?? { title: p?.title, program: p?.program, address: p?.terminal }, t) || (p?.mod ? "Mod pane" : "Terminal");
    const status = statusOf(a?.status ?? p?.status);
    return h_flex().size_full().px(S.gutter).gap(S.inset).items_center().bg(theme().chrome).font_family("Geist Mono")
      .on_click(() => { if (p?.pane) run("pane.focus", { pane: p.pane }); })
      .child(text(name, p?.focused ? theme().accent : theme().foreground, TYPE.title).font_semibold().flex_1().min_w(S.none).truncate().tooltip(name))
      .child(text(STATUS[status] ?? (p?.mod ? "mod" : "shell"), color(status), TYPE.meta).flex_none());
  }
  status() {
    const f = focused(), space = spaces().find(s => s.id === f?.space) ?? spaces().find(s => s.active);
    const tab = space?.tabs?.find(t => t.id === f?.tab) ?? space?.tabs?.find(t => t.active);
    return h_flex().size_full().px(S.gutter).gap(S.statusGap).items_center().bg(theme().chrome).font_family("Geist Mono")
      .child(text(`${plain(space?.name) || "No space"} | ${plain(tab?.name) || "No tab"} | ${tab?.panes ?? 0} panes`, theme().dim, TYPE.meta).flex_1().min_w(S.none).truncate())
      .child(text("✓ done", theme().muted, TYPE.meta)).child(text("● working", theme().accent, TYPE.meta));
  }
  groupMenu() {
    const prefs = preferences(shared);
    return base().size_full().p(S.inset).gap(S.gap).bg(theme().popover)
      .child(text("Group by", theme().foreground, TYPE.title).font_semibold().h(S.control))
      .children(["status", "host", "project"].map(group => button(`fleet-group-${group}`,
        `${group[0].toUpperCase()}${group.slice(1)}${prefs.group === group ? "  ✓" : ""}`, () => {
          setShared("fleet-tab.group", group); closeOverlay(props().overlay);
        }, { selected: prefs.group === group, round: true }).h(S.menuRow)));
  }
  activity() {
    const rows = liveRows();
    return base().size_full().p(S.popupInset).gap(S.inset).bg(theme().popover)
      .child(text("Activity", theme().foreground, TYPE.title).font_semibold())
      .child(text("Across all spaces and tabs", theme().dim, TYPE.meta))
      .children(["blocked", "done", "working", "idle"].map(status => h_flex().h(S.control).items_center().justify_between()
        .child(text(STATUS[status], color(status))).child(text(rows.filter(a => a.status === status).length, color(status)))))
      .child(text("Child finishes count as idle.", theme().dim, TYPE.meta));
  }
  spaceMenu() {
    return base().size_full().min_h(S.none).p(S.inset).gap(S.inset).bg(theme().popover)
      .child(text("Spaces / tabs", theme().foreground, TYPE.title).font_semibold().h(S.control).flex_none())
      .child(base().id("fleet-space-scroll").flex_1().min_h(S.none).overflow_y_scrollbar().gap(S.gap)
        .children(spaces().flatMap(space => (space.tabs ?? []).map(tab =>
          button(`fleet-space-${space.id}-${tab.id}`, `${plain(space.name)} / ${plain(tab.name)}`, () => {
            closeOverlay(props().overlay); run("space.select", { id: space.id }); run("tab.select", { id: tab.id });
          }).truncate().tooltip(`${plain(space.machine) || "local"} · ${plain(space.name)} / ${plain(tab.name)}`))))
        .when(!spaces().length, el => el.child(text("No spaces yet. Use Command to start.", theme().dim, TYPE.meta))));
  }
  render() {
    if (this.role === "topbar") return this.topbar();
    if (this.role === "tabs") return this.tabs();
    if (this.role === "pane") return this.pane();
    if (this.role === "status") return this.status();
    if (this.role === "group") return this.groupMenu();
    if (this.role === "activity") return this.activity();
    if (this.role === "spaces") return this.spaceMenu();
    return this.sidebar();
  }
}

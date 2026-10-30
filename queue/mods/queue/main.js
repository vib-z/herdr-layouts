import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import {
  agents, terminals, spaces, focused, props, theme, window as appWindow,
  shared, setShared, run, nextCommand, setAgentOrder, exec, openOverlay, closeOverlay
} from "herdr";
import { BAND_ORDER, JUMP_KEYS, collectRows, partitionRows, remember, confirmHistory, age, nextBlocked } from "./model.js";

const LABEL = { blocked: "NEEDS YOU", done: "DONE", working: "WORKING", idle: "IDLE" };
const ui = () => shared("queue.ui") ?? {};
const update = changes => setShared("queue.ui", { ...ui(), ...changes });
const rows = () => collectRows(agents(), terminals(), spaces());
const tint = (color, alpha = "18") => /^#[0-9a-f]{6}$/i.test(color) ? color + alpha : color;
const stroke = text => [...text].map(c => c + "\u0336").join("");
const shape = (state, t, moving) => {
  const color = state === "blocked" ? t.blocked : state === "done" ? t.done : state === "working" ? t.accent : t.muted;
  const el = svg(`mods/queue/${state}.svg`).size(15).flex_none().text_color(color);
  return state === "working" && moving ? el.spin(1600) : el;
};
const programIcon = (p, t) => p?.icon
  ? (p.tint ? svg(p.icon).text_color(t.muted) : image(p.icon)).size(13).flex_none()
  : div().w(13).text_color(t.dim).child("·");
const button = (id, label, action, selected = false) => {
  const t = theme();
  return h_flex().id(id).h(25).px(8).gap(5).items_center().rounded(4).flex_none()
    .bg(selected ? t.selected : t.chrome).text_size(11).text_color(selected ? t.accent : t.muted)
    .hover(el => el.bg(t.hover)).on_click(action).child(label);
};

export default class Queue extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "list";
    this.handle = cx.focus_handle();
    this.selected = null;
    this.help = false;
    this.closedOpen = false;
    this.checking = false;
    this.checkError = "";
    this.inputFocused = false;
    this.filterShown = false;
    this.history = [];
    if (this.role === "reply") {
      this.reply = InputState.new({ placeholder: "Write a reply, Enter sends it" });
      this.reply.on("submit", (_e, cx) => this.sendReply(cx));
      this.reply.focus(); // This copy exists only after an explicit Reply click.
      return;
    }
    if (this.role !== "list") return;
    try {
      const saved = JSON.parse(localStorage.getItem("queue.history") ?? "[]");
      this.history = Array.isArray(saved) ? saved.filter(a => a?.address && Number.isFinite(a.last_seen)).slice(0, 64) : [];
    } catch (_) { this.history = []; }
    this.snoozed = {};
    this.filter = InputState.new({ placeholder: "Filter title, tab, space or address" });
    this.filter.on("change", (_e, cx) => { update({ query: this.filter.value() }); cx.notify(); });
    this.filter.on("focus", () => { this.inputFocused = true; });
    this.filter.on("blur", () => { this.inputFocused = false; });
    this.filter.set_value(ui().query ?? "");
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        this.command(command, cx);
        cx.notify();
      }
    });
    // This is a data clock, not animation. Inactive windows do not redraw or poll.
    cx.timer.every(15000, cx => { if (appWindow()?.active) cx.notify(); });
    cx.timer.every(30000, cx => { if (appWindow()?.active) this.checkHistory(cx); });
    this.checkHistory(cx);
    cx.timer.after(3000, cx => this.checkHistory(cx));
  }

  saveHistory() {
    localStorage.setItem("queue.history", JSON.stringify(this.history));
  }

  checkHistory(cx) {
    if (this.checking) return;
    this.checking = true;
    cx.spawn(async cx => {
      let snapshot = null;
      try {
        // Inherit the app's core session.
        const result = await exec("hc", ["ls", "--all", "--json"]);
        if (result.code !== 0) throw new Error("core check failed");
        snapshot = JSON.parse(result.stdout);
        if (!Array.isArray(snapshot?.terminals)) throw new Error("invalid core reply");
        this.checkError = "";
      } catch (_) { this.checkError = "Exit check unavailable"; }
      this.history = confirmHistory(this.history, snapshot, rows());
      this.saveHistory();
      this.checking = false;
      cx.notify();
    });
  }

  visible() {
    return partitionRows(rows(), { ...ui(), snoozed: this.snoozed });
  }

  chosen() {
    const ordered = this.visible().ordered;
    return ordered.find(a => a.address === this.selected)
      ?? ordered.find(a => a.address === focused()?.terminal) ?? ordered[0];
  }

  open(row) {
    if (!row) return;
    this.selected = row.address;
    if (row.child) run("terminal.peek", { terminal: row.address });
    else run("agent.focus", { terminal: row.address });
  }

  command(command, cx) {
    const list = this.visible().ordered;
    const chosen = this.chosen();
    if (command === "focus") this.handle.focus();
    else if (command === "up" || command === "down") {
      const index = list.findIndex(a => a.address === chosen?.address);
      this.selected = list[(index + (command === "down" ? 1 : list.length - 1)) % list.length]?.address ?? null;
      this.handle.focus();
    } else if (command === "open") this.open(chosen);
    else if (command === "next-blocked") this.open(nextBlocked(rows(), focused()?.terminal ?? this.selected));
    else if (command === "settle" && chosen) {
      run("tab.settle", { id: chosen.tab });
      this.message = `Settled the whole #${chosen.tab_name} tab`;
    } else if (command === "snooze" && chosen) {
      if (chosen.status === "blocked") this.message = "Needs you always stays visible";
      else { this.snoozed[chosen.address] = Date.now() + 10 * 60000; this.message = "Snoozed for 10 minutes"; }
    } else if (command === "filter") {
      this.filterShown = true;
      this.filter.focus();
    } else if (command.startsWith("space-")) {
      const space = spaces()[Number(command.slice(6)) - 1];
      if (space) { update({ space: space.id }); run("space.select", { id: space.id }); }
    }
    cx.notify();
  }

  key(e, cx) {
    if (this.inputFocused) {
      if (e.key === "escape") {
        this.filterShown = false;
        this.filter.set_value("");
        update({ query: "" });
        this.handle.focus();
        cx.stop_propagation();
        cx.notify();
      }
      return;
    }
    if (e.modifiers?.control || e.modifiers?.platform || e.modifiers?.alt) return;
    const commands = { j: "down", down: "down", k: "up", up: "up", enter: "open", n: "next-blocked", x: "settle", s: "snooze", "/": "filter" };
    if (commands[e.key]) this.command(commands[e.key], cx);
    else if (/^[1-9]$/.test(e.key)) this.command(`space-${e.key}`, cx);
    else if (e.key === "?" || e.key_char === "?") { this.help = !this.help; cx.notify(); }
    else {
      const index = JUMP_KEYS.indexOf(e.key);
      if (index < 0) return;
      this.open(this.visible().ordered[index]);
    }
    cx.stop_propagation();
  }

  replyTo(row) {
    openOverlay({ mod: "queue", kind: "dialog", width: 440, props: {
      role: "reply", address: row.address, title: row.title,
      context: `${row.space_name} / #${row.tab_name}`
    } });
  }

  sendReply(cx) {
    const text = this.reply.value().trim();
    if (!text || this.sending) return;
    // Never offer a synthetic Allow/Deny protocol or send after the target vanished.
    if (!rows().some(a => a.address === props().address && a.status === "blocked")) {
      this.replyError = "This agent no longer needs you. Open its terminal to continue.";
      cx.notify();
      return;
    }
    this.sending = true;
    cx.spawn(async cx => {
      try {
        const result = await exec("hc", ["send", props().address, text]);
        if (result.code !== 0) throw new Error("send failed");
        closeOverlay(props().overlay);
      } catch (_) {
        this.replyError = "Reply failed. Your text is kept. Open terminal to retry there.";
        this.sending = false;
        cx.notify();
      }
    });
  }

  renderReply() {
    const t = theme();
    const target = props() ?? {};
    return v_flex().p(18).gap(12).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(14).font_semibold().child(target.title || "Agent unavailable"))
      .child(div().text_size(11).text_color(t.muted).child(target.address ? `${target.context || "Agent"} · ${target.address}` : "No agent selected"))
      .child(Input.new(this.reply).h(38).px(10).border(1).border_color(t.input).rounded(4).bg(t.background))
      .child(div().text_size(11).text_color(t.muted).child("Free text only. Review approvals in the terminal."))
      .when(Boolean(this.replyError), el => el.child(div().text_size(11).text_color(t.blocked).child(this.replyError)))
      .child(h_flex().gap(8)
        .child(button("reply-open", "Open terminal", () => { closeOverlay(props().overlay); this.open(rows().find(a => a.address === props().address)); }))
        .child(button("reply-cancel", "Cancel", () => closeOverlay(props().overlay)))
        .child(button("reply-send", this.sending ? "Sending..." : "Send reply", (_e, cx) => this.sendReply(cx), true)));
  }

  renderBar(list) {
    const t = theme();
    const options = ui();
    const blocked = list.filter(a => a.status === "blocked").length;
    return h_flex().size_full().px(8).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(div().px(6).text_size(12).font_semibold().text_color(t.foreground).child("QUEUE"))
      .child(h_flex().id("queue-space-chips").flex_1().min_w(0).gap(3).overflow_x_scrollbar()
        .child(button("all", `All ${list.length}`, () => update({ space: "all", today: false }), (options.space ?? "all") === "all" && !options.today))
        .child(button("today", "Today", () => update({ space: "all", today: !options.today }), options.today))
        .children(spaces().map((space, i) => button(`space-${space.id}`, `${i < 9 ? i + 1 + " " : ""}${space.name.slice(0, 16)} ${list.filter(a => a.space === space.id).length}`, () => {
          update({ space: space.id }); run("space.select", { id: space.id });
        }, options.space === space.id))))
      .child(button("attention-next", `${blocked} need you · N`, () => run("queue.next-blocked"), blocked > 0))
      .child(button("motion", options.still ? "Still" : "Motion", () => update({ still: !options.still })))
      .child(button("filter", "/ Filter", () => run("queue.filter")));
  }

  row(row, index, attention = false) {
    const t = theme();
    const selected = this.chosen()?.address === row.address;
    const moving = !ui().still && Boolean(appWindow()?.active);
    const hint = JUMP_KEYS[index] ?? "";
    const elapsed = age(row.status_ms);
    const primary = h_flex().h(32).gap(6).items_center().min_w(0)
      .child(shape(row.status, t, moving))
      .child(div().w(11).flex_none().text_size(10).text_color(t.dim).child(hint))
      .child(programIcon(row.program, t))
      .child(div().flex_1().min_w(0).text_size(12).when(attention, el => el.font_semibold())
        .when(!attention, el => el.truncate()).child(row.title || row.program?.name || "Agent"))
      .when(!attention, el => el.child(div().max_w(72).truncate().text_size(10).text_color(t.muted).child(`#${row.tab_name}`)))
      .when(Boolean(elapsed), el => el.child(div().w(29).flex_none().text_size(10).text_color(t.muted).child(elapsed)));
    // Attention titles wrap when long. Their location and address never rely on a tooltip.
    if (attention) {
      const title = v_flex().id(`attention-${row.address}`).px(8).py(5).gap(3)
        .bg(tint(t.blocked)).border(1).border_color(selected ? t.blocked : t.border).rounded(4)
        .on_click(() => this.open(row))
        .child(h_flex().gap(7).items_center().child(shape("blocked", t, false))
          .child(div().w(11).flex_none().text_size(10).text_color(t.muted).child(hint))
          .child(programIcon(row.program, t))
          .child(div().flex_1().min_w(0).font_semibold().text_size(12).child(row.title || "Agent needs you"))
          .when(Boolean(elapsed), el => el.child(div().flex_none().text_size(10).text_color(t.muted).child(elapsed))))
        .child(div().text_size(10).text_color(t.muted).child(`${row.space_name} / #${row.tab_name} · ${row.address}${row.child ? " · child" : ""}`))
        .child(button(`reply-${row.address}`, "Reply / open approval in terminal", (_e, cx) => { cx.stop_propagation(); this.replyTo(row); }));
      return title;
    }
    return v_flex().id(`row-${row.address}`).h(32).flex_none().px(8).bg(selected ? t.selected : t.chrome)
      .text_color(row.status === "idle" ? t.muted : t.foreground)
      .hover(el => el.bg(t.hover)).on_click(() => this.open(row)).child(primary);
  }

  renderList(cx) {
    const t = theme();
    const live = rows();
    const updated = remember(this.history, live);
    // Persist at data changes, with a one-minute heartbeat to bound writes.
    const signature = JSON.stringify(live.map(a => [a.address, a.title, a.status, a.space, a.tab, a.created_ms]));
    if (signature !== this.lastSignature || Date.now() - (this.savedAt ?? 0) > 60000) {
      this.history = updated;
      this.saveHistory();
      this.lastSignature = signature;
      this.savedAt = Date.now();
    }
    const view = this.visible();
    setAgentOrder(view.ordered.map(a => a.address));
    const absent = this.history.filter(a => !live.some(row => row.address === a.address));
    const closed = absent.filter(a => a.closed);
    const unavailable = absent.filter(a => !a.closed);
    const section = (name, count) => h_flex().h(29).flex_none().px(10).gap(7).items_center()
      .text_color(name === "NEEDS YOU" ? t.blocked : t.muted).text_size(10).font_semibold()
      .child(name).child(div().text_color(t.dim).child(String(count)));
    const ranked = [];
    for (const status of BAND_ORDER) {
      const band = view.rest.filter(a => a.status === status);
      ranked.push(section(LABEL[status], band.length));
      let priorSpace = null;
      for (const a of band) {
        if ((ui().space ?? "all") === "all" && a.space !== priorSpace) {
          ranked.push(div().h(18).flex_none().px(10).text_size(10).text_color(t.dim).child(a.space_name));
          priorSpace = a.space;
        }
        ranked.push(this.row(a, view.ordered.indexOf(a)));
      }
    }
    return v_flex().id("queue-list-root").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().min_h(0).bg(t.chrome).text_color(t.foreground)
      .child(h_flex().h(32).flex_none().px(10).items_center().justify_between()
        .child(div().text_size(12).font_semibold().child("Your queue"))
        .child(button("list-focus", "Focus list", () => this.handle.focus())))
      .child(section("NEEDS YOU", view.blockers.length))
      .child(v_flex().id("queue-attention").max_h(290).min_h(34).flex_none().px(6).gap(5).overflow_y_scrollbar()
        .when(!view.blockers.length, el => el.child(div().p(8).text_size(11).text_color(t.muted).child("All clear. Nothing needs you.")))
        .children(view.blockers.map(a => this.row(a, view.ordered.indexOf(a), true))))
      .when(this.filterShown || Boolean(ui().query), el => el.child(Input.new(this.filter).h(32).px(8).border(1).border_color(t.input).bg(t.background)))
      .child(v_flex().id("queue-ranked").flex_1().min_h(0).overflow_y_scrollbar().children(ranked))
      .child(v_flex().flex_none().border_t(1).border_color(t.border)
        .child(button("closed-toggle", `${this.closedOpen ? "v" : ">"} Closed ${closed.length} · unavailable ${unavailable.length}`, (_e, cx) => { this.closedOpen = !this.closedOpen; cx.notify(); }))
        .when(this.closedOpen, el => el.child(v_flex().max_h(115).overflow_y_scrollbar()
          .children(closed.map(a => h_flex().px(10).h(29).gap(6).items_center()
            .child(shape("dead", t, false)).child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(stroke(a.title || a.address)))
            .child(div().text_size(10).text_color(t.dim).child(a.exit_code == null ? a.reason : `exit ${a.exit_code}`))))
          .children(unavailable.map(a => div().px(10).py(4).text_size(10).text_color(t.muted).child(`${a.title} · ${a.address} · unavailable`)))))
        .child(h_flex().px(4).items_center().gap(4)
          .child(button("check-exits", this.checking ? "Checking..." : "Check exits", (_e, cx) => this.checkHistory(cx)))
          .child(div().text_size(10).text_color(t.dim).child(this.checkError || "Confirmed exits only"))))
      .when(Boolean(this.message), el => el.child(div().px(10).py(5).text_size(10).text_color(t.muted).child(this.message)))
      .when(this.help, el => el.child(div().p(10).text_size(11).text_color(t.muted).child("List focus: j/k select, Enter open, n next blocker, x settle entire tab, s snooze 10m, 1-9 space, / filter, ? help. Letters shown beside rows jump directly. Blockers ignore every filter.")));
  }

  render(cx) {
    const t = theme();
    if (this.role === "reply") return this.renderReply();
    if (this.role === "bar") return this.renderBar(rows());
    if (this.role === "context") {
      const space = spaces().find(s => s.active);
      const tab = space?.tabs.find(t => t.active);
      return h_flex().size_full().items_center().gap(8).text_color(t.foreground)
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().child(`${space?.name ?? "No workspace"} / #${tab?.name ?? "No tab"}`))
        .child(button("context-settle", "Settle whole tab", () => { if (tab) run("tab.settle", { id: tab.id }); }));
    }
    if (this.role === "footer") return v_flex().size_full().justify_center().gap(4).text_size(10).text_color(t.muted)
      .child("LIST: j / k move · Enter open · n next blocker · x settle tab · s snooze · / filter · ? help")
      .child("ANYWHERE: Ctrl+Shift+G list · Ctrl+Shift+N next blocker. Click a row, then type in its terminal.");
    return this.renderList(cx);
  }
}

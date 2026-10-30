# Falling Code API audit

Audited 2026-10-29 against the herdr-app 0.1.7 checkout. Source references below are relative to that checkout.

## App API

Every `herdr` import in `main.js` is exported by `defaults/herdr.d.ts`:

| Calls | Contract |
| --- | --- |
| `agents()` | Native pane agents, address identity, space/tab names, status and program. Native unseen done is retained. |
| `terminals()` | Raw live core terminals, parent, report, status, program. Children supplement pane agents. Pane titles use agent title, reported title joined by address, program name, then address. Reported kind and message are optional. |
| `spaces()`, `panes()` | Sector/tab labels, real branch, active context, terminal headers via `props().pane`. |
| `machines()` | Machine layout readiness. A missing/unready machine cannot confirm an exit. |
| `window()?.active === true` | Live activity flag gates every native animation. A missing headless-check window is inactive. |
| `theme()` | All panel, state and text colors. |
| `props()` | Role dispatch and pane identity. |
| `shared()`, `setShared()` | Persistent `falling-code.still` toggle. |
| `setAgentOrder()` | Display order for native agent navigation. |
| `run()` | Commands listed below. |
| `hc()` | Read-only `ls --all --json`, inheriting the app session. No `exec` or session override in mod code. |

`hc ls --all --json` and `state: "finished"` are additionally confirmed by the herdr-core `docs/commands.md` (hc ls) and `schema/hc.openrpc.json` (terminal state). They provide the history fallback for terminals no longer listed live. `status_ms` is joined by address when reported and remains null when absent. This layout draws no elapsed-time badge or placeholder.

## Commands

`agent.focus {terminal}`, `terminal.peek {terminal}`, `space.select {id}`, `tab.select {id}`, `pane.focus {pane}` all appear in the guide's Commands section and the `run` documentation in `herdr.d.ts`. No answer, send, kill, close or structural mutation command is used by the package. Selection is guarded against stale history-only space/tab ids.

## Layout and theme

The guide's Layouts, The look and Pane frames sections confirm `id`, `type`, `children`, `size.weight`, `size.px`, `min`, `resizable`, solid `background`, `theme`, `preview`, `font`, `font_size`, `ui_font`, `terminal_padding`, root `terminal_opacity`, `content.mod`, `content.props`, `content.tab`, `pane.gap/radius/border/focus/header/lone`, header `content/height/position/reveal`. The native system title bar is retained. Theme JSON has only `background`, `foreground`, `selection`, `cursor`, 16 `ansi` colors and documented `colors` overrides. Mod manifest uses the shipped `place: "none"`, `title` pattern.

## Elements and lifecycle

The complete guide was read before implementation. `View`, `div`, `h_flex`, `v_flex`, `svg` and `image` use the guide and shipped `mods/pane/main.js`/`mods/agents/main.js` patterns. Chaining, dimensions, flex, padding, borders, truncation, scrolling, events and `on_size_change` follow the guide's UI section. Extra reflected GPUI styling (`flex_none`, `absolute`, `relative`, `opacity`, `line_height`, `font_family`, per-edge borders) follows the same shipped examples and `vendor/gpui-kit/crates/shell/src/style.rs`/`README.md`. The generated `gpui-kit.d.ts` is not checked into `defaults/`; its declaration generator is `vendor/gpui-kit/crates/shell/src/typings.rs`.

`tooltip(string)` follows shipped Win98/agents examples. `.frames(strings, 200)`, `.transition("opacity", {duration:600})`, `.transition("top", {duration:900,easing:"ease-in"})` and `.loop("opacity", {from:0.25,to:1,period:1800})` are documented native motion. The policy shape is confirmed by `typings.rs`, `TransitionPolicy`/`LoopPolicy`. There is no color, scale, rotation or timer animation.

`gpui-base` centers `h_flex` children across the row (`vendor/gpui-kit/crates/base/src/styled.rs`). The rain content row explicitly uses `items_stretch()` and its scrolling field column uses `h_full()`. Bands and columns have positive explicit pixel heights. `line_height("15px")` is supported by the definite-length parser in `style.rs`; `materialize.rs` retains precomputed text-frame strings and selects a frame natively. Every visible text size is at least 10px.

`init`, `render`, per-copy `localStorage`, `cx.spawn(async cx => ...)`, `cx.timer.every(ms, cx => ...)` and `cx.notify()` are documented in the guide's Mods section. Every callback uses its fresh context; no `cx` is saved. The only timer is 10000ms for missing-agent data. No network, audio, Node APIs or global side effects exist in the mod.

## Validation boundary

Unconfirmed app APIs, commands or layout keys: none. UI methods were checked against the guide, shipped patterns and reflected source. Offline fixtures cover an empty model, a null window, 60-character titles, reported titles without terminal titles, address joins, all three roles, sizing constraints and motion gating. They do not establish a passing native check, actual GPU geometry, typing focus or battery performance. These require direct runtime verification.

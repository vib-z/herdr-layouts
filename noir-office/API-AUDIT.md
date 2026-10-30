# Frozen API audit

Target: herdr-app 0.1.7, herdr-core 0.1.13. References below are relative to the herdr-app 0.1.7 checkout unless identified as core or gallery sources. This audit records static API evidence; it does not establish native rendering or keyboard focus.

| Used surface | Confirmation |
| --- | --- |
| View, init, render, cx.spawn, cx.notify, cx.timer.every | `defaults/AGENTS.md:733-805`, including callback-scoped cx. Only hallway registers a timer. |
| div, svg, image, h_flex, v_flex | Guide's mod example, UI section and `defaults/mods/pane/main.js:6-14`; gallery `pasture/mods/pasture/main.js:1-4`. |
| spaces, tabs and rollup fields | `defaults/herdr.d.ts:83-135`; guide model section. |
| agents and address/space/tab/title/status/pane fields | `defaults/herdr.d.ts:150-176`. No seq identity or inferred unseen child done. |
| panes, pane/terminal/title/status/focused | `defaults/herdr.d.ts:178-202`; header lookup follows shipped pane mod. |
| terminals, parent, report, state and creation fields | `defaults/herdr.d.ts:209-212` explicitly delegates raw records to core `hc ls --json`; guide model section documents parent. Raw report.msg/title and created_ms confirmed in `src/hc.rs` and core `crates/herdr-core/src/terminals.rs:14-76`. |
| theme and named palette | `defaults/herdr.d.ts:261-265`; guide look section. |
| props, shared, setShared, localStorage | `defaults/herdr.d.ts:373-387`; guide `895-896`; shipped agents mod persists JSON through localStorage. |
| window().active | `defaults/herdr.d.ts:238-247`. Used to suppress animation and inactive history polling. |
| setAgentOrder | `defaults/herdr.d.ts:204-207`. Callers first, then other live agents. |
| exec(command, args) | `defaults/herdr.d.ts:9-13`; guide exec example. Only program is a read-only hc history query, inheriting the app's environment. No shell, fetch or send. |
| agent.focus {terminal}, terminal.peek {terminal}, pane.focus {pane}, space.select {id}, tab.select {id} | `defaults/herdr.d.ts:39-77`; guide commands at `480-544`. All targets explicit. |
| layout id, type row/column/block, children, size px/weight, resizable, background image/fit, border, padding | Guide `206-258`, tree and node properties. |
| theme, font, font_size, ui_font, terminal_padding, terminal_opacity, preview | Guide `281-325` and root preview at `247-250`. |
| content.mod/props, content.tab active, pane gap/radius/background/border/focus/header/lone | Guide `208-211` and `327-350`, plus shipped `layouts/win98.json`. |
| theme background/foreground/selection/cursor/ansi/colors | Guide `302-309`; named colour list at `840-846`. |
| size_full, flex_1, gap, p, px, w, h, items_center, justify_between, truncate, text_size, text_color, bg, border, border_color, id, on_click, hover, when, children | Guide UI section `807-829`. |
| flex_none, relative, absolute, size, top, left, min_w, min_h, max_h, py, pt, pb, w_full, overflow_hidden, font_bold, font_semibold, line_height | Existing shipped/gallery builder patterns (pane, agents, help, mission, pasture and chat); line_height uses the explicit px string pattern in defaults/mods/win98/kit.js:79; native element style builders in `vendor/gpui-kit/crates/shell/src/typings.rs`. |
| overflow_y_scrollbar, overflow_x_scrollbar | Guide UI scrollbar, native declarations `vendor/gpui-kit/crates/shell/src/typings.rs:1755-1767`. |
| on_size_change, cx.stop_propagation | Guide `780-783`, `242`, and shipped pane button handlers. |
| svg.spin(3000), text.frames(...,115), loop opacity | Guide `796-805`; native declarations `typings.rs:1876-1894`. IDs stable; no animation timer, colour tween or transform. |

## Conservative calls

- No unconfirmed Herdr function, command or layout key is used. Basic style chains omitted from the abbreviated guide are checked against shipped patterns and native typings. Generated editor declarations are excluded from the distributable.
- `pattern_slash` is not documented as a div chain in the guide. An original slash SVG is used instead of guessing an invocation.
- Core `ls --all --json` follows the exit confirmation path. Core `crates/herdr-core/src/cli/output.rs:142-144` projects listing fields and omits created_ms. Finished listings confirm a full address without requiring that absent field; when a richer record provides a creation timestamp, mismatches stay unavailable.
- Core `crates/herdr-core/src/api/types.rs:277-296` confirms `ls` includes connected machines' full addresses. One query checks all missing agents. The process inherits the app environment, as `src/mods.rs:701-710` shows; no session is pinned in code.
- Agent title resolution uses agents().title, then report.title from the matching raw terminal, then program name, then full address. The layout draws no elapsed-time field, so missing status_ms never produces a placeholder.
- Runtime imports are gpui-kit, gpui-base, herdr and ./model.js only. Node APIs are confined to the offline checker outside the installed mod.

## Verification limits

The offline checker covers state semantics, actual CLI-shaped exit rows, title fallbacks, click targets, every empty role, 60-character titles, still mode and a fixed hallway height budget. It cannot establish native text measurement, keyboard focus retention or unseen completion in a real window. Native validation requires the target app and display. Working/idle transitions in a visible tab do not verify unseen done, and a missing terminal alone does not verify VACANT.

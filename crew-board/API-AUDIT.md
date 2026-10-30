# API audit

Source: the herdr-app 0.1.7 checkout and its sibling herdr-core checkout, checked 2026-10-29. Source references below use repository-relative paths.

| Used surface | Authority under that root |
| --- | --- |
| `hc`, result `code/stdout`, argument array | `herdr-app/defaults/herdr.d.ts:4-16` |
| `spaces`, space/tab identity, name, branch, active, settled | `herdr-app/defaults/herdr.d.ts:84-135` |
| `agents`, address/pane/space/tab/title/status/program | `herdr-app/defaults/herdr.d.ts:141-176` |
| `panes`, `props().pane`, terminal and status | `herdr-app/defaults/herdr.d.ts:178-202` |
| `setAgentOrder`, raw `terminals` and `report` | `herdr-app/defaults/herdr.d.ts:204-212` |
| `window().active/platform/buttons`, theme colors | `herdr-app/defaults/herdr.d.ts:237-265` |
| `openOverlay`, popup size/props; `closeOverlay` | `herdr-app/defaults/herdr.d.ts:326-362` |
| `props`, `shared`, `setShared` | `herdr-app/defaults/herdr.d.ts:376-387` |
| `agent.focus`, `terminal.peek`, `pane.focus`, `space.select`, `tab.select`, `layout.resize`, window controls | `herdr-app/defaults/AGENTS.md:491-542`; `herdr.d.ts:43-77` |
| root column, body row, block/content, size/weight/min, gap/resizable, background image, padding, titlebar/traffic_lights/preview | `herdr-app/defaults/AGENTS.md:211-256` |
| theme/font/font_size/ui_font/terminal_padding/terminal_opacity | `herdr-app/defaults/AGENTS.md:276-316` |
| single tab block, pane gap/radius/background/lone/border/focus and header height/position/reveal | `herdr-app/defaults/AGENTS.md:318-340` |
| theme JSON, ANSI colors and colors overrides | `herdr-app/defaults/AGENTS.md:296-303` |
| `mod.json` place none | `herdr-app/defaults/AGENTS.md:690-702` |
| View lifecycle, cx.timer.every, cx.spawn, notify, on_size_change | `herdr-app/defaults/AGENTS.md:738-798` |
| div/h_flex/v_flex, chained sizing/style, events, child/children/when | `herdr-app/defaults/AGENTS.md:800-824`; gallery `board/mods/board/main.js` |
| `image`, `svg`, program tint; `frames`, `loop`, `transition` | `herdr-app/defaults/AGENTS.md:710-713,786-797`; `herdr.d.ts:137-153`; gallery `pasture/mods/pasture/main.js` |
| `localStorage.getItem/setItem` | `herdr-app/defaults/AGENTS.md:894-897`; shipped `defaults/mods/agents/main.js:76-100` |

## Element documentation supplied by the official generator

The guide (`AGENTS.md:41-46,821-824`) names `gpui-kit.d.ts` as element authority. The source checkout contains the generator rather than the emitted file. These calls are confirmed there, although they are not spelled out in `AGENTS.md` or `herdr.d.ts`:

- `PathBuilder.stroke/move_to/line_to/build` and global `window.paint_path`: `herdr-app/vendor/gpui-kit/crates/shell/src/typings.rs:2164-2180,2280-2291`. Shipped `defaults/mods/win98/kit.js:190-199` uses the same paint constructor.
- `spring` on left/top: `typings.rs:1874-1887,2039-2066`. `tooltip`: `typings.rs:1604-1621`. Scroll event pixel delta: `typings.rs:1197-1207`.
- GPUI sizing/style methods such as `min_w`, `max_w`, `flex_none`, `absolute`, `opacity`, `font_semibold`, padding and border variants come from the same native style tables used by this generator (`style.rs`, including `min_w` at 91, opacity at 162 and font_semibold at 230). The gallery uses the same style vocabulary.

## Core-record confirmation

Exit confirmation uses `hc ls --all --json`. The guide documents the general `hc ls --json` API but leaves the all-record schema to core:

- `herdr-core/crates/herdr-core/src/cli.rs:418-431`, `cli/output.rs:142-155`: `{terminals: [...]}` and short rows with full address, state, exit_code and reason. The short rows omit status_ms; displayed ages instead join raw live `terminals().status_ms`.
- `herdr-core/crates/herdr-core/src/terminals.rs:35-49`, `herdr-app/src/hc.rs:55-59`: terminal state is live or finished; app lists live terminals only. Code requires the explicit finished state, including successful exit code zero.
- `herdr-core/crates/herdr-core/src/api/types.rs:288-297`, `remote.rs:1056-1090`: full remote addresses and parent mapping. The mod joins complete addresses, never seq or a stripped terminal number.
- `hc(["ls", "--all", "--json"])` is documented in `herdr.d.ts:15-16`. In `herdr-app/src/mods.rs:851` it calls `exec_future("hc", args, None, None)`; local execution reaches `run_blocking` at 701-710, through 811-822, without clearing or overriding the app environment. `src/spawn.rs:7-16` uses ordinary process spawning. `src/main.rs:119-124` and `src/core_bin.rs:37-49` select the configured core and prepend its directory to PATH. Thus the helper inherits the app's environment and uses its configured core; no session name is embedded in the package.

No unresolved data API or command names. `line_height(13)` for readable compact captions is also declared in the generated gpui-kit.d.ts (line 1362). Offline fixtures cover empty and long-title roles, report-title fallback, missing timestamps, compact sheet fit and string collision avoidance. They do not replace a native rendering and focus check.

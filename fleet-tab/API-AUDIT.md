# Fleet Tab API audit

Target: Herdr app 0.1.7. Source inspection, not a native load result.

| Surface used | Confirmation |
| --- | --- |
| `agents`, `terminals`, `spaces`, `panes`, `focused`, `theme`, `window`, `props` | `defaults/herdr.d.ts`, exported functions and AgentInfo, SpaceInfo, TabInfo, PaneInfo and Program |
| `shared`, `setShared`, `setAgentOrder` | `defaults/herdr.d.ts`, persisted shared values and navigation order |
| `hc(["ls", "--all", "--json"])` | `defaults/herdr.d.ts` documents `hc(args)`; the bounded exit-confirmation pattern is described in the layout rules and Control Panel implementation |
| `run`: `agent.focus`, `terminal.peek`, `pane.focus`, `space.select`, `tab.select`, `layout.resize {id, px}` | `defaults/herdr.d.ts`, command arguments in the `run` documentation |
| `run`: `app.palette`, `window.minimize`, `window.maximize`, `window.close` | `defaults/AGENTS.md`, Commands |
| `openOverlay`, `closeOverlay`, popup dimensions and props | `defaults/herdr.d.ts`, OverlaySpec and overlay functions |
| `localStorage.getItem`, `localStorage.setItem` | `defaults/AGENTS.md`, Mods: per-copy storage |
| `View`, `init`, `render`, `close`, `cx.timer.every`, `cx.spawn`, `cx.notify`, event `cx.stop_propagation` | `defaults/AGENTS.md`, A mod and UI |
| `div`, `h_flex`, `v_flex`, builder sizing, flex (including content-hugging `flex_shrink_1()`), fonts, colors, borders, children, mouse handlers, truncation, tooltip, scrolling, `on_size_change`, explicit pixel `line_height`, `text_right` | `defaults/AGENTS.md`, UI; full method signatures in the bundled `defaults/mods/changes/gpui-kit.d.ts` |
| `svg(path).size(16)`, `.frames(list, ms)` | `defaults/herdr.d.ts`, Program; `defaults/AGENTS.md`, native animation; bundled `gpui-kit.d.ts` |
| `InputState.new`, `.on("change")`, `.value()`, `Input.new` | `defaults/AGENTS.md`, UI; `defaults/mods/prompt/main.js`; bundled `gpui-kit.d.ts`, InputState |
| Layout root look, window drag, traffic lights, fixed blocks, active tab, pane frame/header/focus | `defaults/AGENTS.md`, Layouts and Pane frames |
| Theme colors and 16 ANSI entries | `defaults/AGENTS.md`, The look; `defaults/herdr.d.ts`, theme |

`terminals()` exposes raw reports. The core's `src/status.rs` confirms report `title`, `msg` and numeric `progress` (0 to 100). A model chip accepts only an explicit `model: name` or `model=name` marker inside `report.title` or `report.msg`; there is no assumed `report.model` field. Native `agents().status` owns unseen done. Raw child `error` is blocked; raw child `done` is shown as finished under idle.

The program call inherits the app environment. The mod does not set a core session, read terminal output, read external files, access a network, play sound, or answer prompts. Exact machine-qualified addresses identify rows and exit confirmations. The clock uses Date.now and per-copy persisted observation state because app 0.1.7 does not refresh native status_ms reliably.

Unconfirmed APIs: none. Node tests exercise a documented API double, so native layout geometry, input routing and keyboard focus still require an installed-app check.

The no-argument shrinking helper in 0.1.7 is `flex_shrink_1()` (bundled typings). `flex_shrink(value)` is the parameterized form, so an empty call is not used. Chips have no flex-grow style.

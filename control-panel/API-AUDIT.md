# API audit, Herdr app 0.1.7

Audited against `defaults/AGENTS.md` and `defaults/herdr.d.ts` in the herdr-app 0.1.7 checkout.

The entire `AGENTS.md` guide was read. This is an offline source audit, not evidence of native loading or execution.

| Surface used | Confirmation |
| --- | --- |
| `hc(args)` and `{code, stdout, stderr}` | `herdr.d.ts` lines 4 to 18; terminal read syntax also in `AGENTS.md`, herdr-core section. |
| `run` and agent/pane/space/tab/window/palette commands | `AGENTS.md`, Commands; `herdr.d.ts` command documentation and `run` declaration. |
| `spaces`, `agents`, `panes`, `terminals` | `herdr.d.ts` interfaces and declarations; `AGENTS.md`, model and live-data sections. |
| Agent `title`, address, space/tab and native done | `herdr.d.ts`, AgentInfo: title is the terminal's title, seen done becomes idle. |
| Raw `status_ms`, `parent`, labels and finished exit records | `terminals()` exposes core records. In 0.1.7, `src/hc.rs:132` updates status but does not refresh `status_ms`. A persisted per-address observed clock therefore supplies elapsed time when the core value is null or stale. Live reply validation remains pending. |
| Initial clock fallback, `changed_at` and `working_since` | `herdr.d.ts` lines 103 to 106. `src/model.rs` computes tab-level timestamps; these are approximate initial seeds, never replacements for an existing per-agent clock. |
| `setAgentOrder`, `theme`, `window`, `layout` | Named declarations in `herdr.d.ts`; guide describes rerender and focus semantics. |
| `props`, `shared`, `setShared`, `openOverlay`, `closeOverlay` | Named declarations in `herdr.d.ts`; `props().role` and pane headers are documented gallery patterns. |
| Per-copy `localStorage` | `AGENTS.md`, built-ins paragraph. Stores bounded identity and state-clock metadata only. |
| `View.init`, `render`, `close`, `cx.timer.every`, `cx.spawn`, `cx.notify`, `cx.stop_propagation` | `AGENTS.md`, mod example, lifecycle rules, controls and window-drag examples. No saved context object. |
| `div`, `h_flex`, `v_flex`, normal layout/text builders, `.frames`, `.on_scroll_wheel`, `.on_size_change` | `AGENTS.md`, UI and native animation sections; bundled generated `gpui-kit.d.ts` for exact builder signatures. |

The UI declarations are the generated `gpui-kit.d.ts` for herdr-app 0.1.7. The source defaults folder does not contain a standalone copy. In addition to the guide's abbreviated builder list, this file confirms `font_family`, `text_right`, `flex_none`, `overflow_hidden` and the other fluent style methods.

To repeat the optional declaration checks, set `HERDR_API_DEFAULTS` to the checkout's `defaults` directory and `HERDR_GPUI_TYPES` to the generated `gpui-kit.d.ts` file. With those supplied, the offline view harness rejects any called builder absent from the UI declarations and checks every Herdr import against `herdr.d.ts`. Without them, those two checks are explicitly skipped; the model, rendering-behavior and installer tests still run. Explicit but invalid source paths fail the test run.

Layout schema: `AGENTS.md`, Layouts, The look, and Pane frames. Custom `mod.json` uses documented `place: none`. Exactly one active-tab split tree is present; there are no virtual lists, extra live terminal surfaces, images in runtime panels, custom sound calls or network calls.

Cell-motion API: existing `dist/terminal/index.js` and source `src/terminal/index.ts` expose `tui.cometCell`, `tui.breathe` and `tui.bake`. `src/core/index.ts` provides their pure generators. `src/components/loaders.tsx` exposes Check only as React/SVG. Its resting glyph adaptation is disclosed, not treated as an available terminal API.

Font grid was independently read from the bundled `assets/fonts/JetBrainsMono-Variable.ttf`: unitsPerEm 1000, nonzero advances 600. `40/3` px makes the character advance 8 px. This is metric evidence, not a native screenshot.

Unconfirmed Herdr APIs used: **none**. Native loading, pixel rendering, scroll event direction on hardware, session inheritance in a launched app, remote replies and typing-focus retention are **not live verified**. Source declarations and fake-API tests are the evidence for this build pass.

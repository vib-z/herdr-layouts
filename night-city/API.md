# Night City API audit

Authority: the herdr-app 0.1.7 checkout and its bundled native UI definitions. App references are relative to that checkout; core references are relative to the herdr-core 0.1.13 checkout.

## App calls and commands

| Used surface | Confirmation |
| --- | --- |
| `exec(command, args)`, result `code/stdout` | `defaults/herdr.d.ts:4` to `13` |
| `agents`, `spaces`, `panes`, `terminals` and their fields | `defaults/herdr.d.ts:79` to `212` |
| `focused().terminal`, `window().active/platform/buttons` | `defaults/herdr.d.ts:214` to `247` |
| `theme` color names | `defaults/herdr.d.ts:260` to `265` |
| `props`, `shared`, `setShared` | `defaults/herdr.d.ts:376` to `387` |
| `setAgentOrder`, keyed by address | `defaults/herdr.d.ts:204` to `207` |
| `run`, focus/peek and space/tab selection commands | `defaults/herdr.d.ts:43` to `77` |
| Window minimize/maximize/close | `defaults/AGENTS.md:547` |
| View lifecycle, context spawning, data timer, notification and mod storage | `defaults/AGENTS.md:733` to `805`, `895` |

The guide describes raw records as what `hc ls --json` returns; `terminals()` is intentionally `any[]`. Core `crates/herdr-core/src/terminals.rs:35` to `80` confirms `status_ms`, `parent`, `finished_ms` and `state`; `api/types.rs:288` confirms the list envelope. Child normalization/traversal follows shipped `defaults/mods/agents/main.js:45` to `51`, `162` to `171`. Native unseen completion is never inferred from a raw child's finish.

Task names follow `agents().title || raw.report.title || program.name || address`, joining raw records by exact address. The same resolved title reaches windows, attention, street, pane headers and remembered exits. Children use the same preference order. No elapsed time is drawn, whether or not `status_ms` exists.

Exit confirmation uses `exec("hc", ["ls", "--all", "--json"])`. Environment inheritance is confirmed at `src/mods.rs:701` and `src/spawn.rs:7` to `17`. The launch environment chooses the app's core session; the mod never pins a session name.

## Layout and native elements

- Root/node keys and gradients: `defaults/AGENTS.md:210` to `259`. Root appearance and color-only themes: `281` to `325`. Pane frames and header props: `327` to `350`. The three-role composition follows the gallery Pasture pattern.
- Native elements: only `div`, `h_flex`, `v_flex`, `image`, `svg`; guide `733` to `765`, `807` to `829`.
- Fluent methods: `id/child/children/when`; `relative/absolute/left/right/top/bottom`; `size/size_full/w/h/min_h/min_w`; `flex/flex_1/flex_none/items_center/items_end/justify_center/justify_between`; `gap/p/px/py/pl/pr/pt/pb/mx/mb`; `bg/border/border_b/border_l/border_color/rounded/opacity`; `overflow_hidden/overflow_x_scrollbar/overflow_y_scrollbar`; `text_size/text_color/font_semibold/truncate`; `tooltip/hover/on_click/on_mouse_down/on_size_change`; `frames/loop/transition`.
- Extra method spellings appear in shipped examples and `vendor/gpui-kit/crates/shell/src/typings.rs:1399,1621,1765,1874` to `1890`; parameter styles in sibling `style.rs:85` to `211`. Generated typing helpers are not distributed.
- The skyline measures its own band, reserving 40px for the count strip, 24px vertically and 48px horizontally. Its shared scale is the smaller fit ratio for complete tower height (body plus 54px of roof) and total street width, clamped to 1 to 2.5. Floor/window/sign/icon/attic/river geometry follows that scale. Dense scenes scroll at 1x.
- Motion uses opacity loops, height transition and text frames only, gated by still mode and active window. Text sizes are at least 10px. There is no custom sound API.

## Verification boundary

Unconfirmed app APIs, commands or layout keys: none. Native module resolution, rendering, focus, scrolling, font metrics, theme loading and app errors require runtime inspection beyond Node syntax checks.

`verify.mjs` covers native state mapping, raw children and title fallback, exact-address joins, confirmed exits and failures, bounded history, shell/mod panes, dense geometry, both target widths, scale bounds, centred horizon, left attention placement, all role constructions, dispatch, still/inactive mode, null focus, long titles, minimum text size, missing timestamp behavior and portable package content. Its element recorder validates construction and handler intent; it does not render pixels or establish native keyboard focus.

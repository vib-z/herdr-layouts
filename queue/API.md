# Queue API ledger

Checked 2026-10-29 against the herdr-app 0.1.7 checkout and the herdr-core 0.1.13 checkout. `defaults/` refers to the app checkout; core source references name the core project.

| Surface | Authority | Use |
| --- | --- | --- |
| Layout nodes, weights, min, paint, theme, fonts and preview | `herdr-app/defaults/AGENTS.md`, Layouts and The look | Column, row, block, 3:7 sizing, Paper/Graphite, Geist and bundled terminal font |
| Active tab and bare pane frame | `defaults/AGENTS.md`, Pane frames | `tab: active`, gap, radius, border, focus and lone, no header |
| Namespaced mod and role props | `defaults/AGENTS.md`, Mods and Layouts other people made; gallery `board` example | One mod.json with place none, roles in props |
| agents, spaces and terminals | `defaults/herdr.d.ts`, AgentInfo, SpaceInfo, TabInfo and terminals | Stable addresses, native unseen done, settled tabs, raw parent/status_ms/program |
| Raw status normalization and child peek | `defaults/AGENTS.md`, The model; shipped `mods/agents/main.js`, kidStatus/tree | error to blocked, child done to idle, recursive parent collection |
| focused, props, theme, window | `defaults/herdr.d.ts`, respective exported functions | Actual terminal focus, roles, theme tokens, window.active |
| shared, setShared, nextCommand and setAgentOrder | `defaults/herdr.d.ts`, respective exported functions | Namespaced shared UI, one list command receiver and urgency order |
| run and command arguments | `defaults/AGENTS.md`, Commands | agent.focus {terminal}, terminal.peek {terminal}, space.select {id}, tab.settle {id}; namespaced queue commands |
| key section and routing | `defaults/AGENTS.md`, Keys | layout:queue, ctrl-shift chords, queue.command delivery; plain keys only on tracked focus |
| View, flex, div, svg, image, InputState and Input | `defaults/AGENTS.md`, A mod and UI; shipped prompt and board mods | Init state, click/key handlers, focus handle, chained styling and icon tint |
| Ranked list scrolling | `defaults/AGENTS.md`, UI | Plain v_flex column with overflow_y_scrollbar, at most 64 ranked agents, direct row click handlers |
| Remaining builder style methods | Same bundled gpui-kit typings; shipped board and prompt | flex_none, min/max, padding, truncate, borders, relative/absolute, scrollbars, conditional children |
| Timers, storage and lifecycle | `defaults/AGENTS.md`, A mod and Rules | cx.timer, cx.spawn, callback-local cx, localStorage; bounded history, no saved cx |
| SVG spin | `defaults/AGENTS.md`, Animate natively | Working ring only, still switch, inactive window disables animation and data polling |
| openOverlay and closeOverlay | `defaults/herdr.d.ts`, OverlaySpec | Explicit reply dialog; no focus stolen before click |
| exec | `defaults/herdr.d.ts`, ExecResult and exec; `src/mods.rs`, run_blocking | hc process inherits the app environment; array arguments, code/stdout checked, no shell interpolation |
| Core ls and send | `defaults/AGENTS.md`, herdr-core; research-mods.md exit fallback | Inherit the app's session; ls --all confirms exits; send only on submit |
| Core compact ls output | `herdr-core/crates/herdr-core/src/cli.rs`, Cmd::Ls; `cli/output.rs`, short | Parse terminals array, finished and exit_code; compact rows omit created_ms |

No unconfirmed Herdr API or app command. Node checks JavaScript syntax and render/data logic; the gpui host and layout schema require a native app check and live verification. No custom sound API is called, so native Herdr handles sounds.enabled without doubling its own alert.

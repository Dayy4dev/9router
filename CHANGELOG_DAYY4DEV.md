# v0.5.421 (2026-11-13) · 2 commits

## Features & Improvements

- **Proxy Pool Auto Check**:
  - Added an Auto Check bar on `/dashboard/proxy-pools` with a toggle, interval presets (5/10/15/30/60 minutes), an **Active only** switch, a **Run Now** button, and the last sweep summary (alive / dead / disabled).
  - Server-side scheduler (`src/shared/services/proxyPoolAutoCheck.js`) chains its next tick only after a sweep settles, probes with bounded concurrency (`CONCURRENCY = 4`) and a 6s timeout, and skips inactive pools by default. It is off unless enabled and the module loads on demand.
  - A pool is disabled only after two consecutive failed sweeps (`failCount`), so a network blip does not take a healthy proxy out of rotation; any success resets the counter.
  - New `GET/POST /api/proxy-pools/auto-check` route exposes status, configuration, and manual triggering. Settings live in `settingsRepo` (`proxyAutoCheckEnabled`, `proxyAutoCheckIntervalMinutes`, `proxyAutoCheckActiveOnly`).

## What Got Fixed?

- **Proxy pools page crashed with `ReferenceError: Select is not defined`**: the interval selector was added without importing `Select` from the shared components. A guard test now fails when a JSX component tag used on that page is not imported.
- **Proxy probes could hang a sweep**: `testProxyUrl` awaited `dispatcher.close()`, which waits for in-flight sockets and can block forever on a half-open tunnel (same failure the harvester hit in v0.5.416). The dispatcher is now destroyed immediately, and each auto-check probe is wrapped in a hard timeout so one wedged socket cannot stall the cycle.
- **Stale auto-check status in the UI**: the scheduler used to clear `running` before publishing `lastRunAt`, so a poll could see `running=false` with an old result and the page waited a full slow interval. The result is now published first, and the page does one short follow-up fetch when a sweep finishes.

# v0.5.420 (2026-11-12) · 2 commits

## Features & Improvements

- **ZCode & GLM Coding Plan Feature Parity (Ported from xrouter)**:
  - **Start Plan Handshake Activation**: Added 4-step handshake activation (`zcode-v3-start-plan-0817` providing 8M free tier tokens: 3M GLM-5.3 + 5M GLM-5.3-Flash) via `open-sse/services/usage/glm.js` and dedicated one-click UI button.
  - **1-Click Auto Claim with Aliyun Traceless Captcha**: Integrated Aliyun Web SDK Traceless Captcha engine (`SceneId: "11xygtvd"`, `prefix: "no8xfe"`) into the ZCode Web Bridge (`/api/usage/[connectionId]/zcode-bridge`), allowing browser-based 1-click bonus/gift claim without manual slider interaction.
  - **Event Gift Card & Quota Disambiguation**: Enhanced GLM and ZCode usage balances to accurately display promotional token grants (e.g. 500M Weekend Build / 300M Global Build) alongside daily Start Plan quotas without dictionary key collision or quota suppression.
  - **GLM Rate Limit Reset Cards**: Added full support for querying and redeeming GLM rate limit reset cards (`FIVE_HOUR` and `WEEK`) with localStorage recovery state (`9router:resetCardPending:`) and interactive redemption modal.
  - **Unified ZCodeExecutor Routing**: Routed `glm` and `glm-cn` through `ZCodeExecutor` with automatic fallback to standard OpenAI-compatible transport for plain API key accounts without ZCode session tokens.
  - **New Endpoints**: Added `/api/usage/[connectionId]/glm-claim` (preview, claim, and multi-connection sync) and `/api/usage/[connectionId]/glm-reset-cards`, while upgrading `/api/providers/glm/bonus` to scan the full ZCode family.

# v0.5.415 (2026-11-11) · 5 commits

## Features & Improvements

- **Configurable API Key Prefix**:
  - Key Prefix input integrated into the **Create API Key** modal with sk- placeholder fallback and automatic hyphen appending.
- **Pure Frosted Glass Backdrop for Modals**:
  - Restored clear frosted acrylic blur across modals without opaque black background tinting.
- **DeepAI Free Tier Badges**:
  - Added official green **FREE** badge and tier detection across all DeepAI models.
- **OpenCode CLI Mode Singleton Daemon**:
  - Persistent singleton daemon (`opencode serve`) running in temporary workspace with session caching, reducing latency to ~1.5s with zero 429 blocks and hidden background processes.
- **Packaging & Wreq-JS Native Bindings**:
  - Standalone bundle includes native prebuilt bindings (`@wreq-js/binding-win32-x64-msvc`) for error-free OpenCode TLS connections.

# v0.5.407 (2026-11-11) · 5 commits

## Features & Improvements

- **Sky Blue Tab Favicon & Cyan Default Theme**:
  - Replaced the default orange browser tab favicon (`public/favicon.svg`) with a clean sky blue gradient (`#38bdf8` → `#0284c7`).
  - Set the default base theme color to Cyan (`#06B6D4` / `rgb(6, 182, 212)`) across color scale, aurora glow, selection highlights, and preset fallbacks for fresh installations.
- **Sidebar & Footer Typography Branding ("9Router Proxy xd")**:
  - Updated sidebar navigation heading to display "9Router Proxy xd", styling "xd" with monospace Consolas font (`font-family: Consolas, monospace`).
  - Synchronized footer brand display with matching typography.
- **Quick Category & Provider Filter Strip in Model Selector**:
  - Integrated horizontal filter pills directly below the search bar in `ModelSelectModal` (matching xrouter).
  - Enables instant single-click filtering across `All`, `Combos`, `Custom`, or specific providers with brand icons and live model counts.
  - Aligned batch selection actions (Select All / Deselect All) to operate on the active category filter.
- **Opaque Backdrop for Model Group Sticky Headers**:
  - Fixed background transparency issue where scrolling model cards overlapped and collided with sticky provider headers in `ModelSelectModal`.
  - Added dedicated `.model-group-header` styling with solid dark background (`rgba(14, 18, 27, 0.98)`), acrylic blur (`backdrop-filter: blur(20px)`), and subtle bottom divider to ensure 100% text clarity during scroll.
- **Update Notification Command Standardization**:
  - Changed update command on update notifications and `UPDATER_CONFIG` to `npm install -g 9router-xd@latest`.

# v0.5.401 (2026-11-10) · 3 commits

## Features & Improvements

- **Theme Mode Persistence (Dark & Glass Mode Persistence Fix)**:
  - Fixed an issue where selecting solid `dark` mode was reverted back to `glass` upon page reload due to hardcoded theme fallback in `settingsRepo.js` (`mergeWithDefaults`).
  - Added full bidirectional synchronization in SQLite settings repo, `localStorage` (`themeMode` and `theme`), and inline layout bootstrap scripts so the chosen mode stays strictly intact across restarts and refreshes.

- **Elevated Glass Overlays & High-Contrast Readability (Modals, Dropdowns, Menus)**:
  - Resolved low-contrast bleed-through where background controls (e.g. time range filters, dashboard cards, topology images) showed through floating dialogs and dropdown menus in `glass` mode.
  - Applied deep-frosted glass backgrounds (`linear-gradient(145deg, rgba(18, 22, 32, 0.90), rgba(10, 14, 22, 0.96))`), heavy acrylic blur (`backdrop-filter: blur(28px) saturate(190%)`), and primary specular highlight borders to all `[role="dialog"]`, `[aria-modal="true"]`, `BellMenu`, and `HeaderMenu` containers.
  - Boosted contrast of primary text (`#f8fafc`), muted metadata (`#94a3b8`), and destructive menu action buttons (`#f87171` text with subtle red ambient tint on hover).
  - Enhanced modal scrim darkening (`--color-scrim: rgba(5, 8, 14, 0.65)`) to eliminate background visual noise during modal focus.

- **Non-Blocking Notification Bell & Background Page Scrolling**:
  - Replaced the full-screen transparent blocking overlay (`fixed inset-0 z-40`) in `BellMenu` with an outside `pointerdown` listener.
  - Allows simultaneous fluid mouse-wheel and touch scrolling of the underlying page and the notification list itself while the notification menu remains open and follows its header trigger.

- **Harmonized Non-Flat Color System (Primary, Secondary, Semantic & Glass Aurora)**:
  - Extended dynamic theme styling beyond flat monochromes to provide rich visual depth, elevation layering, and cohesive color theory across the entire dashboard.
  - Dynamically computes energetic complementary/analogous secondary color (`--color-secondary`, `--color-secondary-hover`, `--color-secondary-rgb`) via HSL hue rotation (`+38°`) in `themeStore.js` whenever the theme accent color is changed.
  - Introduced multi-tier semantic status tokens (success, warning, danger, info) with soft translucent backgrounds (`*-bg`), high-contrast foregrounds (`*-fg`), and crisp borders (`*-border`) to avoid flat utility hacks.
  - Overhauled web background for `.dark.glass` into a multi-layered aurora mesh combining dynamic primary blooms, harmonic secondary flares, and ambient mood lights with obsidian charcoal depth.
  - Updated ReactFlow topology nodes (`ProviderNode`, `RouterNode`) with semi-transparent frosted glass cards (`bg-surface/50 backdrop-blur-md`), ambient primary glow on active state, and inner top-hairline highlight.
  - Harmonized data charts (`UsageChart`, `TopModelsChart`, `ProviderBarChart`) to consume dynamic theme primary, secondary, and semantic tokens with sleek non-flat linear gradients and glowing progress indicators.

- **Custom Topology Map Backdrop & Dim Intensity Control**:
  - Added custom backdrop support for the provider topology map in `ThemeModal` (`TopologyBackdropPicker`).
  - Supports image uploads up to 8MB with iterative client-side `<canvas>` compression ladder (downscaling to ≤ 1600px edge, quality reduction to 0.5, WebP with JPEG fallback) capped strictly at `< 600 KB` (`MAX_TOPO_CHARS`) to remain lightweight in memory, SQLite, and network transfers.
  - Supports direct public image URLs with CSS injection validation (`isTopologyBg`).
  - Added Dim Backdrop Intensity slider (`0%` - `100%`) with tonality icon for dimming the backdrop behind nodes.
  - Isolated background rendering into dedicated non-interactive layers behind ReactFlow (`z-0`) to avoid graph re-renders and aspect ratio stretching (`bg-cover bg-center`).
  - Instant zero-latency display via `localStorage` mirroring and global persistence across devices in SQLite server settings (`settings.topologyBg`, `settings.topologyBgDim`) via `/api/theme`.

# v0.5.346 (2026-10-31) · 9 commits

## Features & Improvements

- **Custom Theme Accent Color (Free Theme Color Customization)**:
  - Introduced arbitrary theme accent color customization via interactive native color picker and custom hex code input in `ThemeModal`.
  - Added curated palette presets (Coral, Blue, Emerald, Purple, Rose, Amber, Cyan, Indigo) with one-click reset to default 9Router coral.
  - Dynamically recalculates primary, hover, brand scale, aurora glow, focus ring, and text selection highlight tokens across both dark and glass backgrounds with instant live preview.
  - Persisted globally in server settings (`settings.themeColor`) via `/api/theme` and synced across sessions, with pre-paint bootstrap script preventing theme color flicker.
- **Restoration of AI Anti Slop Plugin**:
  - Restored full standalone Anti Slop natural AI plugin across runtime, dashboard, and API endpoints (`/api/plugins`, `/api/models`).
  - Added level selector in the Plugins dashboard supporting `lite`, `full`, and `ultra` intensities with real-time prompt rule injection and token estimation.
  - Re-registered `antiSlop` capacity mark in `CAPACITY_META` and `PLUGIN_MARK_META` for model capability badges.
- **Upstream Master Synchronization & Merge (v0.5.306 – v0.5.345)**:
  - **OpenCode Free Single Card & Dual Lane**: Consolidated direct and CLI lanes into one OpenCode Free provider card with a live hammer toggle (`Direct TLS` vs `With CLI`), TLS client routing, egress tunnel, and residential fallback.
  - **Gemini Web Cookie Session Restoration**: Reverse-engineered `gemini-web` provider supporting separated `__Secure-1PSID` and `__Secure-1PSIDTS` inputs, session auto-validation, proxy-aware requests, and terminal frame stream completion.
  - **Tool Calling Bridge Plugin**: Flattened client tools for text-only upstreams into prompt definitions and reconstructed standardized tool calls from model output.
  - **Local Ollama Extensions**: Built-in TTS engine supporting Phonon voices and normalized `/v1/embeddings` embedding adapter.
  - **Model Studio Bulk Edit & Duplication**: Batch update input/output token multipliers and context windows, with clone/duplicate buttons for custom models.
  - **Usage Command Center**: Mobile-responsive hourly heatmap, scaled daily token savings, and memoized metrics caching.
  - **Global Error Masking**: Comprehensive `Hide Raw Errors` coverage across all streaming SSE frames and non-JSON upstream errors.
  - **UI Design System Standardization**: Replaced all OS emoji with design tokens, Material Symbols, and `LocaleBadge` chips.
  - **Preserved Dayy4dev Custom Features**: Zero-config auto-routing dynamic scoring engine with session stickiness, background PRD Builder with notification bell tracking, model test store with latency badges, and collapsible sidebar toggle.

## Fixes

- **Custom Plugins 3-Column Responsive Grid**:
  - Expanded Custom Plugins card grid (`/dashboard/plugins`) from a constrained 2-column layout to a 3-column layout on large screens (`lg:grid-cols-3`).
  - Removed restrictive `max-w-4xl` container boundary so cards seamlessly occupy full dashboard width while maintaining 1-column on mobile and 2-column on tablet viewports.
  - Hardened card element responsiveness with `min-w-0` on headers, `shrink-0` on toggles, `flex-wrap` on model selection controls, and responsive truncation on model badges.
- **Theme-Aware Text Selection Highlight**:
  - Connected `::selection` background and text foreground across light and dark modes to `var(--color-primary-rgb)` and `var(--color-brand-200)` so highlighted text dynamically honors the chosen theme accent color instead of staying hardcoded coral.
- **Provider Topology Live Edge Colors**:
  - Connected `ProviderTopology` last-routed edge stroke and active electric particle beam (outer halo, plasma flow, energy orbs, and sparks) to `var(--color-primary)` so active streaming transfers dynamically honor custom theme accent colors while preserving intense white hot-core energy aesthetics.
  - Synced active router core pulse glow, badge color, and keyframes with `var(--color-primary)`.
  - Replaced static favicon on the central 9Router node with a theme-reactive SVG icon gradient using `--color-primary`.
  - Harmonized active provider target nodes with theme primary border glow, subtle background tint, and crisp white typography for clean visual circuit continuity.
- **API Keys Responsive Layout on Mobile & Small Screens**:
  - Cleaned up duplicate badge elements and uncontained creation date leftover from upstream merge conflict that caused element overlaps and wrapped rows on mobile.
  - Standardized usage and limit monitoring via `LimitBadge` with automatic quota exhaustion alerts and expiry countdown.
  - Restructured the actions toolbar to stretch full-width with a dedicated active state indicator on compact viewports.

# v0.5.305 (2026-10-25) · 2 commits

## Features & Improvements

- **Fix Active All Model Behavior**:
  - Resolved non-functioning "Active All" button on provider detail page: enabling all models now re-activates disabled models and imports all available catalog/suggested models into the active list simultaneously.
  - Added bulk import support (`{ models: [...] }`) to `/api/models/custom` POST endpoint to activate entire provider model catalogs in a single fast round-trip.
  - Separated disabled models from active models in the display grid so disabled states are clearly visible and restorable under the "Disabled models" section.
- **Upstream Master Synchronization & Merge**:
  - Merged upstream `master` (v0.5.305) into `dev` branch with all 7 merge conflicts resolved cleanly.
  - Retained Dayy4dev custom features: PRD Builder with background store persistence, Prompt Injection, zero-config in-memory auto-routing with session stickiness, and collapsible sidebar.
  - Synced WorkBuddy 5.8.4 channel verification headers (UUIDv7 + W3C/B3 trace family) for CodeBuddy International.
  - Integrated upstream OpenCode V2 engine, CLI runner, zero-output rescue, and reasoning token folding.

# v0.5.215 (2026-10-18) · 8 commits

## Features & Improvements

- **PRD Builder Background Generation & Persistence**: Moved PRD generation state and streaming lifecycle into global Zustand store (`usePrdStore`) so generating documents and extracting task lists continue seamlessly across page navigation without losing progress or streaming buffers.
- **PRD Generation Progress in Notification Bell**: Direct integration with `taskStore` displaying live drafting/reviewing progress, character counter, and cancel control in the notification bell menu.
- **Change Log Accent Branding**: Updated Dayy4dev tab styling to vibrant blue (`#3b82f6`) and differentiated Serenhope tab to emerald green (`#10b981`).
- **Global Model Test Store**: Persist model testing progress, latency, and status badges across page navigation and SPA route switching (`useModelTestStore`).
- **Live Model Testing Progress in Notification Bell**: Direct integration with `taskStore` showing dynamic percentage and real-time pass/fail counters.
- **Single Progress Bar per View**: Cleaned up duplicated progress bar rendering in provider detail pages.
- **SPA Bell Navigation Fix**: Prevent full browser page reload and task abortion when clicking running task notifications.
- **Prompt Injection & PRD Builder Protection**: Fully preserved and integrated custom tools across upstream merges.
- **Repository Tracker**: Update check system points to `Dayy4dev/9router` (`dev` branch).

# v0.5.214 (2026-10-18) · 2 commits

## Fixes

- **API Models Studio Target Guard**: Fixed ReferenceError on `pluginMarks` loop in studio models and guarded `onSelect` in Prompt Injection.
- **AutoRouter Provider Resolution**: Fixed relative import path for providers in autoRouter to resolve 500 errors.

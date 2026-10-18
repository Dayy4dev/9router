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

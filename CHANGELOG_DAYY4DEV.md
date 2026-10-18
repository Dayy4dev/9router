# v0.5.215 (2026-10-18) · 6 commits

## Features & Improvements

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

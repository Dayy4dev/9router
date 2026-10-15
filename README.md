<div align="center">

<img src="https://capsule-render.vercel.app/api?type=venom&height=200&color=0:f97815,100:c2590a&text=9Router&fontSize=60&fontColor=ffffff&fontAlignY=38&animation=fadeIn" width="100%" alt="9Router" />

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=20&duration=3500&pause=1200&color=F97815&center=true&vCenter=true&width=640&height=50&lines=One+gateway%2C+any+model;OpenAI%E2%80%91compatible+endpoint;Speaks+Claude+and+Gemini+too;Extra+features%2C+free+for+everyone" alt="One gateway, any model" />

A fork of [Decolua/9router](https://github.com/Decolua/9router) with extra features for everyone who wants them.

One gateway, one API key, any model: an OpenAI-compatible endpoint that routes to Claude, GPT, Gemini, Kimi, Qwen, GLM, DeepSeek, Grok and many more, with OAuth or your own accounts. This is still that router, with the parts I use daily changed and the rough edges fixed, free for anyone to use.

![License](https://img.shields.io/badge/license-MIT-green) ![Upstream](https://img.shields.io/badge/upstream-Decolua%2F9router-blue) ![Edition](https://img.shields.io/badge/edition-fork--custom-orange)

</div>

---

## Screenshots

<div align="center">

<img src="images/9router.png" alt="9Router dashboard" width="100%" />

</div>

## What it routes

The gateway accepts a request in OpenAI, Claude or Gemini shape, translates it to whatever the target provider speaks, and streams the answer back. Providers are grouped by how you sign in:

| Sign-in | Providers |
| --- | --- |
| OAuth | Claude, OpenAI Codex, Gemini CLI, Antigravity, Kiro, Kimi (Moonshot), Grok CLI, xAI, Cursor, GitHub Copilot, GitLab, Windsurf, Trae, Zed, iFlow, Qoder, Cline, KiloCode, CodeBuddy, Xiaomi MIMO |
| API key | OpenAI, Anthropic, DeepSeek, GLM (Z.ai / Zhipu), MiniMax, Mistral, Perplexity, Groq, Together, Fireworks, Cerebras, SambaNova, SiliconFlow, Nebius, Hugging Face, Venice, Voyage and dozens more |
| Free tier | OpenRouter, OpenCode, Kiro, Gemini, Cloudflare AI, NVIDIA, Morph, Poolside, Kimchi, LLM7, api-airforce |
| Web cookie | DeepSeek Web, Gemini Web, Kimi Web |
| Local | Ollama, LM Studio style self-hosted nodes, self-hosted TTS/STT/embeddings |

It is not only chat. The same gateway also serves text to image, image to text, video generation, text to speech, speech to text, embeddings, web search and web fetch, each with its own `/v1`-style endpoint.

## What this fork adds

Everything lives alongside upstream's features. The short version:

- **AI Gateway Prompt Injection** - dynamically prepend, append, or override system and user prompts across combos, models, wildcards, or global traffic, with per-key isolation and keyword/regex condition triggers.
- **Per-key control** - every key carries its own token limit, reset interval, expiry and model allow-list, enforced on every endpoint.
- **Custom models & plugins** - models that answer under your own name (the real target never leaks), per-model plugin badges, a model playground and comparisons.
- **Operability** - scheduled backups to Telegram or GitHub, proxy pools, a security log of who signed in and from where, a theme that applies to the whole site, and an in-dashboard update banner.

The [changelog](./CHANGELOG.md) is the source of truth: it is regenerated on every release, so it always lists what is actually new. Anything not written here yet may already ship in your build - check the changelog rather than this file.

## AI Gateway Prompt Injection

The **Prompt Injection** module (`/dashboard/prompt-injection`) equips 9Router with an intelligent prompt orchestration and guardrail layer. It allows you to inject system personas, formatting requirements, security policies, or dynamic context on the fly—**without modifying client applications, IDEs, or client-side prompts** (e.g., Cursor, Claude Code, Cline, Windsurf).

### Key Features
- **Precise Target Scopes**:
  - **Combos**: Target traffic routed through specific combos (e.g., `smart-coder`, `fallback-auto`).
  - **Models & Wildcards**: Target specific model IDs (`claude-3-7-sonnet`, `deepseek-chat`) or pattern wildcards (`claude-*`, `openai/*`, `*deepseek*`, `*`).
  - **Global Traffic**: Apply universal rules across all gateway requests.
- **Per-Key Targeting**: Restrict injection rules to specific API Keys (e.g., internal team keys vs. client-facing keys) or apply universally.
- **Keyword & Regex Trigger Filters**:
  - **Always Active**: Injects on every matching request.
  - **Contains Keywords**: Triggers only when the user's prompt contains designated keywords (e.g., `code, python, sql, bug, refactor`). Supports case-sensitive matching.
  - **Regular Expressions (Regex)**: Triggers only when the prompt matches custom RegExp patterns (e.g., `\b(python|javascript|golang)\b` or `^(create|build)\b`).
- **5 Injection Strategies**:
  - `Prepend System` — Insert instructions at the very beginning of the system prompt (highest priority).
  - `Append System` — Append guidelines or constraints to the end of the system prompt.
  - `Override System` — Replace the client's system prompt completely.
  - `Prepend User` — Prepend instructions directly before the user's latest prompt.
  - `Append User` — Append instructions directly after the user's latest prompt.
- **Dynamic Template Interpolation**: Built-in variables evaluated in real-time on every request:
  - `{{model}}` — Resolved active model name.
  - `{{provider}}` — Active upstream provider (e.g., `openai`, `anthropic`, `deepseek`).
  - `{{date}}` — Current UTC/local date (`YYYY-MM-DD`).
  - `{{time}}` — Current local time (`HH:mm:ss`).
  - `{{datetime}}` — Full ISO timestamp.
- **Dry-Run Gateway Simulator**: Test and verify transformed JSON payloads side-by-side (Original vs. Injected) in the dashboard drawer before applying rules to live traffic.
- **Idempotency & Fail-Open Safety**:
  - Multi-account rotation and combo fallbacks never cause duplicate prompt injections.
  - Multi-wire protocol translation automatically normalizes payloads for OpenAI Chat (`messages`), Anthropic Claude (`system`), Google Gemini (`system_instruction`), and OpenAI Responses (`instructions`).
  - Fails open gracefully if any rule format is malformed, ensuring zero disruption to chat inferences.

## Getting started

```bash
git clone https://github.com/serenhope/9router.git
cd 9router
npm install
npm run dev          # dashboard on http://localhost:20127
```

Production:

```bash
npm run build
npm run start
```

Docker:

```bash
docker build -t 9router-fork .
docker run -d -p 20128:20128 -v 9router-data:/app/data 9router-fork
```

Once it is running:

| | |
| --- | --- |
| Dashboard | `http://localhost:20127/dashboard` (first login: `seren123`, or set `INITIAL_PASSWORD`) |
| OpenAI-compatible | `http://localhost:20127/v1` |
| Claude-compatible | `http://localhost:20127/v1/messages` |
| Gemini-native | `http://localhost:20127/v1beta/models/{model}:generateContent` |
| Health probe | `GET /api/health` |

Point any CLI tool or agent at the base URL, generate a key under **Endpoint & Key**, and you are done.

## Model names you can call

| Form | Example |
| --- | --- |
| Provider model | `kiro/claude-sonnet-4.5`, `kimi/kimi-k2.6`, `deepseek/deepseek-v4.1-pro` |
| Custom node | `mynode/gpt-oss-120b` |
| Combo | `my-combo` (fallback, round-robin, fusion and more) |
| Custom model | any name you define in Custom Models |

## Configuration

The app reads a few environment variables with sensible defaults; see [.env.example](./.env.example). State lives in `~/.9router` (SQLite database, backups, secrets).

## Credits

- Built on **[Decolua/9router](https://github.com/Decolua/9router)** - full credit to upstream for the router, the providers and the translators.
- Fork releases are tagged in [CHANGELOG.md](./CHANGELOG.md).
- License: **MIT**, same as upstream. See [LICENSE](./LICENSE).

---

<div align="center">

If this fork helped you, a star is appreciated.

[![Stars](https://img.shields.io/github/stars/serenhope/9router?style=social)](https://github.com/serenhope/9router/stargazers)

</div>

<img src="https://capsule-render.vercel.app/api?type=waving&section=footer&height=140&color=0:c2590a,50:f97815,100:ffb347&animation=fadeIn" width="100%" alt="" />

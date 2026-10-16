"use client";

import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Card, Button, ModelSelectModal, CardSkeleton } from "@/shared/components";
import { PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { getPricingForModel, calculateCostFromTokens, formatCost } from "open-sse/providers/pricing.js";
import { describeEmptyResponse } from "@/shared/utils/modelResponse";
import { streamChatCompletion } from "@/shared/utils/chatStream";

const MAX_MODELS = 4;
const MIN_MODELS = 1;

const ALIAS_TO_PROVIDER_ID = Object.fromEntries(
  Object.entries(PROVIDER_ID_TO_ALIAS).map(([id, alias]) => [alias, id])
);

function splitModel(value) {
  const str = String(value || "").trim();
  if (!str.includes("/")) return { provider: null, model: str };
  const firstSlash = str.indexOf("/");
  const prefix = str.slice(0, firstSlash);
  return { provider: ALIAS_TO_PROVIDER_ID[prefix] || prefix, model: str.slice(firstSlash + 1) };
}

function estimateCost(modelName, usage, studioTargets) {
  const { provider, model } = splitModel(studioTargets?.[modelName] || modelName);
  const pricing = getPricingForModel(provider, model);
  if (!pricing) return null;
  return calculateCostFromTokens(usage || {}, pricing);
}

// Battle costs are usually sub-cent, so two decimals would render every row as $0.00.
function showCost(cost) {
  if (cost === null || cost === undefined || Number.isNaN(cost)) return "n/a";
  if (cost >= 0.01) return formatCost(cost);
  if (cost < 0.0001) return `$${cost.toExponential(1)}`;
  return `$${cost.toFixed(4)}`;
}

function emptyResult() {
  return { loading: false, data: null };
}

// Every finished card reads the same fields, so a run that never got there has to
// answer for them instead of leaving the renderers with holes.
function slotData() {
  return {
    ok: false,
    kind: "empty",
    content: "",
    thinking: "",
    hint: "",
    detail: "",
    status: "",
    source: "",
    cooldown: "",
    ms: null,
    ttftMs: null,
    usage: null,
    cost: null,
    chars: 0,
    stopped: false,
    stoppedNote: "",
  };
}

// A stopped card keeps its partial text, so it needs a sentence of its own.
function stoppedNote(data) {
  const lines = String(data?.content || "")
    .split("\n")
    .filter((line) => line.trim()).length;
  if (lines) return `Stopped after ${lines} ${lines === 1 ? "line" : "lines"} of output.`;
  if (String(data?.thinking || "").trim()) return "Stopped while the model was still reasoning.";
  return "Stopped before any output arrived.";
}

/**
 * The one immutable update path for a contender card. Every callback of a running
 * stream goes through here carrying the battle `run` it belongs to, so concurrent
 * slots never overwrite each other and chunks from a stopped or superseded run are
 * dropped rather than resurrecting a finished card.
 */
function patchSlot(prev, index, event) {
  const slot = prev[index];
  if (!slot || slot.run !== event.run) return prev;

  if (event.type === "delta") {
    if (!slot.loading) return prev;
    const data = slot.data || { content: "", thinking: "" };
    const next = [...prev];
    next[index] = { ...slot, data: { ...data, [event.sink]: (data[event.sink] || "") + event.chunk } };
    return next;
  }

  if (event.type === "idle") {
    const next = [...prev];
    next[index] = { ...slot, loading: false, data: null };
    return next;
  }

  if (event.type === "stop") {
    if (!slot.loading) return prev;
    const partial = slot.data || {};
    const note = stoppedNote(partial);
    const kind = partial.content ? "text" : partial.thinking ? "thinking" : "empty";
    const next = [...prev];
    next[index] = {
      ...slot,
      loading: false,
      data: {
        ...slotData(),
        ok: true,
        kind,
        content: partial.content || "",
        thinking: partial.thinking || "",
        hint: kind === "empty" ? note : "",
        stopped: true,
        stoppedNote: note,
        ms: event.at - slot.startedAt,
        chars: (partial.content || "").length,
      },
    };
    return next;
  }

  const next = [...prev];
  next[index] = { ...slot, loading: false, data: event.data };
  return next;
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/**
 * A contender is in exactly one of these states, and the state has to survive a
 * greyscale screenshot: every one carries a word and a distinct glyph, with
 * colour as the third channel only. The elapsed time lives beside the pill,
 * not inside it, so the pill always answers "what happened" and the timer
 * always answers "how long".
 *
 * Every glyph is one the shipped icon subset covers
 * (public/fonts/material-symbols-glyphs.txt). A name outside that list is not
 * in the 114 KB subset woff2, so drawing it would fall back to the 3.96 MB
 * package font to render one 13px mark.
 */
const RUN_STATES = {
  idle: { label: "idle", icon: "schedule", tone: "text-text-muted" },
  running: { label: "running", icon: "progress_activity", tone: "text-primary" },
  done: { label: "done", icon: "check_circle", tone: "text-success" },
  stopped: { label: "stopped", icon: "stop_circle", tone: "text-warning" },
  empty: { label: "empty", icon: "warning", tone: "text-warning" },
  error: { label: "failed", icon: "error", tone: "text-danger" },
};

/**
 * Turn the store's two booleans (loading / data) plus the model string into the
 * state the reader sees. Nothing here invents information: every label is a
 * direct read of the slot, including the two ways a slot sits a round out.
 */
function runStateFor(model, slot) {
  if (!model.trim()) return { key: "idle", label: "no model", icon: "link_off", tone: "text-text-subtle" };
  if (!slot) return { key: "idle", ...RUN_STATES.idle };
  if (slot.loading) return { key: "running", ...RUN_STATES.running };
  const data = slot.data;
  if (!data) return { key: "idle", label: "skipped", icon: "block", tone: "text-text-muted" };
  if (!data.ok || data.kind === "error") {
    return { key: "error", label: data.status ? `HTTP ${data.status}` : "failed", icon: "error", tone: "text-danger" };
  }
  if (data.stopped) return { key: "stopped", ...RUN_STATES.stopped };
  if (data.kind === "empty") return { key: "empty", ...RUN_STATES.empty };
  // The pill says the state; the run time is a metric in the footer below, so
  // this stays a word like every other state rather than only a number.
  return { key: "done", ...RUN_STATES.done };
}

function RunState({ state }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--r-chip)] border border-border bg-surface-2 px-1.5 py-1 text-[11px] font-medium leading-none ${state.tone}`}
    >
      <span
        className={`material-symbols-outlined text-[13px] leading-none ${state.key === "running" ? "animate-spin" : ""}`}
      >
        {state.icon}
      </span>
      <span>{state.label}</span>
    </span>
  );
}

function letterOf(index) {
  return String.fromCharCode(65 + index);
}

/**
 * Model answers alternate between prose and fenced code. Prose gets
 * proportional type at a reading measure; fenced blocks keep monospace and
 * scroll sideways instead of wrapping, because a wrapped code line is a
 * different program than the one that was written. An unterminated fence (which
 * is the normal case while a stream is still open) renders as code in progress.
 */
function splitFences(text) {
  const str = String(text || "");
  if (!str.includes("```")) return str ? [{ code: false, text: str }] : [];
  const parts = str.split("```");
  const out = [];
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      // The info string after the fence is markup, not content.
      const nl = part.indexOf("\n");
      out.push({ code: true, text: nl === -1 ? part : part.slice(nl + 1) });
    } else if (part) {
      out.push({ code: false, text: part });
    }
  });
  return out;
}

function AnswerBody({ text, caret }) {
  const segments = splitFences(text);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {segments.map((seg, i) => {
        const last = i === segments.length - 1;
        const mark = last && caret ? <span className="animate-pulse">▍</span> : null;
        return seg.code ? (
          <pre
            key={i}
            className="custom-scrollbar max-h-[26rem] min-w-0 overflow-x-auto rounded-[var(--r-control)] bg-surface-2 p-3 font-mono text-[13px] leading-[1.55] text-text-main"
          >
            <code>
              {seg.text}
              {mark}
            </code>
          </pre>
        ) : (
          <p key={i} className="max-w-[68ch] min-w-0 break-words whitespace-pre-wrap text-[15px] leading-[1.7] text-text-main">
            {seg.text}
            {mark}
          </p>
        );
      })}
    </div>
  );
}

// Reasoning is secondary material: smaller, muted, and ruled off on the left so
// it reads as an aside to the answer rather than as more answer.
function ThinkingBody({ text, caret }) {
  return (
    <div className="min-w-0 border-l-2 border-border pl-3">
      <p className="max-w-[70ch] min-w-0 break-words whitespace-pre-wrap text-sm leading-[1.65] text-text-muted">
        {text}
        {caret && <span className="animate-pulse">▍</span>}
      </p>
    </div>
  );
}

function EmptyArena({ contenders }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-[var(--r-card)] border border-dashed border-border px-6 py-14 text-center">
      <span className="material-symbols-outlined text-[28px] leading-none text-text-subtle">swords</span>
      <p className="text-sm font-semibold text-text-main">No answers yet</p>
      <p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">
        Run a battle and every contender answers here side by side, streaming live, so you can read
        them against each other before you pick one.
      </p>
      <p className="text-[11px] text-text-subtle">
        {contenders} of {MAX_MODELS} contender slots in use.
      </p>
    </section>
  );
}

export default function ArenaPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ArenaContent />
    </Suspense>
  );
}

function ArenaContent() {
  const [slots, setSlots] = useState(["", ""]);
  const [results, setResults] = useState([emptyResult(), emptyResult()]);
  const [prompt, setPrompt] = useState("");
  const [runId, setRunId] = useState(0);
  const [pick, setPick] = useState(null);
  const [showPicker, setShowPicker] = useState(null);
  const [activeProviders, setActiveProviders] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [studioTargets, setStudioTargets] = useState({});
  const [activeApiKey, setActiveApiKey] = useState("");
  const controllers = useRef({});
  const runRef = useRef(0);

  const patch = useCallback(
    (index, event) => setResults((prev) => patchSlot(prev, index, event)),
    []
  );

  // A battle that outlives the page must not keep firing at a dead component.
  useEffect(() => {
    const map = controllers;
    return () => {
      for (const controller of Object.values(map.current)) controller.abort();
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [providersRes, aliasesRes, studioRes, keysRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/models/alias"),
          fetch("/api/model-editor"),
          fetch("/api/keys"),
        ]);
        if (providersRes.ok) {
          const pData = await providersRes.json();
          setActiveProviders(pData.connections || []);
        }
        if (aliasesRes.ok) {
          const aData = await aliasesRes.json();
          setModelAliases(aData.aliases || {});
        }
        if (studioRes.ok) {
          const sData = await studioRes.json();
          const map = {};
          for (const studio of sData.models || []) map[studio.callName] = studio.targetModel;
          setStudioTargets(map);
        }
        if (keysRes.ok) {
          const kData = await keysRes.json();
          const firstActive = (kData.keys || []).find((k) => k.isActive !== false);
          if (firstActive?.key) setActiveApiKey(firstActive.key);
        }
      } catch (e) {
        console.error("Error loading battle inputs:", e);
      }
    };
    load();
  }, []);

  const setSlot = (index, value) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addSlot = () => {
    if (slots.length >= MAX_MODELS) return;
    setSlots((prev) => [...prev, ""]);
    setResults((prev) => [...prev, emptyResult()]);
  };

  const removeSlot = (index) => {
    if (slots.length <= MIN_MODELS) return;
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setResults((prev) => prev.filter((_, i) => i !== index));
    setPick(null);
  };

  const runBattle = useCallback(async () => {
    if (!prompt.trim()) return;
    const id = runId + 1;
    runRef.current = id;
    setRunId(id);
    setPick(null);
    setResults(slots.map(() => ({ loading: true, run: id, startedAt: Date.now(), data: null })));

    await Promise.all(
      slots.map(async (model, index) => {
        if (!model.trim()) {
          patch(index, { type: "idle", run: id });
          return;
        }
        const controller = new AbortController();
        controllers.current[index] = controller;
        const started = Date.now();
        try {
          const answer = await streamChatCompletion({
            model: model.trim(),
            messages: [{ role: "user", content: prompt }],
            apiKey: activeApiKey,
            signal: controller.signal,
            onDelta: (chunk) => patch(index, { type: "delta", run: id, sink: "content", chunk }),
            onThinking: (chunk) => patch(index, { type: "delta", run: id, sink: "thinking", chunk }),
          });
          const usage = answer.usage || {};
          const content = answer.kind === "thinking" ? "" : answer.text || "";
          patch(index, {
            type: "final",
            run: id,
            data: {
              ...slotData(),
              ok: true,
              kind: answer.kind,
              content,
              thinking: answer.thinking || "",
              hint: answer.kind === "empty"
                ? describeEmptyResponse({ finishReason: answer.finishReason, usage, thinking: answer.thinking })
                : "",
              ms: answer.ms,
              ttftMs: answer.ttftMs,
              usage,
              cost: estimateCost(model.trim(), usage, studioTargets),
              chars: content.length,
            },
          });
        } catch (err) {
          if (err?.name === "AbortError") {
            patch(index, { type: "stop", run: id, at: Date.now() });
            return;
          }
          patch(index, {
            type: "final",
            run: id,
            data: {
              ...slotData(),
              kind: "error",
              content: err?.message || "The stream failed before the model answered.",
              detail: err?.detail || "",
              status: err?.status || "",
              cooldown: err?.cooldown || "",
              source: err?.model || "",
              ms: Date.now() - started,
            },
          });
        } finally {
          if (controllers.current[index] === controller) delete controllers.current[index];
        }
      })
    );
  }, [prompt, slots, runId, activeApiKey, studioTargets, patch]);

  // Stopping keeps whatever already streamed, so every controller aborts and each
  // card closes itself through the same patch path the streams use.
  const stopBattle = useCallback(() => {
    const run = runRef.current;
    for (const controller of Object.values(controllers.current)) controller.abort();
    controllers.current = {};
    const at = Date.now();
    setResults((prev) => {
      let next = prev;
      for (let index = 0; index < prev.length; index += 1) {
        next = patchSlot(next, index, { type: "stop", run, at });
      }
      return next;
    });
  }, []);

  const busy = results.some((r) => r.loading);
  // The columns show from run #1, not from "somebody has data": a contender that
  // fails, is empty or was skipped still earns a column that says so, instead of
  // quietly vanishing from the grid.
  const ran = runId > 0;
  const ranked = useMemo(() => buildRanking(slots, results), [slots, results]);
  // The marker on a column is either the reader's own pick, or the head of the
  // automatic speed-and-spend ranking - and only a finished, unstopped answer
  // may wear it, so a cut-off or empty run is never celebrated.
  const marked =
    pick != null
      ? pick
      : ranked[0] && ranked[0].answered && !ranked[0].stopped && ranked.length > 1
        ? ranked[0].index
        : null;
  const contendersInUse = slots.filter((s) => s.trim()).length;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-bold leading-none">
          <span className="material-symbols-outlined size-[22px] shrink-0 text-[22px] leading-none text-primary">
            swords
          </span>
          Compare Models
        </h1>
        <p className="text-sm text-text-muted">
          One prompt, up to {MAX_MODELS} models, answered side by side.
        </p>
      </div>

      {/* The composer is pinned to the top of the scroll area: while answers
          stream and you read them, the prompt and the Stop button stay put.
          The band behind it must be opaque - a translucent surface lets text
          ghost through a pinned element - so it carries its own backdrop class
          (see globals.css) instead of a theme surface, which the glass theme
          deliberately makes see-through. */}
      <div className="arena-sticky sticky top-0 z-20 mb-5 pb-4 pt-4 shadow-[var(--elev-3)]">
        <Card padding="md" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Contenders
              </span>
              <span className="text-[11px] text-text-subtle">
                {contendersInUse} of {MAX_MODELS} in this battle
              </span>
            </div>

            {/* One chip per contender, in a row that scrolls sideways on narrow
                screens so the composer never grows taller than the viewport. */}
            <div className="custom-scrollbar flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {slots.map((model, index) => {
                const state = runStateFor(model, results[index]);
                return (
                  <div
                    key={index}
                    className="flex shrink-0 items-center gap-1.5 rounded-[var(--r-control)] border border-border bg-surface-2 py-1 pl-2 pr-1"
                  >
                    <span aria-hidden="true" className="text-[11px] font-semibold text-text-muted">
                      {letterOf(index)}
                    </span>
                    <input
                      value={model}
                      onChange={(e) => setSlot(index, e.target.value)}
                      placeholder="model id"
                      aria-label={`Contender ${index + 1} model`}
                      className="chrome-focus h-7 w-[150px] bg-transparent text-[13px] font-mono text-text-main placeholder:text-text-muted sm:w-[190px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPicker(index)}
                      title={`Pick contender ${index + 1}`}
                      aria-label={`Pick contender ${index + 1}`}
                      className="chrome-focus flex h-7 w-7 items-center justify-center rounded-[var(--r-control)] text-text-muted chrome-row hover:text-text-main"
                    >
                      <span className="material-symbols-outlined text-[16px]">search</span>
                    </button>
                    {slots.length > MIN_MODELS && !busy && (
                      <button
                        type="button"
                        onClick={() => removeSlot(index)}
                        title={`Remove contender ${index + 1}`}
                        aria-label={`Remove contender ${index + 1}`}
                        className="chrome-focus flex h-7 w-7 items-center justify-center rounded-[var(--r-control)] text-text-muted chrome-row hover:text-text-main"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    )}
                    <RunState state={state} />
                  </div>
                );
              })}

              {slots.length < MAX_MODELS && (
                <button
                  type="button"
                  onClick={addSlot}
                  className="chrome-focus chrome-interactive flex h-9 shrink-0 items-center gap-1 rounded-[var(--r-control)] border border-dashed border-border px-2.5 text-xs font-medium text-primary hover:bg-primary/5"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Add contender
                </button>
              )}
            </div>

            <p className="hidden text-[11px] text-text-muted sm:block">
              Type a model id, for example{" "}
              <code className="rounded-[var(--r-chip)] bg-surface-2 px-1 py-0.5 font-mono">cc/claude-sonnet-4.5</code>,
              or use the search button to pick one from your providers.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="arena-prompt"
              className="text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Prompt
            </label>
            <textarea
              id="arena-prompt"
              className="chrome-field chrome-focus max-h-72 min-h-[64px] w-full resize-y border border-border/50 bg-surface-2 text-text-main placeholder:text-text-muted focus:bg-surface focus:border-brand-500/50 sm:min-h-[92px]"
              placeholder="Write a python script to parse CSV..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-text-subtle">
              {busy
                ? `Streaming to ${contendersInUse} ${contendersInUse === 1 ? "contender" : "contenders"}`
                : runId > 0
                  ? `Run #${runId} finished`
                  : "Nothing has run yet"}
            </span>
            <Button
              icon={busy ? "stop_circle" : "play_arrow"}
              onClick={busy ? stopBattle : runBattle}
              disabled={busy ? false : !prompt.trim() || !slots.some((s) => s.trim())}
              variant={busy ? "secondary" : "primary"}
            >
              {busy ? "Stop" : "Run Battle"}
            </Button>
          </div>
        </Card>
      </div>

      {ran ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {slots.map((model, index) => {
            const slot = results[index];
            const data = slot?.data;
            const loading = Boolean(slot?.loading);
            const state = runStateFor(model, slot);
            const isMarked = marked === index;
            return (
              <Card key={index} padding="none" className="flex min-w-0 flex-col overflow-hidden">
                {isMarked && (
                  <div className="flex items-center gap-1.5 border-b border-primary/25 bg-primary/5 px-4 py-2 text-[11px] font-semibold text-primary">
                    <span className="material-symbols-outlined text-[14px] leading-none">
                      {pick === index ? "check" : "trophy"}
                    </span>
                    {pick === index ? "Your pick" : "Fastest complete answer"}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-[var(--r-chip)] bg-surface-2 text-[11px] font-semibold text-text-muted"
                    >
                      {letterOf(index)}
                    </span>
                    <span className="min-w-0 truncate font-mono text-sm font-semibold text-text-main">
                      {model || "no model"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* The timer reads live while the run is open, settles on
                        the final duration once it lands, and stays out of the
                        way when a run ended without a recorded time. */}
                    {(loading || data?.ms != null) && (
                      <Elapsed startedAt={slot?.startedAt} ms={loading ? null : data?.ms} />
                    )}
                    <RunState state={state} />
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-col p-4">
                  {loading && (data?.content || data?.thinking) ? (
                    data.content ? (
                      <AnswerBody text={data.content} caret />
                    ) : (
                      <ThinkingBody text={data.thinking} caret />
                    )
                  ) : loading ? (
                    <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-text-muted">
                      <span className="material-symbols-outlined animate-spin text-3xl">
                        progress_activity
                      </span>
                      <span className="text-sm">Waiting for the first token...</span>
                    </div>
                  ) : !model.trim() ? (
                    <p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">
                      No model id in this contender, so it sat this round out.
                    </p>
                  ) : !data ? (
                    <p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">
                      This contender did not run.
                    </p>
                  ) : data.kind === "error" ? (
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] leading-5 text-danger">
                          error
                        </span>
                        <p className="min-w-0 break-words text-sm leading-relaxed text-text-main">
                          {data.content}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        {data.status && (
                          <span className="rounded-[var(--r-chip)] bg-danger/10 px-1.5 py-0.5 font-mono text-danger">
                            HTTP {data.status}
                          </span>
                        )}
                        {data.cooldown && (
                          <span className="rounded-[var(--r-chip)] bg-warning/10 px-1.5 py-0.5 text-warning">
                            {data.cooldown}
                          </span>
                        )}
                        {data.source && (
                          <span
                            title={data.source}
                            className="max-w-full truncate rounded-[var(--r-chip)] bg-surface-2 px-1.5 py-0.5 font-mono text-text-muted"
                          >
                            {data.source}
                          </span>
                        )}
                      </div>
                      {data.detail && (
                        <details className="min-w-0">
                          <summary className="cursor-pointer text-[11px] text-text-muted hover:text-primary">
                            Show the raw error
                          </summary>
                          <pre className="custom-scrollbar mt-1 max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-control)] bg-surface-2 p-2 text-[10px] text-text-muted">
                            {data.detail}
                          </pre>
                        </details>
                      )}
                    </div>
                  ) : data.kind === "empty" ? (
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] leading-5 text-warning">
                          warning
                        </span>
                        <p className="min-w-0 break-words text-sm leading-relaxed text-text-main">
                          {data.hint}
                        </p>
                      </div>
                      {!data.stopped && (
                        <p className="text-[11px] text-text-muted">
                          The provider answered with HTTP 200 and nothing inside.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-col gap-4">
                      {data.kind === "thinking" ? (
                        <>
                          {!data.stopped && (
                            <p className="text-[11px] text-text-muted">
                              Only reasoning came back, with no final answer.
                            </p>
                          )}
                          <ThinkingBody text={data.thinking} />
                        </>
                      ) : (
                        <AnswerBody text={data.content} />
                      )}

                      {data.thinking && data.kind !== "thinking" && (
                        <details className="min-w-0">
                          <summary className="cursor-pointer text-[11px] text-text-muted hover:text-primary">
                            Show the reasoning behind this answer
                          </summary>
                          <div className="mt-2 min-w-0">
                            <ThinkingBody text={data.thinking} />
                          </div>
                        </details>
                      )}

                      {data.stopped && data.kind !== "empty" && (
                        <p className="flex items-start gap-1.5 text-[11px] text-warning">
                          <span className="material-symbols-outlined text-[13px] leading-4">stop_circle</span>
                          {data.stoppedNote}
                        </p>
                      )}

                      {data.ok && (
                        <dl className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border-subtle pt-3 text-[11px] text-text-muted">
                          {data.ttftMs != null && <Metric label="first token" value={`${data.ttftMs}ms`} />}
                          {data.ms != null && <Metric label="total" value={`${data.ms}ms`} />}
                          {data.usage && (
                            <>
                              <Metric label="in" value={String(data.usage?.prompt_tokens ?? 0)} />
                              <Metric label="out" value={String(data.usage?.completion_tokens ?? 0)} />
                              <Metric label="tokens" value={String(data.usage?.total_tokens ?? 0)} />
                            </>
                          )}
                          {data.cost != null && <Metric label="cost" value={`~${showCost(data.cost)}`} />}
                        </dl>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyArena contenders={contendersInUse} />
      )}

      {ranked.length > 1 && (
        <div className="mt-5">
          <FinalResult ranked={ranked} pick={pick} setPick={setPick} runId={runId} />
        </div>
      )}

      {showPicker !== null && (
        <ModelSelectModal
          isOpen
          onClose={() => setShowPicker(null)}
          onSelect={(modelObj) => {
            setSlot(showPicker, modelObj?.value || "");
            setShowPicker(null);
          }}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title={`Pick contender ${showPicker + 1}`}
        />
      )}
    </div>
  );
}

// A labelled number in the run footer. dt/dd keeps the pairing semantic, and
// tabular figures stop the column jittering as a stream ticks upward.
function Metric({ label, value }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="font-mono tabular-nums text-text-main">{value}</dd>
    </div>
  );
}

/**
 * Rank finished runs. Quality can only be judged by reading, so the automatic
 * ranking is explicitly about speed + spend; a manual pick always wins.
 */
function buildRanking(slots, results) {
  return slots
    .map((model, index) => ({ model, index, slot: results[index] }))
    // A card that is still streaming holds a partial answer, so it is not rankable.
    .filter((entry) => entry.model && entry.slot?.data && !entry.slot.loading)
    .map((entry) => ({
      model: entry.model,
      index: entry.index,
      ok: entry.slot.data.ok,
      answered: entry.slot.data.ok && entry.slot.data.kind !== "empty",
      stopped: entry.slot.data.stopped,
      ms: entry.slot.data.ms,
      ttftMs: entry.slot.data.ttftMs,
      totalTokens: entry.slot.data.usage?.total_tokens ?? 0,
      cost: entry.slot.data.cost,
      chars: entry.slot.data.chars,
    }))
    .sort((a, b) => {
      if (a.answered !== b.answered) return a.answered ? -1 : 1;
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      // A cut-off answer is not a finish, so it ranks behind every complete one.
      if (a.stopped !== b.stopped) return a.stopped ? 1 : -1;
      const ta = a.ms ?? Number.MAX_SAFE_INTEGER;
      const tb = b.ms ?? Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return (a.cost ?? Number.MAX_SAFE_INTEGER) - (b.cost ?? Number.MAX_SAFE_INTEGER);
    });
}

// One metric, described once: what it is, how a lower (or higher) number
// reads, how to render it, and which winner it produced. The winner rail, the
// table bars and the header all read from this single list, so a metric can
// never be shown as the winner in one place and left unbarred in another.
// The metric's own name carries its identity, so the bars share one theme
// token instead of five hardcoded hues: colour is left free to mean "winner",
// which is the only thing here the reader cannot read off the label.
const METRIC_COLOR = "var(--color-primary)";

const METRIC_DEFS = [
 {
  key: "ms",
  label: "Fastest",
  icon: "bolt",
  lowerIsBetter: true,
  value: (r) => (r.ms == null ? null : r.ms),
  format: (v) => `${v}ms`,
  hint: "total time to finish",
 },
 {
  key: "ttft",
  label: "First token",
  icon: "schedule",
  lowerIsBetter: true,
  value: (r) => (r.ttftMs == null ? null : r.ttftMs),
  format: (v) => `${v}ms`,
  hint: "time to first token",
 },
 {
  key: "cost",
  label: "Cheapest",
  icon: "payments",
  lowerIsBetter: true,
  value: (r) => (r.cost == null ? null : r.cost),
  format: (v) => showCost(v),
  hint: "price of this answer",
 },
 {
  key: "tokens",
  label: "Leanest",
  icon: "data_usage",
  lowerIsBetter: true,
  value: (r) => (r.totalTokens ? r.totalTokens : null),
  format: (v) => String(v),
  hint: "tokens billed",
 },
 {
  key: "chars",
  label: "Longest",
  icon: "article",
  lowerIsBetter: false,
  value: (r) => (r.chars ? r.chars : null),
  format: (v) => String(v),
  hint: "characters written",
 },
];

// Winner per metric, computed from the same pool the table shows: only finished,
// unstopped, answered runs compete.
function metricsFor(answered) {
  return METRIC_DEFS.map((def) => {
    const withValue = answered
      .map((r) => ({ r, v: def.value(r) }))
      .filter((x) => x.v != null && !Number.isNaN(x.v));
    if (!withValue.length) return { def, winner: null, best: null, worst: null };
    const sorted = withValue.slice().sort((a, b) =>
      def.lowerIsBetter ? a.v - b.v : b.v - a.v
    );
    return { def, winner: sorted[0].r, best: sorted[0].v, worst: sorted[sorted.length - 1].v };
  });
}

// Width of the bar for one value inside a metric. A single metric with one
// entrant gets a full bar; otherwise it is scaled against the worst value so
// the shape of the comparison is visible.
function barPct(v, best, worst) {
  if (v == null || best == null || worst == null) return 0;
  if (best === worst) return 100;
  const lo = Math.min(best, worst);
  const hi = Math.max(best, worst);
  // Floor at 8% so a cheap/fast entry is never invisible.
  return Math.max(8, Math.round(((v - lo) / (hi - lo)) * 92) + 8);
}

function FinalResult({ ranked, pick, setPick, runId }) {
  // An empty 200 response is not a win, and neither is an answer the user cut off,
  // so every award needs a real finished answer.
  const answered = ranked.filter((r) => r.answered && !r.stopped);
  // `answered` is derived from `ranked` every render, which is also the
  // invalidation signal: a new object identity means the inputs changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metrics = useMemo(() => metricsFor(answered), [answered]);
  // Kept under the old names because the table below still refers to them; they
  // are now derived from the shared metric list instead of five hand-rolled
  // sorts that could disagree with the rail.
  const winners = {
    fastest: metrics.find((m) => m.def.key === "ms")?.winner || null,
    cheapest: metrics.find((m) => m.def.key === "cost")?.winner || null,
    leanest: metrics.find((m) => m.def.key === "tokens")?.winner || null,
    richest: metrics.find((m) => m.def.key === "chars")?.winner || null,
    firstToken: metrics.find((m) => m.def.key === "ttft")?.winner || null,
  };

  const leader = ranked[0];
  const manual = pick != null ? ranked.find((r) => r.index === pick) : null;
  const byKey = useMemo(
    () => Object.fromEntries(metrics.map((m) => [m.def.key, m])),
    [metrics]
  );

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-warning">trophy</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-main">Final Result</h3>
            <p className="text-[11px] text-text-muted">
              {manual ? (
                <>Your pick: <code className="font-mono">{manual.model}</code></>
              ) : leader?.stopped ? (
                "Every run was stopped before it finished."
              ) : leader?.answered ? (
                <><code className="font-mono">{leader.model}</code> answered fastest - tap “My pick” below for quality.</>
              ) : (
                "No contender answered successfully."
              )}
            </p>
          </div>
        </div>
        <span className="text-[10px] text-text-muted">run #{runId}</span>
      </div>

      {answered.length > 1 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {metrics
            .filter((m) => m.winner)
            .map(({ def, winner, best }) => (
              <button
                key={def.key}
                type="button"
                onClick={() => setPick(winner.index)}
                title={`${def.hint} - tap to make it your pick`}
                // The rail tiles are the only surfaces here that act on the
                // page, so they take the contract's interactive lift (shadow +
                // brand border + 1px rise) instead of a one-off hover colour:
                // hover has to mean the same thing on every element.
                className={`chrome-focus chrome-interactive flex flex-col gap-1.5 rounded-[var(--r-card)] border p-3 text-left ${
                  pick === winner.index ? "border-primary/50 bg-primary/5" : "border-border"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  <span className="material-symbols-outlined text-[13px] leading-none">
                    {def.icon}
                  </span>
                  {def.label}
                </span>
                <span
                  className="text-lg font-bold font-mono tabular-nums leading-none"
                  style={{ color: METRIC_COLOR }}
                >
                  {def.format(best)}
                </span>
                <span className="text-[11px] font-mono text-text-main truncate">
                  {winner.model}
                </span>
              </button>
            ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
        <span className="material-symbols-outlined text-[12px] leading-none">info</span>
        <span>
          Ranked automatically on speed and spend only - bars compare the same
          metric across contenders. Answer quality is yours to judge, so use
          “My pick”.
        </span>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-text-muted border-b border-border">
              <th className="text-left py-2 pr-3 font-medium">Model</th>
              <th className="text-right py-2 px-3 font-medium">Time</th>
              <th className="text-right py-2 px-3 font-medium">First token</th>
              <th className="text-right py-2 px-3 font-medium">Tokens</th>
              <th className="text-right py-2 px-3 font-medium">Cost</th>
              <th className="text-right py-2 pl-3 font-medium">My pick</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry, position) => {
              const isWinner = position === 0 && entry.answered && !entry.stopped && pick == null;
              const isPicked = pick === entry.index;
              return (
                <tr
                  key={entry.index}
                  className={`border-b border-border/50 last:border-0 ${isPicked ? "bg-primary/5" : ""}`}
                >
                  <td className="py-2 pr-3 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-text-muted tabular-nums w-4 shrink-0">{position + 1}</span>
                      <code className="font-mono text-text-main truncate max-w-[220px]">{entry.model}</code>
                      {isWinner && <Badge icon="trophy" text="fastest" />}
                      {winners.firstToken?.index === entry.index && <Badge icon="bolt" text="first token" />}
                      {winners.cheapest?.index === entry.index && <Badge icon="payments" text="cheapest" />}
                      {winners.richest?.index === entry.index && winners.richest?.index !== winners.leanest?.index && (
                        <Badge icon="article" text="longest" />
                      )}
                      {entry.stopped && <Badge icon="stop_circle" text="stopped" />}
                      {isPicked && <Badge icon="check" text="your pick" accent />}
                    </div>
                    {!entry.answered && !entry.stopped && (
                  <span className={`text-[11px] ${entry.ok ? "text-warning" : "text-danger"}`}>
                    {entry.ok ? "empty answer" : "failed"}
                  </span>
                )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <MetricCell entry={entry} metric={byKey.ms} format={(v) => (v == null ? "n/a" : `${v}ms`)} />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <MetricCell entry={entry} metric={byKey.ttft} format={(v) => (v == null ? "n/a" : `${v}ms`)} />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <MetricCell
                      entry={entry}
                      metric={byKey.tokens}
                      format={(v) => (v == null ? "n/a" : String(v))}
                    />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <MetricCell entry={entry} metric={byKey.cost} format={(v) => showCost(v)} />
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <button
                      onClick={() => setPick(isPicked ? null : entry.index)}
                      className={`chrome-focus rounded-[var(--r-control)] border px-2 py-1 text-[11px] font-medium transition-colors duration-[var(--motion-fast)] ${
                        isPicked
                          ? "bg-primary text-white border-primary"
                          : "border-border text-text-muted hover:border-primary/50 hover:text-primary"
                      }`}
                    >
                      {isPicked ? "picked" : "pick"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Number plus bar. The bar is what makes the comparison readable; the digits
// stay for exactness. A missing value shows a dash and no bar rather than a
// zero-length bar that would read as "fastest".
function MetricCell({ entry, metric, format }) {
  if (!metric) return <span className="font-mono tabular-nums text-text-muted">-</span>;
  const v = metric.def.value(entry);
  if (v == null) return <span className="font-mono tabular-nums text-text-muted">-</span>;
  const isWinner = metric.winner?.index === entry.index;
  const pct = barPct(v, metric.best, metric.worst);
  return (
    <span className="flex flex-col items-end gap-1">
      <span
        className={`font-mono tabular-nums ${isWinner ? "font-semibold" : ""}`}
        style={isWinner ? { color: METRIC_COLOR } : undefined}
      >
        {format(v)}
        {isWinner ? (
          <span className="material-symbols-outlined align-middle ml-0.5 text-[11px] leading-none">
            star
          </span>
        ) : null}
      </span>
      <span className="block w-full min-w-[42px] max-w-[90px] h-1 rounded-full bg-surface-3 overflow-hidden">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: METRIC_COLOR,
            opacity: isWinner ? 1 : 0.45,
          }}
        />
      </span>
    </span>
  );
}

// The timer slot carries the wall-clock reading through the run and settles
// on the final duration when the run lands, so the header always answers "how
// long" without needing the state pill to. Ticking lives here so a running
// timer never re-renders the whole grid.
function Elapsed({ startedAt, ms }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  if (ms != null) {
    return (
      <span className="shrink-0 text-[11px] font-mono text-text-muted tabular-nums">
        {`${(ms / 1000).toFixed(1)}s`}
      </span>
    );
  }
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <span className="shrink-0 text-[11px] font-mono text-text-muted tabular-nums">
      {`${seconds}s so far`}
    </span>
  );
}

// A label, not a control: it takes the contract's chip radius, the same choice
// the shared Badge already made, so a table marker never reads as a toggle.
function Badge({ icon, text, accent }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-[var(--r-chip)] px-1.5 py-0.5 text-[10px] font-medium ${
        accent ? "bg-primary/15 text-primary" : "bg-surface-2 text-text-muted"
      }`}
    >
      <span className="material-symbols-outlined text-[11px]">{icon}</span>
      {text}
    </span>
  );
}

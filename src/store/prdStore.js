"use client";

import { create } from "zustand";
import { useTaskStore } from "./taskStore";
import { streamChatCompletion } from "@/shared/utils/chatStream";
import { describeEmptyResponse } from "@/shared/utils/modelResponse";
import { PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { getPricingForModel, calculateCostFromTokens } from "open-sse/providers/pricing.js";
import {
  PRD_TEMPLATES,
  PRD_DEPTHS,
  PRD_LANGUAGES,
  resolveSections,
  buildPrdMessages,
  buildReviewMessages,
  splitReviewOutput,
  auditSections,
} from "@/app/(dashboard)/dashboard/prd/prompt.js";
import {
  buildPlanExtractionMessages,
  cleanModelChecklist,
} from "@/app/(dashboard)/dashboard/prd/checklist.js";

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
  if (!usage) return null;
  const target = studioTargets?.[modelName] || modelName;
  const { provider, model } = splitModel(target);
  const pricing = getPricingForModel(provider, model);
  if (!pricing) return null;
  const cost = calculateCostFromTokens(usage, pricing);
  return Number.isFinite(cost) ? cost : null;
}

export const EMPTY_PRD_FORM = {
  product: "",
  users: "",
  problem: "",
  stack: "",
  timeline: "",
  team: "",
  constraints: "",
  nonGoals: "",
  metrics: "",
  notes: "",
};

// Module-level controllers and timer handles so background streams survive page transitions
let prdAbortController = null;
let prdTimer = null;
let taskAbortController = null;

export const usePrdStore = create((set, get) => ({
  // Inputs
  form: { ...EMPTY_PRD_FORM },
  brief: "",
  template: "product",
  depth: "deep",
  language: "en",
  maxTokens: "",
  includeAppendix: true,
  qualityPass: true,
  sectionsOn: resolveSections("product").map((s) => s.id),
  showDetails: false,

  // Models & Gateway context
  model: "",
  reviewerModel: "",
  activeProviders: [],
  modelAliases: {},
  studioTargets: {},
  activeApiKey: "",

  // Output & Generation state
  markdown: "",
  critique: "",
  stage: "idle", // "idle" | "drafting" | "reviewing" | "done" | "error"
  error: "",
  errorDetail: "",
  usage: null,
  cost: null,
  elapsed: 0,
  view: "preview", // "preview" | "markdown"
  savedId: "",
  saving: false,
  docs: [],
  showPrompt: false,

  // Task list extraction state
  showTasks: false,
  taskSource: "plan", // "plan" | "model"
  taskModelText: "",
  taskStage: "idle", // "idle" | "running" | "done" | "error"
  taskError: "",

  // Field setters
  setFormField: (key, value) =>
    set((s) => ({ form: { ...s.form, [key]: value } })),
  setForm: (formOrUpdater) =>
    set((s) => ({
      form: typeof formOrUpdater === "function" ? formOrUpdater(s.form) : { ...s.form, ...formOrUpdater },
    })),
  setBrief: (brief) => set({ brief }),
  setTemplate: (template) =>
    set({
      template,
      sectionsOn: resolveSections(template).map((s) => s.id),
    }),
  setDepth: (depth) => set({ depth }),
  setLanguage: (language) => set({ language }),
  setMaxTokens: (maxTokens) => set({ maxTokens }),
  setIncludeAppendix: (includeAppendix) => set({ includeAppendix }),
  setQualityPass: (qualityPass) => set({ qualityPass }),
  setSectionsOn: (sectionsOnOrUpdater) =>
    set((s) => ({
      sectionsOn:
        typeof sectionsOnOrUpdater === "function"
          ? sectionsOnOrUpdater(s.sectionsOn)
          : sectionsOnOrUpdater,
    })),
  setShowDetails: (showDetailsOrUpdater) =>
    set((s) => ({
      showDetails:
        typeof showDetailsOrUpdater === "function"
          ? showDetailsOrUpdater(s.showDetails)
          : showDetailsOrUpdater,
    })),
  setModel: (model) => set({ model }),
  setReviewerModel: (reviewerModel) => set({ reviewerModel }),
  setView: (view) => set({ view }),
  setMarkdown: (markdown) => set({ markdown }),
  setShowPrompt: (showPrompt) => set({ showPrompt }),
  setShowTasks: (showTasks) => set({ showTasks }),
  setTaskSource: (taskSource) => set({ taskSource }),
  setTaskModelText: (taskModelText) => set({ taskModelText }),
  setTaskStage: (taskStage) => set({ taskStage }),
  setTaskError: (taskError) => set({ taskError }),
  setSavedId: (savedId) => set({ savedId }),
  setSaving: (saving) => set({ saving }),
  setError: (error) => set({ error }),
  setErrorDetail: (errorDetail) => set({ errorDetail }),

  loadInputs: async () => {
    try {
      const [providersRes, aliasesRes, studioRes, keysRes, docsRes] = await Promise.all([
        fetch("/api/providers").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
        fetch("/api/models/alias").then((r) => (r.ok ? r.json() : { aliases: {} })).catch(() => ({ aliases: {} })),
        fetch("/api/model-editor").then((r) => (r.ok ? r.json() : { models: [] })).catch(() => ({ models: [] })),
        fetch("/api/keys").then((r) => (r.ok ? r.json() : { keys: [] })).catch(() => ({ keys: [] })),
        fetch("/api/prd").then((r) => (r.ok ? r.json() : { docs: [] })).catch(() => ({ docs: [] })),
      ]);
      const map = {};
      for (const studio of studioRes.models || []) map[studio.callName] = studio.targetModel;
      const firstActive = (keysRes.keys || []).find((k) => k.isActive !== false);
      set({
        activeProviders: providersRes.connections || [],
        modelAliases: aliasesRes.aliases || {},
        studioTargets: map,
        activeApiKey: firstActive?.key || get().activeApiKey || "",
        docs: docsRes.docs || [],
      });
    } catch (err) {
      console.error("Error loading PRD inputs in store:", err);
    }
  },

  loadDocs: async () => {
    try {
      const res = await fetch("/api/prd");
      if (res.ok) set({ docs: (await res.json()).docs || [] });
    } catch {}
  },

  openDoc: async (id) => {
    try {
      const res = await fetch(`/api/prd?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const { doc } = await res.json();
      if (!doc) return;
      set((s) => ({
        markdown: doc.markdown || "",
        savedId: doc.id,
        stage: "done",
        error: "",
        errorDetail: "",
        critique: "",
        taskModelText: "",
        taskStage: "idle",
        taskError: "",
        usage: null,
        cost: null,
        view: "preview",
        model: doc.model || s.model,
        template: PRD_TEMPLATES.some((t) => t.value === doc.template) ? doc.template : s.template,
        depth: PRD_DEPTHS.some((d) => d.value === doc.depth) ? doc.depth : s.depth,
        language: PRD_LANGUAGES.some((l) => l.value === doc.language) ? doc.language : s.language,
      }));
    } catch {}
  },

  deleteDoc: async (id) => {
    try {
      await fetch(`/api/prd?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (id === get().savedId) set({ savedId: "" });
      get().loadDocs();
    } catch {}
  },

  saveDoc: async (docTitle, activeSections) => {
    const { markdown, savedId, form, brief, model, qualityPass, reviewerModel, template, depth, language, usage } = get();
    if (!markdown.trim()) return false;
    set({ saving: true, error: "" });
    try {
      const res = await fetch("/api/prd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savedId || undefined,
          title: docTitle,
          brief: [form.product, form.problem, brief].filter(Boolean).join("\n").slice(0, 6000),
          markdown,
          model,
          reviewerModel: qualityPass ? reviewerModel || model : "",
          template,
          depth,
          language,
          sections: activeSections.map((s) => s.heading),
          tokensIn: usage?.prompt_tokens || usage?.input_tokens || 0,
          tokensOut: usage?.completion_tokens || usage?.output_tokens || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        set({ error: data.error || "Failed to save PRD", saving: false });
        return false;
      }
      set({ savedId: data.doc?.id || "", saving: false });
      get().loadDocs();
      return true;
    } catch (err) {
      set({ error: err?.message || "Failed to save PRD", saving: false });
      return false;
    }
  },

  generatePrd: async () => {
    const state = get();
    const {
      model,
      brief,
      form,
      template,
      depth,
      language,
      sectionsOn,
      includeAppendix,
      qualityPass,
      reviewerModel,
      studioTargets,
      stage,
    } = state;

    const canGen = !!model && (!!brief.trim() || !!form.product.trim()) && stage !== "drafting" && stage !== "reviewing";
    if (!canGen) return;

    if (prdAbortController) {
      prdAbortController.abort();
    }
    const controller = new AbortController();
    prdAbortController = controller;

    if (prdTimer) {
      clearInterval(prdTimer);
      prdTimer = null;
    }

    const docTitle = form.product.trim() || brief.trim().split("\n")[0].slice(0, 70) || "PRD Document";
    const taskId = "prd-generation";

    set({
      error: "",
      errorDetail: "",
      critique: "",
      usage: null,
      cost: null,
      savedId: "",
      elapsed: 0,
      markdown: "",
      taskModelText: "",
      taskStage: "idle",
      taskError: "",
      view: "markdown",
      stage: "drafting",
    });

    const startTime = Date.now();
    prdTimer = setInterval(() => {
      set({ elapsed: Date.now() - startTime });
    }, 500);

    // Register with taskStore for top bell notification and background tracking
    useTaskStore.getState().start({
      id: taskId,
      title: `Generating PRD: ${docTitle}`,
      message: "Drafting initial specification...",
      progress: 5,
      href: "/dashboard/prd",
      onCancel: () => {
        get().stopGeneration();
      },
    });

    try {
      // Ensure API key is available
      let apiKey = get().activeApiKey;
      if (!apiKey) {
        try {
          const keysRes = await fetch("/api/keys").then((r) => (r.ok ? r.json() : { keys: [] })).catch(() => ({ keys: [] }));
          const firstActive = (keysRes.keys || []).find((k) => k.isActive !== false);
          if (firstActive?.key) {
            apiKey = firstActive.key;
            set({ activeApiKey: apiKey });
          }
        } catch {}
      }

      const messages = buildPrdMessages({
        brief,
        fields: form,
        template,
        depth,
        language,
        sections: sectionsOn,
        includeAppendix,
      });

      let draftText = "";
      const draft = await streamChatCompletion({
        model,
        messages,
        apiKey,
        signal: controller.signal,
        maxTokens: state.maxTokens,
        onDelta: (chunk) => {
          draftText += chunk;
          set({ markdown: draftText });
          const len = draftText.length;
          const pct = Math.min(50, 5 + Math.floor(len / 100));
          useTaskStore.getState().update(taskId, {
            progress: pct,
            message: `Drafting PRD (${len} chars)...`,
          });
        },
      });

      if (draft.kind === "empty") {
        throw new Error(describeEmptyResponse({ finishReason: draft.finishReason, usage: draft.usage }));
      }

      let finalText = draft.kind === "thinking" ? draft.thinking : draft.text;
      let finalUsage = draft.usage;

      if (qualityPass && !controller.signal.aborted) {
        set({ stage: "reviewing", markdown: "" });
        draftText = "";
        useTaskStore.getState().update(taskId, {
          progress: 55,
          message: "Auditing & reviewing PRD quality...",
        });

        const activeSecs = resolveSections(template).filter((s) => sectionsOn.includes(s.id));
        const audit = auditSections(finalText, activeSecs);
        const review = await streamChatCompletion({
          model: reviewerModel || model,
          messages: buildReviewMessages({
            draft: finalText,
            template,
            language,
            missing: audit.missing,
          }),
          apiKey,
          signal: controller.signal,
          maxTokens: state.maxTokens,
          onDelta: (chunk) => {
            draftText += chunk;
            set({ markdown: draftText });
            const len = draftText.length;
            const pct = Math.min(95, 55 + Math.floor(len / 80));
            useTaskStore.getState().update(taskId, {
              progress: pct,
              message: `Polishing & reviewing PRD (${len} chars)...`,
            });
          },
        });

        if (review.kind === "empty") {
          throw new Error(describeEmptyResponse({ finishReason: review.finishReason, usage: review.usage }));
        }

        const reviewText = review.kind === "thinking" ? review.thinking : review.text;
        const parsed = splitReviewOutput(reviewText);
        if (parsed.markdown) {
          finalText = parsed.markdown;
          set({ markdown: parsed.markdown });
        } else {
          set({ critique: reviewText, markdown: finalText });
        }
        if (parsed.critique) set({ critique: parsed.critique });
        finalUsage = review.usage || draft.usage;
      }

      if (!finalText.trim()) {
        const emptyMsg = describeEmptyResponse({ usage: finalUsage });
        set({ error: emptyMsg, stage: "error" });
        useTaskStore.getState().update(taskId, {
          message: `Generation error: ${emptyMsg}`,
        });
        useTaskStore.getState().finish(taskId);
        return;
      }

      const cost = estimateCost(model, finalUsage, studioTargets);
      set({
        markdown: finalText,
        usage: finalUsage || null,
        cost,
        view: "preview",
        stage: "done",
      });

      useTaskStore.getState().update(taskId, {
        progress: 100,
        message: `PRD generated successfully (${docTitle})`,
      });
      useTaskStore.getState().finish(taskId);
    } catch (err) {
      if (err?.name === "AbortError") {
        const cur = get().markdown;
        set({ stage: cur ? "done" : "idle" });
        useTaskStore.getState().dismiss(taskId);
      } else {
        const msg = err?.message || "Generation failed";
        set({
          error: msg,
          errorDetail: err?.detail || "",
          stage: "error",
        });
        useTaskStore.getState().update(taskId, {
          message: `Failed: ${msg}`,
        });
        useTaskStore.getState().finish(taskId);
      }
    } finally {
      prdAbortController = null;
      if (prdTimer) {
        clearInterval(prdTimer);
        prdTimer = null;
      }
    }
  },

  stopGeneration: () => {
    if (prdAbortController) {
      prdAbortController.abort();
      prdAbortController = null;
    }
    if (prdTimer) {
      clearInterval(prdTimer);
      prdTimer = null;
    }
    const cur = get().markdown;
    set({ stage: cur ? "done" : "idle" });
    useTaskStore.getState().dismiss("prd-generation");
  },

  askModelTasks: async () => {
    const { model, markdown, taskStage, activeApiKey } = get();
    if (!model || !markdown.trim() || taskStage === "running") return;

    if (taskAbortController) taskAbortController.abort();
    const controller = new AbortController();
    taskAbortController = controller;

    set({
      taskModelText: "",
      taskError: "",
      taskStage: "running",
    });

    const taskId = "prd-tasks";
    useTaskStore.getState().start({
      id: taskId,
      title: "Extracting PRD Tasks",
      message: "Analyzing PRD structure...",
      progress: 15,
      href: "/dashboard/prd",
      onCancel: () => get().stopTaskModel(),
    });

    try {
      let apiKey = activeApiKey;
      if (!apiKey) {
        try {
          const keysRes = await fetch("/api/keys").then((r) => (r.ok ? r.json() : { keys: [] })).catch(() => ({ keys: [] }));
          const firstActive = (keysRes.keys || []).find((k) => k.isActive !== false);
          if (firstActive?.key) {
            apiKey = firstActive.key;
            set({ activeApiKey: apiKey });
          }
        } catch {}
      }

      let taskText = "";
      const answer = await streamChatCompletion({
        model,
        messages: buildPlanExtractionMessages(markdown),
        apiKey,
        signal: controller.signal,
        onDelta: (chunk) => {
          taskText += chunk;
          set({ taskModelText: taskText });
          const pct = Math.min(90, 15 + Math.floor(taskText.length / 50));
          useTaskStore.getState().update(taskId, {
            progress: pct,
            message: `Extracting tasks (${taskText.length} chars)...`,
          });
        },
      });

      const text = cleanModelChecklist(answer?.text || taskText);
      set({
        taskModelText: text,
        taskStage: text.trim() ? "done" : "error",
        taskError: text.trim() ? "" : "The model answered with nothing usable, so ask it again.",
      });

      useTaskStore.getState().update(taskId, {
        progress: 100,
        message: text.trim() ? "Tasks extracted successfully" : "Task extraction yielded empty response",
      });
      useTaskStore.getState().finish(taskId);
    } catch (err) {
      if (err?.name === "AbortError") {
        const partial = cleanModelChecklist(get().taskModelText);
        set({
          taskModelText: partial,
          taskStage: partial.trim() ? "done" : "idle",
        });
        useTaskStore.getState().dismiss(taskId);
      } else {
        const msg = err?.message || "The task list request failed.";
        set({
          taskError: msg,
          taskStage: "error",
        });
        useTaskStore.getState().update(taskId, {
          message: `Task extraction error: ${msg}`,
        });
        useTaskStore.getState().finish(taskId);
      }
    } finally {
      if (taskAbortController === controller) taskAbortController = null;
    }
  },

  stopTaskModel: () => {
    if (taskAbortController) {
      taskAbortController.abort();
      taskAbortController = null;
    }
    const partial = cleanModelChecklist(get().taskModelText);
    set({
      taskModelText: partial,
      taskStage: partial.trim() ? "done" : "idle",
    });
    useTaskStore.getState().dismiss("prd-tasks");
  },
}));

export default usePrdStore;

"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button, PageShell } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

function getStatusBadge(code) {
  const num = Number(code) || 500;
  if (num >= 500) {
    return {
      bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      label: `${num} Server Error`,
    };
  }
  if (num === 429) {
    return {
      bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      label: "429 Rate Limit",
    };
  }
  if (num === 401 || num === 403) {
    return {
      bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      label: num === 403 ? "403 Forbidden" : "401 Unauthorized",
    };
  }
  return {
    bg: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
    label: `${num} Error`,
  };
}

function colorConsoleLine(line, index) {
  let textColor = "text-text-main";
  let bgClass = "";
  if (line.includes("[ERROR]") || line.includes("✗") || line.includes("Error:") || line.includes("FAILED")) {
    textColor = "text-rose-400";
    bgClass = "bg-rose-500/5";
  } else if (line.includes("[WARN]") || line.includes("⚠️")) {
    textColor = "text-amber-400";
    bgClass = "bg-amber-500/5";
  } else if (line.includes("[INFO]") || line.includes("▶") || line.includes("ℹ️")) {
    textColor = "text-sky-400";
  } else if (line.includes("[DEBUG]") || line.includes("🐛")) {
    textColor = "text-text-muted";
  } else if (line.includes("✓") || line.includes("done") || line.includes("SUCCESS")) {
    textColor = "text-emerald-400";
    bgClass = "bg-emerald-500/5";
  }

  return (
    <div className={`flex items-start gap-2.5 px-2 py-0.5 hover:bg-white/5 rounded font-mono text-xs leading-relaxed ${bgClass}`}>
      <span className="text-zinc-500 select-none shrink-0 w-8 text-right text-[11px] pt-0.5">
        {index + 1}
      </span>
      <span className={`flex-1 break-all whitespace-pre-wrap ${textColor}`}>
        {line}
      </span>
    </div>
  );
}

export default function LogsClient({ initialTab = "errors" }) {
  const searchParams = useSearchParams();
  const queryTab = searchParams?.get("tab");
  const [activeTab, setActiveTab] = useState(queryTab || initialTab);

  /* --- Console Stream State --- */
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [consoleConnected, setConsoleConnected] = useState(false);
  const [consoleFilter, setConsoleFilter] = useState("");
  const [consoleLevel, setConsoleLevel] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [consoleCopied, setConsoleCopied] = useState(false);
  const consoleRef = useRef(null);

  /* --- Error Records State --- */
  const [errorLogs, setErrorLogs] = useState([]);
  const [errorsLoading, setErrorsLoading] = useState(true);
  const [errorSearch, setErrorSearch] = useState("");
  const [errorStatusFilter, setErrorStatusFilter] = useState("all");
  const [expandedErrorIds, setExpandedErrorIds] = useState(new Set());
  const [errorCopiedId, setErrorCopiedId] = useState(null);

  /* Connect to SSE Console Stream */
  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");
    es.onopen = () => setConsoleConnected(true);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "init") {
          setConsoleLogs(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
        } else if (msg.type === "line") {
          setConsoleLogs((prev) => {
            const next = [...prev, msg.line];
            return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
          });
        } else if (msg.type === "lines") {
          setConsoleLogs((prev) => {
            const next = [...prev, ...msg.lines];
            return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
          });
        } else if (msg.type === "clear") {
          setConsoleLogs([]);
        }
      } catch {
        /* fail open */
      }
    };
    es.onerror = () => setConsoleConnected(false);
    return () => es.close();
  }, []);

  /* Auto-scroll console */
  useEffect(() => {
    if (!autoScroll || !consoleRef.current || activeTab !== "console") return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [consoleLogs, autoScroll, activeTab]);

  /* Fetch Error Logs */
  const fetchErrorLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/error-logs", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setErrorLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to load error logs:", err);
    } finally {
      setErrorsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchErrorLogs();
    const interval = setInterval(fetchErrorLogs, 6000);
    return () => clearInterval(interval);
  }, [fetchErrorLogs]);

  /* Console Actions */
  const handleClearConsole = async () => {
    if (!window.confirm("Clear all console stream logs?")) return;
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      setConsoleLogs([]);
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  const handleCopyConsole = () => {
    const text = filteredConsoleLogs.join("\n");
    navigator.clipboard.writeText(text);
    setConsoleCopied(true);
    setTimeout(() => setConsoleCopied(false), 2000);
  };

  /* Error Actions */
  const handleClearErrors = async () => {
    if (!window.confirm("Clear all recorded error entries?")) return;
    try {
      const res = await fetch("/api/error-logs", { method: "DELETE" });
      if (res.ok) setErrorLogs([]);
    } catch (err) {
      console.error("Failed to clear error logs:", err);
    }
  };

  const copyErrorText = (text, id) => {
    navigator.clipboard.writeText(text);
    setErrorCopiedId(id);
    setTimeout(() => setErrorCopiedId(null), 2000);
  };

  const handleCopyAllErrors = () => {
    const formatted = filteredErrorLogs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.statusCode}] ${l.provider || "gateway"}/${l.model || "none"}: ${l.errorMessage}${
            l.stack ? `\n\nStack:\n${l.stack}` : ""
          }`
      )
      .join("\n\n---\n\n");
    copyErrorText(formatted, "all-errors");
  };

  const toggleErrorExpand = (id) => {
    setExpandedErrorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* Filtered Console Logs */
  const filteredConsoleLogs = useMemo(() => {
    return consoleLogs.filter((line) => {
      if (consoleLevel === "error" && !(line.includes("[ERROR]") || line.includes("✗") || line.includes("Error:") || line.includes("FAILED"))) {
        return false;
      }
      if (consoleLevel === "warn" && !(line.includes("[WARN]") || line.includes("⚠️"))) {
        return false;
      }
      if (consoleLevel === "info" && !(line.includes("[INFO]") || line.includes("▶") || line.includes("ℹ️"))) {
        return false;
      }
      if (consoleFilter && !line.toLowerCase().includes(consoleFilter.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [consoleLogs, consoleFilter, consoleLevel]);

  /* Error Metrics */
  const errorMetrics = useMemo(() => {
    let server5xx = 0;
    let rate429 = 0;
    let auth4xx = 0;
    for (const l of errorLogs) {
      const c = Number(l.statusCode) || 500;
      if (c >= 500) server5xx++;
      else if (c === 429) rate429++;
      else if (c === 401 || c === 403) auth4xx++;
    }
    return {
      total: errorLogs.length,
      server5xx,
      rate429,
      auth4xx,
    };
  }, [errorLogs]);

  /* Filtered Error Logs */
  const filteredErrorLogs = useMemo(() => {
    return errorLogs.filter((l) => {
      const code = Number(l.statusCode) || 500;
      if (errorStatusFilter === "5xx" && code < 500) return false;
      if (errorStatusFilter === "429" && code !== 429) return false;
      if (errorStatusFilter === "auth" && code !== 401 && code !== 403) return false;

      if (!errorSearch) return true;
      const term = errorSearch.toLowerCase();
      return (
        (l.errorMessage || "").toLowerCase().includes(term) ||
        (l.provider || "").toLowerCase().includes(term) ||
        (l.model || "").toLowerCase().includes(term) ||
        String(l.statusCode || "").includes(term)
      );
    });
  }, [errorLogs, errorSearch, errorStatusFilter]);

  return (
    <PageShell width="full" className="min-w-0">
      <div className="flex flex-col gap-3 max-w-5xl">
        {/* Main Header & Dual Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h1 className="text-lg font-semibold text-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-text-muted">receipt_long</span>
              Error &amp; Console Logs
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Live stdout stream and captured exception records in one diagnostic console.
            </p>
          </div>

          {/* Clean Segmented Tab Switcher (No AI pill-slop) */}
          <div className="inline-flex items-center p-0.5 rounded-lg border border-border bg-surface-2/60 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab("errors")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "errors"
                  ? "bg-surface text-text-main shadow-sm border border-border/80"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">bug_report</span>
              <span>Error Records</span>
              <span className="ml-1 text-[11px] font-mono opacity-80">
                ({errorLogs.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("console")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "console"
                  ? "bg-surface text-text-main shadow-sm border border-border/80"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">terminal</span>
              <span>Live Console</span>
              <span
                className={`size-1.5 rounded-full ml-1 ${
                  consoleConnected ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
            </button>
          </div>
        </div>

        {/* TAB 1: ERROR RECORDS */}
        {activeTab === "errors" && (
          <div className="flex flex-col gap-3">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-lg border border-border bg-surface">
                <span className="text-[11px] text-text-muted block">Total Records</span>
                <span className="text-base font-semibold text-text-main font-mono">{errorMetrics.total}</span>
              </div>
              <div className="p-2.5 rounded-lg border border-border bg-surface">
                <span className="text-[11px] text-rose-500 block">5xx Server</span>
                <span className="text-base font-semibold text-rose-500 font-mono">{errorMetrics.server5xx}</span>
              </div>
              <div className="p-2.5 rounded-lg border border-border bg-surface">
                <span className="text-[11px] text-amber-500 block">429 Rate Limits</span>
                <span className="text-base font-semibold text-amber-500 font-mono">{errorMetrics.rate429}</span>
              </div>
              <div className="p-2.5 rounded-lg border border-border bg-surface">
                <span className="text-[11px] text-purple-500 block">401/403 Auth</span>
                <span className="text-base font-semibold text-purple-500 font-mono">{errorMetrics.auth4xx}</span>
              </div>
            </div>

            {/* Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <span className="material-symbols-outlined text-[16px] text-text-muted">search</span>
                <input
                  type="text"
                  placeholder="Filter error message, model, or status..."
                  value={errorSearch}
                  onChange={(e) => setErrorSearch(e.target.value)}
                  className="w-full bg-transparent text-xs text-text-main placeholder-text-muted/60 focus:outline-none"
                />
                {errorSearch && (
                  <button onClick={() => setErrorSearch("")} className="text-text-muted hover:text-text-main text-xs">
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-xs">
                {[
                  { id: "all", label: `All (${errorLogs.length})` },
                  { id: "5xx", label: `5xx (${errorMetrics.server5xx})` },
                  { id: "429", label: `429 (${errorMetrics.rate429})` },
                  { id: "auth", label: `Auth (${errorMetrics.auth4xx})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setErrorStatusFilter(f.id)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      errorStatusFilter === f.id
                        ? "bg-text-main text-bg font-medium"
                        : "text-text-muted hover:text-text-main hover:bg-surface-2"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}

                {errorLogs.length > 0 && (
                  <>
                    <div className="h-4 w-px bg-border mx-1" />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyAllErrors}
                    >
                      {errorCopiedId === "all-errors" ? "Copied" : "Copy All"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={handleClearErrors}
                    >
                      Clear
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" icon="refresh" onClick={fetchErrorLogs} />
              </div>
            </div>

            {/* List of Error Items */}
            <div className="rounded-lg border border-border bg-surface divide-y divide-border/60 max-h-[calc(100dvh-310px)] overflow-y-auto">
              {errorsLoading ? (
                <div className="py-12 text-center text-xs text-text-muted">Loading recorded errors...</div>
              ) : filteredErrorLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-text-muted">
                  <span className="material-symbols-outlined text-2xl text-emerald-500 mb-1 block">check_circle</span>
                  {errorLogs.length === 0 ? "No error records logged. System operating normally." : "No records match search criteria."}
                </div>
              ) : (
                filteredErrorLogs.map((log) => {
                  const badge = getStatusBadge(log.statusCode);
                  const isExpanded = expandedErrorIds.has(log.id);

                  return (
                    <div key={log.id} className="p-3 text-xs transition-colors hover:bg-surface-2/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono border font-medium ${badge.bg}`}>
                            {badge.label}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted font-mono">
                              <span>{log.timestamp}</span>
                              {(log.provider || log.model) && (
                                <span className="text-text-main font-semibold">
                                  {log.provider ? `${log.provider}/` : ""}{log.model || ""}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-sm text-text-main font-medium break-words leading-relaxed">
                              {log.errorMessage}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => copyErrorText(
                              `[${log.timestamp}] [${log.statusCode}] ${log.provider}/${log.model}: ${log.errorMessage}${
                                log.stack ? `\n\nStack:\n${log.stack}` : ""
                              }`,
                              log.id
                            )}
                            className="p-1 rounded text-text-muted hover:text-text-main transition-colors"
                            title="Copy error"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {errorCopiedId === log.id ? "check" : "content_copy"}
                            </span>
                          </button>

                          {log.stack && (
                            <button
                              type="button"
                              onClick={() => toggleErrorExpand(log.id)}
                              className="p-1 rounded text-text-muted hover:text-text-main transition-colors"
                              title={isExpanded ? "Hide stack" : "View stack"}
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                {isExpanded ? "expand_less" : "expand_more"}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && log.stack && (
                        <div className="mt-2.5 p-2.5 rounded bg-zinc-950 text-zinc-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap border border-border">
                          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-sans">
                            Stack Trace:
                          </div>
                          {log.stack}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: LIVE CONSOLE STREAM */}
        {activeTab === "console" && (
          <div className="flex flex-col gap-2">
            {/* Console Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-surface text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <span className="material-symbols-outlined text-[16px] text-text-muted">search</span>
                <input
                  type="text"
                  placeholder="Search live stream lines..."
                  value={consoleFilter}
                  onChange={(e) => setConsoleFilter(e.target.value)}
                  className="w-full bg-transparent text-text-main placeholder-text-muted/60 focus:outline-none font-mono"
                />
                {consoleFilter && (
                  <button onClick={() => setConsoleFilter("")} className="text-text-muted hover:text-text-main">
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 font-mono text-[11px]">
                {[
                  { id: "all", label: "ALL" },
                  { id: "error", label: "ERR" },
                  { id: "warn", label: "WARN" },
                  { id: "info", label: "INFO" },
                ].map((lvl) => (
                  <button
                    key={lvl.id}
                    onClick={() => setConsoleLevel(lvl.id)}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      consoleLevel === lvl.id
                        ? "bg-text-main text-bg font-semibold"
                        : "text-text-muted hover:text-text-main hover:bg-surface-2"
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}

                <div className="h-4 w-px bg-border mx-1" />

                <button
                  type="button"
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    autoScroll
                      ? "border-text-main/40 text-text-main"
                      : "border-border text-text-muted"
                  }`}
                  title="Toggle autoscroll"
                >
                  {autoScroll ? "Scroll: ON" : "Scroll: PAUSED"}
                </button>

                {consoleLogs.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleCopyConsole}
                      className="px-2 py-0.5 rounded border border-border text-text-muted hover:text-text-main"
                    >
                      {consoleCopied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearConsole}
                      className="px-2 py-0.5 rounded border border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Console Terminal Output */}
            <div
              ref={consoleRef}
              className="p-3 font-mono text-xs rounded-lg h-[calc(100dvh-260px)] overflow-y-auto bg-zinc-950 text-zinc-300 border border-border select-text"
            >
              {filteredConsoleLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                  {consoleLogs.length === 0 ? "Connecting to output stream..." : "No console lines match filter."}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredConsoleLogs.map((line, i) => (
                    <div key={i}>{colorConsoleLine(line, i)}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

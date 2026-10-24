"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Button, Badge, SegmentedControl, PageShell } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

function colorConsoleLine(line, index) {
  let textColor = "text-zinc-200";
  let bgClass = "";
  if (line.includes("[ERROR]") || line.includes("✗") || line.includes("Error:") || line.includes("FAILED")) {
    textColor = "text-rose-400 font-medium";
    bgClass = "bg-rose-500/10";
  } else if (line.includes("[WARN]") || line.includes("⚠️")) {
    textColor = "text-amber-400 font-medium";
    bgClass = "bg-amber-500/10";
  } else if (line.includes("[INFO]") || line.includes("▶") || line.includes("ℹ️")) {
    textColor = "text-sky-400 font-medium";
  } else if (line.includes("[DEBUG]") || line.includes("🐛")) {
    textColor = "text-zinc-400";
  } else if (line.includes("[DB]") || line.includes("[SYS]") || line.includes("[ROUTER]")) {
    textColor = "text-purple-300 font-medium";
  } else if (line.includes("✓") || line.includes("done") || line.includes("SUCCESS")) {
    textColor = "text-emerald-400 font-medium";
    bgClass = "bg-emerald-500/10";
  }

  return (
    <div className={`flex items-start hover:bg-white/5 py-0.5 rounded-[var(--r-chip)] transition-colors ${bgClass}`}>
      <span className="text-zinc-500 select-none shrink-0 w-10 text-right text-[11px] font-mono pr-2.5 border-r border-white/10 pt-0.5">
        {index + 1}
      </span>
      <span className={`pl-2.5 flex-1 font-mono text-xs whitespace-pre overflow-x-auto select-text ${textColor}`}>
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
      <div className="flex flex-col gap-5 max-w-5xl">
        {/* Main Header & Dual Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <h1 className="text-xl font-bold text-text-main flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[24px] text-primary">receipt_long</span>
              Error &amp; Console Logs
            </h1>
            <p className="text-xs text-text-muted mt-1">
              Live stdout stream and captured exception records in one diagnostic console.
            </p>
          </div>

          {/* Theme-Synchronized Segmented Control */}
          <SegmentedControl
            options={[
              { value: "errors", label: `Error Records (${errorLogs.length})`, icon: "bug_report" },
              { value: "console", label: "Live Console", icon: "terminal" },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            className="self-start sm:self-auto"
          />
        </div>

        {/* TAB 1: ERROR RECORDS */}
        {activeTab === "errors" && (
          <div className="flex flex-col gap-4">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card padding="xs" className="flex flex-col">
                <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider">Total Records</span>
                <span className="text-xl font-bold text-text-main font-mono mt-0.5">{errorMetrics.total}</span>
              </Card>
              <Card padding="xs" className="flex flex-col">
                <span className="text-[11px] text-danger font-medium uppercase tracking-wider">5xx Server</span>
                <span className="text-xl font-bold text-danger font-mono mt-0.5">{errorMetrics.server5xx}</span>
              </Card>
              <Card padding="xs" className="flex flex-col">
                <span className="text-[11px] text-warning font-medium uppercase tracking-wider">429 Rate Limits</span>
                <span className="text-xl font-bold text-warning font-mono mt-0.5">{errorMetrics.rate429}</span>
              </Card>
              <Card padding="xs" className="flex flex-col">
                <span className="text-[11px] text-primary font-medium uppercase tracking-wider">401/403 Auth</span>
                <span className="text-xl font-bold text-primary font-mono mt-0.5">{errorMetrics.auth4xx}</span>
              </Card>
            </div>

            {/* Controls Bar */}
            <Card padding="xs" className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <span className="material-symbols-outlined text-[18px] text-text-muted">search</span>
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

              <div className="flex items-center gap-2 shrink-0">
                <SegmentedControl
                  size="sm"
                  options={[
                    { value: "all", label: `All (${errorLogs.length})` },
                    { value: "5xx", label: `5xx (${errorMetrics.server5xx})` },
                    { value: "429", label: `429 (${errorMetrics.rate429})` },
                    { value: "auth", label: `Auth (${errorMetrics.auth4xx})` },
                  ]}
                  value={errorStatusFilter}
                  onChange={setErrorStatusFilter}
                />

                {errorLogs.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={errorCopiedId === "all-errors" ? "check" : "content_copy"}
                      onClick={handleCopyAllErrors}
                    >
                      {errorCopiedId === "all-errors" ? "Copied" : "Copy All"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon="delete"
                      onClick={handleClearErrors}
                    >
                      Clear
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" icon="refresh" onClick={fetchErrorLogs} title="Refresh records" />
              </div>
            </Card>

            {/* List of Error Items */}
            <Card padding="none" className="divide-y divide-border-subtle max-h-[calc(100dvh-320px)] overflow-y-auto">
              {errorsLoading ? (
                <div className="py-16 text-center text-xs text-text-muted">Loading recorded errors...</div>
              ) : filteredErrorLogs.length === 0 ? (
                <div className="py-16 text-center text-xs text-text-muted flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-3xl text-success">check_circle</span>
                  <span className="text-sm font-semibold text-text-main">
                    {errorLogs.length === 0 ? "No error records logged" : "No records match filter"}
                  </span>
                  <span className="text-text-muted">
                    {errorLogs.length === 0 ? "All systems and upstream providers operating normally." : "Try clearing your search query."}
                  </span>
                </div>
              ) : (
                filteredErrorLogs.map((log) => {
                  const code = Number(log.statusCode) || 500;
                  const badgeVariant = code >= 500 ? "error" : code === 429 ? "warning" : (code === 401 || code === 403) ? "primary" : "default";
                  const badgeLabel = code >= 500 ? `${code} Server` : code === 429 ? "429 Limit" : code === 403 ? "403 Forbidden" : code === 401 ? "401 Auth" : `${code}`;
                  const isExpanded = expandedErrorIds.has(log.id);

                  return (
                    <div key={log.id} className="p-4 text-xs transition-colors hover:bg-surface-2/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Badge variant={badgeVariant} size="sm" className="mt-0.5 shrink-0 font-mono">
                            {badgeLabel}
                          </Badge>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted font-mono">
                              <span>{log.timestamp}</span>
                              {(log.provider || log.model) && (
                                <span className="text-primary font-semibold bg-brand-500/10 px-1.5 py-0.5 rounded-[var(--r-chip)]">
                                  {log.provider ? `${log.provider}/` : ""}{log.model || ""}
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5 text-sm text-text-main font-medium break-words leading-relaxed">
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
                            className="p-1.5 rounded-[var(--r-chip)] text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors"
                            title="Copy error"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {errorCopiedId === log.id ? "check" : "content_copy"}
                            </span>
                          </button>

                          {log.stack && (
                            <button
                              type="button"
                              onClick={() => toggleErrorExpand(log.id)}
                              className="p-1.5 rounded-[var(--r-chip)] text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors"
                              title={isExpanded ? "Hide stack" : "View stack"}
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                {isExpanded ? "expand_less" : "expand_more"}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && log.stack && (
                        <div className="mt-3 p-3 rounded-[var(--r-control)] bg-black/85 text-zinc-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap border border-border-subtle">
                          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-sans font-semibold">
                            Stack Trace:
                          </div>
                          {log.stack}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </Card>
          </div>
        )}

        {/* TAB 2: LIVE CONSOLE STREAM */}
        {activeTab === "console" && (
          <div className="flex flex-col gap-4">
            {/* Console Toolbar */}
            <Card padding="sm" className="flex flex-col gap-3">
              {/* Row 1: Search and Log Levels */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--r-control)] bg-surface-2 border border-border-subtle flex-1 min-w-0">
                  <span className="material-symbols-outlined text-[18px] text-text-muted">search</span>
                  <input
                    type="text"
                    placeholder="Search console lines by keyword..."
                    value={consoleFilter}
                    onChange={(e) => setConsoleFilter(e.target.value)}
                    className="w-full bg-transparent text-xs text-text-main placeholder-text-muted/60 focus:outline-none font-mono"
                  />
                  {consoleFilter && (
                    <button
                      type="button"
                      onClick={() => setConsoleFilter("")}
                      className="text-text-muted hover:text-text-main text-xs p-0.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>

                <div className="shrink-0 self-start sm:self-auto">
                  <SegmentedControl
                    size="sm"
                    options={[
                      { value: "all", label: "ALL" },
                      { value: "error", label: "ERR" },
                      { value: "warn", label: "WARN" },
                      { value: "info", label: "INFO" },
                    ]}
                    value={consoleLevel}
                    onChange={setConsoleLevel}
                  />
                </div>
              </div>

              {/* Row 2: Status Indicator & Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border-subtle text-xs">
                <div className="flex items-center gap-2.5">
                  <Badge variant={consoleConnected ? "success" : "error"} dot size="sm">
                    {consoleConnected ? "Connected" : "Disconnected"}
                  </Badge>
                  <span className="text-text-muted font-mono text-[11px]">
                    {filteredConsoleLogs.length} of {consoleLogs.length} lines
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={autoScroll ? "primary" : "outline"}
                    onClick={() => setAutoScroll(!autoScroll)}
                    icon={autoScroll ? "vertical_align_bottom" : "pause"}
                  >
                    {autoScroll ? "Scroll: ON" : "Scroll: OFF"}
                  </Button>

                  {consoleLogs.length > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={consoleCopied ? "check" : "content_copy"}
                        onClick={handleCopyConsole}
                      >
                        {consoleCopied ? "Copied" : "Copy"}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        icon="delete"
                        onClick={handleClearConsole}
                      >
                        Clear
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>

            {/* Console Terminal Window */}
            <Card padding="none" className="overflow-hidden border border-border-subtle bg-black/90">
              {/* Window Header Bar */}
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/10 bg-white/5 text-[11px] font-mono text-zinc-400 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="size-2.5 rounded-full bg-rose-500/80 inline-block" />
                    <span className="size-2.5 rounded-full bg-amber-500/80 inline-block" />
                    <span className="size-2.5 rounded-full bg-emerald-500/80 inline-block" />
                  </div>
                  <span className="text-zinc-500">|</span>
                  <span className="text-zinc-300 font-medium">runtime-stdout.log</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-500 text-[10px]">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>active buffer</span>
                </div>
              </div>

              {/* Terminal Output */}
              <div
                ref={consoleRef}
                className="p-3 font-mono text-xs h-[calc(100dvh-320px)] overflow-y-auto text-zinc-200 select-text"
              >
                {filteredConsoleLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs gap-2">
                    <span className="material-symbols-outlined text-2xl">terminal</span>
                    <span>{consoleLogs.length === 0 ? "Connecting to output stream..." : "No console lines match active filter."}</span>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredConsoleLogs.map((line, i) => (
                      <div key={i}>{colorConsoleLine(line, i)}</div>
                    ))}
                    <div className="flex items-center gap-2 pt-3 text-[11px] text-zinc-500 font-mono select-none">
                      <span className="text-emerald-500 font-bold">❯</span>
                      <span>listening for runtime events...</span>
                      <span className="inline-block w-1.5 h-3 bg-emerald-500 animate-pulse" />
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  );
}

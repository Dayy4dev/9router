"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Button, Badge, SegmentedControl, PageShell } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

function getStatusBadge(code) {
  const num = Number(code) || 500;
  if (num >= 500) {
    return {
      variant: "error",
      label: `${num} Server Error`,
    };
  }
  if (num === 429) {
    return {
      variant: "warning",
      label: "429 Rate Limit",
    };
  }
  if (num === 401 || num === 403) {
    return {
      variant: "primary",
      label: num === 403 ? "403 Forbidden" : "401 Unauthorized",
    };
  }
  return {
    variant: "default",
    label: `${num} Error`,
  };
}

function renderConsoleLine(line, index) {
  let tagColor = "text-text-muted";
  let contentColor = "text-text-main";

  if (line.includes("[ERROR]") || line.includes("✗") || line.includes("Error:") || line.includes("FAILED")) {
    tagColor = "text-danger font-semibold";
    contentColor = "text-rose-300";
  } else if (line.includes("[WARN]") || line.includes("⚠️")) {
    tagColor = "text-warning font-semibold";
    contentColor = "text-amber-200";
  } else if (line.includes("[INFO]") || line.includes("▶") || line.includes("ℹ️")) {
    tagColor = "text-primary font-semibold";
    contentColor = "text-text-main";
  } else if (line.includes("[DB]") || line.includes("[SYS]")) {
    tagColor = "text-brand-400 font-semibold";
    contentColor = "text-text-main";
  } else if (line.includes("✓") || line.includes("done") || line.includes("SUCCESS")) {
    tagColor = "text-success font-semibold";
    contentColor = "text-emerald-300";
  }

  return (
    <div key={index} className="flex items-start gap-3 py-1 px-3 hover:bg-surface-2/50 transition-colors font-mono text-xs">
      <span className="text-text-muted/60 select-none shrink-0 w-8 text-right text-[11px] pt-0.5">
        {index + 1}
      </span>
      <span className={`flex-1 whitespace-pre overflow-x-auto select-text leading-relaxed ${contentColor}`}>
        <span className={tagColor}>{line}</span>
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

  /* Actions */
  const handleClearConsole = async () => {
    if (!window.confirm("Clear console output?")) return;
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

  const handleClearErrors = async () => {
    if (!window.confirm("Clear all recorded errors?")) return;
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

  /* Filtered Data */
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
      <div className="flex flex-col gap-4 max-w-5xl">
        {/* Header & Main Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <h1 className="text-xl font-bold text-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px] text-primary">receipt_long</span>
              Error &amp; Console Logs
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              System output and exception logs
            </p>
          </div>

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
          <div className="flex flex-col gap-3">
            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Card padding="xs" className="flex flex-col">
                <span className="text-[11px] text-text-muted uppercase font-medium tracking-wide">Total Errors</span>
                <span className="text-xl font-bold text-text-main font-mono mt-0.5">{errorMetrics.total}</span>
              </Card>
              <Card padding="xs" className="flex flex-col">
                <span className="text-[11px] text-danger uppercase font-medium tracking-wide">5xx Server</span>
                <span className="text-xl font-bold text-danger font-mono mt-0.5">{errorMetrics.server5xx}</span>
              </Card>
              <Card padding="xs" className="flex flex-col">
                <span className="text-[11px] text-warning uppercase font-medium tracking-wide">429 Rate Limits</span>
                <span className="text-xl font-bold text-warning font-mono mt-0.5">{errorMetrics.rate429}</span>
              </Card>
              <Card padding="xs" className="flex flex-col">
                <span className="text-[11px] text-primary uppercase font-medium tracking-wide">401/403 Auth</span>
                <span className="text-xl font-bold text-primary font-mono mt-0.5">{errorMetrics.auth4xx}</span>
              </Card>
            </div>

            {/* Standard 9Router Search & Filter Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 sm:max-w-sm">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
                  search
                </span>
                <input
                  type="text"
                  value={errorSearch}
                  onChange={(e) => setErrorSearch(e.target.value)}
                  placeholder="Filter by message, model, or status..."
                  className="w-full rounded-[10px] border border-border-subtle bg-surface-2 py-2 pl-9 pr-8 text-xs text-text-main placeholder-text-muted/60 transition-colors focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30 font-sans"
                />
                {errorSearch && (
                  <button
                    type="button"
                    onClick={() => setErrorSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5"
                  >
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                      {errorCopiedId === "all-errors" ? "Copied" : "Copy"}
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
                <Button size="sm" variant="ghost" icon="refresh" onClick={fetchErrorLogs} title="Refresh" />
              </div>
            </div>

            {/* Error List */}
            <Card padding="none" className="divide-y divide-border-subtle max-h-[calc(100dvh-320px)] overflow-y-auto">
              {errorsLoading ? (
                <div className="py-16 text-center text-xs text-text-muted">Loading recorded errors...</div>
              ) : filteredErrorLogs.length === 0 ? (
                <div className="py-16 text-center text-xs text-text-muted">
                  {errorLogs.length === 0 ? "No error records logged." : "No records match search."}
                </div>
              ) : (
                filteredErrorLogs.map((log) => {
                  const badgeInfo = getStatusBadge(log.statusCode);
                  const isExpanded = expandedErrorIds.has(log.id);

                  return (
                    <div key={log.id} className="p-3.5 text-xs transition-colors hover:bg-surface-2/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <Badge variant={badgeInfo.variant} size="sm" className="mt-0.5 shrink-0 font-mono">
                            {badgeInfo.label}
                          </Badge>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted font-mono">
                              <span>{log.timestamp}</span>
                              {(log.provider || log.model) && (
                                <span className="text-primary font-semibold">
                                  {log.provider ? `${log.provider}/` : ""}{log.model || ""}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-sm text-text-main font-medium break-words leading-relaxed font-sans">
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
                            <span className="material-symbols-outlined text-[16px]">
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
                              <span className="material-symbols-outlined text-[16px]">
                                {isExpanded ? "expand_less" : "expand_more"}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && log.stack && (
                        <div className="mt-2.5 p-3 rounded-[var(--r-control)] bg-surface-2 text-text-main font-mono text-[11px] overflow-x-auto whitespace-pre-wrap border border-border-subtle">
                          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-sans font-semibold">
                            Stack Trace
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
          <div className="flex flex-col gap-3">
            {/* Standard Search & Controls Row (Clean, Flat, Non-Slop) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              {/* Standard 9Router Search Input */}
              <div className="relative flex-1 sm:max-w-sm">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
                  search
                </span>
                <input
                  type="text"
                  value={consoleFilter}
                  onChange={(e) => setConsoleFilter(e.target.value)}
                  placeholder="Filter console output..."
                  className="w-full rounded-[10px] border border-border-subtle bg-surface-2 py-2 pl-9 pr-8 text-xs text-text-main placeholder-text-muted/60 transition-colors focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30 font-sans"
                />
                {consoleFilter && (
                  <button
                    type="button"
                    onClick={() => setConsoleFilter("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5"
                  >
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                )}
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={consoleConnected ? "success" : "error"} dot size="sm">
                  {consoleConnected ? "Live" : "Offline"}
                </Badge>

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

                <Button
                  size="sm"
                  variant={autoScroll ? "primary" : "outline"}
                  onClick={() => setAutoScroll(!autoScroll)}
                  icon={autoScroll ? "vertical_align_bottom" : "pause"}
                >
                  {autoScroll ? "Auto-scroll" : "Paused"}
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

            {/* Clean Log Output Panel (Real Dev Console, Zero Fake-Theatrics) */}
            <Card padding="none" className="overflow-hidden">
              <div
                ref={consoleRef}
                className="py-2 min-h-[360px] h-[calc(100dvh-290px)] overflow-y-auto bg-surface-2/30 select-text divide-y divide-border-subtle/30"
              >
                {filteredConsoleLogs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-text-muted text-xs py-16">
                    {consoleLogs.length === 0 ? "No console output yet." : "No lines match filter."}
                  </div>
                ) : (
                  filteredConsoleLogs.map((line, i) => renderConsoleLine(line, i))
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  );
}

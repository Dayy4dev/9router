"use client";

import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import Card from "@/shared/components/Card";

const COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6"];

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const truncate = (s, max = 22) => (s && s.length > max ? s.slice(0, max) + "…" : s || "");

export default function TopModelsChart({ byModel }) {
  const [viewMode, setViewMode] = useState("tokens");

  const chartData = useMemo(() => {
    if (!byModel) return [];
    return Object.values(byModel)
      .map((data) => ({
        name: truncate(data.rawModel || "Unknown"),
        tokens: (data.promptTokens || 0) + (data.completionTokens || 0),
        requests: data.requests || 0,
      }))
      .filter((d) => d[viewMode] > 0)
      .sort((a, b) => b[viewMode] - a[viewMode])
      .slice(0, 5);
  }, [byModel, viewMode]);

  const fmt = viewMode === "tokens" ? fmtTokens : String;
  const label = viewMode === "tokens" ? "Tokens" : "Requests";

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Top Models</span>
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-sidebar/60 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("tokens")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === "tokens" ? "bg-primary text-white shadow-2xs font-semibold" : "text-text-muted hover:text-text-main hover:bg-sidebar"}`}
          >
            Tokens
          </button>
          <button
            type="button"
            onClick={() => setViewMode("requests")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === "requests" ? "bg-primary text-white shadow-2xs font-semibold" : "text-text-muted hover:text-text-main hover:bg-sidebar"}`}
          >
            Requests
          </button>
        </div>
      </div>

      {!chartData.length ? (
        <div className="h-44 flex items-center justify-center text-text-muted text-sm">No model usage yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={210}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 30, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmt}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.8 }}
              tickLine={false}
              axisLine={false}
              width={90}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-surface, #1e1e24)",
                border: "1px solid var(--color-border, rgba(255,255,255,0.1))",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--color-text-main, #fff)",
              }}
              formatter={(value) => [fmt(value), label]}
            />
            <Bar dataKey={viewMode} radius={[0, 4, 4, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

TopModelsChart.propTypes = {
  byModel: PropTypes.object,
};

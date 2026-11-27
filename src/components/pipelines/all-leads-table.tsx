"use client";

// Every lead from every pipeline in one table (Decordec, RMC, Saze Home,
// …). The per-pipeline board stays the place to move deals between
// stages; this view is for scanning, searching and following up across
// brands without switching pipelines.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { Deal, Pipeline, PipelineStage } from "@/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

type LeadRow = Deal & { stage?: PipelineStage | null };

const ALL = "__all__";

export function followUpState(
  date: string | null | undefined,
  status: Deal["status"],
  today = new Date(),
): "overdue" | "today" | "upcoming" | null {
  if (!date || status === "won" || status === "lost") return null;
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (d < t) return "overdue";
  if (d.getTime() === t.getTime()) return "today";
  return "upcoming";
}

export function AllLeadsTable({
  pipelines,
  onOpenDeal,
}: {
  pipelines: Pipeline[];
  /** Opens the deal in its own pipeline (board + edit sheet). */
  onOpenDeal: (deal: Deal) => void;
}) {
  const t = useTranslations("AllLeads");
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineFilter, setPipelineFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await createClient()
        .from("deals")
        .select(
          "*, contact:contacts(*), stage:pipeline_stages(*), assignee:profiles!deals_assigned_to_fkey(*)",
        )
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (cancelled) return;
      if (error) console.error("Failed to load leads:", error.message);
      setRows((data ?? []) as LeadRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pipelineName = useMemo(
    () => new Map(pipelines.map((p) => [p.id, p.name])),
    [pipelines],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (pipelineFilter !== ALL && r.pipeline_id !== pipelineFilter) return false;
      if (statusFilter !== ALL && (r.status ?? "open") !== statusFilter) return false;
      if (!q) return true;
      return [r.title, r.contact?.name, r.contact?.phone, r.contact?.company]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, pipelineFilter, statusFilter, query]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if ((r.status ?? "open") !== "open") continue;
      m.set(r.pipeline_id, (m.get(r.pipeline_id) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Open leads per pipeline — click to filter. */}
      <div className="flex flex-wrap gap-2">
        {pipelines.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPipelineFilter(pipelineFilter === p.id ? ALL : p.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              pipelineFilter === p.id
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            <div className="font-medium text-foreground">{p.name}</div>
            <div className="text-xs text-muted-foreground">
              {t("openCount", { count: counts.get(p.id) ?? 0 })}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
            aria-label={t("searchPlaceholder")}
          />
        </div>
        <Select value={pipelineFilter} onValueChange={(v) => setPipelineFilter(String(v ?? ALL))}>
          <SelectTrigger className="w-48" aria-label={t("pipeline")}>
            <SelectValue>
              {pipelineFilter === ALL ? t("allPipelines") : pipelineName.get(pipelineFilter)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allPipelines")}</SelectItem>
            {pipelines.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(String(v ?? ALL))}>
          <SelectTrigger className="w-36" aria-label={t("status")}>
            <SelectValue>{t(`statuses.${statusFilter === ALL ? "all" : statusFilter}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t("statuses.open")}</SelectItem>
            <SelectItem value="won">{t("statuses.won")}</SelectItem>
            <SelectItem value="lost">{t("statuses.lost")}</SelectItem>
            <SelectItem value={ALL}>{t("statuses.all")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {t("showing", { count: filtered.length })}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t("lead")}</th>
              <th className="px-3 py-2">{t("pipeline")}</th>
              <th className="px-3 py-2">{t("stage")}</th>
              <th className="px-3 py-2 text-right">{t("value")}</th>
              <th className="px-3 py-2">{t("followUp")}</th>
              <th className="px-3 py-2">{t("owner")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  {t("loading")}
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((r) => {
                const fu = followUpState(r.expected_close_date, r.status);
                return (
                  <tr
                    key={r.id}
                    onClick={() => onOpenDeal(r)}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{r.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {[r.contact?.name, r.contact?.phone].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{pipelineName.get(r.pipeline_id) ?? "—"}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {r.stage ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: r.stage.color }}
                          />
                          {r.stage.name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.value
                        ? `${r.currency ?? ""} ${Number(r.value).toLocaleString()}`.trim()
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.expected_close_date ? (
                        <span
                          className={
                            fu === "overdue"
                              ? "font-medium text-red-500"
                              : fu === "today"
                                ? "font-medium text-amber-500"
                                : "text-muted-foreground"
                          }
                        >
                          {r.expected_close_date.slice(0, 10)}
                          {fu === "overdue" && ` · ${t("overdue")}`}
                          {fu === "today" && ` · ${t("today")}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.assignee?.full_name ?? "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { HostedWorkflowType } from "./workflow-templates.ts";
import { parseWorkflowQueryValue } from "./workflow-links.ts";

export type ResultsStatusFilter = "all" | "completed" | "warnings";
export type ResultsSort = "newest" | "oldest";

export type ResultsFilterableReport = {
  id: string;
  workflowType: HostedWorkflowType;
  inputPreview: string;
  summary: string;
  spentUsdc: string;
  completedWithWarnings: boolean;
  generatedAt: string;
};

function firstString(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

export function parseResultsFilters(input: {
  q?: unknown;
  workflow?: unknown;
  status?: unknown;
  sort?: unknown;
}) {
  const workflowValue = firstString(input.workflow);
  const statusValue = firstString(input.status);
  const sortValue = firstString(input.sort);
  return {
    query: firstString(input.q).trim().slice(0, 160),
    workflowType:
      workflowValue === "all" || !workflowValue
        ? null
        : parseWorkflowQueryValue(workflowValue),
    status: (
      statusValue === "completed" || statusValue === "warnings"
        ? statusValue
        : "all"
    ) as ResultsStatusFilter,
    sort: (
      sortValue === "oldest"
        ? sortValue
        : "newest"
    ) as ResultsSort,
  };
}

export function filterAndSortResults<T extends ResultsFilterableReport>(
  reports: T[],
  filters: ReturnType<typeof parseResultsFilters>,
) {
  const query = filters.query.toLocaleLowerCase();
  return reports
    .filter((report) => {
      if (filters.workflowType && report.workflowType !== filters.workflowType) return false;
      if (filters.status === "warnings" && !report.completedWithWarnings) return false;
      if (filters.status === "completed" && report.completedWithWarnings) return false;
      return !query || `${report.inputPreview}\n${report.summary}`.toLocaleLowerCase().includes(query);
    })
    .sort((left, right) => {
      const delta = Date.parse(right.generatedAt) - Date.parse(left.generatedAt);
      return filters.sort === "oldest" ? -delta : delta;
    });
}

export function hasActiveResultsFilters(
  filters: ReturnType<typeof parseResultsFilters>,
) {
  return Boolean(
    filters.query ||
    filters.workflowType ||
    filters.status !== "all" ||
    filters.sort !== "newest",
  );
}

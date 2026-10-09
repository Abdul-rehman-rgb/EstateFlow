import { api } from "@/lib/http";
import { ApiError } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { buildReport } from "@/lib/reports";
import { csvResponse } from "@/lib/http";
import { toCsv } from "@/lib/util";

const FINANCE_REPORTS = ["commissions", "pipeline"];

export const GET = api(async (req, user, p) => {
  requirePerm(user, "reports:read");
  if (user.role === "finance" && !FINANCE_REPORTS.includes(p.name)) throw new ApiError(403, "Finance users can view commission and pipeline reports only.");
  const report = await buildReport(p.name, user);
  const format = new URL(req.url).searchParams.get("format");
  if (format === "csv") {
    requirePerm(user, "export:write");
    return csvResponse(`${p.name}-report.csv`, toCsv(report.columns, report.rows));
  }
  return report;
});

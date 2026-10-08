import { exportCsv, exportJson } from "@/modules/analytics/export";
import { getProductIntelligence } from "@/modules/analytics/service";
import { parseWindow } from "@/modules/analytics/time";
import { jsonError } from "@/server/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const window = parseWindow(url.searchParams.get("window"));
  const view = await getProductIntelligence(id, window);
  if (!view) return jsonError(404, "Product not found.");
  const json = url.searchParams.get("format") === "json";
  const body = json ? exportJson(view.metrics, window, view.calculatedAt) : exportCsv(view.metrics, window, view.calculatedAt);
  return new Response(body, {
    headers: {
      "Content-Type": json ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="factory-metrics-${window}.${json ? "json" : "csv"}"`,
    },
  });
}

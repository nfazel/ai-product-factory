import { exportCsv, exportJson } from "@/modules/analytics/export";
import { getPortfolioIntelligence } from "@/modules/analytics/service";
import { parseWindow } from "@/modules/analytics/time";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const window = parseWindow(url.searchParams.get("window"));
  const portfolio = await getPortfolioIntelligence(window);
  const json = url.searchParams.get("format") === "json";
  const body = json ? exportJson(portfolio.metrics, window, portfolio.calculatedAt) : exportCsv(portfolio.metrics, window, portfolio.calculatedAt);
  return new Response(body, {
    headers: {
      "Content-Type": json ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="portfolio-metrics-${window}.${json ? "json" : "csv"}"`,
    },
  });
}

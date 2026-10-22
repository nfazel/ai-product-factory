export function initialNfrEvidenceNote(nfr: { category: string; title: string; description?: string }) {
  const category = nfr.category.toUpperCase();
  const text = `${nfr.title} ${nfr.description ?? ""}`.toLowerCase();
  if (category === "ACCESSIBILITY" || /\baccessibility\b|\ba11y\b/.test(text)) {
    return "Not tested. No accessibility tool is installed, so this requirement is not claimed as verified.";
  }
  if (category === "PERFORMANCE" || category === "SCALABILITY" || /\bperformance\b/.test(text)) {
    return "Not tested. No performance tool is installed, so this requirement is not claimed as verified.";
  }
  return `Not tested. ${nfr.title} was not exercised. This result does not claim the requirement is met.`;
}

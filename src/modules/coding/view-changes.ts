import { isGeneratedReviewPath } from "@/modules/coding/generated-paths";

export type ReviewChangeStatus = "added" | "modified" | "deleted";

export type ReviewChangeFile = {
  path: string;
  status: ReviewChangeStatus;
  additions: number;
  deletions: number;
  patch: string;
};

export type ReviewChangesSummary = {
  files: ReviewChangeFile[];
  additions: number;
  deletions: number;
  truncated: boolean;
  empty: boolean;
};

const DIFF_HEADER = /^diff --git /m;

function normalisePath(value: string) {
  return value.replaceAll("\\", "/").replace(/^[ab]\//, "");
}

function pathFromDiffHeader(headerLine: string) {
  // diff --git a/foo b/foo  (paths may include spaces when not quoted — keep last a/ and b/ pair)
  const match = headerLine.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!match) return "";
  return normalisePath(match[2] || match[1] || "");
}

function pathFromMinusPlus(block: string) {
  const plus = block.match(/^\+\+\+\s+(?:b\/)?(.+)$/m);
  const minus = block.match(/^---\s+(?:a\/)?(.+)$/m);
  const candidate = (plus?.[1] || minus?.[1] || "").trim();
  if (!candidate || candidate === "/dev/null") {
    const other = (minus?.[1] || plus?.[1] || "").trim();
    if (other && other !== "/dev/null") return normalisePath(other);
    return "";
  }
  return normalisePath(candidate);
}

/** Split a stored unified patch into per-file sections keyed by path. */
export function parseUnifiedDiffFiles(patch: string): { path: string; patch: string }[] {
  if (!patch.trim()) return [];
  const parts = patch.split(DIFF_HEADER);
  const files: { path: string; patch: string }[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    const body = parts[index] ?? "";
    const block = `diff --git ${body}`;
    const firstLine = block.split("\n", 1)[0] ?? "";
    const path = pathFromDiffHeader(firstLine) || pathFromMinusPlus(block);
    if (!path || isGeneratedReviewPath(path)) continue;
    files.push({ path, patch: block.trimEnd() });
  }
  return files;
}

function asDiffFiles(files: unknown): { path: string; status: ReviewChangeStatus; additions: number; deletions: number }[] {
  if (!Array.isArray(files)) return [];
  return files.flatMap((file) => {
    if (!file || typeof file !== "object") return [];
    const item = file as { path?: unknown; status?: unknown; additions?: unknown; deletions?: unknown };
    if (typeof item.path !== "string" || !item.path || isGeneratedReviewPath(item.path)) return [];
    const raw = typeof item.status === "string" ? item.status.toLowerCase() : "modified";
    const status: ReviewChangeStatus =
      raw === "deleted" || raw === "removed" || raw === "d"
        ? "deleted"
        : raw === "added" || raw === "a" || raw === "created"
          ? "added"
          : "modified";
    return [{
      path: item.path.replaceAll("\\", "/"),
      status,
      additions: typeof item.additions === "number" && Number.isFinite(item.additions) ? Math.max(0, Math.floor(item.additions)) : 0,
      deletions: typeof item.deletions === "number" && Number.isFinite(item.deletions) ? Math.max(0, Math.floor(item.deletions)) : 0,
    }];
  });
}

function statusFromPatch(patch: string): ReviewChangeStatus {
  if (/^deleted file mode/m.test(patch) || /^\+\+\+\s+\/dev\/null/m.test(patch)) return "deleted";
  if (/^new file mode/m.test(patch) || /^---\s+\/dev\/null/m.test(patch)) return "added";
  return "modified";
}

function countPatchLines(patch: string) {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file")) {
      continue;
    }
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

/**
 * Build the human code-review change list from the stored workspace diff.
 * Supports both uncommitted working-tree changes and committed baseCommit..HEAD ranges
 * because captureWorkspaceDiff already merges those into the stored patch/files.
 */
export function buildReviewChanges(input: {
  files: unknown;
  patch?: string | null;
  truncated?: boolean;
}): ReviewChangesSummary {
  const meta = asDiffFiles(input.files);
  const sections = parseUnifiedDiffFiles(input.patch ?? "");
  const byPath = new Map(sections.map((section) => [section.path, section.patch]));
  const seen = new Set<string>();
  const files: ReviewChangeFile[] = [];

  for (const file of meta) {
    seen.add(file.path);
    const patch = byPath.get(file.path) ?? "";
    files.push({
      path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch,
    });
  }

  for (const section of sections) {
    if (seen.has(section.path)) continue;
    const counts = countPatchLines(section.patch);
    files.push({
      path: section.path,
      status: statusFromPatch(section.patch),
      additions: counts.additions,
      deletions: counts.deletions,
      patch: section.patch,
    });
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    truncated: Boolean(input.truncated),
    empty: files.length === 0,
  };
}

export function changeStatusLabel(status: ReviewChangeStatus) {
  if (status === "added") return "Created";
  if (status === "deleted") return "Deleted";
  return "Modified";
}

import { describe, expect, it } from "vitest";

import { buildReviewChanges, changeStatusLabel, parseUnifiedDiffFiles } from "@/modules/coding/view-changes";

const samplePatch = [
  "diff --git a/src/app/discovery/page.tsx b/src/app/discovery/page.tsx",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/app/discovery/page.tsx",
  "@@ -0,0 +1,3 @@",
  "+export default function Page() {",
  "+  return <main>Feed</main>;",
  "+}",
  "diff --git a/.gitignore b/.gitignore",
  "--- a/.gitignore",
  "+++ b/.gitignore",
  "@@ -1,2 +1,4 @@",
  " node_modules",
  "+.next/",
  "+next-env.d.ts",
  "diff --git a/src/old.ts b/src/old.ts",
  "deleted file mode 100644",
  "--- a/src/old.ts",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-export const gone = true;",
].join("\n");

describe("view changes", () => {
  it("splits a unified patch into per-file sections", () => {
    const files = parseUnifiedDiffFiles(samplePatch);
    expect(files.map((file) => file.path)).toEqual([
      "src/app/discovery/page.tsx",
      ".gitignore",
      "src/old.ts",
    ]);
    expect(files[0]?.patch).toContain("+export default function Page()");
    expect(files[1]?.patch).toContain("+.next/");
    expect(files[2]?.patch).toContain("-export const gone = true;");
  });

  it("builds review changes for committed and uncommitted metadata with patch text", () => {
    const summary = buildReviewChanges({
      files: [
        { path: "src/app/discovery/page.tsx", status: "added", additions: 3, deletions: 0 },
        { path: ".gitignore", status: "modified", additions: 2, deletions: 0 },
        { path: "src/old.ts", status: "deleted", additions: 0, deletions: 1 },
        { path: ".next/cache.js", status: "added", additions: 1, deletions: 0 },
      ],
      patch: samplePatch,
      truncated: false,
    });
    expect(summary.empty).toBe(false);
    expect(summary.files.map((file) => [file.path, file.status, changeStatusLabel(file.status)])).toEqual([
      [".gitignore", "modified", "Modified"],
      ["src/app/discovery/page.tsx", "added", "Created"],
      ["src/old.ts", "deleted", "Deleted"],
    ]);
    expect(summary.files.find((file) => file.path === ".gitignore")?.patch).toContain("+.next/");
    expect(summary.additions).toBe(5);
    expect(summary.deletions).toBe(1);
  });

  it("still lists files when the stored patch is empty", () => {
    const summary = buildReviewChanges({
      files: [{ path: "README.md", status: "modified", additions: 1, deletions: 0 }],
      patch: "",
    });
    expect(summary.files).toEqual([{
      path: "README.md",
      status: "modified",
      additions: 1,
      deletions: 0,
      patch: "",
    }]);
  });

  it("recovers files from patch sections when metadata is missing", () => {
    const summary = buildReviewChanges({ files: [], patch: samplePatch });
    expect(summary.files.map((file) => file.path)).toEqual([
      ".gitignore",
      "src/app/discovery/page.tsx",
      "src/old.ts",
    ]);
    expect(summary.files.find((file) => file.path === "src/app/discovery/page.tsx")?.status).toBe("added");
    expect(summary.files.find((file) => file.path === "src/old.ts")?.status).toBe("deleted");
  });
});

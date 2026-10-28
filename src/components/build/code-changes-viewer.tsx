"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  buildReviewChanges,
  changeStatusLabel,
  type ReviewChangeFile,
} from "@/modules/coding/view-changes";

export function ViewChangesButton({
  files,
  patch,
  truncated = false,
  baseCommit,
  headCommit,
}: {
  files: unknown;
  patch?: string | null;
  truncated?: boolean;
  baseCommit?: string | null;
  headCommit?: string | null;
}) {
  const summary = useMemo(
    () => buildReviewChanges({ files, patch, truncated }),
    [files, patch, truncated],
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selected = summary.files.find((file) => file.path === selectedPath) ?? summary.files[0] ?? null;

  if (summary.empty) {
    return (
      <p className="text-sm text-muted-foreground">
        No reviewable source changes are available to inspect yet.
      </p>
    );
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open && !selectedPath && summary.files[0]) setSelectedPath(summary.files[0].path);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          View Changes
        </Button>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[min(90vh,52rem)] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        showCloseButton
      >
        <DialogHeader className="border-b px-4 py-4 sm:px-5">
          <DialogTitle>Code changes</DialogTitle>
          <DialogDescription>
            Inspect the source changes against the coding baseline before approving.
            {baseCommit ? ` Baseline ${baseCommit.slice(0, 12)}` : ""}
            {headCommit ? ` · HEAD ${headCommit.slice(0, 12)}` : ""}.
            {" "}
            {summary.files.length} file{summary.files.length === 1 ? "" : "s"}, +{summary.additions} / -{summary.deletions}.
            {summary.truncated ? " Diff truncated for storage." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(14rem,18rem)_1fr]">
          <aside className="max-h-[40vh] overflow-y-auto border-b md:max-h-none md:border-r md:border-b-0">
            <ul className="divide-y">
              {summary.files.map((file) => {
                const active = (selected?.path ?? "") === file.path;
                return (
                  <li key={file.path}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2.5 text-left text-sm ${
                        active ? "bg-stone-100 text-stone-900" : "text-stone-700 hover:bg-stone-50"
                      }`}
                      onClick={() => setSelectedPath(file.path)}
                    >
                      <span className="block font-medium break-all">{file.path}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {changeStatusLabel(file.status)} · +{file.additions} / -{file.deletions}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <div className="min-h-0 max-h-[50vh] overflow-auto md:max-h-[min(70vh,40rem)]">
            {selected ? <FileChangeDetail file={selected} /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FileChangeDetail({ file }: { file: ReviewChangeFile }) {
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-sm font-medium text-stone-900">{file.path}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {changeStatusLabel(file.status)} · +{file.additions} / -{file.deletions}
        </p>
      </div>
      {file.patch.trim() ? (
        <pre className="overflow-x-auto rounded-lg bg-stone-950 p-3 text-xs leading-5 text-stone-100">
          {file.patch.split("\n").map((line, index) => (
            <span
              key={`${file.path}:${index}`}
              className={`block whitespace-pre-wrap ${lineClass(line)}`}
            >
              {line || " "}
            </span>
          ))}
        </pre>
      ) : (
        <p className="rounded-lg border bg-white px-3 py-2 text-sm text-muted-foreground">
          {file.status === "deleted"
            ? "This file was deleted. No line-level patch is stored for this entry."
            : "No line-level patch is stored for this file. Metadata (path and change type) remains available above."}
        </p>
      )}
    </div>
  );
}

function lineClass(line: string) {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("@@")) {
    return "text-sky-300";
  }
  if (line.startsWith("+")) return "bg-emerald-950/60 text-emerald-300";
  if (line.startsWith("-")) return "bg-rose-950/60 text-rose-300";
  return "text-stone-300";
}

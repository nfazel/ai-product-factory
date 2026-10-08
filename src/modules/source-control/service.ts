import "server-only";

import { getAIProvider, isAIConfigured } from "@/modules/ai/provider";
import { recordActivity } from "@/modules/activity/service";
import { classifyWrite } from "@/modules/coding/policy";
import { asStrings } from "@/modules/coding/strings";
import { getCurrentActor } from "@/modules/identity/actor";
import { db } from "@/lib/db";
import { buildPullRequestBody } from "@/modules/source-control/description";
import { commitIsDescendant, githubRemoteMatches, localRemoteUrl, pushBlockers } from "@/modules/source-control/eligibility";
import { SourceControlFailure } from "@/modules/source-control/errors";
import { credentialPresence } from "@/modules/source-control/github";
import { buildReviewPrompt, pullRequestSuggestionSchema, REVIEW_SYSTEM_PROMPT, reviewAnalysisSchema } from "@/modules/source-control/prompt";
import { buildPublishArguments } from "@/modules/source-control/push";
import { decidePullRequestReadiness, decideReleaseCandidate } from "@/modules/source-control/readiness";
import { redactSecrets } from "@/modules/source-control/redact";
import { getSourceControlProvider } from "@/modules/source-control/registry";
import { DomainError } from "@/modules/shared/errors";

const AGENT_ACTORS = new Set([
  "coding agent",
  "testing & verification agent",
  "testing agent",
  "verification agent",
  "architecture agent",
  "security & engineering governance agent",
  "ai product factory",
]);

function assertHuman(actor: string) {
  if (AGENT_ACTORS.has(actor.trim().toLowerCase())) {
    throw new DomainError("An agent cannot publish, create, or merge a pull request.");
  }
}

function minimumApprovals() {
  const parsed = Number(process.env.GITHUB_MINIMUM_HUMAN_APPROVALS ?? "1");
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export async function getConnectionSummary() {
  const presence = credentialPresence();
  const row = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  return {
    provider: "GITHUB" as const,
    owner: row?.owner || presence.owner,
    repositoryName: row?.repositoryName || presence.repository,
    defaultBranch: row?.defaultBranch ?? "",
    status: row?.status ?? ("UNAVAILABLE" as const),
    message: row?.message || (presence.configured ? "Connection has not been validated." : "GitHub credentials are not configured."),
    credentialsPresent: presence.configured,
    minimumHumanApprovals: row?.minimumHumanApprovals ?? minimumApprovals(),
  };
}

export async function validateGitHubConnection(productId?: string) {
  const presence = credentialPresence();
  const approvals = minimumApprovals();
  let status: "CONNECTED" | "MISCONFIGURED" | "UNAVAILABLE" = "UNAVAILABLE";
  let message = "GitHub credentials are not configured.";
  let owner = presence.owner;
  let repositoryName = presence.repository;
  let repositoryUrl = "";
  let defaultBranch = "";
  let installationId = "";
  try {
    const provider = await getSourceControlProvider();
    const repository = await provider.getRepository();
    owner = repository.owner;
    repositoryName = repository.name;
    repositoryUrl = repository.url;
    defaultBranch = await provider.getDefaultBranch();
    installationId = presence.appReady ? process.env.GITHUB_APP_INSTALLATION_ID?.trim() ?? "" : "";
    if (!repository.canPush) {
      status = "MISCONFIGURED";
      message = "The GitHub credentials cannot push to the repository.";
    } else if (!defaultBranch) {
      status = "MISCONFIGURED";
      message = "The default branch was not found.";
    } else {
      const localRoot = process.env.PRODUCT_REPOSITORY_ROOT?.trim() ?? "";
      if (localRoot) {
        const remote = await localRemoteUrl(localRoot);
        if (!remote || !githubRemoteMatches(remote, owner, repositoryName)) {
          status = "MISCONFIGURED";
          message = "The local repository remote does not match the configured GitHub repository.";
        } else {
          status = "CONNECTED";
          message = "GitHub accepted the credentials and the repository is reachable.";
        }
      } else {
        status = "CONNECTED";
        message = "GitHub accepted the credentials and the repository is reachable.";
      }
    }
  } catch (error) {
    if (error instanceof SourceControlFailure) {
      status = error.kind === "AUTH" || error.kind === "UNAVAILABLE" || error.kind === "RATE_LIMIT" ? "UNAVAILABLE" : "MISCONFIGURED";
      message = error.message;
    } else {
      status = "UNAVAILABLE";
      message = "GitHub is unavailable.";
    }
  }
  const saved = await db.sourceControlConnection.upsert({
    where: { id: "factory" },
    create: {
      id: "factory",
      provider: "GITHUB",
      owner,
      repositoryName,
      repositoryUrl,
      defaultBranch,
      installationId,
      status,
      message,
      minimumHumanApprovals: approvals,
      checkedAt: new Date(),
    },
    update: {
      owner,
      repositoryName,
      repositoryUrl,
      defaultBranch,
      installationId,
      status,
      message,
      minimumHumanApprovals: approvals,
      checkedAt: new Date(),
    },
  });
  if (productId) {
    const existing = await db.repository.findUnique({ where: { productId } });
    const localPath = existing?.localPath || process.env.PRODUCT_REPOSITORY_ROOT?.trim() || "";
    await db.repository.upsert({
      where: { productId },
      create: {
        productId,
        name: repositoryName || "repository",
        provider: "GITHUB",
        owner,
        repositoryName,
        repositoryUrl,
        defaultBranch: defaultBranch || "main",
        installationId,
        localPath,
        status: status === "CONNECTED" ? "CONFIGURED" : "UNAVAILABLE",
        connectionStatus: status,
        connectionMessage: message,
        minimumHumanApprovals: approvals,
      },
      update: {
        provider: "GITHUB",
        owner,
        repositoryName,
        repositoryUrl,
        defaultBranch: defaultBranch || existing?.defaultBranch || "main",
        installationId,
        connectionStatus: status,
        connectionMessage: message,
        minimumHumanApprovals: approvals,
        status: status === "CONNECTED" ? "CONFIGURED" : existing?.status ?? "UNAVAILABLE",
      },
    });
  }
  if (status === "CONNECTED" && productId) {
    await recordActivity({
      productId,
      type: "GITHUB_CONNECTED",
      description: `Validated GitHub connection for ${owner}/${repositoryName}.`,
    });
  }
  return saved;
}

export async function publishTaskBranch(productId: string, taskId: string, actorName?: string) {
  const actor = actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const blockers = await pushBlockers(productId, taskId);
  if (blockers.length > 0) throw new DomainError(blockers.join(" "));
  return publishWorkspace(productId, taskId, actor, "BRANCH_PUBLISHED");
}

export async function updatePublishedBranch(productId: string, taskId: string, actorName?: string) {
  const actor = actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const blockers = await pushBlockers(productId, taskId);
  if (blockers.length > 0) throw new DomainError(blockers.join(" "));
  const task = await loadTask(productId, taskId);
  const workspace = task.workspaces[0];
  const verified = await currentVerification(productId, taskId, workspace?.headCommit ?? "");
  if (!verified) throw new DomainError("Re-verification of the current commit is required before the published branch can be updated.");
  return publishWorkspace(productId, taskId, actor, "BRANCH_UPDATED");
}

async function publishWorkspace(productId: string, taskId: string, actor: string, activity: "BRANCH_PUBLISHED" | "BRANCH_UPDATED") {
  const task = await loadTask(productId, taskId);
  const workspace = task.workspaces[0];
  if (!workspace) throw new DomainError("The coding workspace for this task was not found.");
  const connection = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  if (!connection || connection.status !== "CONNECTED") throw new DomainError("The GitHub connection is not valid.");
  const repository = await db.repository.findUnique({ where: { productId } });
  if (!repository) throw new DomainError("The product repository is not configured.");
  const provider = await getSourceControlProvider();
  const branch = workspace.branchName;
  const sha = workspace.headCommit;
  let tip: string | null = null;
  try {
    tip = await provider.getBranchTip(branch);
  } catch (error) {
    await markPublicationFailed(productId, taskId, repository.id, workspace.id, branch, sha, error);
    throw error;
  }
  if (tip && tip !== sha) {
    const safe = await commitIsDescendant(workspace.workspacePath, tip, sha);
    if (!safe) {
      await db.publishedChange.create({
        data: {
          productId,
          implementationTaskId: taskId,
          repositoryId: repository.id,
          workspaceId: workspace.id,
          localBranch: branch,
          remoteBranch: branch,
          localCommitSha: sha,
          remoteCommitSha: tip,
          status: "DIVERGED",
          failureMessage: "REMOTE BRANCH DIVERGENCE",
        },
      });
      throw new SourceControlFailure(
        "REMOTE BRANCH DIVERGENCE. The remote branch is not an ancestor of the local commit. Resolve it before publishing. Force push is not available.",
        "DIVERGENCE",
      );
    }
  }
  const remoteUrl = `https://github.com/${connection.owner}/${connection.repositoryName}.git`;
  const args = buildPublishArguments({ remoteUrl, localBranch: branch, remoteBranch: branch });
  let remoteSha = sha;
  try {
    const published = await provider.publishBranch({ branch, sha, args, cwd: workspace.workspacePath });
    remoteSha = published.remoteSha;
  } catch (error) {
    await markPublicationFailed(productId, taskId, repository.id, workspace.id, branch, sha, error);
    throw error;
  }
  const change = await db.publishedChange.create({
    data: {
      productId,
      implementationTaskId: taskId,
      repositoryId: repository.id,
      workspaceId: workspace.id,
      localBranch: branch,
      remoteBranch: branch,
      localCommitSha: sha,
      remoteCommitSha: remoteSha,
      status: "PUBLISHED",
      publishedBy: actor,
      publishedAt: new Date(),
    },
  });
  await recordEvidence({
    productId,
    publishedChangeId: change.id,
    type: "BRANCH_PUBLISHED",
    description: `Published ${branch} at ${remoteSha}.`,
    result: "PUBLISHED",
  });
  await recordEvidence({
    productId,
    publishedChangeId: change.id,
    type: "REMOTE_COMMIT",
    description: `Remote commit ${remoteSha} matches the local commit.`,
    result: remoteSha,
  });
  await recordActivity({
    productId,
    type: activity,
    description: `${actor} published ${branch} at ${remoteSha.slice(0, 12)}.`,
    actor,
  });
  return change;
}

export async function createTaskPullRequest(productId: string, taskId: string, titleInput?: string, actorName?: string) {
  const actor = actorName ?? getCurrentActor().name;
  assertHuman(actor);
  const change = await db.publishedChange.findFirst({
    where: { productId, implementationTaskId: taskId, status: "PUBLISHED", demo: false },
    orderBy: { createdAt: "desc" },
    include: { pullRequest: true },
  });
  if (!change) throw new DomainError("Publish the branch before creating a pull request.");
  if (change.pullRequest) throw new DomainError("This published change already has a pull request.");
  const connection = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  if (!connection || connection.status !== "CONNECTED") throw new DomainError("The GitHub connection is not valid.");
  const trace = await pullRequestTrace(productId, taskId, change.localCommitSha);
  let title = titleInput?.trim() || trace.taskTitle;
  let summary = "Prepared from the approved implementation task.";
  if (isAIConfigured()) {
    const suggestion = await getAIProvider().generate({
      systemPrompt: "Suggest a pull request title and a short summary. Do not invent acceptance results, CI, or approvals.",
      messages: [{ role: "user", content: `Task: ${trace.taskTitle}\nOutcome: ${trace.outcome}` }],
      responseSchema: pullRequestSuggestionSchema,
      schemaName: "pull_request_suggestion",
    });
    const parsed = pullRequestSuggestionSchema.safeParse(suggestion.data);
    if (!parsed.success) throw new DomainError("The pull request suggestion did not match the required structure. No pull request was created.");
    title = titleInput?.trim() || parsed.data.title;
    summary = parsed.data.summary;
  }
  const body = buildPullRequestBody({ ...trace, summary, commitSha: change.localCommitSha });
  const provider = await getSourceControlProvider();
  const remote = await provider.createPullRequest({
    title: redactSecrets(title),
    body,
    head: change.remoteBranch,
    base: connection.defaultBranch || "main",
    sha: change.remoteCommitSha,
  });
  const record = await db.pullRequestRecord.create({
    data: {
      productId,
      repositoryId: change.repositoryId,
      publishedChangeId: change.id,
      providerPullRequestId: remote.id,
      number: remote.number,
      url: remote.url,
      title: remote.title,
      body: remote.body,
      baseBranch: remote.baseBranch,
      headBranch: remote.headBranch,
      headSha: remote.headSha,
      state: remote.state,
      author: remote.author,
    },
  });
  await recordEvidence({
    productId,
    publishedChangeId: change.id,
    pullRequestRecordId: record.id,
    type: "PULL_REQUEST_CREATED",
    description: `Pull request #${remote.number} created.`,
    result: remote.url,
  });
  await recordActivity({
    productId,
    type: "PULL_REQUEST_CREATED",
    description: `${actor} created pull request #${remote.number}.`,
    actor,
  });
  return refreshPullRequest(productId, record.id);
}

export async function refreshPullRequest(productId: string, pullRequestId: string) {
  const record = await db.pullRequestRecord.findFirst({
    where: { id: pullRequestId, productId },
    include: { checks: true, reviews: true },
  });
  if (!record) throw new DomainError("The pull request was not found.", "NOT_FOUND");
  if (record.demo) throw new DomainError("Demo pull request data is not refreshed from GitHub.");
  const provider = await getSourceControlProvider();
  const remote = await provider.getPullRequest(record.number);
  const [reviews, comments, checks, protection] = await Promise.all([
    provider.getPullRequestReviews(record.number),
    provider.getPullRequestComments(record.number),
    provider.getCheckRuns(remote.headSha),
    provider.getBranchProtection(remote.baseBranch),
  ]);
  const previousConclusions = new Map(record.checks.map((check) => [check.providerCheckId, check.conclusion]));
  await db.pullRequestRecord.update({
    where: { id: record.id },
    data: {
      state: remote.state,
      title: remote.title,
      headSha: remote.headSha,
      baseBranch: remote.baseBranch,
      headBranch: remote.headBranch,
      mergeCommitSha: remote.mergeCommitSha,
      mergedAt: remote.mergedAt ? new Date(remote.mergedAt) : null,
      mergedBy: remote.mergedBy,
      protection: protection ?? {},
    },
  });
  let ciChanged = false;
  for (const check of checks) {
    const existing = previousConclusions.get(check.id);
    if (existing && existing !== check.conclusion) ciChanged = true;
    await db.pullRequestCheck.upsert({
      where: { pullRequestRecordId_providerCheckId: { pullRequestRecordId: record.id, providerCheckId: check.id } },
      create: {
        pullRequestRecordId: record.id,
        providerCheckId: check.id,
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        startedAt: check.startedAt ? new Date(check.startedAt) : null,
        completedAt: check.completedAt ? new Date(check.completedAt) : null,
        detailsUrl: check.detailsUrl,
        source: "GITHUB",
      },
      update: {
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        completedAt: check.completedAt ? new Date(check.completedAt) : null,
        detailsUrl: check.detailsUrl,
      },
    });
    await recordEvidence({
      productId,
      pullRequestRecordId: record.id,
      type: "CI_CHECK",
      description: `Check ${check.name} is ${check.status} ${check.conclusion}. This does not verify acceptance criteria.`,
      result: check.conclusion,
    });
  }
  for (const review of reviews) {
    const known = record.reviews.some((item) => item.providerReviewId === review.id);
    await db.pullRequestReview.upsert({
      where: { pullRequestRecordId_providerReviewId: { pullRequestRecordId: record.id, providerReviewId: review.id } },
      create: {
        pullRequestRecordId: record.id,
        providerReviewId: review.id,
        reviewer: review.reviewer,
        state: review.state,
        body: redactSecrets(review.body),
        submittedAt: review.submittedAt ? new Date(review.submittedAt) : null,
      },
      update: { state: review.state, body: redactSecrets(review.body) },
    });
    if (!known) {
      await recordActivity({
        productId,
        type: review.state === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "REVIEW_RECEIVED",
        description: `GitHub review from ${review.reviewer || "unknown"} is ${review.state}.`,
      });
      if (review.state === "APPROVED") {
        await recordEvidence({
          productId,
          pullRequestRecordId: record.id,
          type: "HUMAN_REVIEW",
          description: `Review ${review.state} by ${review.reviewer}.`,
          result: review.state,
        });
      }
    }
  }
  for (const comment of comments) {
    await db.pullRequestComment.upsert({
      where: { pullRequestRecordId_providerCommentId: { pullRequestRecordId: record.id, providerCommentId: comment.id } },
      create: {
        pullRequestRecordId: record.id,
        providerCommentId: comment.id,
        author: comment.author,
        body: redactSecrets(comment.body),
        path: comment.path,
        line: comment.line,
      },
      update: { body: redactSecrets(comment.body), path: comment.path, line: comment.line },
    });
  }
  if (remote.state === "MERGED") {
    const already = await db.sourceControlEvidence.findFirst({
      where: { pullRequestRecordId: record.id, type: "PULL_REQUEST_MERGED" },
    });
    if (!already) {
      await recordEvidence({
        productId,
        pullRequestRecordId: record.id,
        type: "PULL_REQUEST_MERGED",
        description: `GitHub reports pull request #${record.number} merged${remote.mergedBy ? ` by ${remote.mergedBy}` : ""}.`,
        result: remote.mergeCommitSha,
      });
      await recordActivity({
        productId,
        type: "PULL_REQUEST_MERGED",
        description: `GitHub reports pull request #${record.number} merged. The factory did not merge it.`,
      });
    }
  }
  if (ciChanged) {
    await recordActivity({ productId, type: "CI_CHANGED", description: `CI results changed for pull request #${record.number}.` });
  }
  const tip = await provider.getBranchTip(remote.headBranch);
  if (tip === null) {
    await db.publishedChange.update({
      where: { id: record.publishedChangeId },
      data: { status: "FAILED", failureMessage: "The remote branch was deleted." },
    });
  }
  await recordActivity({ productId, type: "PULL_REQUEST_REFRESHED", description: `Refreshed pull request #${record.number}.` });
  const view = await getSourceControlView(productId);
  const ready = view?.tasks.some((task) => task.pullRequest?.id === record.id && task.readiness.ready);
  if (ready) {
    const noted = await db.activity.findFirst({
      where: { productId, type: "PULL_REQUEST_READY", description: { contains: `#${record.number}` } },
    });
    if (!noted) {
      await recordActivity({
        productId,
        type: "PULL_REQUEST_READY",
        description: `Pull request #${record.number} is ready for a person to merge in GitHub.`,
      });
    }
  }
  return view;
}

export async function analyseReviewFeedback(productId: string, pullRequestId: string) {
  assertHuman(getCurrentActor().name);
  if (!isAIConfigured()) throw new DomainError("AI is not configured. Review comments were not classified.");
  const record = await db.pullRequestRecord.findFirst({
    where: { id: pullRequestId, productId },
    include: { comments: true },
  });
  if (!record) throw new DomainError("The pull request was not found.", "NOT_FOUND");
  if (record.comments.length === 0) return getSourceControlView(productId);
  const generated = await getAIProvider().generate({
    systemPrompt: REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildReviewPrompt(record.comments.map((comment) => ({ id: comment.providerCommentId, author: comment.author, body: comment.body, path: comment.path }))) }],
    responseSchema: reviewAnalysisSchema,
    schemaName: "review_comment_analysis",
  });
  const parsed = reviewAnalysisSchema.safeParse(generated.data);
  if (!parsed.success) throw new DomainError("The review analysis did not match the required structure. No classification was stored.");
  for (const item of parsed.data.comments) {
    const comment = record.comments.find((entry) => entry.providerCommentId === item.providerCommentId);
    if (!comment) continue;
    await db.pullRequestComment.update({
      where: { id: comment.id },
      data: {
        classification: item.kind,
        summary: redactSecrets(item.summary),
        recommendedAction: redactSecrets(item.recommendedAction),
        affectedFiles: item.affectedFiles,
      },
    });
  }
  return getSourceControlView(productId);
}

export async function sendCommentToCoding(productId: string, commentId: string) {
  const actor = getCurrentActor().name;
  assertHuman(actor);
  const comment = await db.pullRequestComment.findFirst({
    where: { id: commentId, pullRequest: { productId } },
    include: { pullRequest: { include: { publishedChange: true } } },
  });
  if (!comment) throw new DomainError("The review comment was not found.", "NOT_FOUND");
  if (!comment.classification) throw new DomainError("Analyse the review feedback before sending it to the Coding Agent.");
  if (!["CODE_CHANGE_REQUEST", "REQUIREMENT_CHANGE", "ARCHITECTURE_CONCERN", "SECURITY_CONCERN"].includes(comment.classification)) {
    throw new DomainError("This comment does not request a coding change.");
  }
  const taskId = comment.pullRequest.publishedChange.implementationTaskId;
  const task = await loadTask(productId, taskId);
  const workspace = task.workspaces[0];
  if (!workspace?.contract) throw new DomainError("The coding workspace for this task was not found.");
  const files = uniqueFiles(comment.path, comment.affectedFiles);
  const allowed = files.every((file) => classifyWrite(file, asStrings(workspace.contract?.allowedPaths), asStrings(workspace.contract?.restrictedPaths)).ok);
  await db.pullRequestComment.update({ where: { id: comment.id }, data: { withinContract: allowed, triaged: true } });
  const escalation = escalationFor(comment.classification, allowed);
  if (escalation) {
    await db.codingEscalation.create({
      data: {
        workspaceId: workspace.id,
        type: escalation,
        description: redactSecrets(comment.summary || comment.classification),
        reason: "GitHub review feedback is outside the current execution contract.",
        recommendedAction: redactSecrets(comment.recommendedAction || "Review the request with the responsible human gate."),
      },
    });
    await recordActivity({
      productId,
      type: "CODING_ESCALATION_CREATED",
      description: `${escalation}: GitHub feedback was not given to the Coding Agent as a code change.`,
      actor,
    });
    return getSourceControlView(productId);
  }
  await db.codingRevision.create({
    data: {
      workspaceId: workspace.id,
      feedback: redactSecrets(comment.summary || comment.body).slice(0, 4000),
      requiredChanges: redactSecrets(comment.recommendedAction).slice(0, 4000),
      affectedFiles: files,
    },
  });
  await recordActivity({
    productId,
    type: "REVISION_INITIATED",
    description: `${actor} recorded a coding revision from GitHub feedback. The Coding Agent was not started.`,
    actor,
  });
  return getSourceControlView(productId);
}

export async function getSourceControlView(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return null;
  const connection = await getConnectionSummary();
  const slice = await db.productSlice.findFirst({
    where: { productId, status: "APPROVED" },
    orderBy: { createdAt: "asc" },
  });
  const tasks = slice
    ? await db.implementationTask.findMany({
        where: { plan: { productId, productSliceId: slice.id } },
        orderBy: { sequence: "asc" },
        include: taskInclude,
      })
    : await db.implementationTask.findMany({
        where: { publishedChanges: { some: { productId } } },
        orderBy: { sequence: "asc" },
        include: taskInclude,
      });
  const governanceCurrent = await governanceIsCurrent(productId);
  const policyCurrent = await policyIsCurrent(productId);
  const presented = await Promise.all(tasks.map(async (task) => presentTask(productId, task, connection.minimumHumanApprovals ?? 1, governanceCurrent, policyCurrent)));
  const integrated = await db.integratedVerificationSession.findFirst({ where: { productId } });
  const release = decideReleaseCandidate({
    hasApprovedSlice: Boolean(slice),
    tasks: presented.map((task) => ({
      completed: task.status === "COMPLETED",
      verified: task.verified,
      merged: task.pullRequest?.state === "MERGED" && task.pullRequest.demo === false,
    })),
    blockingDefect: presented.some((task) => task.blockingDefect),
    integratedRecorded: Boolean(integrated),
  });
  return { connection, release, tasks: presented };
}

export { pushBlockers };

const taskInclude = {
  workspaces: { orderBy: { createdAt: "desc" as const }, include: { contract: true, escalations: true, codeApprovals: true, diff: true } },
  workItem: { include: { acceptanceCriteria: true, parent: { include: { parent: true } }, capability: { include: { outcome: true } } } },
  plan: { include: { architecture: true } },
  publishedChanges: {
    orderBy: { createdAt: "desc" as const },
    include: { pullRequest: { include: { checks: true, reviews: true, comments: true } } },
  },
  verificationSessions: {
    orderBy: { createdAt: "desc" as const },
    include: { approvals: true, executions: true, defectLinks: { include: { workItem: true } } },
  },
};

async function presentTask(
  productId: string,
  task: Awaited<ReturnType<typeof loadTask>>,
  minimum: number,
  governanceCurrent: boolean,
  policyCurrent: boolean,
) {
  const blockers = await pushBlockers(productId, task.id);
  const published = task.publishedChanges[0] ?? null;
  const pull = published?.pullRequest ?? null;
  const session = task.verificationSessions.find((item) => !item.demo) ?? task.verificationSessions[0] ?? null;
  const approval = task.workspaces[0]?.codeApprovals.find((item) => !item.stale);
  const protection = protectionOf(pull?.protection);
  const blockingDefect = task.verificationSessions.some((item) =>
    item.defectLinks.some((link) => link.workItem.status !== "DONE" && (link.workItem.priority === "HIGH" || link.workItem.priority === "CRITICAL")),
  );
  const verified = Boolean(
    session &&
      !session.demo &&
      !session.stale &&
      (session.overallVerdict === "PASS" || session.overallVerdict === "PASS_WITH_CONCERNS") &&
      session.approvals.some((item) => !item.stale),
  );
  const readiness = !pull
    ? { label: "NOT READY" as const, ready: false, reasons: ["No pull request has been created."] }
    : pull.demo
      ? { label: "NOT READY" as const, ready: false, reasons: ["DEMO DATA. This pull request was not retrieved from GitHub."] }
      : decidePullRequestReadiness({
          state: pull.state,
          headSha: pull.headSha,
          approvalCommit: approval?.headCommit ?? "",
          approvalCurrent: Boolean(approval),
          verificationCommit: session?.commitSha ?? "",
          verificationApproved: verified,
          verificationStale: Boolean(session?.stale) || session?.commitSha !== pull.headSha,
          checks: pull.checks.map((check) => ({ name: check.name, status: check.status, conclusion: check.conclusion })),
          requiredChecks: protection ? protection.requiredChecks : null,
          reviews: pull.reviews.map((review) => ({ reviewer: review.reviewer, state: review.state, submittedAt: review.submittedAt })),
          minimumHumanApprovals: minimum,
          protectionApprovals: protection?.requiredApprovals ?? 0,
          governanceCurrent,
          policyCurrent,
          blockingDefect,
          serviceAccount: process.env.GITHUB_SERVICE_ACCOUNT,
        });
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    commitSha: task.workspaces[0]?.headCommit ?? "",
    blockers,
    verified,
    blockingDefect,
    published,
    pullRequest: pull,
    readiness,
    trace: {
      outcome: task.workItem?.capability?.outcome?.title ?? "",
      capability: task.workItem?.capability?.name ?? "",
      story: task.workItem?.title ?? "",
      criteria: task.workItem?.acceptanceCriteria.map((item) => item.description) ?? [],
      task: task.title,
    },
  };
}

function protectionOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { requiredChecks?: unknown; requiredApprovals?: unknown; conversationResolution?: unknown; restrictions?: unknown };
  if (!Array.isArray(record.requiredChecks)) return null;
  return {
    requiredChecks: record.requiredChecks.filter((item): item is string => typeof item === "string"),
    requiredApprovals: typeof record.requiredApprovals === "number" ? record.requiredApprovals : 0,
    conversationResolution: Boolean(record.conversationResolution),
    restrictions: typeof record.restrictions === "string" ? record.restrictions : "",
  };
}

async function pullRequestTrace(productId: string, taskId: string, commitSha: string) {
  const task = await loadTask(productId, taskId);
  const session = await currentVerification(productId, taskId, commitSha);
  const files = Array.isArray(task.workspaces[0]?.diff?.files)
    ? task.workspaces[0].diff.files.flatMap((file) =>
        file && typeof file === "object" && "path" in file && typeof file.path === "string" ? [file.path] : [],
      )
    : [];
  const regression = session?.executions.some((item) => item.kind === "EXISTING_REGRESSION" && item.status === "PASSED")
    ? "PASS"
    : "Not passed";
  return {
    summary: "",
    outcome: task.workItem?.capability?.outcome?.title ?? "",
    capability: task.workItem?.capability?.name ?? "",
    story: task.workItem?.title ?? "",
    criteria: task.workItem?.acceptanceCriteria.map((item) => item.description) ?? [],
    taskTitle: task.title,
    architecture: task.plan.architecture?.summary ?? "",
    changes: task.objective || task.title,
    files,
    verification: session
      ? [`Verification ${session.overallVerdict ?? "pending"} for commit ${commitSha}.`, ...task.workItem?.acceptanceCriteria.map((item) => item.description) ?? []]
      : [],
    regression,
    governance: (await governanceIsCurrent(productId)) ? "APPROVED" : "Not current",
    approvals: ["Code change approved by a person.", session ? "Verification approved by a person." : "Verification approval is missing."],
    productId,
    storyId: task.workItemId ?? "",
    taskId,
    sessionId: session?.id ?? "",
  };
}

async function currentVerification(productId: string, taskId: string, commitSha: string) {
  return db.verificationSession.findFirst({
    where: {
      productId,
      implementationTaskId: taskId,
      commitSha,
      demo: false,
      stale: false,
      overallVerdict: { in: ["PASS", "PASS_WITH_CONCERNS"] },
      approvals: { some: { stale: false } },
    },
    include: { executions: true },
    orderBy: { createdAt: "desc" },
  });
}

async function governanceIsCurrent(productId: string) {
  const review = await db.engineeringGovernanceReview.findFirst({ where: { productId }, orderBy: { createdAt: "desc" } });
  const approval = await db.approval.findFirst({ where: { productId, approvalType: "ENGINEERING_GOVERNANCE", status: "APPROVED" } });
  return Boolean(review && review.status === "APPROVED" && !review.reviewRequired && approval);
}

async function policyIsCurrent(productId: string) {
  const policy = await db.codingPolicy.findFirst({ where: { productId }, orderBy: { createdAt: "desc" }, include: { review: true } });
  const approval = await db.approval.findFirst({ where: { productId, approvalType: "CODING_POLICY", status: "APPROVED" } });
  return Boolean(policy && !policy.reapprovalRequired && policy.review.status === "APPROVED" && approval);
}

async function loadTask(productId: string, taskId: string) {
  const task = await db.implementationTask.findFirst({
    where: { id: taskId, plan: { productId } },
    include: taskInclude,
  });
  if (!task) throw new DomainError("The implementation task was not found.", "NOT_FOUND");
  return task;
}

async function markPublicationFailed(productId: string, taskId: string, repositoryId: string, workspaceId: string, branch: string, sha: string, error: unknown) {
  await db.publishedChange.create({
    data: {
      productId,
      implementationTaskId: taskId,
      repositoryId,
      workspaceId,
      localBranch: branch,
      remoteBranch: branch,
      localCommitSha: sha,
      status: "FAILED",
      failureMessage: redactSecrets(error instanceof Error ? error.message : "Publication failed."),
    },
  });
}

async function recordEvidence(input: {
  productId: string;
  publishedChangeId?: string;
  pullRequestRecordId?: string;
  type: "BRANCH_PUBLISHED" | "REMOTE_COMMIT" | "PULL_REQUEST_CREATED" | "CI_CHECK" | "HUMAN_REVIEW" | "PULL_REQUEST_MERGED";
  description: string;
  result: string;
}) {
  await db.sourceControlEvidence.create({
    data: {
      productId: input.productId,
      publishedChangeId: input.publishedChangeId,
      pullRequestRecordId: input.pullRequestRecordId,
      type: input.type,
      source: "GITHUB",
      description: redactSecrets(input.description),
      result: redactSecrets(input.result),
    },
  });
}

function uniqueFiles(path: string, value: unknown) {
  const files = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  if (path && !files.includes(path)) files.unshift(path);
  return files;
}

function escalationFor(classification: string, allowed: boolean) {
  if (classification === "REQUIREMENT_CHANGE") return "REQUIREMENT_AMBIGUITY" as const;
  if (classification === "ARCHITECTURE_CONCERN") return "ARCHITECTURE_CONFLICT" as const;
  if (classification === "SECURITY_CONCERN") return "SECURITY_CONCERN" as const;
  if (classification === "CODE_CHANGE_REQUEST" && !allowed) return "SCOPE_EXPANSION" as const;
  return null;
}

export { buildPullRequestBody, decidePullRequestReadiness, decideReleaseCandidate };

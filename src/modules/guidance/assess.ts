import { PRODUCT_STAGES, STAGE_META, type ProductStage } from "@/domain/constants";

import {
  STAGE_PROGRESS_LABEL,
  type BlockerView,
  type EvidenceItem,
  type GuidanceSnapshot,
  type NextAction,
  type ProductGuidance,
  type StageMark,
  type StageProgress,
  type TaskSnapshot,
} from "@/modules/guidance/types";

const PRODUCT = "Product decision required";
const ENGINEERING = "Engineering decision required";
const RELEASE = "Release decision required";

export function emptySnapshot(patch: Partial<GuidanceSnapshot> & Pick<GuidanceSnapshot, "productId">): GuidanceSnapshot {
  const base: GuidanceSnapshot = {
    productId: patch.productId,
    name: patch.name ?? "Product",
    stage: patch.stage ?? "EXPLORE",
    sample: patch.sample ?? false,
    startMode: patch.startMode ?? "IDEA",
    requirementsChanged: patch.requirementsChanged ?? false,
    intake: {
      activeSources: 0,
      extractionFailed: false,
      analysed: false,
      stale: false,
      unreviewed: 0,
      needsChange: 0,
      blockingFindings: 0,
      openQuestions: 0,
      materialUnmapped: 0,
      updatedAt: null,
    },
    discovery: {
      started: false,
      briefStatus: "NONE",
      readyForReview: false,
      openQuestions: 0,
      demo: false,
      updatedAt: null,
    },
    definition: {
      exists: false,
      status: "NONE",
      approved: false,
      proposalOpen: false,
      proposedOutcomes: 0,
      proposedCapabilities: 0,
      slice: "NONE",
      openQuestions: 0,
      demo: false,
      updatedAt: null,
      outcome: null,
    },
    design: {
      architecture: "NONE",
      architectureReview: false,
      architectureReviewReason: "",
      plan: "NONE",
      planReview: false,
      planReviewReason: "",
      demo: false,
      updatedAt: null,
    },
    review: {
      exists: false,
      approved: false,
      reviewRequired: false,
      reviewReason: "",
      openCritical: 0,
      openHighBeforeCoding: 0,
      policyApproved: false,
      policyReapproval: false,
      policyReason: "",
      demo: false,
      updatedAt: null,
    },
    tasks: [],
    prove: { sliceVerified: false, integrated: false, entryOpen: false, entryReason: "" },
    release: { real: null, demoOnly: false, readyToLearn: false, learnReason: "" },
    learn: { realEvidence: false, decisionRecorded: false, outcomeAchieved: false, updatedAt: null },
  };
  return {
    ...base,
    ...patch,
    discovery: { ...base.discovery, ...patch.discovery },
    definition: { ...base.definition, ...patch.definition },
    design: { ...base.design, ...patch.design },
    review: { ...base.review, ...patch.review },
    prove: { ...base.prove, ...patch.prove },
    release: { ...base.release, ...patch.release },
    learn: { ...base.learn, ...patch.learn },
    intake: { ...base.intake, ...patch.intake },
    tasks: patch.tasks ?? base.tasks,
  };
}

function link(productId: string, path: string, hash?: string) {
  return `/products/${productId}${path}${hash ? `#${hash}` : ""}`;
}

function action(
  snapshot: GuidanceSnapshot,
  input: Omit<NextAction, "href" | "waitingSince"> & { path: string; hash?: string; waitingSince?: string | null },
): NextAction {
  return {
    key: input.key,
    label: input.label,
    why: input.why,
    role: input.role,
    stage: input.stage,
    decision: input.decision,
    href: link(snapshot.productId, input.path, input.hash),
    waitingSince: input.waitingSince ?? null,
  };
}

function briefReady(snapshot: GuidanceSnapshot) {
  return snapshot.discovery.briefStatus === "READY_FOR_REVIEW" || snapshot.discovery.readyForReview;
}

function exploreDone(snapshot: GuidanceSnapshot) {
  return snapshot.discovery.briefStatus === "APPROVED";
}

function defineDone(snapshot: GuidanceSnapshot) {
  return snapshot.definition.approved && snapshot.definition.slice === "APPROVED";
}

function buildExit(snapshot: GuidanceSnapshot) {
  return snapshot.prove.sliceVerified;
}

function proveExit(snapshot: GuidanceSnapshot) {
  const release = snapshot.release.real;
  return Boolean(release && (release.approval === "CURRENT" || release.deployed || release.status === "APPROVED" || release.status === "DEPLOYED"));
}

function shipExit(snapshot: GuidanceSnapshot) {
  return snapshot.release.readyToLearn;
}

function gateDone(stage: ProductStage, snapshot: GuidanceSnapshot) {
  if (stage === "EXPLORE") return exploreDone(snapshot);
  if (stage === "DEFINE") return defineDone(snapshot);
  if (stage === "BUILD") return buildExit(snapshot);
  if (stage === "PROVE") return proveExit(snapshot);
  if (stage === "SHIP") return shipExit(snapshot);
  return false;
}

function existingRequirementsExplore(snapshot: GuidanceSnapshot): { action: NextAction | null; blocker: BlockerView | null } {
  const intake = snapshot.intake;
  if (intake.extractionFailed && intake.activeSources === 0) {
    return {
      action: action(snapshot, {
        key: "add-requirements",
        label: "Add your requirements",
        why: "Readable text could not be extracted. Paste the requirements or upload a file that contains text.",
        role: PRODUCT,
        stage: "EXPLORE",
        decision: false,
        path: "/discovery",
        hash: "add",
      }),
      blocker: blocker({
        what: "The requirements file could not be read",
        why: "No readable text was extracted. A scanned PDF is not read.",
        required: "Paste the requirements, or upload a .txt, .md, .docx, or text-based .pdf.",
        who: PRODUCT,
        next: "Nothing is analysed until readable text is stored.",
      }),
    };
  }
  if (intake.activeSources === 0) {
    return {
      action: action(snapshot, {
        key: "add-requirements",
        label: "Add your requirements",
        why: "Existing requirements are the source material. They are not a Product Brief yet.",
        role: PRODUCT,
        stage: "EXPLORE",
        decision: false,
        path: "/discovery",
        hash: "add",
      }),
      blocker: null,
    };
  }
  if (!intake.analysed || intake.stale) {
    return {
      action: action(snapshot, {
        key: "analyse-requirements",
        label: "Analyse requirements",
        why: intake.stale
          ? "The source changed, so the previous analysis is historical."
          : "Analysis extracts requirements and keeps the original wording.",
        role: PRODUCT,
        stage: "EXPLORE",
        decision: false,
        path: "/discovery",
        hash: "analyse",
        waitingSince: intake.updatedAt,
      }),
      blocker: intake.stale
        ? blocker({
            what: "The previous analysis is out of date",
            why: "The requirements source changed after it was analysed.",
            required: "Analyse the current source. The old analysis stays on record.",
            who: PRODUCT,
            next: "A person still confirms the new interpretation.",
          })
        : null,
    };
  }
  if (intake.blockingFindings > 0) {
    const count = intake.blockingFindings;
    return {
      action: action(snapshot, {
        key: "review-findings",
        label: count === 1 ? "Review 1 important finding" : `Review ${count} important findings`,
        why: "A material finding has to be understood before the Product Brief is reliable.",
        role: PRODUCT,
        stage: "EXPLORE",
        decision: true,
        path: "/discovery",
        hash: "findings",
        waitingSince: intake.updatedAt,
      }),
      blocker: blocker({
        what: "Requirements need clarification",
        why: "A possible conflict, ambiguity, or security question is still open.",
        required: "A person reviews the finding and answers the question it raises.",
        who: PRODUCT,
        next: "The Product Brief stays a draft until this is addressed.",
      }),
    };
  }
  if (intake.openQuestions > 0) {
    return {
      action: action(snapshot, {
        key: "answer-requirement-question",
        label: "Answer requirement question",
        why: "The question comes from the supplied requirements, not from a blank-sheet discovery.",
        role: PRODUCT,
        stage: "EXPLORE",
        decision: true,
        path: "/discovery",
        hash: "questions",
        waitingSince: intake.updatedAt,
      }),
      blocker: null,
    };
  }
  if (intake.needsChange > 0 || intake.unreviewed > 0) {
    return {
      action: action(snapshot, {
        key: "confirm-interpretation",
        label: "Confirm requirement interpretation",
        why: "The source wording stays as supplied. A person confirms or rejects the reading.",
        role: PRODUCT,
        stage: "EXPLORE",
        decision: false,
        path: "/discovery",
        hash: "requirements",
        waitingSince: intake.updatedAt,
      }),
      blocker: intake.needsChange > 0
        ? blocker({
            what: "A requirement could not be interpreted",
            why: "A person marked the reading as needing a change.",
            required: "Edit the interpretation or reject the requirement. The source text stays unchanged.",
            who: PRODUCT,
            next: "The Product Brief is not drafted from a rejected reading.",
          })
        : null,
    };
  }
  if (snapshot.discovery.briefStatus === "NONE" || snapshot.discovery.briefStatus === "DRAFT") {
    return {
      action: action(snapshot, {
        key: "review-requirements-brief",
        label: "Review requirements-derived Product Brief",
        why: "The brief is drafted from your requirements. It is not the customer's source text.",
        role: PRODUCT,
        stage: "EXPLORE",
        decision: true,
        path: "/discovery",
        hash: "brief",
        waitingSince: snapshot.discovery.updatedAt,
      }),
      blocker: null,
    };
  }
  return {
    action: action(snapshot, {
      key: "approve-brief",
      label: "Approve Product Brief",
      why: "The brief is the agreement about the problem. Approval does not move the stage.",
      role: PRODUCT,
      stage: "EXPLORE",
      decision: true,
      path: "/discovery",
      hash: "approve",
      waitingSince: snapshot.discovery.updatedAt,
    }),
    blocker: null,
  };
}

function chooseAction(snapshot: GuidanceSnapshot): { action: NextAction | null; blocker: BlockerView | null } {
  if (snapshot.requirementsChanged) {
    return {
      action: action(snapshot, {
        key: "review-changed-requirements",
        label: "Review changed requirements",
        why: "Requirements changed after the Product Definition was approved. The definition was not changed automatically.",
        role: PRODUCT,
        stage: snapshot.stage,
        decision: true,
        path: "/discovery",
        hash: "sources",
      }),
      blocker: null,
    };
  }
  const discovery = snapshot.discovery;
  if (snapshot.startMode === "EXISTING_REQUIREMENTS" && !exploreDone(snapshot)) {
    return existingRequirementsExplore(snapshot);
  }
  if (!exploreDone(snapshot)) {
    if (!discovery.started && discovery.briefStatus === "NONE") {
      return {
        action: action(snapshot, {
          key: "start-discovery",
          label: "Start Discovery",
          why: "Discovery turns the problem into a Product Brief a person can approve.",
          role: PRODUCT,
          stage: "EXPLORE",
          decision: false,
          path: "/discovery",
        }),
        blocker: null,
      };
    }
    if (discovery.openQuestions > 0 && discovery.briefStatus !== "APPROVED" && !briefReady(snapshot)) {
      const count = discovery.openQuestions;
      return {
        action: action(snapshot, {
          key: "answer-questions",
          label: count === 1 ? "Answer 1 open question" : `Answer ${count} open questions`,
          why: "Open questions are still part of understanding the problem.",
          role: PRODUCT,
          stage: "EXPLORE",
          decision: true,
          path: "/discovery",
          hash: "questions",
          waitingSince: discovery.updatedAt,
        }),
        blocker: null,
      };
    }
    if (briefReady(snapshot)) {
      return {
        action: action(snapshot, {
          key: "approve-brief",
          label: "Approve Product Brief",
          why: "The brief is the agreement about the problem. Approval does not move the stage.",
          role: PRODUCT,
          stage: "EXPLORE",
          decision: true,
          path: "/discovery",
          hash: "approve",
          waitingSince: discovery.updatedAt,
        }),
        blocker: null,
      };
    }
    return {
      action: action(snapshot, {
        key: "review-brief",
        label: "Review Product Brief",
        why: "The brief is still a draft. A person decides when it is ready to approve.",
        role: PRODUCT,
        stage: "EXPLORE",
        decision: true,
        path: "/discovery",
        hash: "brief",
        waitingSince: discovery.updatedAt,
      }),
      blocker: null,
    };
  }

  if (snapshot.stage === "EXPLORE") {
    return {
      action: action(snapshot, {
        key: "move-define",
        label: "Move to Define",
        why: "The Product Brief is approved. Moving to Define is a separate decision.",
        role: PRODUCT,
        stage: "EXPLORE",
        decision: false,
        path: "/discovery",
        hash: "move",
      }),
      blocker: null,
    };
  }

  const definition = snapshot.definition;
  if (!defineDone(snapshot)) {
    if (snapshot.startMode === "EXISTING_REQUIREMENTS" && snapshot.intake.materialUnmapped > 0 && definition.exists) {
      return {
        action: action(snapshot, {
          key: "review-unmapped",
          label: "Review unmapped requirements",
          why: "Confirmed requirements are not yet represented in the Product Definition.",
          role: PRODUCT,
          stage: "DEFINE",
          decision: true,
          path: "/definition",
          hash: "requirements",
          waitingSince: snapshot.intake.updatedAt,
        }),
        blocker: null,
      };
    }
    if (definition.proposalOpen) {
      return {
        action: action(snapshot, {
          key: "review-definition",
          label: "Review the draft definition",
          why: "AI proposed the definition. A person accepts what should be kept.",
          role: PRODUCT,
          stage: "DEFINE",
          decision: true,
          path: "/definition",
          hash: "proposal",
          waitingSince: definition.updatedAt,
        }),
        blocker: null,
      };
    }
    if (!definition.exists || definition.status === "NONE" || definition.status === "NOT_STARTED") {
      return {
        action: action(snapshot, {
          key: "draft-definition",
          label: "Draft the Product Definition",
          why: "Define records the outcome, the first slice, and the backlog.",
          role: PRODUCT,
          stage: "DEFINE",
          decision: false,
          path: "/definition",
        }),
        blocker: null,
      };
    }
    if (definition.proposedOutcomes > 0 || definition.proposedCapabilities > 0) {
      return {
        action: action(snapshot, {
          key: "confirm-definition",
          label: "Confirm the Product Definition",
          why: "Proposed outcomes and capabilities stay proposals until a person confirms them.",
          role: PRODUCT,
          stage: "DEFINE",
          decision: true,
          path: "/definition",
          hash: "outcomes",
          waitingSince: definition.updatedAt,
        }),
        blocker: null,
      };
    }
    if (definition.slice === "PROPOSED" || definition.slice === "NONE") {
      return {
        action: action(snapshot, {
          key: "confirm-slice",
          label: "Confirm First Slice",
          why: "The First Slice is the smallest part of the product you are committing to build.",
          role: PRODUCT,
          stage: "DEFINE",
          decision: true,
          path: "/definition",
          hash: "slice",
          waitingSince: definition.updatedAt,
        }),
        blocker: null,
      };
    }
    return {
      action: action(snapshot, {
        key: "approve-definition",
        label: "Approve Product Definition",
        why: "Approval records that the outcome and the first slice are the commitment. It does not move the stage.",
        role: PRODUCT,
        stage: "DEFINE",
        decision: true,
        path: "/definition",
        hash: "approve",
        waitingSince: definition.updatedAt,
      }),
      blocker: null,
    };
  }

  if (snapshot.stage === "DEFINE") {
    return {
      action: action(snapshot, {
        key: "move-build",
        label: "Move to Build",
        why: "The Product Brief, Product Definition, and First Slice are approved.",
        role: PRODUCT,
        stage: "DEFINE",
        decision: false,
        path: "/definition",
        hash: "move",
      }),
      blocker: null,
    };
  }

  const designBlock = designStep(snapshot);
  if (designBlock) return designBlock;
  const reviewBlock = reviewStep(snapshot);
  if (reviewBlock) return reviewBlock;
  const taskBlock = taskStep(snapshot);
  if (taskBlock) return taskBlock;

  if (snapshot.stage === "BUILD" && buildExit(snapshot)) {
    return {
      action: action(snapshot, {
        key: "move-prove",
        label: "Move to Prove",
        why: "Each task in the First Slice has an independent check. Moving stage stays a person's decision.",
        role: ENGINEERING,
        stage: "BUILD",
        decision: false,
        path: "/testing",
        hash: "move",
      }),
      blocker: null,
    };
  }

  return releaseStep(snapshot);
}

function designStep(snapshot: GuidanceSnapshot): { action: NextAction | null; blocker: BlockerView | null } | null {
  const design = snapshot.design;
  if (design.architectureReview) {
    return {
      action: null,
      blocker: blocker({
        what: "Design needs attention",
        why: design.architectureReviewReason || "The design changed after it was approved.",
        required: "Review the design again before coding continues.",
        who: ENGINEERING,
        next: "Coding stays closed until the design is current.",
      }),
    };
  }
  if (design.architecture !== "APPROVED") {
    if (design.architecture === "NONE") {
      return {
        action: action(snapshot, {
          key: "review-design",
          label: "Review Design",
          why: "Build starts by agreeing the technical approach for the First Slice.",
          role: ENGINEERING,
          stage: "BUILD",
          decision: true,
          path: "/build",
          hash: "design",
          waitingSince: design.updatedAt,
        }),
        blocker: null,
      };
    }
    return {
      action: action(snapshot, {
        key: "approve-design",
        label: "Approve Design",
        why: "The design stays a proposal until a person approves it.",
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "design",
        waitingSince: design.updatedAt,
      }),
      blocker: null,
    };
  }
  if (design.planReview) {
    return {
      action: null,
      blocker: blocker({
        what: "Delivery plan needs attention",
        why: design.planReviewReason || "The delivery plan changed after it was approved.",
        required: "Review the delivery plan again.",
        who: ENGINEERING,
        next: "Coding stays closed until the plan is current.",
      }),
    };
  }
  if (design.plan !== "APPROVED") {
    return {
      action: action(snapshot, {
        key: design.plan === "NONE" ? "review-plan" : "approve-plan",
        label: design.plan === "NONE" ? "Review Delivery Plan" : "Approve Delivery Plan",
        why: "The delivery plan is the ordered work for this slice.",
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "plan",
        waitingSince: design.updatedAt,
      }),
      blocker: null,
    };
  }
  return null;
}

function reviewStep(snapshot: GuidanceSnapshot): { action: NextAction; blocker: BlockerView | null } | null {
  const review = snapshot.review;
  if (review.reviewRequired || review.openCritical > 0 || review.openHighBeforeCoding > 0) {
    const why = review.reviewReason
      || (review.openCritical > 0
        ? "A critical engineering finding is still open."
        : "An engineering finding has to be resolved before coding.");
    return {
      action: action(snapshot, {
        key: "resolve-finding",
        label: "Resolve Engineering Finding",
        why,
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "review",
        waitingSince: review.updatedAt,
      }),
      blocker: blocker({
        what: "Engineering review needs attention",
        why,
        required: "Resolve the finding, or record a person's risk decision where the rules allow it.",
        who: ENGINEERING,
        next: "Coding stays closed while a blocking finding is open.",
      }),
    };
  }
  if (!review.approved) {
    return {
      action: action(snapshot, {
        key: "approve-review",
        label: "Approve Engineering Review",
        why: "An independent engineering review has to be accepted before coding.",
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "review",
        waitingSince: review.updatedAt,
      }),
      blocker: null,
    };
  }
  if (review.policyReapproval) {
    return {
      action: action(snapshot, {
        key: "approve-rules",
        label: "Approve Coding Rules",
        why: review.policyReason || "The coding rules changed after they were approved.",
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "review",
        waitingSince: review.updatedAt,
      }),
      blocker: blocker({
        what: "Coding rules need approval again",
        why: review.policyReason || "The approved coding rules are out of date.",
        required: "A person approves the coding rules again.",
        who: ENGINEERING,
        next: "Coding stays closed until the rules are current.",
      }),
    };
  }
  if (!review.policyApproved) {
    return {
      action: action(snapshot, {
        key: "approve-rules",
        label: "Approve Coding Rules",
        why: "Coding rules say what the coding assistant is allowed to change.",
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "review",
        waitingSince: review.updatedAt,
      }),
      blocker: null,
    };
  }
  return null;
}

function taskStep(snapshot: GuidanceSnapshot): { action: NextAction | null; blocker: BlockerView | null } | null {
  if (snapshot.tasks.length === 0) {
    return {
      action: action(snapshot, {
        key: "approve-task",
        label: "Approve Coding Task",
        why: "The delivery plan does not yet have a task to build.",
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "code",
      }),
      blocker: null,
    };
  }
  const task = snapshot.tasks.find((item) => !taskSettled(item));
  if (!task) return null;
  if (task.prohibited) {
    return {
      action: null,
      blocker: blocker({
        what: `Coding is blocked for ${task.title}`,
        why: "The engineering review marked this task prohibited.",
        required: "A person has to change the risk decision before any coding starts.",
        who: ENGINEERING,
        next: "The task stays closed.",
      }),
    };
  }
  if (task.humanOnly && task.status !== "COMPLETED") {
    return {
      action: null,
      blocker: blocker({
        what: `${task.title} needs a person to implement it`,
        why: "This task is not eligible for the coding assistant.",
        required: "An engineer implements it and records the change through the same approval.",
        who: ENGINEERING,
        next: "Independent check stays closed until the task is complete and approved.",
      }),
    };
  }
  if (task.contractStale) {
    return {
      action: null,
      blocker: blocker({
        what: "The approved coding instructions are out of date",
        why: "The task, the design, or the rules changed after coding started.",
        required: "Review the instructions, then resume or abandon this workspace.",
        who: ENGINEERING,
        next: "No further code is written until the instructions are current.",
      }),
    };
  }
  if (task.status === "PROPOSED" || task.status === "BLOCKED") {
    return {
      action: action(snapshot, {
        key: "approve-task",
        label: "Approve Coding Task",
        why: `${task.title} is the one task that can be built next.`,
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "code",
        waitingSince: task.updatedAt,
      }),
      blocker: null,
    };
  }
  if (task.codeApproval === "STALE") {
    return {
      action: action(snapshot, {
        key: "approve-change",
        label: "Approve Code Change",
        why: "The code changed after a person approved it, so the approval needs to be made again.",
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "code",
        waitingSince: task.updatedAt,
      }),
      blocker: blocker({
        what: "Code approval needs review again",
        why: "A later edit made the earlier approval out of date.",
        required: "A person reviews the latest change and approves it again.",
        who: ENGINEERING,
        next: "Independent check stays closed.",
      }),
    };
  }
  if (task.verification === "STALE") {
    return {
      action: null,
      blocker: blocker({
        what: "Verification needs to be repeated",
        why: "The implementation changed after the independent check.",
        required: "Run the independent check again and approve the new result.",
        who: ENGINEERING,
        next: "The previous check cannot be reused.",
      }),
    };
  }
  if ((task.status === "APPROVED" || task.status === "IN_PROGRESS") && task.workspace === "NONE") {
    return {
      action: action(snapshot, {
        key: "start-coding",
        label: "Start coding this task",
        why: `${task.title} is approved. The coding assistant works in an isolated workspace and cannot approve the result.`,
        role: ENGINEERING,
        stage: "BUILD",
        decision: false,
        path: "/build",
        hash: "code",
      }),
      blocker: null,
    };
  }
  if (task.codeApproval === "NONE" && task.workspace !== "NONE") {
    return {
      action: action(snapshot, {
        key: "review-change",
        label: "Review Code Change",
        why: `${task.title} has a change waiting for a person.`,
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "code",
        waitingSince: task.updatedAt,
      }),
      blocker: null,
    };
  }
  if (task.status !== "COMPLETED") {
    return {
      action: action(snapshot, {
        key: "approve-change",
        label: "Approve Code Change",
        why: `${task.title} is ready for a person's decision on the change.`,
        role: ENGINEERING,
        stage: "BUILD",
        decision: true,
        path: "/build",
        hash: "code",
        waitingSince: task.updatedAt,
      }),
      blocker: null,
    };
  }
  if (task.verification === "NONE" || task.verification === "DEMO") {
    return {
      action: action(snapshot, {
        key: "start-check",
        label: "Start Independent Check",
        why: task.verification === "DEMO"
          ? "The recorded check is sample data. A real independent check is still required."
          : `${task.title} is complete. The author of the code does not approve the check.`,
        role: ENGINEERING,
        stage: "PROVE",
        decision: false,
        path: "/testing",
        hash: "check",
      }),
      blocker: null,
    };
  }
  if (task.verification === "AWAITING") {
    return {
      action: action(snapshot, {
        key: "approve-verification",
        label: "Approve Verification",
        why: "The independent check has a result. A person decides whether it is enough.",
        role: ENGINEERING,
        stage: "PROVE",
        decision: true,
        path: "/testing",
        hash: "check",
        waitingSince: task.updatedAt,
      }),
      blocker: null,
    };
  }
  if (!task.published) {
    return {
      action: action(snapshot, {
        key: "publish-branch",
        label: "Publish Branch",
        why: "The approved commit stays local until a person publishes it.",
        role: ENGINEERING,
        stage: "PROVE",
        decision: false,
        path: "/testing",
        hash: "publish",
      }),
      blocker: null,
    };
  }
  if (task.pullRequest === "NONE" || task.pullRequest === "DEMO") {
    return {
      action: action(snapshot, {
        key: "create-pr",
        label: "Create Pull Request",
        why: "AI Product Builder opens the pull request. It does not merge it.",
        role: ENGINEERING,
        stage: "PROVE",
        decision: false,
        path: "/testing",
        hash: "publish",
      }),
      blocker: null,
    };
  }
  if (task.pullRequest === "OPEN") {
    return {
      action: action(snapshot, {
        key: "refresh-pr",
        label: "Refresh Pull Request",
        why: "A person merges the pull request in GitHub. Refresh reads that result back. AI Product Builder does not merge.",
        role: ENGINEERING,
        stage: "PROVE",
        decision: false,
        path: "/testing",
        hash: "publish",
        waitingSince: task.updatedAt,
      }),
      blocker: null,
    };
  }
  return null;
}

function taskSettled(task: TaskSnapshot) {
  return task.status === "COMPLETED" && task.verification === "APPROVED" && task.pullRequest === "MERGED" && !task.contractStale;
}

function releaseStep(snapshot: GuidanceSnapshot): { action: NextAction | null; blocker: BlockerView | null } {
  const release = snapshot.release.real;
  if (!release) {
    if (!snapshot.prove.entryOpen) {
      return {
        action: null,
        blocker: blocker({
          what: "A release record cannot be opened yet",
          why: snapshot.prove.entryReason || "The First Slice is not ready for a release record.",
          required: "Finish the independent checks and the merged pull request, then return to Ship.",
          who: RELEASE,
          next: "Ship stays closed. Nothing is deployed from here.",
        }),
      };
    }
    return {
      action: action(snapshot, {
        key: "review-release",
        label: "Review Release Candidate",
        why: snapshot.release.demoOnly
          ? "Sample release data is on this product and cannot be approved. A real release record is a separate step."
          : "The slice evidence can be gathered into a release record. A person still approves it.",
        role: RELEASE,
        stage: "SHIP",
        decision: true,
        path: "/releases",
      }),
      blocker: null,
    };
  }
  if (release.openBlockingRisks > 0) {
    return {
      action: action(snapshot, {
        key: "accept-risk",
        label: "Accept Release Risk",
        why: "A blocking release risk is still open.",
        role: RELEASE,
        stage: "SHIP",
        decision: true,
        path: "/releases",
        hash: "risk",
        waitingSince: release.updatedAt,
      }),
      blocker: null,
    };
  }
  if (release.approval === "STALE") {
    return {
      action: action(snapshot, {
        key: "approve-release",
        label: "Approve Release",
        why: release.staleReason || "The release changed after it was approved.",
        role: RELEASE,
        stage: "SHIP",
        decision: true,
        path: "/releases",
        hash: "approval",
        waitingSince: release.updatedAt,
      }),
      blocker: blocker({
        what: "Release approval needs review again",
        why: release.staleReason || "The approved release is out of date.",
        required: "A person approves this version again.",
        who: RELEASE,
        next: "The earlier approval stays on record and does not cover the new evidence.",
      }),
    };
  }
  if (release.approval !== "CURRENT" && release.status !== "APPROVED" && release.status !== "DEPLOYED") {
    return {
      action: action(snapshot, {
        key: "approve-release",
        label: "Approve Release",
        why: release.planApproved
          ? "The release record is waiting for a person's approval. AI Product Builder does not deploy it."
          : "Approve the deployment plan, including rollback, and then the release. AI Product Builder does not deploy it.",
        role: RELEASE,
        stage: "SHIP",
        decision: true,
        path: "/releases",
        hash: "approval",
        waitingSince: release.updatedAt,
      }),
      blocker: null,
    };
  }
  if (!release.deployed) {
    return {
      action: action(snapshot, {
        key: "record-deployment",
        label: "Record Deployment",
        why: "Deployment happens outside AI Product Builder. A person records what was deployed.",
        role: RELEASE,
        stage: "SHIP",
        decision: true,
        path: "/releases",
        hash: "deployment",
        waitingSince: release.updatedAt,
      }),
      blocker: null,
    };
  }
  if (!release.postChecksReady) {
    return {
      action: action(snapshot, {
        key: "record-check",
        label: "Record Post-Deployment Check",
        why: "A required check after deployment is still open.",
        role: RELEASE,
        stage: "SHIP",
        decision: true,
        path: "/releases",
        hash: "checks",
        waitingSince: release.updatedAt,
      }),
      blocker: null,
    };
  }
  if (snapshot.stage === "SHIP" && snapshot.release.readyToLearn) {
    return {
      action: action(snapshot, {
        key: "move-learn",
        label: "Move to Learn",
        why: "The deployment is recorded and the required checks are complete. The outcome is not achieved by deployment.",
        role: PRODUCT,
        stage: "SHIP",
        decision: false,
        path: "/metrics",
        hash: "move",
      }),
      blocker: null,
    };
  }
  if (!snapshot.learn.realEvidence) {
    return {
      action: action(snapshot, {
        key: "record-evidence",
        label: "Record Outcome Evidence",
        why: "Deployment does not mean the outcome was achieved. Record what you actually observed.",
        role: PRODUCT,
        stage: "LEARN",
        decision: true,
        path: "/metrics",
        hash: "evidence",
        waitingSince: snapshot.learn.updatedAt,
      }),
      blocker: null,
    };
  }
  if (!snapshot.learn.decisionRecorded) {
    return {
      action: action(snapshot, {
        key: "record-decision",
        label: "Record Learning Decision",
        why: "The evidence is recorded. A person decides whether to continue, change, or stop.",
        role: PRODUCT,
        stage: "LEARN",
        decision: true,
        path: "/metrics",
        hash: "decision",
        waitingSince: snapshot.learn.updatedAt,
      }),
      blocker: null,
    };
  }
  return { action: null, blocker: null };
}

function blocker(input: BlockerView): BlockerView {
  return input;
}

function stageStatus(stage: ProductStage, snapshot: GuidanceSnapshot, next: NextAction | null, blocked: boolean): StageProgress {
  const index = PRODUCT_STAGES.indexOf(stage);
  const current = PRODUCT_STAGES.indexOf(snapshot.stage);
  const done = gateDone(stage, snapshot);
  if (index < current) {
    if (!done && next?.stage === stage) return next.decision ? "WAITING_FOR_YOU" : "IN_PROGRESS";
    return done ? "COMPLETED" : "BLOCKED";
  }
  if (index > current) return "NOT_STARTED";
  if (next && PRODUCT_STAGES.indexOf(next.stage) < current) return "BLOCKED";
  if (blocked) return "BLOCKED";
  if (next?.stage === stage && next.key.startsWith("move-")) return "READY_TO_MOVE";
  if (next?.stage === stage && next.decision) return "WAITING_FOR_YOU";
  return "IN_PROGRESS";
}

function evidence(snapshot: GuidanceSnapshot): ProductGuidance["evidence"] {
  const items: EvidenceItem[] = [
    item("Product Brief", snapshot.discovery.briefStatus === "APPROVED", snapshot.discovery.demo, snapshot.discovery.briefStatus === "NONE" ? "No brief yet." : "Waiting for approval."),
    item("Product Definition", snapshot.definition.approved, snapshot.definition.demo, "Not approved."),
    item("First Slice", snapshot.definition.slice === "APPROVED", snapshot.definition.demo, snapshot.definition.slice === "NONE" ? "No First Slice yet." : "Not confirmed."),
    item("Design", snapshot.design.architecture === "APPROVED" && !snapshot.design.architectureReview, snapshot.design.demo, snapshot.design.architectureReview ? "Needs review again." : "Not approved."),
    item("Delivery Plan", snapshot.design.plan === "APPROVED" && !snapshot.design.planReview, snapshot.design.demo, snapshot.design.planReview ? "Needs review again." : "Not approved."),
    item(
      "Engineering Review",
      snapshot.review.approved && !snapshot.review.reviewRequired && snapshot.review.openCritical === 0,
      snapshot.review.demo,
      snapshot.review.reviewRequired ? "Needs review again." : "Not approved.",
    ),
    item("Code approval", snapshot.tasks.some((task) => task.codeApproval === "CURRENT"), false, snapshot.tasks.some((task) => task.codeApproval === "STALE") ? "Needs review again." : "No current code approval."),
    item("Independent check", snapshot.prove.sliceVerified, snapshot.tasks.some((task) => task.verification === "DEMO"), "Not approved for the slice."),
    item("Pull request merged", snapshot.tasks.length > 0 && snapshot.tasks.every((task) => task.pullRequest === "MERGED"), snapshot.tasks.some((task) => task.pullRequest === "DEMO"), "Not merged."),
    item(
      "Release",
      Boolean(snapshot.release.real && (snapshot.release.real.approval === "CURRENT" || snapshot.release.real.deployed)),
      snapshot.release.demoOnly && !snapshot.release.real,
      snapshot.release.real?.approval === "STALE" ? "Needs review again." : "No approved release.",
    ),
  ];
  const problem = items.find((entry) => entry.state !== "ready");
  return {
    ready: !problem,
    summary: !problem
      ? "Ready because the brief, definition, slice, design, engineering review, code, independent check, pull request, and release are current."
      : problem.state === "stale"
        ? `Not ready because ${problem.label} needs review again.`
        : problem.state === "demo"
          ? `Not ready because ${problem.label} is sample data and does not satisfy this gate.`
          : `Not ready because ${problem.note}`,
    items,
  };
}

function item(label: string, ok: boolean, demo: boolean, missingNote: string): EvidenceItem {
  if (demo) return { label, state: "demo", note: "Sample data. It does not satisfy this gate." };
  if (missingNote === "Needs review again." && !ok) return { label, state: "stale", note: missingNote };
  if (ok) return { label, state: "ready", note: "Current." };
  return { label, state: "missing", note: missingNote };
}

function risk(snapshot: GuidanceSnapshot) {
  if (snapshot.review.openCritical > 0) return "A critical engineering finding is open.";
  if (snapshot.review.reviewRequired) return snapshot.review.reviewReason || "Engineering review needs attention.";
  if (snapshot.release.real && snapshot.release.real.openBlockingRisks > 0) return "A blocking release risk is open.";
  if (snapshot.release.real?.approval === "STALE") return "Release approval needs review again.";
  if (snapshot.release.demoOnly) return "Sample release data is present. It cannot be approved or deployed as a real release.";
  return null;
}

export function assessGuidance(snapshot: GuidanceSnapshot): ProductGuidance {
  const chosen = chooseAction(snapshot);
  const blocked = Boolean(chosen.blocker);
  const stages: StageMark[] = PRODUCT_STAGES.map((stage) => {
    const status = stageStatus(stage, snapshot, chosen.action, blocked);
    return { stage, status, label: STAGE_PROGRESS_LABEL[status] };
  });
  return {
    productId: snapshot.productId,
    name: snapshot.name,
    sample: snapshot.sample,
    stage: snapshot.stage,
    stages,
    action: chosen.action,
    blocker: chosen.blocker,
    outcome: snapshot.definition.outcome,
    risk: risk(snapshot),
    evidence: evidence(snapshot),
  };
}

export function stageLabel(stage: ProductStage) {
  return STAGE_META[stage].label;
}

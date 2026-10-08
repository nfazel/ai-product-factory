-- CreateEnum
CREATE TYPE "ReleaseCandidateStatus" AS ENUM ('DRAFT', 'ASSESSING', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'DEPLOYED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReleaseItemType" AS ENUM ('FEATURE', 'STORY', 'IMPLEMENTATION_TASK', 'DEFECT_FIX', 'OTHER');

-- CreateEnum
CREATE TYPE "ReleaseEvidenceType" AS ENUM ('PRODUCT_APPROVAL', 'REQUIREMENT_TRACEABILITY', 'ARCHITECTURE_APPROVAL', 'GOVERNANCE_APPROVAL', 'CODE_APPROVAL', 'VERIFICATION_APPROVAL', 'CI_RESULT', 'PULL_REQUEST_REVIEW', 'PULL_REQUEST_MERGE', 'DEFECT_STATUS', 'INTEGRATED_VERIFICATION', 'MANUAL_EVIDENCE', 'DEPLOYMENT_EVIDENCE', 'POST_DEPLOYMENT_CHECK');

-- CreateEnum
CREATE TYPE "ReleaseEvidenceSource" AS ENUM ('FACTORY', 'GITHUB', 'COMMAND_RUNNER', 'HUMAN', 'EXTERNAL_FUTURE', 'DEMO');

-- CreateEnum
CREATE TYPE "ReleaseRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReleaseRiskCategory" AS ENUM ('QUALITY', 'SECURITY', 'DATA', 'INTEGRATION', 'OPERABILITY', 'DEPLOYMENT', 'ROLLBACK', 'OBSERVABILITY', 'DEPENDENCY', 'COMPLIANCE', 'BUSINESS', 'OTHER');

-- CreateEnum
CREATE TYPE "ReleaseRiskStatus" AS ENUM ('OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReleaseQuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DeploymentPlanStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DeploymentStrategy" AS ENUM ('MANUAL', 'ROLLING', 'BLUE_GREEN', 'CANARY', 'FEATURE_FLAG', 'OTHER');

-- CreateEnum
CREATE TYPE "DeploymentCheckPhase" AS ENUM ('PRE_DEPLOYMENT', 'POST_DEPLOYMENT', 'ROLLBACK');

-- CreateEnum
CREATE TYPE "DeploymentCheckStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'WAIVED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "OperationalArea" AS ENUM ('MONITORING', 'LOGGING', 'ALERTING', 'SUPPORT', 'RUNBOOK', 'ROLLBACK', 'DEPENDENCIES', 'DATA_MIGRATION', 'CONFIGURATION', 'FEATURE_FLAGS', 'INCIDENT_RESPONSE');

-- CreateEnum
CREATE TYPE "DeploymentRecordStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ReleaseIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReleaseIssueCategory" AS ENUM ('FUNCTIONAL', 'PERFORMANCE', 'SECURITY', 'DATA', 'INTEGRATION', 'OPERABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ReleaseIssueStatus" AS ENUM ('OPEN', 'MITIGATED', 'RESOLVED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "LearningDecision" AS ENUM ('CONTINUE', 'ITERATE', 'PIVOT', 'STOP', 'SCALE', 'INVESTIGATE');

-- CreateEnum
CREATE TYPE "LearningProposalKind" AS ENUM ('DISCOVERY_QUESTION', 'REQUIREMENT', 'PRODUCT_SLICE', 'DEFECT', 'IMPROVEMENT');

-- CreateEnum
CREATE TYPE "LearningProposalStatus" AS ENUM ('PROPOSED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ReleaseNotesStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateTable
CREATE TABLE "ReleaseCandidate" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSliceId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ReleaseCandidateStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceCommitSummary" JSONB NOT NULL DEFAULT '[]',
    "evidenceFingerprint" TEXT NOT NULL DEFAULT '',
    "releaseNotes" TEXT NOT NULL DEFAULT '',
    "releaseNotesStatus" "ReleaseNotesStatus" NOT NULL DEFAULT 'DRAFT',
    "releaseNotesApprovedBy" TEXT NOT NULL DEFAULT '',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseCandidateItem" (
    "id" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "implementationTaskId" TEXT,
    "workItemId" TEXT,
    "pullRequestRecordId" TEXT,
    "verificationSessionId" TEXT,
    "type" "ReleaseItemType" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseCandidateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseEvidence" (
    "id" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "type" "ReleaseEvidenceType" NOT NULL,
    "source" "ReleaseEvidenceSource" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "referenceId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseRiskAssessment" (
    "id" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "overallRisk" "ReleaseRiskLevel" NOT NULL DEFAULT 'LOW',
    "summary" TEXT NOT NULL DEFAULT '',
    "narrative" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseRiskFactor" (
    "id" TEXT NOT NULL,
    "releaseRiskAssessmentId" TEXT NOT NULL,
    "category" "ReleaseRiskCategory" NOT NULL,
    "severity" "ReleaseRiskLevel" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '',
    "mitigation" TEXT NOT NULL DEFAULT '',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReleaseRiskStatus" NOT NULL DEFAULT 'OPEN',
    "acceptedBy" TEXT NOT NULL DEFAULT '',
    "acceptedRationale" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseRiskFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseQuestion" (
    "id" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "impact" "SignalLevel" NOT NULL DEFAULT 'MEDIUM',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReleaseQuestionStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT NOT NULL DEFAULT '',
    "answeredBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReleaseQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentPlan" (
    "id" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DeploymentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "environment" TEXT NOT NULL DEFAULT '',
    "strategy" "DeploymentStrategy" NOT NULL DEFAULT 'MANUAL',
    "summary" TEXT NOT NULL DEFAULT '',
    "deploymentSteps" JSONB NOT NULL DEFAULT '[]',
    "rollbackTrigger" TEXT NOT NULL DEFAULT '',
    "rollbackSteps" TEXT NOT NULL DEFAULT '',
    "rollbackDataImplications" TEXT NOT NULL DEFAULT '',
    "rollbackRole" TEXT NOT NULL DEFAULT '',
    "rollbackVerification" TEXT NOT NULL DEFAULT '',
    "rollbackUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "rollbackAcknowledgement" TEXT NOT NULL DEFAULT '',
    "rollbackAcknowledgedBy" TEXT NOT NULL DEFAULT '',
    "plannedWindow" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentCheck" (
    "id" TEXT NOT NULL,
    "deploymentPlanId" TEXT NOT NULL,
    "phase" "DeploymentCheckPhase" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "DeploymentCheckStatus" NOT NULL DEFAULT 'PENDING',
    "waiverRationale" TEXT NOT NULL DEFAULT '',
    "evidenceId" TEXT NOT NULL DEFAULT '',
    "completedBy" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalReadinessAssessment" (
    "id" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalReadinessAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalReadinessArea" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "area" "OperationalArea" NOT NULL,
    "rating" "SignalLevel" NOT NULL DEFAULT 'LOW',
    "relevant" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalReadinessArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseApproval" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "deploymentPlanId" TEXT,
    "deploymentPlanVersion" INTEGER NOT NULL DEFAULT 0,
    "evidenceFingerprint" TEXT NOT NULL,
    "riskState" TEXT NOT NULL DEFAULT '',
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "staleReason" TEXT NOT NULL DEFAULT '',
    "staleFlaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentRecord" (
    "id" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "deploymentPlanId" TEXT,
    "environment" TEXT NOT NULL DEFAULT '',
    "status" "DeploymentRecordStatus" NOT NULL,
    "deployedVersion" TEXT NOT NULL DEFAULT '',
    "deployedCommitSha" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "performedBy" TEXT NOT NULL DEFAULT '',
    "externalReference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseIssue" (
    "id" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "deploymentRecordId" TEXT,
    "severity" "ReleaseIssueSeverity" NOT NULL,
    "category" "ReleaseIssueCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReleaseIssueStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReleaseIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseOutcome" (
    "id" TEXT NOT NULL,
    "releaseCandidateId" TEXT NOT NULL,
    "deploymentSuccessful" BOOLEAN NOT NULL DEFAULT false,
    "rollbackRequired" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL DEFAULT '',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeObservation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productOutcomeId" TEXT NOT NULL,
    "releaseCandidateId" TEXT,
    "measure" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'HUMAN',
    "evidenceReference" TEXT NOT NULL DEFAULT '',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OutcomeObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningRecord" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "releaseCandidateId" TEXT,
    "productOutcomeId" TEXT,
    "observation" TEXT NOT NULL,
    "interpretation" TEXT NOT NULL DEFAULT '',
    "decision" "LearningDecision" NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningProposal" (
    "id" TEXT NOT NULL,
    "learningRecordId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "LearningProposalKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "LearningProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdRecordId" TEXT NOT NULL DEFAULT '',
    "confirmedBy" TEXT NOT NULL DEFAULT '',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReleaseCandidate_productId_idx" ON "ReleaseCandidate"("productId");

-- CreateIndex
CREATE INDEX "ReleaseCandidate_productSliceId_idx" ON "ReleaseCandidate"("productSliceId");

-- CreateIndex
CREATE INDEX "ReleaseCandidate_status_idx" ON "ReleaseCandidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseCandidate_productId_version_key" ON "ReleaseCandidate"("productId", "version");

-- CreateIndex
CREATE INDEX "ReleaseCandidateItem_releaseCandidateId_idx" ON "ReleaseCandidateItem"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "ReleaseCandidateItem_implementationTaskId_idx" ON "ReleaseCandidateItem"("implementationTaskId");

-- CreateIndex
CREATE INDEX "ReleaseCandidateItem_workItemId_idx" ON "ReleaseCandidateItem"("workItemId");

-- CreateIndex
CREATE INDEX "ReleaseEvidence_releaseCandidateId_idx" ON "ReleaseEvidence"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "ReleaseEvidence_type_idx" ON "ReleaseEvidence"("type");

-- CreateIndex
CREATE INDEX "ReleaseEvidence_source_idx" ON "ReleaseEvidence"("source");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseRiskAssessment_releaseCandidateId_key" ON "ReleaseRiskAssessment"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "ReleaseRiskFactor_releaseRiskAssessmentId_idx" ON "ReleaseRiskFactor"("releaseRiskAssessmentId");

-- CreateIndex
CREATE INDEX "ReleaseRiskFactor_status_idx" ON "ReleaseRiskFactor"("status");

-- CreateIndex
CREATE INDEX "ReleaseQuestion_releaseCandidateId_idx" ON "ReleaseQuestion"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "ReleaseQuestion_status_idx" ON "ReleaseQuestion"("status");

-- CreateIndex
CREATE INDEX "DeploymentPlan_releaseCandidateId_idx" ON "DeploymentPlan"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "DeploymentPlan_status_idx" ON "DeploymentPlan"("status");

-- CreateIndex
CREATE INDEX "DeploymentCheck_deploymentPlanId_idx" ON "DeploymentCheck"("deploymentPlanId");

-- CreateIndex
CREATE INDEX "DeploymentCheck_phase_idx" ON "DeploymentCheck"("phase");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalReadinessAssessment_releaseCandidateId_key" ON "OperationalReadinessAssessment"("releaseCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalReadinessArea_assessmentId_area_key" ON "OperationalReadinessArea"("assessmentId", "area");

-- CreateIndex
CREATE INDEX "ReleaseApproval_productId_idx" ON "ReleaseApproval"("productId");

-- CreateIndex
CREATE INDEX "ReleaseApproval_releaseCandidateId_idx" ON "ReleaseApproval"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "ReleaseApproval_approvalId_idx" ON "ReleaseApproval"("approvalId");

-- CreateIndex
CREATE INDEX "DeploymentRecord_releaseCandidateId_idx" ON "DeploymentRecord"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "DeploymentRecord_status_idx" ON "DeploymentRecord"("status");

-- CreateIndex
CREATE INDEX "ReleaseIssue_releaseCandidateId_idx" ON "ReleaseIssue"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "ReleaseIssue_status_idx" ON "ReleaseIssue"("status");

-- CreateIndex
CREATE INDEX "ReleaseIssue_severity_idx" ON "ReleaseIssue"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseOutcome_releaseCandidateId_key" ON "ReleaseOutcome"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "OutcomeObservation_productId_idx" ON "OutcomeObservation"("productId");

-- CreateIndex
CREATE INDEX "OutcomeObservation_productOutcomeId_idx" ON "OutcomeObservation"("productOutcomeId");

-- CreateIndex
CREATE INDEX "OutcomeObservation_releaseCandidateId_idx" ON "OutcomeObservation"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "LearningRecord_productId_idx" ON "LearningRecord"("productId");

-- CreateIndex
CREATE INDEX "LearningRecord_releaseCandidateId_idx" ON "LearningRecord"("releaseCandidateId");

-- CreateIndex
CREATE INDEX "LearningProposal_learningRecordId_idx" ON "LearningProposal"("learningRecordId");

-- CreateIndex
CREATE INDEX "LearningProposal_productId_idx" ON "LearningProposal"("productId");

-- CreateIndex
CREATE INDEX "LearningProposal_status_idx" ON "LearningProposal"("status");

-- AddForeignKey
ALTER TABLE "ReleaseCandidate" ADD CONSTRAINT "ReleaseCandidate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseCandidate" ADD CONSTRAINT "ReleaseCandidate_productSliceId_fkey" FOREIGN KEY ("productSliceId") REFERENCES "ProductSlice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseCandidateItem" ADD CONSTRAINT "ReleaseCandidateItem_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseCandidateItem" ADD CONSTRAINT "ReleaseCandidateItem_implementationTaskId_fkey" FOREIGN KEY ("implementationTaskId") REFERENCES "ImplementationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseCandidateItem" ADD CONSTRAINT "ReleaseCandidateItem_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseCandidateItem" ADD CONSTRAINT "ReleaseCandidateItem_pullRequestRecordId_fkey" FOREIGN KEY ("pullRequestRecordId") REFERENCES "PullRequestRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseCandidateItem" ADD CONSTRAINT "ReleaseCandidateItem_verificationSessionId_fkey" FOREIGN KEY ("verificationSessionId") REFERENCES "VerificationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseEvidence" ADD CONSTRAINT "ReleaseEvidence_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRiskAssessment" ADD CONSTRAINT "ReleaseRiskAssessment_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRiskFactor" ADD CONSTRAINT "ReleaseRiskFactor_releaseRiskAssessmentId_fkey" FOREIGN KEY ("releaseRiskAssessmentId") REFERENCES "ReleaseRiskAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseQuestion" ADD CONSTRAINT "ReleaseQuestion_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentPlan" ADD CONSTRAINT "DeploymentPlan_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentCheck" ADD CONSTRAINT "DeploymentCheck_deploymentPlanId_fkey" FOREIGN KEY ("deploymentPlanId") REFERENCES "DeploymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalReadinessAssessment" ADD CONSTRAINT "OperationalReadinessAssessment_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalReadinessArea" ADD CONSTRAINT "OperationalReadinessArea_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "OperationalReadinessAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseApproval" ADD CONSTRAINT "ReleaseApproval_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseApproval" ADD CONSTRAINT "ReleaseApproval_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseApproval" ADD CONSTRAINT "ReleaseApproval_deploymentPlanId_fkey" FOREIGN KEY ("deploymentPlanId") REFERENCES "DeploymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentRecord" ADD CONSTRAINT "DeploymentRecord_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentRecord" ADD CONSTRAINT "DeploymentRecord_deploymentPlanId_fkey" FOREIGN KEY ("deploymentPlanId") REFERENCES "DeploymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseIssue" ADD CONSTRAINT "ReleaseIssue_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseIssue" ADD CONSTRAINT "ReleaseIssue_deploymentRecordId_fkey" FOREIGN KEY ("deploymentRecordId") REFERENCES "DeploymentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseOutcome" ADD CONSTRAINT "ReleaseOutcome_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeObservation" ADD CONSTRAINT "OutcomeObservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeObservation" ADD CONSTRAINT "OutcomeObservation_productOutcomeId_fkey" FOREIGN KEY ("productOutcomeId") REFERENCES "ProductOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeObservation" ADD CONSTRAINT "OutcomeObservation_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecord" ADD CONSTRAINT "LearningRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecord" ADD CONSTRAINT "LearningRecord_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecord" ADD CONSTRAINT "LearningRecord_productOutcomeId_fkey" FOREIGN KEY ("productOutcomeId") REFERENCES "ProductOutcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProposal" ADD CONSTRAINT "LearningProposal_learningRecordId_fkey" FOREIGN KEY ("learningRecordId") REFERENCES "LearningRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

# Existing requirements

Some products already have business requirements, a BRD, user stories, acceptance criteria, a backlog, an RFP, a statement of work, or a list of constraints. AI Product Builder can take that material in during Explore. It does not add a lifecycle stage, a separate requirements product, or another agent.

The lifecycle stays Explore, Define, Build, Prove, Ship, and Learn.

## Start mode

Create Product asks what you are starting with.

- **I have an idea.** Explore keeps Product Discovery.
- **I already have requirements.** Explore opens Requirements Intake.

The choice is stored on the product as `IDEA` or `EXISTING_REQUIREMENTS`. Products created before this choice default to `IDEA` and keep their current behaviour. Home and the product header can show Explore · Idea or Explore · Existing requirements. Both are the same kind of product.

## What a source is

Supplied requirements are source material. They are not automatically correct, complete, approved, buildable, consistent, or current.

The product keeps five separate layers:

- **Source.** The text that was pasted or extracted. It is not rewritten when analysis changes.
- **AI interpretation.** A reading of that text, stored beside it.
- **AI-identified gap.** A finding or question. A conflict is described as possible until a person decides.
- **Human confirmation.** Unreviewed, confirmed, needs change, or rejected. A person may edit the interpretation. Rejection does not delete the source line.
- **Approved Product Definition.** The same definition model used by idea mode, after the Product Brief and the definition are approved by a person.

## Supported input

Paste accepts plain text or Markdown, up to 200,000 characters.

Upload accepts `.txt`, `.md`, `.docx`, and `.pdf`, up to 2 MB. Text, Markdown, and Word documents are read as text. A PDF is read only when it already contains text. There is no OCR. If a PDF is a scan or otherwise has no readable text, the product says so and does not invent content. A failed extraction is stored as a failed source so the attempt is visible.

A product can hold more than one paste or upload. Replacing a document creates a new source record. The previous source and its analysis stay in history.

## File safety

Uploads are untrusted. The product checks the extension and the size, stores the bytes under a generated name (`data/requirement-uploads/<product id>/<uuid>.bin`), and keeps the original filename only as a label. That label cannot contain a path. The model does not choose the storage path. Macros, scripts, and uploaded programs are not run. Requirement text cannot start a tool, a Git command, a pull request, a deployment, or an approval.

## Analysis

Analysis uses the existing requirements model call and records an AgentRun with purpose `existing-requirements-analysis`. It does not register a new agent. The run stores source ids and hashes, not secrets.

The model must return a fixed structure. Counts on the summary are calculated from the saved rows. The model cannot supply those numbers. Each extracted line must be a verbatim excerpt of the source. Lines that are not in the source are dropped. If none remain, nothing is saved.

Each line can be classified as business, functional, non-functional, security, regulatory, data, integration, technical constraint, user experience, operational, or unknown. Unknown is kept when the type is unclear.

A source hash is the SHA-256 of the exact stored text. The analysis records the hash it used. If the source changes, that analysis becomes stale and is not applied to the new text. An approved Product Definition is not automatically revoked. The product asks a person to review the change.

## Findings, questions, and readiness

Findings cover ambiguity, incompleteness, a possible conflict, potential duplication, missing acceptance criteria, a missing outcome, an unconfirmed assumption, a missing actor, a missing business rule, an untestable line, a security question, an NFR gap, a dependency, or another note. Severity is info, low, medium, or high.

Every finding points at one or more source lines, or it records a source-level gap. Duplicate lines are linked, not deleted.

Questions come from those findings. A person answers them. The answer is stored on the question. The source line stays as supplied. A later analysis can read the answer. Blocking questions come before cosmetic ones.

Readiness is calculated, not scored by a model:

- **Not ready.** No source, extraction failed, analysis missing or stale, an unresolved high-severity conflict, ambiguity, security question, or missing outcome, a requirement marked needs change, or no confirmed interpretation.
- **Needs attention.** Unreviewed lines, open medium findings, or an open question that is not low severity.
- **Ready for definition.** The material checks are done. A low finding can remain.

Ready for definition means a person can review the Product Brief. It does not approve the brief or the definition.

## Product Brief and Define

The brief is labelled **Drafted from your requirements**. If the source does not state the problem, the user, or the outcome, the analysis leaves that field empty and asks. It does not invent them. A person edits and approves the brief. Move to Define still requires that approval.

Definition generation uses confirmed interpretations, human answers, and the approved brief. Rejected interpretations are not requirements. Open high-severity findings are passed in as warnings, and definition approval stops while those findings are still open.

Confirmed requirements that are in scope and have no definition link are unmapped. Approval names them and stops until a person links them or records a disposition. Dispositions are in scope, out of scope, deferred, duplicate, superseded, or not a requirement. Anything other than in scope needs a short reason. Analysis cannot set the final disposition.

Define shows the counts and a drill-down: source wording, location, classification, both interpretations, findings, questions, disposition, and links.

## Traceability

`RequirementTraceLink` connects a source requirement to an outcome, a capability, a work item, an acceptance criterion, or a non-functional requirement. Provenance is either proposed by analysis or confirmed by a person. A proposed link is not displayed as a human confirmation. Confirming the link keeps the human provenance if analysis runs again.

## Sample

The Claims Requirements Sample is a labelled product. It contains R-01 through R-06, including a missing approval threshold, a possible conflict between editing a submitted claim and leaving it unchanged, and an audit-trail requirement. One question has a sample answer. The conflict and the threshold stay open. It does not include Build, Prove, or Ship history. The full demo seed adds this product without removing it when the sample already exists. Reseeding the whole database still replaces demo data.

## What intake does not do

It does not approve imported requirements, discard a source line, resolve a conflict, start coding, or bypass the Product Brief, Product Definition, or First Slice. Build, Prove, and Ship controls are unchanged.

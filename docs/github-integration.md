# GitHub integration

GitHub is a delivery integration. It is not an agent. The factory publishes work a person has already approved, then reads pull request state, checks, and reviews back from GitHub.

The pipeline stays Explore, Define, Build, Prove, Ship, Learn. Publishing a branch does not move the product stage and does not deploy anything.

## Authentication

Production should use a GitHub App:

- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_OWNER`
- `GITHUB_REPOSITORY`

The app installation token is minted on the server and is not stored. For local development, a personal access token in `GITHUB_TOKEN` is enough, together with the owner and repository name.

`GITHUB_MINIMUM_HUMAN_APPROVALS` defaults to 1. `GITHUB_SERVICE_ACCOUNT` names a login that must not count as a human reviewer.

The browser cannot set these values. Settings shows owner, repository, default branch, and connection status. It never shows a token. A connection is **CONNECTED** only after **Validate Connection** succeeds. The presence of an environment variable is not treated as success.

Status is **CONNECTED**, **MISCONFIGURED**, or **UNAVAILABLE**. Authentication failure, rate limit, and GitHub being down are unavailable. A missing repository, a push permission failure, or a local `origin` that does not match `owner/repository` is misconfigured.

## Provider

`SourceControlProvider` is the only source-control boundary. UI components and domain services do not call the GitHub API. The interface can read a repository, push a branch, open a pull request, and read files, reviews, comments, checks, commit status, and branch protection.

There is no merge method. No agent receives one.

`GitHubSourceControlProvider` maps GitHub responses into that interface. Tests use `FakeSourceControlProvider` and do not need a GitHub account. A failed check stays a failure. The mapper does not turn a green command into acceptance-criterion verification.

## Repository mapping

Each product still has one `Repository` row. Provider is `LOCAL` or `GITHUB`. The row stores owner, repository name, URL, default branch, remote name, and an optional installation id. It does not store a token.

The browser cannot point the factory at an arbitrary GitHub repository. Publication uses the owner and repository from the validated connection.

## Safe publication

**Publish Branch** is a human action. It runs only when the implementation task is completed, the code approval matches the current commit, the execution contract is current, coding policy and engineering governance are current, no coding escalation is open, and the GitHub connection is valid. Every failed condition is listed. Nothing is pushed.

The push is a normal fast-forward. The argument list is built by `buildPublishArguments` and cannot contain `--force`. If the remote branch exists and is not an ancestor of the local commit, publication stops with **REMOTE BRANCH DIVERGENCE**. A person resolves that outside the factory.

The Coding Agent still cannot push. Its git helper rejects `push`.

## Evidence

Branch publication, the remote commit, pull request creation, each CI check, a human review, and a merge reported by GitHub are stored as `SourceControlEvidence` with source `GITHUB`. Demo rows use source `DEMO` and are labelled demo data. The model cannot insert these events.

A check named `build` proves only that the build check succeeded.

## Failures

Authentication failure, a missing repository, permission denied, a rejected push, divergence, rate limit, GitHub being unavailable, an unknown CI result, a deleted remote branch, a closed pull request, and a changed default branch keep their own messages. They are not stored as agent failures. Refresh is manual. There is no background poll, and a rate limit tells the person when to retry.

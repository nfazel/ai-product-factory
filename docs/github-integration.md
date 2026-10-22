# GitHub integration

GitHub is a delivery integration. It is not an agent. The factory publishes work a person has already approved, then reads pull request state, checks, and reviews back from GitHub.

The pipeline stays Explore, Define, Build, Prove, Ship, Learn. Publishing a branch does not move the product stage and does not deploy anything.

## Authentication

GitHub authentication belongs to AI Product Builder. Settings stores either a GitHub App (preferred) or a fine-grained personal access token. The credential is encrypted with `AI_CREDENTIAL_ENCRYPTION_KEY`, the same key used for AI provider credentials. After it is saved, the browser receives a masked value, not the credential.

A person validates the connection from Settings. Validation records the GitHub login. Saving a credential does not call GitHub, and neither saving nor validation creates a repository, pushes, or merges.

Environment variables remain an optional server fallback:

- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPOSITORY`

A GitHub App configured in the environment is used before a token saved in Settings. The app installation token is minted on the server and is not stored. The presence of an environment variable is not treated as a connection until validation succeeds.

`GITHUB_MINIMUM_HUMAN_APPROVALS` defaults to 1. `GITHUB_SERVICE_ACCOUNT` names a login that must not count as a human reviewer.

Settings states are Not configured, Saved, Connected, Invalid credentials, and Insufficient permissions. Each state names the next action.

## Provider

`SourceControlProvider` is the only source-control boundary. UI components and domain services do not call the GitHub API. The interface can read a repository, push a branch, open a pull request, and read files, reviews, comments, checks, commit status, and branch protection.

There is no merge method. No agent receives one.

`GitHubSourceControlProvider` maps GitHub responses into that interface. Tests use `FakeSourceControlProvider` and do not need a GitHub account. A failed check stays a failure. The mapper does not turn a green command into acceptance-criterion verification.

## Repository mapping

Each product still has one `Repository` row. Provider is `LOCAL` or `GITHUB`. The row stores owner, repository name, URL, default branch, remote name, and an optional installation id. It does not store a token.

A person chooses that repository on the product Build page from the GitHub App installation. The list comes from `GET /installation/repositories` using the installation access token, and it is requested again whenever the page loads or the person refreshes it. A personal access token is not used for that list. Associating a repository checks that the installation can access it and can push. The AI Product Builder repository cannot be selected as a product destination. If the remote already contains commits that are not in the local product history, the mapping is kept and publishing will not overwrite that history. Nothing is created, pushed, or merged by the association itself. Before a branch is published, the installation's access to the mapped repository is checked again.

Publication uses the product repository when it is connected. The builder connection supplies the credential, not a single shared repository.

## Safe publication

**Publish Branch** is a human action. It runs only when the implementation task is completed, the code approval matches the current commit, the execution contract is current, coding policy and engineering governance are current, no coding escalation is open, and the GitHub connection is valid. Every failed condition is listed. Nothing is pushed.

The push is a normal fast-forward. The argument list is built by `buildPublishArguments` and cannot contain `--force`. If the remote branch exists and is not an ancestor of the local commit, publication stops with **REMOTE BRANCH DIVERGENCE**. A person resolves that outside the factory.

The Coding Agent still cannot push. Its git helper rejects `push`.

## Evidence

Branch publication, the remote commit, pull request creation, each CI check, a human review, and a merge reported by GitHub are stored as `SourceControlEvidence` with source `GITHUB`. Demo rows use source `DEMO` and are labelled demo data. The model cannot insert these events.

A check named `build` proves only that the build check succeeded.

## Failures

Authentication failure, a missing repository, permission denied, a rejected push, divergence, rate limit, GitHub being unavailable, an unknown CI result, a deleted remote branch, a closed pull request, and a changed default branch keep their own messages. They are not stored as agent failures. Refresh is manual. There is no background poll, and a rate limit tells the person when to retry.

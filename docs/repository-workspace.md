# Repository workspace

The Coding Agent changes code only inside an isolated workspace. The configured base checkout is not edited.

## Configuration

`PRODUCT_REPOSITORY_ROOT` is an environment variable. The browser cannot submit a filesystem path.

Before use, the application resolves the real path and checks that:

- the path exists
- it is a Git repository
- it is not this application's source tree, unless `PRODUCT_REPOSITORY_ALLOW_FACTORY=true`
- path segments do not contain `..`
- a symbolic link does not resolve outside the registered root

The stored `Repository` row uses provider `LOCAL`. `GITHUB_FUTURE` is reserved and unused. Status is `CONFIGURED`, `UNAVAILABLE`, or `DISABLED`.

`PRODUCT_REPOSITORY_WORKTREE_ROOT` optionally chooses where worktrees are created. It defaults to a directory under the system temp folder, outside both the factory and the target repository. A worktree inside the repository working tree is rejected.

## Worktree

For each task the service:

1. reads the configured base branch and base commit
2. creates a branch named `ai-factory/task-<task id>-<slug>`
3. adds a Git worktree at a unique path
4. checks that the worktree toplevel is not the main working tree
5. records a `RepositoryWorkspace`

If worktree creation fails, the workspace is marked `FAILED` and execution stops. There is no fallback that edits the main tree.

Workspace status is `CREATING`, `ACTIVE`, `CHECKING`, `READY_FOR_REVIEW`, `FAILED`, `ABANDONED`, or `COMPLETED`. One product may have only one workspace in `CREATING`, `ACTIVE`, `CHECKING`, `READY_FOR_REVIEW`, or `FAILED`. Completed and abandoned workspaces do not hold that slot. The data model does not use a unique constraint that would prevent a later parallel design.

## File tools

Every read, list, write, create, and delete goes through `resolveInside`. The resolved path must stay in the worktree. `..`, absolute paths outside the worktree, and symlinks that escape are denied. The denial is stored as a tool event and an escalation. The activity log records the path, not the file contents.

Writes must match `allowedPaths` and must not match `restrictedPaths`. An empty allow list fails closed. These paths are always denied, even if a policy lists them:

- `.git/**`
- `.github/**` and workflow files
- ESLint configuration files
- secret files: `.env` and `.env.*` except `.env.example`, private keys, `.pem`, credential files, `.ssh`, `.aws`, and `.gnupg`

Reads of `package.json`, `tsconfig.json`, `README.md`, and `.env.example` are allowed so the agent can see project metadata. Writes to those files still need an allowed path. This is narrower than giving the model the whole repository.

File deletion is denied unless the task text asks to remove or delete something, and deleting a test is denied even then. The contract file limit counts distinct paths. A further new file is denied.

## Commands

`ApprovedCommandRunner` uses `spawn` without a shell. The initial allow list is:

- `npm test`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

A coding policy may also list a specific `npm …` command. Anything else is denied, including `rm`, `sudo`, `curl` or `wget` piped to a shell, `git push`, `git reset --hard`, environment dumps, and shell metacharacters such as `;`, `|`, `&`, and backticks.

The child process receives `PATH` and a few locale variables. It does not receive `OPENAI_API_KEY` or `DATABASE_URL`.

Checks run with the worktree as the working directory, so they do not run this application's own test suite.

## Commit

**Create Commit** is available only after a human `CODE_CHANGE` approval whose diff hash still matches. The message includes the task id. The helper refuses `git push`, `git merge`, `git rebase`, and `git reset --hard`. The new SHA is stored on the workspace. The base branch is not moved.

Commits are unsigned. The factory sets `commit.gpgsign=false` for its own Git processes and does not call the operator's signing program. A machine-wide `commit.gpgsign=true` setting would otherwise block the agent on an SSH or GPG helper that this application does not control. The commit author is `AI Product Factory`, not the operator's signing identity.

## Demo repository

See the README for a small local repository. The seed does not create a repository row and does not invent command evidence.

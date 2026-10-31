# mastra-poc

## Evaluation progress

Apply `20261031000000_generation_progress` through the normal Prisma migration
deployment workflow before starting the updated backend. It adds a nullable JSON
progress field to generation jobs; existing jobs remain readable.

Evaluation status responses now include `progress` with the current stage,
completed stage identifiers, total steps, and update time. The authenticated
`GET /workspaces/:workspaceId/evaluations/jobs/latest?groupId=...` endpoint
recovers the latest evaluation for that workspace and group. The frontend polls
every two seconds, resumes tracking after reload/navigation, and keeps the saved
report available while individual synthesis runs. Counts represent completed
steps, not elapsed-time percentages. Interrupted jobs retain the existing
expiration behavior and are not replayed after a backend restart.

Run `npm run test:progress` in `frontend` with the local Vite server running
(default `http://127.0.0.1:5173`; override `PROGRESS_TEST_BASE_URL`). The browser
checks use installed Chrome by default (`PLAYWRIGHT_CHANNEL` can override it).
They cover polling, reload, group navigation, reconnection, terminal errors and
individual synthesis. Screenshots are written to
`artifacts/evaluation-progress/ui-tests/` and visibly labeled as simulated API
responses, not live evaluations.

Verification on 2026-10-31: 78 agent tests, 14 targeted backend tests and four
browser scenarios passed; frontend/backend compilation and frontend type/lint
checks passed. The full backend suite also exposes existing ESM-loading and
outdated dependency-mock failures.

After the local database was restarted, migration
`20261031000000_generation_progress` was applied successfully. A live evaluation
of Atenzia (`lab3-atenti`) on 2026-10-31 completed all 10 evaluation steps and all
four individual-synthesis steps. Both jobs succeeded; the saved report is
`23379be3-d83f-45c8-8c55-6b69c7c3aedb`. The report is constrained by the available
evidence and the UI correctly displays “Completed with limitations.” Reloading
during rule interpretation recovered the same job; exactly one evaluation was
submitted and no browser runtime errors were observed. Actual screenshots and
the observed state transitions are in `artifacts/evaluation-progress/live/`;
these are separate from the simulated browser-test screenshots.

## Evidence, generation jobs and grading

Build `core` and `agent` before building the backend. The additive migration
`backend/prisma/migrations/20261027000000_generation_evidence_grading` adds stored
provider records, sync leases/checkpoints/coverage, generation jobs, task analyses,
and nullable workspace grading settings. Apply it through the normal Prisma
deployment workflow before starting the updated backend. Existing reports are
unchanged and receive no retroactive grades.

Server configuration is documented in `backend/.env.example`:

- Mastra: `GROUP_REPORT_MODEL=groq/openai/gpt-oss-20b` or a configured `google/...` model.
- LangChain: `RULE_UNDERSTANDING_MODEL` and `RULE_SUMMARY_MODEL` accept
  `groq:openai/gpt-oss-20b` or `google-genai:<model>`.
- Supply `GROQ_API_KEY` and/or `GOOGLE_GENERATIVE_AI_API_KEY` only to the backend.
- `TASK_ANALYSIS_MODEL` selects the task classifier; it defaults to the rule-summary model.
- `TEAM_ANALYSIS_MODEL=openrouter:openrouter/free` optionally analyzes evidence blocks
  and consolidates them as untrusted text before one final structured factual review
  with `RULE_SUMMARY_MODEL`. Supply `OPENROUTER_API_KEY` to enable this path.
  Without it, synthesis uses the structured model directly.
- `TEAM_STRUCTURED_MAX_CALLS=3` caps all structured invocations per team synthesis,
  including HTTP failures, rejected output, repairs, transient retries and fallbacks.
  Local size checks do not consume calls. Each request permits at most one transient
  retry or repair before moving to a fallback. Rule assessments are outside this cap.
  Unreviewed drafts are never published: insufficient input/call budgets preserve
  the factual summary and explain the limitation. Evidence is not truncated to fit.
  Text consolidation has at most four levels (initial plus three reductions), with
  content caches scoped to the generation. Serialized messages are measured before
  sending; a 413 never retries the unchanged payload against the same model.
  Evaluation requests form one LangChain trace with rule and team synthesis children;
  attempt metadata includes stage, block, requested/effective model, bytes and call count.
  One structured call is the expected normal path with text analysis enabled; confirm
  it with an authorized live run. Compilation and static review do not establish
  observed provider call counts or reduce the separate rule-assessment calls.
- `FREE_TIER_FALLBACK_MODELS` is empty by default. Only explicitly listed Gemini/Groq
  services are eligible; configure accounts with the intended free-tier limits.
- `GENERATION_INPUT_BYTES`, `GENERATION_OUTPUT_TOKENS`, and `GENERATION_TIMEOUT_MS`
  set budgets. Per-model overrides use the uppercase identifier with punctuation
  replaced by underscores, e.g. `GROQ_OPENAI_GPT_OSS_20B_TIMEOUT_MS`.

Generation POST endpoints now return `{ jobId, status }`. Poll
`GET /groups/:id/generation-jobs/:jobId` or
`GET /workspaces/:workspaceId/evaluations/jobs/:jobId` for queued, running,
succeeded or failed status. The frontend polls these endpoints and stops on
failure. Jobs persist their inputs and outcomes. Execution is serialized within
the backend process; interrupted jobs expire after 30 minutes instead of remaining
running indefinitely. They are not automatically replayed after a process restart.

Workspace owners/admins can read and update grading settings at
`/workspaces/:workspaceId/evaluations/grading-settings` (GET/PATCH), or pass
`gradingOverrides` with an evaluation. Defaults are 0–10, passing grade 4,
integer rounding and full evidence coverage. Criteria score 1/0.5/0 for
met/partially met/not met. Unknown or unreferenced criteria are excluded from
the rule average and reduce coverage; omitted required criteria remain unknown.
Rule averages are weighted by valuation. Rounding precedes the passing comparison.
The effective settings and evidence freshness are saved with version-2 evaluations.
Version-1 student summaries use source identifiers and expandable evidence.

Task selection and analysis use the workspace-scoped `/evaluations/tasks` (GET)
and `/evaluations/task-analysis` (POST) endpoints, with an optional `groupId`.
Choose a stored record ID or provide a description. Results classify human, AI,
hybrid or insufficient information without estimating time savings. Resource
freshness is available at `/evaluations/sync-status`.

Provider records remain in PostgreSQL. Each resource/operation has an expiring
database lease; pages are validated and persisted before pagination advances.
GitHub PR details are fetched only when their update version changed. Commit
updates compare pinned repository heads, including older-dated newly merged
commits. Full nested comments/reviews are stored; date filtering happens on read.
Rolling participation data replaces its previous snapshot. Incremental APIs
cannot prove all deletions; rewritten commit history is surfaced for reconciliation.
Failed/rate-limited synchronization leaves existing evidence available with
freshness limitations. Page-number APIs can change while a scan is interrupted;
subsequent timestamp updates and version deduplication reconcile repeated records.

Verification for this change is limited to compilation/type checking and static
review. Migrations, provider synchronization, live model generation, UI behavior,
and restart/rate-limit recovery have not been exercised. No tests or visual checks
were performed. No runtime evidence establishes the cause of any prior Gemini failure.

Provider references: [Groq structured outputs](https://console.groq.com/docs/structured-outputs),
[GitHub commits](https://docs.github.com/en/rest/commits/commits),
[Jira search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/).

## Desarrollo local

1. Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run start:dev
```

El backend queda disponible en `http://localhost:3000/api`.

2. Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

En desarrollo el frontend usa `/api` y Vite lo proxyea al backend definido en
`VITE_API_PROXY_TARGET` (`http://localhost:3000` por defecto). Si desplegas el
frontend separado del backend, cambia `VITE_API_BASE_URL` por la URL absoluta de
la API, por ejemplo `https://api.example.com/api`.

Comando holístico para sincronizar el repo frontend-poc
```bash
git remote add frontend-poc https://github.com/performance-agent/perf-canvas-ui.git
git subtree add --prefix=frontend frontendpoc main --squash
```

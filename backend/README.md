<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Test the evaluation agent

Configure the backend `.env` with plugin credentials, an LLM API key, and the
two LangChain `provider:model` identifiers:

```dotenv
RULE_UNDERSTANDING_MODEL=openai:gpt-5-mini
RULE_SUMMARY_MODEL=openai:gpt-5
PROMPT_DATA_FORMAT=auto
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your-langsmith-api-key
LANGSMITH_PROJECT=mastra-poc-agent-flow
LANGSMITH_RUNNER_ID=local
LANGCHAIN_CALLBACKS_BACKGROUND=false
```

`RULE_UNDERSTANDING_MODEL` is used for rule interpretation and resource
selection. `RULE_SUMMARY_MODEL` produces the final structured assessment.
`PROMPT_DATA_FORMAT` controls serialization of the data sections sent to that
model: `json` always uses compact JSON, `toon` forces TOON, and the default
`auto` uses TOON only when its encoded representation is smaller, with an
automatic JSON fallback if encoding fails. This setting does not change the
HTTP response format.
With the `LANGSMITH_*` values enabled, evaluations started through the API are
recorded as `workspace-evaluation-flow` runs, tagged with `backend`,
`evaluation-flow`, and `runner:<LANGSMITH_RUNNER_ID>`, and include the workspace
and requested view as metadata. `LANGSMITH_RUNNER_ID` is required at startup;
use `local` for local development and a deployment-specific identifier in each
deployed environment.

The workspace must have at least one active resource assigned from an active
plugin installation. An authenticated workspace owner or admin can then run:

```bash
curl -X POST \
  "http://localhost:3000/api/workspaces/WORKSPACE_ID/evaluations?view=report" \
  -H "Authorization: Bearer FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [{
      "name": "Delivery traceability",
      "description": "Delivered code should be traceable through repository activity.",
      "valuation": 8
    }],
    "period": {
      "from": "2026-08-01",
      "to": "2026-08-10"
    }
  }'
```

The default `report` view returns keyed rule assessments, limitations,
execution counts, and diagnostics. Use `?view=full` to inspect the complete
graph state and raw plugin records during development.

When `period` is supplied, the runtime forwards it as explicit provider options
to GitHub and Jira. Both dates are inclusive UTC days. Issues, tickets and PRs
are selected by their latest update; commits use commit date, with author date
as a fallback. PR comments and reviews use their own timestamps. PR totals and
current state are not historical snapshots. `github.participation` reports a
failed operation for bounded requests because its weekly aggregates cannot
represent the requested days; use `github.commit` for bounded commit activity.
Without a period, queries retain their existing history behavior.

Each evaluation that returns a result is automatically saved as an
`AGENT_EVALUATION` performance report before the API responds. Both response
views include `evaluationId` and `createdAt`. Storage contains a versioned
snapshot of the submitted rules, optional period, and the final report
(including evidence and diagnostics), rather than the full graph state or raw
plugin records. Partial results are saved too; invocations that throw are not.
If persistence fails, the API returns 503 and explicitly reports that the
evaluation could not be saved.

Workspace owners and admins can retrieve history using:

- `GET /api/workspaces/:workspaceId/evaluations?groupId=:groupId`: summaries,
  newest first, with 20 items per page and a `nextCursor`. Omit `groupId` to
  list all evaluations in the workspace. Pass `cursor=:nextCursor` for the next page.
- `GET /api/workspaces/:workspaceId/evaluations/:evaluationId`: the saved record
  with `data.schemaVersion`, `data.rules`, `data.period`, and `data.report`.

The group's Agent evaluation tab displays this history. Selecting an entry
shows its saved rules, period, and report without modifying the new evaluation
form. These entries are excluded from the existing group Reports tab and
`/api/reports/:id` endpoint. Historical comparison and agent resource integration
are not implemented.

Apply database migrations before running the updated API:

```bash
npx prisma migrate deploy
```

## Report analysis

Workspace owners and admins select a rule package (or write rules directly) and
previous team reports in the group's Evaluation tab. There are no configurable
evaluators. The API accepts rules directly and applies fixed Spanish communication
and evidence guidelines. Previous saved evaluator results remain readable.

`GET /api/workspaces/:workspaceId/evaluation-models` lists the model choices.
`POST /api/workspaces/:workspaceId/evaluations` accepts:

```json
{
  "groupId": "GROUP_ID",
  "sourceReportIds": ["REPORT_1", "REPORT_2"],
  "rules": [{ "name": "Revisión colaborativa", "valuation": 8 }],
  "reportLength": "medium",
  "modelKey": "balanced"
}
```

Rule weights express importance (1–10), never numeric performance grades.
`reportLength` is `brief`, `medium` or `complete`; `modelKey` is `economical`,
`balanced` or `advanced`. Optional `period` dates constrain complementary queries.
Configure `GOOGLE_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`) and the model IDs
shown in `.env.example`. Apply Prisma migrations before starting the backend.

## Run the backend with Docker Compose

The Compose stack builds the backend and agent packages, starts PostgreSQL,
waits for the database to become healthy, applies Prisma migrations, and then
starts the API.

From the `backend` directory, create your environment file and provide the
Firebase service-account file referenced by `FIREBASE_CREDENTIALS_FILE`:

```bash
cp .env.example .env
# Edit .env with real API keys, encryption key, plugin configuration, and
# FIREBASE_CREDENTIALS_FILE (a path on the Docker host).
docker compose up --build
```

The API is available at `http://localhost:3000/api` and Swagger at
`http://localhost:3000/api/docs`. Change the host port with `BACKEND_PORT`.

Useful lifecycle commands:

```bash
docker compose logs -f backend
docker compose down
# Also delete the PostgreSQL volume and all local database data:
docker compose down --volumes
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Report-based Evaluations

Apply migrations and rebuild the local agent package before starting the API:

```bash
npm --prefix ../agent run build
npx prisma migrate deploy
npx prisma generate
npm run build
```

`POST /workspaces/:workspaceId/evaluations` now requires `groupId` and a nonempty,
unique `sourceReportIds` array containing existing `GROUP_REPORT` IDs from that
same group. Supply a nonempty `rules` array for the analysis. Model selection and
report length are retained.
The optional `period` constrains supplemental records only; it does not slice the
selected reports or turn them into independent sprint reports.

The analyzer compares complete, chronological snapshots of accumulated history.
One snapshot yields a diagnosis with an explicit temporal limitation. It explains
improvements, unchanged aspects, regressions and unknowns for every rule, with
attributed member findings when evidence permits. Coverage changes, activity
counts and missing identities do not establish better or worse collaboration.

Rules are grouped into batches, rather than interpreting, selecting resources
and assessing each rule through separate model calls. Each batch makes one Gemini
call, or at most two if it requests missing evidence. Complements use authorized
GitHub/Jira operations, check the database evidence cache first, and deduplicate
identical operations across the entire execution, including failed operations.
There are no automatic model retries or recursive evidence requests. A failed or
oversized complement preserves valid preliminary findings and marks limitations.

The new response retains the configured report shape and adds `group`,
`analysisDates` (snapshot generation dates), `sourceReports`, `evaluationVersion`,
per-rule `evolution`, and analysis `metrics`. Metrics distinguish model calls,
batches, requested complements, fresh API results and database cache hits. Reused
in-memory operations are not counted again as new API/cache accesses. Provider
usage remains separate from the local input-token estimate; missing usage is
shown as unavailable, never as a measured zero.

New results use JSON `schemaVersion: 3` and retain immutable report contents and
effective rule snapshots. The response retains a single fixed analysis entry in
`results` for compatibility with previous history; it is not a configurable
evaluator. No package origin is inferred from matching rule names. `V1`, `V2`, etc. number only new
evaluations per group. An atomic counter increment and report insert occur in one
transaction, backed by a unique group/version constraint. Historical formats 1
and 2 remain readable without rewriting their contents. No model calls occur
inside the version-allocation transaction.

Budget defaults (override through environment variables):

| Variable | Default | Behavior |
| --- | ---: | --- |
| `EVALUATION_MAX_INPUT_TOKENS` | 64000 | Conservative UTF-8 byte estimate / 3, including prompt and schema |
| `EVALUATION_MAX_OUTPUT_TOKENS` | 16384 | Output cap; batching reserves 1000/1800/3000 tokens per rule for brief/medium/complete prose |
| `EVALUATION_MAX_RULES_PER_BATCH` | 12 | Upper bound; token budgets can split earlier |
| `EVALUATION_MAX_EVIDENCE_REQUESTS` | 8 | Maximum unique complementary operations per batch |
| `EVALUATION_EVIDENCE_CACHE_TTL_SECONDS` | 3600 | Cache lifetime; zero expires immediately |

If reports plus one rule exceed the input budget, the API rejects the request
before consuming Gemini and asks for a smaller selection. Full reports are never
silently truncated. Output caps can still truncate unusually large responses;
those are reported as failures without paid retry. Supplement cache entries are
scoped to group, resource, installation/configuration version and exact period;
current authorization is checked before reading them, and deleting a group
cascades to its cached evidence.

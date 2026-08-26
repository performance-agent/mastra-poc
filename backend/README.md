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
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your-langsmith-api-key
LANGSMITH_PROJECT=mastra-poc-agent-flow
LANGSMITH_RUNNER_ID=local
LANGCHAIN_CALLBACKS_BACKGROUND=false
```

`RULE_UNDERSTANDING_MODEL` is used for rule interpretation and resource
selection. `RULE_SUMMARY_MODEL` produces the final structured assessment.
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

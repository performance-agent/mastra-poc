# AGENTS.md

## Architecture

This repository contains the minimal v1 plugin producer API for Performance Platform.

Plugins may only declare metadata and required secrets, discover external resources, and provide native data validated by Zod v4 schemas. The host platform owns persistence, assignments, canonical DataType definitions, mappings, secret storage and reconciliation.

## Boundaries

- `@pa/core` contains small TypeScript contracts, execution context, manifest types and validation errors.
- `@pa/sdk` contains the typed plugin DSL, runtime Zod validation and JSON Schema generation.
- `@pa/plugin-github` is the only concrete integration.
- Core must not know about GitHub, connections, Prisma, canonical data types, reports, agents, schedules or storage.
- A data provider receives only its execution context and the assigned resource batch selected by the platform.
- Secrets must be declared and accessed through the typed scoped reader; manifests never contain secret values.

## Style and verification

- TypeScript strict mode with no `any` in public APIs.
- Prefer immutable definitions, composition and small files.
- Provider data must be serializable; dates use ISO strings.
- Run `npm test`, `npm run typecheck` and `npm run build` after changes.

# Starter Checklist

## 1. Initialize repository

Use a TypeScript monorepo.

Recommended structure:

```txt
performance-platform-core/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── capability/
│   │       ├── connection/
│   │       ├── data/
│   │       ├── manifest/
│   │       ├── plugin/
│   │       ├── runtime/
│   │       ├── schedule/
│   │       ├── setup/
│   │       ├── storage/
│   │       └── report/
│   │
│   ├── sdk/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── define-plugin.ts
│   │       ├── capability-builders.ts
│   │       ├── data-type.ts
│   │       ├── provides-data.ts
│   │       ├── connection.ts
│   │       ├── setup-ui.ts
│   │       ├── schedule.ts
│   │       ├── agent.ts
│   │       └── report.ts
│   │
│   ├── testing/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── fake-runtime.ts
│   │       ├── fake-storage.ts
│   │       ├── fake-secrets.ts
│   │       ├── fake-data-orchestrator.ts
│   │       ├── fake-connection-registry.ts
│   │       ├── fake-provider-registry.ts
│   │       └── test-installation-builder.ts
│   │
│   └── packs-software/
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── issue.ts
│           ├── repository.ts
│           └── pull-request.ts
│
└── tests/
    ├── permissions.test.ts
    ├── data-providers.test.ts
    ├── resource-scope.test.ts
    ├── reports.test.ts
    └── versioning.test.ts
```

## 2. Suggested tooling

Use:

```txt
pnpm
typescript
vitest
tsup
zod
eslint
prettier
```

## 3. Suggested setup commands

```bash
mkdir performance-platform-core
cd performance-platform-core

pnpm init

pnpm add -D typescript vitest tsup eslint prettier
pnpm add zod

mkdir -p packages/core/src
mkdir -p packages/sdk/src
mkdir -p packages/testing/src
mkdir -p packages/packs-software/src
mkdir -p tests
```

## 4. Root package.json shape

```json
{
  "name": "performance-platform-core",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "typescript": "latest",
    "vitest": "latest",
    "tsup": "latest",
    "eslint": "latest",
    "prettier": "latest"
  },
  "dependencies": {
    "zod": "latest"
  }
}
```

## 5. pnpm-workspace.yaml

```yaml
packages:
  - "packages/*"
```

## 6. tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## 7. Initial implementation order

### Step 1: @pa/core

Implement pure types first:

```txt
Capability
PluginManifest
PluginDefinition
PluginInstallation
RuntimeContext
RuntimeScope
ConnectionProvider
DataTypeDefinition
DataProvider
DataRecord
DataQuery
ResourceAssignment
ScopedStorage
SecretReader
ReportDefinition
AgentDefinition
ScheduleDefinition
SetupDefinition
```

Do not implement real behavior yet.

### Step 2: @pa/sdk

Implement the DSL:

```txt
definePlugin
dataType
providesData
connection
connectionProvider
data.read
data.provide
connection.use
report.write
storage.kv
setup UI helpers
```

Focus on DX and types.

### Step 3: @pa/packs-software

Create:

```txt
software.issue.v1
software.repository.v1
software.pullRequest.v1
```

Use zod schemas.

### Step 4: @pa/testing

Implement fake runtime:

```txt
FakeRuntime
FakeScopedStorage
FakeSecretReader
FakeDataQueryOrchestrator
FakeConnectionRegistry
FakeProviderRegistry
TestInstallationBuilder
```

### Step 5: Tests

Write tests before building real integrations.

Minimum test files:

```txt
permissions.test.ts
data-providers.test.ts
resource-scope.test.ts
reports.test.ts
versioning.test.ts
```

## 8. First concrete milestone

The first milestone is complete when this works:

```ts
const records = await reportCtx.data.query(software.issue.v1, {
  scope: {
    type: "workspace",
    id: "workspace-a"
  }
});
```

And:

```txt
- records include fake GitHub issues from resources assigned to workspace-a
- records include fake Jira issues from resources assigned to workspace-a
- records exclude resources assigned to other scopes
- the report plugin cannot access ctx.connections.github
- permissions are enforced at runtime
```

## 9. Do not start with real GitHub

Start with fake providers.

Real GitHub comes after the core proves:

```txt
provider isolation
canonical query orchestration
resource assignment filtering
permissions
manifest generation
testing runtime
```

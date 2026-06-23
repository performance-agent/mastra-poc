# 0007 - Connection Setup Flows

## Status

Accepted for pre-v0.

## Context

Provider connections often require interactive installation or credential collection. GitHub App installation is one example, but the same platform shape must support OAuth providers, manual API keys, webhook-assisted providers, Jira, Linear, Slack and future integrations.

Modeling GitHub App installation as a special Nest service would couple provider setup to one framework and one provider. The plugin core needs a provider-agnostic setup contract that can be implemented by plugins and executed by the backend/runtime.

## Decision

Connections are configured through provider-defined setup flows. Interactive provider installation is completed through a setup flow, not through provider webhooks. Provider webhooks only maintain or reconcile connection state after setup. The backend/runtime is the authority for creating connection bindings.

The main concepts are:

- `ConnectionSetupSession`, which tracks an in-progress setup attempt.
- `ConnectionBinding`, which records a completed connection for a plugin installation.
- A setup start handler, which initiates redirect or form-based setup.
- A setup complete handler, which validates completion input and creates the binding.
- A provider event handler, which reconciles an existing binding after provider events.
- Declarative setup metadata in manifests.

Setup handlers are runtime code and must not be serialized into manifests.

## Consequences

- The frontend may initiate and display a setup flow, but it does not authoritatively create the connection binding.
- Provider webhooks must not create access or bindings without a known setup session or existing binding.
- GitHub App setup can be represented as a generic `webhook-assisted` setup flow instead of a provider-specific platform service.
- The same setup model can support OAuth, manual credentials and other provider-specific flows.
- Plugin isolation is preserved: provider plugins own their connections, and consumer plugins read canonical data contracts instead of provider connections.
- This decision does not implement the GitHub plugin, OAuth, Nest, Prisma or real webhooks.

## Alternatives Considered

- GitHub-specific backend service: fast for one provider, but does not generalize to Jira, Linear, Slack or OAuth providers.
- Webhook-created bindings: convenient, but unsafe because unsolicited provider events could create access without user-approved setup.
- Frontend-created bindings: simple UI flow, but places authority in the wrong layer and weakens backend/runtime enforcement.
- Custom setup per provider outside the plugin model: flexible, but fragments installation behavior and makes plugin isolation harder to audit.

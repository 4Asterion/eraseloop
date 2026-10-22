# Roadmap

Proposals only, not shipped features.

- **v0.1:** test-only lifecycle API, positive baseline, time-window checks, HTTP/PostgreSQL/Redis/S3 scoped probes, CLI/HTML/JSON reports, failure classification.
- **v0.2:** grace period for asynchronous deletion, per-probe verdicts, Markdown and JUnit reports, real-store CI job.
- **Next:** first-class PostgreSQL and Redis clients (removing local CLI prerequisites), pluggable stores (MongoDB, Elasticsearch), signed report artifacts, a reusable GitHub Action.
- **Later:** reproducible chaos scenarios for retry jobs, durable test provenance, non-destructive backup retention verification, concurrent multi-identity stress tests, dashboard for longitudinal deletion regressions.

Security guarantee to preserve: synthetic data only, explicit test scopes, no arbitrary user-supplied command execution, never automatically claim legal compliance.

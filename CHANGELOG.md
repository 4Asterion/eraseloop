# Changelog

## 0.2.0 - 2026-10-23

- **Fix:** PostgreSQL probes put the connection URI into `PGDATABASE`, which libpq does not expand, so `connectionEnv` could never connect. The URI is now split into `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`/`PGSSLMODE` (password still kept off the command line). Same fix in the integration fixture.
- **Fix:** an invalid `--format` was only rejected after the full create/delete lifecycle had run against the target, losing the report; `--format` and the `--output` directory are now validated before any API call.
- **New:** `observation.graceMs` for asynchronous deletion pipelines: data may linger during the grace period but must be gone afterwards; reappearance after an absent sample always fails.
- **New:** per-probe verdicts (`probes[].result` / `reason`), so a report names the store that kept or resurrected the data. Reappearance is now detected per probe, not only when all probes were absent at once.
- **New:** `--format markdown` (job summaries, PR comments) and `--format junit` (CI test reports, one test case per probe); `-h` and `--version` aliases.
- **CI:** a new job runs the CLI against real PostgreSQL, Redis and MinIO containers for both clean deletion and delayed resurrection.

## 0.1.0 - 2026-10-22

Initial release candidate: baseline-verified synthetic deletion tests; exact-scope HTTP/PostgreSQL/Redis/S3 probes; repeated observation and resurrection detection; safe local-target defaults; JSON/HTML/terminal reports; real localhost HTTP fixture and opt-in Docker multi-store fixture; unit, CLI and HTTP integration tests; GitHub Actions workflow.

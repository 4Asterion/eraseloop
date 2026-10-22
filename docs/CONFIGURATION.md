# Configuration schema v1

```json
{
  "schemaVersion": 1,
  "baseUrl": "http://127.0.0.1:8791",
  "create": { "method": "POST", "path": "/test-users", "body": { "subject": "{{subject}}" } },
  "delete": { "method": "DELETE", "path": "/test-users/{{subject}}" },
  "probes": [
    { "name": "api", "type": "http", "path": "/test-users/{{subject}}", "expect": "jsonZero", "jsonPath": ["count"] }
  ],
  "observation": { "intervalMs": 500, "durationMs": 5000, "graceMs": 1000 }
}
```

`{{subject}}` is a newly generated random identifier such as `el_cde49f...`. HTTP paths are URL-encoded. A matching record must exist for *every probe* before the delete action. Each post-delete sample evaluates every probe.

**Verdicts are computed per probe** and reported in `probes[].result`:

- `failed` / `data_reappeared`: the probe was absent in one sample and present again in a later one — always a failure, even inside the grace period.
- `failed` / `data_still_present`: the probe was present in a sample taken after `graceMs`.
- `inconclusive` / `unverified_probe` or `no_confirmed_absence`: an `unknown` sample, or no absent sample at all.
- `passed`: present at baseline, absent in every sample after the grace period, never reappeared.

The run fails if any probe fails, passes only if every probe passes, and is inconclusive otherwise.

`graceMs` (default `0`) is the time your deletion pipeline is allowed to finish — for example a queued job that purges the cache a few seconds after the API call returns. Samples inside it are marked `within_grace`. It must leave room for at least one sample: `graceMs + intervalMs <= durationMs`.

## Authentication

To send a bearer token to the configured application's HTTP endpoints, add `"authTokenEnv": "ERASELOOP_API_TOKEN"` and set the token in your environment. Do not put the token itself in JSON. The same token is sent to all HTTP probes under that same origin; use a dedicated test-service credential.

## Additional probe definitions

Add any of these entries to the `probes` array. Every probe must use a unique `name`.

**PostgreSQL (read-only via psql):**

```json
{"name":"accounts-db","type":"postgres","schema":"public","table":"test_users","column":"subject","connectionEnv":"ERASELOOP_PG_URL"}
```

Set `ERASELOOP_PG_URL` to a `postgresql://user:password@host:port/database?sslmode=...` URI. EraseLoop splits it into `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` and `PGSSLMODE` for `psql`, so the password never appears on the process command line. Other connection-string forms yield an `unknown` state with reason `invalid_connection_url`. Without `connectionEnv`, `psql` uses your existing `PG*` environment. The query is a `COUNT(*)` scoped to `subject` with safe quoting.

**Redis (exact key):**

```json
{"name":"account-cache","type":"redis","host":"127.0.0.1","port":6379,"key":"erasure:{{subject}}"}
```

Use standard `REDISCLI_AUTH` environment variable if your test Redis requires a password. The command does not scan for patterns; keys must contain `{{subject}}`.

**S3 (exact object):**

```json
{"name":"profile-blob","type":"s3","bucket":"eraseloop-fixtures","key":"users/{{subject}}/profile.json","endpointUrl":"http://127.0.0.1:9000"}
```

The AWS CLI supplies region and credentials. `endpointUrl` is optional and supports HTTPS endpoints or HTTP localhost for a test-only MinIO service. If omitted, the AWS CLI uses its normal endpoint resolution. A missing key is reported absent only when the CLI explicitly returns `404`, `Not Found`, or `NoSuchKey`. Access denied, connection errors, missing CLI, and all ambiguous conditions yield `unknown`.

**HTTP response conventions:** `"expect":"status404"` means GET returns 200–299 if the record exists and 404 if absent. `"expect":"jsonZero"` requires a numeric leaf value of 0 when absent. `"expect":"jsonFalse"` requires boolean `false` when absent. JSON object traversal uses `"jsonPath":["some","count"]` and fails closed if a field is missing.

## Known limits

- Maximum 30 probes per run; interval 100 ms–10 min; total observation duration up to 24 hours; grace period up to `durationMs - intervalMs`.
- No generalized per-probe SQL or arbitrary command execution; scoped built-in adapters only.
- A missing record at baseline blocks the run. If a store is intentionally never populated, do not include it as a strict probe.
- No claim about objects in backup archives, dead-letter queues, external processors, or inaccessible stores.

# Opt-in real-store integration fixture

This stack provides a disposable PostgreSQL database, Redis cache and MinIO object store on **localhost-only ports**. It has intentionally trivial development-only credentials. **Never expose these ports or reuse these credentials.**

Requirements: Docker Compose, Node 22+, `psql`, `redis-cli`, `aws` CLI, and localhost ports 55432, 56379, 59000 and 8792 free.

```sh
# From the repository root
docker compose -f integration/docker-compose.yml up -d --wait
export ERASELOOP_PG_URL='postgresql://eraseloop:eraseloop_dev_only@127.0.0.1:55432/eraseloop'
export AWS_ACCESS_KEY_ID='eraseloop_dev'
export AWS_SECRET_ACCESS_KEY='eraseloop_dev_password'
export AWS_DEFAULT_REGION='us-east-1'
export AWS_EC2_METADATA_DISABLED=true
export ERASELOOP_EMPTY_FIXTURE_FILE='/tmp/eraseloop-test-blob.json'
printf '{}' > "$ERASELOOP_EMPTY_FIXTURE_FILE"
aws --endpoint-url http://127.0.0.1:59000 s3api create-bucket --bucket eraseloop-fixtures
node integration/fixture-server.js
```

In another terminal with the **same environment variables** (except the fixture file path is only used by the server):

```sh
node src/cli.js run --config integration/test-config.json --format html --output report.html
```

To reproduce delayed resurrection, set `REAPPEAR=1` when starting `integration/fixture-server.js`; it will re-insert the synthetic user into PostgreSQL after a delay. The run should exit with `1` and a `data_reappeared` finding.

After testing:

```sh
docker compose -f integration/docker-compose.yml down -v
```

**Verification scope:** This stack is supplied for local/manual and future CI testing; it is not executed by the default unit-test job, and it has not been exercised in the build environment without Docker. Use it to validate the actual client tools and service compatibility before shipping a release claiming multi-store integration support.

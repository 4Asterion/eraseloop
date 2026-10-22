# Release checklist

- [x] Node built-in test runner and syntax verification completed locally
- [x] Passing and failing deletion scenarios executed against real local HTTP fixture
- [x] Mocked PostgreSQL, Redis and S3 CLI adapter contracts tested
- [x] Unsafe remote targets and unsupported parameters rejected by configuration validation
- [x] README, licensing, security policy, templates and CI source prepared
- [x] PostgreSQL, Redis and S3 adapters confirmed against real disposable services (CI job `integration`; S3 via S3Mock)
- [x] Docker multi-store integration exercise completed on service-enabled host (CI job `integration`)
- [x] GitHub Actions completed on actual public repository
- [ ] Public npm package release and provenance verified (optional)

Do not mark unchecked gates complete before public release validation.

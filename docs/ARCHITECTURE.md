# Engine design

`src/config.js` validates settings before a network or CLI probe runs. `src/request.js` handles same-origin HTTP lifecycle calls and read-only HTTP probes. `src/probes.js` implements exact-scope PostgreSQL, Redis, and S3 checks via installed CLIs (no arbitrary command execution). `src/engine.js` orchestrates baseline, deletion, and repeated observation. `src/report.js` emits deterministic terminal/JSON/HTML outputs.

## Result schema v1

```json
{
  "schema_version": "1",
  "tool": "EraseLoop",
  "subject_fingerprint": "el_…abc123",
  "result": "failed",
  "observation": {"interval_ms": 250, "duration_ms": 500, "grace_ms": 0},
  "reason": "data_reappeared",
  "observations": [
    {"phase":"baseline","t_ms":0,"checks":[{"name":"db","state":"present"}]},
    {"phase":"post_delete","t_ms":250,"checks":[{"name":"db","state":"absent"}]},
    {"phase":"post_delete","t_ms":500,"checks":[{"name":"db","state":"present"}]}
  ],
  "probes": [{"name":"db","type":"http","result":"failed","reason":"data_reappeared"}],
  "limitations": ["Only explicitly configured stores and the configured observation window are verified."]
}
```

Time offsets are measured since the run began and include network latency; do not infer exact scheduling guarantees from sample timestamps. The subject fingerprint is deliberately non-reversible at a practical level for normally generated random test identities and is **not** the full generated identifier.

## Limitations of deletion evidence

Successful absence observations are not a proof of complete data erasure. Replicas, index lag, TTLs, backups, other schemas, third-party APIs, key re-creation after the observation window, and authorization errors can invalidate assumptions. Treat `unknown` as `inconclusive`, never `absent`.

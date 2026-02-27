# Lint Metrics (Local Scaffold)

The linter now records local run metrics in browser storage under:

- `appledax-lint-metrics`

Tracked fields:

- `totalRuns`
- `totalDiagnostics`
- `byRule` (rule hit counters)
- `bySeverity` (error/warning/info counters)
- `lastRunAt` (epoch ms)

Purpose:

- baseline observability for rule tuning
- identify noisy rules and false-positive candidates
- support monthly quality iteration (#10 roadmap item)

Notes:

- metrics are local-only (per browser profile)
- no backend transmission
- values reset by clearing local storage

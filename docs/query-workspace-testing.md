# Query Workspace Testing

## Unit test scenarios (logic)

1. `QueryStateStore`
- create tab, switch tab, close tab, rename tab
- run status transitions: `idle -> running -> success/error/cancelled`

2. `summarizeBenchmark`
- odd/even run counts
- p95 on small arrays
- zero-run edge case

3. `mapQueryError`
- `401`, `403`, `429`, `5xx`, default path

## Integration test scenarios

1. Execute query success
- valid delegated token
- valid workspace + dataset
- verify rows, elapsed, requestId

2. Execute query permission failure
- user without Build
- expect mapped error with actionable suggestion

3. Cancel execution
- start run and cancel
- expect `cancelled` status in panel

4. Benchmark run
- 5 iterations
- verify median/p95/stddev shown

5. CSV export
- run query and export
- verify headers and row values in file

## Manual acceptance checklist

1. Open Query panel from activity bar and sidebar tab.
2. Configure Tenant ID, Client ID, Redirect URI.
3. Sign in, select workspace and dataset.
4. Run:
   `EVALUATE ROW("Ping", 1)`
5. Confirm:
- result table renders
- elapsed ms and request id shown
- recent history item added
6. Run benchmark and confirm run list + median/p95.
7. Trigger missing permission and confirm actionable error text.

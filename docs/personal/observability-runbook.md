# Observability runbook

Operator's reference for the metrics + logs + alerts stack on `homelander`. Everything here is copy-pasteable. Sections are independent; jump to whichever you need.

## 1. Quick reference

| Thing | Where |
|---|---|
| Grafana UI | https://grafana-home.quybits.com (also `grafana.homelander.local` on LAN) |
| Grafana user / password | K8s Secret `grafana/grafana-secrets` keys `admin-user` / `admin-password` |
| Prometheus UI | in-cluster only — see [§3](#3-prometheus-ui) for port-forward |
| Alertmanager UI | in-cluster only — see [§4](#4-alertmanager-ui) for port-forward |
| Slack alerts | `#alerts` (default), `#alerts-critical` (severity=critical) |
| Alert routing | `AlertmanagerConfig monitoring/royal-dispatch` |
| GitOps repo | `gitops-rackspace` |
| Backend app repo | `the-royal-dispatch` |

## 2. Grafana

### Open the UI

```
https://grafana-home.quybits.com
```

### Get credentials

```bash
# Username (stable: "admin")
kubectl -n grafana get secret grafana-secrets -o jsonpath='{.data.admin-user}' | base64 -d; echo

# Password
kubectl -n grafana get secret grafana-secrets -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

### Reset admin password if login 401s

Grafana stores the admin password hash in its DB on first install. If someone changed it via the UI, the Secret can drift from the DB. To force-reset to whatever's in the Secret:

```bash
NEW_PW=$(kubectl -n grafana get secret grafana-secrets -o jsonpath='{.data.admin-password}' | base64 -d)
kubectl -n grafana exec deploy/grafana -c grafana -- grafana-cli admin reset-admin-password "$NEW_PW"
```

### What's in the UI

- **Dashboards → Royal Dispatch** — custom dashboard: backend request rate, p95 latency, LangGraph node durations, external-API outcomes, story-generation p95, royal-dispatch error logs.
- **Dashboards → (community)** — Kubernetes cluster overview (315), node-exporter (1860), kube-state-metrics (13332), ingress-nginx (9614), postgres-exporter (9628), Loki logs (13639).
- **Explore → Prometheus** — ad-hoc PromQL. Select data source "Prometheus" (default).
- **Explore → Loki** — ad-hoc LogQL. Select data source "Loki".
- **Alerting → Alert rules** — all 159 loaded alert rules, filterable by state (firing / pending / inactive).
- **Alerting → Contact points** — Slack receivers (`slack-default`, `slack-critical`, `null`).

## 3. Prometheus UI

Not ingress-exposed. Port-forward from your laptop:

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090
# leave running in one terminal; open http://localhost:9090
```

Most useful tabs:
- **Status → Targets** — scrape health per job. Anything not UP here won't produce metrics.
- **Status → Rules** — all rule groups with their last evaluation + state.
- **Alerts** — current alert states grouped by name; clicking expands to series-level detail.
- **Graph** — interactive PromQL; useful for iterating on alert expressions before committing.

## 4. Alertmanager UI

Port-forward:

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-alertmanager 9093:9093
# http://localhost:9093
```

Most useful tabs:
- **Alerts** — everything currently active in Alertmanager (distinct from "firing in Prometheus" because of `for:` windows).
- **Silences** — create a silence without a git commit. Useful for planned maintenance.
- **Status → Config** — the actual route tree in effect. Verifies `severity=critical` → `slack-critical` matcher is correct.

## 5. Common PromQL queries

### Cluster health

```promql
# Nodes not Ready
kube_node_status_condition{condition="Ready",status="true"} == 0

# Memory pressure by node
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)

# Disk free ratio (exclude tmpfs/overlay)
node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}
  / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"}

# Pods crashlooping in last 5m (rate > 0)
rate(kube_pod_container_status_restarts_total[5m]) > 0
```

### Ingress-nginx

```promql
# Request rate by status class
sum by (status) (rate(nginx_ingress_controller_requests[5m]))

# 5xx error rate fraction
sum(rate(nginx_ingress_controller_requests{status=~"5.."}[5m]))
  / sum(rate(nginx_ingress_controller_requests[5m]))

# Active connections
nginx_ingress_controller_nginx_process_connections
```

### Postgres

```promql
# Is postgres up?
pg_up

# Active connections by DB
pg_stat_database_numbackends

# Transaction commit rate
rate(pg_stat_database_xact_commit[5m])
```

### Royal Dispatch backend

```promql
# Up state (job label is "backend", named after the Service)
up{job="backend"}

# Request rate by handler (instrumentator auto-metric)
sum by (handler) (rate(http_requests_total{job="backend"}[5m]))

# p95 latency by handler
histogram_quantile(0.95,
  sum by (le, handler) (
    rate(http_request_duration_seconds_bucket{job="backend"}[5m])
  )
)

# External API call outcomes (custom metric)
sum by (provider, outcome) (rate(royal_external_api_calls_total[5m]))

# LangGraph node p95 duration (custom metric)
histogram_quantile(0.95,
  sum by (le, node) (rate(royal_langgraph_node_duration_seconds_bucket[5m]))
)

# End-to-end story generation p95 (custom metric)
histogram_quantile(0.95,
  sum by (le, story_type) (rate(royal_story_generation_seconds_bucket[5m]))
)
```

### Loki / Alloy self-health

```promql
# Loki ingestion rate
sum(rate(loki_distributor_bytes_received_total[5m]))

# Alloy write latency
histogram_quantile(0.95,
  rate(loki_write_entry_propagation_latency_seconds_bucket[5m])
)

# Alloy drops (should be 0)
loki_write_dropped_entries_total
```

## 6. Common LogQL queries

Alloy tags every line with: `namespace`, `pod`, `container`, `app`, `job` (= `<namespace>/<container>`).

### Tail by namespace or container

```logql
# All logs from the backend app
{namespace="royal-dispatch", container="backend"}

# Everything in a namespace
{namespace="royal-dispatch"}

# By Kubernetes app label
{app="royal-dispatch"}

# Multiple namespaces
{namespace=~"royal-dispatch|n8n"}
```

### Filter by message content

```logql
# Errors / exceptions anywhere in backend
{namespace="royal-dispatch", container="backend"} |~ "(?i)error|exception|traceback"

# Successful story requests
{namespace="royal-dispatch", container="backend"} |= "POST /story" |= "200"

# External-API-related lines
{namespace="royal-dispatch", container="backend"} |~ "(?i)anthropic|elevenlabs|mem0"
```

### Parse structured logs (if JSON)

```logql
# Counts of log levels in the last 5 min (works for JSON-formatted logs)
{namespace="royal-dispatch", container="backend"}
  | json
  | level != ""

# Rate of errors per pod
sum by (pod) (
  count_over_time({namespace="royal-dispatch", container="backend"} |~ "ERROR" [5m])
)
```

### Discovering what's available

```logql
# How many distinct log streams per namespace
sum by (namespace) (count_over_time({namespace=~".+"}[5m]))

# List all container labels present
topk(20, count by (container) (count_over_time({container=~".+"}[5m])))
```

## 7. Common kubectl commands

### Scrape target health

```bash
# Via Prometheus API (from port-forward)
curl -s 'http://localhost:9090/api/v1/targets' \
  | jq '.data.activeTargets[] | {job: .labels.job, health: .health, lastError: .lastError}' \
  | head -40

# Filter to what's DOWN
curl -s 'http://localhost:9090/api/v1/targets' \
  | jq '.data.activeTargets[] | select(.health != "up") | {job: .labels.job, ns: .labels.namespace, err: .lastError}'
```

### Flux state

```bash
flux get kustomizations                 # all overlays
flux get helmreleases -A                # all Helm releases
flux get kustomization grafana          # one
flux reconcile source git flux-system   # pull latest git
flux reconcile kustomization <name> --with-source    # force re-apply
flux reconcile helmrelease -n <ns> <name> --force    # reset HR retry counter + re-run
flux suspend helmrelease -n <ns> <name>              # stop reconciling (debug)
flux resume helmrelease -n <ns> <name>
```

### PrometheusRules / ServiceMonitors

```bash
# Our custom alert rules
kubectl -n monitoring get prometheusrule infra ingress app -o yaml

# All ServiceMonitors
kubectl -n monitoring get servicemonitor

# Check the release label (required for the Operator to pick them up)
kubectl -n monitoring get servicemonitor -L release
```

### Loki / Alloy state

```bash
# Loki pod status
kubectl -n monitoring get pods -l app.kubernetes.io/name=loki

# Alloy DaemonSet health (should be DESIRED == READY == node count)
kubectl -n monitoring get ds alloy

# Alloy logs for a specific node
kubectl -n monitoring logs ds/alloy -c alloy --tail=50 | grep -v "using pod"

# Grafana pod (2 containers: grafana + grafana-sc-dashboard sidecar)
kubectl -n grafana get pod -l app.kubernetes.io/name=grafana
kubectl -n grafana logs deploy/grafana -c grafana-sc-dashboard --tail=50   # dashboard discovery
```

### Write a quick log entry directly to Loki (test)

```bash
# Uses a throwaway curl pod — Loki isn't exposed outside the cluster
NOW_NS=$(date +%s%N)
kubectl -n monitoring run logtest --rm -i --restart=Never \
  --image=curlimages/curl:8.11.1 --command -- /bin/sh -c "
    curl -s -XPOST -H 'Content-Type: application/json' \
      --data '{\"streams\":[{\"stream\":{\"namespace\":\"test\",\"app\":\"manual\"},\"values\":[[\"$NOW_NS\",\"hello from runbook\"]]}]}' \
      http://loki.monitoring.svc.cluster.local:3100/loki/api/v1/push
  "

# Then query it back
kubectl -n monitoring run logquery --rm -i --restart=Never \
  --image=curlimages/curl:8.11.1 --command -- /bin/sh -c "
    curl -sG --data-urlencode 'query={namespace=\"test\"}' \
      --data 'limit=3' --data 'start=$((NOW_NS-60000000000))' --data 'end=$((NOW_NS+60000000000))' \
      http://loki.monitoring.svc.cluster.local:3100/loki/api/v1/query_range
  "
```

## 8. Alert triage

### When Slack posts an alert

1. Open Grafana → Alerting → Alert rules, filter to the alert name.
2. Click the rule to see the evaluating PromQL expression + its current value per series.
3. Grab the `summary` and `description` annotations — they include likely source files and correlation queries (backend alerts name `backend/graph.py`, `backend/services/elevenlabs_convai.py` etc.).
4. Follow the description's suggested command or LogQL query. Most alerts are cross-referenced to a Loki query.

### Alert keeps firing after root cause is fixed

Alertmanager keeps alerts in `active` state for the whole `repeatInterval` (4h in our config) plus the `for:` window. To clear faster, silence it via the UI (§4). That doesn't fix the root cause; it just stops paging.

### Known-noise alerts on k3s

These three fire permanently on k3s because the components are embedded in the k3s binary and don't expose separate `/metrics` endpoints:

- `KubeControllerManagerDown`
- `KubeSchedulerDown`
- `KubeProxyDown`

**Clean fix**: set the chart values to disable those scrape jobs (and their associated rules).

In `apps/kube-prometheus-stack/base/helmrelease.yaml` under `spec.values:`:

```yaml
kubeControllerManager:
  enabled: false
kubeScheduler:
  enabled: false
kubeProxy:
  enabled: false
```

Until that lands, silence them in Alertmanager UI (§4) so they don't clutter `#alerts-critical`.

### The Watchdog alert in "firing" state

Expected. It's the chart's dead-man's-switch — always fires so an external monitor can detect its absence. Routed to the `null` receiver, so it never reaches Slack. Leave it alone.

## 9. Known issues / footguns

### Grafana admin password vs Secret drift

Grafana stores the admin password hash in its internal SQLite DB on first install. If someone later changes it via the UI, the Secret value drifts and API auth with the Secret's password will 401. Use the `grafana-cli admin reset-admin-password` approach from §2.

### Flux image automation pipeline

The backend image auto-updates on merge to `main` via a five-stage pipeline:

```
git push → ImageRepository scan → ImagePolicy resolve → ImageUpdateAutomation commit to gitops
         → Kustomization reconcile → Deployment rollout
```

A stall at any stage looks like "old pod still serving." Quick diagnostic:

```bash
flux get image repository <name>   # last scan
flux get image policy <name>       # resolved tag
flux get image update <name>       # last commit to gitops
# if all three look current, force:
flux reconcile kustomization royal-dispatch --with-source
```

### Loki `loki.source.file` doesn't glob mid-path

If you edit the Alloy River config, note: `loki.source.file` tails exact paths. The canonical pipeline is `discovery.kubernetes → discovery.relabel → local.file_match → loki.source.file → loki.write`. Skipping `local.file_match` means `stat()` fails on trailing `*.log` globs.

### `loki.source.kubernetes` hits K8s API rate limits

Don't use `loki.source.kubernetes` for tailing container logs on a multi-pod node. It opens a watch per container and hits client-go's default 5 QPS limit. Use `loki.source.file` (which is what we have) — it reads from the kubelet's `/var/log/pods/` hostPath directly.

### Prometheus target named after Service, not ServiceMonitor

When you write an alert expression with `{job="..."}`, the job label value is the **Service name**, not the ServiceMonitor name. For our backend, that means `job="backend"`, not `job="royal-dispatch-backend"`. Same for every other ServiceMonitor we have.

### n8n `N8N_METRICS=true` required for metrics

If you see no metrics from n8n, it's because the env var isn't set. It's set in `apps/n8n/base/helmrelease.yaml` under `values.main.extraEnv.N8N_METRICS`. Removing it silently stops metric production.

## 10. Source references

- **Plan**: `docs/superpowers/plans/2026-04-22-prometheus-monitoring.md` (includes post-execution corrections inline under each phase's callout).
- **Design spec**: `docs/superpowers/specs/2026-04-22-prometheus-monitoring-design.md`.
- **Blog posts**:
  - [`2026-04-22-observability-and-the-alert-that-fixes-itself.md`](blogs/2026-04-22-observability-and-the-alert-that-fixes-itself.md) — design rationale.
  - [`2026-04-23-prometheus-rollout-phases-1-5.md`](blogs/2026-04-23-prometheus-rollout-phases-1-5.md) — Phases 1–5 implementation.
  - [`2026-04-24-loki-phase-6-four-fixes-before-first-ready.md`](blogs/2026-04-24-loki-phase-6-four-fixes-before-first-ready.md) — Phase 6 / Loki.
  - [`2026-04-24-alloy-phase-7-the-ceiling-of-helm-template.md`](blogs/2026-04-24-alloy-phase-7-the-ceiling-of-helm-template.md) — Phase 7 / Alloy.
  - [`2026-04-24-grafana-phase-8-the-kustomize-shaped-hole.md`](blogs/2026-04-24-grafana-phase-8-the-kustomize-shaped-hole.md) — Phase 8 / Grafana.

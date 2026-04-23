# Adding Prometheus, Loki, and an Alert Pipeline Designed for AI-Agent Remediation

The Royal Dispatch has been running in production on a Flux-managed k3s cluster for a few weeks. FastAPI backend, Next.js frontend, n8n, Postgres, MinIO, Qdrant — all reconciled from the `gitops-rackspace` repo. No metrics, no log aggregation, no alerts. If the ElevenLabs API started returning 500s at 2am, the first person to notice would be a paying user.

This post documents the observability stack I put in, every decision I made and what I rejected, and the specific technical choices that make the stack ready to be consumed by an AI agent for automated incident remediation — not in this PR, but in the follow-up.

---

## What We're Building

One cluster, one stack, pinned chart versions:

| Component | Purpose | Chart | Version |
|---|---|---|---|
| **kube-prometheus-stack** | Prometheus + Alertmanager + node-exporter + kube-state-metrics + Operator CRDs | `prometheus-community/kube-prometheus-stack` | `83.7.0` |
| **prometheus-postgres-exporter** | Postgres internals | `prometheus-community/prometheus-postgres-exporter` | `7.5.2` |
| **Loki** | Log aggregation | `grafana/loki` | `6.55.0` |
| **Alloy** | Log collection DaemonSet | `grafana/alloy` | `1.7.0` |
| **Grafana** | Dashboards (existing HelmRelease, unchanged) | `grafana/grafana` | existing `>=7.0.0 <8.0.0` |

All chart versions pulled from upstream `Chart.yaml` at the moment of writing. No range pins except where the existing Grafana release already used one. No `latest` tags.

---

## Goals and Constraints

1. **Single cluster.** I recently decommissioned my Rackspace cluster. Everything runs on `homelander`, a three-node k3s cluster on a Minisforum UM890 Pro.
2. **Reuse existing infrastructure.** MinIO, Vault, External Secrets Operator, ingress-nginx, Grafana are all already running. Don't duplicate them.
3. **Exact version pinning.** Flux reconciles every 30 minutes. A range pin is a time bomb.
4. **The alerting pipeline must be AI-agent consumable.** Every design decision downstream of "fire an alert" must preserve enough structure for an agent to take over the remediation flow.
5. **No instrumentation debt in the Next.js frontends.** PWA performance matters; bundle size for application metrics doesn't pay for itself at the edge.

---

## Architecture Decisions

### 1. Metrics Stack: `kube-prometheus-stack` vs plain Prometheus vs Victoria Metrics vs Grafana Mimir

**Plain `prometheus` Helm chart** is the lightest option. A single Prometheus pod, manual `scrape_configs`, no Operator. It works, but every new exporter — postgres-exporter, ingress-nginx metrics, n8n, Loki's self-metrics — assumes the Prometheus Operator is running, because the contract is "drop a `ServiceMonitor` next to your service and the Operator wires it up." Without the Operator, every target means hand-editing a central `scrape_configs` block and reloading. That workflow does not scale past the third integration.

**Victoria Metrics** is a genuinely better TSDB than Prometheus for retention-heavy workloads, with a drop-in Prometheus API. For a cluster with one tenant (me) and 15-day retention, the throughput and compression wins are irrelevant. It also breaks the Operator-and-ServiceMonitor pattern everything else in the ecosystem uses.

**Grafana Mimir + Agent + LGTM** is the right choice if you're building a multi-tenant metrics platform. I am not. Mimir is a career in YAML.

**Why `kube-prometheus-stack`:** Operator-native CRDs (`ServiceMonitor`, `PodMonitor`, `PrometheusRule`, `AlertmanagerConfig`), bundled `node-exporter` and `kube-state-metrics`, standard Kubernetes control-plane metrics out of the box, and compatibility with every downstream tool that exists. The chart is 83 major versions in; it is the boring, correct choice.

Subchart wrinkle: the chart bundles its own Grafana. I already have a Grafana HelmRelease with Vault-backed admin credentials, ingress, and persistence. Replacing it with the bundled one would mean re-plumbing all of that for zero benefit. So:

```yaml
values:
  grafana:
    enabled: false
```

The existing Grafana gets two new data sources patched into its values (Prometheus and Loki); nothing else about that release changes.

---

### 2. Log Stack: Loki vs ELK vs OpenSearch vs Splunk

**Elasticsearch + Kibana** is the industry default and it indexes every log field. That indexing is where the cost lives — Elasticsearch wants a lot of RAM, a lot of disk IOPS, and a lot of operator attention. For a personal project, that's a non-starter.

**OpenSearch** is the same tradeoffs with a different logo.

**Splunk / Datadog / commercial log tools** are priced for enterprises.

**Why Loki:** Loki indexes labels, not log content. Chunks are offloaded to object storage. The storage bill for a hobby project is effectively zero when you already run MinIO. And Loki + Grafana gives you PromQL-style queries (`{namespace="royal-dispatch"} |~ "ElevenLabs"`) with the exact same label vocabulary your metrics use — which matters a lot for the agent story (see section 7).

---

### 3. Loki Deployment Mode: SingleBinary vs SimpleScalable vs Distributed

Loki's Helm chart supports three deployment modes. The names are self-explanatory:

- **Distributed** — one deployment per microservice (ingester, distributor, querier, query-frontend, query-scheduler, compactor, index-gateway, ruler). For teams running logs across hundreds of services at scale.
- **SimpleScalable (SSD)** — three deployments (read/write/backend). Moderate scale.
- **SingleBinary** — one StatefulSet running all components. For a small cluster.

**Why SingleBinary:** I have one cluster and one tenant. SingleBinary is one pod and a PVC. In Loki's v6 chart, this mode must be explicitly declared because the default changed:

```yaml
deploymentMode: SingleBinary
singleBinary:
  replicas: 1
  persistence: { enabled: true, size: 10Gi, storageClass: local-path }
```

---

### 4. Loki Storage Backend: Bundled MinIO vs Existing MinIO vs Filesystem

The Loki Helm chart has a dependency on the MinIO chart and will happily install its own MinIO if you set `minio.enabled: true`. The filesystem backend exists but is only suitable for development.

**Why existing MinIO:** My cluster already runs MinIO for the princess audio files the backend generates. Running a second MinIO for Loki would be two sets of credentials, two PVCs, two operator burdens. Loki gets three new buckets in the existing MinIO instead:

```yaml
values:
  loki:
    storage:
      type: s3
      bucketNames: { chunks: loki-chunks, ruler: loki-ruler, admin: loki-admin }
      s3:
        endpoint: http://minio.minio.svc.cluster.local:9000
        region: us-east-1
        s3ForcePathStyle: true
        insecure: true
        accessKeyId: ${LOKI_S3_ACCESS_KEY}
        secretAccessKey: ${LOKI_S3_SECRET_KEY}
  minio: { enabled: false }
```

Bucket creation is a one-shot Kubernetes Job that runs `mc mb --ignore-existing local/loki-chunks local/loki-ruler local/loki-admin`, mirroring the `minio-init` container pattern already used in `docker-compose.yml`. S3 credentials come from Vault at `secret/observability/loki-s3` via an `ExternalSecret`, same pattern as every other credential in the repo.

---

### 5. Log Shipper: Alloy vs Promtail vs Fluent Bit

**Promtail** is Grafana's classic log shipper for Loki. It is being deprecated in favour of Alloy. If I install Promtail today, I will rip it out within a year.

**Fluent Bit** works, but you write the Kubernetes discovery and relabeling logic yourself. The Loki integration is not first-class.

**Why Alloy:** It's Grafana's current unified agent (OpenTelemetry-compatible, supports metrics, logs, traces, profiles). The Helm chart is at `1.7.0` and the Kubernetes DaemonSet pattern is documented. The Alloy config is declarative and readable.

The DaemonSet scrapes `/var/log/pods/*/*.log` on each node and ships lines to Loki. The config snippet:

```alloy
discovery.kubernetes "pod" {
  role = "pod"
  selectors { role = "pod" field = "spec.nodeName=" + sys.env("HOSTNAME") }
}
discovery.relabel "pod_logs" {
  targets = discovery.kubernetes.pod.targets
  rule { source_labels = ["__meta_kubernetes_namespace"]        target_label = "namespace" }
  rule { source_labels = ["__meta_kubernetes_pod_name"]         target_label = "pod" }
  rule { source_labels = ["__meta_kubernetes_pod_container_name"] target_label = "container" }
  rule { source_labels = ["__meta_kubernetes_pod_label_app"]    target_label = "app" }
  rule { source_labels = ["__meta_kubernetes_pod_uid","__meta_kubernetes_pod_container_name"]
         separator = "/" action = "replace"
         replacement = "/var/log/pods/*$1/*.log" target_label = "__path__" }
}
loki.source.kubernetes "pod_logs" {
  targets    = discovery.relabel.pod_logs.output
  forward_to = [loki.write.default.receiver]
}
loki.write "default" {
  endpoint { url = "http://loki.monitoring.svc.cluster.local:3100/loki/api/v1/push" }
}
```

---

### 6. Alertmanager Receiver Configuration: Helm Values vs `AlertmanagerConfig` CRD

**Helm values** put receiver configuration inside the `kube-prometheus-stack` values block. Changing receivers means a chart reconcile cycle.

**`AlertmanagerConfig` CRD** is a standalone Kubernetes resource picked up by the Operator. You change it independently of the Helm release.

**Why `AlertmanagerConfig`:** Receiver configuration changes more often than stack versions. Routing a new severity to a new channel should not drag the chart upgrade lifecycle along with it. The CRD also makes the routing tree diffable in code review without chart values context.

```yaml
apiVersion: monitoring.coreos.com/v1alpha1
kind: AlertmanagerConfig
metadata:
  name: royal-dispatch
  namespace: monitoring
  labels: { alertmanagerConfig: royal-dispatch }
spec:
  route:
    receiver: slack-default
    groupBy: [alertname, namespace]
    groupWait: 30s
    groupInterval: 5m
    repeatInterval: 4h
    routes:
      - receiver: slack-critical
        matchers: [{ name: severity, value: critical }]
  receivers:
    - name: slack-default
      slackConfigs:
        - apiURL: { name: alertmanager-slack, key: webhook-url }
          channel: "#alerts"
          sendResolved: true
    - name: slack-critical
      slackConfigs:
        - apiURL: { name: alertmanager-slack, key: webhook-url }
          channel: "#alerts-critical"
          sendResolved: true
```

Adding Telegram is a `telegramConfigs:` block. Adding a webhook-to-an-agent (section 7) is a `webhookConfigs:` block. No Helm churn.

For the CRD to be picked up by Alertmanager, the stack values need:

```yaml
alertmanager:
  alertmanagerSpec:
    alertmanagerConfigSelector: { matchLabels: { alertmanagerConfig: royal-dispatch } }
    alertmanagerConfigMatcherStrategy: { type: None }
```

`type: None` disables the default namespace-and-severity matcher injection so the routing tree in the CRD owns the full routing logic.

---

## The Label Schema

This is the single most important design choice in the whole stack, and it's a one-liner: **Alloy's relabel rules produce the same label names Prometheus uses for the same pod.**

| Label | Source |
|---|---|
| `namespace` | `__meta_kubernetes_namespace` |
| `pod` | `__meta_kubernetes_pod_name` |
| `container` | `__meta_kubernetes_pod_container_name` |
| `app` | `__meta_kubernetes_pod_label_app` |
| `job` | `<namespace>/<container>` |

A spike in `http_request_duration_seconds` for the backend is queryable as `{handler="/story"}` in Prometheus. The same pod's logs for the same time window are queryable as `{namespace="royal-dispatch", pod=~"backend-.*"}` in Loki. In Grafana, the drill-down from metric to log happens without parsing pod names out of a regex.

This matters enormously for the agent story. An agent handed an alert with labels `{namespace: "royal-dispatch", pod: "backend-abc123"}` can issue a Loki query using the same label set, no translation layer required.

---

## Backend Instrumentation

Only one service gets code changes: the FastAPI backend.

**Dependencies** (`backend/pyproject.toml`):

```toml
prometheus-fastapi-instrumentator = "^7.0.0"
prometheus-client = "^0.21.0"
```

**`backend/main.py`:**

```python
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator(
    should_group_status_codes=False,
    should_instrument_requests_inprogress=True,
    excluded_handlers=["/docs", "/openapi.json", "/healthz", "/metrics"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
```

This exposes generic RED metrics (requests, errors, duration) labelled by handler and method. Free. The three **custom** metrics are the interesting ones:

```python
# backend/utils/metrics.py
from prometheus_client import Counter, Histogram

langgraph_node_duration = Histogram(
    "royal_langgraph_node_duration_seconds",
    "Time spent in each LangGraph node",
    labelnames=("node", "story_type"),
    buckets=(0.1, 0.5, 1, 2, 5, 10, 30, 60),
)
external_api_calls = Counter(
    "royal_external_api_calls_total",
    "External API calls by provider and outcome",
    labelnames=("provider", "outcome"),   # anthropic | elevenlabs | openai | mem0
)                                          # ok | error | timeout
story_generation_seconds = Histogram(
    "royal_story_generation_seconds",
    "End-to-end story generation time",
    labelnames=("story_type",),
    buckets=(1, 5, 10, 20, 30, 60, 120),
)
```

Each of those metrics corresponds to a failure mode I've actually hit:

- `langgraph_node_duration` — because when the pipeline is slow, "the backend is slow" is a useless observation; I need to know which LangGraph node.
- `external_api_calls` — because ElevenLabs has returned 200 with empty audio before, and generic HTTP metrics don't catch that. The `outcome` label is set from the response-content check, not the HTTP status.
- `story_generation_seconds` — because two-minute story generations are a user-experience problem even when the backend is "up."

Frontend and admin (both Next.js) are deliberately not instrumented. What matters at the edge for a PWA is the 5xx rate and latency from ingress-nginx, plus blackbox probes for cert validity and reachability. Application-level metrics inside the Next.js process would add bundle size and monitor the wrong thing.

---

## The Agent-Ready Alerting Pipeline

The day-one `PrometheusRule` set is ten alerts covering node, pod, ingress, cert, Postgres, and backend SLOs. Every one of them carries two annotations:

```yaml
- alert: BackendExternalApiErrors
  expr: sum(rate(royal_external_api_calls_total{outcome="error"}[10m])) > 0.1
  for: 10m
  labels:
    severity: warning
    service: backend
  annotations:
    summary: "Backend external API error rate > 0.1/s for 10m"
    description: |
      Counter {{ $labels.__name__ }} labelled provider={{ $labels.provider }}
      has been firing errors at {{ $value }}/s. Likely source files:
      backend/utils/{{ $labels.provider }}_client.py.
```

The `description` is deliberately machine-readable. It names the likely source files for the agent to read. It names the specific counter for the agent to query. These are not helpful English for a pager-duty operator — they're structured breadcrumbs for an agent consuming the alert.

Here is the flow I'm building toward. **This is not in this PR. This is what the design makes possible.**

1. Alertmanager fires. The routing tree in the `AlertmanagerConfig` CRD sends the payload to two receivers in parallel: Slack (for me to see), and a webhook at an agent service running in the same cluster.
2. The agent receives a structured payload: `alertname`, labels, annotations (including `summary` and `description`), `startsAt`, `generatorURL` pointing to the PromQL expression that fired.
3. The agent queries **Prometheus** for the firing series and any correlated series named in `description`. The `generatorURL` means the agent can re-run the query with different time ranges or aggregations without writing a custom metrics client.
4. The agent queries **Loki** for the same time window, using the alert's labels directly. Because the label schemas match (section 4), this is literally `{namespace="<alert.namespace>", pod=~"<alert.pod>.*"}` — no translation layer.
5. The agent reads the source files named in `description` annotations. For The Royal Dispatch, that's almost always a LangGraph node function or an external API client under `backend/`.
6. The agent opens a **draft PR** against `main` with a proposed fix. PR description: what fired, what the logs showed, what the fix does, how it was verified. Same form as a human incident report.
7. Flux reconciles the merged PR. No separate deploy pipeline.

The design choices that make this work from day one, all in the stack above:

| Requirement | Design choice |
|---|---|
| Agent can consume alerts without parsing English | Every rule has structured `summary` and `description` annotations |
| Agent can jump from alert labels to logs in one query | Prometheus and Loki share `namespace`, `pod`, `container`, `app`, `job` labels |
| Agent can re-query metrics with arbitrary aggregations | `generatorURL` in the alert payload links to the PromQL expression |
| Agent can add webhook receivers without chart churn | Receivers live in `AlertmanagerConfig` CRD, not in Helm values |
| Agent can deploy its own fixes via PR | Flux already reconciles merged PRs; no separate pipeline exists |

I am not planning to let the agent auto-merge. Draft PR, human review, human merge. The risk of an overenthusiastic agent writing a "fix" that quietly deletes a feature is too high to hand it the merge button. But I'll take ninety percent of the diagnostic work being done before I wake up.

---

## Rollout Plan

Nine PRs, each independently reviewable and revertible:

1. Patch `ingress-nginx` HelmRelease to enable `controller.metrics.enabled=true` + `serviceMonitor.enabled=true`. No-op until Prometheus is up.
2. Install `kube-prometheus-stack` + Alertmanager namespace + `AlertmanagerConfig` + `ExternalSecret` for Slack. Verify CRDs installed, Prometheus UI reachable via `kubectl port-forward`, forced test alert fires in Slack.
3. Install `prometheus-postgres-exporter` + migration for the exporter DB user. Verify `pg_up == 1`.
4. Add ServiceMonitors for backend, MinIO, Qdrant, n8n (after setting `N8N_METRICS=true`). Verify all targets UP in `/targets`.
5. Backend instrumentation PR: `prometheus-fastapi-instrumentator` + custom metrics + tests. Image automation redeploys.
6. Install Loki + `ExternalSecret` for S3 credentials + MinIO bucket Job. Verify `loki_build_info` metric and a test `POST /loki/api/v1/push`.
7. Install Alloy DaemonSet. Verify `{namespace="royal-dispatch"}` in Grafana Explore returns log lines.
8. Patch Grafana HelmRelease: add Prometheus and Loki data sources, import community dashboards, commit custom Royal Dispatch dashboard JSON.
9. Ship day-one `PrometheusRule` CRs. Verify with a temporary force-fire on a warning threshold.

---

## Verification

- `kubectl get crd | grep monitoring.coreos.com` — 10 Prometheus Operator CRDs present.
- `kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090` → `/targets` all UP.
- `curl localhost:8000/metrics | grep royal_` after a `/story` call — custom counters advance.
- `logcli query '{namespace="royal-dispatch"}' --limit=5` — recent lines returned.
- Grafana data source health checks green; Royal Dispatch dashboard renders non-empty panels.
- Force-fire `BackendHighLatencyP95` by temporarily setting threshold to `> 0` → Slack message in `#alerts` within 30s.

---

## Out of Scope

- Deleting the decommissioned `clusters/rackspace/` and `apps/*/overlays/rackspace/` directories. Separate cleanup PR.
- Upgrading the Grafana chart from `7.x` (old `grafana/helm-charts` repo) to `12.x` (new `grafana-community/helm-charts` repo).
- Blackbox exporter for public endpoint probing.
- Remote-write to a longer-term metrics store if 15-day retention proves insufficient.
- The agent service itself. That's a separate repo, built on top of this substrate.

This observability stack is not the goal. The goal is the agent that sits on top of it. Every architecture decision in this post was filtered by: does this preserve enough structure for the agent to consume it? If yes, pick it. If no, pick something else.

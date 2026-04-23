# Prometheus + Loki Observability Stack — Design

**Date:** 2026-04-22
**Status:** Approved
**Scope:** `gitops-rackspace` (Kubernetes / Flux) + `backend/` (FastAPI instrumentation)

---

## Overview

Stand up a full observability stack on the `homelander` k3s cluster: metrics via `kube-prometheus-stack`, logs via Loki + Alloy, dashboards and alerts through the existing Grafana deployment. Alertmanager routes to Slack on day one, with a pluggable receiver config so Telegram/email/PagerDuty can be added later without restructuring.

Single cluster, single-binary services, small footprint. Exact chart versions pinned; upgrades are explicit.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Metrics stack | `kube-prometheus-stack` **83.7.0** (bundled Grafana disabled) | Operator + Prom + Alertmanager + node-exporter + kube-state-metrics + CRDs in one chart; matches exporter ecosystem expectations |
| Log stack | `loki` **6.55.0** in `SingleBinary` mode | Smallest viable Loki footprint; chunks offloaded to existing MinIO |
| Log collection | `alloy` **1.7.0** DaemonSet | Grafana's current agent (replaces Promtail); native Kubernetes pod-log discovery |
| Postgres metrics | `prometheus-postgres-exporter` **7.5.2** | Official community chart; sidecar-style matches existing infra pattern |
| Grafana | Keep existing HelmRelease unchanged | Already vault-wired with admin secret, ingress, persistence — only add data sources + dashboards |
| Storage backend for Loki | Existing MinIO (`loki-chunks`, `loki-ruler`, `loki-admin` buckets) | Zero new storage infra; MinIO already vault-credentialed |
| Retention | Prometheus 15d (18GB cap, 20Gi PV); Loki 30d | Covers a full sprint / incident window per signal type |
| Scope | Kubernetes only | Prod is where alerts matter; local dev can `curl localhost:8000/metrics` |
| Multi-cluster | Single cluster (homelander) | `rackspace` cluster was deleted |
| Alertmanager receiver | Slack first, configurable via `AlertmanagerConfig` CR | Webhook URL from Vault via `ExternalSecret`; swap receiver without touching Helm values |
| Backend instrumentation | `prometheus-fastapi-instrumentator` + custom `prometheus_client` metrics | One-line RED metrics + targeted LangGraph/external-API counters |
| Frontend / admin instrumentation | None (use ingress-nginx + blackbox) | Next.js RED at the edge is what matters for a PWA |

---

## Pinned chart versions

| Chart | Helm repo | Chart version | App version |
|---|---|---|---|
| `kube-prometheus-stack` | `https://prometheus-community.github.io/helm-charts` | `83.7.0` | prometheus-operator `v0.90.1` |
| `prometheus-postgres-exporter` | `https://prometheus-community.github.io/helm-charts` | `7.5.2` | `v0.19.1` |
| `loki` | `https://grafana.github.io/helm-charts` | `6.55.0` | `3.6.7` |
| `alloy` | `https://grafana.github.io/helm-charts` | `1.7.0` | `v1.15.0` |

Existing Grafana HelmRelease (`>=7.0.0 <8.0.0`) stays as-is. The Grafana chart has since moved to `grafana-community/helm-charts` (current `12.1.1` / Grafana `13.0.1`) — that upgrade is out of scope for this design.

---

## Architecture

```
┌────────────────── homelander (k3s) ────────────────────┐
│                                                          │
│  namespace: monitoring                                   │
│   ├─ kube-prometheus-stack                              │
│   │    ├─ Prometheus (15d, 20Gi PV / local-path)        │
│   │    ├─ Alertmanager ──► Slack webhook                │
│   │    ├─ node-exporter (DaemonSet)                     │
│   │    ├─ kube-state-metrics                            │
│   │    └─ Prometheus Operator (CRDs)                    │
│   ├─ Loki (SingleBinary)                                │
│   │    └─ chunks + index → MinIO bucket "loki-chunks"   │
│   └─ Alloy (DaemonSet) → scrapes /var/log/pods → Loki   │
│                                                          │
│  namespace: postgres                                    │
│   └─ prometheus-postgres-exporter                       │
│                                                          │
│  namespace: grafana  (existing)                         │
│   └─ Grafana                                            │
│        data sources:                                    │
│          • Prometheus (in-cluster svc)                  │
│          • Loki (in-cluster svc)                        │
│        dashboards:                                      │
│          • k8s-cluster / node-exporter / kube-state     │
│          • ingress-nginx / postgres-exporter / Loki     │
│          • royal-dispatch (custom JSON)                 │
└──────────────────────────────────────────────────────────┘
```

---

## GitOps layout

```
apps/
├── kube-prometheus-stack/
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── helmrepository.yaml
│   │   ├── helmrelease.yaml                    # chart 83.7.0
│   │   ├── alertmanager-config.yaml
│   │   ├── externalsecret-alertmanager.yaml
│   │   ├── servicemonitors/
│   │   │   ├── backend.yaml
│   │   │   ├── postgres.yaml
│   │   │   ├── minio.yaml
│   │   │   ├── qdrant.yaml
│   │   │   ├── n8n.yaml
│   │   │   └── ingress-nginx.yaml
│   │   ├── prometheusrules/ { infra.yaml, ingress.yaml, app.yaml }
│   │   └── kustomization.yaml
│   └── overlays/homelander/
├── prometheus-postgres-exporter/
│   ├── base/ { helmrelease.yaml (7.5.2), externalsecret.yaml, kustomization.yaml }
│   └── overlays/homelander/
├── loki/
│   ├── base/ { helmrelease.yaml (6.55.0), externalsecret-s3.yaml,
│   │            minio-bucket-job.yaml, kustomization.yaml }
│   └── overlays/homelander/
├── alloy/
│   ├── base/ { helmrelease.yaml (1.7.0), kustomization.yaml }
│   └── overlays/homelander/
├── grafana/base/helmrelease.yaml               # PATCH: additionalDataSources + dashboards
├── n8n/base/configmap.yaml                     # PATCH: N8N_METRICS=true
└── royal-dispatch/ (no manifest changes; /metrics endpoint added in code)

infrastructure/
└── ingress-nginx/*                              # PATCH: controller.metrics.enabled=true

clusters/homelander/
├── kube-prometheus-stack.yaml                  # NEW Flux Kustomization
├── loki.yaml                                    # NEW
├── alloy.yaml                                   # NEW
├── prometheus-postgres-exporter.yaml            # NEW
└── kustomization.yaml                           # add the 4 new entries
```

**Flux dependency graph:**

```
eso-store ──► ingress-nginx ──► kube-prometheus-stack ──► postgres-exporter
                                                   │
                            minio ──► loki ────────┤
                                            │
                                            ▼
                                         alloy
```

---

## Component detail

### kube-prometheus-stack (`apps/kube-prometheus-stack/base/helmrelease.yaml`)

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata: { name: kube-prometheus-stack, namespace: monitoring }
spec:
  interval: 30m
  timeout: 10m
  chart:
    spec:
      chart: kube-prometheus-stack
      version: 83.7.0
      sourceRef: { kind: HelmRepository, name: prometheus-community, namespace: flux-system }
  install: { crds: CreateReplace, remediation: { retries: 3 } }
  upgrade: { crds: CreateReplace }
  values:
    grafana: { enabled: false }
    crds:    { enabled: true }
    prometheus:
      prometheusSpec:
        retention: 15d
        retentionSize: 18GB
        storageSpec:
          volumeClaimTemplate:
            spec: { storageClassName: local-path, accessModes: [ReadWriteOnce],
                    resources: { requests: { storage: 20Gi } } }
        serviceMonitorSelectorNilUsesHelmValues: false
        podMonitorSelectorNilUsesHelmValues: false
        ruleSelectorNilUsesHelmValues: false
        probeSelectorNilUsesHelmValues: false
        resources: { requests: { cpu: 100m, memory: 512Mi }, limits: { memory: 1Gi } }
    alertmanager:
      alertmanagerSpec:
        alertmanagerConfigSelector: { matchLabels: { alertmanagerConfig: royal-dispatch } }
        alertmanagerConfigMatcherStrategy: { type: None }
        storage:
          volumeClaimTemplate:
            spec: { storageClassName: local-path, accessModes: [ReadWriteOnce],
                    resources: { requests: { storage: 2Gi } } }
    nodeExporter:     { enabled: true }
    kubeStateMetrics: { enabled: true }
```

`*SelectorNilUsesHelmValues: false` makes Prometheus pick up every ServiceMonitor/PodMonitor/PrometheusRule in the cluster, regardless of labels. Without it, each CR needs `release: kube-prometheus-stack`.

### Loki (`apps/loki/base/helmrelease.yaml`)

```yaml
values:
  deploymentMode: SingleBinary                 # REQUIRED for monolithic in v6
  loki:
    auth_enabled: false                        # single-tenant, internal svc only
    schemaConfig:
      configs:
        - from: "2026-04-22"
          store: tsdb
          object_store: s3
          schema: v13
          index: { prefix: loki_index_, period: 24h }
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
    limits_config: { retention_period: 720h }  # 30d
  singleBinary:
    replicas: 1
    persistence: { enabled: true, size: 10Gi, storageClass: local-path }
  minio:       { enabled: false }
  chunksCache:  { enabled: false }
  resultsCache: { enabled: false }
  gateway:      { enabled: false }
  monitoring:
    selfMonitoring: { enabled: false, grafanaAgent: { installOperator: false } }
    lokiCanary:     { enabled: false }
  test:         { enabled: false }
```

MinIO credentials are pulled from Vault at `secret/observability/loki-s3` by an `ExternalSecret`. Bucket creation is a one-shot `Job` running `mc mb --ignore-existing local/loki-chunks local/loki-ruler local/loki-admin` — mirrors the existing `minio-init` pattern in `docker-compose.yml`.

### Alloy (`apps/alloy/base/helmrelease.yaml`)

```yaml
values:
  alloy:
    configMap:
      create: true
      content: |
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
          rule { source_labels = ["__meta_kubernetes_namespace","__meta_kubernetes_pod_container_name"]
                 separator = "/" target_label = "job" }
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
    clustering: { enabled: false }
  controller: { type: daemonset }
  mounts:     { varlog: true }
```

Label schema (`namespace`, `pod`, `container`, `app`, `job`) is deliberately identical to Prometheus conventions so Grafana can pivot from a metrics spike to the same-time-window logs with `{namespace="royal-dispatch", pod=~"backend-.*"}`.

### prometheus-postgres-exporter

Deployed in the `postgres` namespace alongside the existing `postgres-postgresql` StatefulSet. Chart values:

```yaml
config:
  datasource:
    host: postgres-postgresql.postgres.svc.cluster.local
    user: postgres_exporter
    passwordSecret: { name: postgres-exporter, key: password }
    database: postgres
    sslmode: disable
serviceMonitor: { enabled: true, namespace: monitoring, interval: 30s }
```

`postgres_exporter` DB user is created via a migration in `backend/db/migrations/` with `pg_monitor` role grants.

### Grafana patch

`apps/grafana/base/helmrelease.yaml` gains, inside `values:`:

```yaml
additionalDataSources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090
    isDefault: true
  - name: Loki
    type: loki
    access: proxy
    url: http://loki.monitoring.svc.cluster.local:3100
dashboardProviders:
  dashboardproviders.yaml:
    apiVersion: 1
    providers:
      - { name: default, orgId: 1, folder: "", type: file,
          disableDeletion: false, editable: true,
          options: { path: /var/lib/grafana/dashboards/default } }
dashboards:
  default:
    k8s-cluster:       { gnetId: 315,   revision: 3,  datasource: Prometheus }
    node-exporter:     { gnetId: 1860,  revision: 37, datasource: Prometheus }
    kube-state:        { gnetId: 13332, revision: 12, datasource: Prometheus }
    ingress-nginx:     { gnetId: 9614,  revision: 1,  datasource: Prometheus }
    postgres-exporter: { gnetId: 9628,  revision: 7,  datasource: Prometheus }
    loki-logs:         { gnetId: 13639, revision: 2,  datasource: Loki }
```

Custom Royal Dispatch dashboard JSON lives at `apps/grafana/base/dashboards/royal-dispatch.json`, mounted via the chart's ConfigMap sidecar mechanism. Panels:

- Request rate and latency p50/p95 for `/brief`, `/story`, `/story/today`, `/user/*`
- LangGraph node duration p50/p95 by node
- External API call rate by provider and outcome
- Story generation duration histogram by type
- Postgres connections, CPU, memory
- Log volume by namespace (Loki `sum by (namespace) (rate({namespace=~".+"}[5m]))`)

### Alertmanager receiver (`apps/kube-prometheus-stack/base/alertmanager-config.yaml`)

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
          title: "{{ .CommonLabels.alertname }} — {{ .CommonLabels.severity }}"
          text: |-
            {{ range .Alerts }}• *{{ .Annotations.summary }}*
            {{ .Annotations.description }}
            {{ end }}
    - name: slack-critical
      slackConfigs:
        - apiURL: { name: alertmanager-slack, key: webhook-url }
          channel: "#alerts-critical"
          sendResolved: true
```

`Secret/alertmanager-slack` is created by an `ExternalSecret` reading `secret/observability/slack-webhook` from Vault.

### PrometheusRule — day-one alerts

| Alert | Expr (core) | for | severity |
|---|---|---|---|
| `KubeNodeNotReady` | `kube_node_status_condition{condition="Ready",status="true"} == 0` | 5m | critical |
| `KubePodCrashLooping` | `rate(kube_pod_container_status_restarts_total[5m]) > 0` | 15m | warning |
| `KubePodNotReady` | `kube_pod_status_ready{condition="false"} == 1` | 15m | warning |
| `NodeMemoryHigh` | `(1 - node_memory_MemAvailable_bytes/node_memory_MemTotal_bytes) > 0.9` | 10m | warning |
| `NodeDiskAlmostFull` | `node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1` | 10m | critical |
| `IngressNginx5xxRateHigh` | `sum(rate(nginx_ingress_controller_requests{status=~"5.."}[5m])) / sum(rate(nginx_ingress_controller_requests[5m])) > 0.05` | 5m | critical |
| `CertManagerCertExpiringSoon` | `(certmanager_certificate_expiration_timestamp_seconds - time()) < 14*24*3600` | 10m | warning |
| `PostgresDown` | `pg_up == 0` | 2m | critical |
| `BackendHighLatencyP95` | `histogram_quantile(0.95, sum by (le,handler) (rate(http_request_duration_seconds_bucket{handler="/story"}[5m]))) > 2` | 10m | warning |
| `BackendExternalApiErrors` | `sum(rate(royal_external_api_calls_total{outcome="error"}[10m])) > 0.1` | 10m | warning |

Every rule carries two annotations: `summary` (one-line human description) and `description` (multi-line context including relevant labels). This is deliberate: the future AI-agent remediation flow (see below) needs machine-parseable context and a human-readable handle.

### Backend instrumentation

Add to `backend/pyproject.toml`:

```toml
prometheus-fastapi-instrumentator = "^7.0.0"
prometheus-client = "^0.21.0"
```

`backend/main.py`:

```python
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator(
    should_group_status_codes=False,
    should_instrument_requests_inprogress=True,
    excluded_handlers=["/docs", "/openapi.json", "/healthz", "/metrics"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
```

New `backend/utils/metrics.py`:

```python
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
    labelnames=("provider", "outcome"),
)
story_generation_seconds = Histogram(
    "royal_story_generation_seconds",
    "End-to-end story generation time",
    labelnames=("story_type",),
    buckets=(1, 5, 10, 20, 30, 60, 120),
)
```

LangGraph nodes in `backend/graph.py` are wrapped in a decorator that records `langgraph_node_duration`. `external_api_calls.labels(...).inc()` calls are added in `backend/utils/elevenlabs.py`, `backend/utils/anthropic_client.py`, and wherever mem0's OpenAI embeddings fire.

Tests: `backend/tests/test_metrics.py` asserts `/metrics` returns 200 and exposes the custom metric names; a unit test of the decorator that exercises the histogram.

---

## Rollout plan

Nine PRs, each independently reviewable and revertible:

1. **ingress-nginx patch** — enable `controller.metrics.enabled=true` + `serviceMonitor.enabled=true`. No-op until Prometheus exists.
2. **kube-prometheus-stack** — HelmRelease + namespace + Alertmanager receiver + ExternalSecret. Verify CRDs installed, Prom UI reachable, Slack test alert fires.
3. **prometheus-postgres-exporter** — HelmRelease + migration for exporter DB user. Verify `pg_up == 1`.
4. **ServiceMonitors for backend, minio, qdrant, n8n** — plus `N8N_METRICS=true` env var. Verify all targets UP in Prometheus.
5. **Backend instrumentation PR** — `prometheus-fastapi-instrumentator` + custom metrics + tests. Redeploy via image automation.
6. **Loki** — HelmRelease + ExternalSecret + MinIO bucket Job. Verify `loki_build_info` and `/loki/api/v1/push` accepts a test POST.
7. **Alloy** — DaemonSet HelmRelease. Verify `{namespace="royal-dispatch"}` query in Loki returns lines.
8. **Grafana patch** — additionalDataSources + dashboards + Royal Dispatch custom JSON.
9. **PrometheusRule CRs** — day-one alerts. Verify with a temporary force-fire.

---

## Verification checklist

- `kubectl get crd | grep monitoring.coreos.com` — 10 CRDs present.
- `kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090` → `/targets` all UP.
- `curl localhost:8000/metrics | grep royal_` → custom metrics present; counters advance after a `/story` call.
- `logcli query '{namespace="royal-dispatch"}' --limit=5` (or Grafana Explore) → recent lines returned.
- Grafana data source health → green; Royal Dispatch dashboard renders non-empty.
- Force-fire `BackendHighLatencyP95` by temporarily setting threshold to `> 0` → Slack message arrives in `#alerts`.

---

## Future work (out of scope for this PR, informs design)

**AI-agent alert auto-remediation.** The day-one design deliberately positions us to layer an agent on top:

- Alertmanager webhook routes critical alerts to an agent endpoint (in addition to Slack).
- Agent receives structured alert payload (alertname, labels, annotations, starts-at, generator URL).
- Agent queries Prometheus for correlated metrics and Loki for same-time-window logs using the shared label schema (`namespace`, `pod`, `container`).
- Agent reads the relevant source files and opens a draft PR with a proposed fix (using the same GitHub integration patterns already in use for image automation).
- Slack thread updates with the PR link; human approves and merges.

What makes this possible from day one:
- Every alert has structured `summary` + `description` annotations (agent-readable).
- Prometheus and Loki share a label schema, so a pod-level alert has a one-query path to its logs.
- Flux already reconciles merged PRs to the cluster — no separate deploy flow needed.

Concrete follow-ups to enable this:
- Add a webhook receiver to the Alertmanager routing tree.
- Stand up the agent service (likely a new FastAPI endpoint or a separate repo).
- Define a GitHub App with scoped permissions (draft PRs only).

**Other deferred items:**
- Delete `clusters/rackspace/`, `apps/*/overlays/rackspace/`, `rackspace.yaml` entries (separate cleanup PR).
- Grafana chart upgrade from 7.x (old repo) to 12.x (grafana-community repo).
- Blackbox exporter for public endpoint probing (`quybits.com` cert + reachability).
- Remote-write to a longer-term metrics store if 15d retention proves insufficient.

---

## Open questions

None at time of writing. All decisions agreed:
- Loki retention: 30d
- Slack channels: `#alerts` and `#alerts-critical` hard-coded
- Royal Dispatch custom dashboard: shipped day one

# Observability stack reference

What every installed service/package does, why it's in the stack, and one concrete use case from our setup. Organized by data-flow layer: **metrics collection → log collection → storage → alerting → visualization → supporting infra**. If you're tracing a metric or log from source to dashboard, read top to bottom.

For the day-to-day "how do I open the UI / run this query" answer, see [`observability-runbook.md`](./observability-runbook.md). This doc answers "what is X for and why is it here."

---

## 1. Metrics collection

### 1.1 Prometheus (server)

**What it does:** A time-series database that pulls metrics from HTTP endpoints every 30 seconds, stores them with labels, and answers queries in its PromQL language.

**Role in our stack:** The central metrics database. Every metric you see in Grafana or an alert evaluation came from Prometheus.

**Use cases (general):**
- Recording and querying numeric time series (counters, gauges, histograms, summaries).
- Evaluating alert expressions on a recurring schedule.
- Driving SLO / SLI reporting.
- Cardinality inspection (`/api/v1/label/__name__/values`).

**Real use case here:** When the LangGraph pipeline slows down, Prometheus's histogram `royal_langgraph_node_duration_seconds_bucket` lets us compute `histogram_quantile(0.95, sum by (le, node) (rate(...[5m])))` and see which specific node (`generate_story`, `synthesize_voice`, …) is the hot path — without ever opening the backend code.

Chart: `kube-prometheus-stack 83.7.0`, installed in Phase 2. Namespace: `monitoring`. Pod: `prometheus-kube-prometheus-stack-prometheus-0`.

### 1.2 Prometheus Operator

**What it does:** A Kubernetes controller that turns CRs (`Prometheus`, `ServiceMonitor`, `PodMonitor`, `PrometheusRule`, `AlertmanagerConfig`) into live Prometheus and Alertmanager configuration. Watches for new CRs, rebuilds config, triggers reloads.

**Role in our stack:** Lets us add new scrape targets or alerts by committing a YAML file — no Prometheus restart, no editing a big `prometheus.yml`.

**Use cases (general):**
- Adding a new scrape job by dropping in a `ServiceMonitor` CR.
- Adding alerts by dropping in a `PrometheusRule`.
- Managing Alertmanager routing via `AlertmanagerConfig` CRs.
- Running multiple Prometheus instances with selector-based sharding.

**Real use case here:** When Phase 4 needed to scrape MinIO, Qdrant, and n8n, we shipped three `ServiceMonitor` CRs in `apps/kube-prometheus-stack-config/base/servicemonitors/`. The Operator picked them up on its reconcile loop and started scraping within ~30 seconds. No Prometheus pod rotation required.

### 1.3 node-exporter

**What it does:** A DaemonSet that exposes hardware- and OS-level metrics (CPU, memory, disk, network, filesystem, load) from each Linux node via `/metrics` on port 9100.

**Role in our stack:** Tells us what the underlying nodes are doing — RAM pressure, disk capacity, CPU saturation, network errors — below the Kubernetes layer.

**Use cases (general):**
- Node-level capacity monitoring.
- Feed for cluster-overview dashboards.
- Input to alerts like "node memory > 90%" or "root filesystem < 10% free".

**Real use case here:** The `NodeMemoryHigh` alert in `apps/kube-prometheus-stack-config/base/prometheusrules/infra.yaml` evaluates `(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) > 0.9` — that exact metric is what node-exporter on each k3s node exposes from `/proc/meminfo`.

### 1.4 kube-state-metrics

**What it does:** A Deployment that reads the Kubernetes API (pods, deployments, nodes, replicasets, PVCs, etc.) and converts each object's state into Prometheus metrics.

**Role in our stack:** Tells us what the Kubernetes control plane thinks is happening — "pod X is CrashLoopBackOff", "deployment Y has 2/3 replicas ready", "PVC Z is pending".

**Use cases (general):**
- Alerting on pod restart rates, deployment rollout health, PVC capacity.
- Building cluster-health dashboards.
- Feeding SLI calculations like "percentage of pods Ready over time".

**Real use case here:** The `KubePodCrashLooping` alert uses `rate(kube_pod_container_status_restarts_total[5m]) > 0` — kube-state-metrics is what produces `kube_pod_container_status_restarts_total` by observing the pod status field and incrementing when `RestartCount` advances.

### 1.5 prometheus-postgres-exporter

**What it does:** A sidecar-style service that connects to a PostgreSQL database as a read-only user and converts internal Postgres stats (`pg_stat_*`, `pg_locks`, `pg_settings`, replication state) into Prometheus metrics.

**Role in our stack:** Exposes `pg_up`, connection counts, transaction commit rates, replication lag, and table bloat stats for our Royal Dispatch Postgres.

**Use cases (general):**
- Alerting on database availability.
- Capacity planning (connection pool saturation, table growth).
- Detecting replication lag.
- Historical tracking of query load.

**Real use case here:** The `PostgresDown` alert fires on `pg_up == 0 for 2m`. `pg_up` is a synthetic metric the exporter produces: `1` if the SELECT-1 probe succeeds against the database, `0` if not. Our exporter connects as the dedicated low-privilege `postgres_exporter` role with only the built-in `pg_monitor` + `CONNECT` grants — zero write capability.

Chart: `prometheus-postgres-exporter 7.5.2`, installed in Phase 3.

### 1.6 prometheus-fastapi-instrumentator

**What it does:** A Python library that auto-instruments every route in a FastAPI app, recording request count, duration histogram, in-progress gauge, and request/response size on a `/metrics` endpoint. Zero per-route code.

**Role in our stack:** Turns our backend FastAPI into a Prometheus scrape target with free HTTP RED (Rate / Errors / Duration) metrics.

**Use cases (general):**
- Auto HTTP RED metrics for any FastAPI service.
- p95/p99 latency tracking per handler.
- Error rate tracking by status code.
- Excluding specific handlers (like `/docs`) from metric cardinality.

**Real use case here:** The `BackendHighLatencyP95` alert uses `http_request_duration_seconds_bucket{job="backend",handler="/story"}` — that `handler` label and the bucketed histogram both come from this library automatically. We didn't write the instrumentation; we wrote `Instrumentator().instrument(app).expose(app)` and got 10+ series per route.

Library: `prometheus-fastapi-instrumentator>=7.0.0`, added in Phase 5.

### 1.7 prometheus-client (Python)

**What it does:** The Python library that defines `Counter`, `Gauge`, `Histogram`, `Summary` primitives with labels. Registers them to a process-global registry that the `/metrics` endpoint reads.

**Role in our stack:** Lets us define domain-specific metrics on top of the HTTP auto-instrumentation. Anything business-shaped (story generation duration, LangGraph node timing, external API outcomes) goes here.

**Use cases (general):**
- Custom domain metrics: events / queue depth / backpressure / feature-flag usage.
- Wrapping external API calls to record success/failure/timeout outcomes.
- Producing histograms for end-to-end operations that span multiple components.

**Real use case here:** The three `royal_*` custom metrics in `backend/utils/metrics.py`:

- `royal_langgraph_node_duration_seconds` (Histogram with labels `node`, `story_type`) — records how long each LangGraph node takes. Wrapped via a `_time_node` decorator applied to every graph node.
- `royal_external_api_calls_total` (Counter with labels `provider`, `outcome`) — incremented in `try/except` blocks around each Anthropic / ElevenLabs / mem0 call.
- `royal_story_generation_seconds` (Histogram with `story_type`) — records end-to-end pipeline duration.

Library: `prometheus-client>=0.21.0`, added in Phase 5.

### 1.8 Ingress-nginx metrics endpoint (built-in)

**What it does:** The ingress-nginx controller has a built-in `/metrics` endpoint on port 10254 that exposes per-request counters, duration histograms, connection counts, and config-reload status — all labeled by host, ingress, path, method, status.

**Role in our stack:** The ingress is the cluster's edge. Its metrics are the ground truth for "what did the outside world try to do" — request rate, error rate, latency — broken down per ingress rule.

**Use cases (general):**
- SLI tracking per application entry point.
- Detecting cert-related TLS handshake failures.
- Alerting on 5xx rate regardless of which upstream is failing.

**Real use case here:** The `IngressNginx5xxRateHigh` alert fires when the ratio of 5xx responses exceeds 5% for 5 minutes. Data source: `nginx_ingress_controller_requests{status=~"5.."}` divided by `nginx_ingress_controller_requests` — both from the ingress-nginx `/metrics` endpoint.

Enabled via HelmRelease values in Phase 1 (`controller.metrics.enabled: true` + `serviceMonitor.enabled: true`).

### 1.9 n8n metrics endpoint (native, env-var-gated)

**What it does:** When `N8N_METRICS=true` is set, n8n exposes Prometheus metrics on the same HTTP port as the UI/API: workflow execution counts, queue depth, success/failure rates, webhook-invocation counts.

**Role in our stack:** Watches the automation layer. If n8n stops executing scheduled workflows or starts dropping webhooks silently, n8n metrics catch it before anyone notices via side-effects.

**Use cases (general):**
- Alerting when scheduled workflow counts drop to 0 unexpectedly.
- Tracking queue depth for slow workflows.
- Detecting webhook-auth failures.

**Real use case here:** `n8n_active_workflow_count` tells us how many workflows are currently defined; if it drops to 0 after a deploy, someone accidentally nuked the workflow list.

Enabled via HelmRelease values in Phase 4 (`main.extraEnv.N8N_METRICS: "true"`).

### 1.10 MinIO metrics endpoint (native)

**What it does:** MinIO exposes Prometheus-format metrics at `/minio/v2/metrics/cluster` on its main API port. Covers cluster capacity, bucket object counts, request rates, API error breakdowns.

**Role in our stack:** Our object storage is doing double duty: holding Loki's log chunks AND whatever else ends up in it. These metrics tell us if it's healthy, full, or getting hammered.

**Use cases (general):**
- Capacity alerting before buckets fill up.
- Detecting auth misconfiguration (rising 403s).
- Tracking bandwidth per bucket.

**Real use case here:** `minio_cluster_capacity_raw_total_bytes` — in verification we saw 17.5 GB raw capacity. If Loki chunks start consuming disproportionately, that number climbs; paired with `minio_cluster_usage_total_bytes`, it gives a clean fullness-ratio for alerting.

### 1.11 Qdrant metrics endpoint (native)

**What it does:** Qdrant exposes Prometheus metrics on `/metrics` covering collections count, points per collection, cluster state (commits, peer count, pending operations), and RAFT consensus health.

**Role in our stack:** Qdrant is our vector DB for mem0 memory search. Its metrics tell us whether the memory layer is functioning — collections existing, data present, cluster not in recovery mode.

**Use cases (general):**
- Alert on `qdrant_app_status_recovery_mode == 1`.
- Track `collections_total` to ensure schema migrations completed.
- Monitor `cluster_pending_operations_total` for stuck writes.

**Real use case here:** After a Qdrant upgrade, `collections_total` should remain ≥1 (we have our backend's memory collections). If it drops to 0, something restored the volume empty, and mem0 queries will silently return no context — backend story quality degrades without any error logs.

---

## 2. Log collection

### 2.1 Grafana Alloy

**What it does:** A DaemonSet agent (one pod per node) that tails container logs from `/var/log/pods/<ns>_<pod>_<uid>/<container>/*.log`, attaches Kubernetes discovery labels, and pushes them to Loki via HTTP. Configured via its own DSL called River.

**Role in our stack:** Log shipper. Every line any container writes to stdout/stderr reaches Loki through Alloy.

**Use cases (general):**
- Multi-tenant log forwarding to Loki.
- Filtering / relabeling logs at collection time to control cardinality.
- Transforming log lines (parsing JSON, adding labels from content).
- Collecting OTLP traces (not used in our stack yet).

**Real use case here:** When a backend request fails, the error appears in `/var/log/pods/royal-dispatch_backend-.../backend/0.log` within kubelet's native log rotation path. Alloy's pipeline (`discovery.kubernetes → discovery.relabel → local.file_match → loki.source.file → loki.write`) tails that file, attaches `namespace=royal-dispatch`, `pod=backend-...`, `container=backend`, `app=royal-dispatch`, `job=royal-dispatch/backend`, and pushes to Loki. A `{namespace="royal-dispatch", container="backend"}` LogQL query retrieves it within ~5 seconds of write.

Chart: `alloy 1.7.0`, installed in Phase 7.

### 2.2 Loki

**What it does:** A log database designed to work like Prometheus for logs: streams are identified by label sets (not full-text indexes), and queries use LogQL (intentionally similar to PromQL). Deployed in SingleBinary mode in our stack — one process, one PVC, chunks offloaded to S3 (MinIO).

**Role in our stack:** The log storage + query engine. Everything the cluster ever logged (up to the 30-day retention) lives here.

**Use cases (general):**
- Centralized log aggregation with cheap storage via S3 backend.
- Joining logs with metrics via shared labels (drill from an alert to the matching logs).
- Parsing structured (JSON) logs at query time for ad-hoc filtering.
- Full-text search within filtered streams.

**Real use case here:** The `BackendExternalApiErrors` alert's description tells the oncall to run `{namespace="royal-dispatch", pod=~"backend-.*"} |~ "(?i)anthropic"` to see which Anthropic calls were failing. That cross-reference works because Alloy tagged the logs with the same `namespace` and `pod` labels that Prometheus uses on its metrics — shared label schema, one query language family.

Chart: `loki 6.55.0`, installed in Phase 6.

---

## 3. Storage

### 3.1 MinIO (as Loki backend)

**What it does:** S3-compatible object storage. Loki writes chunked log data into three buckets (`loki-chunks`, `loki-ruler`, `loki-admin`), using a dedicated low-privilege MinIO user.

**Role in our stack:** Makes Loki's storage cost-per-GB flat and removes the need to provision a large PVC for the Loki pod. The single-node Loki can keep 30 days of logs with a 10 GB local PVC because the chunks go to MinIO.

**Use cases (general):**
- Backing store for any S3-compatible consumer (Loki, Mimir, Thanos, Tempo).
- Local development replacement for AWS S3 / GCS.
- Hosting container image artifacts, bucket-level metrics, backup snapshots.

**Real use case here:** Every time Loki's ingester flushes a chunk, it writes via `mc`-compatible S3 API to `minio.minio.svc.cluster.local:9000/loki-chunks/<prefix>/<chunk>`. MinIO's own metrics (§1.10) let us see the growth of those buckets over time.

### 3.2 local-path PVCs (Prometheus, Loki, Grafana)

**What it does:** k3s's built-in storage class that creates a `hostPath`-like PVC on whichever node the pod runs on. No networking, no replication.

**Role in our stack:** Fast local storage for stateful monitoring pods that don't need replication: Prometheus WAL (20 GB), Loki's local bolt-db shards (10 GB), Grafana's SQLite DB (5 GB).

**Use cases (general):**
- Single-node k3s persistence when network-attached storage is overkill.
- Dev / home-lab clusters where the storage volume won't survive a node rebuild anyway.

**Real use case here:** When we re-created Loki in Phase 6, the `loki-0` pod came up on a specific node and the local-path provisioner created a PVC on that node's disk. If that node dies, Loki loses its local index but NOT its historical chunks (those are safely in MinIO).

---

## 4. Alerting

### 4.1 Alertmanager

**What it does:** A service that receives alerts from Prometheus, groups them by labels, deduplicates, applies inhibition rules, and routes to receivers (Slack, PagerDuty, email, webhook) based on a configurable route tree.

**Role in our stack:** Turns Prometheus rule evaluations into Slack messages. Handles deduplication so a network blip doesn't flood `#alerts-critical` with 40 identical messages.

**Use cases (general):**
- Routing different severities to different channels / on-call rotations.
- Silencing alerts during maintenance windows.
- Grouping related alerts into a single notification.
- Integrating with webhook-based remediation systems.

**Real use case here:** When `PostgresDown` fires, Alertmanager groups it (by `alertname` + `namespace`), waits 30 seconds for potentially-related alerts (`BackendHighLatencyP95` which would fire ~10 minutes later as a consequence), then posts to `#alerts-critical` via the `slack-critical` webhook. If a human doesn't acknowledge it, the `repeatInterval: 4h` re-notifies.

### 4.2 AlertmanagerConfig CR (vs Helm-values alerting)

**What it does:** A Custom Resource the Prometheus Operator watches. Defines routes, matchers, and receivers. The Operator merges matching AlertmanagerConfig CRs into Alertmanager's runtime config.

**Role in our stack:** Keeps our alerting routes / Slack wiring / null-receiver for Watchdog in a CR that's managed separately from the Helm chart. Bumping the chart doesn't require re-drafting our routes.

**Use cases (general):**
- Per-team routing configuration in a multi-tenant cluster.
- Versioned alerting configuration in git.
- Decoupling alert routing from Helm chart lifecycle.

**Real use case here:** `apps/kube-prometheus-stack-config/base/alertmanager-config.yaml` — defines three routes in priority order:

1. `alertname=Watchdog` → `"null"` receiver (drops silently; we have no external dead-man's-switch wired yet).
2. `severity=critical` → `slack-critical` receiver → `#alerts-critical` webhook URL.
3. Anything else → `slack-default` receiver → `#alerts` webhook URL.

### 4.3 PrometheusRule CRs

**What it does:** A Custom Resource containing groups of alert rules or recording rules. The Operator watches for them, generates a rules file, and signals Prometheus to reload.

**Role in our stack:** Holds our 10 day-one alerts split across three files (`infra.yaml`, `ingress.yaml`, `app.yaml`). Each rule has structured `summary` / `description` annotations naming likely source files and diagnostic commands.

**Use cases (general):**
- Versioned alerting rules in git.
- Grouping related rules that should evaluate together for consistency.
- Recording rules that pre-compute expensive aggregations.

**Real use case here:** When `BackendExternalApiErrors` fires, the rule's annotation says:

```
royal_external_api_calls_total{provider="{{ $labels.provider }}",outcome="error"} is
elevated. Likely source file: backend/services/elevenlabs_convai.py or the LangChain
wrapper in backend/nodes/generate_story.py (for provider="anthropic"), or
backend/utils/mem0_client.py (for provider="mem0"). Cross-reference logs:
{namespace="royal-dispatch", pod=~"backend-.*"} |~ "(?i){{ $labels.provider }}".
```

The `{{ $labels.provider }}` templating resolves to `anthropic`, `elevenlabs`, or `mem0` at fire time — structured so an eventual AI-agent remediation loop can parse the description into source-file breadcrumbs and correlation queries without extra indirection.

### 4.4 Slack Incoming Webhooks (two)

**What it does:** Two Slack app webhooks, each bound to a specific channel. One to `#alerts` (default severity), one to `#alerts-critical` (severity=critical).

**Role in our stack:** The actual notification delivery from Alertmanager to our eyeballs.

**Use cases (general):**
- Per-channel routing for different urgency tiers.
- Different on-call teams subscribing to different channels.
- Integration points for other tools that post to the same channels.

**Real use case here:** We learned during Phase 2 verification that Slack Incoming Webhooks are **per-channel bound** — the `channel:` override in the Alertmanager payload is ignored by modern Slack. So we maintain two webhooks, stored as two keys (`default` / `critical`) in Vault at `secret/observability/slack-webhook`, synced into the `alertmanager-slack` K8s Secret via ExternalSecret.

---

## 5. Visualization

### 5.1 Grafana

**What it does:** A web UI for querying metrics (Prometheus), logs (Loki), and traces (not used here), rendering them as dashboards, and managing users / teams / alerts.

**Role in our stack:** The primary human-facing tool. Everybody's first stop when something looks off — open the Royal Dispatch dashboard, open Loki Explore, search.

**Use cases (general):**
- Dashboards (templated with variables for multi-cluster / multi-tenant).
- Ad-hoc exploration (Explore view).
- Alerting UI (we use Alertmanager for delivery, but Grafana's alerting rules view is convenient for triage).
- SSO-gated access to observability data.

**Real use case here:** The Royal Dispatch dashboard has 6 panels: backend request rate, p95 latency by handler, LangGraph node p95 by node, external API call outcomes by provider, story generation p95 by story type, royal-dispatch error-log panel. All 6 panels come from the same Prometheus + Loki data sources Grafana was configured with in Phase 8.

Chart: `grafana 7.3.12`, already installed pre-rollout; reconfigured in Phase 8.

### 5.2 Grafana k8s-sidecar (kiwigrid)

**What it does:** A container that runs alongside Grafana, watches the Kubernetes API for ConfigMaps with a specific label (`grafana_dashboard` in our config), and copies their content into Grafana's dashboard directory so Grafana auto-loads them.

**Role in our stack:** Makes dashboards declarable as Kubernetes resources. We drop a dashboard JSON into a kustomize `configMapGenerator`, label the resulting ConfigMap `grafana_dashboard=1`, and the sidecar does the rest.

**Use cases (general):**
- GitOps-managed dashboard provisioning.
- Sharing dashboards across multiple Grafana instances via labeled ConfigMaps.
- Hot-reloading dashboard updates without a Grafana pod restart.

**Real use case here:** `apps/grafana/base/dashboards/royal-dispatch.json` → kustomize generates ConfigMap `grafana-royal-dispatch-dashboard` in `grafana` namespace, labeled `grafana_dashboard: "1"` → sidecar sees the label, writes the JSON to `/tmp/dashboards/royal-dispatch.json` → Grafana's `sidecarProvider` (auto-configured when sidecar is enabled) picks it up and registers it. Editing the JSON in git triggers a new ConfigMap version, sidecar reloads it, Grafana renders the new version. No pod restart.

### 5.3 Community dashboards (gnetId)

**What it does:** Pre-built dashboard JSON hosted at grafana.com, fetched by an init container in the Grafana Pod at install time using `gnetId` (a numeric ID on grafana.com).

**Role in our stack:** Starting point for standard views — Kubernetes cluster, node health, Postgres — without the cost of authoring dashboards from scratch.

**Use cases (general):**
- Quickly getting professional-quality dashboards for well-known systems.
- Paying a one-time cost (read the JSON, understand what queries it depends on) in exchange for amortized maintenance.
- Templates to copy-and-modify for your own dashboards.

**Real use case here:** We ship six community dashboards:

| gnetId | What | Data source |
|---|---|---|
| 315 | Kubernetes cluster overview | Prometheus |
| 1860 | node-exporter full | Prometheus |
| 13332 | kube-state-metrics v2 | Prometheus |
| 9614 | NGINX Ingress controller | Prometheus |
| 9628 | PostgreSQL Database | Prometheus |
| 13639 | Logs / App | Loki |

Each one is fetched by the Grafana chart's init container from `https://grafana.com/api/dashboards/<gnetId>/revisions/<rev>/download` at install time and mounted at `/var/lib/grafana/dashboards/default/`. Grafana's `default` provider loads them. Revision pinning (in our Helm values) ensures reproducibility.

---

## 6. Supporting infrastructure (pre-existing, referenced)

### 6.1 Flux CD v2

**What it does:** A GitOps controller suite that watches git repositories and reconciles their contents into the cluster. Subcomponents: `source-controller` (git polling), `kustomize-controller` (apply Kustomize overlays), `helm-controller` (run `helm upgrade`), `image-automation-controller` (write new image tags back to git), `notification-controller` (webhook routing).

**Role in our stack:** Every resource in `gitops-rackspace` reaches the cluster through Flux. Nothing is `kubectl apply`ed manually.

**Use cases (general):**
- Multi-environment GitOps with base/overlay patterns.
- Pull-based deployment (cluster reaches out to git, not vice versa).
- Automatic image updates on new tags with git audit trail.
- Dependency-ordered deployments across unrelated components.

**Real use case here:** Every merge to `gitops-rackspace/main` triggers this chain: `source-controller` fetches the commit → `kustomize-controller` renders overlays and applies changed resources → individual Kustomization state transitions to `Ready` when health checks pass → `dependsOn` chains unblock. Our `alloy` Kustomization won't reconcile until `loki` and `kube-prometheus-stack` are Ready, because both of those are in its `dependsOn` list.

### 6.2 ExternalSecrets Operator

**What it does:** A Kubernetes controller that reads secrets from external secret managers (Vault, AWS Secrets Manager, Azure Key Vault) and materializes them into native `Secret` resources inside the cluster.

**Role in our stack:** Bridges Vault-stored secrets into K8s. Credentials for Slack webhooks, MinIO-Loki user, Postgres-exporter user — all live in Vault; ExternalSecret CRs pull them in.

**Use cases (general):**
- Secrets that must not be in git (even encrypted with SOPS).
- Multi-cluster secret distribution from a single source.
- Rotation: update Vault, ESO resyncs on next refresh interval.

**Real use case here:** `apps/kube-prometheus-stack/base/externalsecret-alertmanager.yaml` — pulls two keys (`default`, `critical`) from Vault at `secret/observability/slack-webhook` into a K8s Secret named `alertmanager-slack`. Alertmanager's `slackConfigs.apiURL.name/key` references that Secret. Our git repo never sees the webhook URLs.

### 6.3 HashiCorp Vault

**What it does:** A secrets manager. Stores secrets in a KV store (among other engines), authenticates clients, enforces policies on what each client can read/write.

**Role in our stack:** The upstream store for every cluster-consumed secret. ExternalSecrets Operator authenticates to it and pulls values.

**Use cases (general):**
- Central source of truth for secrets across tools, services, environments.
- Automatic secret rotation for supported engines (database credentials, AWS IAM).
- Auditable access control.
- Transit encryption (encryption-as-a-service).

**Real use case here:** Secrets stored for this rollout:

| Vault path | Content | Consumer |
|---|---|---|
| `secret/observability/slack-webhook` | keys `default`, `critical` | Alertmanager → Slack (Phase 2) |
| `secret/postgres/exporter-password` | key `password` | prometheus-postgres-exporter (Phase 3) |
| `secret/observability/loki-s3` | keys `access-key`, `secret-key` | Loki → MinIO S3 backend (Phase 6) |

Generated client-side with `openssl rand`, written to Vault with `vault kv put`, consumed by ExternalSecrets — never typed into git, never shown in shell history if `unset` is used.

### 6.4 cert-manager (not yet scraped)

**What it does:** Automates TLS certificate issuance and renewal via ACME (Let's Encrypt) or other issuers. Creates, renews, and rotates Kubernetes `Secret`s containing certs.

**Role in our stack:** Provides TLS for our ingress-exposed services (`grafana-home.quybits.com`, etc.). Metrics endpoint exists but **not yet scraped** — we shipped the `CertManagerCertExpiringSoon` alert in Phase 9 as a future hook, but it stays inert until we add a cert-manager ServiceMonitor.

**Use cases (general):**
- Automatic TLS for every Ingress (via annotations or auto-configuration).
- Renewal 14 days before expiry.
- Multi-issuer setups (Let's Encrypt staging for dev, production for prod).

**Real use case here:** When our ingress gets a new hostname, cert-manager automatically issues a cert via Let's Encrypt HTTP-01 challenge (we have `cm-acme-http-solver` pods visible in several namespaces — those are the ephemeral solver pods cert-manager spins up during ACME challenges). Our wildcard / per-host certs for `*.quybits.com` are all managed by it.

---

## 7. How the layers connect: one concrete trace

To tie it all together, here's what happens for a single backend request that generates an alert:

1. **Request happens**: `POST /story` hits `grafana-home.quybits.com` (or the API ingress).
2. **ingress-nginx** records the request in its own `/metrics` → `nginx_ingress_controller_requests{status="500",...}` increments.
3. **Backend** processes the request. `prometheus-fastapi-instrumentator` records `http_requests_total{job="backend",handler="/story",status="5xx"}`, `http_request_duration_seconds_bucket{...}`. If an external API call inside the handler fails, the `try/except` in `backend/utils/metrics.py` increments `royal_external_api_calls_total{provider="anthropic",outcome="error"}`.
4. **Backend logs** the error to stdout. Kubelet writes it to `/var/log/pods/royal-dispatch_backend-<uid>/backend/0.log`.
5. **Alloy** on the node tails that file, attaches labels, pushes to Loki at `loki.monitoring.svc.cluster.local:3100/loki/api/v1/push`.
6. **Loki** chunks the data, writes to `minio.minio.svc.cluster.local:9000/loki-chunks/...`.
7. **Prometheus** scrapes the backend's `/metrics` every 30s, stores the new values.
8. **Prometheus** evaluates rules every 30s. After 10 minutes of elevated `rate(royal_external_api_calls_total{outcome="error"}[10m]) > 0.1`, `BackendExternalApiErrors` moves from `pending` → `firing`.
9. **Prometheus** pushes firing alerts to Alertmanager.
10. **Alertmanager** groups by `alertname` + `namespace`, checks its route tree (AlertmanagerConfig CR), routes to `slack-default` (because `severity=warning`), posts to `#alerts` via the webhook URL from the `alertmanager-slack` Secret (which ExternalSecrets Operator synced from Vault).
11. **Human** opens Slack, reads the alert, clicks into Grafana (via data sources provisioned in Phase 8), opens the Royal Dispatch dashboard, and within 30 seconds can correlate:
    - Which provider is failing (`royal_external_api_calls_total{provider=...,outcome="error"}` panel).
    - The timing against LangGraph node latency and story generation p95.
    - The matching log lines in Loki's error-log panel (`{namespace="royal-dispatch"} |~ "(?i)error|exception|traceback"`).

Every component in this document has a role in that sequence. If one breaks, the chain breaks somewhere predictable — usually visible in Prometheus's `/targets`, Alertmanager's `/api/v2/alerts`, or Alloy's own metrics.

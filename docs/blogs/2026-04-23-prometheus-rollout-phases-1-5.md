# Prometheus rollout on homelander: what landed, what broke, what stuck

A follow-up to [Observability and the Alert That Fixes Itself](./2026-04-22-observability-and-the-alert-that-fixes-itself.md). The earlier post was the design spec — what I planned to build and why. This one is the implementation log: five phases merged in a single session, six follow-up PRs to fix defects that only surfaced at apply time, and every command I typed along the way. I expected the plan to survive first contact with the cluster. It mostly did. The "mostly" is where the interesting stuff happened.

The cluster is `homelander`, a single-node k3s home lab. The Royal Dispatch is a personal learning project — a FastAPI + LangGraph bedtime-story service with a Next.js frontend. Nothing production-critical runs here, and the security posture reflects that: sensible defaults, skip the expensive ceremony, name the tradeoffs out loud so I don't forget them.

## Technology stack and security posture

| Component | Version | Job | Tradeoff I chose |
|---|---|---|---|
| kube-prometheus-stack | 83.7.0 | Prometheus + Alertmanager + Operator + node-exporter + kube-state-metrics | The chart-shipped `Watchdog` alert routes to a `null` receiver because I don't have an external dead-man's-switch yet. It fires forever but goes nowhere — visible on the Alertmanager UI, invisible in Slack. |
| Prometheus Operator CRDs | 83.7.0 | `ServiceMonitor`, `PrometheusRule`, `AlertmanagerConfig` | Alerting config lives in an `AlertmanagerConfig` CR, not in Helm values. Decouples the config from the chart lifecycle; costs a two-Kustomization split and a `dependsOn`. Worth it for me — I'd rather bump alerts than bump the chart. |
| Flux CD v2 | existing | GitOps + image automation | Image automation commits new tags back to the gitops repo without human review of the tag. ImagePolicy selects monotonic timestamps, but anyone with write on the gitops repo could redirect the cluster. Fine for a single-author project. |
| ExternalSecrets + Vault | existing | Deliver secrets to the cluster | Secrets never touch git. Webhooks, DB passwords, S3 creds all materialize into K8s `Secret`s via `ExternalSecret` CRs at reconcile time. |
| prometheus-postgres-exporter | 7.5.2 | Scrape Postgres internals | Runs as a dedicated `postgres_exporter` role granted only `pg_monitor` + `CONNECT`. Password generated client-side, written straight to Vault, never typed into git or a CI log. |
| prometheus-fastapi-instrumentator | 7.x | Auto-instrument FastAPI with RED metrics | `/metrics` exposed on the same port as the app (8000), reachable only in-cluster via the `backend` Service. A separate listener would cost YAML and a port for marginal gain on a single-tenant cluster. |
| prometheus-client | 0.21.x | Custom counters/histograms | Three series for the parts I actually care about: external API outcomes, LangGraph node latency, end-to-end story generation time. |

Places I picked simple over paranoid:

- **MinIO metrics (`/minio/v2/metrics/cluster`) are unauthenticated.** Production would require `MINIO_PROMETHEUS_AUTH_TYPE=jwt` and a `bearerTokenSecret` on the ServiceMonitor. In a cluster I run alone, anything that can hit that endpoint already has in-cluster network access — the cost-of-config vs cost-of-breach math just doesn't favour JWT here.
- **`/metrics` rides on the app port.** A compromised in-cluster attacker can scrape it. So can anything else with network access to the `backend` Service. Again: the attack surface is the cluster boundary either way, and splitting listeners costs more than it buys.
- **Flux image automation commits directly to main.** I wanted the "merge → rebuilt → running" loop to stay short. If I regret this later I can insert a human-in-the-loop stage, but for now the feedback loop is the point.

## Phase 1 — ingress-nginx metrics

I wanted my first scrape target to be something boring and already-present, so I could validate the approach before committing to the full stack. The ingress-nginx controller fit — it already has a metrics endpoint, and the chart can emit a `ServiceMonitor` for me.

The change was one `values:` patch in `infrastructure/ingress-nginx/helmrelease.yaml`:

```yaml
values:
  controller:
    metrics:
      enabled: true
      serviceMonitor:
        enabled: true
        namespace: monitoring
        # Required: kube-prometheus-stack's Prometheus serviceMonitorSelector
        # matches on release=kube-prometheus-stack, so ServiceMonitors without
        # this label are ignored by the Operator.
        additionalLabels:
          release: kube-prometheus-stack
```

### What I didn't see in the diff

Code review flagged it before I pushed: `serviceMonitor.enabled: true` tells the chart to render a `ServiceMonitor` resource — and `ServiceMonitor` is a CRD that doesn't exist until **Phase 2** installs `kube-prometheus-stack`. Applying Phase 1 first would put the HelmRelease into `Helm install failed: no matches for kind "ServiceMonitor"` and drag down every dependent Kustomization with it.

What surprised me about this isn't the bug itself — bootstrap ordering is a known-hard thing. What surprised me is that the bug was completely invisible in a file-level diff. Every line of the patch was correct *when read against the final state of the cluster*. The file couldn't tell you that the final state didn't exist yet.

**Fix**: swap the order. Phase 2 runs first, installs the CRDs, and Phase 1 rides on top.

That became my first new habit for this rollout: when reviewing a PR, mentally ask "what does the cluster look like the moment this applies?" — not "what does the cluster look like after everything is done?"

## Phase 2 — kube-prometheus-stack 83.7.0

The big one. Prometheus, Alertmanager, Operator, node-exporter, kube-state-metrics, and a Slack-routing `AlertmanagerConfig`. Grafana from the chart is disabled — the cluster already runs its own Grafana HelmRelease; this PR just provides the data source.

The decision I agonized over was alerting config. The chart lets you jam it into `values.alertmanager.config` — one file, no extra reconcile hops. The other option is an `AlertmanagerConfig` CR, which lives in its own Kustomization and gets discovered by the Operator via label selector. I went with the CR because I want alerts to be cheap to change. Bumping the chart should not require me to also redraft my routes; conversely, adding a new receiver shouldn't drag a chart reconcile with it. It's the right call for me specifically — someone running one alert rule on a single cluster should absolutely pick Helm values and move on.

### Problem 1: I expected dry-run to be forgiving. It isn't.

First reconcile attempt after merge:

```
$ flux get kustomization kube-prometheus-stack
NAME                   REVISION  READY  MESSAGE
kube-prometheus-stack  <empty>   False  AlertmanagerConfig/monitoring/royal-dispatch dry-run failed:
                                        no matches for kind "AlertmanagerConfig" in version
                                        "monitoring.coreos.com/v1alpha1"
```

Zero progress. Not the Namespace, not the HelmRepository, not the HelmRelease. I assumed Flux would skip the resources it couldn't evaluate and apply the rest, figuring the HelmRelease would install the CRDs and a later retry would pick up the `AlertmanagerConfig`. That's not how the Kustomization controller works — it dry-runs the whole batch first and either applies all of it or none of it. Which, thinking about it, is exactly the behaviour you'd want for rollback and idempotency. I just hadn't thought about it.

**Fix** (PR [#4](https://github.com/RobDoan/gitops-rackspace/pull/4)): split the `AlertmanagerConfig` into its own Flux Kustomization at `apps/kube-prometheus-stack-config/` with `dependsOn: [kube-prometheus-stack]`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: kube-prometheus-stack-config
spec:
  path: ./apps/kube-prometheus-stack-config/overlays/homelander
  dependsOn:
    - name: kube-prometheus-stack   # CRDs installed here
  healthChecks:
    - apiVersion: monitoring.coreos.com/v1alpha1
      kind: AlertmanagerConfig
      name: royal-dispatch
```

The stack Kustomization installs the CRDs, then the config Kustomization passes dry-run and applies. I kept the same split pattern for every later CR — ServiceMonitors, PrometheusRules, anything referencing `monitoring.coreos.com/*` — all live in `kube-prometheus-stack-config`. Phase 4 saved me a round trip by already knowing this.

### Problem 2: Slack told me the docs were lying, politely

First version of the `AlertmanagerConfig` had both receivers pointing at the same webhook URL from Vault. The `channel:` field would do the routing:

```yaml
- name: slack-critical
  slackConfigs:
    - apiURL: { name: alertmanager-slack, key: webhook-url }
      channel: "#alerts-critical"
```

My mental model was: the webhook posts to Slack, and the `channel:` field in the payload tells Slack where. The Alertmanager Slack config docs document `channel:`, so obviously it works.

It does not, for modern Incoming Webhooks. Each webhook is bound to the channel it was created for, and the `channel:` override in the payload is ignored. I only learned that after staring at the `#alerts-critical` channel, watching a test alert arrive in `#alerts` instead, and reading three-year-old Slack API threads.

**Fix**: create two webhooks, one per channel. Two keys in Vault:

```bash
vault kv put secret/observability/slack-webhook \
  default="https://hooks.slack.com/services/<T>/<B>/<X>" \
  critical="https://hooks.slack.com/services/<T>/<B>/<Y>"
```

`ExternalSecret` pulls both into the `alertmanager-slack` K8s Secret; each receiver references its own key. The `channel:` field in the Alertmanager config now serves only documentation — Slack ignores it regardless.

### Problem 3: Watchdog is the loudest quiet alert

kube-prometheus-stack ships a `Watchdog` PrometheusRule that always fires — `expr: vector(1)`. The point is for an **external** monitor to watch for the alert's absence, so you get paged when Prometheus itself dies. Without that external hop, it's just a heartbeat to an internal Slack channel every four hours.

I initially thought `Watchdog` was opt-in or disabled by default. It isn't. First test alert day, I watched three `Watchdog` messages land in `#alerts` over the next twelve hours and realized the quiet part was what the alert name meant, not the alert itself.

Verified the routing was the cause:

```bash
kubectl -n monitoring exec alertmanager-kube-prometheus-stack-alertmanager-0 \
  -c alertmanager -- wget -qO- http://localhost:9093/api/v2/alerts | \
  jq -c '.[] | select(.labels.alertname=="Watchdog") | {state, receivers: [.receivers[].name]}'
# {"state":"active","receivers":["monitoring/royal-dispatch/slack-default","null"]}
```

**Fix** (PR [#5](https://github.com/RobDoan/gitops-rackspace/pull/5)): add a top-priority route matching `alertname=Watchdog` to a `null` receiver. The route goes **above** the `severity=critical` matcher so it catches first:

```yaml
routes:
  - receiver: "null"
    matchers: [{ name: alertname, value: Watchdog }]
  - receiver: slack-critical
    matchers: [{ name: severity, value: critical }]
receivers:
  - name: "null"   # no configs; Alertmanager drops silently
  - name: slack-default
    slackConfigs: [...]
  - name: slack-critical
    slackConfigs: [...]
```

After re-querying:

```
# {"state":"active","receivers":["monitoring/royal-dispatch/null","null"]}
```

When I wire up Dead Man's Snitch or healthchecks.io later, that `null` route's target becomes a `webhookConfig` pointing at the external endpoint — no other changes needed.

### Verification

```bash
kubectl get crd | grep monitoring.coreos.com | wc -l           # 10
kubectl -n monitoring get pods                                  # all Running
kubectl -n monitoring get secret alertmanager-slack              # 2 keys
kubectl -n monitoring get alertmanagerconfig royal-dispatch      # Ready
```

Then the end-to-end firing test: two temporary `PrometheusRule`s that always fire, one at severity=warning (→ `#alerts`), one at severity=critical (→ `#alerts-critical`). Both channels received their messages within 60 seconds. Deleted the rule, moved on.

## Phase 3 — prometheus-postgres-exporter 7.5.2

I wanted the exporter to run as a non-root DB user with zero write privileges. The plan I sketched was: put `CREATE USER postgres_exporter ...` in a `golang-migrate` migration so it bootstraps automatically on next backend deploy, set the real password out-of-band via Vault + `ALTER USER` in a follow-up step. Clean, automated, GitOps-native. What could go wrong.

First attempt, `backend/db/migrations/007_postgres_exporter_user.up.sql`:

```sql
CREATE USER postgres_exporter WITH LOGIN PASSWORD 'replaced_after_bootstrap';
GRANT pg_monitor TO postgres_exporter;
GRANT CONNECT ON DATABASE royal_dispatch TO postgres_exporter;
```

### Problem 1: The backend went into CrashLoopBackOff

```bash
$ kubectl -n royal-dispatch logs backend-74449cff96-2rv7b -c migrate
error: Dirty database version 7. Fix and force version.
```

Checked the role `golang-migrate` connects as:

```bash
$ kubectl -n postgres exec postgres-postgresql-0 -- env PGPASSWORD="$PGPW" \
    psql -U postgres -c "\du royal"
 Role name | Attributes
-----------+------------
 royal     | Create DB
```

Only `Create DB`. No `CREATEROLE`, no `SUPERUSER`. `CREATE USER postgres_exporter` hit permission denied on the very first statement, `golang-migrate` marked `schema_migrations` as `version=7, dirty=true`, and every subsequent run failed on the dirty guard before even trying to execute anything.

In retrospect this is exactly the principle of least privilege working as designed. The app role connects with the smallest set of privileges it needs to do its job. Adding new roles is not part of the job — it's operator-space work. The migration had no business doing role DDL in the first place.

What I didn't expect was how quickly the `dirty=true` flag would lock me out of recovering. I thought I could just fix the SQL and re-push. But `golang-migrate` refuses to do anything while dirty, including applying a replacement migration. The state machine is "dirty, fix manually, then force version clean" — there's no in-band escape hatch.

**Fix** (PR [#8](https://github.com/RobDoan/The-Royal-Dispatch/pull/8)): delete migration 007 entirely. Move the `CREATE USER` + `GRANT` statements into the same `kubectl exec ... psql -U postgres` block that already sets the password. One consolidated superuser-only step, run once per environment:

```bash
EXPORTER_PASS=$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-32)
vault kv put secret/postgres/exporter-password password="$EXPORTER_PASS"

POSTGRES_PW=$(kubectl -n postgres get secret postgres-secrets \
  -o jsonpath='{.data.postgres-password}' | base64 -d)

kubectl -n postgres exec -i postgres-postgresql-0 -- \
  env PGPASSWORD="$POSTGRES_PW" psql -U postgres -d royal_dispatch <<SQL
CREATE USER postgres_exporter WITH LOGIN PASSWORD '$EXPORTER_PASS';
GRANT pg_monitor TO postgres_exporter;
GRANT CONNECT ON DATABASE royal_dispatch TO postgres_exporter;
SQL
```

### Problem 2: Reverting the migration didn't unstick the DB

Deleting the migration file from `main` wasn't enough. `golang-migrate` reads its state from the DB, not from the filesystem, and the DB still said `version=7, dirty=true`. A backend image without migration 007 still crashed on startup:

```
error: Dirty database version 6. Fix and force version.
```

(`version=6` by then, because I'd already tried a partial `migrate force` that moved the version but didn't flip `dirty`.)

The actual recovery was a one-line `UPDATE` as postgres superuser:

```sql
UPDATE schema_migrations SET version = 6, dirty = false;
```

Next pod's `migrate` init saw `v6 clean`, looked for any migration greater than 6 in the (now-cleaned) image, found none, no-op'd, and the backend came up:

```bash
$ kubectl -n postgres exec postgres-postgresql-0 -- env PGPASSWORD="$PGPW" \
    psql -U postgres -d royal_dispatch -c "SELECT version, dirty FROM schema_migrations;"
 version | dirty
---------+-------
       6 | f

$ kubectl -n royal-dispatch logs deploy/backend -c migrate --tail=5
no change
```

I learned two things from this. First: `schema_migrations` is a small two-column table, but it's the *only* source of truth for what the DB thinks has been applied. When it disagrees with reality, you have to fix it by hand — there is no automatic reconciliation. Second: when I eventually need to run a migration that genuinely does touch system state (adding an extension, say), the same "application role doesn't have the privilege" problem will come back. The fix for that is a separate Postgres role just for bootstrap DDL, run one-shot — not the migrator role, not the app role.

### Problem 3: YAML integer vs Go float64 vs Helm template

After the user + Vault + password were sorted, the HelmRelease still failed to install:

```
prometheus-postgres-exporter/templates/_helpers.tpl:78:86 executing
"prometheus-postgres-exporter.data_source_uri" at
<.Values.config.datasource.port>:
wrong type for value; expected string; got float64
```

The chart's DSN helper does `printf "%s"` on the port value. YAML parses `port: 5432` as an integer, which arrives at the Go template as `float64` (YAML has no native int type in Helm's parser), and the helper rejects it.

One character fix: `port: "5432"`. PR [#8](https://github.com/RobDoan/gitops-rackspace/pull/8) in gitops-rackspace.

Not a deep lesson, but a reminder that YAML's type coercion is one of those things I never think about until it bites me.

### Verification

```bash
$ flux get helmrelease -n postgres prometheus-postgres-exporter
NAME                          REVISION  READY  MESSAGE
prometheus-postgres-exporter  7.5.2     True   Helm install succeeded

$ kubectl -n monitoring exec prometheus-kube-prometheus-stack-prometheus-0 -c prometheus -- \
    wget -qO- 'http://localhost:9090/api/v1/query?query=pg_up' | jq '.data.result[0].value[1]'
"1"
```

## Phase 4 — ServiceMonitors for MinIO, Qdrant, n8n

Goal: scrape the three remaining homelab app services. Each exposes Prometheus-compatible metrics natively — MinIO on `/minio/v2/metrics/cluster`, Qdrant on `/metrics`, n8n on `/metrics` once `N8N_METRICS=true`. Three `ServiceMonitor` CRs and an env-var flip on the n8n HelmRelease.

The only non-trivial decision was where to put them. Phase 2 had already established the rule — custom resources that reference `monitoring.coreos.com/*` CRDs live in `apps/kube-prometheus-stack-config/`, not `apps/kube-prometheus-stack/`. This was the first phase where I got to apply that rule prospectively instead of reactively. Felt good.

### Problem 1: The selector I wrote wasn't the selector the chart needed

I drafted the MinIO ServiceMonitor with `app.kubernetes.io/name: minio` because that's the standard Kubernetes recommended label. Scrape target went DOWN immediately:

```bash
$ kubectl -n monitoring exec prometheus-... -c prometheus -- \
    wget -qO- 'http://localhost:9090/api/v1/targets' | \
    jq -c '.data.activeTargets[] | select(.labels.namespace=="minio")'
{"service":"minio","health":"up"}
{"service":"minio-console","health":"down",
 "err":"received unsupported Content-Type \"text/html\" and no fallback_scrape_protocol specified"}
```

Two surprises in one output. First: MinIO chart 5.4.0 doesn't actually use `app.kubernetes.io/name`. It uses the plain `app: minio` label — not standard, but what the chart ships. Second: even after I fixed that, the chart ships **two** Services with that label — the API on port 9000 (metrics) and the admin console on port 9001 (HTML). The broad selector matched both and Prometheus tried to scrape the console, which politely returned HTML, which Prometheus politely rejected.

The lesson I took: ServiceMonitor selectors should be derived from `kubectl get svc -o yaml` in the live cluster, not from the label conventions I assume the chart follows. Charts are older than conventions.

**Fix** (PR [#10](https://github.com/RobDoan/gitops-rackspace/pull/10)): narrow the selector by adding `monitoring: "true"`, a label the MinIO chart sets only on the API Service:

```yaml
selector:
  matchLabels:
    app: minio
    monitoring: "true"
```

### Problem 2: Qdrant's headless Service is a clone of the main one

Same class of bug, different shape. Qdrant ships a main `ClusterIP` Service and a headless Service for StatefulSet cluster discovery. Both carry `app.kubernetes.io/name: qdrant`. Both route to the same pod. My selector matched both, Prometheus scraped the pod twice, and every `qdrant_*` series ended up with a sibling under `service=qdrant-headless`.

I knew what a headless Service was for — pod-to-pod DNS in StatefulSets — but I'd never had one overlap with a main Service before. The mental model I'd been operating with was "one Service, one selector" and I just hadn't updated it.

**Fix**: exclude the headless via `matchExpressions` (only the headless carries `component: cluster-discovery`):

```yaml
selector:
  matchLabels:
    app.kubernetes.io/name: qdrant
  matchExpressions:
    - key: app.kubernetes.io/component
      operator: DoesNotExist
```

### Verification

```bash
$ kubectl -n monitoring exec prometheus-... -c prometheus -- \
    wget -qO- 'http://localhost:9090/api/v1/targets' | \
    jq -c '.data.activeTargets[] |
           select(.labels.namespace | test("^(n8n|minio|qdrant)$")) |
           {ns: .labels.namespace, service: .labels.service, health: .health}'
{"ns":"minio","service":"minio","health":"up"}
{"ns":"n8n","service":"n8n","health":"up"}
{"ns":"qdrant","service":"qdrant","health":"up"}
```

Three clean targets, no duplicates, no DOWN noise. Sample metrics confirmed data flow: `minio_cluster_capacity_raw_total_bytes=18,859,732,992` (17.5 GB), `n8n_active_workflow_count=0`, Qdrant emitting `collections_total` / `cluster_*` / `app_info` unprefixed.

## Phase 5 — Backend FastAPI instrumentation

I wanted three things from the backend: standard HTTP RED metrics (rate, errors, duration) for the API surface, per-LangGraph-node latency so I can see which part of the story pipeline is slow, and outcome-tagged counters for every outbound API call so I can alert on "Anthropic is timing out more than usual" without having to parse logs.

`prometheus-fastapi-instrumentator` handles the RED metrics for free. The custom series I defined in `backend/utils/metrics.py`:

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

`backend/main.py` wires the instrumentator after the routers are included:

```python
Instrumentator(
    should_group_status_codes=False,
    should_instrument_requests_inprogress=True,
    excluded_handlers=["/docs", "/openapi.json", "/healthz", "/metrics"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
```

Every LangGraph node got wrapped with a timing decorator. Every outbound call to Anthropic, ElevenLabs, and mem0 got bracketed with a `try/except` that increments `external_api_calls`. Five pytest tests cover the endpoint, the custom registrations, and the counter/histogram mechanics — written first, red first, implementation turns them green.

```bash
$ uv run pytest tests/test_utils/test_metrics.py -v
======================= 5 passed in 0.8s =======================
$ uv run pytest tests/ -v --tb=short | tail -1
======================= 164 passed in 45.1s =======================
```

### Problem 1: The plan told me to "replace main.py"

The original plan said: *"Replace the current contents of `main.py` with the following..."* and provided a 24-line template. I noticed, just before dispatching the work, that the template was drafted before the call-feature branch added `backend/routes/call.py`. A straight replace would have silently dropped the `call_router` include, which would have silently disabled the entire call feature for anyone using the new image.

I caught this by reading `main.py` before acting on the plan, which is not the kind of thing I should have had to rely on catching. The replacement instruction was a landmine the plan author (me, twelve hours earlier) couldn't have known about.

**Rule I'm keeping**: in multi-author repos, any instruction that says "replace" should be translated into "patch" before execution. It costs more care to write the Edit calls, but it preserves work that landed after the plan was drafted. Same reasoning as merge vs rebase, different surface.

### Problem 2: Test-time env vars need to be set before module collection

`TestClient(app)` at the top of `test_metrics.py` imports `backend.main`, which imports the Anthropic / mem0 clients, which read env vars at module load. A session-scoped autouse fixture that sets those vars runs *after* collection. Too late.

Fix was setting the env var defaults at the top of `conftest.py`, before any collection starts:

```python
# backend/tests/conftest.py, top of file
import os
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-not-real")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-key-not-real")
# ...
```

Not much of a lesson, but worth flagging: any time I add a test that imports `main` at module scope, I'm implicitly depending on whatever `main` imports at module scope. If those deps read env vars, fixtures aren't early enough.

### Problem 3: Post-merge `/metrics` was 404 and I blamed the wrong thing

After merging the backend PR, I tried to hit `/metrics` via `kubectl port-forward svc/backend 8000` and `curl localhost:8000/metrics`. 404. My first thought was that the instrumentator call had silently been ordered wrong, or that the `excluded_handlers` list had eaten `/metrics` itself.

The actual cause was dumber and harder to debug: the pod was still running the *previous* image. `port-forward` hits whatever pod is currently Running, and the merge hadn't rolled out yet.

Diagnostic path:

```bash
# 1. What image is actually running?
$ kubectl -n royal-dispatch get pod -l app=royal-dispatch,component=backend \
    -o jsonpath='{.items[0].spec.containers[0].image}'
quydoan/royal-dispatch-backend:ec49b55-1776979771
# (ec49b55 is from before my PR merged)

# 2. Did Flux see the new image?
$ flux get image policy royal-dispatch-backend
NAME                    IMAGE                          TAG
royal-dispatch-backend  quydoan/royal-dispatch-backend f1d4fa4-1776988366
# Yes — it resolved to the new tag. But the Kustomization hadn't reconciled
# to propagate that tag into the Deployment manifest yet.

# 3. Force it.
$ flux reconcile kustomization royal-dispatch --with-source
✔ applied revision main@sha1:4446fb78
```

New pod came up within 90 seconds. `/metrics` started returning Prometheus text format. The lesson embedded here: **Flux image automation is a five-stage pipeline** (ImageRepository scan → ImagePolicy resolve → ImageUpdateAutomation commit → GitRepository reconcile → Kustomization reconcile), and a stall at any stage looks identical from the outside — old pod still serving, new code not live. The first two `flux get` commands told me exactly where I was in the pipeline; I just didn't think to run them for several minutes because I assumed the bug was in my code.

Also worth noting for future in-pod debugging: the backend container doesn't ship `curl`. Two workarounds:

```bash
# From inside the pod:
python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/metrics').read().decode())"

# Or from outside via port-forward + host curl (but only works once the
# right image is running, which was my original sin here).
```

### Caveat: LangChain hides timeout from the counter

The outcome label on `external_api_calls` distinguishes `ok` / `timeout` / `error`. I wanted that distinction because "Anthropic is slow" and "Anthropic is broken" are different operational situations and I want different alert thresholds for each.

The Anthropic call sites all go through `langchain_anthropic.ChatAnthropic`, which normalizes every exception into a generic LangChain error type. The `httpx.TimeoutException` branch never fires through that wrapper; timeouts land in `outcome="error"` along with everything else. Only the raw `httpx.post` in `backend/services/elevenlabs_convai.py` actually distinguishes.

I accepted this. Getting per-error-class labels out of a LangChain-wrapped call would mean either writing a response-inspection layer at the HTTP transport level, or replacing `ChatAnthropic` with a direct SDK client. Both are bigger refactors than the signal is worth today — when I actually hit an Anthropic-slowness incident, I'll reconsider.

## What broke, in summary

Six follow-up PRs after the five primary ones. Every defect fell into one of three buckets:

1. **Bootstrap ordering** — Phase 1 before Phase 2, `AlertmanagerConfig` inside the same Kustomization as its CRD-installing HelmRelease. Both fixed by splitting resources across Flux Kustomizations with explicit `dependsOn`.
2. **Selector too loose** — MinIO console, Qdrant headless. Both fixed by reading actual Service labels in the live cluster (`kubectl get svc -o yaml`) and narrowing.
3. **Wrong layer for the work** — role DDL in an application migration. Fixed by moving the work to the layer that has the privileges it needs (`kubectl exec ... psql -U postgres`), not the layer where the automation was convenient.

The pattern behind all three: the plan was written against a mental model of the system, and each defect was where the model and the running cluster disagreed. The fix in every case was cheap once I looked at the actual state (`flux get kustomization`, `kubectl -n <ns> get svc`, `\du royal`). The expensive part was remembering to look.

If there's a single takeaway for me it's this: **when a resource "should work" but doesn't, stop reading my own YAML and start reading the cluster.** Every bug in this rollout was visible in one `kubectl` or `flux get` command. I just kept looking at the files first.

## What's next (Phases 6–9)

- **Phase 6** — Loki 6.55.0 in SingleBinary mode, S3 backend on MinIO. Logs with Prometheus-compatible labels so I can drill from alert → dashboard → logs in a single query language.
- **Phase 7** — Grafana Alloy DaemonSet for log shipping (the newer replacement for Promtail).
- **Phase 8** — Grafana data source wiring + first-pass dashboards (Kubernetes overview, Postgres health, app RED).
- **Phase 9** — First-wave `PrometheusRule` CRs: `TargetDown`, `HighErrorRate`, `StoryGenerationSlow`, `PostgresConnectionSaturation`. Annotations structured so an eventual AI-agent remediation loop (described in the [design post](./2026-04-22-observability-and-the-alert-that-fixes-itself.md)) can parse `summary` / `description` into source-file breadcrumbs.

Phase 6 starts with a MinIO bucket and Vault write — same dance as the postgres-exporter password. The shape is by now familiar.

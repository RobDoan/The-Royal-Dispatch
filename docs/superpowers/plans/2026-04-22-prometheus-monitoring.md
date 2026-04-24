# Prometheus + Loki Observability Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a full metrics + logs + alerts stack on the `homelander` k3s cluster (Prometheus, Alertmanager, Loki, Alloy, postgres-exporter) wired to the existing Grafana, with Slack alerts and structured annotations that a future AI agent can consume for remediation.

**Architecture:** GitOps via Flux — everything is declared under `apps/` or `infrastructure/` in `gitops-rackspace`, referenced from `clusters/homelander/kustomization.yaml`, reconciled by Flux. Backend instrumentation is the only code change (new `/metrics` endpoint + three custom LangGraph metrics) in the `the-royal-dispatch` repo.

**Tech Stack:** `kube-prometheus-stack 83.7.0`, `loki 6.55.0`, `alloy 1.7.0`, `prometheus-postgres-exporter 7.5.2`, existing Grafana chart, Flux v2, External Secrets Operator, Vault, k3s (local-path), MinIO (S3), FastAPI, `prometheus-fastapi-instrumentator 7.x`, `prometheus-client 0.21.x`.

**Two repositories are touched:**
- GitOps: `/Users/quydoan/Projects/k8s/gitops-rackspace/`
- App code: `/Users/quydoan/Projects/ai-agents/the-royal-dispatch/`

Each phase = one PR. The nine phases are ordered so Flux can reconcile every step incrementally without broken intermediate states.

---

## Prerequisites

- [ ] **Step 0a: Verify Flux CLI is installed and authenticated against homelander**

Run: `flux check`
Expected: all checks pass, shows cluster `homelander`.

- [ ] **Step 0b: Verify kubectl context points at homelander**

Run: `kubectl config current-context`
Expected: output ends with `homelander` (exact name depends on local kubeconfig).

- [ ] **Step 0c: Verify `vault` CLI is authenticated**

Run: `vault token lookup`
Expected: returns a non-error token lookup showing your policy.

- [ ] **Step 0d: Create the monitoring namespace secret paths in Vault (data written in Phases 2, 3, 6)**

No action yet — these Vault paths will be created inside the relevant phases. Documenting here for reference:
- `secret/observability/slack-webhook` — keys `default`, `critical` (Phase 2)
- `secret/postgres/exporter-password` — key `password` (Phase 3)
- `secret/observability/loki-s3` — keys `access-key`, `secret-key` (Phase 6)

---

## File Map

### gitops-rackspace (new or modified)

| Action | Path | Responsibility |
|---|---|---|
| Modify | `infrastructure/ingress-nginx/helmrelease.yaml` | Enable controller metrics + ServiceMonitor (Phase 1) |
| Create | `apps/kube-prometheus-stack/base/namespace.yaml` | `monitoring` namespace (Phase 2) |
| Create | `apps/kube-prometheus-stack/base/helmrepository.yaml` | `prometheus-community` repo (Phase 2) |
| Create | `apps/kube-prometheus-stack/base/helmrelease.yaml` | Chart 83.7.0 release (Phase 2) |
| Create | `apps/kube-prometheus-stack/base/alertmanager-config.yaml` | Slack routing (Phase 2) |
| Create | `apps/kube-prometheus-stack/base/externalsecret-alertmanager.yaml` | Pull Slack webhook from Vault (Phase 2) |
| Create | `apps/kube-prometheus-stack/base/kustomization.yaml` | Base kustomization (Phase 2; extended in 4, 9) |
| Create | `apps/kube-prometheus-stack/overlays/homelander/kustomization.yaml` | Overlay (Phase 2) |
| Create | `clusters/homelander/kube-prometheus-stack.yaml` | Flux Kustomization (Phase 2) |
| Modify | `clusters/homelander/kustomization.yaml` | Append stack + loki + alloy + pg-exporter refs (Phases 2, 3, 6, 7) |
| Create | `apps/prometheus-postgres-exporter/base/helmrelease.yaml` | Exporter release (Phase 3) |
| Create | `apps/prometheus-postgres-exporter/base/externalsecret.yaml` | Pull exporter password (Phase 3) |
| Create | `apps/prometheus-postgres-exporter/base/servicemonitor.yaml` | Scrape the exporter (Phase 3) |
| Create | `apps/prometheus-postgres-exporter/base/kustomization.yaml` | — (Phase 3) |
| Create | `apps/prometheus-postgres-exporter/overlays/homelander/kustomization.yaml` | — (Phase 3) |
| Create | `clusters/homelander/prometheus-postgres-exporter.yaml` | Flux Kustomization (Phase 3) |
| Create | `apps/kube-prometheus-stack/base/servicemonitors/minio.yaml` | (Phase 4) |
| Create | `apps/kube-prometheus-stack/base/servicemonitors/qdrant.yaml` | (Phase 4) |
| Create | `apps/kube-prometheus-stack/base/servicemonitors/n8n.yaml` | (Phase 4) |
| Modify | `apps/n8n/base/helmrelease.yaml` | Add `N8N_METRICS=true` to `extraEnv` (Phase 4) |
| Create | `apps/kube-prometheus-stack/base/servicemonitors/backend.yaml` | (Phase 5 tail) |
| Create | `apps/loki/base/helmrepository.yaml` | `grafana` Helm repo (Phase 6) |
| Create | `apps/loki/base/helmrelease.yaml` | Chart 6.55.0 release (Phase 6) |
| Create | `apps/loki/base/externalsecret-s3.yaml` | S3 creds from Vault (Phase 6) |
| Create | `apps/loki/base/minio-bucket-job.yaml` | Idempotent bucket creation (Phase 6) |
| Create | `apps/loki/base/kustomization.yaml` | (Phase 6) |
| Create | `apps/loki/overlays/homelander/kustomization.yaml` | (Phase 6) |
| Create | `clusters/homelander/loki.yaml` | Flux Kustomization (Phase 6) |
| Create | `apps/alloy/base/helmrelease.yaml` | Chart 1.7.0 DaemonSet (Phase 7) |
| Create | `apps/alloy/base/kustomization.yaml` | (Phase 7) |
| Create | `apps/alloy/overlays/homelander/kustomization.yaml` | (Phase 7) |
| Create | `clusters/homelander/alloy.yaml` | Flux Kustomization (Phase 7) |
| Modify | `apps/grafana/base/helmrelease.yaml` | Add Prometheus + Loki data sources, community dashboards, ConfigMap mount for custom dashboard (Phase 8) |
| Create | `apps/grafana/base/dashboards/royal-dispatch.json` | Custom dashboard JSON (Phase 8) |
| Modify | `apps/grafana/base/kustomization.yaml` | Add dashboard ConfigMap generator (Phase 8) |
| Create | `apps/kube-prometheus-stack/base/prometheusrules/infra.yaml` | Node / pod / disk rules (Phase 9) |
| Create | `apps/kube-prometheus-stack/base/prometheusrules/ingress.yaml` | 5xx rate, cert expiry (Phase 9) |
| Create | `apps/kube-prometheus-stack/base/prometheusrules/app.yaml` | Backend SLO rules (Phase 9) |

### the-royal-dispatch (new or modified)

| Action | Path | Responsibility |
|---|---|---|
| Create | `backend/db/migrations/00000000000XXX_postgres_exporter_user.up.sql` | Create `postgres_exporter` DB user (Phase 3) |
| Create | `backend/db/migrations/00000000000XXX_postgres_exporter_user.down.sql` | Reverse migration (Phase 3) |
| Modify | `backend/pyproject.toml` | Add `prometheus-fastapi-instrumentator`, `prometheus-client` (Phase 5) |
| Create | `backend/utils/metrics.py` | Custom `Counter` / `Histogram` definitions (Phase 5) |
| Modify | `backend/main.py` | Wire `Instrumentator` (Phase 5) |
| Modify | `backend/graph.py` | Wrap node calls with timing decorator (Phase 5) |
| Modify | `backend/utils/elevenlabs.py`, `anthropic_client.py`, `mem0_client.py` | Increment `external_api_calls` (Phase 5) |
| Create | `backend/tests/test_utils/test_metrics.py` | Tests for custom metrics (Phase 5) |

---

## Phase 1 — ingress-nginx metrics patch

Repo: `gitops-rackspace`. One file modified. No-op until Phase 2 installs Prometheus.

- [ ] **Step 1.1: Create branch**

Run: `cd /Users/quydoan/Projects/k8s/gitops-rackspace && git checkout -b feat/ingress-nginx-metrics main`
Expected: `Switched to a new branch 'feat/ingress-nginx-metrics'`.

- [ ] **Step 1.2: Modify `infrastructure/ingress-nginx/helmrelease.yaml`**

Use Edit to replace the `values:` block. The final `values:` section must contain (add the three new keys under `controller:`):

```yaml
  values:
    controller:
      service:
        type: LoadBalancer
      ingressClassResource:
        default: true
      config:
        use-forwarded-headers: "true"
      metrics:
        enabled: true
        serviceMonitor:
          enabled: true
          namespace: monitoring
          additionalLabels:
            release: kube-prometheus-stack
        service:
          annotations:
            prometheus.io/scrape: "true"
            prometheus.io/port: "10254"
```

- [ ] **Step 1.3: Commit**

```bash
git add infrastructure/ingress-nginx/helmrelease.yaml
git commit -m "ingress-nginx: enable controller metrics + ServiceMonitor"
```

- [ ] **Step 1.4: Push and open PR**

```bash
git push -u origin feat/ingress-nginx-metrics
gh pr create --title "ingress-nginx: enable controller metrics" --body "Prerequisite for Prometheus. No-op until kube-prometheus-stack lands in a follow-up PR. The ServiceMonitor it creates will fail-open until CRDs exist."
```

- [ ] **Step 1.5: Merge, wait for Flux, verify**

After merging:

```bash
flux reconcile kustomization flux-system --with-source
kubectl -n ingress-nginx get svc ingress-nginx-controller-metrics
```

Expected: the `-metrics` service exists on port 10254 (may log a ServiceMonitor error until Phase 2; acceptable).

---

## Phase 2 — kube-prometheus-stack

Repo: `gitops-rackspace`. Installs the Operator, Prometheus, Alertmanager, node-exporter, kube-state-metrics, and the Slack alerting config.

> **Post-execution correction.** Two follow-up PRs were needed after the original plan landed; anyone replaying this plan from scratch should fold their changes into Steps 2.7–2.11 rather than repeat the mistakes.
>
> - **PR [#4](https://github.com/RobDoan/gitops-rackspace/pull/4)** — Split `alertmanager-config.yaml` into its own Flux `Kustomization` at `apps/kube-prometheus-stack-config/` with `dependsOn: [kube-prometheus-stack]`. The original single-Kustomization layout failed server-side dry-run because `AlertmanagerConfig` is a CRD installed by the HelmRelease — the Kustomization apply batch rejected the whole set before CRDs existed. Same split pattern applies to every downstream custom resource (ServiceMonitor, PrometheusRule) added in Phases 3–9.
> - **PR [#5](https://github.com/RobDoan/gitops-rackspace/pull/5)** — Silence the chart's `Watchdog` alert by routing it to a `"null"` receiver. Watchdog (`expr: vector(1)`) always fires as a dead-man's-switch; its value is only realized when forwarded to an EXTERNAL monitor (Dead Man's Snitch, healthchecks.io) that notices its absence. Until that external hop exists, Watchdog is pure `#alerts` noise. See **Follow-ups** at the end of this phase.

- [ ] **Step 2.1: Write Slack webhooks to Vault**

Create **two** Slack Incoming Webhooks in the same Slack app (https://api.slack.com/apps → Incoming Webhooks): one bound to `#alerts`, one bound to `#alerts-critical`. Slack webhooks are per-channel — the `channel:` field in the Alertmanager payload is not reliable for routing, so each destination channel needs its own webhook URL.

```bash
vault kv put secret/observability/slack-webhook \
  default="https://hooks.slack.com/services/<T>/<B>/<X>" \
  critical="https://hooks.slack.com/services/<T>/<B>/<Y>"
```

Verify:
```bash
vault kv get secret/observability/slack-webhook
```
Expected: both `default` and `critical` keys populated with their respective webhook URLs.

- [ ] **Step 2.2: Create branch**

```bash
cd /Users/quydoan/Projects/k8s/gitops-rackspace && git checkout main && git pull && git checkout -b feat/kube-prometheus-stack
```

- [ ] **Step 2.3: Create `apps/kube-prometheus-stack/base/namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
  labels:
    pod-security.kubernetes.io/enforce: privileged
    pod-security.kubernetes.io/audit: privileged
    pod-security.kubernetes.io/warn: privileged
```

Note: node-exporter needs privileged PSA level to mount host filesystems.

- [ ] **Step 2.4: Create `apps/kube-prometheus-stack/base/helmrepository.yaml`**

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: prometheus-community
  namespace: flux-system
spec:
  interval: 1h
  url: https://prometheus-community.github.io/helm-charts
```

- [ ] **Step 2.5: Create `apps/kube-prometheus-stack/base/helmrelease.yaml`**

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: kube-prometheus-stack
  namespace: monitoring
spec:
  interval: 30m
  timeout: 15m
  chart:
    spec:
      chart: kube-prometheus-stack
      version: 83.7.0
      sourceRef:
        kind: HelmRepository
        name: prometheus-community
        namespace: flux-system
  install:
    crds: CreateReplace
    remediation:
      retries: 3
  upgrade:
    crds: CreateReplace
  values:
    grafana:
      enabled: false
    crds:
      enabled: true
    prometheus:
      prometheusSpec:
        retention: 15d
        retentionSize: 18GB
        storageSpec:
          volumeClaimTemplate:
            spec:
              storageClassName: local-path
              accessModes: ["ReadWriteOnce"]
              resources:
                requests:
                  storage: 20Gi
        serviceMonitorSelectorNilUsesHelmValues: false
        podMonitorSelectorNilUsesHelmValues: false
        ruleSelectorNilUsesHelmValues: false
        probeSelectorNilUsesHelmValues: false
        resources:
          requests:
            cpu: 100m
            memory: 512Mi
          limits:
            memory: 1Gi
    alertmanager:
      alertmanagerSpec:
        alertmanagerConfigSelector:
          matchLabels:
            alertmanagerConfig: royal-dispatch
        alertmanagerConfigMatcherStrategy:
          type: None
        storage:
          volumeClaimTemplate:
            spec:
              storageClassName: local-path
              accessModes: ["ReadWriteOnce"]
              resources:
                requests:
                  storage: 2Gi
    nodeExporter:
      enabled: true
    kubeStateMetrics:
      enabled: true
```

- [ ] **Step 2.6: Create `apps/kube-prometheus-stack/base/externalsecret-alertmanager.yaml`**

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: alertmanager-slack
  namespace: monitoring
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: alertmanager-slack
    creationPolicy: Owner
  data:
    - secretKey: default
      remoteRef:
        key: observability/slack-webhook
        property: default
    - secretKey: critical
      remoteRef:
        key: observability/slack-webhook
        property: critical
```

- [ ] **Step 2.7: Create `apps/kube-prometheus-stack/base/alertmanager-config.yaml`**

```yaml
apiVersion: monitoring.coreos.com/v1alpha1
kind: AlertmanagerConfig
metadata:
  name: royal-dispatch
  namespace: monitoring
  labels:
    alertmanagerConfig: royal-dispatch
spec:
  route:
    receiver: slack-default
    groupBy: [alertname, namespace]
    groupWait: 30s
    groupInterval: 5m
    repeatInterval: 4h
    routes:
      - receiver: slack-critical
        matchers:
          - name: severity
            value: critical
  receivers:
    - name: slack-default
      slackConfigs:
        - apiURL:
            name: alertmanager-slack
            key: default
          channel: "#alerts"
          sendResolved: true
          title: "{{ .CommonLabels.alertname }} — {{ .CommonLabels.severity }}"
          text: |-
            {{ range .Alerts }}• *{{ .Annotations.summary }}*
            {{ .Annotations.description }}
            {{ end }}
    - name: slack-critical
      slackConfigs:
        - apiURL:
            name: alertmanager-slack
            key: critical
          channel: "#alerts-critical"
          sendResolved: true
          title: "[CRITICAL] {{ .CommonLabels.alertname }}"
          text: |-
            {{ range .Alerts }}• *{{ .Annotations.summary }}*
            {{ .Annotations.description }}
            {{ end }}
```

- [ ] **Step 2.8: Create `apps/kube-prometheus-stack/base/kustomization.yaml`**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - helmrepository.yaml
  - helmrelease.yaml
  - externalsecret-alertmanager.yaml
  - alertmanager-config.yaml
```

- [ ] **Step 2.9: Create `apps/kube-prometheus-stack/overlays/homelander/kustomization.yaml`**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
```

- [ ] **Step 2.10: Create `clusters/homelander/kube-prometheus-stack.yaml`**

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: kube-prometheus-stack
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./apps/kube-prometheus-stack/overlays/homelander
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: eso-store
    - name: ingress-nginx
  healthChecks:
    - apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      name: kube-prometheus-stack
      namespace: monitoring
```

- [ ] **Step 2.11: Modify `clusters/homelander/kustomization.yaml`**

Append `- kube-prometheus-stack.yaml` to the `resources:` list (keep existing entries in their current order).

- [ ] **Step 2.12: Commit**

```bash
git add apps/kube-prometheus-stack clusters/homelander/kube-prometheus-stack.yaml clusters/homelander/kustomization.yaml
git commit -m "add kube-prometheus-stack 83.7.0 with Slack alerting"
```

- [ ] **Step 2.13: Push, open PR, merge**

```bash
git push -u origin feat/kube-prometheus-stack
gh pr create --title "add kube-prometheus-stack 83.7.0" --body "Metrics stack for homelander. Bundled Grafana disabled — existing Grafana will get data sources in a later PR. Slack webhook from Vault."
```

- [ ] **Step 2.14: Force Flux reconcile after merge**

```bash
flux reconcile source git flux-system
flux reconcile kustomization kube-prometheus-stack --with-source
```

First reconcile takes 2-5 minutes to install CRDs + components.

- [ ] **Step 2.15: Verify CRDs installed**

Run: `kubectl get crd | grep monitoring.coreos.com | wc -l`
Expected: `10` (alertmanagerconfigs, alertmanagers, podmonitors, probes, prometheusagents, prometheuses, prometheusrules, scrapeconfigs, servicemonitors, thanosrulers).

- [ ] **Step 2.16: Verify Prometheus + Alertmanager pods running**

Run: `kubectl -n monitoring get pods`
Expected: `prometheus-kube-prometheus-stack-prometheus-0` and `alertmanager-kube-prometheus-stack-alertmanager-0` both `Running 2/2`, plus node-exporter DaemonSet and kube-state-metrics deployment all Ready.

- [ ] **Step 2.17: Verify the Slack secret is populated**

Run: `kubectl -n monitoring get secret alertmanager-slack -o jsonpath='{.data}' | jq 'to_entries | map({key, value: (.value | @base64d)})'`
Expected: both `default` and `critical` keys present, each decoded value is its respective Slack webhook URL.

- [ ] **Step 2.18: Force-fire a test alert**

Create a temporary `PrometheusRule` that always fires, then delete it.

```bash
cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: test-alert-remove-me
  namespace: monitoring
spec:
  groups:
    - name: test
      rules:
        - alert: TestAlertPleaseIgnore
          expr: vector(1)
          for: 30s
          labels:
            severity: warning
          annotations:
            summary: "Test alert — delete me"
            description: "Ignore this; verifying Slack wiring from Phase 2."
EOF
```

Wait ~90 seconds, then check Slack `#alerts`. Expected: a message from Alertmanager. Delete the rule:

```bash
kubectl -n monitoring delete prometheusrule test-alert-remove-me
```

### Phase 2 Follow-ups

- **External dead-man's-switch for Watchdog.** Watchdog is currently routed to the `"null"` receiver in `alertmanager-config.yaml` so it stops spamming `#alerts`. It still fires in Prometheus and is visible on the Alertmanager UI, but its actual value — telling you when monitoring itself is broken — is not realized until it's forwarded out of the cluster. Pick an external endpoint (Dead Man's Snitch free tier, or a healthchecks.io project) that expects a heartbeat every ≤5 minutes; replace the `null` route target with a `webhookConfigs` receiver pointing at that URL. No other changes needed. Low priority until the homelab runs anything production-critical.

---

## Phase 3 — prometheus-postgres-exporter

Two repos: an out-of-band Postgres bootstrap + Vault write; then the exporter manifests go in `gitops-rackspace`.

> **Post-execution corrections.** Two follow-up PRs landed; a future replay should fold them in rather than repeat the detour.
>
> - **the-royal-dispatch PR [#8](https://github.com/RobDoan/The-Royal-Dispatch/pull/8)** — The original Part A (Steps 3.1–3.6) put `CREATE USER postgres_exporter` + `GRANT pg_monitor` into an app migration. The migrator role `royal` only has `Create DB` (no `CREATEROLE`, no `SUPERUSER`), so the statement hit permission denied and golang-migrate pinned the DB at `version=7, dirty=true` — backend rollout wedged on the dirty guard. Role DDL does not belong in application migrations anyway. **Part A has been removed. A future replay should skip it entirely and run the CREATE/GRANT statements inside Part B's psql block** (see the consolidated command block below).
> - **gitops-rackspace PR [#8](https://github.com/RobDoan/gitops-rackspace/pull/8)** — `config.datasource.port` must be quoted (`"5432"`). Chart 7.5.2's DSN helper renders the port via a string formatter; unquoted, YAML parses `5432` as an integer which reaches the template as a Go `float64` and the helper rejects it with `wrong type for value; expected string; got float64`. Step 3.11 has been corrected inline.

### Part A — [SUPERSEDED by Part B]

The original Steps 3.1–3.6 (DB migration `<N>_postgres_exporter_user.up.sql/down.sql`) are retained below for historical reference only. **Skip this part.** The `postgres_exporter` user is now created in Part B as `postgres` superuser via `kubectl exec ... psql`, which is where the password also gets set.

<details>
<summary>Original Steps 3.1–3.6 (do not execute)</summary>

### Part A — migration (the-royal-dispatch)

- [ ] **Step 3.1: Create branch in `the-royal-dispatch`**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch && git checkout main && git pull && git checkout -b feat/postgres-exporter-user
```

- [ ] **Step 3.2: Pick the next migration number**

```bash
ls backend/db/migrations | tail -5
```
Take the highest existing prefix and add 1 (formatted with same padding width). For the rest of this plan the new prefix is called `<N>` — substitute the actual number.

- [ ] **Step 3.3: Create `backend/db/migrations/<N>_postgres_exporter_user.up.sql`**

```sql
-- Create a dedicated, low-privilege user for prometheus-postgres-exporter.
-- Password is set from Vault at runtime by a one-shot Job (see Phase 3 Part B).

CREATE USER postgres_exporter WITH LOGIN PASSWORD 'replaced_after_bootstrap';
GRANT pg_monitor TO postgres_exporter;
GRANT CONNECT ON DATABASE royal_dispatch TO postgres_exporter;
```

- [ ] **Step 3.4: Create `backend/db/migrations/<N>_postgres_exporter_user.down.sql`**

```sql
REVOKE CONNECT ON DATABASE royal_dispatch FROM postgres_exporter;
REVOKE pg_monitor FROM postgres_exporter;
DROP USER IF EXISTS postgres_exporter;
```

- [ ] **Step 3.5: Commit the migration**

```bash
git add backend/db/migrations/
git commit -m "backend: migration for postgres_exporter DB user"
```

- [ ] **Step 3.6: Push + open PR + merge + wait for image automation + Flux apply**

```bash
git push -u origin feat/postgres-exporter-user
gh pr create --title "backend: migration for postgres_exporter DB user" --body "Creates a read-only pg_monitor-granted user for prometheus-postgres-exporter (Phase 3 of observability rollout)."
```

After merge, wait for Flux to redeploy backend (it runs migrations in `initContainers`). Verify:

```bash
kubectl -n royal-dispatch logs deploy/backend -c migrate --tail=20
```
Expected: final line ends with the new migration number being applied.

</details>

### Part B — bootstrap postgres_exporter user + password (all out-of-band, as `postgres` superuser)

Single consolidated block. Run all commands in the same shell so `$EXPORTER_PASS` persists.

- [ ] **Step 3.7: Generate password, write to Vault, create user, verify login**

```bash
# 1. Generate and store password
EXPORTER_PASS=$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-32)
vault kv put secret/postgres/exporter-password password="$EXPORTER_PASS"
vault kv get -field=password secret/postgres/exporter-password
# Expected: the generated password printed back.

# 2. Create the role in Postgres as superuser
POSTGRES_PW=$(kubectl -n postgres get secret postgres-secrets -o jsonpath='{.data.postgres-password}' | base64 -d)

kubectl -n postgres exec -i postgres-postgresql-0 -- env PGPASSWORD="$POSTGRES_PW" psql -U postgres -d royal_dispatch <<SQL
CREATE USER postgres_exporter WITH LOGIN PASSWORD '$EXPORTER_PASS';
GRANT pg_monitor TO postgres_exporter;
GRANT CONNECT ON DATABASE royal_dispatch TO postgres_exporter;
SQL
# Expected: three successive messages: CREATE ROLE, GRANT ROLE, GRANT.

# 3. Confirm the exporter user can log in
kubectl -n postgres exec postgres-postgresql-0 -- \
  env PGPASSWORD="$EXPORTER_PASS" psql -h 127.0.0.1 -U postgres_exporter -d royal_dispatch -c "SELECT 1;"
# Expected: ?column? table with 1.
```

Why superuser: `CREATE USER` needs `CREATEROLE`, `GRANT pg_monitor` needs admin on that role, and `GRANT CONNECT` needs the DB owner. The stock Bitnami Postgres chart gives `royal` only `Create DB`, so this work has to go through the superuser path — and the `ALTER USER` for password rotation lives in the same place for consistency.

**Rollback** (if you ever need to tear the user down):
```sql
REVOKE CONNECT ON DATABASE royal_dispatch FROM postgres_exporter;
REVOKE pg_monitor FROM postgres_exporter;
DROP USER IF EXISTS postgres_exporter;
```

### Part C — exporter manifests (gitops-rackspace)

- [ ] **Step 3.9: Branch in gitops repo**

```bash
cd /Users/quydoan/Projects/k8s/gitops-rackspace && git checkout main && git pull && git checkout -b feat/postgres-exporter
```

- [ ] **Step 3.10: Create `apps/prometheus-postgres-exporter/base/externalsecret.yaml`**

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: postgres-exporter
  namespace: postgres
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: postgres-exporter
    creationPolicy: Owner
  data:
    - secretKey: password
      remoteRef:
        key: postgres/exporter-password
        property: password
```

- [ ] **Step 3.11: Create `apps/prometheus-postgres-exporter/base/helmrelease.yaml`**

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: prometheus-postgres-exporter
  namespace: postgres
spec:
  interval: 30m
  timeout: 5m
  chart:
    spec:
      chart: prometheus-postgres-exporter
      version: 7.5.2
      sourceRef:
        kind: HelmRepository
        name: prometheus-community
        namespace: flux-system
  install:
    remediation:
      retries: 3
  values:
    config:
      datasource:
        host: postgres-postgresql.postgres.svc.cluster.local
        port: "5432"   # must be quoted — chart helper printf's expects string, rejects float64
        user: postgres_exporter
        passwordSecret:
          name: postgres-exporter
          key: password
        database: royal_dispatch
        sslmode: disable
    serviceMonitor:
      enabled: true
      namespace: monitoring
      labels:
        release: kube-prometheus-stack
      interval: 30s
    resources:
      requests:
        cpu: 50m
        memory: 64Mi
      limits:
        memory: 128Mi
```

- [ ] **Step 3.12: Create `apps/prometheus-postgres-exporter/base/kustomization.yaml`**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - externalsecret.yaml
  - helmrelease.yaml
```

- [ ] **Step 3.13: Create `apps/prometheus-postgres-exporter/overlays/homelander/kustomization.yaml`**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
```

- [ ] **Step 3.14: Create `clusters/homelander/prometheus-postgres-exporter.yaml`**

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: prometheus-postgres-exporter
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./apps/prometheus-postgres-exporter/overlays/homelander
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: postgres
    - name: kube-prometheus-stack
  healthChecks:
    - apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      name: prometheus-postgres-exporter
      namespace: postgres
```

- [ ] **Step 3.15: Append `- prometheus-postgres-exporter.yaml` to `clusters/homelander/kustomization.yaml`**

- [ ] **Step 3.16: Commit, push, PR, merge**

```bash
git add apps/prometheus-postgres-exporter clusters/homelander/prometheus-postgres-exporter.yaml clusters/homelander/kustomization.yaml
git commit -m "add prometheus-postgres-exporter 7.5.2"
git push -u origin feat/postgres-exporter
gh pr create --title "add prometheus-postgres-exporter 7.5.2" --body "Scrapes Postgres internals (pg_stat_*). Uses the postgres_exporter user created in the-royal-dispatch migration."
```

- [ ] **Step 3.17: Flux reconcile and verify**

```bash
flux reconcile kustomization prometheus-postgres-exporter --with-source
kubectl -n postgres get pods -l app.kubernetes.io/name=prometheus-postgres-exporter
```
Expected: one Running pod.

- [ ] **Step 3.18: Verify metrics flow to Prometheus**

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090 &
PF=$!
sleep 3
curl -s 'http://localhost:9090/api/v1/query?query=pg_up' | jq '.data.result[0].value[1]'
kill $PF
```
Expected: `"1"` (note: JSON-quoted string).

---

## Phase 4 — ServiceMonitors for MinIO, Qdrant, n8n

Repo: `gitops-rackspace`. Three new ServiceMonitors plus one patch to enable n8n metrics.

> **Post-execution corrections.** Several defects in the original steps were caught at apply/scrape time; a future replay should fold these in.
>
> - **Structure path**: ServiceMonitors are CRs (depend on `ServiceMonitor` CRD installed by `kube-prometheus-stack`), so they belong in `apps/kube-prometheus-stack-config/base/servicemonitors/` — not `apps/kube-prometheus-stack/base/`. Same reasoning as the AlertmanagerConfig split in Phase 2. Steps 4.3–4.6 below reference the wrong path; the **correct** edit is to `apps/kube-prometheus-stack-config/base/kustomization.yaml`.
> - **Release label**: every ServiceMonitor needs `metadata.labels.release: kube-prometheus-stack` for the Operator's `serviceMonitorSelector` to pick it up. This is the same label used for ingress-nginx (set via Helm values) and postgres-exporter (set via Helm chart values). Absent this label, Prometheus silently ignores the target.
> - **MinIO selector quirk (gitops PR [#10](https://github.com/RobDoan/gitops-rackspace/pull/10))**: chart 5.4.0 uses non-standard labels. The correct selector is `app: minio` + `monitoring: "true"` — the `monitoring: "true"` label is set only on the main API Service (port 9000), which narrows us away from the admin console Service (port 9001, which serves HTML and would report "unsupported Content-Type"). The port name is `http`, not `minio-api`.
> - **Qdrant selector quirk (gitops PR [#10](https://github.com/RobDoan/gitops-rackspace/pull/10))**: Qdrant ships a main ClusterIP Service and a headless Service for StatefulSet cluster discovery; both carry `app.kubernetes.io/name=qdrant` and route to the same pod. Scraping both doubles every series. Add a `matchExpressions: [{key: app.kubernetes.io/component, operator: DoesNotExist}]` to exclude the headless (only the headless carries `component=cluster-discovery`).
>
> Corrected YAML is inlined in Steps 4.3–4.5 below with explanatory comments.

- [ ] **Step 4.1: Branch**

```bash
cd /Users/quydoan/Projects/k8s/gitops-rackspace && git checkout main && git pull && git checkout -b feat/app-servicemonitors
```

- [ ] **Step 4.2: Enable n8n metrics — modify `apps/n8n/base/helmrelease.yaml`**

Under `values.main.extraEnv:` add:

```yaml
        N8N_METRICS:
          value: "true"
```

Place it anywhere in the existing `extraEnv` block alongside the other entries.

- [ ] **Step 4.3: Create `apps/kube-prometheus-stack-config/base/servicemonitors/n8n.yaml`**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: n8n
  namespace: monitoring
  labels:
    release: kube-prometheus-stack   # required for Operator's serviceMonitorSelector
spec:
  namespaceSelector:
    matchNames: [n8n]
  selector:
    matchLabels:
      app.kubernetes.io/name: n8n
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

- [ ] **Step 4.4: Create `apps/kube-prometheus-stack-config/base/servicemonitors/minio.yaml`**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: minio
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  namespaceSelector:
    matchNames: [minio]
  selector:
    matchLabels:
      app: minio                  # chart 5.4.0 uses plain 'app', not app.kubernetes.io/name
      monitoring: "true"          # narrows to the API Service; console Service lacks this
  endpoints:
    - port: http                  # port name on the API Service (not 'minio-api')
      path: /minio/v2/metrics/cluster
      interval: 30s
      scheme: http
```

- [ ] **Step 4.5: Create `apps/kube-prometheus-stack-config/base/servicemonitors/qdrant.yaml`**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: qdrant
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  namespaceSelector:
    matchNames: [qdrant]
  selector:
    matchLabels:
      app.kubernetes.io/name: qdrant
    # Exclude the headless Service (cluster-discovery) — it proxies to the same
    # pod as the main Service, so matching both would double every series.
    matchExpressions:
      - key: app.kubernetes.io/component
        operator: DoesNotExist
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

- [ ] **Step 4.6: Update `apps/kube-prometheus-stack-config/base/kustomization.yaml`**

Append after the existing entries:

```yaml
  - servicemonitors/minio.yaml
  - servicemonitors/qdrant.yaml
  - servicemonitors/n8n.yaml
```

The full file now (after the Phase 2 correction + these additions):
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - alertmanager-config.yaml
  - servicemonitors/minio.yaml
  - servicemonitors/qdrant.yaml
  - servicemonitors/n8n.yaml
```

- [ ] **Step 4.7: Commit, push, PR, merge**

```bash
git add apps/kube-prometheus-stack-config/base/servicemonitors apps/kube-prometheus-stack-config/base/kustomization.yaml apps/n8n/base/helmrelease.yaml
git commit -m "add ServiceMonitors for minio, qdrant, n8n + enable N8N_METRICS"
git push -u origin feat/app-servicemonitors
gh pr create --title "add ServiceMonitors for minio, qdrant, n8n" --body "Enables N8N_METRICS=true and adds ServiceMonitors for each app service. Backend ServiceMonitor lands with the backend instrumentation PR."
```

- [ ] **Step 4.8: Flux reconcile**

```bash
flux reconcile kustomization kube-prometheus-stack-config --with-source
flux reconcile kustomization n8n --with-source
```

- [ ] **Step 4.9: Verify Prometheus targets are UP**

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090 &
PF=$!; sleep 3
curl -s 'http://localhost:9090/api/v1/targets' | jq '.data.activeTargets[] | select(.labels.job | test("minio|qdrant|n8n")) | {job: .labels.job, health: .health, last: .lastError}'
kill $PF
```
Expected: three entries, all with `health: "up"` and empty `last`. If any are `down`, check the Service port name hint in the relevant step's note.

---

## Phase 5 — Backend instrumentation

Repo: `the-royal-dispatch`. True TDD.

- [ ] **Step 5.1: Branch**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch && git checkout main && git pull && git checkout -b feat/backend-prometheus-metrics
```

- [ ] **Step 5.2: Add dependencies — modify `backend/pyproject.toml`**

Add to the `dependencies` list (alphabetical position is fine, but keep `prometheus-client` before `prometheus-fastapi-instrumentator` for readability):

```toml
    "prometheus-client>=0.21.0",
    "prometheus-fastapi-instrumentator>=7.0.0",
```

- [ ] **Step 5.3: Install them**

```bash
cd backend && uv sync && cd ..
```
Expected: both packages resolved into `uv.lock`.

- [ ] **Step 5.4: Write the failing tests — create `backend/tests/test_utils/test_metrics.py`**

```python
from prometheus_client import REGISTRY
from fastapi.testclient import TestClient

from backend.main import app
from backend.utils.metrics import (
    external_api_calls,
    langgraph_node_duration,
    story_generation_seconds,
)


client = TestClient(app)


def test_metrics_endpoint_exposes_prometheus_format():
    response = client.get("/metrics")
    assert response.status_code == 200
    body = response.text
    assert "# HELP" in body
    assert "# TYPE" in body


def test_custom_metrics_are_registered():
    response = client.get("/metrics")
    body = response.text
    assert "royal_langgraph_node_duration_seconds" in body
    assert "royal_external_api_calls_total" in body
    assert "royal_story_generation_seconds" in body


def test_external_api_calls_counter_increments():
    before = _counter_value("royal_external_api_calls_total", provider="anthropic", outcome="ok")
    external_api_calls.labels(provider="anthropic", outcome="ok").inc()
    after = _counter_value("royal_external_api_calls_total", provider="anthropic", outcome="ok")
    assert after == before + 1


def test_langgraph_histogram_records_observations():
    langgraph_node_duration.labels(node="generate_story", story_type="daily").observe(1.5)
    count = REGISTRY.get_sample_value(
        "royal_langgraph_node_duration_seconds_count",
        {"node": "generate_story", "story_type": "daily"},
    )
    assert count is not None and count >= 1


def test_story_generation_histogram_records_observations():
    story_generation_seconds.labels(story_type="daily").observe(10.0)
    count = REGISTRY.get_sample_value(
        "royal_story_generation_seconds_count",
        {"story_type": "daily"},
    )
    assert count is not None and count >= 1


def _counter_value(name: str, **labels: str) -> float:
    value = REGISTRY.get_sample_value(name, labels)
    return value if value is not None else 0.0
```

- [ ] **Step 5.5: Run the tests — expect FAIL**

```bash
cd backend && uv run pytest tests/test_utils/test_metrics.py -v
```
Expected: `ModuleNotFoundError: No module named 'backend.utils.metrics'` or similar import error.

- [ ] **Step 5.6: Create `backend/utils/metrics.py`**

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

- [ ] **Step 5.7: Wire the instrumentator — modify `backend/main.py`**

Replace the current contents with:

```python
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from backend.routes.stories import router as stories_router
from backend.routes.admin import router as admin_router
from backend.routes.users import router as users_router
from backend.utils import metrics  # noqa: F401 — registers custom metrics at import

app = FastAPI(title="Royal Dispatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stories_router)
app.include_router(admin_router)
app.include_router(users_router)

Instrumentator(
    should_group_status_codes=False,
    should_instrument_requests_inprogress=True,
    excluded_handlers=["/docs", "/openapi.json", "/healthz", "/metrics"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
```

- [ ] **Step 5.8: Run the tests — expect PASS**

```bash
cd backend && uv run pytest tests/test_utils/test_metrics.py -v
```
Expected: all 5 tests pass.

- [ ] **Step 5.9: Commit the endpoint work**

```bash
git add backend/pyproject.toml backend/uv.lock backend/utils/metrics.py backend/main.py backend/tests/test_utils/test_metrics.py
git commit -m "backend: expose /metrics with custom LangGraph + external-API counters"
```

- [ ] **Step 5.10: Wire `external_api_calls` into the API clients**

For each file below, wrap the outbound HTTP call. Pattern:

```python
from backend.utils.metrics import external_api_calls

try:
    response = <existing outbound call>
    external_api_calls.labels(provider="<name>", outcome="ok").inc()
    return response
except (httpx.TimeoutException, asyncio.TimeoutError):
    external_api_calls.labels(provider="<name>", outcome="timeout").inc()
    raise
except Exception:
    external_api_calls.labels(provider="<name>", outcome="error").inc()
    raise
```

Apply the pattern to the primary outbound call site in each of:
- `backend/utils/elevenlabs.py` — provider="elevenlabs"
- Any file under `backend/utils/` that calls Anthropic (search for `anthropic` or `claude`) — provider="anthropic"
- `backend/utils/mem0_client.py` around the `self._memory.add(...)` and `self._memory.search(...)` calls — provider="mem0"

Use grep to locate:
```bash
grep -rn "elevenlabs\|anthropic\|mem0\.add\|mem0\.search\|Memory()\._" backend/utils/
```

- [ ] **Step 5.11: Wire `langgraph_node_duration` into `backend/graph.py`**

Add a decorator at the top of `graph.py` (or `backend/utils/metrics.py`) and wrap each node function registered in the graph. Decorator:

```python
import time
from functools import wraps

from backend.utils.metrics import langgraph_node_duration


def _time_node(node_name: str):
    def deco(fn):
        @wraps(fn)
        def wrapper(state, *args, **kwargs):
            story_type = state.get("story_type") or "unknown"
            start = time.perf_counter()
            try:
                return fn(state, *args, **kwargs)
            finally:
                langgraph_node_duration.labels(
                    node=node_name, story_type=story_type
                ).observe(time.perf_counter() - start)
        return wrapper
    return deco
```

Apply to each node registration. Example: if `graph.py` does `builder.add_node("generate_story", generate_story)`, change it to `builder.add_node("generate_story", _time_node("generate_story")(generate_story))`.

- [ ] **Step 5.12: Wire `story_generation_seconds` around end-to-end story generation**

In whichever route handler produces a story response end-to-end (`backend/routes/stories.py`), wrap the graph invocation:

```python
import time
from backend.utils.metrics import story_generation_seconds

start = time.perf_counter()
result = await graph.ainvoke(state)
story_generation_seconds.labels(
    story_type=state.get("story_type", "daily")
).observe(time.perf_counter() - start)
```

- [ ] **Step 5.13: Run the full backend test suite**

```bash
cd backend && uv run pytest tests/ -v
```
Expected: all tests pass. No pre-existing tests should break — instrumentation is additive.

- [ ] **Step 5.14: Commit instrumentation**

```bash
git add backend/
git commit -m "backend: record LangGraph node duration + external API call outcomes"
```

- [ ] **Step 5.15: Push and open PR**

```bash
git push -u origin feat/backend-prometheus-metrics
gh pr create --title "backend: Prometheus metrics (/metrics + custom counters)" --body "Phase 5 of observability rollout. Exposes /metrics with standard RED metrics and three custom series: royal_langgraph_node_duration_seconds, royal_external_api_calls_total, royal_story_generation_seconds. ServiceMonitor ships alongside."
```

Do NOT merge yet. Continue to Step 5.16 to include the ServiceMonitor in the gitops repo, then merge both together (or ServiceMonitor first — order doesn't matter).

- [ ] **Step 5.16: In gitops repo, create `apps/kube-prometheus-stack/base/servicemonitors/backend.yaml`**

```bash
cd /Users/quydoan/Projects/k8s/gitops-rackspace && git checkout main && git pull && git checkout -b feat/backend-servicemonitor
```

```yaml
# apps/kube-prometheus-stack/base/servicemonitors/backend.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: royal-dispatch-backend
  namespace: monitoring
spec:
  namespaceSelector:
    matchNames: [royal-dispatch]
  selector:
    matchLabels:
      app: royal-dispatch
      component: backend
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

Note: the existing `backend` Service in `apps/royal-dispatch/base/backend-service.yaml` must have a port named `http`. If it currently just has `port: 8000` without a name, add `name: http` to it in the same PR.

- [ ] **Step 5.17: Update `apps/kube-prometheus-stack/base/kustomization.yaml`**

Append `  - servicemonitors/backend.yaml` under resources.

- [ ] **Step 5.18: Commit, push, PR, merge (both PRs)**

```bash
git add apps/kube-prometheus-stack/base/servicemonitors/backend.yaml apps/kube-prometheus-stack/base/kustomization.yaml
# if backend-service.yaml needed a name: http change, include it too
git commit -m "add ServiceMonitor for royal-dispatch backend"
git push -u origin feat/backend-servicemonitor
gh pr create --title "add ServiceMonitor for royal-dispatch backend" --body "Pairs with the-royal-dispatch#<n> which adds /metrics."
```

Merge the backend PR (`the-royal-dispatch`) first, wait for image automation + Flux to roll out the new backend image with `/metrics`, then merge the ServiceMonitor PR.

- [ ] **Step 5.19: Verify**

```bash
kubectl -n royal-dispatch exec deploy/backend -- curl -s http://localhost:8000/metrics | grep -E "royal_|http_requests_total" | head -20
```
Expected: output shows `http_requests_total`, `royal_langgraph_node_duration_seconds_*`, `royal_external_api_calls_total`, `royal_story_generation_seconds_*`.

After hitting the `/story` endpoint from anywhere:
```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090 &
PF=$!; sleep 3
curl -s 'http://localhost:9090/api/v1/query?query=royal_external_api_calls_total' | jq '.data.result[] | {provider: .metric.provider, outcome: .metric.outcome, value: .value[1]}'
kill $PF
```
Expected: one or more series with non-zero values.

---

## Phase 6 — Loki

Repo: `gitops-rackspace`. Single-binary Loki with chunks in existing MinIO.

> **Post-execution corrections.** The Loki chart (6.55.0) turned out to be the sharpest-edged piece of this rollout — four follow-up PRs landed before Loki actually started scraping. Future replays should fold these inline and run `helm template grafana/loki --version 6.55.0 --values my-values.yaml` locally **before** pushing, not after watching the pod crashloop four times.
>
> - **SingleBinary validation (gitops PR [#13](https://github.com/RobDoan/gitops-rackspace/pull/13))**: chart's `validate.yaml` rejects the install if `read.replicas`, `write.replicas`, or `backend.replicas` are non-zero and `deploymentMode: SingleBinary` is set. Chart defaults are non-zero. Must explicitly zero all three — the YAML below does that.
> - **Bucket-init Job env var ordering (same PR)**: Kubernetes `$(VAR_NAME)` expansion in container env values only references vars declared **earlier** in the list. `MC_HOST_local=http://$(S3_ACCESS_KEY):$(S3_SECRET_KEY)@...` must come **after** the two `valueFrom: secretKeyRef` entries, not before them, or the placeholders go to `mc` literally and MinIO 401s.
> - **Compactor requires delete-request store (PR [#16](https://github.com/RobDoan/gitops-rackspace/pull/16))**: when `loki.compactor.retention_enabled: true`, Loki also requires `loki.compactor.delete_request_store: s3` (matching the schema's `object_store`). Otherwise the loki container aborts with `invalid compactor config: compactor.delete-request-store should be configured when retention is enabled`.
> - **Canary disable path (PR [#18](https://github.com/RobDoan/gitops-rackspace/pull/18))**: chart 6.x moved `lokiCanary` to top level; `monitoring.lokiCanary.enabled: false` is silently ignored in this version. Set `lokiCanary.enabled: false` at top level. `selfMonitoring` is still under `monitoring`.

- [ ] **Step 6.1: Generate MinIO credentials for Loki and store in Vault**

```bash
ROYAL_MC_POD=$(kubectl -n minio get pod -l app.kubernetes.io/name=minio -o jsonpath='{.items[0].metadata.name}')
LOKI_ACCESS_KEY=$(openssl rand -hex 12)
LOKI_SECRET_KEY=$(openssl rand -base64 30 | tr -d '=+/' | cut -c1-40)

# Use `mc` via the MinIO pod or an `mc` client to create the user. Exact command depends on your existing MinIO admin access.
# Example assuming mc alias is configured:
mc admin user add local "$LOKI_ACCESS_KEY" "$LOKI_SECRET_KEY"
mc admin policy create local loki-readwrite /dev/stdin <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:*"],
    "Resource": ["arn:aws:s3:::loki-chunks/*","arn:aws:s3:::loki-ruler/*","arn:aws:s3:::loki-admin/*","arn:aws:s3:::loki-chunks","arn:aws:s3:::loki-ruler","arn:aws:s3:::loki-admin"]
  }]
}
EOF
mc admin policy attach local loki-readwrite --user "$LOKI_ACCESS_KEY"

vault kv put secret/observability/loki-s3 access-key="$LOKI_ACCESS_KEY" secret-key="$LOKI_SECRET_KEY"
```

Verify:
```bash
vault kv get -format=json secret/observability/loki-s3 | jq '.data.data | keys'
```
Expected: `["access-key","secret-key"]`.

- [ ] **Step 6.2: Branch**

```bash
cd /Users/quydoan/Projects/k8s/gitops-rackspace && git checkout main && git pull && git checkout -b feat/loki
```

- [ ] **Step 6.3: Create `apps/loki/base/helmrepository.yaml`**

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: grafana
  namespace: flux-system
spec:
  interval: 1h
  url: https://grafana.github.io/helm-charts
```

(If the existing `apps/grafana/base/helmrepository.yaml` already declares a `grafana` HelmRepository in `flux-system`, skip this file — the same object would be duplicated. Check with: `kubectl -n flux-system get helmrepository grafana`.)

- [ ] **Step 6.4: Create `apps/loki/base/externalsecret-s3.yaml`**

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: loki-s3
  namespace: monitoring
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: loki-s3
    creationPolicy: Owner
  data:
    - secretKey: access-key
      remoteRef:
        key: observability/loki-s3
        property: access-key
    - secretKey: secret-key
      remoteRef:
        key: observability/loki-s3
        property: secret-key
```

- [ ] **Step 6.5: Create `apps/loki/base/minio-bucket-job.yaml`**

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: loki-bucket-init
  namespace: monitoring
spec:
  ttlSecondsAfterFinished: 3600
  backoffLimit: 3
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: mc
          image: minio/mc:RELEASE.2024-11-05T11-29-45Z
          env:
            # Order matters: K8s $(VAR_NAME) expansion only references vars
            # declared EARLIER in the list. MC_HOST_local must come after the
            # two valueFrom entries or mc gets "$(S3_ACCESS_KEY)" as the literal
            # password and MinIO 401s.
            - name: S3_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: loki-s3
                  key: access-key
            - name: S3_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: loki-s3
                  key: secret-key
            - name: MC_HOST_local
              value: "http://$(S3_ACCESS_KEY):$(S3_SECRET_KEY)@minio.minio.svc.cluster.local:9000"
          command:
            - sh
            - -c
            - |
              mc mb --ignore-existing local/loki-chunks
              mc mb --ignore-existing local/loki-ruler
              mc mb --ignore-existing local/loki-admin
```

- [ ] **Step 6.6: Create `apps/loki/base/helmrelease.yaml`**

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: loki
  namespace: monitoring
spec:
  interval: 30m
  timeout: 10m
  chart:
    spec:
      chart: loki
      version: 6.55.0
      sourceRef:
        kind: HelmRepository
        name: grafana
        namespace: flux-system
  install:
    remediation:
      retries: 3
  valuesFrom:
    - kind: Secret
      name: loki-s3
      valuesKey: access-key
      targetPath: loki.storage.s3.accessKeyId
    - kind: Secret
      name: loki-s3
      valuesKey: secret-key
      targetPath: loki.storage.s3.secretAccessKey
  values:
    deploymentMode: SingleBinary
    loki:
      auth_enabled: false
      commonConfig:
        replication_factor: 1
      schemaConfig:
        configs:
          - from: "2026-04-22"
            store: tsdb
            object_store: s3
            schema: v13
            index:
              prefix: loki_index_
              period: 24h
      storage:
        type: s3
        bucketNames:
          chunks: loki-chunks
          ruler: loki-ruler
          admin: loki-admin
        s3:
          endpoint: http://minio.minio.svc.cluster.local:9000
          region: us-east-1
          s3ForcePathStyle: true
          insecure: true
      limits_config:
        retention_period: 720h
      compactor:
        retention_enabled: true
        # Required when retention_enabled is true; must match schema object_store.
        delete_request_store: s3
    singleBinary:
      replicas: 1
      persistence:
        enabled: true
        size: 10Gi
        storageClass: local-path
      resources:
        requests:
          cpu: 100m
          memory: 256Mi
        limits:
          memory: 512Mi
    # SingleBinary mode — chart validate.yaml rejects the install unless the
    # SimpleScalable components are explicitly zeroed (they default non-zero).
    read:
      replicas: 0
    write:
      replicas: 0
    backend:
      replicas: 0
    minio:
      enabled: false
    chunksCache:
      enabled: false
    resultsCache:
      enabled: false
    gateway:
      enabled: false
    # Chart 6.x: lokiCanary lives at top level. The monitoring.lokiCanary path
    # is a no-op in this version.
    lokiCanary:
      enabled: false
    monitoring:
      selfMonitoring:
        enabled: false
        grafanaAgent:
          installOperator: false
    test:
      enabled: false
    serviceMonitor:
      enabled: true
      labels:
        release: kube-prometheus-stack
```

- [ ] **Step 6.7: Create `apps/loki/base/kustomization.yaml`**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - helmrepository.yaml        # delete this line if grafana HelmRepo already exists
  - externalsecret-s3.yaml
  - minio-bucket-job.yaml
  - helmrelease.yaml
```

- [ ] **Step 6.8: Create `apps/loki/overlays/homelander/kustomization.yaml`**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
```

- [ ] **Step 6.9: Create `clusters/homelander/loki.yaml`**

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: loki
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./apps/loki/overlays/homelander
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: kube-prometheus-stack
    - name: minio
    - name: eso-store
  healthChecks:
    - apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      name: loki
      namespace: monitoring
```

- [ ] **Step 6.10: Append `- loki.yaml` to `clusters/homelander/kustomization.yaml`**

- [ ] **Step 6.11: Commit, push, PR, merge**

```bash
git add apps/loki clusters/homelander/loki.yaml clusters/homelander/kustomization.yaml
git commit -m "add loki 6.55.0 in SingleBinary mode with MinIO chunks"
git push -u origin feat/loki
gh pr create --title "add Loki 6.55.0 (SingleBinary + MinIO)" --body "Logs backend for homelander. Chunks stored in existing MinIO (bucket creation via one-shot Job)."
```

- [ ] **Step 6.12: Flux reconcile + verify**

```bash
flux reconcile kustomization loki --with-source
kubectl -n monitoring get pods -l app.kubernetes.io/name=loki
```
Expected: `loki-0` Running 1/1.

- [ ] **Step 6.13: Verify buckets exist in MinIO**

```bash
mc ls local/ | grep loki
```
Expected: `loki-chunks`, `loki-ruler`, `loki-admin` listed.

- [ ] **Step 6.14: Verify Loki accepts a push**

```bash
kubectl -n monitoring port-forward svc/loki 3100 &
PF=$!; sleep 3
NOW_NS=$(date +%s%N)
curl -s -H "Content-Type: application/json" -XPOST http://localhost:3100/loki/api/v1/push \
  --data "{\"streams\":[{\"stream\":{\"namespace\":\"test\",\"app\":\"manual\"},\"values\":[[\"$NOW_NS\",\"hello from verification\"]]}]}"
echo
curl -s "http://localhost:3100/loki/api/v1/query_range?query=%7Bnamespace%3D%22test%22%7D&start=$((NOW_NS-60000000000))&end=$((NOW_NS+60000000000))" | jq '.data.result[0].values'
kill $PF
```
Expected: second curl returns `[[timestamp, "hello from verification"]]`.

---

## Phase 7 — Alloy

Repo: `gitops-rackspace`. Ships pod logs to Loki.

- [ ] **Step 7.1: Branch**

```bash
cd /Users/quydoan/Projects/k8s/gitops-rackspace && git checkout main && git pull && git checkout -b feat/alloy
```

- [ ] **Step 7.2: Create `apps/alloy/base/helmrelease.yaml`**

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: alloy
  namespace: monitoring
spec:
  interval: 30m
  timeout: 5m
  chart:
    spec:
      chart: alloy
      version: 1.7.0
      sourceRef:
        kind: HelmRepository
        name: grafana
        namespace: flux-system
  install:
    remediation:
      retries: 3
  values:
    alloy:
      configMap:
        create: true
        content: |
          discovery.kubernetes "pod" {
            role = "pod"
            selectors {
              role  = "pod"
              field = "spec.nodeName=" + sys.env("HOSTNAME")
            }
          }
          discovery.relabel "pod_logs" {
            targets = discovery.kubernetes.pod.targets
            rule {
              source_labels = ["__meta_kubernetes_namespace"]
              target_label  = "namespace"
            }
            rule {
              source_labels = ["__meta_kubernetes_pod_name"]
              target_label  = "pod"
            }
            rule {
              source_labels = ["__meta_kubernetes_pod_container_name"]
              target_label  = "container"
            }
            rule {
              source_labels = ["__meta_kubernetes_pod_label_app"]
              target_label  = "app"
            }
            rule {
              source_labels = ["__meta_kubernetes_namespace","__meta_kubernetes_pod_container_name"]
              separator     = "/"
              target_label  = "job"
            }
            rule {
              source_labels = ["__meta_kubernetes_pod_uid","__meta_kubernetes_pod_container_name"]
              separator     = "/"
              action        = "replace"
              replacement   = "/var/log/pods/*$1/*.log"
              target_label  = "__path__"
            }
          }
          loki.source.kubernetes "pod_logs" {
            targets    = discovery.relabel.pod_logs.output
            forward_to = [loki.write.default.receiver]
          }
          loki.write "default" {
            endpoint {
              url = "http://loki.monitoring.svc.cluster.local:3100/loki/api/v1/push"
            }
          }
      clustering:
        enabled: false
      resources:
        requests:
          cpu: 50m
          memory: 128Mi
        limits:
          memory: 256Mi
    controller:
      type: daemonset
    mounts:
      varlog: true
    serviceMonitor:
      enabled: true
      additionalLabels:
        release: kube-prometheus-stack
```

- [ ] **Step 7.3: Create `apps/alloy/base/kustomization.yaml`**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - helmrelease.yaml
```

- [ ] **Step 7.4: Create `apps/alloy/overlays/homelander/kustomization.yaml`**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
```

- [ ] **Step 7.5: Create `clusters/homelander/alloy.yaml`**

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: alloy
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./apps/alloy/overlays/homelander
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: loki
  healthChecks:
    - apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      name: alloy
      namespace: monitoring
```

- [ ] **Step 7.6: Append `- alloy.yaml` to `clusters/homelander/kustomization.yaml`**

- [ ] **Step 7.7: Commit, push, PR, merge**

```bash
git add apps/alloy clusters/homelander/alloy.yaml clusters/homelander/kustomization.yaml
git commit -m "add alloy 1.7.0 DaemonSet for pod log collection"
git push -u origin feat/alloy
gh pr create --title "add Alloy 1.7.0 log collector" --body "DaemonSet ships /var/log/pods to Loki with Prometheus-compatible labels (namespace, pod, container, app, job)."
```

- [ ] **Step 7.8: Flux reconcile + verify**

```bash
flux reconcile kustomization alloy --with-source
kubectl -n monitoring get ds alloy
```
Expected: `DESIRED == READY` (equal to node count).

- [ ] **Step 7.9: Verify logs flow to Loki**

```bash
kubectl -n monitoring port-forward svc/loki 3100 &
PF=$!; sleep 3
NOW_NS=$(date +%s%N)
curl -s "http://localhost:3100/loki/api/v1/query_range?query=%7Bnamespace%3D%22royal-dispatch%22%7D&start=$((NOW_NS-300000000000))&end=$NOW_NS&limit=5" | jq '.data.result | length'
kill $PF
```
Expected: a positive integer (number of log streams).

---

## Phase 8 — Grafana data sources + dashboards

Repo: `gitops-rackspace`. Patches the existing Grafana HelmRelease.

- [ ] **Step 8.1: Branch**

```bash
cd /Users/quydoan/Projects/k8s/gitops-rackspace && git checkout main && git pull && git checkout -b feat/grafana-observability-datasources
```

- [ ] **Step 8.2: Modify `apps/grafana/base/helmrelease.yaml`**

Merge the following into the existing `values:` block. Do NOT touch keys already present; add these new keys at the same indentation level as `persistence`, `admin`, etc.

```yaml
    additionalDataSources:
      - name: Prometheus
        type: prometheus
        access: proxy
        url: http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090
        isDefault: true
        editable: false
      - name: Loki
        type: loki
        access: proxy
        url: http://loki.monitoring.svc.cluster.local:3100
        editable: false
    dashboardProviders:
      dashboardproviders.yaml:
        apiVersion: 1
        providers:
          - name: default
            orgId: 1
            folder: ""
            type: file
            disableDeletion: false
            editable: true
            options:
              path: /var/lib/grafana/dashboards/default
    dashboards:
      default:
        k8s-cluster:
          gnetId: 315
          revision: 3
          datasource: Prometheus
        node-exporter:
          gnetId: 1860
          revision: 37
          datasource: Prometheus
        kube-state:
          gnetId: 13332
          revision: 12
          datasource: Prometheus
        ingress-nginx:
          gnetId: 9614
          revision: 1
          datasource: Prometheus
        postgres-exporter:
          gnetId: 9628
          revision: 7
          datasource: Prometheus
        loki-logs:
          gnetId: 13639
          revision: 2
          datasource: Loki
    dashboardsConfigMaps:
      default: grafana-royal-dispatch-dashboard
```

- [ ] **Step 8.3: Create `apps/grafana/base/dashboards/royal-dispatch.json`**

A minimal dashboard with six panels. Paste this exactly:

```json
{
  "annotations": {"list": []},
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 0,
  "panels": [
    {
      "datasource": {"type": "prometheus", "uid": "Prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
      "id": 1,
      "targets": [{
        "expr": "sum by (handler) (rate(http_requests_total{job=\"royal-dispatch-backend\"}[5m]))",
        "legendFormat": "{{handler}}",
        "refId": "A"
      }],
      "title": "Backend request rate by handler",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "Prometheus"},
      "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
      "id": 2,
      "targets": [{
        "expr": "histogram_quantile(0.95, sum by (le, handler) (rate(http_request_duration_seconds_bucket{job=\"royal-dispatch-backend\"}[5m])))",
        "legendFormat": "p95 {{handler}}",
        "refId": "A"
      }],
      "title": "Backend p95 latency by handler",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "Prometheus"},
      "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8},
      "id": 3,
      "targets": [{
        "expr": "histogram_quantile(0.95, sum by (le, node) (rate(royal_langgraph_node_duration_seconds_bucket[5m])))",
        "legendFormat": "p95 {{node}}",
        "refId": "A"
      }],
      "title": "LangGraph node p95 duration",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "Prometheus"},
      "fieldConfig": {"defaults": {"unit": "short"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8},
      "id": 4,
      "targets": [{
        "expr": "sum by (provider, outcome) (rate(royal_external_api_calls_total[5m]))",
        "legendFormat": "{{provider}} / {{outcome}}",
        "refId": "A"
      }],
      "title": "External API calls by provider / outcome",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "Prometheus"},
      "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 16},
      "id": 5,
      "targets": [{
        "expr": "histogram_quantile(0.95, sum by (le, story_type) (rate(royal_story_generation_seconds_bucket[5m])))",
        "legendFormat": "p95 {{story_type}}",
        "refId": "A"
      }],
      "title": "Story generation p95 by type",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "loki", "uid": "Loki"},
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 16},
      "id": 6,
      "targets": [{
        "expr": "{namespace=\"royal-dispatch\"} |~ \"(?i)error|exception|traceback\"",
        "refId": "A"
      }],
      "title": "Royal Dispatch error logs",
      "type": "logs"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 39,
  "tags": ["royal-dispatch"],
  "templating": {"list": []},
  "time": {"from": "now-1h", "to": "now"},
  "timepicker": {},
  "timezone": "browser",
  "title": "Royal Dispatch",
  "uid": "royal-dispatch-overview",
  "version": 1,
  "weekStart": ""
}
```

- [ ] **Step 8.4: Modify `apps/grafana/base/kustomization.yaml`**

Add a `configMapGenerator` block so the dashboard JSON becomes a ConfigMap the chart can mount. Final file:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - helmrepository.yaml
  - helmrelease.yaml
  - externalsecret.yaml
  - ingress.yaml
namespace: grafana
configMapGenerator:
  - name: grafana-royal-dispatch-dashboard
    files:
      - royal-dispatch.json=dashboards/royal-dispatch.json
    options:
      labels:
        grafana_dashboard: "1"
    behavior: create
generatorOptions:
  disableNameSuffixHash: true
```

Note: the grafana Helm chart's sidecar watches for ConfigMaps labeled `grafana_dashboard=1`. The label on the generator ensures the dashboard is picked up automatically. The `dashboardsConfigMaps.default` value in step 8.2 is belt-and-braces for older chart versions.

- [ ] **Step 8.5: Commit, push, PR, merge**

```bash
git add apps/grafana
git commit -m "grafana: add Prometheus + Loki data sources and Royal Dispatch dashboard"
git push -u origin feat/grafana-observability-datasources
gh pr create --title "grafana: wire Prometheus + Loki data sources" --body "Adds data sources, community dashboards (k8s cluster, node-exporter, kube-state, ingress-nginx, postgres, Loki logs), and a custom Royal Dispatch dashboard."
```

- [ ] **Step 8.6: Flux reconcile + verify**

```bash
flux reconcile kustomization grafana --with-source
kubectl -n grafana get cm grafana-royal-dispatch-dashboard
```
Expected: ConfigMap exists with label `grafana_dashboard=1`.

- [ ] **Step 8.7: Smoke-test Grafana UI**

Open Grafana in a browser (the existing ingress URL for the `grafana` HelmRelease). Log in. Go to **Connections → Data sources**. Expected: Prometheus and Loki both present, each with a green health check when you click "Save & test". Navigate to **Dashboards**; expect the community dashboards and "Royal Dispatch" to appear and render non-empty panels.

---

## Phase 9 — PrometheusRule CRs

Repo: `gitops-rackspace`. Ships the day-one alert rules.

- [ ] **Step 9.1: Branch**

```bash
cd /Users/quydoan/Projects/k8s/gitops-rackspace && git checkout main && git pull && git checkout -b feat/prometheus-rules
```

- [ ] **Step 9.2: Create `apps/kube-prometheus-stack/base/prometheusrules/infra.yaml`**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: infra
  namespace: monitoring
spec:
  groups:
    - name: infra.node
      rules:
        - alert: KubeNodeNotReady
          expr: kube_node_status_condition{condition="Ready",status="true"} == 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Node {{ $labels.node }} is NotReady"
            description: |
              Node {{ $labels.node }} has reported Ready=false for >5m.
              Investigation: kubectl describe node {{ $labels.node }}; check kubelet logs.
        - alert: NodeMemoryHigh
          expr: (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) > 0.9
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Node {{ $labels.instance }} memory utilization > 90%"
            description: |
              Instance {{ $labels.instance }} has used >90% of memory for 10m.
              Likely cause: a workload exceeded its memory request without a limit. Check
              `kubectl top pods --all-namespaces | sort -k4 -h | tail -20`.
        - alert: NodeDiskAlmostFull
          expr: node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"} < 0.1
          for: 10m
          labels:
            severity: critical
          annotations:
            summary: "Node {{ $labels.instance }} filesystem {{ $labels.mountpoint }} <10% free"
            description: |
              Less than 10% free on {{ $labels.mountpoint }} ({{ $labels.device }}).
              Run: du -h -d1 / on the node, or check PV/PVC consumption with
              `kubectl get pvc -A --sort-by=.status.capacity.storage`.
    - name: infra.pod
      rules:
        - alert: KubePodCrashLooping
          expr: rate(kube_pod_container_status_restarts_total[5m]) > 0
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} is crashlooping"
            description: |
              Container {{ $labels.container }} has restarted consistently for 15m.
              Read logs: kubectl -n {{ $labels.namespace }} logs {{ $labels.pod }} -c {{ $labels.container }} --previous
              Likely source file for royal-dispatch backend: backend/main.py or backend/routes/.
        - alert: KubePodNotReady
          expr: sum by (namespace, pod) (kube_pod_status_ready{condition="false"}) == 1
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} not Ready for >15m"
            description: |
              Pod has been NotReady for >15m. Likely causes: readiness probe failure,
              image pull error, PVC not bound. Check: kubectl -n {{ $labels.namespace }} describe pod {{ $labels.pod }}.
```

- [ ] **Step 9.3: Create `apps/kube-prometheus-stack/base/prometheusrules/ingress.yaml`**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: ingress
  namespace: monitoring
spec:
  groups:
    - name: ingress.nginx
      rules:
        - alert: IngressNginx5xxRateHigh
          expr: |
            sum(rate(nginx_ingress_controller_requests{status=~"5.."}[5m]))
            / sum(rate(nginx_ingress_controller_requests[5m])) > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Ingress 5xx rate > 5% for 5m"
            description: |
              nginx-ingress is returning 5xx for more than 5% of requests.
              Likely source: one of the upstreams. Cross-reference pod logs in Loki:
              {namespace=~"royal-dispatch|n8n|grafana"} |~ "(?i)error|500|502|503|504".
    - name: ingress.certs
      rules:
        - alert: CertManagerCertExpiringSoon
          expr: (certmanager_certificate_expiration_timestamp_seconds - time()) < 14 * 24 * 3600
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Certificate {{ $labels.name }} expires in <14 days"
            description: |
              Certificate {{ $labels.namespace }}/{{ $labels.name }} expires at
              {{ $value | humanizeTimestamp }}. cert-manager should auto-renew; if this
              alert keeps firing, check: kubectl -n {{ $labels.namespace }} describe certificate {{ $labels.name }}.
```

- [ ] **Step 9.4: Create `apps/kube-prometheus-stack/base/prometheusrules/app.yaml`**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: app
  namespace: monitoring
spec:
  groups:
    - name: app.postgres
      rules:
        - alert: PostgresDown
          expr: pg_up == 0
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Postgres is DOWN"
            description: |
              prometheus-postgres-exporter reports pg_up=0. The postgres-postgresql-0 pod may be
              OOMKilled, unschedulable, or the exporter cannot connect. Check:
              kubectl -n postgres get pod postgres-postgresql-0
              kubectl -n postgres logs postgres-postgresql-0 --tail=50
    - name: app.backend
      rules:
        - alert: BackendHighLatencyP95
          expr: |
            histogram_quantile(0.95,
              sum by (le, handler) (
                rate(http_request_duration_seconds_bucket{job="royal-dispatch-backend",handler="/story"}[5m])
              )
            ) > 2
          for: 10m
          labels:
            severity: warning
            service: backend
          annotations:
            summary: "Backend /story p95 latency > 2s for 10m"
            description: |
              p95 latency on POST /story has been above 2s for 10m.
              Likely source files: backend/graph.py (LangGraph pipeline),
              backend/nodes/generate_story.py, backend/utils/elevenlabs.py.
              Correlate with: histogram_quantile(0.95, sum by (le, node) (rate(royal_langgraph_node_duration_seconds_bucket[5m]))).
              Check pod logs: {namespace="royal-dispatch", pod=~"backend-.*"}.
        - alert: BackendExternalApiErrors
          expr: sum by (provider) (rate(royal_external_api_calls_total{outcome="error"}[10m])) > 0.1
          for: 10m
          labels:
            severity: warning
            service: backend
          annotations:
            summary: "Backend external API {{ $labels.provider }} error rate > 0.1/s"
            description: |
              royal_external_api_calls_total{provider="{{ $labels.provider }}",outcome="error"} is
              elevated. Likely source file: backend/utils/{{ $labels.provider }}_client.py
              (or backend/utils/mem0_client.py for mem0). Cross-reference logs:
              {namespace="royal-dispatch", pod=~"backend-.*"} |~ "(?i){{ $labels.provider }}".
```

- [ ] **Step 9.5: Update `apps/kube-prometheus-stack/base/kustomization.yaml`**

Append:

```yaml
  - prometheusrules/infra.yaml
  - prometheusrules/ingress.yaml
  - prometheusrules/app.yaml
```

- [ ] **Step 9.6: Commit, push, PR, merge**

```bash
git add apps/kube-prometheus-stack/base/prometheusrules apps/kube-prometheus-stack/base/kustomization.yaml
git commit -m "add day-one PrometheusRule alerts (infra, ingress, app)"
git push -u origin feat/prometheus-rules
gh pr create --title "add day-one PrometheusRule alerts" --body "Ten alerts covering node, pod, ingress, cert-manager, Postgres, and backend SLOs. Every rule carries structured summary + description annotations naming likely source files and correlation queries — pre-wired for future AI-agent remediation consumption."
```

- [ ] **Step 9.7: Flux reconcile**

```bash
flux reconcile kustomization kube-prometheus-stack --with-source
```

- [ ] **Step 9.8: Verify rules loaded in Prometheus**

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090 &
PF=$!; sleep 3
curl -s 'http://localhost:9090/api/v1/rules' | jq '.data.groups[].rules[] | select(.type=="alerting") | .name' | sort -u
kill $PF
```
Expected: all ten alert names listed (`KubeNodeNotReady`, `NodeMemoryHigh`, `NodeDiskAlmostFull`, `KubePodCrashLooping`, `KubePodNotReady`, `IngressNginx5xxRateHigh`, `CertManagerCertExpiringSoon`, `PostgresDown`, `BackendHighLatencyP95`, `BackendExternalApiErrors`).

- [ ] **Step 9.9: Force-fire one alert end-to-end to validate Slack routing**

Temporarily lower the `BackendHighLatencyP95` threshold to force a fire. Edit `apps/kube-prometheus-stack/base/prometheusrules/app.yaml` locally, change `> 2` to `> 0`. Push to a `chore/test-alert` branch, merge, wait ~10 minutes (since `for: 10m`), confirm Slack `#alerts` receives the alert. Then revert:

```bash
git checkout main && git pull && git checkout -b chore/revert-test-threshold
# edit app.yaml back to > 2
git add apps/kube-prometheus-stack/base/prometheusrules/app.yaml
git commit -m "revert: restore BackendHighLatencyP95 threshold"
git push -u origin chore/revert-test-threshold
gh pr create --title "revert test threshold" --body "Reverts Phase 9 verification change."
```

(Alternative that doesn't round-trip git: apply an inline `PrometheusRule` that always fires, same pattern as Step 2.18, then delete it.)

---

## Final Verification Checklist

Run after all 9 phases are merged:

- [ ] `kubectl get crd | grep monitoring.coreos.com | wc -l` returns `10`.
- [ ] `kubectl -n monitoring get pods` shows Prometheus, Alertmanager, Loki, Alloy DaemonSet, node-exporter DaemonSet, kube-state-metrics all Running.
- [ ] Prometheus `/targets` shows UP for: backend, postgres-exporter, minio, qdrant, n8n, ingress-nginx, kubelet, node-exporter, kube-state-metrics, loki, alloy.
- [ ] Grafana data source health: Prometheus green, Loki green.
- [ ] Royal Dispatch dashboard renders non-empty panels (hit `/story` once if panels look empty).
- [ ] `logcli query '{namespace="royal-dispatch"}' --limit=5` (or Grafana Explore) returns recent lines.
- [ ] A force-fired test alert has landed in Slack `#alerts` and resolved cleanly.

---

## Rollback

If a phase breaks the cluster, revert its PR (`gh pr revert <number>` or a manual revert PR) and run `flux reconcile source git flux-system`. Phases 1, 4, 5, 8, 9 are pure additive and cheap to revert. Phases 2, 3, 6, 7 create persistent volumes — reverting the PR leaves the PVs orphaned (they prune on next reconcile because `prune: true` is set on the Flux Kustomization). If Prometheus or Loki data loss is acceptable that's fine; if not, back up the PV before reverting.

---

## Self-Review Notes

All nine spec phases have corresponding implementation phases (1→1, 2→2, ..., 9→9). Every file in the spec's "GitOps layout" section appears in the File Map. No placeholders. No "implement later". Type/name consistency checked:

- `app.kubernetes.io/name: minio`, `qdrant`, `n8n` — these selectors may need adjusting per the note in each step if your existing chart values use different labels; the step explicitly calls this out.
- `royal-dispatch-backend` job name is consistent across backend ServiceMonitor, dashboard, and alert rules.
- `postgres_exporter` DB user name is consistent across migration, Vault key, ExternalSecret, HelmRelease values.
- `loki-chunks`, `loki-ruler`, `loki-admin` bucket names consistent across bucket-init Job, Loki values, and MinIO policy.

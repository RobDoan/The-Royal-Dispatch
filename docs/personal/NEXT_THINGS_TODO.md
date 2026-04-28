# Next things to do

Open items left from the observability rollout. Ordered by how much they'll bite if ignored. Each entry has a one-line priority, what's wrong now, the concrete fix, and a rough effort estimate.

## 1. Silence the k3s phantom "Down" alerts

**Priority**: High — these fire into `#alerts-critical` every 4 hours until silenced.

**Problem**: The kube-prometheus-stack chart ships default scrape jobs for `kube-controller-manager`, `kube-scheduler`, and `kube-proxy` on the assumption of a standard kubeadm topology. k3s bundles all three components into its single binary — they don't expose separate `/metrics` endpoints. So the scrape jobs fail forever and three alerts fire permanently:

- `KubeControllerManagerDown`
- `KubeSchedulerDown`
- `KubeProxyDown`

Verified with `kubectl -n monitoring exec prometheus-0 -c prometheus -- wget -qO- http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'`.

**Fix**: One PR to `gitops-rackspace`. In `apps/kube-prometheus-stack/base/helmrelease.yaml`, under `spec.values:`, add:

```yaml
kubeControllerManager:
  enabled: false
kubeScheduler:
  enabled: false
kubeProxy:
  enabled: false
```

Disables both the scrape jobs and the associated alert rules. Reconcile afterwards:

```bash
flux reconcile kustomization kube-prometheus-stack --with-source
```

**Effort**: ~5 minutes. No prerequisites.

**Verification**: After reconcile, `kubectl -n monitoring exec prometheus-kube-prometheus-stack-prometheus-0 -c prometheus -- wget -qO- http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | select(.name=="KubeControllerManagerDown" or .name=="KubeSchedulerDown" or .name=="KubeProxyDown") | .name'` should return empty.

## 2. Back-fill plan spec post-execution corrections for Phases 7, 8, 9

**Priority**: Medium — affects replay, not running system.

**Problem**: The [implementation plan](./superpowers/plans/2026-04-22-prometheus-monitoring.md) was corrected inline for Phases 2, 3, 4, 6 (each has a "Post-execution corrections" callout + fixed YAML). Phases 7, 8, 9 haven't been updated yet. Anyone replaying the plan from scratch will hit all 8 defects from those three phases again.

**What needs correcting**:

- **Phase 7 (Alloy)** — four corrections:
  1. `mounts.varlog` must live under `alloy:`, not root of `values:` (chart key path).
  2. `alloy.extraEnv` should add a `NODE_NAME` downward-API env var for clarity (chart does set `HOSTNAME` from `spec.nodeName` automatically, but explicit is better).
  3. Use `loki.source.file`, not `loki.source.kubernetes` — the latter hits K8s API client-side throttling at 5 QPS and fails silently for most containers.
  4. Path construction for `__path__`: build `/var/log/pods/<ns>_<pod>_<uid>/<container>/*.log` from three labels via `__tmp_pod_dir`, not the Promtail-era `*<uid>` glob trick.
  5. Insert `local.file_match` between `discovery.relabel` and `loki.source.file` — the file source doesn't expand globs on its own.

- **Phase 8 (Grafana)** — two corrections:
  1. `additionalDataSources` does not exist in chart 7.3.12; use `datasources:` with nested `datasources.yaml:` block.
  2. `sidecar.dashboards.enabled: true` must be set explicitly (default is `false`), and each data source needs an explicit `uid:` so dashboard references resolve.
  3. Kustomization `namespace:` should NOT be at the top level (rewrites the `HelmRepository` out of `flux-system`). Set `namespace:` on the `configMapGenerator` entry itself instead.
  4. Drop `dashboardsConfigMaps` — redundant with the sidecar.

- **Phase 9 (PrometheusRules)** — two corrections:
  1. Path: `apps/kube-prometheus-stack-config/base/prometheusrules/` (not `apps/kube-prometheus-stack/base/...`). All CRs that reference monitoring.coreos.com CRDs live in the downstream Kustomization.
  2. Backend alert expression uses `job="backend"`, not `job="royal-dispatch-backend"` — Prometheus names the scrape job after the Service, not the ServiceMonitor.

**Fix**: Follow the same pattern as Phase 2/3/4/6 corrections in the plan file:

1. Add a `> **Post-execution corrections.**` callout immediately under each phase header (links to the PRs: Phase 7 → #20, #21, #22; Phase 8 → #23, #24; Phase 9 → #25 — though #25 had zero post-merge fixes, so Phase 9 only needs a "corrected vs plan" note).
2. Fix the inline YAML in each phase's steps to reflect the final working config.
3. Single commit on `main`: `plan: document Phase 7/8/9 post-execution corrections`.

**Effort**: ~20–30 minutes of editing plus a sanity `diff`.

**Verification**: `grep -A3 "Post-execution corrections" docs/superpowers/plans/2026-04-22-prometheus-monitoring.md` should show callouts for Phases 2, 3, 4, 6, 7, 8, 9.

## 3. Push local `main` to origin

**Priority**: Low-medium — harmless to leave unpushed, but invisible to anyone else.

**Problem**: `the-royal-dispatch` local `main` is ahead of `origin/main` by four plan-spec correction commits from this rollout:

```
379f876 plan: split Slack webhooks for default vs critical channels       (Phase 2)
8ee9b28 plan: document Phase 2 post-execution corrections
d2058e6 plan: document Phase 3 post-execution corrections
23d0ca7 plan: document Phase 4 post-execution corrections
bd7713f plan: document Phase 6 post-execution corrections
```

Plus whatever lands from [item #2](#2-back-fill-plan-spec-post-execution-corrections-for-phases-7-8-9) above.

Confirm with:

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
git log origin/main..main --oneline
```

**Fix**:

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
git checkout main
git pull --rebase   # picks up any remote changes since we last fetched
git log origin/main..main --oneline   # sanity check what's about to go up
git push
```

**Effort**: ~2 minutes once you've decided. Do this AFTER item #2 so both land together.

## 4. Write the Phase 9 blog post

**Priority**: Low if you just want the rollout working; medium if you value the blog series continuity.

**Problem**: Every prior phase has a blog post. Phase 9 doesn't. At the end of the [Phase 8 post](./blogs/2026-04-24-grafana-phase-8-the-kustomize-shaped-hole.md) I wrote:

> Phase 9 is the last implementation phase… It's an interesting test for the habit stack because it's almost entirely Layer 3 + Layer 4 work. If I run `kubectl kustomize` before pushing and tail Alertmanager after merging, the scorecard should look tight. Whether it does is what the Phase 9 post will report.

Phase 9 landed with **zero post-merge fixes**. The habit-stack thesis from Phases 6/7/8 held. The post needs writing to close that loop — otherwise the Phase 8 "if I do X, the scorecard should look tight" is an unresolved prediction.

**Fix**: Write `docs/blogs/2026-04-24-prometheusrules-phase-9-<slug>.md` following the same voice as Phases 6/7/8:

- Opening: reference Phase 8's prediction.
- "What I wanted to build" — 10 alerts, structured annotations for future AI-agent remediation.
- Pre-push verification: the `kubectl kustomize` render confirming all 8 resources in `monitoring`, `job="backend"` (not `royal-dispatch-backend`) in the alert expression, no stray resources.
- What happened post-merge: literally nothing broke. That's the content.
- Scoreboard: the layer table again, with a "Phase 9 caught at this layer" column showing pre-push catches.
- Meta-reflection: for purely-Kustomize + PromQL work on an existing CRD, the habit stack from Phases 6/7/8 is load-bearing. `helm template` wasn't relevant; DSL docs weren't relevant; `kubectl kustomize` was the one that mattered.
- Close the arc: the rollout as a whole — 9 phases, 18 PRs, 4 retrospective blogs — and what next-phase observability looks like (external dead-man's-switch, cert-manager metrics, alert-driven remediation agent).

**Effort**: ~45 minutes to an hour to write well. Shorter than Phase 6/7 because less went wrong.

## 5. External dead-man's-switch for Watchdog

**Priority**: Low — monitoring-of-monitoring. Doesn't matter until something production-critical runs here.

**Problem**: The kube-prometheus-stack chart's `Watchdog` alert always fires as a heartbeat. Its real value is as a dead-man's-switch: an **external** service expects the heartbeat and pages you when it stops. Without that external hop, Watchdog is just silent noise — we route it to the `null` receiver.

If Prometheus or Alertmanager dies, Slack gets quiet (because the dead services can't post). Without an external dead-man's-switch, you won't notice the silence until you actively look.

**Fix**: Pick one:

- **Dead Man's Snitch** ([free tier](https://deadmanssnitch.com), 1 monitor). Creates a unique URL; pings more often than every 15 minutes stay silent, anything longer pages.
- **healthchecks.io** ([free tier](https://healthchecks.io), 20 monitors). Cron-style schedules with grace periods.

Once you have a snitch URL, update `apps/kube-prometheus-stack-config/base/alertmanager-config.yaml`. Change the Watchdog route from `null` to a new `webhookConfigs` receiver pointing at the snitch URL (webhook URL stored in Vault, synced via a new key in the existing `alertmanager-slack` ExternalSecret).

**Effort**: ~30 minutes including account setup. No prerequisites.

**Verification**: External service's UI should show "received heartbeat" every `repeatInterval` (4h in our config, though you'd likely lower it to 1h or less). Simulated outage: `flux suspend helmrelease -n monitoring kube-prometheus-stack`, wait, external service should alert within the configured grace period; then `flux resume`.

## 6. Scrape cert-manager metrics

**Priority**: Low — `CertManagerCertExpiringSoon` alert is inert today; cert-manager does auto-renew, so manual discovery would also work.

**Problem**: In Phase 9 we shipped an alert for `certmanager_certificate_expiration_timestamp_seconds` expiring within 14 days, but cert-manager isn't being scraped. The alert is loaded (0 series → evaluates to `vector()` → never fires). cert-manager does auto-renew via ACME, so the alert would only fire if auto-renewal itself was broken.

**Fix**: One PR to `gitops-rackspace`. cert-manager exposes metrics on port 9402 by default. Add a `ServiceMonitor` in `apps/kube-prometheus-stack-config/base/servicemonitors/cert-manager.yaml`:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: cert-manager
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  namespaceSelector:
    matchNames: [cert-manager]
  selector:
    matchLabels:
      app.kubernetes.io/name: cert-manager
      app.kubernetes.io/component: controller
  endpoints:
    - port: tcp-prometheus-servicemonitor   # verify port name with: kubectl -n cert-manager get svc
      path: /metrics
      interval: 30s
```

Append `- servicemonitors/cert-manager.yaml` to `apps/kube-prometheus-stack-config/base/kustomization.yaml`.

**Effort**: ~15 minutes including port-name verification against the live cert-manager Service.

**Verification**: After reconcile, Prometheus target `cert-manager` should be UP, and `certmanager_certificate_expiration_timestamp_seconds` should have one series per managed certificate.

## 7. [Optional] Move admin password reset to a documented, reproducible step

**Priority**: Low — solved for now by the runbook recipe, but prone to drift.

**Problem**: Grafana's admin password in the `grafana-secrets` K8s Secret doesn't match the hash in Grafana's internal DB (the DB was bootstrapped with an earlier value, and Grafana doesn't re-sync on `GF_SECURITY_ADMIN_PASSWORD` after first init). The [runbook](./observability-runbook.md#2-grafana) documents the `grafana-cli admin reset-admin-password` recipe, but nothing enforces that the Secret IS the source of truth.

**Fix (option A, simplest)**: Live with the drift. Runbook tells anyone who needs to reset it how.

**Fix (option B, proper)**: Add a Kubernetes `Job` to the Grafana Kustomization that runs `grafana-cli admin reset-admin-password $(GF_SECURITY_ADMIN_PASSWORD)` against the running Grafana Pod on every Flux reconcile. Mounts the same Secret. Idempotent. Ensures the Secret is authoritative.

**Effort**: Option A: 0 minutes. Option B: ~30 minutes + a decision about whether you want every GitOps reconcile to overwrite manual password changes made via the UI.

## Summary

| # | Item | Priority | Effort | Status |
|---|---|---|---|---|
| 1 | Silence k3s phantom alerts | High | 5 min | **Do soon** — Slack noise |
| 2 | Plan spec: back-fill Phase 7/8/9 corrections | Medium | 20–30 min | **Recommended** |
| 3 | Push local `main` | Low–Med | 2 min | After #2 |
| 4 | Phase 9 blog post | Low–Med | 45–60 min | Capstone |
| 5 | External dead-man's-switch | Low | 30 min | Someday |
| 6 | cert-manager ServiceMonitor | Low | 15 min | Someday |
| 7 | Grafana password drift fix | Optional | 0–30 min | Depends on stance |

**Recommended order for a 1-hour session:** #1 (remove the active Slack spam) → #2 (make the plan accurate for replays) → #3 (make that visible on origin) → save #4 / #5 / #6 / #7 for later.

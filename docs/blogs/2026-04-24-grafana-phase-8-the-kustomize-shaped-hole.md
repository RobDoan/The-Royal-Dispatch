# Grafana on homelander: the Kustomize-shaped hole in `helm template`

Follow-up to the [Alloy post](./2026-04-24-alloy-phase-7-the-ceiling-of-helm-template.md). That post ended with a testable prediction:

> Phase 8 is Grafana data sources and a first pass of dashboards. It's smaller than Phase 7 — mostly a values patch to the existing Grafana HelmRelease — but it's another place where the chart wraps a config language. The test for this post's meta-lesson is whether I read Grafana's provisioning docs before writing the values block. If I don't, and Phase 8 takes three PRs, that's the same mistake with a different chart. If I do, and it lands in one or two PRs, the lesson stuck.

It landed in two PRs. The docs-first habit held. But both PRs were fixing bugs in a layer the previous habits don't see — a new kind of mistake, not a repeat of the old ones. So the lesson stuck, and a new one showed up.

This post is about that new lesson, and the concrete command that fixes it.

## What I was trying to do

Grafana is already running on the cluster — has been for days, serving the admin UI at `grafana.example.com`. Phase 8 is layering observability onto it:

- Prometheus and Loki as provisioned data sources, so every dashboard query can reach them by name/uid without hand-clicking through the UI.
- Six community dashboards (Kubernetes cluster, node-exporter, kube-state-metrics, ingress-nginx, postgres-exporter, Loki logs) pulled in via `gnetId` — the chart's init container fetches them from grafana.com at install time.
- One custom dashboard (`Royal Dispatch`) with six panels that answer the operational questions I actually care about: backend request rate, backend p95 latency, LangGraph node p95 duration, external API call outcomes, story-generation p95 by type, and a filtered error-log panel sourced from Loki.

Two provisioning mechanisms, two discovery paths: gnetId dashboards get fetched by an init container and mounted at `/var/lib/grafana/dashboards/default/`; the custom dashboard lives in a `ConfigMap` that the chart's `kiwigrid/k8s-sidecar` container watches for and auto-loads. Both are standard Grafana-chart idioms.

## Reading the docs first

Per the Phase 7 commitment, the first thing I did was pull the chart and read its `values.yaml` before writing any of my own:

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm pull grafana/grafana --version 7.3.12 --untar --untardir /tmp/grafana-chart
grep -A5 "^additionalDataSources\|^datasources\|^dashboards:\|^sidecar:" /tmp/grafana-chart/grafana/values.yaml
```

Three immediate discoveries, each one a bug the plan had:

1. **`additionalDataSources` doesn't exist in this chart.** The correct key is `datasources:`, with a nested `datasources.yaml:` block that mirrors Grafana's native provisioning file format. The plan's `additionalDataSources` would have been silently ignored — no error, just no data sources. (That would've been a fun verification moment.)
2. **`sidecar.dashboards.enabled` defaults to `false`.** The plan assumed the sidecar was watching for labeled ConfigMaps, but it's off out of the box. Without explicitly enabling it, our custom dashboard's ConfigMap would have sat there, ignored forever.
3. **Data sources need explicit `uid:` fields.** The custom dashboard JSON references `"datasource": {"uid": "Prometheus"}`, but Grafana's auto-generated uid from a name isn't always `= name`. Safer to set it explicitly in the provisioning YAML so the reference is stable across re-provisioning.

Then I rendered the planned values and checked the output:

```bash
helm template grafana grafana/grafana --version 7.3.12 --values /tmp/grafana-values.yaml > /tmp/rendered.yaml
grep -A15 "name: grafana-sc-dashboard" /tmp/rendered.yaml | head -20
# Confirmed: sidecar container present, LABEL=grafana_dashboard, WATCH mode.

grep -c "grafana.com/api/dashboards" /tmp/rendered.yaml
# 6 — one fetch per gnetId dashboard.

grep -A3 "datasources.yaml:" /tmp/rendered.yaml
# Shows Prometheus + Loki both rendered into the provisioning ConfigMap with uids set.
```

All three pre-push bugs fixed before the branch was even created. Docs-first worked exactly as advertised.

## What broke anyway

Then I merged the PR and ran verification. Two problems, both in a layer I hadn't been looking at.

### Problem 1: the top-level `namespace:` rewrote my HelmRepository

The kustomization.yaml I inherited from the plan had this:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - helmrepository.yaml
  - externalsecret.yaml
  - helmrelease.yaml
  - ingress.yaml
namespace: grafana                  # <-- here
configMapGenerator:
  - name: grafana-royal-dispatch-dashboard
    files:
      - royal-dispatch.json=dashboards/royal-dispatch.json
    ...
```

A top-level `namespace:` in Kustomize **rewrites the namespace of every resource in the overlay**. That's what it's for. But `helmrepository.yaml` carries `namespace: flux-system` in its own metadata for a reason — Flux stores `HelmRepository` resources in `flux-system` so they can be referenced cluster-wide, and the `HelmRelease`'s `sourceRef` points at `flux-system/grafana` literally.

Setting `namespace: grafana` at the Kustomize level would have rewritten the HelmRepository into `grafana/grafana`, and the HelmRelease's `sourceRef` would've dangled looking for a resource that no longer existed there.

I caught this during verification, before the full reconcile had applied the overlay — the working-branch kustomization was already pushed, but I hadn't yet seen the Flux reconcile error because the timing was tight.

### Problem 2: dropping the namespace left the ConfigMap unnamespaced

The first fix was the obvious one: drop the `namespace: grafana` line so each resource keeps its own namespace. That landed. Reconciled. And Flux immediately said:

```
ConfigMap/grafana-royal-dispatch-dashboard namespace not specified:
the server could not find the requested resource
```

Right. `configMapGenerator` creates a new resource that doesn't have a namespace in its own metadata (because we generate it, not read it from a file). The top-level `namespace:` used to supply one. Dropping it left the ConfigMap in default-namespace limbo, which Flux rejected.

The fix was setting namespace on the per-generator entry, not globally:

```yaml
configMapGenerator:
  - name: grafana-royal-dispatch-dashboard
    namespace: grafana                  # <-- only on this resource
    files: [...]
```

That targets just the ConfigMap, leaves every other resource to its own metadata namespace. Verified locally with `kubectl kustomize apps/grafana/base`:

```
ConfigMap      grafana-royal-dispatch-dashboard  ns=grafana
ExternalSecret grafana-secrets                   ns=grafana
HelmRelease    grafana                           ns=grafana
HelmRepository grafana                           ns=flux-system
Ingress        grafana                           ns=grafana
```

Exactly what I wanted. One command.

**That command is the lesson.** `kubectl kustomize apps/grafana/base` renders the overlay locally and shows exactly which namespace each resource ends up in. Running that before the first push would have caught the HelmRepository-rewrite issue immediately — I'd have seen `HelmRepository grafana ns=grafana` in the output and known to fix it before the PR existed.

It takes less than a second. I didn't run it.

## Mapping the layers of verification

Three phases in, I think the habit stack has four layers now:

| Layer | Command | Catches |
|---|---|---|
| Rendered chart structure | `helm template <chart> --values <my-values>` | Wrong key names, missing required fields, defaults I overrode wrong |
| Embedded config DSL | Reading the upstream canonical example for the DSL | Missing pipeline stages, wrong component choice, syntax that doesn't mean what I remember |
| Rendered overlay | `kubectl kustomize <overlay>` | Namespace rewrites, generator omissions, resource collisions between kustomize and helm |
| Running cluster | `kubectl logs` / `flux get` / metrics endpoints | Runtime behaviour, rate limits, K8s API throttling, auth artifacts, process-level config validation |

`helm template` catches chart-structure bugs. Reading the DSL example catches config-semantic bugs. `kubectl kustomize` catches overlay-transform bugs. Running the cluster catches runtime bugs. These are distinct scopes and none of them substitutes for the others.

Phase 6's chart bugs were `helm template`-shaped. Phase 7's Alloy bugs were DSL-shaped. Phase 8's Grafana bugs were Kustomize-shaped. Three phases, three new layers — each one predicted the next.

## An aside: the authentication artifact

One thing that happened during verification which belongs in the lessons-file but isn't a bug:

```bash
$ kubectl exec -n grafana ... -- curl -u admin:$PW http://grafana/api/datasources
{"message":"Invalid username or password","statusCode":401}
```

I was trying to confirm data sources via the Grafana HTTP API. 401. The Secret's `admin-password` value was definitely what I was passing. Grafana just didn't accept it.

The explanation, once I thought about it: Grafana initializes its admin password on **first install** from `GF_SECURITY_ADMIN_PASSWORD`, then stores a hash in its internal DB. Subsequent upgrades don't re-sync the DB hash with the env variable. If someone (me, days ago, via the Grafana UI) changed the admin password in the DB at any point, the env var becomes irrelevant.

I could dig into how to reset it — delete the `admin_user` row in Grafana's SQLite DB, restart the Pod, let it re-init from the env. That's Fine for a homelab but a rabbit-hole for what I was actually trying to verify. Instead I checked provisioning at the file level:

```bash
kubectl -n grafana exec deploy/grafana -c grafana -- ls /var/lib/grafana/dashboards/default/
# ingress-nginx.json  k8s-cluster.json  kube-state.json  ...

kubectl -n grafana exec deploy/grafana -c grafana -- ls /tmp/dashboards/
# royal-dispatch.json

kubectl -n grafana get cm grafana -o jsonpath='{.data.datasources\.yaml}'
# Prometheus + Loki with correct uids, correct URLs.
```

Six gnetId dashboards on disk, one sidecar-discovered dashboard on disk, two provisioned data sources in the ConfigMap. Grafana reads all of this at startup regardless of what the API auth says. The test I was running was "does Grafana have the files it needs to load on next provisioning sweep," and the answer was yes.

This isn't a bug I fixed — it's a historical artifact I chose to work around rather than debug, and noting it matters because:

1. A future reader of the cluster might hit the same 401 and go looking for a current-values mismatch that doesn't exist.
2. The file-level check is actually the *more load-bearing* verification. If the files are right, Grafana will load them. If the API can't auth, that's a UX problem for me, not a config problem for Grafana.

## Scorecard

| PR / commit | What | Caught by which layer? |
|---|---|---|
| PR #23 commit 1 (pre-push) | `additionalDataSources` → `datasources.datasources.yaml` | `helm template` |
| PR #23 commit 1 (pre-push) | `sidecar.dashboards.enabled: true` missing | Reading `values.yaml` defaults |
| PR #23 commit 1 (pre-push) | Explicit `uid:` on data sources | Reading `values.yaml` example + dashboard JSON cross-reference |
| PR #23 commit 2 | Top-level `namespace:` rewriting HelmRepository | Cluster reconcile error |
| PR #24 | Generated ConfigMap unnamespaced | Flux `namespace not specified` error |

Three out of five fixed pre-push. Two fixed after reconcile surfaced them. One diagnostic command — `kubectl kustomize` — would have moved both of those into the pre-push column.

Two PRs total, though. The Phase 7 prediction was "one or two PRs if the docs-first lesson stuck." Two. The lesson stuck and a new one emerged.

## Forward

Phase 9 is the last implementation phase: PrometheusRule CRs for day-one alerts (`TargetDown`, `HighErrorRate`, `BackendHighLatency`, `PostgresDown`, `LokiIngestFailing`). Chart-free — pure Kubernetes resources on top of CRDs that already exist. Small.

It's an interesting test for the habit stack because:

- It's Kustomize-overlay-shaped work — **Layer 3 (`kubectl kustomize`) applies directly**.
- It has no chart — Layer 1 (`helm template`) is irrelevant.
- There's no embedded DSL — Layer 2 is irrelevant.
- The content is Prometheus alerting expressions — Layer 4 (runtime) is where I'll find out if the queries actually work against the live metric series.

So Phase 9 is almost entirely Layer 3 + Layer 4. If I run `kubectl kustomize` before pushing and tail Alertmanager after merging, the scorecard should look tight. Whether it does is what the Phase 9 post will report.

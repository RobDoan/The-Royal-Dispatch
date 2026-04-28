# Loki on homelander: four fixes before first Ready

A single-phase follow-up to the [five-phase implementation log](./2026-04-23-prometheus-rollout-phases-1-5.md). I ended that post with what I thought was the takeaway from the whole rollout: *"when a resource should work but doesn't, stop reading my own YAML and start reading the cluster."* Phase 6 was the test of whether I'd actually internalized that habit. I failed it four times in a row.

This post is that story — the Loki 6.55.0 install on `homelander`, four follow-up PRs to go from merged to running, and the specific habit I should have adopted earlier.

## Why Loki, in one paragraph

I wanted logs with the same label schema as metrics so I could drill from an alert (`HighErrorRate{namespace="royal-dispatch"}`) straight to the matching logs (`{namespace="royal-dispatch"}`) without translating the query language or re-learning a new tag convention. Loki fits because LogQL is intentionally modeled on PromQL and the labels live in the same Prometheus-shaped key=value space. Alternatives I considered: Elasticsearch (too heavy for a single-node home lab, and the schema shift would erode the whole "one query language, two signals" win); CloudWatch/Datadog (paid SaaS, not the point of a learning project). The security tradeoff I accepted: `auth_enabled: false` because the cluster is single-tenant and the Loki Service is internal-only; production would swap in X-Scope-OrgID tenant isolation.

## The plan, in one paragraph

`deploymentMode: SingleBinary`. One Loki process, one PVC, chunks offloaded to the existing MinIO. Three dedicated buckets (`loki-chunks`, `loki-ruler`, `loki-admin`) created by a one-shot `Job`. S3 credentials generated client-side, written straight to Vault, pulled into the cluster via `ExternalSecret`. Flux Kustomization `dependsOn: [kube-prometheus-stack, minio, eso-store]`. No Gateway, no chunksCache, no resultsCache — a single-user cluster doesn't need them, and each one is another pod and another config surface.

## What actually happened

### First bruise: I couldn't reach MinIO from my laptop

Before any Loki manifest could land, I needed a MinIO user with write access to the `loki-*` buckets, plus the access/secret keys in Vault. My first instinct was the MinIO web console: port-forward 9001, log in, Identity → Users → Add. `minio-console.homelander.local` didn't resolve on my laptop — the hostname only exists on my LAN's DNS. I'd been on a different network.

I could have added an `/etc/hosts` entry, or just spun up `mc` locally and pointed it at a `kubectl port-forward`. What I actually did was sidestep the whole thing:

```bash
kubectl -n minio run mc-bootstrap --rm -i --restart=Never \
  --image=minio/mc:RELEASE.2024-11-05T11-29-45Z \
  --command -- /bin/sh -c '
    mc alias set local http://minio.minio.svc.cluster.local:9000 ...
    mc admin user add local ...
    ...
  '
```

A throwaway `mc` pod inside the cluster. No DNS, no TLS, no external access. Credentials never touched my laptop — `mc` got them from env vars set by `kubectl run --env`, and the Vault write happened in my shell with variables that only existed for the duration of one script.

My first attempt at this *without* the `--command` flag got me this:

```
mc: `sh` is not a recognized command. Get help using `--help` flag.
Did you mean one of these?
        `share`
```

The `minio/mc` image has `mc` as its `ENTRYPOINT`. Without `--command`, kubectl run appends the `sh -c '...'` as *arguments to mc*. mc dutifully tried to interpret `sh` as an `mc` subcommand. I was momentarily confused by the "did you mean `share`" suggestion before realizing what had happened.

I hadn't met this particular kubectl-run quirk before, but it's the same shape as every other ENTRYPOINT-vs-CMD confusion: when the image's entrypoint is a specific binary rather than a shell, you override with `--command`. Small habit to add.

### The main event: Loki 6.55.0 refused to install, four times

This is where I earned the "four fixes" in the title. I'll walk through each bug in the order they surfaced, because the lesson is in the sequence.

#### Fix 1: chart validation rejected the install

First reconcile:

```
Helm install failed for release monitoring/loki:
execution error at (loki/templates/validate.yaml:31:4):
You have more than zero replicas configured for both the single binary
and simple scalable targets. If this was intentional change the
deploymentMode to the transitional 'SingleBinary<->SimpleScalable' mode
```

My mental model was that `deploymentMode: SingleBinary` would suppress the SimpleScalable defaults — the chart knew which mode I'd picked, so it should know to zero out the other mode's replicas. It doesn't work that way. The chart's `validate.yaml` runs as a hard check and just looks at the final merged values: if SingleBinary has replicas AND any of read/write/backend have non-zero replicas, fail.

Fix:

```yaml
read:
  replicas: 0
write:
  replicas: 0
backend:
  replicas: 0
```

Three explicit zeros. Annoying ergonomics — why ship a `deploymentMode` selector at all if it doesn't set the other mode's replicas to zero? — but the chart is what it is.

#### Fix 2: the bucket-init Job was being 401'd (and it took me too long to find out)

Second reconcile, new failure mode: validation passed, HelmRelease got further, but the `loki-bucket-init` Job kept failing. `kubectl describe` showed only `BackoffLimitExceeded`. Pods had been deleted by the time I looked.

I stared at my YAML for a while. The logic looked right — mc, three `mc mb` calls, env with `secretKeyRef` pulls for the creds. Then I actually *read* the env block in the order the Job had it:

```yaml
env:
  - name: MC_HOST_local
    value: "http://$(S3_ACCESS_KEY):$(S3_SECRET_KEY)@minio.minio.svc.cluster.local:9000"
  - name: S3_ACCESS_KEY
    valueFrom:
      secretKeyRef: { name: loki-s3, key: access-key }
  - name: S3_SECRET_KEY
    valueFrom:
      secretKeyRef: { name: loki-s3, key: secret-key }
```

Kubernetes' `$(VAR_NAME)` expansion in container env values only references vars declared **earlier in the list**. `MC_HOST_local` came first, so `$(S3_ACCESS_KEY)` and `$(S3_SECRET_KEY)` never expanded — they went to `mc` as literal strings, and MinIO 401'd every request.

This is documented. I'd just never hit it before. Fix:

```yaml
env:
  - name: S3_ACCESS_KEY
    valueFrom: { secretKeyRef: { name: loki-s3, key: access-key } }
  - name: S3_SECRET_KEY
    valueFrom: { secretKeyRef: { name: loki-s3, key: secret-key } }
  - name: MC_HOST_local
    value: "http://$(S3_ACCESS_KEY):$(S3_SECRET_KEY)@minio.minio.svc.cluster.local:9000"
```

What stings about this one is that the Job had been silently failing for three minutes before I noticed. Pods were deleted, events already flushed from describe output. If the Job had printed *something* before exiting — the literal `$(...)` strings would have been visible in mc's output — I'd have caught it in two minutes. Deep lesson: make bootstrap scripts verbose on first run, at least while debugging.

#### Fix 3: Loki refused to start — compactor config incomplete

Validation passed, buckets existed, StatefulSet rolled out, `loki-0` came up... and immediately crashed. This time I was watching:

```bash
# With the HR in retry loop, pod comes up briefly, I have ~20s to grab logs
$ kubectl -n monitoring logs loki-0 -c loki --tail=50
level=error ts=2026-04-24T07:08:44Z caller=main.go:79 msg="validating config"
  err="CONFIG ERROR: invalid compactor config: compactor.delete-request-store
       should be configured when retention is enabled"
```

Loki's error message is good. I'd set `retention_enabled: true` but not `delete_request_store` — when retention is on, the compactor also needs a place to store the delete-request log, and it won't guess. Fix is one line:

```yaml
compactor:
  retention_enabled: true
  delete_request_store: s3
```

Not much of a lesson here. I missed a paired-requirement in the docs. The fix was in the error message verbatim.

#### Fix 4: the canary wouldn't stay dead

This was the one that told me I'd been doing this wrong from the start. After fix 3 landed and Loki was Ready, three `loki-canary` DaemonSet pods were still running (5h old — leftover from earlier failed installs). I'd explicitly set `monitoring.lokiCanary.enabled: false` in my values. Verified via:

```bash
$ helm -n monitoring get values loki | grep -A1 lokiCanary
monitoring:
  lokiCanary:
    enabled: false
```

Value set. But:

```bash
$ helm -n monitoring get manifest loki | grep -c "name: loki-canary"
4
```

The canary was still being rendered. I pulled the chart locally to find the template guard:

```bash
$ helm pull grafana/loki --version 6.55.0 --untar --untardir /tmp/loki-chart
$ head -3 /tmp/loki-chart/loki/templates/loki-canary/daemonset.yaml
{{- with .Values.lokiCanary -}}
{{- if .enabled -}}
```

Chart 6.x checks `.Values.lokiCanary.enabled` — **top level**, not `.Values.monitoring.lokiCanary.enabled`. The old path I was using was a no-op in this chart version. Moved it:

```yaml
lokiCanary:
  enabled: false
monitoring:
  selfMonitoring:
    enabled: false    # this one's still under monitoring
```

Next reconcile, canary DaemonSet pruned, three zombie pods terminated.

The lesson isn't that value paths shift between major versions — that's expected. The lesson is that I'd had the chart source available to me for the entire rollout, and I hadn't looked at it. Every one of the four fixes above would have been obvious from fifteen minutes of reading `templates/` before pushing. I was driving the rollout like the chart was a black box, one PR per error message.

### The orchestration mess that piled up on top

Every failed install also had second-order effects I had to clean up manually:

- **`HelmRelease` hit retry exhaustion.** Flux's default `install.remediation.retries: 3` means after 4 total attempts (initial + 3 retries) the HR stops trying. Fixing the values wasn't enough; I also needed `flux reconcile helmrelease -n monitoring loki --force` to reset the counter.
- **Helm release stuck in failed state.** Between reattempts, Helm would uninstall-and-reinstall as remediation, but the state machine sometimes left partial manifests. I ended up running `helm history -n monitoring loki` several times to see which revision was "deployed" vs "failed" vs "superseded."
- **Orphaned resources from earlier renders.** The canary DaemonSet survived multiple uninstall/install cycles because... actually I still don't fully understand why Helm didn't clean it up in the normal uninstall path. The top-level-path fix ended up pruning it naturally, so I stopped digging.
- **The bucket-init Job.** Once it failed with backoffLimit exceeded, it became immutable — Flux couldn't update its spec in place, so the Kustomization reconcile stalled. Had to `kubectl delete job loki-bucket-init` manually to let the new spec apply.

None of these were individually hard. What they add up to is a pattern: when the happy path doesn't work, a Helm-chart + Flux + Kubernetes + Vault + MinIO pipeline has *five* places to check for residual state that might block the next attempt. Knowing that ahead of time would have saved me several rounds of "why is it still doing the old thing."

## What I should have done on day one

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update grafana
helm template loki grafana/loki --version 6.55.0 --values my-values.yaml > rendered.yaml
grep -A2 "kind: DaemonSet" rendered.yaml        # would have caught canary
grep -B2 "replicas:" rendered.yaml | less       # would have shown the 6-replica SimpleScalable setup
helm template ... | kubectl apply --server-dry-run=true -f -    # would have caught validation
```

Five minutes. That would have caught fixes 1 and 4 definitively, and given me enough visibility into the actual rendered StatefulSet + PodSpec + env block to catch fix 2 on closer reading. Only fix 3 (the compactor delete-request-store) lives inside the Loki container's own config validation and wouldn't surface in a chart-level dry-run.

I didn't do the dry-run because the previous five phases had worked without it. The previous five phases were comparatively well-behaved charts — ingress-nginx, kube-prometheus-stack, postgres-exporter. Loki's chart has a lot more optional surface (SingleBinary vs SimpleScalable vs Distributed, five cache toggles, gateway, canary, self-monitoring, test hooks) and more opinions baked into template guards. Charts with more surface need more dry-running.

## Taking this to Phase 7

Alloy next. It's also a Grafana chart, also DaemonSet-shaped, also config-heavy (its River DSL is a small language in its own right). The habit I'm starting with this time:

1. Pull the chart first.
2. Read `values.yaml` top to bottom once.
3. `helm template` with my values and pipe the output through `less`.
4. Only then push the HelmRelease.

If Alloy goes clean on first try, Phase 6 was the habit-forming lesson. If it doesn't, I'll add another five minutes to the "before pushing" checklist and keep going.

The header of the Phase 1-5 post said *"I expected the plan to survive first contact with the cluster. It mostly did."* Phase 6 was the "mostly" — and specifically the contact with charts whose defaults disagreed with my mental model. Cheaper to have that conversation with `helm template` than with four PRs.

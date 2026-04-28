# Alloy on homelander: what `helm template` catches, and what it misses

Follow-up to the [Loki post](./2026-04-24-loki-phase-6-four-fixes-before-first-ready.md). At the end of that one I committed to a habit: for chart-heavy phases, pull the chart, render my planned values with `helm template`, read the output, and only then push. Phase 7 was the first test.

The habit earned its keep on the first fix. It didn't help with the other three.

This post is about where the habit stops — and what I now think the next-level habit is.

## Why Alloy, briefly

Grafana Alloy is the log-shipping component that closes the observability loop started by Loki. One DaemonSet pod per node, tails every container's logs from `/var/log/pods`, pushes them to Loki with Prometheus-compatible labels so the same `{namespace="royal-dispatch", container="backend"}` selector works for both metric and log queries. Alternatives I considered: Promtail (now in maintenance mode — Grafana's own migration path points at Alloy), Fluent Bit (more flexible but less K8s-native for this use case), Vector (excellent but a whole new query DSL to learn).

The tradeoff I took: Alloy's config language (River, a small DSL) is another thing to learn. In exchange, every other Grafana tool I touch later will use the same runtime.

## What I caught pre-push

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm pull grafana/alloy --version 1.7.0 --untar --untardir /tmp/alloy-chart
cat > /tmp/alloy-values.yaml <<EOF
... my planned values ...
EOF
helm template alloy grafana/alloy --version 1.7.0 --values /tmp/alloy-values.yaml > /tmp/rendered.yaml
grep -c "/var/log" /tmp/rendered.yaml
# 3
```

Three `/var/log` hits in the rendered DaemonSet — volume definition, volume mount, and the path inside the River config. Good.

Then I rendered the plan's *original* values (with `mounts: { varlog: true }` at the root of `values:`):

```bash
grep -c "name: varlog" /tmp/rendered.yaml
# 0
```

Zero. The plan had the `mounts` key at the wrong nesting level — the chart expects it under `alloy.mounts`, so the root-level version was a silent no-op. The rendered DaemonSet had no `varlog` volume and no mount, meaning Alloy would have run but silently tailed nothing.

That fix landed in PR #19 before I merged. One real bug, caught by the habit exactly as promised. `helm template` worked.

## What I missed post-merge

### PR #20 — the K8s API client-side QPS throttle

First verification query after the merge: `{namespace=~".+"}` over the past two minutes returned four streams from two namespaces, `vault` and `monitoring`. Alloy logs showed it had opened streams for dozens of pods across every namespace, but Loki only saw data from a handful.

Alloy's own push metrics:

```
loki_write_entry_propagation_latency_seconds_count{} = 5675
loki_write_dropped_entries_total{reason="rate_limited"} = 0
loki_write_dropped_entries_total{reason="ingester_error"} = 0
```

5,675 entries successfully delivered, zero drops. So the bottleneck was upstream of the push.

The giveaway was in Alloy's own logs:

```
I0424 14:52:27 request.go:752] "Waited before sending request"
  delay="1.000142314s" reason="client-side throttling, not priority and fairness"
```

I'd configured `loki.source.kubernetes` — the component that tails logs **through the Kubernetes API**. Each container gets its own watch, and every watch is a request subject to client-go's default 5 QPS / 10 burst rate limiter. With ~40 containers per node, most watches queue behind the limiter and never establish a stream. The few that got through were the streams Loki actually indexed.

Fix: swap `loki.source.kubernetes` for `loki.source.file`, which tails the on-disk log files directly via the `varlog` hostPath mount. No per-pod API calls, no throttling.

`helm template` couldn't have caught this. The chart rendered the DaemonSet correctly; the bug was in which component my River config invoked at runtime and how that component behaved against the K8s API inside the running pod.

### PR #21 — the Promtail-era glob that stopped working

After the source swap, Alloy started logging a different error on every target:

```
stat /var/log/pods/*29175fee-97e5-4f60-80e3-d144aaef3796/alloy/*.log: no such file or directory
```

The relabel rule I'd inherited from the plan:

```
rule {
  source_labels = ["__meta_kubernetes_pod_uid","__meta_kubernetes_pod_container_name"]
  separator     = "/"
  replacement   = "/var/log/pods/*$1/*.log"
  target_label  = "__path__"
}
```

The `*$1` in the middle was a Promtail-era trick: glob-at-read-time to match the full `<namespace>_<pod>_<uid>` directory name that kubelet actually creates. Promtail expanded it on disk. `loki.source.file` doesn't — it calls `stat()` on the literal path with the `*` still in it, and fails.

The fix was unglamorous: construct the full directory name explicitly from all three labels instead of gluing a `*` onto the UID:

```
rule {
  source_labels = ["__meta_kubernetes_namespace","__meta_kubernetes_pod_name","__meta_kubernetes_pod_uid"]
  separator     = "_"
  target_label  = "__tmp_pod_dir"
}
rule {
  source_labels = ["__tmp_pod_dir","__meta_kubernetes_pod_container_name"]
  separator     = "/"
  replacement   = "/var/log/pods/$1/*.log"
  target_label  = "__path__"
}
```

Two rules: first one assembles `<ns>_<pod>_<uid>` into a temporary label (the `__tmp_` prefix makes it auto-discarded after relabeling), second one joins that with the container name and wraps with the fixed prefix/suffix.

The thing I noticed reading my own commit message: the original rule was correct **for Promtail**. It came from a mental model assembled years ago against a tool that no longer ships. I'd copied the pattern without checking that the underlying glob mechanics matched the component I was using.

### PR #22 — the missing pipeline stage

After PR #21, paths looked right:

```
/var/log/pods/kube-system_coredns-76c974cb66-fv5tb_<uid>/coredns/*.log
```

But `stat` still failed:

```
stat /var/log/pods/kube-system_coredns-.../coredns/*.log: no such file or directory
```

The directory existed. I verified by `exec`ing into an Alloy pod and running `ls` on the parent:

```bash
$ kubectl -n monitoring exec ds/alloy -c alloy -- \
    ls /var/log/pods/cert-manager_cert-manager-cainjector-.../cert-manager-cainjector/
1.log
2.log
```

Kubelet writes per-container logs as `<restart_count>.log`: `0.log` on first boot, `1.log` after the first restart, and so on. The glob `*.log` is necessary. But `loki.source.file` passes its `__path__` to `stat()` literally — it doesn't glob.

The Alloy pipeline needs a separate stage, `local.file_match`, whose job is exactly that:

```
local.file_match "pod_logs" {
  path_targets = discovery.relabel.pod_logs.output
}

loki.source.file "pod_logs" {
  targets    = local.file_match.pod_logs.targets
  forward_to = [loki.write.default.receiver]
}
```

`local.file_match` expands the glob into actual file paths and feeds only real files into `loki.source.file`. The canonical "collect Kubernetes pod logs" example on Grafana's own docs includes this stage. I'd skipped it because my mental Promtail model collapsed the whole pipeline into one component.

After PR #22 merged and the DaemonSet restarted, Alloy logs looked like they should:

```
ts=... level=info msg="start tailing file"
  path=/var/log/pods/royal-dispatch_backend-574b665788-w9nxc_.../backend/0.log
```

Real file. `0.log`, not `*.log`. LogQL query worked immediately:

```
{namespace="royal-dispatch",container="backend"}
→ INFO: 10.42.1.1:37592 - "GET /docs HTTP/1.1" 200 OK
```

92 streams across 16 namespaces within two minutes. Full cluster coverage.

## The meta-lesson

Counting up the Phase 7 scoreboard:

| PR | What | Caught by `helm template`? |
|---|---|---|
| #19 (initial) | `mounts.varlog` at wrong nesting level | Yes — pre-push |
| #20 | K8s API client-side QPS throttle | No — runtime component behaviour inside rendered pod |
| #21 | Promtail-era `*<uid>` path glob | No — River DSL semantics, not YAML |
| #22 | Missing `local.file_match` stage | No — River DSL pipeline shape, not YAML |

One out of four. The habit I adopted at the end of Phase 6 worked for what it was designed for — chart structure, value nesting, rendered resource shape. It hit its ceiling cleanly on three distinct things:

1. **Runtime behaviour of the rendered resources.** The chart rendered a DaemonSet with `loki.source.kubernetes` inside its config — that's structurally correct. What it *does* — open a watch per container via the K8s API — is only visible when it runs.
2. **Semantics of a config language embedded in the values.** River is its own mini-language. The chart renderer treats River source as an opaque string and stuffs it into a ConfigMap. YAML dry-run doesn't type-check River.
3. **Pipeline shape for the config DSL.** Even if the DSL syntax is valid, missing an intermediate stage (like `local.file_match`) is a semantic error the chart knows nothing about.

The next-level habit I'm trying to adopt: **when a chart's `values` embed a config DSL, read the upstream canonical example for that DSL's use case before writing my own from first principles.** Grafana's docs have a "Collect Kubernetes pod logs" example that includes `discovery.kubernetes → discovery.relabel → local.file_match → loki.source.file → loki.write` — every stage I ended up needing. PR #22 wouldn't have existed if I'd started from that template.

This isn't a replacement for `helm template`. It's the next layer down. `helm template` for YAML. Upstream example config for embedded DSLs. Cluster observation for runtime behaviour. Three different habits, three different scopes, none of them substitutes for each other.

## On "four PRs in a row"

I spent part of the Phase 6 post worried that "four fixes on the Loki chart" was a bad look. Phase 7 has the same count. What I notice different between the two:

- In Phase 6, the bugs were **chart-level**: value paths moved between versions, retention has required companions, single-mode/scalable defaults collide. Things `helm template` should have caught and did, on replay.
- In Phase 7, the bugs were **DSL-level**: which source component to pick, how to compose stages, how paths flow through relabeling. Things `helm template` can't catch at all.

Four PRs is still four PRs. But three of Phase 7's four would have been *one* PR if I'd read the upstream pipeline example before writing my own. So the meta-lesson doesn't remove the fix-burden — it concentrates it into one merge-cycle rather than three.

## Next up

Phase 8 is Grafana data sources and a first pass of dashboards. It's smaller than Phase 7 — mostly a values patch to the existing Grafana HelmRelease — but it's another place where the chart wraps a config language (Grafana's provisioning YAML). The test for this post's meta-lesson is whether I read Grafana's provisioning docs before writing the values block.

If I don't, and Phase 8 takes three PRs for reasons I could have caught by reading the docs, that's the same mistake with a different chart. If I do, and it lands in one or two PRs, the lesson stuck.

The blog entry after Phase 8 will tell you which one happened.

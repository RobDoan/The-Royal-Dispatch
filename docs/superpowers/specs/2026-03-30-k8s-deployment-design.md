# K8s Deployment Design — The Royal Dispatch

**Date:** 2026-03-30
**Status:** Approved

## Overview

Deploy all Royal Dispatch services to a local k3s Kubernetes cluster using raw YAML manifests. No monitoring stack yet (Prometheus/Grafana deferred). Secrets managed via HashiCorp Vault + External Secrets Operator. Persistent storage via Longhorn. Ingress via Traefik (k3s built-in). Images served from a local Docker registry.

---

## Infrastructure Layer

### k3s

- Single-node local cluster
- Traefik pre-installed as ingress controller (kept as-is)
- `local-path` StorageClass disabled; Longhorn set as the default StorageClass
- containerd configured to trust local registry as insecure (`localhost:30500`)

### Local Docker Registry

- `registry:2` image deployed in `registry` namespace
- Exposed as NodePort `30500` on the host
- Push: `docker push localhost:30500/<image>`
- Pull (in-cluster): `localhost:30500/<image>`

### Longhorn

- Installed via official manifests into `longhorn-system` namespace
- Default StorageClass for all PVCs
- Host prerequisites: `open-iscsi`, `nfs-common` installed on the k3s node

### Vault

- Deployed in `vault` namespace in **dev mode** (no TLS, no unsealing — suitable for local)
- Secrets written manually once: `vault kv put secret/royal-dispatch KEY=value ...`
- Can be upgraded to file/raft backend later for durability

### External Secrets Operator (ESO)

- Deployed in `external-secrets` namespace
- `ClusterSecretStore` connects to Vault using a Vault token
- `ExternalSecret` objects in each app namespace pull secrets into native K8s Secrets
- Pods consume secrets as environment variables

---

## Application Services

All custom app images are built locally and pushed to `localhost:30500/royal-dispatch/<service>:latest`.

### Namespace: `royal-dispatch`

#### Backend (FastAPI)

| Field | Value |
|---|---|
| Kind | Deployment |
| Replicas | 1 |
| Image | `localhost:30500/royal-dispatch/backend:latest` |
| Port | 8000 |
| Service | ClusterIP |
| Liveness/Readiness | `GET /docs` |
| Secrets via ESO | `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET`, `QDRANT_URL`, `OPENAI_API_KEY` |

#### Frontend (Next.js)

| Field | Value |
|---|---|
| Kind | Deployment |
| Replicas | 1 |
| Image | `localhost:30500/royal-dispatch/frontend:latest` |
| Port | 3000 |
| Service | ClusterIP |
| Build arg | `NEXT_PUBLIC_API_URL` (baked at build time via `--build-arg`) |

> **Note:** `NEXT_PUBLIC_*` vars are embedded at Next.js build time, not runtime. Pass them as Docker build args when building the image — ESO cannot inject them post-build.

#### Admin (Next.js)

| Field | Value |
|---|---|
| Kind | Deployment |
| Replicas | 1 |
| Image | `localhost:30500/royal-dispatch/admin:latest` |
| Port | 3001 |
| Service | ClusterIP |
| Build arg | `NEXT_PUBLIC_API_URL` (baked at build time via `--build-arg`) |

### Namespace: `n8n`

| Field | Value |
|---|---|
| Kind | Deployment |
| Replicas | 1 |
| Image | `n8nio/n8n` (Docker Hub) |
| Port | 5678 |
| Service | ClusterIP |
| PVC | Longhorn, 1Gi, `/home/node/.n8n` |
| Secrets via ESO | `TELEGRAM_BOT_TOKEN`, `PARENT_CHAT_ID`, `N8N_BASIC_AUTH_USER`, `N8N_BASIC_AUTH_PASSWORD` |

### Namespace: `qdrant`

| Field | Value |
|---|---|
| Kind | Deployment |
| Replicas | 1 |
| Image | `qdrant/qdrant` (Docker Hub) |
| Ports | 6333 (HTTP), 6334 (gRPC) |
| Service | ClusterIP |
| PVC | Longhorn, 5Gi, `/qdrant/storage` |
| Secrets | None |

### Namespace: `postgres`

#### Postgres

| Field | Value |
|---|---|
| Kind | StatefulSet |
| Replicas | 1 |
| Image | `postgres:16` |
| Port | 5432 |
| Service | ClusterIP (headless for StatefulSet) |
| PVC | Longhorn, 5Gi, `/var/lib/postgresql/data` |
| Secrets via ESO | `POSTGRES_PASSWORD` |

#### Migrate (DB migrations)

| Field | Value |
|---|---|
| Kind | Job |
| Image | `migrate/migrate` |
| Migrations source | Mounted from `ConfigMap` containing files from `backend/db/migrations/` |
| Init container | Polls `pg_isready` before running migrations |
| Restart policy | `OnFailure` |

---

## Ingress & Networking

### Traefik IngressRoutes

| Host | Namespace | Service | Port |
|---|---|---|---|
| `royal.local` | `royal-dispatch` | frontend | 3000 |
| `admin.royal.local` | `royal-dispatch` | admin | 3001 |
| `api.royal.local` | `royal-dispatch` | backend | 8000 |
| `n8n.royal.local` | `n8n` | n8n | 5678 |
| `qdrant.royal.local` | `qdrant` | qdrant | 6333 |

Add to `/etc/hosts` on the host:
```
127.0.0.1 royal.local admin.royal.local api.royal.local n8n.royal.local qdrant.royal.local
```

### Internal DNS

Services communicate via K8s cluster DNS:
- Backend → Postgres: `postgres.postgres.svc.cluster.local:5432`
- Backend → Qdrant: `qdrant.qdrant.svc.cluster.local:6333`
- n8n → Backend: `backend.royal-dispatch.svc.cluster.local:8000`

---

## Directory Structure

```
k8s/
  registry/
    namespace.yaml
    deployment.yaml
    service.yaml
  vault/
    namespace.yaml
    deployment.yaml
    service.yaml
    cluster-secret-store.yaml
  longhorn/
    longhorn.yaml          # official manifests
  royal-dispatch/
    namespace.yaml
  backend/
    deployment.yaml
    service.yaml
    externalsecret.yaml
  frontend/
    deployment.yaml
    service.yaml
    externalsecret.yaml
  admin/
    deployment.yaml
    service.yaml
    externalsecret.yaml
  n8n/
    namespace.yaml
    deployment.yaml
    service.yaml
    pvc.yaml
    externalsecret.yaml
  qdrant/
    namespace.yaml
    deployment.yaml
    service.yaml
    pvc.yaml
  postgres/
    namespace.yaml
    statefulset.yaml
    service.yaml
    externalsecret.yaml
  migrate/
    configmap.yaml         # migration SQL files
    job.yaml
  ingress/
    ingressroute-frontend.yaml
    ingressroute-admin.yaml
    ingressroute-backend.yaml
    ingressroute-n8n.yaml
    ingressroute-qdrant.yaml
```

---

## Deployment Order

1. Install k3s
2. Configure containerd for local registry
3. Install Longhorn
4. Deploy local registry
5. Deploy Vault + configure secrets
6. Deploy ESO + ClusterSecretStore
7. Build & push images to local registry
8. Deploy Postgres + run migrate Job
9. Deploy Qdrant
10. Deploy n8n
11. Deploy backend, frontend, admin
12. Apply Traefik IngressRoutes
13. Update `/etc/hosts`

---

## Deferred

- Prometheus, Grafana, Alertmanager (to be added as separate services later)
- TLS / cert-manager (not needed for local)
- Multi-replica / HPA (single replica for all services for now)
- Vault raft/file backend (dev mode used for now)

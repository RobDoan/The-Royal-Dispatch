# GitOps K8s Deployment Design — The Royal Dispatch

**Date:** 2026-04-15
**Status:** Approved

## Overview

Deploy The Royal Dispatch to production Kubernetes clusters (rackspace + homelander) via the existing Flux CD GitOps repo at `gitops-rackspace`. PostgreSQL and MinIO are added as shared infrastructure. The app shares existing Qdrant and n8n instances. Container images are built via GitHub Actions and pushed to DockerHub. Image tag updates are committed back to the GitOps repo to trigger Flux reconciliation.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Qdrant | Share existing | Collection-level isolation is sufficient |
| n8n | Share existing | Fewer resources, workflows managed separately |
| PostgreSQL | New shared infra (Helm) | Reusable by future apps |
| MinIO | New shared infra (Helm) | Reusable by future apps |
| App manifests | Plain K8s + Kustomize | No community Helm chart exists for custom app |
| Image registry | DockerHub | Already in use (`quydoan/royal-dispatch-*`) |
| Tag strategy | Git SHA + `latest` | Explicit commits to GitOps repo (no Flux image automation) |
| Secrets | Vault + ESO | Consistent with existing infra |
| Clusters | Both rackspace + homelander | Full multi-cluster support |

---

## New Infrastructure

### PostgreSQL (`infrastructure/postgres/`)

- **Chart**: Bitnami PostgreSQL (`oci://registry-1.docker.io/bitnamicharts/postgresql`)
- **Namespace**: `postgres`
- **Persistence**: 10Gi (`ssd` on rackspace, `local-path` on homelander)
- **Auth**: root password + `royal` user + `royal_dispatch` database — all from Vault at `secret/postgres`
- **Service DNS**: `postgres-postgresql.postgres.svc.cluster.local:5432`
- **No Ingress** — internal-only

### MinIO (`infrastructure/minio/`)

- **Chart**: Bitnami MinIO (`oci://registry-1.docker.io/bitnamicharts/minio`)
- **Namespace**: `minio`
- **Persistence**: 20Gi (`ssd` on rackspace, `local-path` on homelander)
- **Auth**: root user/password from Vault at `secret/minio`
- **Default bucket**: `royal-audio` (created via Helm values `defaultBuckets`)
- **Ingress (rackspace)**: `minio.quybits.com` (API), `minio-console.quybits.com` (console)
- **Ingress (homelander)**: `minio.homelander.local`, `minio-console.homelander.local`
- **Service DNS**: `minio.minio.svc.cluster.local:9000`

### Namespace Additions

Add `postgres`, `minio`, and `royal-dispatch` to `namespaces/namespaces.yaml`.

---

## Application: Royal Dispatch (`apps/royal-dispatch/`)

Three Deployments + init container for migrations, all in the `royal-dispatch` namespace.

### Backend

- **Image**: `quydoan/royal-dispatch-backend:<sha>`
- **Replicas**: 1
- **Port**: 8000
- **Ingress**: `royal-dispatch-api.quybits.com` / `royal-dispatch-api.homelander.local`
- **Health probes**: readiness + liveness on `/docs`
- **Init container**: `migrate/migrate` image running DB migrations from `/backend/db/migrations/` (baked into backend image)
- **Secrets from Vault** (`secret/royal-dispatch`): `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`
- **Secrets from Vault** (`secret/postgres`): `POSTGRES_PASSWORD` (used to construct `DATABASE_URL`)
- **Secrets from Vault** (`secret/minio`): `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- **ConfigMap env vars**:
  - `DATABASE_URL=postgresql://royal:$(POSTGRES_PASSWORD)@postgres-postgresql.postgres.svc.cluster.local:5432/royal_dispatch`
  - `S3_ENDPOINT_URL=http://minio.minio.svc.cluster.local:9000`
  - `S3_PUBLIC_URL=https://minio.quybits.com` (cluster-specific via overlay)
  - `S3_BUCKET=royal-audio`
  - `QDRANT_URL=http://qdrant.qdrant.svc.cluster.local:6333`
  - `USER_TIMEZONE=America/Los_Angeles`

### Frontend

- **Image**: `quydoan/royal-dispatch-frontend:<sha>`
- **Replicas**: 1
- **Port**: 3000
- **Ingress**: `royal-dispatch.quybits.com` / `royal-dispatch.homelander.local`
- **Health probes**: readiness + liveness on `/`
- **Env**: `NEXT_PUBLIC_API_URL=https://royal-dispatch-api.quybits.com` (cluster-specific via overlay)

### Admin

- **Image**: `quydoan/royal-dispatch-admin:<sha>`
- **Replicas**: 1
- **Port**: 3001
- **Ingress**: `royal-dispatch-admin.quybits.com` / `royal-dispatch-admin.homelander.local`
- **Health probes**: readiness + liveness on `/`
- **Env**:
  - `NEXT_PUBLIC_API_URL=https://royal-dispatch-api.quybits.com` (cluster-specific)
  - `NEXT_PUBLIC_FRONTEND_URL=https://royal-dispatch.quybits.com` (cluster-specific)

### Database Migration

Runs as an **init container** on the backend Deployment:
- **Image**: `migrate/migrate`
- **Command**: `migrate -path=/backend/db/migrations -database=$DATABASE_URL up`
- **Mounts**: migrations directory from backend image (shared via emptyDir + copy, or baked into a separate migration image)
- **Blocks backend startup** until migrations complete

### Secrets (ExternalSecret Resources)

Three ExternalSecret resources in the `royal-dispatch` namespace:

1. **`royal-dispatch-secrets`** — from `secret/royal-dispatch`: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`
2. **`royal-dispatch-postgres`** — from `secret/postgres`: `POSTGRES_PASSWORD`
3. **`royal-dispatch-minio`** — from `secret/minio`: `S3_ACCESS_KEY`, `S3_SECRET_KEY`

### ConfigMap

Non-secret environment variables in a ConfigMap, with cluster-specific values patched via overlays:
- Service URLs (postgres, qdrant, minio — internal DNS)
- Public URLs (domain-specific, vary by cluster)
- `S3_BUCKET`, `USER_TIMEZONE`

---

## Flux Wiring

### New Kustomization Resources

**`clusters/{cluster}/postgres.yaml`**:
- path: `./infrastructure/postgres/overlays/{cluster}`
- dependsOn: `eso-store`, `namespaces`

**`clusters/{cluster}/minio.yaml`**:
- path: `./infrastructure/minio/overlays/{cluster}`
- dependsOn: `eso-store`, `namespaces`

**`clusters/{cluster}/royal-dispatch.yaml`**:
- path: `./apps/royal-dispatch/overlays/{cluster}`
- dependsOn: `postgres`, `minio`, `qdrant`, `n8n`, `cert-manager-issuers`, `ingress-nginx`

### Updated Dependency Chain

```
namespaces
  ↓
cert-manager → cert-manager-issuers → ingress-nginx
external-secrets → vault → eso-store
  ↓
postgres, minio, qdrant, n8n, grafana
  ↓
royal-dispatch
```

### Cluster Kustomization Updates

Add `postgres.yaml`, `minio.yaml`, `royal-dispatch.yaml` to resources in:
- `clusters/rackspace/kustomization.yaml`
- `clusters/homelander/kustomization.yaml`

---

## GitHub Actions CI/CD

### Workflow: `build-and-push.yaml`

**Location**: `.github/workflows/build-and-push.yaml` (in the-royal-dispatch repo)

**Trigger**: Push to `main`, filtered by path:

| Path filter | Image |
|-------------|-------|
| `backend/**` | `quydoan/royal-dispatch-backend` |
| `frontend/**` | `quydoan/royal-dispatch-frontend` |
| `admin/**` | `quydoan/royal-dispatch-admin` |

**Jobs** (matrix strategy, one per changed service):

1. Checkout code
2. Set up Docker Buildx
3. Login to DockerHub (secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`)
4. Build and push with tags: `<git-sha>` + `latest`
5. Checkout GitOps repo (`gitops-rackspace`)
6. Update image tag in the relevant overlay files (e.g., `kustomization.yaml` image newTag)
7. Commit and push to GitOps repo (using a deploy key or PAT)

**Required GitHub Secrets**:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `GITOPS_DEPLOY_KEY` or `GITOPS_PAT` (for pushing to GitOps repo)

---

## File Structure

```
# GitOps repo (gitops-rackspace)

infrastructure/postgres/
  base/
    kustomization.yaml
    helmrepository.yaml
    helmrelease.yaml
    externalsecret.yaml
  overlays/
    rackspace/
      kustomization.yaml
      helmrelease-patch.yaml
    homelander/
      kustomization.yaml
      helmrelease-patch.yaml

infrastructure/minio/
  base/
    kustomization.yaml
    helmrepository.yaml
    helmrelease.yaml
    ingress.yaml
    externalsecret.yaml
  overlays/
    rackspace/
      kustomization.yaml
      helmrelease-patch.yaml
      ingress-patch.yaml
    homelander/
      kustomization.yaml
      helmrelease-patch.yaml
      ingress-patch.yaml

apps/royal-dispatch/
  base/
    kustomization.yaml
    backend-deployment.yaml
    backend-service.yaml
    frontend-deployment.yaml
    frontend-service.yaml
    admin-deployment.yaml
    admin-service.yaml
    ingress.yaml
    externalsecret.yaml
    externalsecret-postgres.yaml
    externalsecret-minio.yaml
    configmap.yaml
  overlays/
    rackspace/
      kustomization.yaml
      configmap-patch.yaml
      ingress-patch.yaml
    homelander/
      kustomization.yaml
      configmap-patch.yaml
      ingress-patch.yaml

clusters/rackspace/
  postgres.yaml          # new
  minio.yaml             # new
  royal-dispatch.yaml    # new
  kustomization.yaml     # updated

clusters/homelander/
  postgres.yaml          # new
  minio.yaml             # new
  royal-dispatch.yaml    # new
  kustomization.yaml     # updated

namespaces/namespaces.yaml  # add postgres, minio, royal-dispatch

# App repo (the-royal-dispatch)

.github/workflows/
  build-and-push.yaml
```

---

## Vault Secrets Required

Before deploying, these must be populated in Vault:

```
vault kv put secret/postgres \
  postgres-password=<root-pw> \
  password=<royal-user-pw>

vault kv put secret/minio \
  root-user=<minio-root-user> \
  root-password=<minio-root-password>

vault kv put secret/royal-dispatch \
  ANTHROPIC_API_KEY=<key> \
  ELEVENLABS_API_KEY=<key> \
  OPENAI_API_KEY=<key>
```

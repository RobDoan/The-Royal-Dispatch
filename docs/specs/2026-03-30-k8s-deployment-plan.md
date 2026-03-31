# K8s Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy all Royal Dispatch services to Rackspace Spot (cloudspace: `qdoan-5`) with Vault-managed secrets, Rackspace Spot storage classes (`ssd`/`sata`), Traefik ingress, and Docker Hub images.

**Architecture:** Raw YAML manifests in `k8s/` organized by service. Infrastructure first (Vault → ESO), then stateful services (Postgres, Qdrant, n8n), then app services (backend, frontend, admin), then ingress.

**Tech Stack:** Rackspace Spot k3s, HashiCorp Vault (dev mode), External Secrets Operator, Traefik v2 (built into k3s), Docker Hub (`quydoan/`), kubectl

---

## File Map

| File | Purpose |
|---|---|
| `k8s/vault/namespace.yaml` | `vault` namespace |
| `k8s/vault/deployment.yaml` | Vault dev mode |
| `k8s/vault/service.yaml` | ClusterIP on 8200 |
| `k8s/external-secrets/vault-token-secret.yaml` | Vault root token for ESO |
| `k8s/external-secrets/cluster-secret-store.yaml` | ClusterSecretStore → Vault |
| `k8s/royal-dispatch/namespace.yaml` | `royal-dispatch` namespace |
| `k8s/postgres/namespace.yaml` | `postgres` namespace |
| `k8s/postgres/statefulset.yaml` | postgres:16 StatefulSet + ssd PVC |
| `k8s/postgres/service.yaml` | Headless ClusterIP |
| `k8s/postgres/externalsecret.yaml` | Pulls POSTGRES_PASSWORD from Vault |
| `k8s/migrate/configmap.yaml` | SQL migration files as ConfigMap |
| `k8s/migrate/job.yaml` | migrate/migrate Job with pg_isready init container |
| `k8s/qdrant/namespace.yaml` | `qdrant` namespace |
| `k8s/qdrant/pvc.yaml` | ssd 5Gi PVC |
| `k8s/qdrant/deployment.yaml` | qdrant/qdrant |
| `k8s/qdrant/service.yaml` | ClusterIP on 6333/6334 |
| `k8s/n8n/namespace.yaml` | `n8n` namespace |
| `k8s/n8n/pvc.yaml` | sata 1Gi PVC |
| `k8s/n8n/deployment.yaml` | n8nio/n8n |
| `k8s/n8n/service.yaml` | ClusterIP on 5678 |
| `k8s/n8n/externalsecret.yaml` | Pulls n8n secrets from Vault |
| `k8s/backend/deployment.yaml` | FastAPI backend |
| `k8s/backend/service.yaml` | ClusterIP on 8000 |
| `k8s/backend/externalsecret.yaml` | Pulls API keys + DATABASE_URL from Vault |
| `k8s/frontend/deployment.yaml` | Next.js frontend |
| `k8s/frontend/service.yaml` | ClusterIP on 3000 |
| `k8s/admin/deployment.yaml` | Next.js admin |
| `k8s/admin/service.yaml` | ClusterIP on 3001 |
| `k8s/ingress/ingressroute-frontend.yaml` | Host: royal.local → frontend:3000 |
| `k8s/ingress/ingressroute-admin.yaml` | Host: admin.royal.local → admin:3001 |
| `k8s/ingress/ingressroute-backend.yaml` | Host: api.royal.local → backend:8000 |
| `k8s/ingress/ingressroute-n8n.yaml` | Host: n8n.royal.local → n8n:5678 |
| `k8s/ingress/ingressroute-qdrant.yaml` | Host: qdrant.royal.local → qdrant:6333 |
| `frontend/Dockerfile` | Add ARG/ENV for NEXT_PUBLIC_API_URL in builder stage |
| `admin/Dockerfile` | Add ARG/ENV for NEXT_PUBLIC_API_URL in builder stage |

---

## Task 1: Configure kubectl for Rackspace Spot

**Files:**
- No repo files — system-level setup

- [ ] **Step 1: Download kubeconfig from Rackspace Spot**

In the Rackspace Spot UI, go to cloudspace `qdoan-5` → Overview → Download kubeconfig.

```bash
mkdir -p ~/.kube
cp ~/Downloads/qdoan-5-kubeconfig.yaml ~/.kube/config
chmod 600 ~/.kube/config
```

- [ ] **Step 2: Verify cluster access**

```bash
kubectl get nodes
```
Expected: one or more nodes with `STATUS=Ready`

```bash
kubectl get storageclass
```
Expected: `ssd` and `sata` storage classes listed.

---

## Task 2: Deploy Vault in dev mode and populate secrets

**Files:**
- Create: `k8s/vault/namespace.yaml`
- Create: `k8s/vault/deployment.yaml`
- Create: `k8s/vault/service.yaml`

- [ ] **Step 1: Write namespace**

```yaml
# k8s/vault/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: vault
```

- [ ] **Step 2: Write deployment**

```yaml
# k8s/vault/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vault
  namespace: vault
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vault
  template:
    metadata:
      labels:
        app: vault
    spec:
      containers:
        - name: vault
          image: hashicorp/vault:1.17
          args:
            - server
            - -dev
            - -dev-root-token-id=root
            - -dev-listen-address=0.0.0.0:8200
          ports:
            - containerPort: 8200
          env:
            - name: VAULT_DEV_ROOT_TOKEN_ID
              value: root
            - name: VAULT_ADDR
              value: http://127.0.0.1:8200
          securityContext:
            capabilities:
              add:
                - IPC_LOCK
          readinessProbe:
            httpGet:
              path: /v1/sys/health
              port: 8200
            initialDelaySeconds: 5
            periodSeconds: 5
```

- [ ] **Step 3: Write service**

```yaml
# k8s/vault/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: vault
  namespace: vault
spec:
  selector:
    app: vault
  ports:
    - port: 8200
      targetPort: 8200
```

- [ ] **Step 4: Apply**

```bash
kubectl apply -f k8s/vault/namespace.yaml
kubectl apply -f k8s/vault/deployment.yaml
kubectl apply -f k8s/vault/service.yaml
kubectl -n vault rollout status deploy/vault
```
Expected: `successfully rolled out`

- [ ] **Step 5: Port-forward Vault to populate secrets**

In a separate terminal, run:
```bash
kubectl -n vault port-forward svc/vault 8200:8200
```

- [ ] **Step 6: Write all secrets into Vault**

In a new terminal (leave port-forward running):
```bash
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=root

# Enable KV v2 secrets engine (dev mode enables it at secret/ by default)
vault secrets list | grep secret || vault secrets enable -path=secret kv-v2

# Write all secrets in one command — replace values with your actual keys
vault kv put secret/royal-dispatch \
  ANTHROPIC_API_KEY="<your-anthropic-key>" \
  ELEVENLABS_API_KEY="<your-elevenlabs-key>" \
  SUPABASE_URL="<your-supabase-url>" \
  SUPABASE_SERVICE_KEY="<your-supabase-service-key>" \
  SUPABASE_STORAGE_BUCKET="royal-audio" \
  OPENAI_API_KEY="<your-openai-key>" \
  POSTGRES_PASSWORD="<choose-a-strong-password>" \
  DATABASE_URL="postgres://royal:<choose-a-strong-password>@postgres.postgres.svc.cluster.local:5432/royal_dispatch" \
  TELEGRAM_BOT_TOKEN="<your-telegram-bot-token>" \
  PARENT_CHAT_ID="<your-parent-chat-id>" \
  N8N_BASIC_AUTH_USER="admin" \
  N8N_BASIC_AUTH_PASSWORD="<choose-a-password>"
```

Verify:
```bash
vault kv get secret/royal-dispatch
```
Expected: all keys listed.

- [ ] **Step 7: Commit**

```bash
git add k8s/vault/
git commit -m "chore: add Vault dev-mode deployment manifests"
```

---

## Task 5: Install External Secrets Operator and configure ClusterSecretStore

**Files:**
- Create: `k8s/external-secrets/vault-token-secret.yaml`
- Create: `k8s/external-secrets/cluster-secret-store.yaml`

- [ ] **Step 1: Install ESO via official manifests**

```bash
kubectl apply -f https://github.com/external-secrets/external-secrets/releases/download/v0.10.4/install.yaml
```

Wait for ESO to be ready:
```bash
kubectl -n external-secrets rollout status deploy/external-secrets
kubectl -n external-secrets rollout status deploy/external-secrets-webhook
kubectl -n external-secrets rollout status deploy/external-secrets-cert-controller
```
Expected: all `successfully rolled out`

- [ ] **Step 2: Write Vault token secret for ESO**

```yaml
# k8s/external-secrets/vault-token-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: vault-token
  namespace: external-secrets
type: Opaque
stringData:
  token: root
```

- [ ] **Step 3: Write ClusterSecretStore**

```yaml
# k8s/external-secrets/cluster-secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: "http://vault.vault.svc.cluster.local:8200"
      path: "secret"
      version: "v2"
      auth:
        tokenSecretRef:
          name: vault-token
          namespace: external-secrets
          key: token
```

- [ ] **Step 4: Apply**

```bash
kubectl apply -f k8s/external-secrets/vault-token-secret.yaml
kubectl apply -f k8s/external-secrets/cluster-secret-store.yaml
```

Verify:
```bash
kubectl get clustersecretstore vault-backend
```
Expected: `STATUS=Valid`

(If status is not immediately `Valid`, wait 15 seconds and try again.)

- [ ] **Step 5: Commit**

```bash
git add k8s/external-secrets/
git commit -m "chore: add ESO ClusterSecretStore for Vault"
```

---

## Task 6: Postgres StatefulSet + ExternalSecret

**Files:**
- Create: `k8s/postgres/namespace.yaml`
- Create: `k8s/postgres/statefulset.yaml`
- Create: `k8s/postgres/service.yaml`
- Create: `k8s/postgres/externalsecret.yaml`

- [ ] **Step 1: Write namespace**

```yaml
# k8s/postgres/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: postgres
```

- [ ] **Step 2: Write ExternalSecret**

```yaml
# k8s/postgres/externalsecret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: postgres-secret
  namespace: postgres
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: postgres-secret
    creationPolicy: Owner
  data:
    - secretKey: POSTGRES_PASSWORD
      remoteRef:
        key: royal-dispatch
        property: POSTGRES_PASSWORD
```

- [ ] **Step 3: Write StatefulSet**

```yaml
# k8s/postgres/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: royal_dispatch
            - name: POSTGRES_USER
              value: royal
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: POSTGRES_PASSWORD
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "royal", "-d", "royal_dispatch"]
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 10
          livenessProbe:
            exec:
              command: ["pg_isready", "-U", "royal", "-d", "royal_dispatch"]
            initialDelaySeconds: 30
            periodSeconds: 10
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: ssd
        resources:
          requests:
            storage: 5Gi
```

- [ ] **Step 4: Write service (headless)**

```yaml
# k8s/postgres/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: postgres
spec:
  selector:
    app: postgres
  clusterIP: None
  ports:
    - port: 5432
      targetPort: 5432
```

- [ ] **Step 5: Apply**

```bash
kubectl apply -f k8s/postgres/namespace.yaml
kubectl apply -f k8s/postgres/externalsecret.yaml
# Wait for secret to be synced
sleep 10
kubectl -n postgres get secret postgres-secret
kubectl apply -f k8s/postgres/statefulset.yaml
kubectl apply -f k8s/postgres/service.yaml
```

- [ ] **Step 6: Verify Postgres is ready**

```bash
kubectl -n postgres rollout status statefulset/postgres
```
Expected: `statefulset rolling update complete 1 pods at revision postgres-...`

```bash
kubectl -n postgres exec -it postgres-0 -- pg_isready -U royal -d royal_dispatch
```
Expected: `accepting connections`

- [ ] **Step 7: Commit**

```bash
git add k8s/postgres/
git commit -m "chore: add Postgres StatefulSet with ssd PVC and Vault secrets"
```

---

## Task 7: Database migration Job

**Files:**
- Create: `k8s/migrate/configmap.yaml`
- Create: `k8s/migrate/job.yaml`

- [ ] **Step 1: Write ConfigMap with all migration files**

```yaml
# k8s/migrate/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: migrations
  namespace: postgres
data:
  001_init.up.sql: |
    CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        telegram_chat_id BIGINT,
        token TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE user_preferences (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        config JSONB NOT NULL DEFAULT '{}'
    );

    CREATE TABLE briefs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        text TEXT NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE stories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        princess TEXT NOT NULL,
        story_type TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        story_text TEXT,
        audio_url TEXT,
        royal_challenge TEXT,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE UNIQUE INDEX stories_unique_with_user
        ON stories (date, princess, story_type, language, user_id)
        WHERE user_id IS NOT NULL;

    CREATE UNIQUE INDEX stories_unique_no_user
        ON stories (date, princess, story_type, language)
        WHERE user_id IS NULL;

  001_init.down.sql: |
    DROP TABLE IF EXISTS stories;
    DROP TABLE IF EXISTS briefs;
    DROP TABLE IF EXISTS user_preferences;
    DROP TABLE IF EXISTS users;

  002_add_children.up.sql: |
    CREATE TABLE children (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
        preferences JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT children_parent_name_unique UNIQUE (parent_id, name)
    );

    ALTER TABLE briefs ADD COLUMN child_id UUID REFERENCES children(id) ON DELETE SET NULL;
    ALTER TABLE stories ADD COLUMN child_id UUID REFERENCES children(id) ON DELETE SET NULL;

    DROP INDEX IF EXISTS stories_unique_with_user;
    DROP INDEX IF EXISTS stories_unique_no_user;

    CREATE UNIQUE INDEX stories_unique_with_child
        ON stories (date, princess, story_type, language, child_id)
        WHERE child_id IS NOT NULL;

    CREATE UNIQUE INDEX stories_unique_with_user_no_child
        ON stories (date, princess, story_type, language, user_id)
        WHERE user_id IS NOT NULL AND child_id IS NULL;

    CREATE UNIQUE INDEX stories_unique_no_user_no_child
        ON stories (date, princess, story_type, language)
        WHERE user_id IS NULL AND child_id IS NULL;

  002_add_children.down.sql: |
    DROP INDEX IF EXISTS stories_unique_with_child;
    DROP INDEX IF EXISTS stories_unique_with_user_no_child;
    DROP INDEX IF EXISTS stories_unique_no_user_no_child;
    ALTER TABLE stories DROP COLUMN IF EXISTS child_id;
    ALTER TABLE briefs DROP COLUMN IF EXISTS child_id;
    DROP TABLE IF EXISTS children;
```

- [ ] **Step 2: Write Job**

```yaml
# k8s/migrate/job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate
  namespace: postgres
spec:
  ttlSecondsAfterFinished: 300
  template:
    spec:
      restartPolicy: OnFailure
      initContainers:
        - name: wait-for-postgres
          image: postgres:16
          command:
            - sh
            - -c
            - |
              until pg_isready -h postgres.postgres.svc.cluster.local -U royal -d royal_dispatch; do
                echo "Waiting for postgres..."; sleep 2;
              done
          env:
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: POSTGRES_PASSWORD
      containers:
        - name: migrate
          image: migrate/migrate
          args:
            - -path=/migrations
            - -database=postgres://royal:$(POSTGRES_PASSWORD)@postgres.postgres.svc.cluster.local:5432/royal_dispatch?sslmode=disable
            - up
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: POSTGRES_PASSWORD
          volumeMounts:
            - name: migrations
              mountPath: /migrations
      volumes:
        - name: migrations
          configMap:
            name: migrations
```

- [ ] **Step 3: Apply and verify**

```bash
kubectl apply -f k8s/migrate/configmap.yaml
kubectl apply -f k8s/migrate/job.yaml
```

Watch job progress:
```bash
kubectl -n postgres get job migrate -w
```
Expected: `COMPLETIONS=1/1`

Check logs:
```bash
kubectl -n postgres logs job/migrate -c migrate
```
Expected: `1/u 001_init (...)` and `2/u 002_add_children (...)` — no errors.

Verify tables exist:
```bash
kubectl -n postgres exec -it postgres-0 -- psql -U royal -d royal_dispatch -c "\dt"
```
Expected: tables `users`, `briefs`, `stories`, `user_preferences`, `children` listed.

- [ ] **Step 4: Commit**

```bash
git add k8s/migrate/
git commit -m "chore: add migrate Job and ConfigMap with SQL migrations"
```

---

## Task 8: Qdrant deployment

**Files:**
- Create: `k8s/qdrant/namespace.yaml`
- Create: `k8s/qdrant/pvc.yaml`
- Create: `k8s/qdrant/deployment.yaml`
- Create: `k8s/qdrant/service.yaml`

- [ ] **Step 1: Write namespace**

```yaml
# k8s/qdrant/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: qdrant
```

- [ ] **Step 2: Write PVC**

```yaml
# k8s/qdrant/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: qdrant-data
  namespace: qdrant
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: ssd
  resources:
    requests:
      storage: 5Gi
```

- [ ] **Step 3: Write deployment**

```yaml
# k8s/qdrant/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qdrant
  namespace: qdrant
spec:
  replicas: 1
  selector:
    matchLabels:
      app: qdrant
  template:
    metadata:
      labels:
        app: qdrant
    spec:
      containers:
        - name: qdrant
          image: qdrant/qdrant:v1.11.5
          ports:
            - containerPort: 6333
              name: http
            - containerPort: 6334
              name: grpc
          volumeMounts:
            - name: qdrant-data
              mountPath: /qdrant/storage
          readinessProbe:
            httpGet:
              path: /healthz
              port: 6333
            initialDelaySeconds: 10
            periodSeconds: 5
      volumes:
        - name: qdrant-data
          persistentVolumeClaim:
            claimName: qdrant-data
```

- [ ] **Step 4: Write service**

```yaml
# k8s/qdrant/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: qdrant
  namespace: qdrant
spec:
  selector:
    app: qdrant
  ports:
    - name: http
      port: 6333
      targetPort: 6333
    - name: grpc
      port: 6334
      targetPort: 6334
```

- [ ] **Step 5: Apply and verify**

```bash
kubectl apply -f k8s/qdrant/namespace.yaml
kubectl apply -f k8s/qdrant/pvc.yaml
kubectl apply -f k8s/qdrant/deployment.yaml
kubectl apply -f k8s/qdrant/service.yaml
kubectl -n qdrant rollout status deploy/qdrant
```
Expected: `successfully rolled out`

```bash
kubectl -n qdrant exec -it deploy/qdrant -- curl -s http://localhost:6333/healthz
```
Expected: `{"title":"qdrant - vector search engine","version":"..."}`

- [ ] **Step 6: Commit**

```bash
git add k8s/qdrant/
git commit -m "chore: add Qdrant deployment with ssd PVC"
```

---

## Task 9: n8n deployment

**Files:**
- Create: `k8s/n8n/namespace.yaml`
- Create: `k8s/n8n/pvc.yaml`
- Create: `k8s/n8n/externalsecret.yaml`
- Create: `k8s/n8n/deployment.yaml`
- Create: `k8s/n8n/service.yaml`

- [ ] **Step 1: Write namespace**

```yaml
# k8s/n8n/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: n8n
```

- [ ] **Step 2: Write PVC**

```yaml
# k8s/n8n/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: n8n-data
  namespace: n8n
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: sata
  resources:
    requests:
      storage: 1Gi
```

- [ ] **Step 3: Write ExternalSecret**

```yaml
# k8s/n8n/externalsecret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: n8n-secret
  namespace: n8n
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: n8n-secret
    creationPolicy: Owner
  data:
    - secretKey: TELEGRAM_BOT_TOKEN
      remoteRef:
        key: royal-dispatch
        property: TELEGRAM_BOT_TOKEN
    - secretKey: PARENT_CHAT_ID
      remoteRef:
        key: royal-dispatch
        property: PARENT_CHAT_ID
    - secretKey: N8N_BASIC_AUTH_USER
      remoteRef:
        key: royal-dispatch
        property: N8N_BASIC_AUTH_USER
    - secretKey: N8N_BASIC_AUTH_PASSWORD
      remoteRef:
        key: royal-dispatch
        property: N8N_BASIC_AUTH_PASSWORD
```

- [ ] **Step 4: Write deployment**

```yaml
# k8s/n8n/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n
  namespace: n8n
spec:
  replicas: 1
  selector:
    matchLabels:
      app: n8n
  template:
    metadata:
      labels:
        app: n8n
    spec:
      containers:
        - name: n8n
          image: n8nio/n8n:latest
          ports:
            - containerPort: 5678
          env:
            - name: N8N_BLOCK_ENV_ACCESS_IN_NODE
              value: "false"
            - name: N8N_BASIC_AUTH_ACTIVE
              value: "true"
            - name: BACKEND_URL
              value: "http://backend.royal-dispatch.svc.cluster.local:8000"
            - name: N8N_BASIC_AUTH_USER
              valueFrom:
                secretKeyRef:
                  name: n8n-secret
                  key: N8N_BASIC_AUTH_USER
            - name: N8N_BASIC_AUTH_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: n8n-secret
                  key: N8N_BASIC_AUTH_PASSWORD
            - name: TELEGRAM_BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: n8n-secret
                  key: TELEGRAM_BOT_TOKEN
            - name: PARENT_CHAT_ID
              valueFrom:
                secretKeyRef:
                  name: n8n-secret
                  key: PARENT_CHAT_ID
          volumeMounts:
            - name: n8n-data
              mountPath: /home/node/.n8n
          readinessProbe:
            httpGet:
              path: /healthz
              port: 5678
            initialDelaySeconds: 15
            periodSeconds: 10
      volumes:
        - name: n8n-data
          persistentVolumeClaim:
            claimName: n8n-data
```

- [ ] **Step 5: Write service**

```yaml
# k8s/n8n/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: n8n
  namespace: n8n
spec:
  selector:
    app: n8n
  ports:
    - port: 5678
      targetPort: 5678
```

- [ ] **Step 6: Apply and verify**

```bash
kubectl apply -f k8s/n8n/namespace.yaml
kubectl apply -f k8s/n8n/pvc.yaml
kubectl apply -f k8s/n8n/externalsecret.yaml
sleep 10
kubectl -n n8n get secret n8n-secret
kubectl apply -f k8s/n8n/deployment.yaml
kubectl apply -f k8s/n8n/service.yaml
kubectl -n n8n rollout status deploy/n8n
```
Expected: `successfully rolled out`

- [ ] **Step 7: Commit**

```bash
git add k8s/n8n/
git commit -m "chore: add n8n deployment with sata PVC and Vault secrets"
```

---

## Task 10: Backend — manifests and image build

**Files:**
- Create: `k8s/royal-dispatch/namespace.yaml`
- Create: `k8s/backend/externalsecret.yaml`
- Create: `k8s/backend/deployment.yaml`
- Create: `k8s/backend/service.yaml`

- [ ] **Step 1: Write royal-dispatch namespace**

```yaml
# k8s/royal-dispatch/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: royal-dispatch
```

- [ ] **Step 2: Write backend ExternalSecret**

```yaml
# k8s/backend/externalsecret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: backend-secret
  namespace: royal-dispatch
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: backend-secret
    creationPolicy: Owner
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: royal-dispatch
        property: ANTHROPIC_API_KEY
    - secretKey: ELEVENLABS_API_KEY
      remoteRef:
        key: royal-dispatch
        property: ELEVENLABS_API_KEY
    - secretKey: SUPABASE_URL
      remoteRef:
        key: royal-dispatch
        property: SUPABASE_URL
    - secretKey: SUPABASE_SERVICE_KEY
      remoteRef:
        key: royal-dispatch
        property: SUPABASE_SERVICE_KEY
    - secretKey: SUPABASE_STORAGE_BUCKET
      remoteRef:
        key: royal-dispatch
        property: SUPABASE_STORAGE_BUCKET
    - secretKey: OPENAI_API_KEY
      remoteRef:
        key: royal-dispatch
        property: OPENAI_API_KEY
    - secretKey: DATABASE_URL
      remoteRef:
        key: royal-dispatch
        property: DATABASE_URL
```

- [ ] **Step 3: Write backend deployment**

```yaml
# k8s/backend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: royal-dispatch
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: quydoan/royal-dispatch-backend:latest
          ports:
            - containerPort: 8000
          env:
            - name: QDRANT_URL
              value: "http://qdrant.qdrant.svc.cluster.local:6333"
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: ANTHROPIC_API_KEY
            - name: ELEVENLABS_API_KEY
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: ELEVENLABS_API_KEY
            - name: SUPABASE_URL
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: SUPABASE_URL
            - name: SUPABASE_SERVICE_KEY
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: SUPABASE_SERVICE_KEY
            - name: SUPABASE_STORAGE_BUCKET
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: SUPABASE_STORAGE_BUCKET
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: OPENAI_API_KEY
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: DATABASE_URL
          readinessProbe:
            httpGet:
              path: /docs
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /docs
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
```

- [ ] **Step 4: Write backend service**

```yaml
# k8s/backend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: royal-dispatch
spec:
  selector:
    app: backend
  ports:
    - port: 8000
      targetPort: 8000
```

- [ ] **Step 5: Build and push backend image**

From the repo root:
```bash
docker build -f backend/Dockerfile -t quydoan/royal-dispatch-backend:latest .
docker push quydoan/royal-dispatch-backend:latest
```

- [ ] **Step 6: Apply and verify**

```bash
kubectl apply -f k8s/royal-dispatch/namespace.yaml
kubectl apply -f k8s/backend/externalsecret.yaml
sleep 10
kubectl -n royal-dispatch get secret backend-secret
kubectl apply -f k8s/backend/deployment.yaml
kubectl apply -f k8s/backend/service.yaml
kubectl -n royal-dispatch rollout status deploy/backend
```
Expected: `successfully rolled out`

```bash
kubectl -n royal-dispatch exec -it deploy/backend -- curl -s http://localhost:8000/docs | head -5
```
Expected: HTML content (FastAPI Swagger UI).

- [ ] **Step 7: Commit**

```bash
git add k8s/royal-dispatch/ k8s/backend/
git commit -m "chore: add backend deployment with Vault secrets"
```

---

## Task 11: Frontend — update Dockerfile and build image

**Files:**
- Modify: `frontend/Dockerfile` — add ARG/ENV for NEXT_PUBLIC_API_URL
- Create: `k8s/frontend/deployment.yaml`
- Create: `k8s/frontend/service.yaml`

- [ ] **Step 1: Update frontend Dockerfile to accept NEXT_PUBLIC_API_URL as build arg**

In `frontend/Dockerfile`, add the following two lines in the `builder` stage, after the `COPY . .` line and before the `RUN ... build` block:

```dockerfile
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
```

The builder stage should look like:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ENV NEXT_TELEMETRY_DISABLED 1

RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  else npm run build; \
  fi
```

- [ ] **Step 2: Build and push frontend image**

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://api.royal.local \
  -f frontend/Dockerfile \
  -t quydoan/royal-dispatch-frontend:latest \
  ./frontend
docker push quydoan/royal-dispatch-frontend:latest
```

- [ ] **Step 3: Write frontend deployment**

```yaml
# k8s/frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: royal-dispatch
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: quydoan/royal-dispatch-frontend:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 10
```

- [ ] **Step 4: Write frontend service**

```yaml
# k8s/frontend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: royal-dispatch
spec:
  selector:
    app: frontend
  ports:
    - port: 3000
      targetPort: 3000
```

- [ ] **Step 5: Apply and verify**

```bash
kubectl apply -f k8s/frontend/deployment.yaml
kubectl apply -f k8s/frontend/service.yaml
kubectl -n royal-dispatch rollout status deploy/frontend
```
Expected: `successfully rolled out`

- [ ] **Step 6: Commit**

```bash
git add frontend/Dockerfile k8s/frontend/
git commit -m "chore: add frontend deployment; bake NEXT_PUBLIC_API_URL at build time"
```

---

## Task 12: Admin — update Dockerfile and build image

**Files:**
- Modify: `admin/Dockerfile` — add ARG/ENV for NEXT_PUBLIC_API_URL
- Create: `k8s/admin/deployment.yaml`
- Create: `k8s/admin/service.yaml`

- [ ] **Step 1: Update admin Dockerfile to accept NEXT_PUBLIC_API_URL as build arg**

In `admin/Dockerfile`, add the following two lines in the `builder` stage, after the `COPY . .` line and before `RUN npm run build`:

```dockerfile
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
```

The builder stage should look like:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build
```

- [ ] **Step 2: Build and push admin image**

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://api.royal.local \
  -f admin/Dockerfile \
  -t quydoan/royal-dispatch-admin:latest \
  ./admin
docker push quydoan/royal-dispatch-admin:latest
```

- [ ] **Step 3: Write admin deployment**

```yaml
# k8s/admin/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: admin
  namespace: royal-dispatch
spec:
  replicas: 1
  selector:
    matchLabels:
      app: admin
  template:
    metadata:
      labels:
        app: admin
    spec:
      containers:
        - name: admin
          image: quydoan/royal-dispatch-admin:latest
          ports:
            - containerPort: 3001
          env:
            - name: NODE_ENV
              value: production
          readinessProbe:
            httpGet:
              path: /
              port: 3001
            initialDelaySeconds: 15
            periodSeconds: 10
```

- [ ] **Step 4: Write admin service**

```yaml
# k8s/admin/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: admin
  namespace: royal-dispatch
spec:
  selector:
    app: admin
  ports:
    - port: 3001
      targetPort: 3001
```

- [ ] **Step 5: Apply and verify**

```bash
kubectl apply -f k8s/admin/deployment.yaml
kubectl apply -f k8s/admin/service.yaml
kubectl -n royal-dispatch rollout status deploy/admin
```
Expected: `successfully rolled out`

- [ ] **Step 6: Commit**

```bash
git add admin/Dockerfile k8s/admin/
git commit -m "chore: add admin deployment; bake NEXT_PUBLIC_API_URL at build time"
```

---

## Task 13: Traefik IngressRoutes

**Files:**
- Create: `k8s/ingress/ingressroute-frontend.yaml`
- Create: `k8s/ingress/ingressroute-admin.yaml`
- Create: `k8s/ingress/ingressroute-backend.yaml`
- Create: `k8s/ingress/ingressroute-n8n.yaml`
- Create: `k8s/ingress/ingressroute-qdrant.yaml`

- [ ] **Step 1: Write frontend IngressRoute**

```yaml
# k8s/ingress/ingressroute-frontend.yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: frontend
  namespace: royal-dispatch
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`royal.local`)
      kind: Rule
      services:
        - name: frontend
          port: 3000
```

- [ ] **Step 2: Write admin IngressRoute**

```yaml
# k8s/ingress/ingressroute-admin.yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: admin
  namespace: royal-dispatch
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`admin.royal.local`)
      kind: Rule
      services:
        - name: admin
          port: 3001
```

- [ ] **Step 3: Write backend IngressRoute**

```yaml
# k8s/ingress/ingressroute-backend.yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: backend
  namespace: royal-dispatch
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`api.royal.local`)
      kind: Rule
      services:
        - name: backend
          port: 8000
```

- [ ] **Step 4: Write n8n IngressRoute**

```yaml
# k8s/ingress/ingressroute-n8n.yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: n8n
  namespace: n8n
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`n8n.royal.local`)
      kind: Rule
      services:
        - name: n8n
          port: 5678
```

- [ ] **Step 5: Write qdrant IngressRoute**

```yaml
# k8s/ingress/ingressroute-qdrant.yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: qdrant
  namespace: qdrant
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`qdrant.royal.local`)
      kind: Rule
      services:
        - name: qdrant
          port: 6333
```

- [ ] **Step 6: Apply all IngressRoutes**

```bash
kubectl apply -f k8s/ingress/
```

- [ ] **Step 7: Commit**

```bash
git add k8s/ingress/
git commit -m "chore: add Traefik IngressRoutes for all services"
```

---

## Task 14: /etc/hosts and end-to-end verification

- [ ] **Step 1: Add hostnames to /etc/hosts**

```bash
sudo tee -a /etc/hosts <<'EOF'
127.0.0.1 royal.local admin.royal.local api.royal.local n8n.royal.local qdrant.royal.local
EOF
```

- [ ] **Step 2: Verify backend API**

```bash
curl -s http://api.royal.local/docs | head -5
```
Expected: FastAPI Swagger UI HTML.

```bash
curl -s http://api.royal.local/story/today
```
Expected: JSON like `{"date":"...","cached":{}}`.

- [ ] **Step 3: Verify frontend**

```bash
curl -s -o /dev/null -w "%{http_code}" http://royal.local/
```
Expected: `200`

- [ ] **Step 4: Verify admin panel**

```bash
curl -s -o /dev/null -w "%{http_code}" http://admin.royal.local/
```
Expected: `200`

- [ ] **Step 5: Verify n8n**

```bash
curl -s -o /dev/null -w "%{http_code}" http://n8n.royal.local/healthz
```
Expected: `200`

- [ ] **Step 6: Verify qdrant**

```bash
curl -s http://qdrant.royal.local/healthz
```
Expected: `{"title":"qdrant - vector search engine","version":"..."}`

- [ ] **Step 7: Verify all pods are running**

```bash
kubectl get pods -A | grep -v "Running\|Completed"
```
Expected: no output (all pods Running or Completed).

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "chore: complete k8s deployment for local k3s cluster"
```

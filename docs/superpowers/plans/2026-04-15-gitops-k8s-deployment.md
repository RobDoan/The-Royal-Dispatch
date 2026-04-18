# GitOps K8s Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy The Royal Dispatch to rackspace + homelander clusters via the Flux CD GitOps repo, adding PostgreSQL and MinIO as shared infrastructure, and creating a GitHub Actions CI/CD pipeline for image builds.

**Architecture:** Flux CD + Kustomize with base/overlays pattern. PostgreSQL and MinIO added as infrastructure HelmReleases. Royal Dispatch app uses plain K8s manifests (Deployments, Services, Ingress, ConfigMap, ExternalSecrets). CI pipeline builds Docker images and commits tag updates to the GitOps repo.

**Tech Stack:** Flux CD, Kustomize, Helm (Bitnami charts), Kubernetes, Vault + ESO, GitHub Actions, Docker

---

## File Structure

### GitOps repo (`/Users/quydoan/Projects/k8s/rackspace`)

**New files:**
- `infrastructure/postgres/base/{kustomization,helmrepository,helmrelease,externalsecret}.yaml`
- `infrastructure/postgres/overlays/{rackspace,homelander}/{kustomization,helmrelease-patch}.yaml`
- `infrastructure/minio/base/{kustomization,helmrepository,helmrelease,ingress,externalsecret}.yaml`
- `infrastructure/minio/overlays/{rackspace,homelander}/{kustomization,helmrelease-patch,ingress-patch}.yaml`
- `apps/royal-dispatch/base/{kustomization,backend-deployment,backend-service,frontend-deployment,frontend-service,admin-deployment,admin-service,ingress,externalsecret,externalsecret-postgres,externalsecret-minio,configmap}.yaml`
- `apps/royal-dispatch/overlays/{rackspace,homelander}/{kustomization,configmap-patch,ingress-patch}.yaml`
- `clusters/{rackspace,homelander}/{postgres,minio,royal-dispatch}.yaml`

**Modified files:**
- `namespaces/namespaces.yaml` — add postgres, minio, royal-dispatch
- `clusters/rackspace/kustomization.yaml` — add postgres, minio, royal-dispatch resources
- `clusters/homelander/kustomization.yaml` — add postgres, minio, royal-dispatch resources

### App repo (`/Users/quydoan/Projects/ai-agents/the-royal-dispatch`)

**New files:**
- `.github/workflows/build-and-push.yaml`

---

### Task 1: Add Namespaces

**Files:**
- Modify: `/Users/quydoan/Projects/k8s/rackspace/namespaces/namespaces.yaml`

- [ ] **Step 1: Add postgres, minio, royal-dispatch namespaces**

Append to the end of `namespaces/namespaces.yaml`:

```yaml
---
apiVersion: v1
kind: Namespace
metadata:
  name: postgres
---
apiVersion: v1
kind: Namespace
metadata:
  name: minio
---
apiVersion: v1
kind: Namespace
metadata:
  name: royal-dispatch
```

- [ ] **Step 2: Verify**

Run: `cat namespaces/namespaces.yaml | grep "name:" | wc -l`
Expected: 10 (7 existing + 3 new)

- [ ] **Step 3: Commit**

```bash
cd /Users/quydoan/Projects/k8s/rackspace
git add namespaces/namespaces.yaml
git commit -m "feat: add postgres, minio, royal-dispatch namespaces"
```

---

### Task 2: PostgreSQL Infrastructure

**Files:**
- Create: `infrastructure/postgres/base/kustomization.yaml`
- Create: `infrastructure/postgres/base/helmrepository.yaml`
- Create: `infrastructure/postgres/base/helmrelease.yaml`
- Create: `infrastructure/postgres/base/externalsecret.yaml`
- Create: `infrastructure/postgres/overlays/rackspace/kustomization.yaml`
- Create: `infrastructure/postgres/overlays/rackspace/helmrelease-patch.yaml`
- Create: `infrastructure/postgres/overlays/homelander/kustomization.yaml`
- Create: `infrastructure/postgres/overlays/homelander/helmrelease-patch.yaml`

- [ ] **Step 1: Create base kustomization**

Create `infrastructure/postgres/base/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - helmrepository.yaml
  - externalsecret.yaml
  - helmrelease.yaml
```

- [ ] **Step 2: Create HelmRepository**

Create `infrastructure/postgres/base/helmrepository.yaml`:

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: bitnami-postgresql
  namespace: flux-system
spec:
  type: oci
  interval: 1h
  url: oci://registry-1.docker.io/bitnamicharts
```

- [ ] **Step 3: Create ExternalSecret**

Create `infrastructure/postgres/base/externalsecret.yaml`:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: postgres-secrets
  namespace: postgres
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: postgres-secrets
    creationPolicy: Owner
  data:
    - secretKey: postgres-password
      remoteRef:
        key: postgres
        property: postgres_password
    - secretKey: password
      remoteRef:
        key: postgres
        property: password
```

- [ ] **Step 4: Create HelmRelease**

Create `infrastructure/postgres/base/helmrelease.yaml`:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: postgres
  namespace: postgres
spec:
  interval: 30m
  timeout: 5m
  chart:
    spec:
      chart: postgresql
      version: ">=15.0.0 <17.0.0"
      sourceRef:
        kind: HelmRepository
        name: bitnami-postgresql
        namespace: flux-system
  install:
    remediation:
      retries: 3
  values:
    auth:
      username: royal
      database: royal_dispatch
      existingSecret: postgres-secrets
      secretKeys:
        adminPasswordKey: postgres-password
        userPasswordKey: password
    primary:
      persistence:
        enabled: true
        size: 10Gi
```

- [ ] **Step 5: Create rackspace overlay**

Create `infrastructure/postgres/overlays/rackspace/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - path: helmrelease-patch.yaml
```

Create `infrastructure/postgres/overlays/rackspace/helmrelease-patch.yaml`:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: postgres
  namespace: postgres
spec:
  values:
    primary:
      persistence:
        storageClass: ssd
```

- [ ] **Step 6: Create homelander overlay**

Create `infrastructure/postgres/overlays/homelander/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - path: helmrelease-patch.yaml
```

Create `infrastructure/postgres/overlays/homelander/helmrelease-patch.yaml`:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: postgres
  namespace: postgres
spec:
  values:
    primary:
      persistence:
        storageClass: local-path
```

- [ ] **Step 7: Verify kustomize build**

Run: `cd /Users/quydoan/Projects/k8s/rackspace && kustomize build infrastructure/postgres/overlays/rackspace`
Expected: renders HelmRepository, ExternalSecret, HelmRelease with `storageClass: ssd`

Run: `kustomize build infrastructure/postgres/overlays/homelander`
Expected: same but with `storageClass: local-path`

- [ ] **Step 8: Commit**

```bash
cd /Users/quydoan/Projects/k8s/rackspace
git add infrastructure/postgres/
git commit -m "feat: add PostgreSQL as shared infrastructure (Bitnami Helm)"
```

---

### Task 3: MinIO Infrastructure

**Files:**
- Create: `infrastructure/minio/base/kustomization.yaml`
- Create: `infrastructure/minio/base/helmrepository.yaml`
- Create: `infrastructure/minio/base/helmrelease.yaml`
- Create: `infrastructure/minio/base/ingress.yaml`
- Create: `infrastructure/minio/base/externalsecret.yaml`
- Create: `infrastructure/minio/overlays/rackspace/kustomization.yaml`
- Create: `infrastructure/minio/overlays/rackspace/helmrelease-patch.yaml`
- Create: `infrastructure/minio/overlays/rackspace/ingress-patch.yaml`
- Create: `infrastructure/minio/overlays/homelander/kustomization.yaml`
- Create: `infrastructure/minio/overlays/homelander/helmrelease-patch.yaml`
- Create: `infrastructure/minio/overlays/homelander/ingress-patch.yaml`

- [ ] **Step 1: Create base kustomization**

Create `infrastructure/minio/base/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - helmrepository.yaml
  - externalsecret.yaml
  - helmrelease.yaml
  - ingress.yaml
```

- [ ] **Step 2: Create HelmRepository**

Create `infrastructure/minio/base/helmrepository.yaml`:

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: bitnami-minio
  namespace: flux-system
spec:
  type: oci
  interval: 1h
  url: oci://registry-1.docker.io/bitnamicharts
```

- [ ] **Step 3: Create ExternalSecret**

Create `infrastructure/minio/base/externalsecret.yaml`:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: minio-secrets
  namespace: minio
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: minio-secrets
    creationPolicy: Owner
  data:
    - secretKey: root-user
      remoteRef:
        key: minio
        property: root_user
    - secretKey: root-password
      remoteRef:
        key: minio
        property: root_password
```

- [ ] **Step 4: Create HelmRelease**

Create `infrastructure/minio/base/helmrelease.yaml`:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: minio
  namespace: minio
spec:
  interval: 30m
  timeout: 5m
  chart:
    spec:
      chart: minio
      version: ">=14.0.0 <16.0.0"
      sourceRef:
        kind: HelmRepository
        name: bitnami-minio
        namespace: flux-system
  install:
    remediation:
      retries: 3
  values:
    auth:
      existingSecret: minio-secrets
    defaultBuckets: "royal-audio"
    persistence:
      enabled: true
      size: 20Gi
```

- [ ] **Step 5: Create base Ingress**

Create `infrastructure/minio/base/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minio-api
  namespace: minio
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - minio.example.com
      secretName: minio-api-tls
  rules:
    - host: minio.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: minio
                port:
                  number: 9000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minio-console
  namespace: minio
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - minio-console.example.com
      secretName: minio-console-tls
  rules:
    - host: minio-console.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: minio
                port:
                  number: 9001
```

- [ ] **Step 6: Create rackspace overlay**

Create `infrastructure/minio/overlays/rackspace/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - path: helmrelease-patch.yaml
  - path: ingress-patch.yaml
```

Create `infrastructure/minio/overlays/rackspace/helmrelease-patch.yaml`:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: minio
  namespace: minio
spec:
  values:
    persistence:
      storageClass: ssd
```

Create `infrastructure/minio/overlays/rackspace/ingress-patch.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minio-api
  namespace: minio
spec:
  tls:
    - hosts:
        - minio.quybits.com
      secretName: minio-api-tls
  rules:
    - host: minio.quybits.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: minio
                port:
                  number: 9000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minio-console
  namespace: minio
spec:
  tls:
    - hosts:
        - minio-console.quybits.com
      secretName: minio-console-tls
  rules:
    - host: minio-console.quybits.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: minio
                port:
                  number: 9001
```

- [ ] **Step 7: Create homelander overlay**

Create `infrastructure/minio/overlays/homelander/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - path: helmrelease-patch.yaml
  - path: ingress-patch.yaml
```

Create `infrastructure/minio/overlays/homelander/helmrelease-patch.yaml`:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: minio
  namespace: minio
spec:
  values:
    persistence:
      storageClass: local-path
```

Create `infrastructure/minio/overlays/homelander/ingress-patch.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minio-api
  namespace: minio
spec:
  tls:
    - hosts:
        - minio.homelander.local
      secretName: minio-api-tls
  rules:
    - host: minio.homelander.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: minio
                port:
                  number: 9000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minio-console
  namespace: minio
spec:
  tls:
    - hosts:
        - minio-console.homelander.local
      secretName: minio-console-tls
  rules:
    - host: minio-console.homelander.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: minio
                port:
                  number: 9001
```

- [ ] **Step 8: Verify kustomize build**

Run: `cd /Users/quydoan/Projects/k8s/rackspace && kustomize build infrastructure/minio/overlays/rackspace`
Expected: renders HelmRepository, ExternalSecret, HelmRelease with `storageClass: ssd`, two Ingresses with `quybits.com` domains

Run: `kustomize build infrastructure/minio/overlays/homelander`
Expected: same but `local-path` and `homelander.local` domains

- [ ] **Step 9: Commit**

```bash
cd /Users/quydoan/Projects/k8s/rackspace
git add infrastructure/minio/
git commit -m "feat: add MinIO as shared infrastructure (Bitnami Helm)"
```

---

### Task 4: Royal Dispatch App — Base Manifests

**Files:**
- Create: `apps/royal-dispatch/base/kustomization.yaml`
- Create: `apps/royal-dispatch/base/configmap.yaml`
- Create: `apps/royal-dispatch/base/externalsecret.yaml`
- Create: `apps/royal-dispatch/base/externalsecret-postgres.yaml`
- Create: `apps/royal-dispatch/base/externalsecret-minio.yaml`
- Create: `apps/royal-dispatch/base/backend-deployment.yaml`
- Create: `apps/royal-dispatch/base/backend-service.yaml`
- Create: `apps/royal-dispatch/base/frontend-deployment.yaml`
- Create: `apps/royal-dispatch/base/frontend-service.yaml`
- Create: `apps/royal-dispatch/base/admin-deployment.yaml`
- Create: `apps/royal-dispatch/base/admin-service.yaml`
- Create: `apps/royal-dispatch/base/ingress.yaml`

- [ ] **Step 1: Create base kustomization**

Create `apps/royal-dispatch/base/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - configmap.yaml
  - externalsecret.yaml
  - externalsecret-postgres.yaml
  - externalsecret-minio.yaml
  - backend-deployment.yaml
  - backend-service.yaml
  - frontend-deployment.yaml
  - frontend-service.yaml
  - admin-deployment.yaml
  - admin-service.yaml
  - ingress.yaml
images:
  - name: quydoan/royal-dispatch-backend
    newTag: latest
  - name: quydoan/royal-dispatch-frontend
    newTag: latest
  - name: quydoan/royal-dispatch-admin
    newTag: latest
```

- [ ] **Step 2: Create ConfigMap**

Create `apps/royal-dispatch/base/configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: royal-dispatch-config
  namespace: royal-dispatch
data:
  S3_ENDPOINT_URL: "http://minio.minio.svc.cluster.local:9000"
  S3_PUBLIC_URL: "https://minio.example.com"
  S3_BUCKET: "royal-audio"
  QDRANT_URL: "http://qdrant.qdrant.svc.cluster.local:6333"
  USER_TIMEZONE: "America/Los_Angeles"
  NEXT_PUBLIC_API_URL: "https://royal-dispatch-api.example.com"
  NEXT_PUBLIC_FRONTEND_URL: "https://royal-dispatch.example.com"
```

- [ ] **Step 3: Create ExternalSecrets**

Create `apps/royal-dispatch/base/externalsecret.yaml`:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: royal-dispatch-secrets
  namespace: royal-dispatch
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: royal-dispatch-secrets
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
    - secretKey: OPENAI_API_KEY
      remoteRef:
        key: royal-dispatch
        property: OPENAI_API_KEY
```

Create `apps/royal-dispatch/base/externalsecret-postgres.yaml`:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: royal-dispatch-postgres
  namespace: royal-dispatch
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: royal-dispatch-postgres
    creationPolicy: Owner
  data:
    - secretKey: password
      remoteRef:
        key: postgres
        property: password
```

Create `apps/royal-dispatch/base/externalsecret-minio.yaml`:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: royal-dispatch-minio
  namespace: royal-dispatch
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: royal-dispatch-minio
    creationPolicy: Owner
  data:
    - secretKey: S3_ACCESS_KEY
      remoteRef:
        key: minio
        property: root_user
    - secretKey: S3_SECRET_KEY
      remoteRef:
        key: minio
        property: root_password
```

- [ ] **Step 4: Create backend Deployment**

Create `apps/royal-dispatch/base/backend-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: royal-dispatch
  labels:
    app: royal-dispatch
    component: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: royal-dispatch
      component: backend
  template:
    metadata:
      labels:
        app: royal-dispatch
        component: backend
    spec:
      initContainers:
        - name: copy-migrations
          image: quydoan/royal-dispatch-backend
          command: ['sh', '-c', 'cp -r /app/backend/db/migrations/* /migrations/']
          volumeMounts:
            - name: migrations
              mountPath: /migrations
        - name: migrate
          image: migrate/migrate
          args:
            - "-path=/migrations"
            - "-database=$(DATABASE_URL)"
            - "up"
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: royal-dispatch-postgres
                  key: password
            - name: DATABASE_URL
              value: "postgresql://royal:$(POSTGRES_PASSWORD)@postgres-postgresql.postgres.svc.cluster.local:5432/royal_dispatch?sslmode=disable"
          volumeMounts:
            - name: migrations
              mountPath: /migrations
      containers:
        - name: backend
          image: quydoan/royal-dispatch-backend
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: royal-dispatch-config
            - secretRef:
                name: royal-dispatch-secrets
            - secretRef:
                name: royal-dispatch-minio
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: royal-dispatch-postgres
                  key: password
            - name: DATABASE_URL
              value: "postgresql://royal:$(POSTGRES_PASSWORD)@postgres-postgresql.postgres.svc.cluster.local:5432/royal_dispatch"
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
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              memory: 512Mi
      volumes:
        - name: migrations
          emptyDir: {}
```

- [ ] **Step 5: Create backend Service**

Create `apps/royal-dispatch/base/backend-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: royal-dispatch
  labels:
    app: royal-dispatch
    component: backend
spec:
  selector:
    app: royal-dispatch
    component: backend
  ports:
    - port: 8000
      targetPort: 8000
```

- [ ] **Step 6: Create frontend Deployment**

Create `apps/royal-dispatch/base/frontend-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: royal-dispatch
  labels:
    app: royal-dispatch
    component: frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: royal-dispatch
      component: frontend
  template:
    metadata:
      labels:
        app: royal-dispatch
        component: frontend
    spec:
      containers:
        - name: frontend
          image: quydoan/royal-dispatch-frontend
          ports:
            - containerPort: 3000
          env:
            - name: NEXT_PUBLIC_API_URL
              valueFrom:
                configMapKeyRef:
                  name: royal-dispatch-config
                  key: NEXT_PUBLIC_API_URL
            - name: INTERNAL_API_URL
              value: "http://backend.royal-dispatch.svc.cluster.local:8000"
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              memory: 256Mi
```

- [ ] **Step 7: Create frontend Service**

Create `apps/royal-dispatch/base/frontend-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: royal-dispatch
  labels:
    app: royal-dispatch
    component: frontend
spec:
  selector:
    app: royal-dispatch
    component: frontend
  ports:
    - port: 3000
      targetPort: 3000
```

- [ ] **Step 8: Create admin Deployment**

Create `apps/royal-dispatch/base/admin-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: admin
  namespace: royal-dispatch
  labels:
    app: royal-dispatch
    component: admin
spec:
  replicas: 1
  selector:
    matchLabels:
      app: royal-dispatch
      component: admin
  template:
    metadata:
      labels:
        app: royal-dispatch
        component: admin
    spec:
      containers:
        - name: admin
          image: quydoan/royal-dispatch-admin
          ports:
            - containerPort: 3001
          env:
            - name: NEXT_PUBLIC_API_URL
              valueFrom:
                configMapKeyRef:
                  name: royal-dispatch-config
                  key: NEXT_PUBLIC_API_URL
            - name: NEXT_PUBLIC_FRONTEND_URL
              valueFrom:
                configMapKeyRef:
                  name: royal-dispatch-config
                  key: NEXT_PUBLIC_FRONTEND_URL
            - name: INTERNAL_API_URL
              value: "http://backend.royal-dispatch.svc.cluster.local:8000"
          readinessProbe:
            httpGet:
              path: /
              port: 3001
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 3001
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              memory: 256Mi
```

- [ ] **Step 9: Create admin Service**

Create `apps/royal-dispatch/base/admin-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: admin
  namespace: royal-dispatch
  labels:
    app: royal-dispatch
    component: admin
spec:
  selector:
    app: royal-dispatch
    component: admin
  ports:
    - port: 3001
      targetPort: 3001
```

- [ ] **Step 10: Create Ingress**

Create `apps/royal-dispatch/base/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: royal-dispatch-api
  namespace: royal-dispatch
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - royal-dispatch-api.example.com
      secretName: royal-dispatch-api-tls
  rules:
    - host: royal-dispatch-api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: backend
                port:
                  number: 8000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: royal-dispatch-frontend
  namespace: royal-dispatch
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - royal-dispatch.example.com
      secretName: royal-dispatch-frontend-tls
  rules:
    - host: royal-dispatch.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: royal-dispatch-admin
  namespace: royal-dispatch
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - royal-dispatch-admin.example.com
      secretName: royal-dispatch-admin-tls
  rules:
    - host: royal-dispatch-admin.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: admin
                port:
                  number: 3001
```

- [ ] **Step 11: Commit**

```bash
cd /Users/quydoan/Projects/k8s/rackspace
git add apps/royal-dispatch/base/
git commit -m "feat: add Royal Dispatch app base manifests"
```

---

### Task 5: Royal Dispatch App — Overlays

**Files:**
- Create: `apps/royal-dispatch/overlays/rackspace/kustomization.yaml`
- Create: `apps/royal-dispatch/overlays/rackspace/configmap-patch.yaml`
- Create: `apps/royal-dispatch/overlays/rackspace/ingress-patch.yaml`
- Create: `apps/royal-dispatch/overlays/homelander/kustomization.yaml`
- Create: `apps/royal-dispatch/overlays/homelander/configmap-patch.yaml`
- Create: `apps/royal-dispatch/overlays/homelander/ingress-patch.yaml`

- [ ] **Step 1: Create rackspace overlay kustomization**

Create `apps/royal-dispatch/overlays/rackspace/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - path: configmap-patch.yaml
  - path: ingress-patch.yaml
```

- [ ] **Step 2: Create rackspace ConfigMap patch**

Create `apps/royal-dispatch/overlays/rackspace/configmap-patch.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: royal-dispatch-config
  namespace: royal-dispatch
data:
  S3_PUBLIC_URL: "https://minio.quybits.com"
  NEXT_PUBLIC_API_URL: "https://royal-dispatch-api.quybits.com"
  NEXT_PUBLIC_FRONTEND_URL: "https://royal-dispatch.quybits.com"
```

- [ ] **Step 3: Create rackspace Ingress patch**

Create `apps/royal-dispatch/overlays/rackspace/ingress-patch.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: royal-dispatch-api
  namespace: royal-dispatch
spec:
  tls:
    - hosts:
        - royal-dispatch-api.quybits.com
      secretName: royal-dispatch-api-tls
  rules:
    - host: royal-dispatch-api.quybits.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: backend
                port:
                  number: 8000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: royal-dispatch-frontend
  namespace: royal-dispatch
spec:
  tls:
    - hosts:
        - royal-dispatch.quybits.com
      secretName: royal-dispatch-frontend-tls
  rules:
    - host: royal-dispatch.quybits.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: royal-dispatch-admin
  namespace: royal-dispatch
spec:
  tls:
    - hosts:
        - royal-dispatch-admin.quybits.com
      secretName: royal-dispatch-admin-tls
  rules:
    - host: royal-dispatch-admin.quybits.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: admin
                port:
                  number: 3001
```

- [ ] **Step 4: Create homelander overlay kustomization**

Create `apps/royal-dispatch/overlays/homelander/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - path: configmap-patch.yaml
  - path: ingress-patch.yaml
```

- [ ] **Step 5: Create homelander ConfigMap patch**

Create `apps/royal-dispatch/overlays/homelander/configmap-patch.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: royal-dispatch-config
  namespace: royal-dispatch
data:
  S3_PUBLIC_URL: "https://minio.homelander.local"
  NEXT_PUBLIC_API_URL: "https://royal-dispatch-api.homelander.local"
  NEXT_PUBLIC_FRONTEND_URL: "https://royal-dispatch.homelander.local"
```

- [ ] **Step 6: Create homelander Ingress patch**

Create `apps/royal-dispatch/overlays/homelander/ingress-patch.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: royal-dispatch-api
  namespace: royal-dispatch
spec:
  tls:
    - hosts:
        - royal-dispatch-api.homelander.local
      secretName: royal-dispatch-api-tls
  rules:
    - host: royal-dispatch-api.homelander.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: backend
                port:
                  number: 8000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: royal-dispatch-frontend
  namespace: royal-dispatch
spec:
  tls:
    - hosts:
        - royal-dispatch.homelander.local
      secretName: royal-dispatch-frontend-tls
  rules:
    - host: royal-dispatch.homelander.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: royal-dispatch-admin
  namespace: royal-dispatch
spec:
  tls:
    - hosts:
        - royal-dispatch-admin.homelander.local
      secretName: royal-dispatch-admin-tls
  rules:
    - host: royal-dispatch-admin.homelander.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: admin
                port:
                  number: 3001
```

- [ ] **Step 7: Verify kustomize build for both overlays**

Run: `cd /Users/quydoan/Projects/k8s/rackspace && kustomize build apps/royal-dispatch/overlays/rackspace`
Expected: all resources rendered with `quybits.com` domains, image tags set to `latest`

Run: `kustomize build apps/royal-dispatch/overlays/homelander`
Expected: same structure with `homelander.local` domains

- [ ] **Step 8: Commit**

```bash
cd /Users/quydoan/Projects/k8s/rackspace
git add apps/royal-dispatch/overlays/
git commit -m "feat: add Royal Dispatch rackspace and homelander overlays"
```

---

### Task 6: Flux Cluster Wiring

**Files:**
- Create: `clusters/rackspace/postgres.yaml`
- Create: `clusters/rackspace/minio.yaml`
- Create: `clusters/rackspace/royal-dispatch.yaml`
- Create: `clusters/homelander/postgres.yaml`
- Create: `clusters/homelander/minio.yaml`
- Create: `clusters/homelander/royal-dispatch.yaml`
- Modify: `clusters/rackspace/kustomization.yaml`
- Modify: `clusters/homelander/kustomization.yaml`

- [ ] **Step 1: Create rackspace Flux Kustomizations**

Create `clusters/rackspace/postgres.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: postgres
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./infrastructure/postgres/overlays/rackspace
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: eso-store
  healthChecks:
    - apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      name: postgres
      namespace: postgres
```

Create `clusters/rackspace/minio.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: minio
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./infrastructure/minio/overlays/rackspace
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: eso-store
    - name: cert-manager-issuers
    - name: ingress-nginx
  healthChecks:
    - apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      name: minio
      namespace: minio
```

Create `clusters/rackspace/royal-dispatch.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: royal-dispatch
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./apps/royal-dispatch/overlays/rackspace
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: postgres
    - name: minio
    - name: qdrant
    - name: n8n
    - name: cert-manager-issuers
    - name: ingress-nginx
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: backend
      namespace: royal-dispatch
    - apiVersion: apps/v1
      kind: Deployment
      name: frontend
      namespace: royal-dispatch
    - apiVersion: apps/v1
      kind: Deployment
      name: admin
      namespace: royal-dispatch
```

- [ ] **Step 2: Create homelander Flux Kustomizations**

Create `clusters/homelander/postgres.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: postgres
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./infrastructure/postgres/overlays/homelander
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: eso-store
  healthChecks:
    - apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      name: postgres
      namespace: postgres
```

Create `clusters/homelander/minio.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: minio
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./infrastructure/minio/overlays/homelander
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: eso-store
    - name: cert-manager-issuers
    - name: ingress-nginx
  healthChecks:
    - apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      name: minio
      namespace: minio
```

Create `clusters/homelander/royal-dispatch.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: royal-dispatch
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./apps/royal-dispatch/overlays/homelander
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: postgres
    - name: minio
    - name: qdrant
    - name: n8n
    - name: cert-manager-issuers
    - name: ingress-nginx
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: backend
      namespace: royal-dispatch
    - apiVersion: apps/v1
      kind: Deployment
      name: frontend
      namespace: royal-dispatch
    - apiVersion: apps/v1
      kind: Deployment
      name: admin
      namespace: royal-dispatch
```

- [ ] **Step 3: Update cluster kustomization resources**

In `clusters/rackspace/kustomization.yaml`, add to the resources list:

```yaml
  - postgres.yaml
  - minio.yaml
  - royal-dispatch.yaml
```

The full file should be:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - flux-system
  - namespaces.yaml
  - cert-manager.yaml
  - cert-manager-issuers.yaml
  - ingress-nginx.yaml
  - external-secrets.yaml
  - vault.yaml
  - eso-store.yaml
  - grafana.yaml
  - qdrant.yaml
  - n8n.yaml
  - postgres.yaml
  - minio.yaml
  - royal-dispatch.yaml
```

In `clusters/homelander/kustomization.yaml`, add the same three lines:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - flux-system
  - namespaces.yaml
  - cert-manager.yaml
  - cert-manager-issuers.yaml
  - ingress-nginx.yaml
  - external-secrets.yaml
  - vault.yaml
  - eso-store.yaml
  - grafana.yaml
  - qdrant.yaml
  - n8n.yaml
  - postgres.yaml
  - minio.yaml
  - royal-dispatch.yaml
```

- [ ] **Step 4: Commit**

```bash
cd /Users/quydoan/Projects/k8s/rackspace
git add clusters/
git commit -m "feat: wire postgres, minio, royal-dispatch into Flux for both clusters"
```

---

### Task 7: GitHub Actions CI/CD Workflow

**Files:**
- Create: `/Users/quydoan/Projects/ai-agents/the-royal-dispatch/.github/workflows/build-and-push.yaml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/build-and-push.yaml` in the Royal Dispatch app repo:

```yaml
name: Build and Push Images

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'frontend/**'
      - 'admin/**'

env:
  REGISTRY: docker.io
  GITOPS_REPO: RobDoan/gitops-rackspace

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.filter.outputs.backend }}
      frontend: ${{ steps.filter.outputs.frontend }}
      admin: ${{ steps.filter.outputs.admin }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            backend:
              - 'backend/**'
            frontend:
              - 'frontend/**'
            admin:
              - 'admin/**'

  build-backend:
    needs: detect-changes
    if: needs.detect-changes.outputs.backend == 'true'
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.sha }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to DockerHub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        run: echo "sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: backend/Dockerfile
          push: true
          tags: |
            quydoan/royal-dispatch-backend:${{ steps.meta.outputs.sha }}
            quydoan/royal-dispatch-backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-frontend:
    needs: detect-changes
    if: needs.detect-changes.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.sha }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to DockerHub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        run: echo "sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./frontend
          file: frontend/Dockerfile
          push: true
          tags: |
            quydoan/royal-dispatch-frontend:${{ steps.meta.outputs.sha }}
            quydoan/royal-dispatch-frontend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-admin:
    needs: detect-changes
    if: needs.detect-changes.outputs.admin == 'true'
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.sha }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to DockerHub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        run: echo "sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./admin
          file: admin/Dockerfile
          push: true
          tags: |
            quydoan/royal-dispatch-admin:${{ steps.meta.outputs.sha }}
            quydoan/royal-dispatch-admin:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  update-gitops:
    needs: [build-backend, build-frontend, build-admin]
    if: always() && (needs.build-backend.result == 'success' || needs.build-frontend.result == 'success' || needs.build-admin.result == 'success')
    runs-on: ubuntu-latest
    steps:
      - name: Checkout GitOps repo
        uses: actions/checkout@v4
        with:
          repository: ${{ env.GITOPS_REPO }}
          ssh-key: ${{ secrets.GITOPS_DEPLOY_KEY }}
          path: gitops

      - name: Update image tags
        working-directory: gitops
        run: |
          SHA="${GITHUB_SHA::7}"
          KUSTOMIZATION="apps/royal-dispatch/base/kustomization.yaml"

          # Update backend tag if backend was built
          if [ "${{ needs.build-backend.result }}" == "success" ]; then
            sed -i "/name: quydoan\/royal-dispatch-backend/{n;s/newTag: .*/newTag: ${SHA}/}" "$KUSTOMIZATION"
          fi

          # Update frontend tag if frontend was built
          if [ "${{ needs.build-frontend.result }}" == "success" ]; then
            sed -i "/name: quydoan\/royal-dispatch-frontend/{n;s/newTag: .*/newTag: ${SHA}/}" "$KUSTOMIZATION"
          fi

          # Update admin tag if admin was built
          if [ "${{ needs.build-admin.result }}" == "success" ]; then
            sed -i "/name: quydoan\/royal-dispatch-admin/{n;s/newTag: .*/newTag: ${SHA}/}" "$KUSTOMIZATION"
          fi

      - name: Commit and push
        working-directory: gitops
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --cached --quiet && echo "No changes to commit" && exit 0
          git commit -m "chore: update royal-dispatch images to ${GITHUB_SHA::7}"
          git push
```

- [ ] **Step 2: Verify workflow syntax**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch && cat .github/workflows/build-and-push.yaml | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin.read()); print('Valid YAML')"`
Expected: `Valid YAML`

- [ ] **Step 3: Commit**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
git add .github/workflows/build-and-push.yaml
git commit -m "feat: add GitHub Actions CI/CD for Docker image builds and GitOps updates"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Verify all kustomize builds succeed**

Run all three overlay builds from the GitOps repo:

```bash
cd /Users/quydoan/Projects/k8s/rackspace
kustomize build infrastructure/postgres/overlays/rackspace
kustomize build infrastructure/postgres/overlays/homelander
kustomize build infrastructure/minio/overlays/rackspace
kustomize build infrastructure/minio/overlays/homelander
kustomize build apps/royal-dispatch/overlays/rackspace
kustomize build apps/royal-dispatch/overlays/homelander
```

Expected: all six commands succeed and render valid YAML

- [ ] **Step 2: Spot-check rendered output**

Run: `kustomize build apps/royal-dispatch/overlays/rackspace | grep "royal-dispatch-api.quybits.com"`
Expected: appears in Ingress resources

Run: `kustomize build apps/royal-dispatch/overlays/rackspace | grep "quydoan/royal-dispatch-backend"`
Expected: appears in Deployment with `latest` tag

Run: `kustomize build apps/royal-dispatch/overlays/homelander | grep "homelander.local"`
Expected: appears in Ingress and ConfigMap resources

- [ ] **Step 3: Verify no files were missed**

Run: `cd /Users/quydoan/Projects/k8s/rackspace && git status`
Expected: no untracked files related to this feature remain

---

## Required Manual Steps (Post-Deploy)

These cannot be automated in the plan and must be done by the user:

1. **Vault secrets**: Populate secrets in Vault before deploying:
   ```bash
   vault kv put secret/postgres postgres_password=<pw> password=<pw>
   vault kv put secret/minio root_user=<user> root_password=<pw>
   vault kv put secret/royal-dispatch ANTHROPIC_API_KEY=<key> ELEVENLABS_API_KEY=<key> OPENAI_API_KEY=<key>
   ```

2. **GitHub secrets**: Add to the `the-royal-dispatch` GitHub repo:
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`
   - `GITOPS_DEPLOY_KEY` (SSH deploy key with write access to `gitops-rackspace` repo)

3. **Push GitOps repo**: After all commits, push to trigger Flux reconciliation.

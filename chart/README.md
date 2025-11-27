# Resume Helm Chart

Helm chart for deploying the Interactive AI Resume application to Kubernetes with ArgoCD.

## Overview

This chart deploys:
- **Backend**: Go server with WebSocket support for OpenAI Realtime API
- **Frontend**: React SPA with chat interface
- **Ingress**: Traefik IngressRoute with automatic TLS via cert-manager
- **ConfigMap**: System prompt configuration
- **Secrets**: OpenAI API key (must be created separately)

## Prerequisites

- Kubernetes cluster (k3s recommended)
- Traefik ingress controller
- cert-manager for TLS certificates
- ArgoCD (optional, for GitOps deployment)

## Installation

### 1. Create Namespace

```bash
kubectl create namespace resume
```

### 2. Create Secrets

Create the OpenAI API key secret:

```bash
kubectl create secret generic resume-secrets \
  --from-literal=openai-api-key=sk-your-openai-api-key-here \
  -n resume
```

### 3. Deploy with Helm

```bash
helm install resume ./chart -n resume
```

### 4. Deploy with ArgoCD

Apply the ArgoCD application manifest:

```bash
kubectl apply -f argocd/resume.yaml
```

ArgoCD will automatically sync from your Git repository.

## Configuration

### values.yaml

Key configuration options:

```yaml
# Backend image and service
backend:
  image:
    repository: registry.local.k3s.cmoore.io:8443/resume/backend
    tag: "latest"
  service:
    type: ClusterIP  # Or LoadBalancer for direct access
    loadBalancerIP: "192.168.64.115"  # kube-vip IP

# Frontend image
frontend:
  image:
    repository: registry.local.k3s.cmoore.io:8443/resume/frontend
    tag: "latest"

# Ingress with dual domains
ingress:
  enabled: true
  frontendHost: christianmoore.me
  backendHost: backend.christianmoore.me
  backendEnabled: true
  entryPoint: websecure
  certIssuer: letsencrypt-cloudflare

# Rate limiting (protects against abuse)
rateLimit:
  enabled: true
  backend:
    average: 10  # requests/second
    burst: 20
    period: 1m
  frontend:
    average: 50
    burst: 100
    period: 1m

# System prompt
systemPrompt:
  content: |
    Your custom system prompt here...
```

### DNS Configuration

Ensure DNS records point to your cluster:

```
christianmoore.me         → <cluster-ip>
backend.christianmoore.me → <cluster-ip>
```

### Rate Limiting

Built-in Traefik rate limiting protects the backend from excessive API calls:

- **Backend**: 10 req/s average, 20 burst (applies to /ws/, /api/, /health)
- **Frontend**: 50 req/s average, 100 burst (static content)

Adjust in `values.yaml` under `rateLimit` section.

## Upgrading

### With Helm

```bash
helm upgrade resume ./chart -n resume
```

### With ArgoCD

Push changes to Git and ArgoCD will auto-sync.

## Uninstalling

### With Helm

```bash
helm uninstall resume -n resume
```

### With ArgoCD

```bash
kubectl delete -f argocd/resume.yaml
```

## Monitoring

Check deployment status:

```bash
# Pods
kubectl get pods -n resume

# Services
kubectl get svc -n resume

# IngressRoute
kubectl get ingressroute -n resume

# Certificate
kubectl get certificate -n resume
```

View logs:

```bash
# Backend
kubectl logs -n resume -l app.kubernetes.io/component=backend -f

# Frontend
kubectl logs -n resume -l app.kubernetes.io/component=frontend -f
```

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod <pod-name> -n resume
kubectl logs <pod-name> -n resume
```

### Certificate issues

```bash
kubectl describe certificate resume-tls -n resume
kubectl get certificaterequest -n resume
```

### WebSocket connection fails

1. Check backend is running: `kubectl get pods -n resume -l app.kubernetes.io/component=backend`
2. Check service endpoints: `kubectl get endpoints -n resume`
3. Verify ingress routes backend traffic: `kubectl describe ingressroute resume-https -n resume`

## Resource Requirements

Default resource requests/limits:

- **Backend**: 50m-500m CPU, 128Mi-512Mi memory
- **Frontend**: 25m-200m CPU, 64Mi-256Mi memory

Adjust in `values.yaml` as needed for your cluster.

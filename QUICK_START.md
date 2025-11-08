# Quick Start - Deploy to Homelab

Fast deployment guide for the resume app to your k3s homelab cluster.

## Prerequisites

- k3s cluster with Traefik, cert-manager, and ArgoCD
- DNS: `resume.k3s.christianmoore.me` and `backend.resume.k3s.christianmoore.me` → cluster IP
- ClusterIssuer `letsencrypt-cloudflare` configured

## Quick Deploy (5 minutes)

### 1. Build Images

```bash
# Build and push to local k3s registry
make docker-build-push TAG=v1.0.0
```

This pushes to: `registry.k3s.local.christianmoore.me/resume/`

### 2. Update Image Tags

Edit `chart/values.yaml`:

```yaml
backend:
  image:
    tag: "v1.0.0"

frontend:
  image:
    tag: "v1.0.0"
```

### 3. Create Secret

**Quick method** (not GitOps-friendly):
```bash
kubectl create namespace resume
kubectl create secret generic resume-secrets \
  --from-literal=openai-api-key=sk-YOUR-KEY-HERE \
  -n resume
```

**Recommended method** (use SealedSecret):
```bash
# Encrypt the key
echo -n 'sk-YOUR-KEY' | kubeseal --raw \
  --from-file=/dev/stdin \
  --namespace=resume \
  --name=resume-secrets \
  --cert=pub-cert.pem

# Add to chart/templates/sealedsecret.yaml and commit to Git
# See docs/SEALED_SECRETS.md for details
```

### 4. Deploy with ArgoCD

```bash
kubectl apply -f argocd/resume.yaml
```

### 5. Verify

```bash
# Check ArgoCD
argocd app get resume

# Check pods
kubectl get pods -n resume

# Check certificates
kubectl get certificate -n resume
```

### 6. Test

Open https://resume.k3s.christianmoore.me and chat!

## DNS Setup

Add to your DNS provider (Cloudflare):

```
Type: A
Name: resume.k3s
Value: <cluster-ingress-ip>

Type: A
Name: backend.resume.k3s
Value: <cluster-ingress-ip>
```

## Default Configuration

- **Frontend**: https://resume.k3s.christianmoore.me
- **Backend API**: https://backend.resume.k3s.christianmoore.me
- **Rate Limits**: 10 req/s backend, 50 req/s frontend
- **TLS**: Auto-issued via Let's Encrypt (DNS-01)
- **Services**: ClusterIP (ingress-only)

## Troubleshooting

**Pods not ready?**
```bash
kubectl logs -n resume -l app.kubernetes.io/component=backend
```

**Certificate pending?**
```bash
kubectl describe certificate -n resume
```

**Rate limited (429)?**
- Expected behavior - adjust in `values.yaml` if needed

**WebSocket failing?**
- Check backend logs for OpenAI API errors
- Verify secret exists: `kubectl get secret resume-secrets -n resume`

## Update Deployment

1. Make changes, build new images with new tag
2. Update `chart/values.yaml` with new tag
3. Commit and push to Git
4. ArgoCD auto-syncs (or `argocd app sync resume`)

## Access Logs

```bash
# Backend
kubectl logs -n resume -l app.kubernetes.io/component=backend -f

# Frontend
kubectl logs -n resume -l app.kubernetes.io/component=frontend -f
```

## Common Tweaks

### Disable backend domain

```yaml
ingress:
  backendEnabled: false
```

### Increase rate limits

```yaml
rateLimit:
  backend:
    average: 50
    burst: 100
```

### Enable LoadBalancer (debugging)

```yaml
backend:
  service:
    type: LoadBalancer
    loadBalancerIP: "192.168.64.115"
```

## Next Steps

- Monitor OpenAI API usage and costs
- Set up Prometheus/Grafana monitoring
- Configure backups for secrets
- Test from external network

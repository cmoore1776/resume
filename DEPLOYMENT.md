# Deployment Guide

Complete guide for deploying the Interactive AI Resume to your k3s homelab cluster via ArgoCD.

## Prerequisites

Before deploying, ensure you have:

1. **K3s cluster** with:
   - Traefik ingress controller (default with k3s)
   - cert-manager installed and configured
   - ArgoCD installed

2. **DNS configured**:
   - `resume.k3s.christianmoore.me` → your cluster ingress IP
   - `backend.resume.k3s.christianmoore.me` → your cluster ingress IP (optional)

3. **ClusterIssuer** configured:
   - `letsencrypt-cloudflare` (for DNS-01 challenge)

4. **Available kube-vip IP addresses** (if using LoadBalancer):
   - Frontend: 192.168.64.114 (optional)
   - Backend: 192.168.64.115 (optional)

4. **Container images** built and pushed to registry

## Step 1: Build and Push Container Images

### Using Makefile (Recommended)

```bash
# Build and push to local k3s registry
make docker-build-push TAG=v1.0.0
```

This creates:
- `registry.k3s.local.christianmoore.me/resume/backend:v1.0.0`
- `registry.k3s.local.christianmoore.me/resume/frontend:v1.0.0`

### Manual Build (Alternative)

```bash
# Backend
docker build -t registry.k3s.local.christianmoore.me/resume/backend:v1.0.0 backend/
docker push registry.k3s.local.christianmoore.me/resume/backend:v1.0.0

# Frontend
docker build -t registry.k3s.local.christianmoore.me/resume/frontend:v1.0.0 frontend/
docker push registry.k3s.local.christianmoore.me/resume/frontend:v1.0.0
```

**Note**: Images are pushed to your local k3s registry. See [docs/LOCAL_REGISTRY.md](docs/LOCAL_REGISTRY.md) for details.

**Note**: Update image tags in `chart/values.yaml` if using different tags.

## Step 2: Create Kubernetes Secret

### Option A: Manual Secret (Quick Start)

Create the OpenAI API key secret in your cluster:

```bash
kubectl create namespace resume
kubectl create secret generic resume-secrets \
  --from-literal=openai-api-key=sk-your-actual-openai-api-key-here \
  -n resume
```

**Important**: Replace `sk-your-actual-openai-api-key-here` with your real OpenAI API key.

### Option B: Sealed Secret (Recommended for GitOps)

For GitOps workflows, use Sealed Secrets to encrypt the API key:

```bash
# Encrypt your API key
echo -n 'sk-your-actual-key' | \
  kubeseal --raw \
    --from-file=/dev/stdin \
    --namespace=resume \
    --name=resume-secrets \
    --scope=strict \
    --cert=pub-cert.pem
```

Update `chart/templates/sealedsecret.yaml` with the encrypted output, then:

```yaml
# In chart/values.yaml
secrets:
  useSealed: true
```

See [docs/SEALED_SECRETS.md](docs/SEALED_SECRETS.md) for complete instructions.

## Step 3: Deploy with ArgoCD

### Option A: Via kubectl

```bash
kubectl apply -f argocd/resume.yaml
```

### Option B: Via ArgoCD UI

1. Open ArgoCD UI
2. Click "New App"
3. Fill in:
   - **Application Name**: resume
   - **Project**: default
   - **Sync Policy**: Automatic
   - **Repository URL**: git@github.com:cmoore1776/resume.git
   - **Revision**: main
   - **Path**: chart
   - **Cluster URL**: https://kubernetes.default.svc
   - **Namespace**: resume

4. Click "Create"

### Option C: Via ArgoCD CLI

```bash
argocd app create resume \
  --repo git@github.com:cmoore1776/resume.git \
  --path chart \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace resume \
  --sync-policy automated \
  --auto-prune \
  --self-heal
```

## Step 4: Verify Deployment

### Check Application Status

```bash
# ArgoCD application
argocd app get resume

# Kubernetes resources
kubectl get all -n resume
```

### Expected Resources

```
NAME                                    READY   STATUS    RESTARTS   AGE
pod/resume-backend-xxxxxxxxxx-xxxxx     1/1     Running   0          1m
pod/resume-frontend-xxxxxxxxxx-xxxxx    1/1     Running   0          1m

NAME                              TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
service/resume-backend            ClusterIP   10.43.x.x       <none>        8080/TCP   1m
service/resume-frontend           ClusterIP   10.43.x.x       <none>        80/TCP     1m

NAME                              READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/resume-backend    1/1     1            1           1m
deployment.apps/resume-frontend   1/1     1            1           1m
```

### Check Certificate

```bash
kubectl get certificate -n resume
```

Output should show:

```
NAME          READY   SECRET        AGE
resume-tls    True    resume-tls    2m
```

### Check IngressRoute

```bash
kubectl get ingressroute -n resume
```

Output should show:

```
NAME                        AGE
resume-http-redirect        2m
resume-https                2m
```

## Step 5: Test the Application

### Frontend Domain

1. **Open browser** to https://resume.k3s.christianmoore.me
2. **Verify**:
   - Resume displays correctly
   - Chat interface loads
   - Can send messages
   - Receives text responses
   - Receives voice audio

### Backend Domain (Optional)

1. **Open browser** to https://backend.resume.k3s.christianmoore.me/health
2. **Verify**:
   - Returns `{"status":"healthy"}` JSON response

### Testing Checklist

- [ ] HTTPS redirect works (http → https)
- [ ] TLS certificates are valid for both domains
- [ ] Resume content displays
- [ ] Chat input field is visible
- [ ] Can send a message
- [ ] Receives streaming text response
- [ ] Receives audio playback
- [ ] WebSocket stays connected
- [ ] Rate limiting works (send 30+ requests quickly, should see 429 errors)
- [ ] Backend health endpoint accessible

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl get pods -n resume

# Describe pod to see events
kubectl describe pod <pod-name> -n resume

# Check logs
kubectl logs <pod-name> -n resume
```

**Common issues**:
- Missing secret: Ensure `resume-secrets` exists in namespace
- Image pull errors: Verify image exists in registry
- Resource limits: Check node has sufficient resources

### Certificate Not Ready

```bash
# Check certificate status
kubectl describe certificate resume-tls -n resume

# Check certificate request
kubectl get certificaterequest -n resume

# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager
```

**Common issues**:
- ClusterIssuer not configured
- DNS challenge failing
- Rate limit from Let's Encrypt

### WebSocket Connection Fails

```bash
# Check backend logs
kubectl logs -n resume -l app.kubernetes.io/component=backend -f

# Check if backend service has endpoints
kubectl get endpoints -n resume

# Test backend health endpoint
kubectl port-forward -n resume svc/resume-backend 8080:8080
curl http://localhost:8080/health
```

**Common issues**:
- Backend can't reach OpenAI API (check network policies)
- Invalid OpenAI API key
- CORS issues (check backend logs)

### Ingress Not Working

```bash
# Check IngressRoute
kubectl describe ingressroute resume-https -n resume

# Check Traefik logs
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik
```

**Common issues**:
- DNS not pointing to cluster
- Entry point mismatch
- TLS secret missing

## Updating the Application

### Code Changes

1. Make changes to code
2. Build and push new images with updated tags
3. Update `chart/values.yaml` with new image tags
4. Commit and push to Git

ArgoCD will automatically detect changes and sync (if auto-sync enabled).

### Manual Sync

```bash
argocd app sync resume
```

### Configuration Changes

1. Edit `chart/values.yaml`
2. Commit and push to Git
3. ArgoCD will auto-sync

### System Prompt Changes

Edit `chart/values.yaml` under `systemPrompt.content` and push to Git.

## Rollback

### Via ArgoCD

```bash
# List history
argocd app history resume

# Rollback to specific revision
argocd app rollback resume <revision-id>
```

### Via Helm (if deployed manually)

```bash
helm rollback resume -n resume
```

## Monitoring

### Logs

```bash
# Backend logs
kubectl logs -n resume -l app.kubernetes.io/component=backend -f

# Frontend logs
kubectl logs -n resume -l app.kubernetes.io/component=frontend -f

# All logs
stern -n resume resume
```

### Metrics

If Prometheus is installed:

```bash
# Pod CPU/Memory
kubectl top pods -n resume
```

### ArgoCD UI

View application health, sync status, and resource tree in ArgoCD UI.

## Cleanup

### Remove Application

```bash
# Via ArgoCD
kubectl delete -f argocd/resume.yaml

# Or via CLI
argocd app delete resume
```

### Remove Namespace

```bash
kubectl delete namespace resume
```

This will remove all resources including secrets.

## Configuration Options

### Rate Limiting

Adjust rate limits in `chart/values.yaml`:

```yaml
rateLimit:
  enabled: true
  backend:
    average: 10  # Requests per second
    burst: 20    # Burst size
    period: 1m   # Calculation period
  frontend:
    average: 50
    burst: 100
    period: 1m
```

**Recommended limits:**
- **Public deployment**: Keep default (10 req/s backend, 50 req/s frontend)
- **Private/demo**: Increase to 50/200
- **High traffic**: Add caching layer instead of increasing limits

### LoadBalancer vs ClusterIP

**ClusterIP (default):**
- Access only via IngressRoute (recommended)
- All traffic goes through Traefik
- Centralized rate limiting and TLS

**LoadBalancer:**
- Direct access to backend (debugging)
- Requires kube-vip configuration
- Set in `values.yaml`:

```yaml
backend:
  service:
    type: LoadBalancer
    loadBalancerIP: "192.168.64.115"
```

### Dual Domain Setup

**Frontend domain** (`resume.k3s.christianmoore.me`):
- Serves React application
- Routes /ws/ and /api/ to backend
- Rate limited: 50 req/s

**Backend domain** (`backend.resume.k3s.christianmoore.me`):
- Direct backend access (optional)
- All endpoints accessible
- Rate limited: 10 req/s (stricter)

To disable backend domain:

```yaml
ingress:
  backendEnabled: false
```

## Production Checklist

Before going live:

- [ ] Update Docker image tags to use versions (not `latest`)
- [ ] Configure resource limits based on actual usage
- [ ] Verify rate limits are appropriate for expected traffic
- [ ] Test rate limiting (send burst of requests)
- [ ] Set up monitoring alerts
- [ ] Configure backup for secrets
- [ ] Test disaster recovery
- [ ] Enable network policies if needed
- [ ] Review security contexts
- [ ] Test from external network
- [ ] Verify SSL certificates auto-renew
- [ ] Set up log aggregation
- [ ] Configure horizontal pod autoscaling (if needed)
- [ ] Rotate OpenAI API key before public launch
- [ ] Monitor OpenAI API usage and costs
- [ ] Consider adding CAPTCHA for additional protection

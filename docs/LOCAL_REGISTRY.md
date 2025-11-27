# Using Local Docker Registry

This guide explains how to build and push images to the local k3s Docker registry instead of Docker Hub.

## Local Registry Information

- **URL**: `registry.local.k3s.cmoore.io:8443`
- **Protocol**: HTTPS (TLS via Traefik + cert-manager)
- **Storage**: Longhorn persistent storage (50Gi)
- **Namespace**: Images are organized under `resume/`

## Quick Start

### 1. Build and Push Images

```bash
# Build and push both images to local registry
make docker-build-push

# Or individually
make docker-build      # Build only
make docker-push       # Push only
```

This will create:
- `registry.local.k3s.cmoore.io:8443/resume/backend:latest`
- `registry.local.k3s.cmoore.io:8443/resume/frontend:latest`

### 2. Deploy

```bash
# ArgoCD will pull from local registry automatically
make argocd-sync
```

## Versioned Deployments

For production deployments, use version tags:

```bash
# Build and tag with version
make docker-build TAG=v1.0.0
make docker-push TAG=v1.0.0

# Also tag as latest
make docker-tag-version TAG=v1.0.0
```

Then update `chart/values.yaml`:

```yaml
backend:
  image:
    tag: "v1.0.0"

frontend:
  image:
    tag: "v1.0.0"
```

## Configuration

### Makefile Variables

The Makefile uses these defaults (can be overridden):

```makefile
REGISTRY ?= registry.local.k3s.cmoore.io:8443
NAMESPACE ?= resume
TAG ?= latest
```

Override any variable:

```bash
# Use different tag
make docker-build-push TAG=dev

# Use different registry (not recommended)
make docker-build-push REGISTRY=docker.io/myuser
```

### Helm Values

Images are configured in `chart/values.yaml`:

```yaml
backend:
  image:
    repository: registry.local.k3s.cmoore.io:8443/resume/backend
    tag: "latest"

frontend:
  image:
    repository: registry.local.k3s.cmoore.io:8443/resume/frontend
    tag: "latest"
```

## Manual Docker Commands

If you prefer not to use the Makefile:

```bash
# Backend
docker build -t registry.local.k3s.cmoore.io:8443/resume/backend:v1.0.0 backend/
docker push registry.local.k3s.cmoore.io:8443/resume/backend:v1.0.0

# Frontend
docker build -t registry.local.k3s.cmoore.io:8443/resume/frontend:v1.0.0 frontend/
docker push registry.local.k3s.cmoore.io:8443/resume/frontend:v1.0.0
```

## Accessing the Registry

### From Your Machine

The registry should be accessible via HTTPS:

```bash
# Test connection
curl https://registry.local.k3s.cmoore.io:8443/v2/_catalog

# Should return:
# {"repositories":["resume/backend","resume/frontend"]}
```

### From k8s Cluster

Pods can pull images directly using the registry URL in image specs.

No additional authentication is typically needed if:
- Registry is accessible via cluster DNS
- Registry allows anonymous pulls (default for local k3s registry)

## Registry Management

### List Images

```bash
# List all repositories
curl https://registry.local.k3s.cmoore.io:8443/v2/_catalog

# List tags for backend
curl https://registry.local.k3s.cmoore.io:8443/v2/resume/backend/tags/list

# List tags for frontend
curl https://registry.local.k3s.cmoore.io:8443/v2/resume/frontend/tags/list
```

### Delete Images

Images can be deleted via the Docker Registry API:

```bash
# Get manifest digest
DIGEST=$(curl -I -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
  https://registry.local.k3s.cmoore.io:8443/v2/resume/backend/manifests/v1.0.0 \
  | grep Docker-Content-Digest | awk '{print $2}')

# Delete image
curl -X DELETE https://registry.local.k3s.cmoore.io:8443/v2/resume/backend/manifests/$DIGEST
```

### Garbage Collection

To free up space from deleted images:

```bash
# Run garbage collection on registry pod
kubectl exec -it deployment/docker-registry -n docker-registry -- \
  registry garbage-collect /etc/docker/registry/config.yml
```

## Development Workflow

### Quick Iteration

For rapid development iterations:

```bash
# 1. Make code changes
# 2. Build, push, and restart pods
make dev-deploy

# This does:
# - docker-build-push
# - k8s-restart-backend
# - k8s-restart-frontend
# - waits for rollout to complete
```

### Watching Logs

In a separate terminal:

```bash
# Backend logs
make k8s-logs-backend

# Frontend logs
make k8s-logs-frontend
```

## Troubleshooting

### Push Fails (Connection Refused)

**Problem**: Can't connect to registry

**Solutions**:
```bash
# 1. Check registry is running
kubectl get pods -n docker-registry

# 2. Test registry URL
curl https://registry.local.k3s.cmoore.io:8443/v2/

# 3. Check DNS resolution
nslookup registry.local.k3s.cmoore.io

# 4. Check certificate is valid
openssl s_client -connect registry.local.k3s.cmoore.io:8443
```

### Pull Fails (ImagePullBackOff)

**Problem**: Pods can't pull images

**Solutions**:
```bash
# 1. Check image exists in registry
curl https://registry.local.k3s.cmoore.io:8443/v2/resume/backend/tags/list

# 2. Check pod events
kubectl describe pod <pod-name> -n resume

# 3. Verify image name in deployment
kubectl get deployment -n resume -o yaml | grep image:

# 4. Check if registry is accessible from cluster
kubectl run curl --image=curlimages/curl -it --rm -- \
  curl https://registry.local.k3s.cmoore.io:8443/v2/_catalog
```

### Certificate Issues

**Problem**: TLS certificate errors

**Solutions**:
```bash
# Check certificate
kubectl get certificate -n docker-registry

# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager

# Manually trigger cert renewal if needed
kubectl delete certificate docker-registry-tls -n docker-registry
```

### Out of Space

**Problem**: Registry PVC is full

**Solutions**:
```bash
# Check PVC usage
kubectl exec -it deployment/docker-registry -n docker-registry -- df -h /var/lib/registry

# Run garbage collection
kubectl exec -it deployment/docker-registry -n docker-registry -- \
  registry garbage-collect /etc/docker/registry/config.yml

# Or increase PVC size (if using Longhorn)
kubectl edit pvc docker-registry-data -n docker-registry
# Update: spec.resources.requests.storage: 100Gi
```

## Benefits of Local Registry

✅ **Faster deployments** - No internet upload/download
✅ **Private images** - Images never leave your cluster
✅ **Cost savings** - No Docker Hub rate limits or fees
✅ **Offline capable** - Works without internet
✅ **Better control** - Manage your own image lifecycle

## Comparison

| Feature | Local Registry | Docker Hub |
|---------|---------------|------------|
| Speed | Fast (local network) | Slower (internet) |
| Privacy | Private | Public/Private |
| Cost | Free | Rate limits/fees |
| Storage | 50Gi (expandable) | Unlimited |
| Availability | Requires cluster | Always available |
| Disaster Recovery | Needs backup | Built-in redundancy |

## Best Practices

1. **Tag versions**: Use semantic versioning for production
2. **Clean up old images**: Run garbage collection periodically
3. **Monitor storage**: Set up alerts for PVC usage
4. **Backup important images**: Export and store critical image versions
5. **Use latest for dev**: Keep `latest` tag for development iterations
6. **Lock versions in prod**: Use specific version tags in production values.yaml

## Backup and Restore

### Backup Images

```bash
# Save image to tar file
docker save registry.local.k3s.cmoore.io:8443/resume/backend:v1.0.0 \
  -o resume-backend-v1.0.0.tar

# Compress
gzip resume-backend-v1.0.0.tar
```

### Restore Images

```bash
# Load image from tar
docker load -i resume-backend-v1.0.0.tar.gz

# Push to registry
docker push registry.local.k3s.cmoore.io:8443/resume/backend:v1.0.0
```

## Next Steps

- Set up automated builds on Git push (GitHub Actions, GitLab CI)
- Implement image scanning for vulnerabilities
- Set up registry replication for multi-cluster deployments
- Configure registry garbage collection cronjob

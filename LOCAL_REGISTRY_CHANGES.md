# Local Registry Configuration Changes

This document summarizes the changes made to use the local k3s Docker registry instead of Docker Hub.

## Summary

All Docker images now use the local k3s registry at:
```
registry.k3s.local.christianmoore.me/resume/
```

## Changes Made

### 1. Chart Values Updated

**File**: `chart/values.yaml`

**Before:**
```yaml
backend:
  image:
    repository: cmoore1776/resume-backend

frontend:
  image:
    repository: cmoore1776/resume-frontend
```

**After:**
```yaml
backend:
  image:
    repository: registry.k3s.local.christianmoore.me/resume/backend

frontend:
  image:
    repository: registry.k3s.local.christianmoore.me/resume/frontend
```

### 2. Makefile Updated

**File**: `Makefile`

**New Configuration:**
```makefile
REGISTRY ?= registry.k3s.local.christianmoore.me
NAMESPACE ?= resume
BACKEND_IMAGE ?= $(REGISTRY)/$(NAMESPACE)/backend
FRONTEND_IMAGE ?= $(REGISTRY)/$(NAMESPACE)/frontend
```

**New Targets:**
- `make docker-build-push` - Build and push to local registry
- `make deploy` - Full deployment (build, push, sync)
- `make dev-deploy` - Quick dev deployment with pod restart
- `make docker-tag-version TAG=v1.0.0` - Tag and push version

### 3. Documentation Updated

Updated all references from Docker Hub to local registry in:
- `README.md`
- `DEPLOYMENT.md`
- `QUICK_START.md`
- `chart/README.md`

### 4. New Documentation

**Created**: `docs/LOCAL_REGISTRY.md`

Complete guide covering:
- Local registry configuration
- Build and push workflows
- Image management
- Troubleshooting
- Best practices

## Image Naming Convention

Images follow this pattern:
```
registry.k3s.local.christianmoore.me/resume/<component>:<tag>
```

Examples:
- `registry.k3s.local.christianmoore.me/resume/backend:latest`
- `registry.k3s.local.christianmoore.me/resume/backend:v1.0.0`
- `registry.k3s.local.christianmoore.me/resume/frontend:latest`
- `registry.k3s.local.christianmoore.me/resume/frontend:v1.0.0`

## Quick Reference

### Build and Push

```bash
# Development (latest tag)
make docker-build-push

# Production (versioned)
make docker-build-push TAG=v1.0.0
```

### Deploy

```bash
# Full deployment
make deploy

# Quick dev iteration
make dev-deploy
```

### Check Registry

```bash
# List all repositories
curl https://registry.k3s.local.christianmoore.me/v2/_catalog

# List backend tags
curl https://registry.k3s.local.christianmoore.me/v2/resume/backend/tags/list

# List frontend tags
curl https://registry.k3s.local.christianmoore.me/v2/resume/frontend/tags/list
```

## Benefits

✅ **Faster deployments** - No internet upload/download delays
✅ **Private images** - Images never leave your cluster
✅ **No rate limits** - No Docker Hub pull rate limits
✅ **Free storage** - 50Gi Longhorn storage (expandable)
✅ **Better control** - Manage your own image lifecycle
✅ **Offline capable** - Works without internet connection

## Migration from Docker Hub

If you had images in Docker Hub, you can migrate them:

```bash
# Pull from Docker Hub
docker pull cmoore1776/resume-backend:v1.0.0

# Tag for local registry
docker tag cmoore1776/resume-backend:v1.0.0 \
  registry.k3s.local.christianmoore.me/resume/backend:v1.0.0

# Push to local registry
docker push registry.k3s.local.christianmoore.me/resume/backend:v1.0.0
```

## Next Steps

1. **Build images**: `make docker-build-push TAG=v1.0.0`
2. **Update values.yaml**: Set image tags to `v1.0.0`
3. **Deploy**: `make argocd-sync`
4. **Verify**: Check pods are running with new images

## Troubleshooting

See [docs/LOCAL_REGISTRY.md](docs/LOCAL_REGISTRY.md) for detailed troubleshooting guide.

Common issues:
- **Push fails**: Check registry is accessible: `curl https://registry.k3s.local.christianmoore.me/v2/`
- **Pull fails**: Check image exists: `curl https://registry.k3s.local.christianmoore.me/v2/resume/backend/tags/list`
- **Certificate errors**: Check cert-manager: `kubectl get certificate -n docker-registry`

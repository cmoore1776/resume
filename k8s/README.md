# Kubernetes Deployment for christianmoore.me

This directory contains Kubernetes manifests for deploying the avatar application to a k3s cluster using ArgoCD.

## Structure

```
k8s/
├── base/                      # Base Kubernetes resources
│   ├── namespace.yaml         # Namespace definition
│   ├── backend-deployment.yaml
│   ├── backend-service.yaml
│   ├── frontend-deployment.yaml
│   ├── frontend-service.yaml
│   ├── ingress.yaml          # Ingress rules with TLS
│   ├── configmap.yaml        # System prompt configuration
│   ├── secrets.yaml.example  # Example secrets (DO NOT commit actual secrets)
│   └── kustomization.yaml
├── overlays/
│   └── production/           # Production-specific configurations
│       └── kustomization.yaml
└── argocd/
    └── application.yaml      # ArgoCD application definition
```

## Prerequisites

1. **k3s cluster** running with:
   - NGINX Ingress Controller
   - cert-manager (for TLS certificates)

2. **ArgoCD** installed on the cluster

3. **Container Registry** (Docker Hub, GHCR, or private registry)

4. **DNS** configured to point `christianmoore.me` to your cluster's ingress

## Setup Instructions

### 1. Create Secrets

Create the secrets file from the example:

```bash
cp k8s/base/secrets.yaml.example k8s/overlays/production/secrets.yaml
```

Edit the secrets file with your actual API keys:

```bash
# Edit k8s/overlays/production/secrets.yaml
# Add your actual OpenAI API key
```

**IMPORTANT**: Never commit the actual secrets.yaml file to git!

Then apply it to your cluster:

```bash
kubectl apply -f k8s/overlays/production/secrets.yaml
```

### 2. Update System Prompt

Edit `k8s/base/configmap.yaml` and fill in the system prompt with your actual information from `docs/about_me.md`.

### 3. Build and Push Docker Images

Build and push the backend image:

```bash
cd backend
docker build -t christianmoore/avatar-backend:latest .
docker push christianmoore/avatar-backend:latest
```

Build and push the frontend image:

```bash
cd frontend
docker build -t christianmoore/avatar-frontend:latest .
docker push christianmoore/avatar-frontend:latest
```

Update the image references in `k8s/overlays/production/kustomization.yaml` if using a different registry.

### 4. Deploy with ArgoCD

First, update the repository URL in `k8s/argocd/application.yaml` with your actual Git repository.

Then apply the ArgoCD application:

```bash
kubectl apply -f k8s/argocd/application.yaml
```

ArgoCD will automatically:
- Sync the application from your Git repository
- Deploy all resources to the `christianmoore` namespace
- Monitor for changes and auto-sync
- Self-heal if resources are manually modified

### 5. Access the Application

Once deployed, the application will be available at:
- https://christianmoore.me
- https://www.christianmoore.me

## Manual Deployment (without ArgoCD)

If you prefer to deploy manually without ArgoCD:

```bash
# Apply all manifests
kubectl apply -k k8s/overlays/production

# Check deployment status
kubectl get all -n christianmoore

# Check ingress
kubectl get ingress -n christianmoore
```

## Updating the Application

### With ArgoCD

Simply push changes to your Git repository. ArgoCD will automatically detect and sync the changes.

### Manual Updates

```bash
# Rebuild and push images with new tag
docker build -t christianmoore/avatar-backend:v1.1.0 backend/
docker push christianmoore/avatar-backend:v1.1.0

# Update kustomization.yaml with new tag
# Then apply
kubectl apply -k k8s/overlays/production
```

## Monitoring

Check application logs:

```bash
# Backend logs
kubectl logs -n christianmoore -l app=avatar-backend -f

# Frontend logs
kubectl logs -n christianmoore -l app=avatar-frontend -f
```

Check pod status:

```bash
kubectl get pods -n christianmoore
kubectl describe pod <pod-name> -n christianmoore
```

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod <pod-name> -n christianmoore
kubectl logs <pod-name> -n christianmoore
```

### Ingress not working

```bash
kubectl describe ingress avatar-ingress -n christianmoore
kubectl get certificate -n christianmoore  # Check TLS certificate status
```

### API connection issues

Ensure:
1. Secrets are correctly configured
2. Backend pod is running and healthy
3. Service is correctly routing to backend pods

```bash
kubectl get secrets -n christianmoore
kubectl get svc -n christianmoore
```

## Resource Limits

Current resource allocations:
- **Backend**: 128Mi-512Mi RAM, 100m-500m CPU
- **Frontend**: 64Mi-256Mi RAM, 50m-200m CPU

Adjust in the deployment files if needed for your cluster.

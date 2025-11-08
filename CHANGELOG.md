# Changelog

## [1.0.0] - 2025-11-07

### Added - Public Deployment Features

#### Helm Chart
- Complete Helm chart for k3s deployment (`chart/`)
- Support for dual domain configuration:
  - Frontend: `resume.k3s.christianmoore.me`
  - Backend: `backend.resume.k3s.christianmoore.me` (optional)
- Traefik IngressRoute with automatic TLS via cert-manager
- Rate limiting middleware to protect against abuse:
  - Backend: 10 req/s average, 20 burst
  - Frontend: 50 req/s average, 100 burst
- kube-vip LoadBalancer support (optional)
- Comprehensive values.yaml with sensible defaults
- Health probes for both backend and frontend
- Security contexts (non-root, dropped capabilities)

#### Templates
- `backend-deployment.yaml` - Backend deployment with ConfigMap mount
- `backend-service.yaml` - Service with LoadBalancer support
- `frontend-deployment.yaml` - Frontend nginx deployment
- `frontend-service.yaml` - Frontend ClusterIP service
- `ingressroute.yaml` - Traefik routes for both domains with priorities
- `middleware.yaml` - Rate limiting and HTTPS redirect
- `configmap.yaml` - System prompt configuration
- `_helpers.tpl` - Helm template helpers

#### ArgoCD
- `argocd/resume.yaml` - ArgoCD application manifest
- Auto-sync, self-heal, and namespace creation
- GitOps-ready deployment

#### Documentation
- `DEPLOYMENT.md` - Complete deployment guide
- `QUICK_START.md` - Fast deployment reference
- `chart/README.md` - Helm chart documentation
- Updated `README.md` - Reflects actual implementation
- Updated `CLAUDE.md` - Concise guide under 200 lines

### Changed

#### Configuration
- Removed ElevenLabs references (no longer used)
- Updated from generic `christianmoore.me` to `resume.k3s.christianmoore.me`
- Changed secret name from `avatar-secrets` to `resume-secrets`
- Updated namespace from `christianmoore` to `resume`

#### Architecture
- Backend now accessed via frontend domain paths (/ws/, /api/, /health)
- Optional separate backend domain for direct API access
- ClusterIP services by default (ingress-only)
- Rate limiting applied at ingress level

### Security
- Added Traefik rate limiting to prevent API abuse
- Non-root containers with security contexts
- Capabilities dropped (ALL)
- seccomp profile: RuntimeDefault
- TLS certificates auto-issued via Let's Encrypt DNS-01
- Secrets managed externally (not in Git)

### Infrastructure
- kube-vip IP allocation: 192.168.64.115 (backend optional)
- Traefik ingress with priority-based routing
- cert-manager integration for automatic TLS
- Resource limits configured (backend: 128-512Mi, frontend: 64-256Mi)

### Fixed
- Removed specific line numbers from CLAUDE.md (prevents staleness)
- Updated k8s/README.md to remove ElevenLabs mentions
- Updated k8s/base/secrets.yaml.example to remove unused secrets
- Added Helm-specific patterns to .gitignore

## [0.1.0] - 2025-11-05

### Initial Release
- Go backend with OpenAI GPT Realtime API integration
- React frontend with WebSocket chat
- Resume display component
- Real-time voice synthesis
- Docker containerization
- Basic Kubernetes manifests

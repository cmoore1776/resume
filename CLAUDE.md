# Claude Development Guide

**Live Site**: https://resume.k3s.christianmoore.me

## Tech Stack

- **Backend**: Go 1.23, Gin, Gorilla WebSocket, OpenAI Realtime API (`github.com/WqyJh/go-openai-realtime/v2`)
- **Frontend**: React 19, TypeScript, Vite, Web Audio API
- **Deployment**: Docker, Helm, ArgoCD, k3s, Traefik

## Critical Architecture Details

**WebSocket Flow**:
```
Browser → ws://backend:8080/ws/chat → OpenAI Realtime API
         ← text + base64 PCM16 audio (24kHz) ←
```

**Key Files**:
- `backend/handlers/chat.go` - WebSocket handler, OpenAI proxy, rate limiting
- `backend/handlers/auth.go` - JWT authentication, Cloudflare Turnstile verification
- `backend/config/config.go` - Environment configuration, system prompt loading
- `backend/main.go` - CORS middleware, route definitions, trusted proxies
- `frontend/src/components/Chat.tsx` - WebSocket client, audio playback
- `frontend/docker-entrypoint.sh` - Runtime env var injection via sed
- `chart/values.yaml` - Helm config (backend/frontend settings, systemPrompt section)

## Non-Obvious Implementation Details

### Authentication & Security

**JWT + Cloudflare Turnstile Protection**:
- WebSocket connections require valid JWT token
- JWT tokens obtained via `/api/verify-turnstile` (bot protection) or `/api/token` (rate-limited)
- Tokens passed via `Authorization: Bearer <token>` header or `Sec-WebSocket-Protocol` header
- 30-minute token expiration
- Development mode: if JWT_SECRET/TURNSTILE_SECRET not set, auth bypassed with warnings

**Rate Limiting (Backend)**:
- Per-connection: 1 message per 5 seconds, burst of 3
- Per-IP: 10 concurrent WebSocket connections max
- Message length: 1-4000 characters
- Input sanitization: control character removal

**Traefik Middleware Rate Limits**:
- Backend API: 2 req/sec average, 5 burst
- Frontend static assets: 20 req/sec average, 40 burst

### Backend CORS Requires Two Locations
Both must allow same origins or WebSocket upgrade fails with 403:
1. `backend/main.go` - HTTP CORS middleware (cors.New configuration)
2. `backend/handlers/chat.go` - WebSocket upgrader CheckOrigin function

Current allowed origins:
- `http://localhost:5173` (Vite dev)
- `http://localhost:3000` (docker-compose)
- `https://christianmoore.me`
- `https://resume.k3s.christianmoore.me`

### Frontend Runtime Environment Injection
Frontend uses **runtime** env injection (not build-time):
- Vite build creates placeholders: `__VITE_WS_URL__`, `__VITE_API_URL__`
- `docker-entrypoint.sh` uses `sed` to replace in `/etc/nginx/html/*.js` on container start
- Requires UID 101 to write files (custom nginx base image)

### Security Context Mismatch Prevention
**Backend**: UID 1000 (default)
**Frontend**: UID 101 (nginx user in `cmooreio/nginx:latest`)

Frontend deployment MUST use UID 101 or sed fails with permission denied:
- `chart/values.yaml` - Frontend-specific `podSecurityContext` (runAsUser: 101)
- `chart/templates/frontend-deployment.yaml` - Uses `frontend.podSecurityContext`

### Audio Format
**CRITICAL**: We do NOT set the `Format` field in `SessionAudioOutput`. This prevents audio distortion/static issues with GPT Realtime API. OpenAI uses default format when unspecified.

```go
// Backend (chat.go) - Configure session with voice ONLY (no format specified)
Audio: &openairt.RealtimeSessionAudio{
    Output: &openairt.SessionAudioOutput{
        Voice: openairt.VoiceCedar, // Masculine voice, no Format field
    },
},
```

```typescript
// Frontend (Chat.tsx) - Decode base64 → PCM16 → Float32
// OpenAI sends PCM16 24kHz by default
const view = new DataView(binary.buffer);
const float32 = new Float32Array(binary.length / 2);
for (let i = 0; i < float32.length; i++) {
  float32[i] = view.getInt16(i * 2, true) / 32768.0;
}
```

## Code Quality & Pre-commit Hooks

The project uses pre-commit hooks for automated code quality checks. Install and enable:

```bash
pip install pre-commit
pre-commit install
```

**Hooks automatically run on commit**:
- Go formatting (`go fmt`, `go imports`)
- Go linting (`go vet`)
- Go module tidying (`go mod tidy`)
- Dockerfile linting (`hadolint`)
- YAML validation (`yamllint`, skips Helm templates)
- Markdown formatting (`markdownlint`)
- Shell script linting (`shellcheck`)
- Secrets detection (`detect-secrets`)
- General file checks (trailing whitespace, EOF, merge conflicts)

**Skip hooks** (not recommended):
```bash
git commit --no-verify -m "Message"
```

**Frontend linting** (separate from pre-commit):
```bash
cd frontend && npm run lint
```

## Local Development

### Docker Compose (Recommended)
```bash
export OPENAI_API_KEY=sk-your-key
docker-compose up --build
# Frontend: http://localhost:3000, Backend: http://localhost:8080
```

### Manual
```bash
# Backend
cd backend && go run main.go

# Frontend
cd frontend && npm run dev  # http://localhost:5173
```

## Build and Deploy

### Build Images
```bash
make docker-build-push TAG=v1.0.X
# Pushes to registry.k3s.local.christianmoore.me:8443/resume/{backend,frontend}:v1.0.X
```

### Deploy
```bash
# 1. Update chart/values.yaml tags
backend.image.tag: "v1.0.X"
frontend.image.tag: "v1.0.X"

# 2. Commit and push (triggers ArgoCD auto-sync)
git add chart/values.yaml && git commit -m "Update to v1.0.X" && git push

# 3. Monitor deployment
kubectl get pods -n resume
kubectl logs -n resume -l app=resume-backend
```

### Force ArgoCD Sync
```bash
kubectl patch application resume -n argocd --type merge \
  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
```

## Common Issues

### WebSocket 403 Forbidden
**Cause**: Origin not in CORS/CheckOrigin lists, or missing/invalid JWT token
**Fix**:
- Add origin to both `main.go` (CORS middleware) AND `chat.go` (CheckOrigin function)
- Verify JWT token is being sent in Authorization header or Sec-WebSocket-Protocol

### Frontend CrashLoopBackOff - Permission Denied
**Cause**: Security context not UID 101
**Symptoms**: `sed: can't create temp file ... Permission denied`
**Fix**: Verify `chart/values.yaml` frontend.podSecurityContext uses runAsUser: 101

### Images Not Updating After Push
**Cause**: ArgoCD synced but still old revision
**Check**: `kubectl get application resume -n argocd -o jsonpath='{.status.sync.revision}'`
**Fix**: Force sync with kubectl patch above

### Audio Not Playing
**Check**: Browser console for Web Audio API errors
**Common**: User didn't interact with page first (autoplay policy)

## Environment Variables

### Backend (from k8s Secret)
- `OPENAI_API_KEY` - Required, from resume-secrets
- `JWT_SECRET` - Required for production, JWT token signing (32+ byte random string)
- `TURNSTILE_SECRET` - Cloudflare Turnstile secret key (optional, enables bot protection)
- `TURNSTILE_SITE_KEY` - Cloudflare Turnstile site key (optional)
- `OPENAI_MODEL` - Default: `gpt-realtime-mini` (production: `gpt-4o-realtime-preview-2024-12-17`)
- `PORT` - Default: 8080
- `SYSTEM_PROMPT_PATH` - Default: `/app/data/system_prompt.txt` (falls back to local file)

### Frontend (injected at runtime)
- `VITE_WS_URL` - Replaced by docker-entrypoint.sh
- `VITE_API_URL` - Replaced by docker-entrypoint.sh

## Key Customizations

### Update AI Behavior
Edit `chart/values.yaml` systemPrompt.content section, commit, push (ArgoCD auto-deploys)

### Update Resume
Edit `frontend/src/components/Resume.tsx`, rebuild frontend image

### Change Voice
Edit `backend/handlers/chat.go` SessionAudioOutput.Voice (VoiceCedar → VoiceEcho/Alloy/etc), rebuild backend

### Update Authentication
- Generate new JWT secret: `openssl rand -base64 32`
- Update Kubernetes secret with new `jwt-secret` key
- Restart backend pods to pick up new secret

## Registry Configuration

**URL**: `registry.k3s.local.christianmoore.me:8443`
**Note**: Port 8443 required for k3s.local domain

## Debugging Commands

```bash
# Pod status
kubectl get pods -n resume

# Logs
kubectl logs -n resume -l app=resume-backend --tail=50
kubectl logs -n resume -l app=resume-frontend --tail=50

# ArgoCD status
kubectl get application resume -n argocd -o yaml

# Deployment images
kubectl get deployment -n resume -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}'

# Security contexts
kubectl get pod -n resume -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.securityContext.runAsUser}{"\n"}{end}'
```

## Critical Gotchas

1. **DO NOT set audio Format field** - Leave unset in SessionAudioOutput to avoid distortion/static
2. **Authentication required** - WebSocket needs JWT token (dev mode bypasses if JWT_SECRET not set)
3. **No hot reload in containers** - Must rebuild and redeploy for code changes
4. **System prompt lives in three places** - values.yaml ConfigMap (k8s), system_prompt.txt (local dev), config.go fallback
5. **Frontend needs write access** - UID 101 required for sed in entrypoint
6. **CORS in two places** - Both main.go and chat.go must match origins
7. **ArgoCD auto-sync** - Commits to main branch auto-deploy (prune + self-heal enabled)
8. **No reconnection logic** - User must refresh if WebSocket drops
9. **Audio requires interaction** - Browser autoplay policy requires user click first
10. **StatefulSet not Deployment** - Backend uses StatefulSet for ConfigMap volume mount

## Project Structure

```
backend/
  ├── handlers/
  │   ├── auth.go           # JWT & Cloudflare Turnstile authentication
  │   └── chat.go           # WebSocket handler, OpenAI proxy, rate limiting
  ├── config/config.go      # Environment config, system prompt loading
  ├── main.go               # CORS middleware, routes, trusted proxies
  ├── system_prompt.txt     # Local dev system prompt
  └── Dockerfile            # Multi-stage build, Go 1.23-alpine

frontend/
  ├── src/
  │   ├── components/
  │   │   ├── Chat.tsx      # WebSocket client, JWT auth, audio playback
  │   │   └── Resume.tsx    # Resume content/layout
  │   └── App.tsx           # Main application layout
  ├── docker-entrypoint.sh  # Runtime env var injection via sed
  ├── nginx.conf            # Nginx config (root: /etc/nginx/html)
  └── Dockerfile            # Custom nginx base (UID 101)

chart/
  ├── values.yaml           # Configuration:
  │                         #   - frontend.podSecurityContext (UID 101)
  │                         #   - systemPrompt.content
  │                         #   - rateLimit settings
  │                         #   - secrets configuration
  └── templates/
      ├── frontend-deployment.yaml    # Frontend Deployment
      ├── backend-statefulset.yaml    # Backend StatefulSet (ConfigMap mount)
      ├── configmap.yaml              # System prompt ConfigMap
      ├── ingressroute.yaml           # Traefik IngressRoute
      ├── middleware.yaml             # Traefik rate limiting
      └── sealedsecret.yaml.example   # SealedSecret template

argocd/resume.yaml         # ArgoCD Application (auto-sync: true)
docker-compose.yaml        # Local development environment
Makefile                   # Build/deploy automation
```

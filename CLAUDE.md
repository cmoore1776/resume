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
- `backend/handlers/chat.go` - WebSocket handler, OpenAI proxy
- `backend/main.go:29` - CORS middleware
- `backend/handlers/chat.go:15-22` - WebSocket CheckOrigin
- `frontend/src/components/Chat.tsx` - WebSocket client, audio playback
- `frontend/docker-entrypoint.sh` - Runtime env var injection via sed
- `chart/values.yaml` - Helm config, system prompt (lines 152-193)

## Non-Obvious Implementation Details

### Backend CORS Requires Two Locations
Both must allow same origins or WebSocket upgrade fails with 403:
1. `backend/main.go:29` - HTTP CORS middleware
2. `backend/handlers/chat.go:15-22` - WebSocket CheckOrigin function

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
- `chart/values.yaml:106-122` - Frontend-specific podSecurityContext
- `chart/templates/frontend-deployment.yaml:28` - Uses `frontend.podSecurityContext`

### Audio Format
**CRITICAL**: We do NOT set the `Format` field in `SessionAudioOutput` (chat.go:86-88). This prevents audio distortion/static issues with GPT Realtime API. OpenAI uses default format when unspecified.

```typescript
// chat.go:87 - Backend configures voice ONLY (no format specified)
Voice: openairt.VoiceCedar

// Chat.tsx - Frontend decodes base64 → PCM16 → Float32
// OpenAI sends PCM16 24kHz by default
const view = new DataView(binary.buffer);
const float32 = new Float32Array(binary.length / 2);
for (let i = 0; i < float32.length; i++) {
  float32[i] = view.getInt16(i * 2, true) / 32768.0;
}
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
**Cause**: Origin not in CORS/CheckOrigin lists
**Fix**: Add to both `main.go:29` AND `chat.go:15-22`

### Frontend CrashLoopBackOff - Permission Denied
**Cause**: Security context not UID 101
**Symptoms**: `sed: can't create temp file ... Permission denied`
**Fix**: Verify `chart/values.yaml:106-112` uses runAsUser: 101

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
- `OPENAI_MODEL` - Default: `gpt-4o-realtime-preview-2024-12-17`
- `PORT` - Default: 8080

### Frontend (injected at runtime)
- `VITE_WS_URL` - Replaced by docker-entrypoint.sh
- `VITE_API_URL` - Replaced by docker-entrypoint.sh

## Key Customizations

### Update AI Behavior
Edit `chart/values.yaml:152-193` (systemPrompt.content), commit, push

### Update Resume
Edit `frontend/src/components/Resume.tsx`, rebuild frontend image

### Change Voice
Edit `backend/handlers/chat.go:87` (VoiceCedar → VoiceEcho/Alloy/etc), rebuild backend

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

1. **DO NOT set audio Format field** - Leave unset in SessionAudioOutput to avoid distortion/static (chat.go:86-88)
2. **No hot reload in containers** - Must rebuild and redeploy for code changes
3. **System prompt lives in two places** - values.yaml (k8s) and system_prompt.txt (local dev)
4. **Frontend needs write access** - UID 101 required for sed in entrypoint
5. **CORS in two places** - Both main.go and chat.go must match
6. **ArgoCD auto-sync** - Commits to main branch auto-deploy (prune + self-heal enabled)
7. **No reconnection logic** - User must refresh if WebSocket drops
8. **Audio requires interaction** - Browser autoplay policy requires user click first

## Project Structure

```
backend/
  ├── handlers/chat.go      # OpenAI integration (line 87: voice config)
  ├── main.go               # CORS (line 29), routes
  └── Dockerfile            # Multi-stage, Go 1.23-alpine

frontend/
  ├── src/components/Chat.tsx    # WebSocket client, audio decode
  ├── docker-entrypoint.sh       # Runtime sed replacement
  ├── nginx.conf                 # Root: /etc/nginx/html
  └── Dockerfile                 # Custom nginx base (UID 101)

chart/
  ├── values.yaml                # Lines 106-122: frontend securityContext
  │                              # Lines 152-193: systemPrompt
  └── templates/
      ├── frontend-deployment.yaml   # Line 28: frontend.podSecurityContext
      └── backend-deployment.yaml    # Line 29: backend.podSecurityContext

argocd/resume.yaml         # Auto-sync: true, prune: true
docker-compose.yaml        # Local dev environment
Makefile                   # docker-build-push automation
```

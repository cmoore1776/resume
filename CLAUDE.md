# Claude Development Guide

## Project Overview

Interactive resume website with AI-powered chat using OpenAI's GPT Realtime API. Users view Christian Moore's resume and ask questions via text or voice.

**Live Site**: https://resume.k3s.christianmoore.me

## Architecture

```
Browser (React) ←→ WebSocket ←→ Go Backend ←→ WebSocket ←→ OpenAI Realtime API
                  text + audio              Realtime protocol
```

**Flow:**
1. Browser connects to `/ws/chat` WebSocket endpoint
2. Backend proxies connection to OpenAI Realtime API
3. User sends text message
4. OpenAI streams back text transcript + audio (base64 PCM16, 24kHz)
5. Frontend displays text and plays audio in real-time

## Tech Stack

**Backend:** Go 1.23, Gin framework, Gorilla WebSocket, `github.com/WqyJh/go-openai-realtime/v2`
**Frontend:** React 19, TypeScript, Vite, Web Audio API
**AI:** OpenAI GPT-4o Realtime API
**Deployment:** Helm chart, ArgoCD, k3s, Docker

## Project Structure

```
backend/
  ├── main.go              # Server setup, CORS, routes
  ├── config/config.go     # Environment config loader
  ├── handlers/chat.go     # WebSocket handler, OpenAI integration
  ├── system_prompt.txt    # AI instructions
  └── Dockerfile           # Multi-stage build (Go 1.23-alpine)

frontend/
  ├── src/
  │   ├── App.tsx          # Layout: Resume + Chat side-by-side
  │   └── components/
  │       ├── Chat.tsx     # WebSocket client, audio playback
  │       └── Resume.tsx   # Static resume HTML
  ├── Dockerfile           # Multi-stage build (node:20-alpine, custom nginx)
  ├── nginx.conf           # Nginx config (runs on port 80)
  └── docker-entrypoint.sh # Runtime env var injection

chart/                     # Helm chart for k8s deployment
  ├── values.yaml          # Configuration (images, resources, ingress)
  └── templates/           # K8s manifests (deployments, services, ingress)

k8s/base/                  # Legacy k8s manifests (not actively used)
argocd/                    # ArgoCD application manifest
docker-compose.yaml        # Local development environment
RESUME.md                  # Source resume content
```

## Key Implementation Details

### Backend (handlers/chat.go)

**WebSocket Handler:**
- Upgrades HTTP to WebSocket with origin checking
- Creates OpenAI Realtime client
- Configures session with system prompt and voice modality
- Proxies messages bidirectionally between client and OpenAI
- Uses goroutines + mutex for concurrent message handling

**Session Configuration:**
- Voice: `VoiceCedar` (masculine voice from OpenAI)
- Output Modality: `ModalityAudio` (includes text transcript)
- Instructions: Loaded from `system_prompt.txt` (mounted from ConfigMap in k8s)

**Event Handling:**
- `ResponseOutputAudioTranscriptDeltaEvent` → text streaming
- `ResponseOutputAudioDeltaEvent` → audio streaming (base64 PCM16)
- `ResponseDoneEvent` → response complete
- `ErrorEvent` → logged but ignored (responses still work)

### Frontend (Chat.tsx)

**WebSocket Client:**
- Connects on mount, persists connection
- No automatic reconnection (user must refresh)

**Message Types:**
- `text_delta` → append to streaming text
- `text_done` → finalize text message
- `audio_delta` → decode base64 → PCM16 → Float32 → buffer
- `audio_done` → audio complete
- `response_done` → full response complete
- `error` → display error message

**Audio Processing:**
1. Decode base64 to Uint8Array
2. Convert PCM16 (signed 16-bit) to Float32 (-1.0 to 1.0)
3. Accumulate in `audioBuffersRef`
4. Create Web Audio API buffers at 24kHz
5. Play sequentially

**Runtime Environment Variables:**
- Frontend uses placeholder strings (`__VITE_WS_URL__`, `__VITE_API_URL__`)
- docker-entrypoint.sh replaces placeholders at container startup using `sed`
- Allows single image to work in different environments

### Resume Component

Static hardcoded JSX in `Resume.tsx` (not auto-generated from RESUME.md)

## Environment Variables

### Backend
```bash
OPENAI_API_KEY=sk-...                           # Required (from Kubernetes Secret)
OPENAI_MODEL=gpt-4o-realtime-preview-2024-12-17 # Default
PORT=8080                                       # Default
```

### Frontend (Docker Runtime)
```bash
VITE_WS_URL=wss://resume.k3s.christianmoore.me/ws/chat  # Production
VITE_API_URL=https://resume.k3s.christianmoore.me       # Production

# Local development
VITE_WS_URL=ws://localhost:8080/ws/chat
VITE_API_URL=http://localhost:8080
```

## WebSocket Protocol

### Client → Server
```json
{"type": "message", "message": "What's Christian's Kubernetes experience?"}
```

### Server → Client
```json
{"type": "text_delta", "text": "Christian has..."}
{"type": "text_done"}
{"type": "audio_delta", "audio": "base64-pcm16..."}
{"type": "audio_done"}
{"type": "response_done"}
{"type": "error", "error": "message"}
```

## Development Workflow

### Local Development with Docker Compose

**Quick Start:**
```bash
# Set OPENAI_API_KEY in .env or export it
export OPENAI_API_KEY=sk-your-key

# Start both services
docker-compose up --build

# Access at http://localhost:3000
```

Services:
- Backend: http://localhost:8080 (with health checks)
- Frontend: http://localhost:3000 (depends on backend healthy)

### Manual Development

```bash
# Terminal 1 - Backend
cd backend && go run main.go

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### Build Production Images

```bash
# Build and push to local k3s registry
make docker-build-push TAG=v1.0.5

# Builds both:
# - registry.k3s.local.christianmoore.me:8443/resume/backend:v1.0.5
# - registry.k3s.local.christianmoore.me:8443/resume/frontend:v1.0.5
```

## Deployment

### Helm Chart Deployment

**Values Configuration (chart/values.yaml):**
- Image repositories and tags
- Security contexts (backend: UID 1000, frontend: UID 101)
- Resource limits and requests
- Ingress/IngressRoute configuration (Traefik)
- System prompt ConfigMap
- Rate limiting middleware

**Deploy via ArgoCD:**
```bash
# ArgoCD auto-syncs from GitHub main branch
# Watches: chart/ directory
# Namespace: resume
# Application: argocd/resume.yaml

# Manual sync if needed
kubectl patch application resume -n argocd --type merge \
  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
```

**Manual Helm Install:**
```bash
# Create namespace and secret
kubectl create namespace resume
kubectl create secret generic resume-secrets \
  --from-literal=openai-api-key=sk-your-key \
  -n resume

# Install chart
helm install resume ./chart -n resume
```

### Security Contexts

**Backend (UID 1000):**
```yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
```

**Frontend (UID 101 - nginx user):**
```yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 101      # Custom nginx base image runs as UID 101
  runAsGroup: 101
  fsGroup: 101
```

Frontend requires UID 101 to match the nginx user in `cmooreio/nginx:latest` base image, allowing docker-entrypoint.sh to modify files in `/etc/nginx/html` for runtime environment injection.

## Common Tasks

### Update AI Behavior
Edit `chart/values.yaml` → `systemPrompt.content` or `backend/system_prompt.txt`, then:
```bash
# If editing values.yaml
git commit && git push  # ArgoCD auto-syncs

# If editing system_prompt.txt
docker build backend/
git commit && git push
make docker-build-push TAG=v1.0.X
# Update chart/values.yaml tag, commit, push
```

### Update Resume Content
Edit `frontend/src/components/Resume.tsx` directly, then rebuild frontend image

### Change WebSocket Protocol
Update both `backend/handlers/chat.go` and `frontend/src/components/Chat.tsx`

### Modify CORS
Edit allowed origins in:
- `backend/main.go:29` (CORS middleware)
- `backend/handlers/chat.go:15-22` (WebSocket CheckOrigin)

Current allowed origins:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (docker-compose)
- `https://christianmoore.me`
- `https://resume.k3s.christianmoore.me`

### Update Image Version

```bash
# 1. Build and push new images
make docker-build-push TAG=v1.0.X

# 2. Update chart/values.yaml
backend.image.tag: "v1.0.X"
frontend.image.tag: "v1.0.X"

# 3. Commit and push (triggers ArgoCD sync)
git add chart/values.yaml
git commit -m "Update to v1.0.X"
git push
```

## Known Issues & Debugging

**Issues:**
- No reconnection logic (manual refresh required if connection drops)
- OpenAI error events logged but ignored (don't affect responses)
- Frontend docker-entrypoint.sh requires write access to `/etc/nginx/html` (hence UID 101)

**Debugging Tips:**
- Backend logs: `kubectl logs -n resume -l app=resume-backend`
- Frontend logs: `kubectl logs -n resume -l app=resume-frontend`
- ArgoCD status: `kubectl get application resume -n argocd`
- DevTools → Network → WS tab for WebSocket frames
- WebSocket 403 errors → check CORS config in both main.go and chat.go
- Frontend CrashLoopBackOff → verify security context matches nginx UID (101)
- Permission denied in entrypoint → check fsGroup and file ownership

## Registry Configuration

**Local k3s Registry:**
- URL: `registry.k3s.local.christianmoore.me:8443`
- Namespace: `resume`
- Images:
  - `registry.k3s.local.christianmoore.me:8443/resume/backend:TAG`
  - `registry.k3s.local.christianmoore.me:8443/resume/frontend:TAG`

**Note:** Port 8443 is required for k3s.local domain resolution

## Important Notes

- Backend changes require rebuild and redeploy (no hot reload in containers)
- Frontend uses runtime environment injection via docker-entrypoint.sh
- WebSocket protocol changes must be synchronized between backend/frontend
- System prompt changes: edit values.yaml for k8s, system_prompt.txt for local dev
- Resume updates are manual edits to Resume.tsx (not auto-generated)
- Audio: PCM16, 24kHz, mono, base64-encoded, converted to Float32 for playback
- ArgoCD auto-sync enabled with prune and self-heal
- Frontend nginx runs on custom base image (`cmooreio/nginx:latest`) as UID 101

## Critical Files

**Backend:**
- `backend/main.go` - Server entry, routes, CORS
- `backend/handlers/chat.go` - WebSocket handler, OpenAI integration
- `backend/config/config.go` - Environment loading
- `backend/system_prompt.txt` - AI instructions (local dev)
- `backend/Dockerfile` - Multi-stage build

**Frontend:**
- `frontend/src/App.tsx` - Layout (Resume + Chat)
- `frontend/src/components/Chat.tsx` - WebSocket client, audio
- `frontend/src/components/Resume.tsx` - Resume display
- `frontend/Dockerfile` - Multi-stage build with runtime env injection
- `frontend/docker-entrypoint.sh` - Runtime environment variable replacement
- `frontend/nginx.conf` - Nginx configuration (root: /etc/nginx/html)

**Deployment:**
- `chart/values.yaml` - Helm chart configuration
- `chart/templates/` - Kubernetes manifests
- `argocd/resume.yaml` - ArgoCD application
- `Makefile` - Build and push automation
- `docker-compose.yaml` - Local development environment

## Access URLs

- **Production**: https://resume.k3s.christianmoore.me
- **Local Dev (Vite)**: http://localhost:5173
- **Local Docker Compose**: http://localhost:3000
- **Backend API**: http://localhost:8080 (local)
- **Health Check**: http://localhost:8080/health

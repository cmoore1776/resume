# Claude Development Guide

**Live Site**: https://resume.k3s.christianmoore.me

## Tech Stack
- **Backend**: Go 1.23, Gin, Gorilla WebSocket, OpenAI Realtime API or Local LLM+TTS
- **Frontend**: React 19, TypeScript, Vite, Web Audio API
- **Deployment**: Docker, Helm, ArgoCD, k3s, Traefik

## Key Files
- `backend/handlers/chat.go` - WebSocket handler, pipeline routing, rate limiting
- `backend/handlers/local_pipeline.go` - Local LLM + TTS pipeline
- `backend/handlers/auth.go` - JWT + Cloudflare Turnstile auth
- `backend/config/config.go` - Environment config, system prompt loading
- `frontend/src/components/Chat.tsx` - WebSocket client, audio playback
- `chart/values.yaml` - Helm config (all settings, systemPrompt, TTS voice/speed)
- `chart/templates/backend-statefulset.yaml` - Backend + TTS sidecar

## Critical Details

### CORS Configuration (Two Locations Required)
Both must allow same origins or WebSocket fails with 403:
1. `backend/main.go` - CORS middleware
2. `backend/handlers/chat.go` - WebSocket upgrader CheckOrigin

Allowed: `http://localhost:5173`, `http://localhost:3000`, `https://christianmoore.me`, `https://resume.k3s.christianmoore.me`

### Authentication
- WebSocket requires JWT token via `Authorization: Bearer <token>` or `Sec-WebSocket-Protocol` header
- Get token: `/api/verify-turnstile` (bot protection) or `/api/token` (rate-limited)
- Dev mode: auth bypassed if JWT_SECRET/TURNSTILE_SECRET not set

### Audio Format (OpenAI Mode)
**CRITICAL**: Do NOT set `Format` field in `SessionAudioOutput` - prevents distortion. Frontend decodes PCM16 24kHz.

### Frontend Runtime Env Injection
- Vite creates placeholders: `__VITE_WS_URL__`, `__VITE_API_URL__`
- `docker-entrypoint.sh` replaces via sed on start
- **Requires UID 101** for write access (nginx user)

### TTS Configuration (Local Pipeline)
- Voice and speed configurable via environment variables (no rebuild needed)
- Set in `chart/values.yaml`: `backend.env.ttsVoice`, `backend.env.ttsSpeed`
- Available voices: onyx, alloy, echo, fable, nova, shimmer
- Speed range: 0.25-4.0 (default 1.0)

## Build & Deploy

### Build Images
```bash
make docker-build-push TAG=v1.0.X
```

### Deploy
```bash
# 1. Update chart/values.yaml tags
# 2. Commit and push (ArgoCD auto-syncs)
git add . && git commit -m "Update to v1.0.X" && git push

# 3. Monitor
kubectl get pods -n resume
kubectl logs -n resume -l app=resume-backend --tail=50
```

### Force ArgoCD Sync
```bash
kubectl patch application resume -n argocd --type merge \
  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
```

## Environment Variables

### Backend (from k8s Secret or .env)
- `OPENAI_API_KEY` - Required when `USE_LOCAL_PIPELINE=false`
- `JWT_SECRET` - JWT signing key (32+ bytes)
- `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` - Bot protection
- `USE_LOCAL_PIPELINE` - Set `true` for local LLM+TTS mode
- `LOCAL_LLM_URL` - LLM endpoint (default: qwen2.5-7b-instruct)
- `TTS_URL` - TTS endpoint (default: http://localhost:8000)
- `TTS_VOICE` - Voice name (default: onyx)
- `TTS_SPEED` - Speed 0.25-4.0 (default: 0.95)
- `SYSTEM_PROMPT_PATH` - System prompt file path

## Common Issues

### WebSocket 403 Forbidden
- Origin not in CORS lists (update both main.go AND chat.go)
- Missing/invalid JWT token

### Frontend CrashLoopBackOff
- `sed: Permission denied` → Verify runAsUser: 101 in frontend.podSecurityContext

### Images Not Updating
- ArgoCD showing old revision → Force sync with kubectl patch

### Audio Not Playing
- User didn't interact with page (browser autoplay policy)

## Quick Reference

### Local Dev
```bash
docker-compose up --build  # http://localhost:3000
```

### Update System Prompt
Edit `chart/values.yaml` systemPrompt.content, commit, push

### Update TTS Voice/Speed
Edit `chart/values.yaml` backend.env.ttsVoice/ttsSpeed, commit, push (no rebuild needed)

### Pre-commit Hooks
```bash
pip install pre-commit && pre-commit install
```

### Registry
`registry.k3s.local.christianmoore.me:8443` (port required)

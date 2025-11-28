# Claude Development Guide

**Live Site**: https://christianmoore.me

## Tech Stack
- **Backend**: Go, Gin, Gorilla WebSocket, OpenAI Realtime API
- **Frontend**: React, TypeScript, Vite, Web Audio API
- **Deployment**: Docker, Helm, ArgoCD, k3s, Traefik

## Key Files
- `backend/main.go` - Server entry point, CORS config, routes
- `backend/handlers/chat.go` - WebSocket handler, rate limiting
- `backend/handlers/auth.go` - JWT + Cloudflare Turnstile auth
- `backend/config/config.go` - Environment config, system prompt loading
- `frontend/src/components/Chat.tsx` - WebSocket client, audio playback
- `chart/values.yaml` - Helm config (all settings including systemPrompt)

## Critical Details

### CORS Configuration (Two Locations Required)
Both must allow same origins or WebSocket fails with 403:
1. `backend/main.go` - CORS middleware `AllowOrigins`
2. `backend/handlers/chat.go` - WebSocket upgrader `CheckOrigin`

### Authentication
- WebSocket requires JWT token via `Authorization: Bearer <token>` or `Sec-WebSocket-Protocol` header
- Get token: `/api/verify-turnstile` (bot protection) or `/api/token` (rate-limited)
- Dev mode: auth bypassed if `JWT_SECRET`/`TURNSTILE_SECRET` not set

### Audio Format (OpenAI Mode)
**CRITICAL**: Do NOT set `Format` field in `SessionAudioOutput` - causes distortion. Frontend decodes PCM16 24kHz.

### Frontend Deployment (Git-Sync Pattern)
- Frontend builds pushed to `dist` branch (GitHub Actions or `npm run deploy`)
- Git-sync sidecar pulls `dist` branch every 60 seconds
- Init container applies env substitution from Helm values
- No Docker rebuild needed for frontend changes - just push to main

**Env placeholders**: `__VITE_WS_URL__`, `__VITE_API_URL__`, `__VITE_PUBLIC_POSTHOG_KEY__`, `__VITE_PUBLIC_POSTHOG_HOST__`

## Build & Deploy

```bash
# Frontend: automatic via GitHub Actions on push to main
# Or manually:
cd frontend && npm run deploy

# Backend: build and push Docker image
make docker-build-push TAG=<version>
# Update chart/values.yaml backend.image.tag, commit and push

# Monitor
kubectl get pods -n resume
kubectl logs -n resume -l app=resume-backend --tail=50

# Force ArgoCD sync
kubectl patch application resume -n argocd --type merge \
  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
```

## Environment Variables

### Backend
- `OPENAI_API_KEY` - Required for OpenAI Realtime API
- `JWT_SECRET` - JWT signing key (32+ bytes)
- `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` - Cloudflare bot protection
- `SYSTEM_PROMPT_PATH` - System prompt file path

## Common Issues

### WebSocket 403 Forbidden
- Origin not in CORS lists (update both `main.go` AND `chat.go`)
- Missing/invalid JWT token

### Frontend Not Updating
- Check git-sync logs: `kubectl logs -n resume -l app=resume-frontend -c git-sync`
- Verify `dist` branch exists and has content
- Pod restart needed after git-sync updates (init container runs only at startup)

### Images Not Updating
- ArgoCD showing old revision - Force sync with kubectl patch

### Audio Not Playing
- User didn't interact with page (browser autoplay policy)

## Quick Reference

```bash
# Local dev
docker-compose up --build  # http://localhost:3000

# Update system prompt
# Edit chart/values.yaml systemPrompt.content, commit, push

# Pre-commit hooks
pip install pre-commit && pre-commit install
```

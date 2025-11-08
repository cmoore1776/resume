# Claude Development Guide

## Project Overview

Interactive resume website with AI-powered chat using OpenAI's GPT Realtime API. Users view Christian Moore's resume and ask questions via text or voice.

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

**Backend:** Go, Gin framework, Gorilla WebSocket, `github.com/WqyJh/go-openai-realtime/v2`
**Frontend:** React 19, TypeScript, Vite, Web Audio API
**AI:** OpenAI GPT-4o Realtime API

## Project Structure

```
backend/
  ├── main.go              # Server setup, CORS, routes
  ├── config/config.go     # Environment config loader
  ├── handlers/chat.go     # WebSocket handler, OpenAI integration
  └── system_prompt.txt    # AI instructions

frontend/
  ├── src/
  │   ├── App.tsx          # Layout: Resume + Chat side-by-side
  │   └── components/
  │       ├── Chat.tsx     # WebSocket client, audio playback
  │       └── Resume.tsx   # Static resume HTML

k8s/                       # Kubernetes manifests
RESUME.md                  # Source resume content
```

## Key Implementation Details

### Backend (handlers/chat.go)

**WebSocket Handler:**
- Upgrades HTTP to WebSocket
- Creates OpenAI Realtime client
- Configures session with system prompt and voice modality
- Proxies messages bidirectionally between client and OpenAI
- Uses goroutines + mutex for concurrent message handling

**Session Configuration:**
- Voice: `VoiceEcho` (masculine)
- Output Modality: `ModalityAudio` (includes text transcript)
- Instructions: Loaded from `system_prompt.txt`

**Event Handling:**
- `ResponseOutputAudioTranscriptDeltaEvent` → text streaming
- `ResponseOutputAudioDeltaEvent` → audio streaming (base64 PCM16)
- `ResponseDoneEvent` → response complete
- `ErrorEvent` → logged but ignored (responses still work)

### Frontend (Chat.tsx)

**WebSocket Client:**
- Connects on mount, persists connection (cleanup currently disabled)
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

### Resume Component

Static hardcoded JSX in `Resume.tsx` (not auto-generated from RESUME.md)

## Environment Variables

### Backend
```bash
OPENAI_API_KEY=sk-...                           # Required
OPENAI_MODEL=gpt-4o-realtime-preview-2024-12-17 # Default
PORT=8080
```

### Frontend
```bash
VITE_WS_URL=ws://localhost:8080/ws/chat  # Default
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

### Start Development
```bash
# Terminal 1 - Backend
cd backend && go run main.go

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### Build Production
```bash
# Backend
cd backend && go build -o server

# Frontend
cd frontend && npm run build  # Output: dist/
```

## Common Tasks

### Update AI Behavior
Edit `backend/system_prompt.txt` and restart backend (no hot reload)

### Update Resume Content
Edit `frontend/src/components/Resume.tsx` directly

### Change WebSocket Protocol
Update both `backend/handlers/chat.go` and `frontend/src/components/Chat.tsx`

### Modify CORS
Edit allowed origins in `backend/main.go` CORS configuration

## CORS Configuration

Allowed origins:
- `http://localhost:5173` (dev)
- `https://christianmoore.me` (prod)

Required headers: `Upgrade`, `Connection` for WebSocket handshake

## Known Issues & Debugging

**Issues:**
- No reconnection logic (WebSocket cleanup disabled for debugging)
- Manual refresh required if connection drops
- OpenAI error events logged but ignored (don't affect responses)

**Debugging Tips:**
- Backend logs WebSocket events with connection IDs
- Frontend logs all messages to browser console
- DevTools → Network → WS tab for WebSocket frames
- WebSocket fails → verify backend on port 8080
- No audio → check browser permissions, OpenAI API key access, 24kHz PCM16 format
- CORS errors → verify origin in backend CORS config

## Important Notes

- Backend changes require restart (no hot reload)
- Frontend auto-reloads via Vite
- WebSocket protocol changes must be synchronized between backend/frontend
- System prompt changes require backend restart
- Resume updates are manual edits to Resume.tsx (not auto-generated)
- Audio: PCM16, 24kHz, mono, base64-encoded, converted to Float32 for playback
- Kubernetes manifests available in `k8s/` directory

## Critical Files

- `backend/main.go` - Server entry, routes, CORS
- `backend/handlers/chat.go` - WebSocket handler, OpenAI integration
- `backend/config/config.go` - Environment loading
- `backend/system_prompt.txt` - AI instructions
- `frontend/src/App.tsx` - Layout (Resume + Chat)
- `frontend/src/components/Chat.tsx` - WebSocket client, audio
- `frontend/src/components/Resume.tsx` - Resume display

# Interactive AI Resume

An interactive resume website featuring real-time AI chat powered by OpenAI's GPT-4 Realtime API. Users can view Christian Moore's professional resume and engage in voice and text conversations about his experience.

## Overview

This application combines a traditional resume display with an AI-powered chat interface that can answer questions about Christian Moore's professional background. The AI responds with both text and voice using OpenAI's Realtime API, providing a natural conversational experience.

### Key Features

- **Interactive Resume Display**: Full professional resume with experience, skills, and projects
- **AI-Powered Chat**: Ask questions about experience, skills, or projects
- **Real-time Voice Responses**: AI speaks responses using OpenAI's voice synthesis
- **Text Streaming**: See responses appear in real-time as the AI generates them
- **WebSocket Communication**: Low-latency bidirectional communication
- **Production-Ready Deployment**: Kubernetes manifests for scalable deployment

## Tech Stack

### Backend
- **Language**: Go 1.25+
- **Framework**: Gin (HTTP/WebSocket server)
- **AI Integration**: OpenAI Realtime API (GPT-4o Realtime)
- **WebSocket**: Gorilla WebSocket
- **Configuration**: godotenv for environment variables

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **HTTP Client**: Axios
- **Audio Playback**: Web Audio API for real-time PCM audio streaming

### Infrastructure
- **Containerization**: Docker
- **Orchestration**: Kubernetes (k3s)
- **GitOps**: ArgoCD (optional)
- **Deployment**: Production manifests in `k8s/`

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (Client)                       │
│                                                               │
│  ┌────────────────┐              ┌──────────────────────┐   │
│  │  Resume.tsx    │              │     Chat.tsx         │   │
│  │  (Static HTML) │              │  - WebSocket client  │   │
│  │                │              │  - Audio playback    │   │
│  └────────────────┘              │  - Text display      │   │
│                                   └──────────────────────┘   │
└───────────────────────────┬──────────────────────────────────┘
                            │ WebSocket
                            │ (text + base64 audio)
┌───────────────────────────┴──────────────────────────────────┐
│                      Go Backend (Gin)                         │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              WebSocket Handler                        │   │
│  │  - Upgrade HTTP → WebSocket                          │   │
│  │  - Proxy messages to/from OpenAI                     │   │
│  │  - Forward text + audio streams                      │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬──────────────────────────────────┘
                            │ WebSocket
                            │ (OpenAI Realtime Protocol)
┌───────────────────────────┴──────────────────────────────────┐
│                   OpenAI Realtime API                         │
│                                                               │
│  - GPT-4o Realtime model                                     │
│  - Text generation + voice synthesis                         │
│  - Streaming responses (delta events)                        │
└───────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Go**: 1.25+ ([Download](https://golang.org/dl/))
- **Node.js**: 20+ ([Download](https://nodejs.org/))
- **OpenAI API Key**: With GPT-4 Realtime access ([Get key](https://platform.openai.com/api-keys))

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/cmoore1776/resume.git
cd resume
```

### 2. Configure Backend

```bash
cd backend

# Create .env file
cat > .env << EOF
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o-realtime-preview-2024-12-17
PORT=8080
EOF

# (Optional) Customize the AI's behavior
nano system_prompt.txt
```

### 3. Configure Frontend

```bash
cd ../frontend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
VITE_WS_URL=ws://localhost:8080/ws/chat
EOF
```

### 4. Run Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
go run main.go
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### 5. Open the Application

Navigate to [http://localhost:5173](http://localhost:5173) and start chatting!

## Development

### Project Structure

```
.
├── backend/
│   ├── config/
│   │   └── config.go          # Environment configuration
│   ├── handlers/
│   │   └── chat.go            # WebSocket handler + OpenAI integration
│   ├── main.go                # Server entry point
│   ├── system_prompt.txt      # AI instructions (customize this!)
│   ├── go.mod                 # Go dependencies
│   └── .env.example           # Example environment variables
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat.tsx       # Chat interface + WebSocket client
│   │   │   └── Resume.tsx     # Resume display component
│   │   ├── App.tsx            # Main application layout
│   │   ├── App.css            # Global styles
│   │   └── main.tsx           # React entry point
│   ├── package.json           # Node dependencies
│   └── .env.example           # Example environment variables
│
├── k8s/                       # Kubernetes deployment manifests
│   ├── base/                  # Base configurations
│   └── overlays/              # Environment-specific overlays
│
├── docs/                      # Additional documentation
├── RESUME.md                  # Source resume content
├── CLAUDE.md                  # Claude development guide
└── README.md                  # This file
```

### Backend Development

**Running:**
```bash
cd backend
go run main.go
```

**Building:**
```bash
cd backend
go build -o server
./server
```

**Hot Reload (using air):**
```bash
# Install air
go install github.com/air-verse/air@latest

# Run with hot reload
cd backend
air
```

### Frontend Development

**Development Server:**
```bash
cd frontend
npm run dev
```

**Production Build:**
```bash
cd frontend
npm run build
# Output: frontend/dist/
```

**Linting:**
```bash
cd frontend
npm run lint
```

### Customizing the AI

Edit `backend/system_prompt.txt` to change how the AI responds. The system prompt defines the AI's personality, knowledge, and behavior.

**Example:**
```
You are an AI assistant representing Christian Moore, a Cloud Infrastructure Architect.
Answer questions about his professional experience, technical skills, and projects.
Be conversational, helpful, and accurate. If you don't know something, say so.
```

### Customizing the Resume

Edit `frontend/src/components/Resume.tsx` to update the resume content. The resume is currently hardcoded HTML/JSX for flexibility and styling control.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | - | OpenAI API key with GPT-4 Realtime access |
| `OPENAI_MODEL` | No | `gpt-4o-realtime-preview-2024-12-17` | OpenAI Realtime model to use |
| `PORT` | No | `8080` | Port for the backend server |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_WS_URL` | No | `ws://localhost:8080/ws/chat` | Backend WebSocket URL |

## WebSocket Protocol

### Client → Server

```json
{
  "type": "message",
  "message": "What experience does Christian have with Kubernetes?"
}
```

### Server → Client

**Text Streaming:**
```json
{"type": "text_delta", "text": "Christian has extensive "}
{"type": "text_delta", "text": "experience with Kubernetes..."}
{"type": "text_done"}
```

**Audio Streaming:**
```json
{"type": "audio_delta", "audio": "base64-encoded-pcm16..."}
{"type": "audio_delta", "audio": "more-audio-data..."}
{"type": "audio_done"}
```

**Response Complete:**
```json
{"type": "response_done"}
```

**Errors:**
```json
{"type": "error", "error": "Failed to connect to AI service"}
```

## Audio Format

- **Encoding**: PCM16 (16-bit signed integer)
- **Sample Rate**: 24kHz
- **Channels**: Mono (1 channel)
- **Transport**: Base64-encoded binary in JSON messages
- **Playback**: Web Audio API converts PCM16 to Float32 for playback

## Production Deployment

### Docker Build

**Using Makefile:**
```bash
# Build and push to local k3s registry
make docker-build-push

# Or with version tag
make docker-build-push TAG=v1.0.0
```

**Manual Build:**
```bash
# Backend
docker build -t registry.k3s.local.christianmoore.me/resume/backend:latest backend/
docker push registry.k3s.local.christianmoore.me/resume/backend:latest

# Frontend
docker build -t registry.k3s.local.christianmoore.me/resume/frontend:latest frontend/
docker push registry.k3s.local.christianmoore.me/resume/frontend:latest
```

See [docs/LOCAL_REGISTRY.md](docs/LOCAL_REGISTRY.md) for more information.

### Kubernetes Deployment

```bash
# 1. Create namespace
kubectl create namespace resume

# 2. Create secret with OpenAI API key
kubectl create secret generic openai-api-key \
  --from-literal=OPENAI_API_KEY=sk-your-key-here \
  -n resume

# 3. Apply manifests
kubectl apply -k k8s/base -n resume

# 4. Check status
kubectl get pods -n resume
kubectl get svc -n resume
```

### Using ArgoCD (GitOps)

```bash
# Install ArgoCD (if not already installed)
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Create application
kubectl apply -f k8s/argocd/application.yaml
```

## API Endpoints

### Backend

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check endpoint (returns JSON) |
| GET | `/ws/chat` | WebSocket endpoint for chat |

### CORS Policy

The backend allows connections from:
- `http://localhost:5173` (development)
- `https://christianmoore.me` (production)

Update `backend/main.go:29` to add additional origins.

## Troubleshooting

### WebSocket Connection Fails

**Symptoms**: Chat doesn't connect, no responses

**Solutions**:
1. Check backend is running: `curl http://localhost:8080/health`
2. Verify WebSocket URL in `frontend/.env`
3. Check CORS settings in `backend/main.go`
4. Inspect browser console for errors

### No Audio Playback

**Symptoms**: Text appears but no voice

**Solutions**:
1. Check browser console for audio errors
2. Ensure browser allows audio playback (click to interact first)
3. Verify OpenAI API key has Realtime API access
4. Check audio format matches (24kHz PCM16)

### Backend Won't Start

**Symptoms**: `go run main.go` fails

**Solutions**:
1. Verify Go version: `go version` (need 1.25+)
2. Check `OPENAI_API_KEY` is set
3. Run `go mod download` to install dependencies
4. Check port 8080 isn't already in use: `lsof -i :8080`

### Frontend Build Fails

**Symptoms**: `npm run build` errors

**Solutions**:
1. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
2. Check Node.js version: `node --version` (need 20+)
3. Clear Vite cache: `rm -rf node_modules/.vite`

## Performance Considerations

### Audio Latency
- Smaller audio chunks = lower latency but more overhead
- Current implementation streams chunks as received from OpenAI
- Buffer accumulation helps smooth playback on slow connections

### WebSocket Connection
- One WebSocket per user session
- Connection persists for entire chat session
- No automatic reconnection (user must refresh)

### Cost Optimization
- OpenAI Realtime API charges per second of audio
- Each response includes text + voice (no way to disable voice)
- Consider implementing usage limits or authentication

## Security Notes

1. **API Key Protection**: Never commit `.env` files or expose API keys
2. **CORS**: Only allow trusted origins in production
3. **Rate Limiting**: Consider adding rate limits to prevent abuse
4. **Input Validation**: User messages are sent directly to OpenAI (no validation currently)
5. **HTTPS**: Use HTTPS/WSS in production (not WS)

## Contributing

This is a personal project, but feel free to fork it for your own use!

### Making Changes

1. Create a feature branch
2. Make your changes
3. Test locally (backend + frontend)
4. Submit a pull request

### Code Style

- **Go**: Follow standard Go formatting (`go fmt`)
- **TypeScript/React**: ESLint config included (`npm run lint`)

## License

MIT License - see LICENSE file for details. Feel free to use this as a template for your own interactive resume!

## Links

- **Live Demo**: [https://christianmoore.me](https://christianmoore.me)
- **GitHub**: [https://github.com/cmoore1776/resume](https://github.com/cmoore1776/resume)
- **OpenAI Realtime API**: [https://platform.openai.com/docs/guides/realtime](https://platform.openai.com/docs/guides/realtime)

## Acknowledgments

- OpenAI for the GPT-4 Realtime API
- [go-openai-realtime](https://github.com/WqyJh/go-openai-realtime) for the Go client library
- React and Vite teams for excellent developer tools

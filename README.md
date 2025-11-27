# Interactive AI Resume

An interactive resume website featuring real-time AI chat powered by OpenAI's GPT-4 Realtime API. Users can view Christian Moore's professional resume and engage in voice and text conversations about his experience.

**🔗 Live Site**: https://christianmoore.me

## Overview

This application combines a traditional resume display with an AI-powered chat interface that can answer questions about Christian Moore's professional background. The AI responds with both text and voice using OpenAI's Realtime API, providing a natural conversational experience.

### Key Features

- **Interactive Resume Display**: Full professional resume with experience, skills, and projects
- **AI-Powered Chat**: Ask questions about experience, skills, or projects
- **Real-time Voice Responses**: AI speaks responses using OpenAI's voice synthesis (VoiceCedar)
- **Text Streaming**: See responses appear in real-time as the AI generates them
- **WebSocket Communication**: Low-latency bidirectional communication
- **Production Deployment**: Helm chart with ArgoCD GitOps on k3s

## Tech Stack

### Backend
- **Language**: Go 1.23
- **Framework**: Gin (HTTP/WebSocket server)
- **AI Integration**: OpenAI Realtime API (GPT-4o Realtime)
- **WebSocket**: Gorilla WebSocket

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Audio Playback**: Web Audio API for real-time PCM audio streaming

### Infrastructure
- **Containerization**: Docker (multi-stage builds)
- **Orchestration**: Kubernetes (k3s) with Helm charts
- **GitOps**: ArgoCD with auto-sync
- **Ingress**: Traefik IngressRoute with TLS
- **Registry**: Local k3s registry

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Client)                     │
│                                                             │
│  ┌────────────────┐              ┌──────────────────────┐   │
│  │  Resume.tsx    │              │     Chat.tsx         │   │
│  │  (Static HTML) │              │  - WebSocket client  │   │
│  │                │              │  - Audio playback    │   │
│  └────────────────┘              │  - Text display      │   │
│                                  └──────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket
                            │ (text + base64 audio)
┌───────────────────────────┴─────────────────────────────────┐
│                      Go Backend (Gin)                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              WebSocket Handler                       │   │
│  │  - Upgrade HTTP → WebSocket                          │   │
│  │  - Proxy messages to/from OpenAI                     │   │
│  │  - Forward text + audio streams                      │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket
                            │ (OpenAI Realtime Protocol)
┌───────────────────────────┴──────────────────────────────────┐
│                   OpenAI Realtime API                        │
│                                                              │
│  - GPT-4o Realtime model                                     │
│  - Text generation + voice synthesis                         │
│  - Streaming responses (delta events)                        │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- **Go**: 1.23+ ([Download](https://golang.org/dl/))
- **Node.js**: 20+ ([Download](https://nodejs.org/))
- **Docker**: For containerized deployment ([Download](https://www.docker.com/))
- **OpenAI API Key**: With GPT-4 Realtime access ([Get key](https://platform.openai.com/api-keys))
- **pre-commit** (optional): For code quality checks ([Install](https://pre-commit.com/))

### Local Development with Docker Compose

The fastest way to run the application locally:

```bash
# 1. Clone the repository
git clone https://github.com/cmoore1776/resume.git
cd resume

# 2. Set your OpenAI API key
export OPENAI_API_KEY=sk-your-api-key-here

# 3. Start both services
docker-compose up --build

# 4. Open http://localhost:3000
```

### Manual Development

**Backend:**
```bash
cd backend

# Create .env file
cat > .env << EOF
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-realtime-mini
PORT=8080
EOF

# Run
go run main.go
```

**Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev

# Open http://localhost:5173
```

## Project Structure

```
.
├── backend/              # Go backend (Gin + WebSocket)
│   ├── handlers/
│   │   ├── auth.go       # JWT & Cloudflare Turnstile authentication
│   │   └── chat.go       # WebSocket handler, OpenAI proxy, rate limiting
│   ├── config/
│   │   └── config.go     # Environment configuration, system prompt loading
│   ├── main.go           # Server entry point, CORS, routes
│   ├── system_prompt.txt # System prompt for local development
│   └── Dockerfile        # Multi-stage build
│
├── frontend/             # React frontend (TypeScript + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat.tsx  # WebSocket client, JWT auth, audio playback
│   │   │   └── Resume.tsx # Resume content and layout
│   │   └── App.tsx       # Main application layout
│   ├── Dockerfile        # Multi-stage build with nginx
│   └── docker-entrypoint.sh  # Runtime env injection
│
├── chart/                # Helm chart for k8s deployment
│   ├── values.yaml       # Configuration (system prompt, rate limits, etc)
│   └── templates/
│       ├── backend-statefulset.yaml  # Backend StatefulSet
│       ├── frontend-deployment.yaml  # Frontend Deployment
│       ├── configmap.yaml            # System prompt ConfigMap
│       ├── middleware.yaml           # Traefik rate limiting
│       └── ...           # Other k8s manifests
│
├── argocd/               # ArgoCD application manifest
├── docker-compose.yaml   # Local development environment
└── Makefile              # Build and deployment automation
```

## Production Deployment

The application is deployed on a k3s cluster using Helm and ArgoCD.

### Build and Push Images

```bash
# Build and push to local k3s registry
make docker-build-push TAG=v1.0.5
```

### Deploy with Helm

```bash
# Create namespace and secret
kubectl create namespace resume
kubectl create secret generic resume-secrets \
  --from-literal=openai-api-key=sk-your-key \
  -n resume

# Install chart
helm install resume ./chart -n resume
```

### Deploy with ArgoCD

```bash
# Apply ArgoCD application (auto-syncs from GitHub)
kubectl apply -f argocd/resume.yaml

# ArgoCD watches the chart/ directory and auto-deploys changes
```

## Configuration

### Environment Variables

**Backend:**
- `OPENAI_API_KEY` - OpenAI API key (required)
- `JWT_SECRET` - Secret for signing JWT tokens (required for production, 32+ bytes)
- `TURNSTILE_SECRET` - Cloudflare Turnstile secret key (optional, enables bot protection)
- `TURNSTILE_SITE_KEY` - Cloudflare Turnstile site key (optional)
- `OPENAI_MODEL` - Model to use (default: gpt-realtime-mini)
- `PORT` - Server port (default: 8080)
- `SYSTEM_PROMPT_PATH` - System prompt file path (default: /app/data/system_prompt.txt)

**Frontend (runtime):**
- `VITE_WS_URL` - WebSocket URL for backend connection
- `VITE_API_URL` - API URL for backend

### Customizing the AI

Edit `chart/values.yaml` → `systemPrompt.content` to customize the AI's behavior and knowledge about Christian Moore.

### Customizing the Resume

Edit `frontend/src/components/Resume.tsx` to update the resume content and styling.

## API Endpoints

### Authentication
- `POST /api/verify-turnstile` - Verify Cloudflare Turnstile token, receive JWT
- `POST /api/token` - Get JWT token (rate-limited, for development)
- `GET /api/turnstile-sitekey` - Get Turnstile site key for frontend

### WebSocket
- `GET /ws/chat` - WebSocket endpoint (requires JWT in Authorization header or Sec-WebSocket-Protocol)

### Health
- `GET /health` - Health check endpoint

## WebSocket Protocol

### Authentication
WebSocket connections require a JWT token passed via:
- `Authorization: Bearer <token>` header, or
- `Sec-WebSocket-Protocol: <token>` header

### Client → Server
```json
{"type": "message", "message": "What's Christian's Kubernetes experience?"}
```

### Server → Client
```json
{"type": "text_delta", "text": "Christian has extensive "}
{"type": "text_done"}
{"type": "audio_delta", "audio": "base64-pcm16-data..."}
{"type": "audio_done"}
{"type": "response_done"}
{"type": "error", "error": "Error message"}
```

## Development Guide

### Code Quality

This project uses [pre-commit](https://pre-commit.com/) hooks for automated code quality checks:

```bash
# Install pre-commit (one time)
pip install pre-commit

# Install git hooks (one time per clone)
pre-commit install

# Run manually on all files
pre-commit run --all-files

# Hooks run automatically on git commit
git commit -m "Your message"  # Hooks run before commit
```

**Included checks**:
- Go: `go fmt`, `go vet`, `go imports`, `go mod tidy`
- Dockerfile: `hadolint` linting
- YAML: `yamllint` validation
- Markdown: `markdownlint` formatting
- Shell scripts: `shellcheck` validation
- Secrets: `detect-secrets` scanning
- General: trailing whitespace, EOF newlines, merge conflicts

**Frontend linting** (run separately):
```bash
cd frontend
npm run lint    # ESLint
npm run format  # Prettier (if configured)
```

For detailed development information, see [CLAUDE.md](CLAUDE.md) which includes:
- Detailed architecture
- Authentication flow
- Code organization
- WebSocket protocol details
- Deployment workflows
- Debugging tips
- Security contexts
- CORS configuration

## Security

- **API Key Protection**: Never commit .env files, use Kubernetes secrets
- **Authentication**: JWT tokens with 30-minute expiration
- **Bot Protection**: Cloudflare Turnstile challenge (optional)
- **Rate Limiting**:
  - Per-connection: 1 message per 5 seconds, burst of 3
  - Per-IP: 10 concurrent connections max
  - Traefik middleware: Backend 2 req/sec, Frontend 20 req/sec
- **Input Validation**: Message length limits (1-4000 chars), control character sanitization
- **CORS**: Configured for specific origins only
- **Non-root Containers**: Backend runs as UID 1000, Frontend as UID 101
- **TLS**: Production uses HTTPS/WSS with Let's Encrypt
- **Security Contexts**: seccompProfile, no privilege escalation, drop all capabilities

## Links

- **Live Demo**: https://christianmoore.me
- **GitHub**: https://github.com/cmoore1776/resume
- **OpenAI Realtime API**: https://platform.openai.com/docs/guides/realtime

## License

MIT License - see LICENSE file for details. Feel free to use this as a template for your own interactive resume!

## Acknowledgments

- OpenAI for the GPT-4 Realtime API
- [go-openai-realtime](https://github.com/WqyJh/go-openai-realtime) for the Go client library
- React and Vite teams for excellent developer tools

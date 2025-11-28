# Interactive AI Resume

An interactive resume website featuring real-time AI chat powered by OpenAI's Realtime API. Users can view Christian Moore's professional resume and engage in voice and text conversations about his experience.

**Live Site**: <https://christianmoore.me>

## Overview

This application combines a traditional resume display with an AI-powered chat interface that can answer questions about Christian Moore's professional background. The AI responds with both text and voice using OpenAI's Realtime API, providing a natural conversational experience.

### Key Features

- **Interactive Resume Display**: Full professional resume with experience, skills, and projects
- **AI-Powered Chat**: Ask questions about experience, skills, or projects
- **Real-time Voice Responses**: AI speaks responses using OpenAI's voice synthesis
- **Text Streaming**: See responses appear in real-time as the AI generates them
- **WebSocket Communication**: Low-latency bidirectional communication
- **Production Deployment**: Helm chart with ArgoCD GitOps on k3s

## Tech Stack

- **Backend**: Go, Gin, Gorilla WebSocket, OpenAI Realtime API
- **Frontend**: React, TypeScript, Vite, Web Audio API
- **Infrastructure**: Docker, Kubernetes (k3s), Helm, ArgoCD, Traefik

## Architecture

```text
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

- Go
- Node.js
- Docker
- OpenAI API Key with Realtime API access

### Local Development with Docker Compose

```bash
# Clone the repository
git clone https://github.com/cmoore1776/resume.git
cd resume

# Set your OpenAI API key
export OPENAI_API_KEY=sk-your-api-key-here

# Start both services
docker-compose up --build

# Open http://localhost:3000
```

### Manual Development

**Backend:**

```bash
cd backend
cp .env.example .env  # Edit with your API key
go run main.go
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

## Project Structure

```text
.
├── backend/              # Go backend (Gin + WebSocket)
│   ├── handlers/         # HTTP/WebSocket handlers, auth
│   ├── config/           # Environment configuration
│   └── main.go           # Server entry point
│
├── frontend/             # React frontend (TypeScript + Vite)
│   └── src/components/   # Chat and Resume components
│
├── chart/                # Helm chart for k8s deployment
│   ├── values.yaml       # Configuration (system prompt, etc)
│   └── templates/        # Kubernetes manifests
│
├── argocd/               # ArgoCD application manifest
└── docker-compose.yaml   # Local development environment
```

## Production Deployment

The application is deployed on a k3s cluster using Helm and ArgoCD.

### Build and Push Images

```bash
make docker-build-push TAG=<version>
```

### Deploy with Helm

```bash
kubectl create namespace resume
kubectl create secret generic resume-secrets \
  --from-literal=openai-api-key=sk-your-key \
  --from-literal=jwt-secret=$(openssl rand -base64 32) \
  -n resume

helm install resume ./chart -n resume
```

### Deploy with ArgoCD

```bash
kubectl apply -f argocd/resume.yaml
# ArgoCD watches the chart/ directory and auto-deploys changes
```

## Configuration

### Environment Variables

**Backend:**

- `OPENAI_API_KEY` - OpenAI API key (required)
- `JWT_SECRET` - Secret for signing JWT tokens (required for production)
- `TURNSTILE_SECRET` - Cloudflare Turnstile secret key (optional, enables bot protection)
- `TURNSTILE_SITE_KEY` - Cloudflare Turnstile site key (optional)
- `SYSTEM_PROMPT_PATH` - System prompt file path

**Frontend (runtime):**

- `VITE_WS_URL` - WebSocket URL for backend connection
- `VITE_API_URL` - API URL for backend

### Customizing the AI

Edit `chart/values.yaml` → `systemPrompt.content` to customize the AI's behavior and knowledge.

### Customizing the Resume

Edit `frontend/src/components/Resume.tsx` to update the resume content and styling.

## API Endpoints

**Auth:**

- `POST /api/verify-turnstile` - Verify Cloudflare Turnstile token, receive JWT
- `POST /api/token` - Get JWT token (rate-limited, for development)
- `GET /api/turnstile-sitekey` - Get Turnstile site key for frontend

**WebSocket:**

- `GET /ws/chat` - WebSocket endpoint (requires JWT in Authorization header or Sec-WebSocket-Protocol)

**Health:**

- `GET /health` - Health check endpoint

## WebSocket Protocol

**Token delivery:**

WebSocket connections require a JWT token passed via:

- `Authorization: Bearer <token>` header, or
- `Sec-WebSocket-Protocol: <token>` header

**Client → Server:**

```json
{"type": "message", "message": "What's Christian's Kubernetes experience?"}
```

**Server → Client:**

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
pip install pre-commit
pre-commit install
pre-commit run --all-files
```

For detailed development information, see [CLAUDE.md](CLAUDE.md).

## Security

- **API Key Protection**: Never commit .env files, use Kubernetes secrets
- **Authentication**: JWT tokens with expiration
- **Bot Protection**: Cloudflare Turnstile challenge (optional)
- **Rate Limiting**: Per-connection, per-IP, and Traefik middleware
- **Input Validation**: Message length limits, control character sanitization
- **CORS**: Configured for specific origins only
- **Non-root Containers**: Both backend and frontend run as non-root
- **TLS**: Production uses HTTPS/WSS with Let's Encrypt

## Links

- **Live Demo**: <https://christianmoore.me>
- **GitHub**: <https://github.com/cmoore1776/resume>
- **OpenAI Realtime API**: <https://platform.openai.com/docs/guides/realtime>

## License

MIT License - see LICENSE file for details.

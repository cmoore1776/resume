# WSS and Sealed Secrets Implementation

## Summary of Changes

This document summarizes the changes made to enable WSS (secure WebSocket) and SealedSecret support for production deployment.

## 🔐 Security Improvements

### 1. WSS (Secure WebSocket) Support

**Frontend changes:**
- ✅ Default WebSocket URL changed from `ws://` to `wss://`
- ✅ Runtime environment variable injection via Docker entrypoint
- ✅ Public domain configured: `wss://resume.k3s.christianmoore.me/ws/chat`

**Files modified:**
- `frontend/src/components/Chat.tsx` - Default URL now uses `wss://`
- `frontend/Dockerfile` - Added entrypoint script for env var substitution
- `frontend/docker-entrypoint.sh` - NEW: Runtime env var injection
- `chart/templates/frontend-deployment.yaml` - Injects `VITE_WS_URL` env var
- `chart/values.yaml` - Added `frontend.env.wsUrl` configuration

### 2. SealedSecret Support

**What is it?**
- Encrypted secrets that can be safely committed to Git
- Decrypted automatically by Sealed Secrets Controller in your cluster
- Follows homelab pattern for GitOps

**Files added:**
- `chart/templates/sealedsecret.yaml.example` - Template for creating SealedSecret
- `docs/SEALED_SECRETS.md` - Complete guide for using SealedSecrets

**Files modified:**
- `chart/values.yaml` - Added `secrets.useSealed` option
- `DEPLOYMENT.md` - Added SealedSecret instructions
- `QUICK_START.md` - Added SealedSecret quick reference

## 📝 Configuration Changes

### Frontend Environment Variables

**values.yaml:**
```yaml
frontend:
  env:
    wsUrl: "wss://resume.k3s.christianmoore.me/ws/chat"  # Secure WebSocket
    apiUrl: "https://resume.k3s.christianmoore.me"       # HTTPS API
```

### Secret Management

**values.yaml:**
```yaml
secrets:
  useSealed: false  # Set to true to use SealedSecret template
  existingSecret: resume-secrets
```

## 🚀 How It Works

### Frontend URL Injection Flow

```
Build Time:
  Vite build → JavaScript bundles with __VITE_WS_URL__ placeholders

Runtime (Container Start):
  docker-entrypoint.sh runs →
    VITE_WS_URL env var (from k8s deployment) →
      sed replaces __VITE_WS_URL__ in JS files →
        nginx serves updated files →
          Browser gets: wss://resume.k3s.christianmoore.me/ws/chat
```

### SealedSecret Flow

```
Developer:
  1. Encrypts secret with kubeseal + cluster public key
  2. Commits encrypted SealedSecret to Git

ArgoCD:
  3. Syncs SealedSecret to cluster

Sealed Secrets Controller:
  4. Decrypts SealedSecret
  5. Creates regular Kubernetes Secret

Backend Pod:
  6. Mounts Secret as OPENAI_API_KEY env var
```

## 📋 Pre-Deployment Checklist

### Before building images:

- [ ] Verify `frontend/docker-entrypoint.sh` is executable
- [ ] Test local build with env vars:
  ```bash
  cd frontend
  docker build -t test .
  docker run -e VITE_WS_URL=wss://test.com/ws/chat test
  ```

### For production deployment:

1. **Choose secret method:**
   - [ ] Option A: Manual secret (quick, not GitOps)
   - [ ] Option B: SealedSecret (recommended, GitOps-friendly)

2. **If using SealedSecret:**
   - [ ] Get cluster public cert: `kubeseal --fetch-cert > pub-cert.pem`
   - [ ] Encrypt API key (see docs/SEALED_SECRETS.md)
   - [ ] Create `chart/templates/sealedsecret.yaml` from example
   - [ ] Set `secrets.useSealed: true` in values.yaml
   - [ ] Commit encrypted secret to Git

3. **Update values.yaml:**
   - [ ] Set correct frontend domain in `frontend.env.wsUrl`
   - [ ] Verify `wss://` protocol (not `ws://`)
   - [ ] Set image tags to version (not `latest`)

4. **DNS records:**
   - [ ] `resume.k3s.christianmoore.me` → cluster IP
   - [ ] `backend.resume.k3s.christianmoore.me` → cluster IP (optional)

## 🧪 Testing

### Test WSS connection:

```javascript
// Browser console at https://resume.k3s.christianmoore.me
const ws = new WebSocket('wss://resume.k3s.christianmoore.me/ws/chat');
ws.onopen = () => console.log('Connected!');
ws.onerror = (e) => console.error('Error:', e);
```

### Verify environment variables:

```bash
# Check frontend pod environment
kubectl exec -it deployment/resume-frontend -n resume -- env | grep VITE

# Check backend secret
kubectl get secret resume-secrets -n resume -o jsonpath='{.data.openai-api-key}' | base64 -d
```

### Test rate limiting:

```bash
# Send rapid requests - should get 429 after burst limit
for i in {1..30}; do
  curl -I https://resume.k3s.christianmoore.me/health
done
```

## 🔒 Security Notes

### WSS Benefits:
- ✅ Encrypted WebSocket traffic (TLS)
- ✅ Works with HTTPS sites (no mixed content warnings)
- ✅ Standard HTTPS port (443) - firewall friendly

### SealedSecret Benefits:
- ✅ Safe to commit to public Git repos
- ✅ Cluster-specific encryption
- ✅ Automatic rotation via GitOps
- ✅ Audit trail in Git history

### Important Security Practices:
- 🔐 Never commit unencrypted secrets
- 🔐 Rotate API keys periodically
- 🔐 Backup `sealed-secrets-key` secret
- 🔐 Use strict scope for SealedSecrets
- 🔐 Monitor OpenAI API usage

## 📚 Documentation

- **Full SealedSecret guide**: [docs/SEALED_SECRETS.md](docs/SEALED_SECRETS.md)
- **Deployment guide**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Quick start**: [QUICK_START.md](QUICK_START.md)

## 🆘 Troubleshooting

### WebSocket fails to connect

```bash
# Check browser console for the actual URL being used
# Should be: wss://resume.k3s.christianmoore.me/ws/chat

# Check frontend pod logs
kubectl logs -n resume -l app.kubernetes.io/component=frontend

# Verify env var in pod
kubectl exec -it deployment/resume-frontend -n resume -- env | grep VITE_WS_URL
```

### SealedSecret not decrypting

```bash
# Check controller logs
kubectl logs -n sealed-secrets -l name=sealed-secrets-controller

# Verify SealedSecret exists
kubectl get sealedsecret -n resume

# Check if Secret was created
kubectl get secret resume-secrets -n resume
```

### Mixed content warnings

- Ensure frontend is accessed via HTTPS
- Verify WebSocket URL uses `wss://` (not `ws://`)
- Check certificate is valid: `openssl s_client -connect resume.k3s.christianmoore.me:443`

## 🎯 Next Steps

1. Build and push updated Docker images
2. Create/update secret (manual or sealed)
3. Deploy via ArgoCD
4. Test WSS connection in browser
5. Verify rate limiting works
6. Monitor backend logs for OpenAI connection

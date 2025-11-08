# Final Deployment Checklist

Complete this checklist before deploying to production at `resume.k3s.christianmoore.me`.

## ✅ Pre-Deployment Steps

### 1. DNS Configuration
- [ ] Add A record: `resume.k3s.christianmoore.me` → your cluster ingress IP
- [ ] Add A record: `backend.resume.k3s.christianmoore.me` → your cluster ingress IP
- [ ] Wait for DNS propagation (check with `dig resume.k3s.christianmoore.me`)

### 2. Build Docker Images

```bash
# Using Makefile (recommended)
make docker-build-push TAG=v1.0.0

# Or manually:
# Backend
docker build -t registry.k3s.local.christianmoore.me/resume/backend:v1.0.0 backend/
docker push registry.k3s.local.christianmoore.me/resume/backend:v1.0.0

# Frontend (with WSS support)
docker build -t registry.k3s.local.christianmoore.me/resume/frontend:v1.0.0 frontend/
docker push registry.k3s.local.christianmoore.me/resume/frontend:v1.0.0
```

- [ ] Backend image built and pushed
- [ ] Frontend image built and pushed
- [ ] Verify images exist in registry

### 3. Update Chart Configuration

Edit `chart/values.yaml`:

```yaml
backend:
  image:
    tag: "v1.0.0"  # Change from "latest"

frontend:
  image:
    tag: "v1.0.0"  # Change from "latest"
  env:
    wsUrl: "wss://resume.k3s.christianmoore.me/ws/chat"  # Verify WSS
    apiUrl: "https://resume.k3s.christianmoore.me"       # Verify HTTPS
```

- [ ] Image tags updated to v1.0.0
- [ ] Frontend WSS URL verified
- [ ] Frontend API URL verified

### 4. Create Secret

**Option A - Manual Secret (Quick):**
```bash
kubectl create namespace resume
kubectl create secret generic resume-secrets \
  --from-literal=openai-api-key=YOUR-ACTUAL-KEY \
  -n resume
```

**Option B - SealedSecret (Recommended):**
```bash
# Get cluster public cert
kubeseal --fetch-cert --controller-namespace=sealed-secrets > pub-cert.pem

# Encrypt your key
echo -n 'YOUR-ACTUAL-KEY' | kubeseal --raw \
  --from-file=/dev/stdin \
  --namespace=resume \
  --name=resume-secrets \
  --scope=strict \
  --cert=pub-cert.pem

# Copy output to chart/templates/sealedsecret.yaml
# Set secrets.useSealed: true in values.yaml
```

- [ ] Secret created (manual or sealed)
- [ ] If using SealedSecret: encrypted data added to chart
- [ ] If using SealedSecret: `secrets.useSealed: true` set

### 5. Commit and Push

```bash
git add .
git commit -m "Configure for production deployment"
git push origin main
```

- [ ] All changes committed
- [ ] Pushed to remote repository

## 🚀 Deployment

### 6. Deploy via ArgoCD

```bash
# Apply ArgoCD application
kubectl apply -f argocd/resume.yaml

# Watch the sync
argocd app sync resume
argocd app get resume
```

- [ ] ArgoCD application created
- [ ] Application synced successfully
- [ ] All resources healthy

### 7. Verify Deployment

```bash
# Check pods
kubectl get pods -n resume

# Check services
kubectl get svc -n resume

# Check ingress routes
kubectl get ingressroute -n resume

# Check certificates
kubectl get certificate -n resume
```

Expected output:
```
NAME                              READY   STATUS    RESTARTS   AGE
resume-backend-xxxxxxxxxx-xxxxx   1/1     Running   0          2m
resume-frontend-xxxxxxxxxx-xxxxx  1/1     Running   0          2m
```

- [ ] Backend pod running
- [ ] Frontend pod running
- [ ] All certificates ready
- [ ] IngressRoutes created

## 🧪 Testing

### 8. Test Frontend

```bash
# Open in browser
open https://resume.k3s.christianmoore.me
```

- [ ] HTTPS loads without certificate warnings
- [ ] Resume content displays
- [ ] Chat interface visible
- [ ] No JavaScript errors in console

### 9. Test WebSocket Connection

Open browser console at `https://resume.k3s.christianmoore.me` and check:

- [ ] WebSocket connects successfully
- [ ] Console shows: `WebSocket connected - ready state: 1`
- [ ] No WebSocket errors
- [ ] URL is `wss://` (not `ws://`)

### 10. Test Chat Functionality

- [ ] Send a test message
- [ ] Receive streaming text response
- [ ] Receive audio playback
- [ ] No rate limit errors (first few messages)

### 11. Test Rate Limiting

```bash
# Send 30+ rapid requests
for i in {1..30}; do
  curl -w "%{http_code}\n" https://resume.k3s.christianmoore.me/health
done
```

- [ ] First ~20 requests return 200
- [ ] Subsequent requests return 429 (rate limited)
- [ ] Rate limit resets after 1 minute

### 12. Test Backend API

```bash
# Health check
curl https://resume.k3s.christianmoore.me/health

# Should return: {"status":"healthy"}
```

- [ ] Health endpoint returns 200
- [ ] Returns valid JSON
- [ ] No errors in response

### 13. Test Backend Domain (Optional)

```bash
curl https://backend.resume.k3s.christianmoore.me/health
```

- [ ] Backend domain accessible (if enabled)
- [ ] Returns same health check response
- [ ] Certificate valid

## 📊 Monitoring

### 14. Check Logs

```bash
# Backend logs
kubectl logs -n resume -l app.kubernetes.io/component=backend --tail=50

# Frontend logs
kubectl logs -n resume -l app.kubernetes.io/component=frontend --tail=50
```

- [ ] No error messages in backend logs
- [ ] OpenAI connection successful
- [ ] No crashes or restarts
- [ ] Frontend serving requests

### 15. Monitor Resources

```bash
# Check resource usage
kubectl top pods -n resume
```

- [ ] Memory usage within limits
- [ ] CPU usage reasonable
- [ ] No OOMKilled pods

## 🔒 Security Verification

### 16. Security Checks

- [ ] All traffic uses HTTPS/WSS (no HTTP/WS)
- [ ] TLS certificates valid and not expired
- [ ] Rate limiting active and working
- [ ] Secrets not visible in Git history
- [ ] Backend API key working correctly
- [ ] No sensitive data in logs
- [ ] Security contexts applied (non-root user)

### 17. External Access Test

From a different network (mobile, VPN, etc.):

- [ ] Site accessible externally
- [ ] HTTPS certificate trusted
- [ ] WebSocket connects successfully
- [ ] Chat works end-to-end

## 📈 Post-Deployment

### 18. Monitor OpenAI Usage

```bash
# Check OpenAI dashboard
open https://platform.openai.com/usage
```

- [ ] API calls showing up
- [ ] Costs reasonable
- [ ] No unusual spikes
- [ ] Set up billing alerts

### 19. Set Up Monitoring (Optional)

If you have Prometheus/Grafana:

- [ ] Add ServiceMonitor for metrics
- [ ] Create dashboard for monitoring
- [ ] Set up alerts for errors/high latency
- [ ] Monitor WebSocket connection count

### 20. Documentation

- [ ] Update README with production URL
- [ ] Document any deployment issues encountered
- [ ] Share deployment notes with team (if applicable)
- [ ] Archive deployment logs

## 🎉 Launch Checklist

Everything working? Time to share!

- [ ] Test from multiple devices/browsers
- [ ] Verify mobile responsiveness
- [ ] Share link with test users
- [ ] Monitor for first 24 hours
- [ ] Celebrate! 🎊

## 🆘 Rollback Plan

If something goes wrong:

```bash
# Rollback via ArgoCD
argocd app rollback resume

# Or manually scale down
kubectl scale deployment resume-backend --replicas=0 -n resume
kubectl scale deployment resume-frontend --replicas=0 -n resume

# Check what changed
argocd app diff resume
```

## 📞 Support Resources

- **OpenAI Status**: https://status.openai.com
- **ArgoCD UI**: https://argocd.k3s.christianmoore.me (your URL)
- **Traefik Dashboard**: Check your homelab dashboard
- **Logs**: `kubectl logs -n resume -l app.kubernetes.io/name=resume -f`

---

## Summary

Once all items are checked:
- ✅ Production deployment complete
- ✅ WSS secure WebSocket working
- ✅ Rate limiting protecting API
- ✅ Secrets properly managed
- ✅ Monitoring in place

**Public URL**: https://resume.k3s.christianmoore.me
**Backend API**: https://backend.resume.k3s.christianmoore.me (optional)

🚀 **Your AI-powered resume is now live!**

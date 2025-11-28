# Frontend Distribution

This branch contains the built frontend assets.
Auto-generated - do not edit directly.

Source: main branch `frontend/` directory

## How it works
1. Frontend is built with placeholder env vars (`__VITE_WS_URL__`, etc.)
2. This branch is synced to the cluster via git-sync sidecar
3. Init container applies env substitution from Helm values
4. Nginx serves the processed files

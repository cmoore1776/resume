#!/bin/bash
# Deploy frontend to dist branch
# This script builds the frontend with placeholder env vars and pushes to the dist branch
# The cluster uses git-sync to pull from dist and applies env substitution at runtime

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "=== Deploying frontend to dist branch ==="

# Ensure we're in the repo root
cd "$ROOT_DIR"

# Check if dist directory exists
if [ ! -d "$FRONTEND_DIR/dist" ]; then
    echo "Error: frontend/dist directory not found. Run 'npm run build:deploy' first."
    exit 1
fi

# Create a temp directory for the dist branch
DIST_DIR=$(mktemp -d)
trap "rm -rf $DIST_DIR" EXIT

echo "Copying built files..."
cp -r "$FRONTEND_DIR/dist"/* "$DIST_DIR/"

# Copy nginx config for reference
cp "$FRONTEND_DIR/nginx.conf" "$DIST_DIR/"

# Add .nojekyll for GitHub Pages compatibility
touch "$DIST_DIR/.nojekyll"

# Create a simple README
cat > "$DIST_DIR/README.md" << 'EOF'
# Frontend Distribution

This branch contains the built frontend assets.
Auto-generated - do not edit directly.

Source: main branch `frontend/` directory

## How it works
1. Frontend is built with placeholder env vars (`__VITE_WS_URL__`, etc.)
2. This branch is synced to the cluster via git-sync sidecar
3. Init container applies env substitution from Helm values
4. Nginx serves the processed files
EOF

# Fetch dist branch or create orphan
echo "Switching to dist branch..."
git fetch origin dist:dist 2>/dev/null || true

# Save current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Create a new worktree for dist branch
WORKTREE_DIR=$(mktemp -d)
trap "rm -rf $DIST_DIR $WORKTREE_DIR; git worktree remove $WORKTREE_DIR 2>/dev/null || true" EXIT

if git show-ref --verify --quiet refs/heads/dist; then
    git worktree add "$WORKTREE_DIR" dist
else
    # Create orphan branch
    git worktree add --detach "$WORKTREE_DIR"
    cd "$WORKTREE_DIR"
    git checkout --orphan dist
    git rm -rf . 2>/dev/null || true
fi

cd "$WORKTREE_DIR"

# Clear existing files
rm -rf ./* 2>/dev/null || true

# Copy new dist files
cp -r "$DIST_DIR"/* .

# Commit and push
git add -A
if git diff --cached --quiet; then
    echo "No changes to deploy"
else
    git commit -m "Deploy frontend $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    git push origin dist --force
    echo "=== Frontend deployed successfully ==="
fi

# Return to original directory
cd "$ROOT_DIR"

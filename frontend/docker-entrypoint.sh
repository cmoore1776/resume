#!/bin/sh
set -e

# Default values if not provided
VITE_WS_URL=${VITE_WS_URL:-wss://resume.k3s.christianmoore.me/ws/chat}
VITE_API_URL=${VITE_API_URL:-https://resume.k3s.christianmoore.me}

echo "Configuring frontend with:"
echo "  VITE_WS_URL: $VITE_WS_URL"
echo "  VITE_API_URL: $VITE_API_URL"

# Find all JavaScript files in the nginx html directory and replace placeholders
find /usr/share/nginx/html -type f -name '*.js' -exec sed -i \
  -e "s|__VITE_WS_URL__|$VITE_WS_URL|g" \
  -e "s|__VITE_API_URL__|$VITE_API_URL|g" \
  {} +

# Also check index.html for any embedded scripts
find /usr/share/nginx/html -type f -name 'index.html' -exec sed -i \
  -e "s|__VITE_WS_URL__|$VITE_WS_URL|g" \
  -e "s|__VITE_API_URL__|$VITE_API_URL|g" \
  {} +

echo "Environment configuration complete"

# Execute the CMD (nginx)
exec "$@"

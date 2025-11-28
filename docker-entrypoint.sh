#!/bin/sh
set -e

# Default values if not provided
VITE_WS_URL=${VITE_WS_URL:-wss://christianmoore.me/ws/chat}
VITE_API_URL=${VITE_API_URL:-https://christianmoore.me}
VITE_PUBLIC_POSTHOG_KEY=${VITE_PUBLIC_POSTHOG_KEY:-}
VITE_PUBLIC_POSTHOG_HOST=${VITE_PUBLIC_POSTHOG_HOST:-https://us.i.posthog.com}

echo "Configuring frontend with:"
echo "  VITE_WS_URL: $VITE_WS_URL"
echo "  VITE_API_URL: $VITE_API_URL"
echo "  VITE_PUBLIC_POSTHOG_KEY: ${VITE_PUBLIC_POSTHOG_KEY:+[set]}"
echo "  VITE_PUBLIC_POSTHOG_HOST: $VITE_PUBLIC_POSTHOG_HOST"

# Find all JavaScript files in the nginx html directory and replace placeholders
find /etc/nginx/html -type f -name '*.js' -exec sed -i \
  -e "s|__VITE_WS_URL__|$VITE_WS_URL|g" \
  -e "s|__VITE_API_URL__|$VITE_API_URL|g" \
  -e "s|__VITE_PUBLIC_POSTHOG_KEY__|$VITE_PUBLIC_POSTHOG_KEY|g" \
  -e "s|__VITE_PUBLIC_POSTHOG_HOST__|$VITE_PUBLIC_POSTHOG_HOST|g" \
  {} +

# Also check index.html for any embedded scripts
find /etc/nginx/html -type f -name 'index.html' -exec sed -i \
  -e "s|__VITE_WS_URL__|$VITE_WS_URL|g" \
  -e "s|__VITE_API_URL__|$VITE_API_URL|g" \
  -e "s|__VITE_PUBLIC_POSTHOG_KEY__|$VITE_PUBLIC_POSTHOG_KEY|g" \
  -e "s|__VITE_PUBLIC_POSTHOG_HOST__|$VITE_PUBLIC_POSTHOG_HOST|g" \
  {} +

echo "Environment configuration complete"

# Execute the CMD (nginx)
exec "$@"

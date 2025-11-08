# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application with placeholder env vars
# These will be replaced at runtime
ARG VITE_WS_URL=__VITE_WS_URL__
ARG VITE_API_URL=__VITE_API_URL__
RUN npm run build

# Runtime stage - serve with nginx
FROM cmooreio/nginx:latest

# Temporarily switch to root to install packages and set permissions
USER root
RUN apk add --no-cache gettext

# Copy built assets from builder
COPY --from=builder /app/dist /etc/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy env substitution script and make executable
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Switch back to nginx user
USER 101

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

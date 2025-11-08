# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

# Create non-root user and group
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser

# Use non-root user's home directory
WORKDIR /home/appuser

# Copy the binary from builder
COPY --from=builder /app/main .
RUN chmod +x ./main

# Copy system prompt (can be overridden by volume mount)
COPY system_prompt.txt .

# Create directory for audio cache with proper permissions
RUN mkdir -p audio_cache && chmod -R 755 audio_cache

# Change ownership to non-root user
RUN chown -R appuser:appuser /home/appuser

# Switch to non-root user
USER appuser

EXPOSE 8080

CMD ["./main"]

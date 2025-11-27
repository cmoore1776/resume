package handlers

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	openairt "github.com/WqyJh/go-openai-realtime/v2"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"
)

// Security and validation constants
const (
	// Message validation
	MaxMessageLength = 4000 // Maximum characters per message (reasonable for GPT-4)
	MinMessageLength = 1    // Minimum characters per message

	// Rate limiting
	MessageRateLimit = time.Second * 5 // 1 message per 5 seconds
	MessageBurst     = 3               // Allow burst of 3 messages

	// Connection limits
	MaxConnectionsPerIP = 10               // Maximum concurrent connections per IP address (shared by Traefik proxy)
	ConnectionTimeout   = 10 * time.Minute // WebSocket connection timeout
	PingInterval        = 1 * time.Minute  // Ping interval for keepalive
)

// Connection tracking for per-IP limits
var (
	connectionsMutex sync.Mutex
	connectionsPerIP = make(map[string]int)
)

var upgrader = websocket.Upgrader{
	// Buffer sizes optimized for real-time audio streaming
	ReadBufferSize:  8192, // 8KB for incoming audio chunks
	WriteBufferSize: 8192, // 8KB for outgoing audio chunks

	// Disable compression for real-time audio (compression adds latency)
	EnableCompression: false,

	// Handshake timeout
	HandshakeTimeout: 10 * time.Second,

	CheckOrigin: func(r *http.Request) bool {
		// Allow connections from localhost and christianmoore.me
		origin := r.Header.Get("Origin")
		return origin == "http://localhost:5173" ||
			origin == "http://localhost:3000" ||
			origin == "https://christianmoore.me"
	},
}

type ChatHandler struct {
	apiKey              string
	model               string
	systemPrompt        string
	authHandler         *AuthHandler
	useLocalPipeline    bool
	localPipelineHandler *LocalPipelineHandler
}

func NewChatHandler(apiKey, model, systemPrompt string, authHandler *AuthHandler, useLocalPipeline bool, localLLMURL string, ttsURL string, ttsVoice string, ttsSpeed string) (*ChatHandler, error) {
	handler := &ChatHandler{
		apiKey:           apiKey,
		model:            model,
		systemPrompt:     systemPrompt,
		authHandler:      authHandler,
		useLocalPipeline: useLocalPipeline,
	}

	// Initialize local pipeline if enabled
	if useLocalPipeline {
		log.Printf("Initializing local pipeline (LLM + TTS) mode")
		localHandler, err := NewLocalPipelineHandler(localLLMURL, systemPrompt, ttsURL, ttsVoice, ttsSpeed)
		if err != nil {
			return nil, fmt.Errorf("failed to initialize local pipeline: %w", err)
		}
		handler.localPipelineHandler = localHandler
		log.Printf("Local pipeline initialized successfully")
	} else {
		log.Printf("Using OpenAI Realtime API mode")
	}

	return handler, nil
}

// ClientMessage represents messages from the frontend
type ClientMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// ServerMessage represents messages to the frontend
type ServerMessage struct {
	Type  string `json:"type"`
	Text  string `json:"text,omitempty"`
	Audio string `json:"audio,omitempty"` // base64 encoded audio
	Error string `json:"error,omitempty"`
}

func (h *ChatHandler) HandleWebSocket(c *gin.Context) {
	// Verify JWT token from Authorization header or Sec-WebSocket-Protocol
	var tokenString string

	// Try Authorization header first
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" && len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		tokenString = authHeader[7:]
	} else {
		// Fall back to Sec-WebSocket-Protocol for WebSocket auth
		tokenString = c.GetHeader("Sec-WebSocket-Protocol")
	}

	// Verify JWT token
	if h.authHandler != nil {
		_, err := h.authHandler.VerifyJWT(tokenString)
		if err != nil {
			log.Printf("JWT verification failed for IP %s: %v", c.ClientIP(), err)
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
			})
			return
		}
		log.Printf("JWT verified for IP %s", c.ClientIP())
	}

	// Get client IP (respects X-Forwarded-For from trusted proxies)
	clientIP := c.ClientIP()

	// Check concurrent connection limit per IP
	connectionsMutex.Lock()
	currentConnections := connectionsPerIP[clientIP]
	if currentConnections >= MaxConnectionsPerIP {
		connectionsMutex.Unlock()
		log.Printf("Connection limit exceeded for IP %s (%d/%d)", clientIP, currentConnections, MaxConnectionsPerIP)
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": "Too many concurrent connections from your IP address",
		})
		return
	}
	connectionsPerIP[clientIP]++
	connectionsMutex.Unlock()

	// Ensure connection count is decremented on exit
	defer func() {
		connectionsMutex.Lock()
		connectionsPerIP[clientIP]--
		if connectionsPerIP[clientIP] <= 0 {
			delete(connectionsPerIP, clientIP) // Clean up map entry
		}
		connectionsMutex.Unlock()
		log.Printf("Connection closed for IP %s (remaining: %d)", clientIP, connectionsPerIP[clientIP])
	}()

	log.Printf("New WebSocket connection from IP %s (%d/%d concurrent)", clientIP, currentConnections+1, MaxConnectionsPerIP)

	// Upgrade connection to WebSocket
	clientWS, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}
	defer clientWS.Close()

	// Enable TCP_NODELAY for low-latency real-time audio streaming
	// Disables Nagle's algorithm to send packets immediately without buffering
	if conn := clientWS.UnderlyingConn(); conn != nil {
		if tcpConn, ok := conn.(*net.TCPConn); ok {
			if err := tcpConn.SetNoDelay(true); err != nil {
				log.Printf("Warning: Failed to set TCP_NODELAY: %v", err)
			} else {
				log.Printf("TCP_NODELAY enabled for real-time audio streaming")
			}
		}
	}

	// Create per-connection rate limiter (1 message per 5 seconds, burst of 3)
	rateLimiter := rate.NewLimiter(rate.Every(MessageRateLimit), MessageBurst)
	log.Printf("Rate limiter initialized: 1 message per %v, burst %d", MessageRateLimit, MessageBurst)

	// Set connection timeout and deadlines
	clientWS.SetReadDeadline(time.Now().Add(ConnectionTimeout))
	clientWS.SetWriteDeadline(time.Now().Add(ConnectionTimeout))
	log.Printf("Connection timeout set to %v", ConnectionTimeout)

	// Configure ping/pong for keepalive and detecting dead connections
	clientWS.SetPingHandler(func(appData string) error {
		// Reset read deadline on ping
		clientWS.SetReadDeadline(time.Now().Add(ConnectionTimeout))
		return clientWS.WriteControl(websocket.PongMessage, []byte{}, time.Now().Add(10*time.Second))
	})

	clientWS.SetPongHandler(func(appData string) error {
		// Reset read deadline on pong
		clientWS.SetReadDeadline(time.Now().Add(ConnectionTimeout))
		return nil
	})

	ctx := context.Background()

	// OpenAI Realtime connection - lazy initialized on first message
	var realtimeConn *openairt.Conn
	var realtimeConnMutex sync.Mutex
	var openaiReaderRunning bool

	// Helper function to connect/reconnect to OpenAI Realtime API
	connectToOpenAI := func() error {
		realtimeConnMutex.Lock()
		defer realtimeConnMutex.Unlock()

		// Close existing connection if any
		if realtimeConn != nil {
			realtimeConn.Close()
			realtimeConn = nil
		}

		// Create OpenAI Realtime client
		client := openairt.NewClient(h.apiKey)

		// Connect to OpenAI Realtime API
		log.Printf("Connecting to OpenAI Realtime API with model: %s", h.model)
		conn, err := client.Connect(ctx, openairt.WithModel(h.model))
		if err != nil {
			log.Printf("Failed to connect to OpenAI Realtime API: %v", err)
			return err
		}
		realtimeConn = conn
		log.Printf("Successfully connected to OpenAI Realtime API")

		// Configure session with audio modality (includes text transcript automatically)
		sessionUpdate := openairt.SessionUpdateEvent{
			Session: openairt.SessionUnion{
				Realtime: &openairt.RealtimeSession{
					Instructions: h.systemPrompt,
					Audio: &openairt.RealtimeSessionAudio{
						Output: &openairt.SessionAudioOutput{
							Voice: openairt.VoiceCedar, // Masculine voice
						},
					},
					OutputModalities: []openairt.Modality{
						openairt.ModalityAudio, // This includes both audio and text transcript
					},
				},
			},
		}

		log.Printf("Configuring session with system prompt and modalities...")
		if err := realtimeConn.SendMessage(ctx, sessionUpdate); err != nil {
			log.Printf("Failed to configure session: %v", err)
			realtimeConn.Close()
			realtimeConn = nil
			return err
		}
		log.Printf("Session configured successfully")
		return nil
	}

	// Cleanup OpenAI connection on exit
	defer func() {
		realtimeConnMutex.Lock()
		if realtimeConn != nil {
			realtimeConn.Close()
		}
		realtimeConnMutex.Unlock()
	}()

	// Channel for handling errors and cleanup
	done := make(chan struct{})
	var doneOnce sync.Once
	var wsMutex sync.Mutex // Protect WebSocket writes

	// Periodic ping to keep connection alive and detect dead connections
	go func() {
		ticker := time.NewTicker(PingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				wsMutex.Lock()
				err := clientWS.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(10*time.Second))
				wsMutex.Unlock()
				if err != nil {
					log.Printf("Failed to send ping: %v", err)
					doneOnce.Do(func() { close(done) })
					return
				}
				log.Printf("Ping sent to keep connection alive")
			case <-done:
				return
			}
		}
	}()

	// Helper function to send JSON with mutex and error logging
	sendJSON := func(msg ServerMessage) error {
		wsMutex.Lock()
		err := clientWS.WriteJSON(msg)
		wsMutex.Unlock()
		if err != nil {
			log.Printf("Error sending %s to client: %v", msg.Type, err)
		}
		return err
	}

	// Function to start OpenAI reader goroutine
	startOpenAIReader := func() {
		if openaiReaderRunning {
			return
		}
		openaiReaderRunning = true

		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Recovered from panic in OpenAI handler: %v", r)
				}
				openaiReaderRunning = false
			}()

			for {
				select {
				case <-done:
					return
				default:
					realtimeConnMutex.Lock()
					conn := realtimeConn
					realtimeConnMutex.Unlock()

					if conn == nil {
						log.Printf("OpenAI connection is nil, reader exiting")
						return
					}

					event, err := conn.ReadMessage(ctx)
					if err != nil {
						log.Printf("Error receiving from OpenAI: %v", err)
						// Mark connection as closed so next message will reconnect
						realtimeConnMutex.Lock()
						if realtimeConn != nil {
							realtimeConn.Close()
							realtimeConn = nil
						}
						realtimeConnMutex.Unlock()
						// Don't send error to client - they'll reconnect on next message
						return
					}

					// Handle different event types
					switch e := event.(type) {
					case openairt.ResponseOutputAudioTranscriptDeltaEvent:
						// Send text delta to client (from audio transcript)
						log.Printf("Assistant response delta: %s", e.Delta)
						if err := sendJSON(ServerMessage{
							Type: "text_delta",
							Text: e.Delta,
						}); err != nil {
							return
						}

					case openairt.ResponseOutputAudioTranscriptDoneEvent:
						// Text is complete
						log.Printf("Assistant response completed")
						if err := sendJSON(ServerMessage{
							Type: "text_done",
						}); err != nil {
							return
						}
						// Also send response_done immediately after text_done
						// This ensures frontend exits loading state even if OpenAI closes before ResponseDoneEvent
						if err := sendJSON(ServerMessage{
							Type: "response_done",
						}); err != nil {
							return
						}
						log.Printf("Response done sent to client")

					case openairt.ResponseOutputAudioDeltaEvent:
						// Send audio delta to client (base64 encoded)
						if err := sendJSON(ServerMessage{
							Type:  "audio_delta",
							Audio: e.Delta,
						}); err != nil {
							return
						}

					case openairt.ResponseOutputAudioDoneEvent:
						// Notify client that audio is complete
						if err := sendJSON(ServerMessage{
							Type: "audio_done",
						}); err != nil {
							return
						}

					case openairt.ResponseDoneEvent:
						// Response complete
						if err := sendJSON(ServerMessage{
							Type: "response_done",
						}); err != nil {
							return
						}

					case openairt.ErrorEvent:
						// Log errors but don't send to client - responses still work despite errors
						log.Printf("OpenAI ErrorEvent received (ignoring): %+v", e)

					default:
						// Log unhandled event types
						log.Printf("Unhandled event type: %T", event)
					}
				}
			}
		}()
	}

	// Handle messages from client
	for {
		var msg ClientMessage
		err := clientWS.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		log.Printf("Received message from client: type=%s", msg.Type)

		// Validate message type
		switch msg.Type {
		case "message":
			// Check rate limit BEFORE processing
			if !rateLimiter.Allow() {
				log.Printf("Rate limit exceeded for client")
				sendJSON(ServerMessage{
					Type:  "error",
					Error: "Rate limit exceeded. Please wait before sending another message.",
				})
				continue
			}

			// Validate message length
			messageLen := len(msg.Message)
			if messageLen < MinMessageLength || messageLen > MaxMessageLength {
				log.Printf("Invalid message length: %d (min: %d, max: %d)", messageLen, MinMessageLength, MaxMessageLength)
				sendJSON(ServerMessage{
					Type:  "error",
					Error: fmt.Sprintf("Message must be between %d and %d characters", MinMessageLength, MaxMessageLength),
				})
				continue
			}

			// Sanitize input - trim whitespace and remove control characters
			sanitized := strings.TrimSpace(msg.Message)
			sanitized = strings.Map(func(r rune) rune {
				if r < 32 && r != '\n' && r != '\t' {
					return -1 // Remove control characters
				}
				return r
			}, sanitized)

			// Validate sanitized message is not empty
			if len(sanitized) < MinMessageLength {
				log.Printf("Message is empty after sanitization")
				sendJSON(ServerMessage{
					Type:  "error",
					Error: "Message cannot be empty",
				})
				continue
			}

			log.Printf("Message validated: length=%d, rate_limit_ok=true", len(sanitized))
			log.Printf("User message: %s", sanitized)

			// Route to local pipeline or OpenAI based on config
			if h.useLocalPipeline {
				// Use local LLM + TTS pipeline
				log.Printf("Routing to local pipeline")
				if err := h.localPipelineHandler.HandleLocalPipeline(ctx, sanitized, clientWS, nil, sendJSON); err != nil {
					log.Printf("Local pipeline error: %v", err)
					sendJSON(ServerMessage{
						Type:  "error",
						Error: "Failed to process message",
					})
				}
			} else {
				// Use OpenAI Realtime API
				// Lazy connect: establish connection on first message or reconnect if lost
				realtimeConnMutex.Lock()
				needsConnect := realtimeConn == nil
				realtimeConnMutex.Unlock()

				if needsConnect {
					log.Printf("Establishing OpenAI connection for message...")
					if err := connectToOpenAI(); err != nil {
						sendJSON(ServerMessage{
							Type:  "error",
							Error: "Failed to connect to AI service",
						})
						continue
					}
					// Start the reader goroutine for this new connection
					startOpenAIReader()
				}

				// Create conversation item with user message (use sanitized input)
				item := openairt.ConversationItemCreateEvent{
					Item: openairt.MessageItemUnion{
						User: &openairt.MessageItemUser{
							Content: []openairt.MessageContentInput{
								{
									Type: openairt.MessageContentTypeInputText,
									Text: sanitized,
								},
							},
						},
					},
				}

				realtimeConnMutex.Lock()
				conn := realtimeConn
				realtimeConnMutex.Unlock()

				if conn == nil {
					sendJSON(ServerMessage{
						Type:  "error",
						Error: "AI service connection lost, please try again",
					})
					continue
				}

				if err := conn.SendMessage(ctx, item); err != nil {
					log.Printf("Failed to send message: %v", err)
					// Connection might be dead, clear it so next message reconnects
					realtimeConnMutex.Lock()
					if realtimeConn != nil {
						realtimeConn.Close()
						realtimeConn = nil
					}
					realtimeConnMutex.Unlock()
					sendJSON(ServerMessage{
						Type:  "error",
						Error: "Failed to send message, please try again",
					})
					continue
				}

				// Request response
				responseCreate := openairt.ResponseCreateEvent{}

				if err := conn.SendMessage(ctx, responseCreate); err != nil {
					log.Printf("Failed to request response: %v", err)
					// Connection might be dead, clear it so next message reconnects
					realtimeConnMutex.Lock()
					if realtimeConn != nil {
						realtimeConn.Close()
						realtimeConn = nil
					}
					realtimeConnMutex.Unlock()
					sendJSON(ServerMessage{
						Type:  "error",
						Error: "Failed to request response, please try again",
					})
					continue
				}
			}

		default:
			// Reject unknown message types
			log.Printf("Invalid message type received: %s", msg.Type)
			sendJSON(ServerMessage{
				Type:  "error",
				Error: "Invalid message type",
			})
			continue
		}
	}

	doneOnce.Do(func() { close(done) })
}

func (h *ChatHandler) HandleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

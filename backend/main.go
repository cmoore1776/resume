package main

import (
	"log"

	"christianmoore.me/avatar-backend/config"
	"christianmoore.me/avatar-backend/handlers"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Validate required configuration
	if cfg.OpenAIAPIKey == "" {
		log.Fatal("OPENAI_API_KEY is required")
	}

	// Initialize auth handler
	authHandler := handlers.NewAuthHandler(cfg.JWTSecret, cfg.TurnstileSecret, cfg.TurnstileSiteKey)

	// Initialize chat handler
	chatHandler := handlers.NewChatHandler(cfg.OpenAIAPIKey, cfg.OpenAIModel, cfg.SystemPrompt, authHandler)

	// Setup Gin router
	router := gin.Default()

	// Configure trusted proxies (Kubernetes service mesh)
	// Trust k3s default pod (10.42.0.0/16) and service (10.43.0.0/16) CIDRs
	router.SetTrustedProxies([]string{"10.42.0.0/16", "10.43.0.0/16"})

	// Configure CORS
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:3000", "https://christianmoore.me", "https://resume.k3s.christianmoore.me"},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "Upgrade", "Connection", "Sec-WebSocket-Protocol"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// API Routes
	api := router.Group("/api")
	{
		api.POST("/verify-turnstile", authHandler.HandleVerifyTurnstile)
		api.GET("/turnstile-sitekey", authHandler.HandleGetSiteKey)
	}

	// Routes
	router.GET("/health", chatHandler.HandleHealth)
	router.GET("/ws/chat", chatHandler.HandleWebSocket) // WebSocket endpoint (requires JWT)

	// Start server
	log.Printf("Server starting on port %s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}

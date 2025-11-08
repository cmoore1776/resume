package handlers

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	JWTExpirationTime = 30 * time.Minute // JWT tokens valid for 30 minutes
)

type AuthHandler struct {
	jwtSecret        []byte
	turnstileSecret  string
	turnstileSiteKey string
}

func NewAuthHandler(jwtSecret, turnstileSecret, turnstileSiteKey string) *AuthHandler {
	return &AuthHandler{
		jwtSecret:        []byte(jwtSecret),
		turnstileSecret:  turnstileSecret,
		turnstileSiteKey: turnstileSiteKey,
	}
}

// TurnstileVerifyRequest from frontend
type TurnstileVerifyRequest struct {
	Token string `json:"token" binding:"required"`
}

// TurnstileVerifyResponse to frontend
type TurnstileVerifyResponse struct {
	Success bool   `json:"success"`
	JWT     string `json:"jwt,omitempty"`
	Error   string `json:"error,omitempty"`
}

// CloudflareTurnstileResponse from Cloudflare API
type CloudflareTurnstileResponse struct {
	Success     bool     `json:"success"`
	ChallengeTS string   `json:"challenge_ts"`
	Hostname    string   `json:"hostname"`
	ErrorCodes  []string `json:"error-codes"`
}

// JWTClaims for our session tokens
type JWTClaims struct {
	jwt.RegisteredClaims
}

// HandleVerifyTurnstile verifies Cloudflare Turnstile token and issues JWT
func (h *AuthHandler) HandleVerifyTurnstile(c *gin.Context) {
	var req TurnstileVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, TurnstileVerifyResponse{
			Success: false,
			Error:   "Invalid request",
		})
		return
	}

	// Verify Turnstile token with Cloudflare API
	verified, err := h.verifyTurnstileToken(req.Token, c.ClientIP())
	if err != nil {
		log.Printf("Turnstile verification error: %v", err)
		c.JSON(http.StatusInternalServerError, TurnstileVerifyResponse{
			Success: false,
			Error:   "Verification failed",
		})
		return
	}

	if !verified {
		log.Printf("Turnstile verification failed for IP %s", c.ClientIP())
		c.JSON(http.StatusUnauthorized, TurnstileVerifyResponse{
			Success: false,
			Error:   "Verification failed",
		})
		return
	}

	// Generate JWT token
	token, err := h.generateJWT()
	if err != nil {
		log.Printf("JWT generation error: %v", err)
		c.JSON(http.StatusInternalServerError, TurnstileVerifyResponse{
			Success: false,
			Error:   "Token generation failed",
		})
		return
	}

	log.Printf("Turnstile verified and JWT issued for IP %s", c.ClientIP())
	c.JSON(http.StatusOK, TurnstileVerifyResponse{
		Success: true,
		JWT:     token,
	})
}

// HandleGetSiteKey returns the Turnstile site key for the frontend
func (h *AuthHandler) HandleGetSiteKey(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"siteKey": h.turnstileSiteKey,
	})
}

// HandleGetToken issues a JWT token without verification (rate-limited by Traefik)
func (h *AuthHandler) HandleGetToken(c *gin.Context) {
	// Generate JWT token
	token, err := h.generateJWT()
	if err != nil {
		log.Printf("JWT generation error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Token generation failed",
		})
		return
	}

	log.Printf("JWT issued for IP %s", c.ClientIP())
	c.JSON(http.StatusOK, gin.H{
		"jwt": token,
	})
}

// verifyTurnstileToken verifies the token with Cloudflare's API
func (h *AuthHandler) verifyTurnstileToken(token, remoteIP string) (bool, error) {
	// If no secret configured, allow (for development)
	if h.turnstileSecret == "" {
		log.Printf("Warning: TURNSTILE_SECRET not configured, allowing all requests")
		return true, nil
	}

	// Prepare verification request
	verifyURL := "https://challenges.cloudflare.com/turnstile/v0/siteverify"
	payload := map[string]string{
		"secret":   h.turnstileSecret,
		"response": token,
		"remoteip": remoteIP,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return false, err
	}

	// Send verification request to Cloudflare
	resp, err := http.Post(verifyURL, "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	// Parse response
	var cfResp CloudflareTurnstileResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		return false, err
	}

	if !cfResp.Success {
		log.Printf("Turnstile verification failed: %v", cfResp.ErrorCodes)
	}

	return cfResp.Success, nil
}

// generateJWT creates a new JWT token
func (h *AuthHandler) generateJWT() (string, error) {
	// If no JWT secret configured, return empty (for development)
	if len(h.jwtSecret) == 0 {
		log.Printf("Warning: JWT_SECRET not configured, authentication disabled")
		return "dev-token", nil
	}

	claims := JWTClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(JWTExpirationTime)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(h.jwtSecret)
}

// VerifyJWT validates a JWT token
func (h *AuthHandler) VerifyJWT(tokenString string) (*JWTClaims, error) {
	// If no JWT secret configured, allow (for development)
	if len(h.jwtSecret) == 0 {
		log.Printf("Warning: JWT_SECRET not configured, allowing all tokens")
		return &JWTClaims{}, nil
	}

	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		return h.jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, jwt.ErrSignatureInvalid
}

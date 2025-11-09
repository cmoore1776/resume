package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestNewAuthHandler(t *testing.T) {
	handler := NewAuthHandler("test-secret", "turnstile-secret", "site-key")

	if handler == nil {
		t.Fatal("NewAuthHandler returned nil")
	}

	if string(handler.jwtSecret) != "test-secret" {
		t.Errorf("Expected jwtSecret to be 'test-secret', got '%s'", string(handler.jwtSecret))
	}

	if handler.turnstileSecret != "turnstile-secret" {
		t.Errorf("Expected turnstileSecret to be 'turnstile-secret', got '%s'", handler.turnstileSecret)
	}

	if handler.turnstileSiteKey != "site-key" {
		t.Errorf("Expected turnstileSiteKey to be 'site-key', got '%s'", handler.turnstileSiteKey)
	}
}

func TestGenerateJWT(t *testing.T) {
	handler := NewAuthHandler("test-secret-key", "", "")

	token, err := handler.generateJWT()
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}

	if token == "" {
		t.Error("generateJWT returned empty token")
	}
}

func TestGenerateJWTWithoutSecret(t *testing.T) {
	handler := NewAuthHandler("", "", "")

	token, err := handler.generateJWT()
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}

	if token != "dev-token" {
		t.Errorf("Expected dev-token, got '%s'", token)
	}
}

func TestVerifyJWT(t *testing.T) {
	secret := "test-secret-key"
	handler := NewAuthHandler(secret, "", "")

	// Generate a token
	token, err := handler.generateJWT()
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}

	// Verify the token
	claims, err := handler.VerifyJWT(token)
	if err != nil {
		t.Fatalf("VerifyJWT failed: %v", err)
	}

	if claims == nil {
		t.Error("VerifyJWT returned nil claims")
	}
}

func TestVerifyJWTInvalid(t *testing.T) {
	handler := NewAuthHandler("test-secret-key", "", "")

	// Try to verify an invalid token
	_, err := handler.VerifyJWT("invalid-token")
	if err == nil {
		t.Error("VerifyJWT should fail for invalid token")
	}
}

func TestVerifyJWTExpired(t *testing.T) {
	secret := "test-secret-key"
	handler := NewAuthHandler(secret, "", "")

	// Create an expired token
	claims := JWTClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("Failed to create expired token: %v", err)
	}

	// Try to verify the expired token
	_, err = handler.VerifyJWT(tokenString)
	if err == nil {
		t.Error("VerifyJWT should fail for expired token")
	}
}

func TestVerifyJWTWithoutSecret(t *testing.T) {
	handler := NewAuthHandler("", "", "")

	// Should allow any token when no secret is configured
	claims, err := handler.VerifyJWT("any-token")
	if err != nil {
		t.Fatalf("VerifyJWT failed: %v", err)
	}

	if claims == nil {
		t.Error("VerifyJWT returned nil claims")
	}
}

func TestHandleGetToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler("test-secret-key", "", "")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/token", nil)

	handler.HandleGetToken(c)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]string
	err := json.Unmarshal(w.Body.Bytes(), &response)
	if err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if response["jwt"] == "" {
		t.Error("Response should contain jwt token")
	}
}

func TestHandleGetSiteKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler("", "", "test-site-key")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/sitekey", nil)

	handler.HandleGetSiteKey(c)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]string
	err := json.Unmarshal(w.Body.Bytes(), &response)
	if err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if response["siteKey"] != "test-site-key" {
		t.Errorf("Expected siteKey 'test-site-key', got '%s'", response["siteKey"])
	}
}

func TestHandleVerifyTurnstileInvalidRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler("test-secret", "", "")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/verify-turnstile", bytes.NewBufferString("invalid json"))
	c.Request.Header.Set("Content-Type", "application/json")

	handler.HandleVerifyTurnstile(c)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}
}

func TestVerifyTurnstileTokenWithoutSecret(t *testing.T) {
	handler := NewAuthHandler("", "", "")

	// Should allow when no secret is configured
	verified, err := handler.verifyTurnstileToken("any-token", "127.0.0.1")
	if err != nil {
		t.Fatalf("verifyTurnstileToken failed: %v", err)
	}

	if !verified {
		t.Error("verifyTurnstileToken should return true when no secret is configured")
	}
}

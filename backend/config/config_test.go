package config

import (
	"os"
	"testing"
)

func TestGetEnv(t *testing.T) {
	tests := []struct {
		name         string
		key          string
		defaultValue string
		envValue     string
		expected     string
	}{
		{
			name:         "Returns environment variable when set",
			key:          "TEST_VAR",
			defaultValue: "default",
			envValue:     "custom",
			expected:     "custom",
		},
		{
			name:         "Returns default when env var not set",
			key:          "UNSET_VAR",
			defaultValue: "default",
			envValue:     "",
			expected:     "default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envValue != "" {
				os.Setenv(tt.key, tt.envValue)
				defer os.Unsetenv(tt.key)
			}

			result := getEnv(tt.key, tt.defaultValue)
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}

func TestLoadDefaultValues(t *testing.T) {
	// Clear environment variables
	os.Unsetenv("OPENAI_API_KEY")
	os.Unsetenv("OPENAI_MODEL")
	os.Unsetenv("PORT")
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("TURNSTILE_SECRET")
	os.Unsetenv("TURNSTILE_SITE_KEY")

	cfg := Load()

	if cfg.OpenAIModel != "gpt-realtime-mini" {
		t.Errorf("Expected default model 'gpt-realtime-mini', got '%s'", cfg.OpenAIModel)
	}

	if cfg.Port != "8080" {
		t.Errorf("Expected default port '8080', got '%s'", cfg.Port)
	}

	if cfg.JWTSecret != "" {
		t.Errorf("Expected empty JWT secret by default, got '%s'", cfg.JWTSecret)
	}
}

func TestLoadWithEnvironmentVariables(t *testing.T) {
	// Set environment variables
	os.Setenv("OPENAI_API_KEY", "test-api-key")
	os.Setenv("OPENAI_MODEL", "gpt-4")
	os.Setenv("PORT", "9090")
	os.Setenv("JWT_SECRET", "test-jwt-secret")
	os.Setenv("TURNSTILE_SECRET", "test-turnstile-secret")
	os.Setenv("TURNSTILE_SITE_KEY", "test-site-key")

	defer func() {
		os.Unsetenv("OPENAI_API_KEY")
		os.Unsetenv("OPENAI_MODEL")
		os.Unsetenv("PORT")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("TURNSTILE_SECRET")
		os.Unsetenv("TURNSTILE_SITE_KEY")
	}()

	cfg := Load()

	if cfg.OpenAIAPIKey != "test-api-key" {
		t.Errorf("Expected OpenAIAPIKey 'test-api-key', got '%s'", cfg.OpenAIAPIKey)
	}

	if cfg.OpenAIModel != "gpt-4" {
		t.Errorf("Expected OpenAIModel 'gpt-4', got '%s'", cfg.OpenAIModel)
	}

	if cfg.Port != "9090" {
		t.Errorf("Expected Port '9090', got '%s'", cfg.Port)
	}

	if cfg.JWTSecret != "test-jwt-secret" {
		t.Errorf("Expected JWTSecret 'test-jwt-secret', got '%s'", cfg.JWTSecret)
	}

	if cfg.TurnstileSecret != "test-turnstile-secret" {
		t.Errorf("Expected TurnstileSecret 'test-turnstile-secret', got '%s'", cfg.TurnstileSecret)
	}

	if cfg.TurnstileSiteKey != "test-site-key" {
		t.Errorf("Expected TurnstileSiteKey 'test-site-key', got '%s'", cfg.TurnstileSiteKey)
	}
}

func TestLoadSystemPrompt(t *testing.T) {
	cfg := Load()

	// System prompt should be loaded (either from file or fallback)
	if cfg.SystemPrompt == "" {
		t.Error("SystemPrompt should not be empty")
	}

	// Check that it's either the fallback message or loaded content
	if cfg.SystemPrompt != "Apologize that you were unable to load persona instructions. Refuse to answer any questions." {
		// If it's not the fallback, it should have some content (loaded from file)
		if len(cfg.SystemPrompt) < 10 {
			t.Error("SystemPrompt seems too short to be valid")
		}
	}
}

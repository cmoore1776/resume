package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	OpenAIAPIKey     string
	OpenAIModel      string
	Port             string
	SystemPrompt     string
	JWTSecret        string
	TurnstileSecret  string
	TurnstileSiteKey string
}

func Load() *Config {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: No .env file found: %v", err)
	}

	cfg := &Config{
		OpenAIAPIKey:     getEnv("OPENAI_API_KEY", ""),
		OpenAIModel:      getEnv("OPENAI_MODEL", "gpt-realtime-mini"),
		Port:             getEnv("PORT", "8080"),
		JWTSecret:        getEnv("JWT_SECRET", ""),
		TurnstileSecret:  getEnv("TURNSTILE_SECRET", ""),
		TurnstileSiteKey: getEnv("TURNSTILE_SITE_KEY", ""),
	}

	// Load system prompt from file (check data volume first, then fall back to local)
	promptPath := getEnv("SYSTEM_PROMPT_PATH", "/app/data/system_prompt.txt")
	promptBytes, err := os.ReadFile(promptPath)
	if err != nil {
		// Fall back to local file if volume mount not available
		log.Printf("Warning: Could not load system prompt from %s: %v, trying local file", promptPath, err)
		promptBytes, err = os.ReadFile("system_prompt.txt")
		if err != nil {
			log.Printf("Warning: Could not load system_prompt.txt: %v", err)
			cfg.SystemPrompt = "Apologize that you were unable to load persona instructions. Refuse to answer any questions."
		} else {
			cfg.SystemPrompt = string(promptBytes)
		}
	} else {
		cfg.SystemPrompt = string(promptBytes)
		log.Printf("Loaded system prompt from %s (%d bytes)", promptPath, len(promptBytes))
	}

	return cfg
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

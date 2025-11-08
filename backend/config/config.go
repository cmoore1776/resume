package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	OpenAIAPIKey string
	OpenAIModel  string
	Port         string
	SystemPrompt string
}

func Load() *Config {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: No .env file found: %v", err)
	}

	cfg := &Config{
		OpenAIAPIKey: getEnv("OPENAI_API_KEY", ""),
		OpenAIModel:  getEnv("OPENAI_MODEL", "gpt-4o-realtime-preview-2024-12-17"),
		Port:         getEnv("PORT", "8080"),
	}

	// Load system prompt from file
	promptBytes, err := os.ReadFile("system_prompt.txt")
	if err != nil {
		log.Printf("Warning: Could not load system_prompt.txt: %v", err)
		cfg.SystemPrompt = "You are a helpful assistant representing Christian Moore."
	} else {
		cfg.SystemPrompt = string(promptBytes)
	}

	return cfg
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

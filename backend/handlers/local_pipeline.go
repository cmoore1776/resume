package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

// OpenAI-compatible chat completion request
type ChatCompletionRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// OpenAI-compatible streaming response
type ChatCompletionChunk struct {
	ID      string   `json:"id"`
	Object  string   `json:"object"`
	Created int64    `json:"created"`
	Model   string   `json:"model"`
	Choices []Choice `json:"choices"`
}

type Choice struct {
	Index        int          `json:"index"`
	Delta        MessageDelta `json:"delta"`
	FinishReason *string      `json:"finish_reason"`
}

type MessageDelta struct {
	Role    string `json:"role,omitempty"`
	Content string `json:"content,omitempty"`
}

// TTS API request (OpenAI-compatible)
type TTSRequest struct {
	Model          string  `json:"model"`
	Input          string  `json:"input"`
	Voice          string  `json:"voice"`
	ResponseFormat string  `json:"response_format"`
	Speed          float64 `json:"speed,omitempty"`
}

// LocalPipelineHandler manages LLM + TTS pipeline
type LocalPipelineHandler struct {
	llmURL       string
	systemPrompt string
	ttsURL       string
	ttsVoice     string
	ttsSpeed     float64
}

func NewLocalPipelineHandler(llmURL, systemPrompt, ttsURL, ttsVoice, ttsSpeed string) (*LocalPipelineHandler, error) {
	log.Printf("Local pipeline initialized: LLM=%s, TTS=%s, Voice=%s, Speed=%s", llmURL, ttsURL, ttsVoice, ttsSpeed)

	// Parse speed string to float64
	speedFloat := 0.95 // default
	if ttsSpeed != "" {
		if _, err := fmt.Sscanf(ttsSpeed, "%f", &speedFloat); err != nil {
			log.Printf("Warning: failed to parse TTS_SPEED=%s, using default 0.95: %v", ttsSpeed, err)
			speedFloat = 0.95
		}
	}

	return &LocalPipelineHandler{
		llmURL:       llmURL,
		systemPrompt: systemPrompt,
		ttsURL:       ttsURL,
		ttsVoice:     ttsVoice,
		ttsSpeed:     speedFloat,
	}, nil
}

// StreamLLMResponse calls the local LLM and streams text deltas back to the client
func (h *LocalPipelineHandler) StreamLLMResponse(ctx context.Context, userMessage string, sendJSON func(ServerMessage) error) (string, error) {
	// Prepare chat completion request
	reqBody := ChatCompletionRequest{
		Model: "qwen2.5-7b-instruct",
		Messages: []Message{
			{Role: "system", Content: h.systemPrompt},
			{Role: "user", Content: userMessage},
		},
		Stream: true,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	// Make streaming request to local LLM
	req, err := http.NewRequestWithContext(ctx, "POST", h.llmURL+"/v1/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	log.Printf("Calling local LLM at %s", h.llmURL)
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to call LLM: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("LLM returned status %d: %s", resp.StatusCode, string(body))
	}

	// Stream response back to client
	var fullResponse strings.Builder
	reader := bufio.NewReader(resp.Body)

	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			return "", fmt.Errorf("error reading stream: %w", err)
		}

		// Skip empty lines
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}

		// Parse SSE format: "data: {...}"
		if bytes.HasPrefix(line, []byte("data: ")) {
			data := bytes.TrimPrefix(line, []byte("data: "))

			// Check for [DONE] marker
			if bytes.Equal(data, []byte("[DONE]")) {
				break
			}

			// Parse JSON chunk
			var chunk ChatCompletionChunk
			if err := json.Unmarshal(data, &chunk); err != nil {
				log.Printf("Warning: failed to parse chunk: %v", err)
				continue
			}

			// Extract content delta
			if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
				content := chunk.Choices[0].Delta.Content
				fullResponse.WriteString(content)

				// Send text delta to client
				if err := sendJSON(ServerMessage{
					Type: "text_delta",
					Text: content,
				}); err != nil {
					return "", fmt.Errorf("failed to send text delta: %w", err)
				}
			}
		}
	}

	response := fullResponse.String()
	log.Printf("LLM response complete: %d characters", len(response))
	return response, nil
}

// GenerateAndStreamAudio converts text to speech and streams audio chunks
func (h *LocalPipelineHandler) GenerateAndStreamAudio(ctx context.Context, text string, sendJSON func(ServerMessage) error) error {
	log.Printf("Generating audio for %d characters of text", len(text))

	// Call TTS API (OpenAI-compatible)
	ttsReq := TTSRequest{
		Model:          "tts-1",
		Input:          text,
		Voice:          h.ttsVoice,
		ResponseFormat: "wav",
		Speed:          h.ttsSpeed,
	}

	jsonData, err := json.Marshal(ttsReq)
	if err != nil {
		return fmt.Errorf("failed to marshal TTS request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", h.ttsURL+"/v1/audio/speech", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create TTS request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	log.Printf("Calling TTS API at %s", h.ttsURL)
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to call TTS API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("TTS API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Read WAV data from response
	wavData, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read TTS response: %w", err)
	}

	log.Printf("Generated WAV audio: %d bytes", len(wavData))

	// Convert WAV to PCM16 24kHz (compatible with frontend)
	pcmData, err := convertWAVToPCM16(wavData)
	if err != nil {
		return fmt.Errorf("failed to convert WAV to PCM16: %w", err)
	}

	log.Printf("Converted to PCM16: %d bytes", len(pcmData))

	// Stream audio in chunks (base64 encoded)
	// Use 4KB chunks to match OpenAI's chunk size
	chunkSize := 4096
	for i := 0; i < len(pcmData); i += chunkSize {
		end := i + chunkSize
		if end > len(pcmData) {
			end = len(pcmData)
		}

		chunk := pcmData[i:end]
		base64Chunk := base64.StdEncoding.EncodeToString(chunk)

		if err := sendJSON(ServerMessage{
			Type:  "audio_delta",
			Audio: base64Chunk,
		}); err != nil {
			return fmt.Errorf("failed to send audio delta: %w", err)
		}
	}

	log.Printf("Audio streaming complete")
	return nil
}

// convertWAVToPCM16 converts WAV data to raw PCM16 at 24kHz
func convertWAVToPCM16(wavData []byte) ([]byte, error) {
	// WAV file structure:
	// - Header (44 bytes): RIFF, format info, sample rate, etc.
	// - Data: raw PCM samples

	if len(wavData) < 12 {
		return nil, fmt.Errorf("WAV file too small: %d bytes", len(wavData))
	}

	// Verify RIFF header
	if string(wavData[0:4]) != "RIFF" {
		return nil, fmt.Errorf("invalid WAV file: missing RIFF header")
	}

	// Verify WAVE format
	if string(wavData[8:12]) != "WAVE" {
		return nil, fmt.Errorf("invalid WAV file: missing WAVE format")
	}

	// Search for fmt chunk to extract sample rate and bits per sample
	var sampleRate uint32
	var bitsPerSample uint16
	var fmtFound bool

	// Search for "fmt " chunk
	for i := 12; i < len(wavData)-20; i++ {
		if string(wavData[i:i+4]) == "fmt " {
			fmtChunkSize := int(binary.LittleEndian.Uint32(wavData[i+4 : i+8]))
			fmtDataOffset := i + 8

			// Validate we have enough data for fmt chunk
			if fmtDataOffset+16 <= len(wavData) && fmtChunkSize >= 16 {
				// Extract sample rate from fmt chunk (bytes 4-7 of chunk data)
				sampleRate = binary.LittleEndian.Uint32(wavData[fmtDataOffset+4 : fmtDataOffset+8])
				// Extract bits per sample (bytes 14-15 of chunk data)
				bitsPerSample = binary.LittleEndian.Uint16(wavData[fmtDataOffset+14 : fmtDataOffset+16])
				log.Printf("WAV sample rate: %d Hz, bits per sample: %d", sampleRate, bitsPerSample)
				fmtFound = true
				break
			}
		}
	}

	if !fmtFound {
		return nil, fmt.Errorf("fmt chunk not found in WAV file")
	}

	// Search for "data" chunk
	var pcmData []byte

	for i := 12; i < len(wavData)-8; i++ {
		if string(wavData[i:i+4]) == "data" {
			dataChunkSize := int(binary.LittleEndian.Uint32(wavData[i+4 : i+8]))
			dataOffset := i + 8

			// Take all remaining data or the chunk size, whichever is smaller
			remainingData := len(wavData) - dataOffset
			if dataChunkSize > 0 && dataChunkSize <= remainingData {
				pcmData = wavData[dataOffset : dataOffset+dataChunkSize]
				log.Printf("Found data chunk: %d bytes (from chunk size)", len(pcmData))
			} else {
				// Invalid chunk size or larger than remaining data, just take what's left
				pcmData = wavData[dataOffset:]
				log.Printf("Found data chunk: %d bytes (using remaining data, chunk size was %d)", len(pcmData), dataChunkSize)
			}
			break
		}
	}

	if pcmData == nil {
		return nil, fmt.Errorf("data chunk not found in WAV file")
	}

	// Validate bits per sample
	if bitsPerSample != 16 {
		return nil, fmt.Errorf("unsupported bits per sample: %d (expected 16)", bitsPerSample)
	}

	// Log warning if sample rate is not 24kHz
	if sampleRate != 24000 && sampleRate != 22050 {
		log.Printf("Warning: WAV sample rate is %d Hz, expected 24000 Hz. May need resampling.", sampleRate)
	}

	return pcmData, nil
}

// HandleLocalPipeline processes a message through the local LLM + TTS pipeline
func (h *LocalPipelineHandler) HandleLocalPipeline(ctx context.Context, userMessage string, clientWS *websocket.Conn, wsMutex *websocket.Conn, sendJSON func(ServerMessage) error) error {
	// Step 1: Stream LLM response (sends text_delta messages)
	fullText, err := h.StreamLLMResponse(ctx, userMessage, sendJSON)
	if err != nil {
		return fmt.Errorf("LLM streaming failed: %w", err)
	}

	// Send text_done message
	if err := sendJSON(ServerMessage{Type: "text_done"}); err != nil {
		return err
	}

	// Step 2: Generate and stream audio (sends audio_delta messages)
	if err := h.GenerateAndStreamAudio(ctx, fullText, sendJSON); err != nil {
		return fmt.Errorf("audio generation failed: %w", err)
	}

	// Send audio_done message
	if err := sendJSON(ServerMessage{Type: "audio_done"}); err != nil {
		return err
	}

	// Send response_done message
	if err := sendJSON(ServerMessage{Type: "response_done"}); err != nil {
		return err
	}

	return nil
}

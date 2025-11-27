import { useState, useRef, useEffect, useCallback } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { posthog } from '../main';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatProps {
  onSpeakingChange: (isSpeaking: boolean) => void;
}

export default function Chat({ onSpeakingChange }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('');
  const [volume, setVolume] = useState(0.8); // Default 80% volume
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  // Tracking refs for PostHog analytics
  const messageStartTimeRef = useRef<number | null>(null);
  const firstTextDeltaReceivedRef = useRef(false);
  const firstAudioDeltaReceivedRef = useRef(false);

  // Authentication state
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Float32Array[]>([]);
  const isPlayingAudioRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const volumeControlRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef(0.8); // Ref to track current volume for audio playback

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentAssistantMessage]);

  // Close volume slider when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumeControlRef.current && !volumeControlRef.current.contains(event.target as Node)) {
        setShowVolumeSlider(false);
      }
    };

    if (showVolumeSlider) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showVolumeSlider]);

  // Automatically fetch JWT token on mount
  useEffect(() => {
    // Check if we already have a valid JWT in localStorage
    const existingJWT = localStorage.getItem('jwt_token');
    if (existingJWT) {
      setJwtToken(existingJWT);
      setIsAuthenticating(false);
      return;
    }

    // Request a new JWT token
    const apiUrl = import.meta.env.VITE_API_URL || 'https://christianmoore.me';

    fetch(`${apiUrl}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(res => res.json())
      .then(data => {
        if (data.jwt) {
          setJwtToken(data.jwt);
          localStorage.setItem('jwt_token', data.jwt);
        }
      })
      .catch(err => {
        console.error('Failed to fetch JWT token:', err);
      })
      .finally(() => {
        setIsAuthenticating(false);
      });
  }, []);

  const playAudioBuffers = useCallback(async () => {
    if (isPlayingAudioRef.current) return;

    // Initialize audio context if needed
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({
        sampleRate: 24000,
      });
    }

    const audioContext = audioContextRef.current;

    // Resume audio context if suspended (required by browser autoplay policies)
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        console.log('AudioContext resumed');
      } catch (error) {
        console.error('Failed to resume AudioContext:', error);
        return;
      }
    }

    isPlayingAudioRef.current = true;
    onSpeakingChange(true);

    try {
      while (audioBuffersRef.current.length > 0) {
        const samples = audioBuffersRef.current.shift();
        if (!samples) continue;

        // Create audio buffer
        const audioBuffer = audioContext.createBuffer(1, samples.length, 24000);
        const channelData = audioBuffer.getChannelData(0);
        channelData.set(samples);

        // Create and play buffer source
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        // Create gain node for volume control
        const gainNode = audioContext.createGain();
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Set volume from ref (0.0 to 1.0)
        gainNode.gain.value = volumeRef.current;

        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
          source.start();
        });
      }
    } catch (error) {
      console.error('Error playing audio:', error);
    } finally {
      isPlayingAudioRef.current = false;
      if (audioBuffersRef.current.length === 0) {
        onSpeakingChange(false);
      }
    }
  }, [onSpeakingChange]);

  // Initialize WebSocket connection (only when authenticated)
  useEffect(() => {
    // Don't connect until we have a JWT token
    if (!jwtToken) return;

    const wsUrl = import.meta.env.VITE_WS_URL || 'wss://christianmoore.me/ws/chat';

    // Send JWT token via Sec-WebSocket-Protocol header (WebSocket auth method)
    const ws = new WebSocket(wsUrl, jwtToken);

    ws.onopen = () => {
      // WebSocket connection established
      setIsConnected(true);
      setShowReconnectPrompt(false);
      posthog?.capture('websocket_connected');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'text_delta':
          // Track first text delta (time to first token)
          if (!firstTextDeltaReceivedRef.current && messageStartTimeRef.current) {
            firstTextDeltaReceivedRef.current = true;
            const timeToFirstToken = Date.now() - messageStartTimeRef.current;
            posthog?.capture('first_text_delta', { time_to_first_token_ms: timeToFirstToken });
          }
          // Accumulate streaming text
          setCurrentAssistantMessage((prev) => prev + message.text);
          break;

        case 'text_done':
          // Track text completion
          if (messageStartTimeRef.current) {
            const textCompletionTime = Date.now() - messageStartTimeRef.current;
            posthog?.capture('text_done', { text_completion_time_ms: textCompletionTime });
          }
          // Text streaming complete, add to messages
          setCurrentAssistantMessage((currentText) => {
            if (currentText) {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: currentText },
              ]);
            }
            return '';
          });
          break;

        case 'audio_delta':
          // Accumulate audio chunks
          if (message.audio) {
            // Track first audio delta
            if (!firstAudioDeltaReceivedRef.current && messageStartTimeRef.current) {
              firstAudioDeltaReceivedRef.current = true;
              const timeToFirstAudio = Date.now() - messageStartTimeRef.current;
              posthog?.capture('first_audio_delta', { time_to_first_audio_ms: timeToFirstAudio });
            }
            try {
              // Decode base64 to binary
              const binaryString = atob(message.audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }

              // Convert PCM16 to Float32
              const dataView = new DataView(bytes.buffer);
              const samples = new Float32Array(bytes.length / 2);
              for (let i = 0; i < samples.length; i++) {
                // PCM16 is signed 16-bit integer
                const int16 = dataView.getInt16(i * 2, true);
                samples[i] = int16 / 32768.0;
              }

              audioBuffersRef.current.push(samples);

              // Start playing if not already playing
              if (!isPlayingAudioRef.current && audioBuffersRef.current.length > 0) {
                playAudioBuffers();
              }
            } catch (error) {
              console.error('Error processing audio delta:', error);
              posthog?.capture('audio_processing_error', { error: String(error) });
            }
          }
          break;

        case 'audio_done':
          // Track audio completion
          if (messageStartTimeRef.current) {
            const audioCompletionTime = Date.now() - messageStartTimeRef.current;
            posthog?.capture('audio_done', { audio_completion_time_ms: audioCompletionTime });
          }
          // Audio streaming complete
          onSpeakingChange(false);
          break;

        case 'response_done':
          // Complete response done - track total time
          if (messageStartTimeRef.current) {
            const totalResponseTime = Date.now() - messageStartTimeRef.current;
            posthog?.capture('response_done', { total_response_time_ms: totalResponseTime });
          }
          setIsLoading(false);
          break;

        case 'error':
          console.error('Server error:', message.error);
          posthog?.capture('chat_error', { error: message.error });
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Error: ${message.error}`,
            },
          ]);
          setIsLoading(false);
          setCurrentAssistantMessage('');
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      posthog?.capture('websocket_error');
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed with code:', event.code);
      setIsConnected(false);
      posthog?.capture('websocket_disconnected', {
        code: event.code,
        wasClean: event.wasClean,
        reason: event.reason || 'none'
      });

      // If connection failed to establish (likely auth error), refresh JWT
      // Code 1006 means abnormal closure (connection failed before opening)
      if (event.code === 1006 && !event.wasClean) {
        console.log('WebSocket failed to connect, likely JWT expired. Refreshing token...');
        localStorage.removeItem('jwt_token');
        setJwtToken(null);
        setIsAuthenticating(true);

        // Fetch new JWT token
        const apiUrl = import.meta.env.VITE_API_URL || 'https://christianmoore.me';
        fetch(`${apiUrl}/api/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
          .then(res => res.json())
          .then(data => {
            if (data.jwt) {
              console.log('Got new JWT token, reconnecting...');
              setJwtToken(data.jwt);
              localStorage.setItem('jwt_token', data.jwt);
            }
          })
          .catch(err => {
            console.error('Failed to refresh JWT token:', err);
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: 'Authentication failed. Please refresh the page.',
              },
            ]);
          })
          .finally(() => {
            setIsAuthenticating(false);
          });
      } else {
        // For other close reasons (idle timeout, etc), show reconnect prompt
        setShowReconnectPrompt(true);
      }
    };

    wsRef.current = ws;

    // Cleanup on unmount
    return () => {
      ws.close();
    };
  }, [jwtToken, playAudioBuffers, onSpeakingChange]); // Reconnect when JWT token changes

  const handleReconnect = () => {
    // Try to refresh JWT token and reconnect
    setShowReconnectPrompt(false);
    setIsAuthenticating(true);
    localStorage.removeItem('jwt_token');

    const apiUrl = import.meta.env.VITE_API_URL || 'https://christianmoore.me';
    fetch(`${apiUrl}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(res => res.json())
      .then(data => {
        if (data.jwt) {
          setJwtToken(data.jwt);
          localStorage.setItem('jwt_token', data.jwt);
        }
      })
      .catch(err => {
        console.error('Failed to refresh JWT token:', err);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Failed to reconnect. Please refresh the page.',
          },
        ]);
        setShowReconnectPrompt(true);
      })
      .finally(() => {
        setIsAuthenticating(false);
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    setCurrentAssistantMessage('');

    // Clear any existing audio buffers
    audioBuffersRef.current = [];

    // Reset tracking refs for PostHog analytics
    messageStartTimeRef.current = Date.now();
    firstTextDeltaReceivedRef.current = false;
    firstAudioDeltaReceivedRef.current = false;

    // Send message via WebSocket
    wsRef.current.send(
      JSON.stringify({
        type: 'message',
        message: userMessage,
      })
    );
    posthog?.capture('chat_message_sent', { message_length: userMessage.length });
  };

  return (
    <div className="chat-container">
      {/* Show loading state while authenticating */}
      {isAuthenticating && (
        <div className="auth-container" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          padding: '2rem'
        }}>
          <h2>Loading...</h2>
          <p style={{ marginBottom: '1.5rem', color: '#666' }}>
            Connecting to chat service
          </p>
        </div>
      )}

      {/* Show reconnect prompt when disconnected */}
      {showReconnectPrompt && !isAuthenticating && (
        <div className="reconnect-prompt" style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          padding: '2rem',
          borderRadius: '8px',
          textAlign: 'center',
          zIndex: 1000,
          minWidth: '300px',
          border: '2px solid #ff6b6b'
        }}>
          <h3 style={{ marginBottom: '1rem', color: '#ff6b6b' }}>Connection Lost</h3>
          <p style={{ marginBottom: '1.5rem', color: '#ccc' }}>
            Your connection to the chat service has been lost.
          </p>
          <button
            onClick={handleReconnect}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#45a049'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#4caf50'}
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Show chat interface once authenticated */}
      {!isAuthenticating && (
        <>
          <div className="messages">
            {messages.length === 0 && !currentAssistantMessage && (
              <div className="welcome-message">
                <h2>I'm Christian's AI agent</h2>
                <p>Ask me about his professional experience!</p>
              </div>
            )}
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">{message.content}</div>
          </div>
        ))}
        {currentAssistantMessage && (
          <div className="message assistant">
            <div className="message-content">{currentAssistantMessage}</div>
          </div>
        )}
        {isLoading && !currentAssistantMessage && (
          <div className="message assistant">
            <div className="message-content typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

          <form onSubmit={handleSubmit} className="input-form">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isConnected ? "Ask me anything..." : "Disconnected..."}
              disabled={isLoading || !isConnected}
              className="message-input"
            />
            <div className="volume-control" ref={volumeControlRef}>
              {showVolumeSlider && (
                <div className="volume-slider-container">
                  <div className="volume-label">{Math.round(volume * 100)}%</div>
                  <Slider.Root
                    className="volume-slider"
                    value={[volume * 100]}
                    onValueChange={(values) => {
                      const newVolume = values[0] / 100;
                      setVolume(newVolume);
                      volumeRef.current = newVolume;
                    }}
                    max={100}
                    step={1}
                    orientation="vertical"
                  >
                    <Slider.Track className="volume-slider-track">
                      <Slider.Range className="volume-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="volume-slider-thumb" />
                  </Slider.Root>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                className="volume-button"
                title="Volume"
              >
                <i className={`fas fa-fw ${volume === 0 ? 'fa-volume-xmark' : volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high'}`}></i>
              </button>
            </div>
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !isConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN}
              className="send-button"
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}

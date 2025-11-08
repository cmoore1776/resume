import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatProps {
  onSpeakingChange: (isSpeaking: boolean) => void;
}

// Declare turnstile on window for TypeScript
declare global {
  interface Window {
    turnstile?: {
      render: (element: string | HTMLElement, options: {
        sitekey: string;
        callback: string | ((token: string) => void);
      }) => void;
    };
  }
}

export default function Chat({ onSpeakingChange }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  // Authentication state
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string>('');
  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Float32Array[]>([]);
  const isPlayingAudioRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const turnstileRendered = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentAssistantMessage]);

  // Check for existing JWT on mount and fetch Turnstile site key
  useEffect(() => {
    // Check if we already have a valid JWT in localStorage
    const existingJWT = localStorage.getItem('jwt_token');
    if (existingJWT) {
      console.log('Found existing JWT token in localStorage');
      setJwtToken(existingJWT);
      setIsVerified(true);
      return; // Skip Turnstile if we have a valid token
    }

    // No existing JWT, fetch Turnstile site key
    const apiUrl = import.meta.env.VITE_API_URL || 'https://resume.k3s.christianmoore.me';

    fetch(`${apiUrl}/api/turnstile-sitekey`)
      .then(res => res.json())
      .then(data => {
        setTurnstileSiteKey(data.siteKey);
      })
      .catch(err => {
        console.error('Failed to fetch Turnstile site key:', err);
        setAuthError('Failed to load authentication. Please refresh the page.');
      });
  }, []);

  // Turnstile success callback - must be stable reference for window
  const handleTurnstileSuccess = useCallback(async (token: string) => {
    console.log('Turnstile callback triggered with token:', token);
    setIsVerifying(true);
    setAuthError(null);

    const apiUrl = import.meta.env.VITE_API_URL || 'https://resume.k3s.christianmoore.me';

    try {
      console.log('Sending verification request to:', `${apiUrl}/api/verify-turnstile`);
      const response = await fetch(`${apiUrl}/api/verify-turnstile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const data = await response.json();
      console.log('Verification response:', data);

      if (data.success && data.jwt) {
        console.log('Verification successful, setting JWT');
        setJwtToken(data.jwt);
        localStorage.setItem('jwt_token', data.jwt);
        setIsVerified(true);
      } else {
        console.error('Verification failed:', data);
        setAuthError(data.error || 'Verification failed. Please try again.');
      }
    } catch (err) {
      console.error('Turnstile verification error:', err);
      setAuthError('Verification failed. Please refresh and try again.');
    } finally {
      setIsVerifying(false);
    }
  }, [setIsVerifying, setAuthError, setJwtToken, setIsVerified]);

  // Setup global callback for Turnstile
  useEffect(() => {
    // Create stable global callback that Turnstile can call by name
    (window as Window & { onTurnstileCallback?: (token: string) => void }).onTurnstileCallback = handleTurnstileSuccess;

    return () => {
      delete (window as Window & { onTurnstileCallback?: (token: string) => void }).onTurnstileCallback;
    };
  }, [handleTurnstileSuccess]);

  // Poll for Turnstile script and render widget
  useEffect(() => {
    if (!turnstileSiteKey || isVerified || turnstileRendered.current) return;

    console.log('Attempting to render Turnstile widget with sitekey:', turnstileSiteKey);

    const renderWidget = () => {
      const element = document.getElementById('turnstile-widget');
      console.log('Turnstile element:', element);
      console.log('Turnstile API loaded:', !!window.turnstile);

      if (element && window.turnstile) {
        try {
          console.log('Rendering Turnstile widget with callback: onTurnstileCallback');
          window.turnstile.render(element, {
            sitekey: turnstileSiteKey,
            callback: 'onTurnstileCallback',
          });
          turnstileRendered.current = true;
          console.log('Turnstile widget rendered successfully');
        } catch (error) {
          console.error('Failed to render Turnstile widget:', error);
        }
      } else {
        console.log('Cannot render: element or turnstile API not ready');
      }
    };

    // Try rendering immediately
    renderWidget();

    // If not rendered, poll for script to load
    if (!turnstileRendered.current) {
      const interval = setInterval(() => {
        if (window.turnstile) {
          renderWidget();
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, [turnstileSiteKey, isVerified, handleTurnstileSuccess]);

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

        // Create gain node for mute control
        const gainNode = audioContext.createGain();
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Set volume based on mute state
        gainNode.gain.value = isMuted ? 0 : 1;

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
  }, [onSpeakingChange, isMuted]);

  // Initialize WebSocket connection (only when authenticated)
  useEffect(() => {
    // Don't connect until we have a JWT token
    if (!jwtToken) return;

    const wsUrl = import.meta.env.VITE_WS_URL || 'wss://resume.k3s.christianmoore.me/ws/chat';

    // Send JWT token via Sec-WebSocket-Protocol header (WebSocket auth method)
    const ws = new WebSocket(wsUrl, ['access_token', jwtToken]);

    ws.onopen = () => {
      // WebSocket connection established
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'text_delta':
          // Accumulate streaming text
          setCurrentAssistantMessage((prev) => prev + message.text);
          break;

        case 'text_done':
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
            }
          }
          break;

        case 'audio_done':
          // Audio streaming complete
          onSpeakingChange(false);
          break;

        case 'response_done':
          // Complete response done
          setIsLoading(false);
          break;

        case 'error':
          console.error('Server error:', message.error);
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
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Connection error. Please refresh the page.',
        },
      ]);
      setIsLoading(false);
    };

    ws.onclose = () => {
      // WebSocket connection closed
    };

    wsRef.current = ws;

    // Cleanup on unmount
    return () => {
      ws.close();
    };
  }, [jwtToken]); // Reconnect when JWT token changes

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

    // Send message via WebSocket
    wsRef.current.send(
      JSON.stringify({
        type: 'message',
        message: userMessage,
      })
    );
  };

  return (
    <div className="chat-container">
      {/* Show Turnstile widget if not verified */}
      {!isVerified && (
        <div className="auth-container" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          padding: '2rem'
        }}>
          <h2>Welcome! Verify to continue</h2>
          <p style={{ marginBottom: '1.5rem', color: '#666' }}>
            Please complete the verification to chat with Christian's AI persona
          </p>

          {authError && (
            <div style={{
              color: '#d32f2f',
              backgroundColor: '#ffebee',
              padding: '0.75rem 1rem',
              borderRadius: '4px',
              marginBottom: '1rem',
              maxWidth: '400px'
            }}>
              {authError}
            </div>
          )}

          {isVerifying && (
            <div style={{ marginBottom: '1rem', color: '#666' }}>
              Verifying...
            </div>
          )}

          {/* Turnstile widget placeholder */}
          <div id="turnstile-widget"></div>
        </div>
      )}

      {/* Show chat interface if verified */}
      {isVerified && (
        <>
          <div className="messages">
            {messages.length === 0 && !currentAssistantMessage && (
              <div className="welcome-message">
                <h2>Hi! I'm Christian's AI persona</h2>
                <p>Ask me about my professional experience!</p>
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
              placeholder="Ask me anything..."
              disabled={isLoading}
              className="message-input"
            />
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="mute-button"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN}
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

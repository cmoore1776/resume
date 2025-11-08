import { useState, useRef, useEffect, useCallback } from 'react';

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
  const [isMuted, setIsMuted] = useState(false);

  // Authentication state
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Float32Array[]>([]);
  const isPlayingAudioRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentAssistantMessage]);

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
    const apiUrl = import.meta.env.VITE_API_URL || 'https://resume.k3s.christianmoore.me';

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
    const ws = new WebSocket(wsUrl, jwtToken);

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
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed with code:', event.code);

      // If connection failed to establish (likely auth error), refresh JWT
      // Code 1006 means abnormal closure (connection failed before opening)
      if (event.code === 1006 && !event.wasClean) {
        console.log('WebSocket failed to connect, likely JWT expired. Refreshing token...');
        localStorage.removeItem('jwt_token');
        setJwtToken(null);
        setIsAuthenticating(true);

        // Fetch new JWT token
        const apiUrl = import.meta.env.VITE_API_URL || 'https://resume.k3s.christianmoore.me';
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
      }
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

      {/* Show chat interface once authenticated */}
      {!isAuthenticating && (
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

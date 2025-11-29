import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Chat from './Chat';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  protocol: string | string[];
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string, protocol?: string | string[]) {
    this.url = url;
    this.protocol = protocol || '';
    MockWebSocket.instances.push(this);

    // Simulate async connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  send() {
    // Mock send (no-op for testing)
  }

  close(code?: number, reason?: string) {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      const closeEvent = new CloseEvent('close', { code, reason, wasClean: true });
      this.onclose(closeEvent);
    }
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

// Mock fetch
global.fetch = vi.fn();

describe('Chat Component', () => {
  const mockOnSpeakingChange = vi.fn();

  beforeEach(() => {
    // @ts-expect-error - Replace global WebSocket for testing
    global.WebSocket = MockWebSocket;
    MockWebSocket.reset();

    // Mock successful JWT fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ jwt: 'mock-jwt-token' }),
    });

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.localStorage = localStorageMock as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state initially', () => {
    render(<Chat onSpeakingChange={mockOnSpeakingChange} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should fetch JWT token on mount', async () => {
    render(<Chat onSpeakingChange={mockOnSpeakingChange} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/token'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  it('should establish WebSocket connection after authentication', async () => {
    render(<Chat onSpeakingChange={mockOnSpeakingChange} />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });
  });

  it('should display welcome message when no messages', async () => {
    render(<Chat onSpeakingChange={mockOnSpeakingChange} />);

    await waitFor(() => {
      expect(screen.getByText("I'm Christian's AI agent")).toBeInTheDocument();
    });

    expect(screen.getByText('Ask me about his professional experience!')).toBeInTheDocument();
  });

  it('should disable send button when not connected', async () => {
    render(<Chat onSpeakingChange={mockOnSpeakingChange} />);

    const sendButton = await screen.findByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('should enable send button when connected and input has text', async () => {
    render(<Chat onSpeakingChange={mockOnSpeakingChange} />);

    // Wait for connection
    await waitFor(() => {
      expect(MockWebSocket.instances[0]?.readyState).toBe(WebSocket.OPEN);
    });

    const input = await screen.findByPlaceholderText(/ask me anything/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    // Type in input
    await userEvent.type(input, 'Hello');

    await waitFor(() => {
      expect(sendButton).not.toBeDisabled();
    });
  });


  it('should handle volume changes', async () => {
    render(<Chat onSpeakingChange={mockOnSpeakingChange} />);

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByTitle('Volume')).toBeInTheDocument();
    });

    const volumeButton = screen.getByTitle('Volume');
    expect(volumeButton).toBeInTheDocument();
  });
});

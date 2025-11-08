import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  text: string;
  audioUrl: string;
}

export const chatApi = {
  sendMessage: async (message: string): Promise<ChatResponse> => {
    const response = await axios.post<ChatResponse>(`${API_URL}/api/chat`, {
      message,
    });
    return response.data;
  },
};

export default chatApi;

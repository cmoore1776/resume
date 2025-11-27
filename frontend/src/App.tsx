import { useCallback } from 'react';
import Chat from './components/Chat';
import Resume from './components/Resume';
import './App.css';

function App() {
  // Memoize callback to prevent WebSocket reconnection on every render
  const handleSpeakingChange = useCallback(() => {}, []);

  return (
    <div className="app">
      <div className="resume-section">
        <Resume />
      </div>

      <div className="chat-section">
        <Chat onSpeakingChange={handleSpeakingChange} />
      </div>
    </div>
  );
}

export default App;

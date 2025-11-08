import { useState } from 'react';
import Chat from './components/Chat';
import Resume from './components/Resume';
import './App.css';

function App() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  return (
    <div className="app">
      <div className="resume-section">
        <Resume />
      </div>

      <div className="chat-section">
        <Chat onSpeakingChange={setIsSpeaking} />
      </div>
    </div>
  );
}

export default App;

import Chat from './components/Chat';
import Resume from './components/Resume';
import './App.css';

function App() {
  return (
    <div className="app">
      <div className="resume-section">
        <Resume />
      </div>

      <div className="chat-section">
        <Chat onSpeakingChange={() => {}} />
      </div>
    </div>
  );
}

export default App;

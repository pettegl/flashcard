import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './ui/tokens.css';
import './ui/app.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[flashcard] #root element missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import '@fontsource-variable/sofia-sans-extra-condensed';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/400-italic.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import './styles.css';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado no index.html');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

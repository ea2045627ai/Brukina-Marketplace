import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './management.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Brukina startup failed: #root element was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

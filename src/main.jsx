/**
 * BRUKINA ACCRA HUB - APP NODE ENTRY RUNNER
 * Path: src/main.jsx
 * Bootstraps the central React client architecture layer into the index.html shell div.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Initializes the root virtual DOM engine container mount step cleanly
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

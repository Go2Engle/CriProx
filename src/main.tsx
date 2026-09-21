import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { applyColorTheme, getInitialColorTheme } from './lib/theme';

applyColorTheme(getInitialColorTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

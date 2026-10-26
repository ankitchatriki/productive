import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';
import { StoreProvider } from './state/store';
import { ToastProvider } from './hooks/useToast';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StoreProvider>
  </React.StrictMode>,
);

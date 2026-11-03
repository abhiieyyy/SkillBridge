import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { RealtimeProvider } from './realtime.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <RealtimeProvider>
        <App />
      </RealtimeProvider>
    </AuthProvider>
  </BrowserRouter>
);
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CustomizeView } from './components/views/customize-view/customize-view';
import './globals.css';

const Popup = () => {
  return (
    <div className="w-96 h-96 p-4 font-sans">
      <h1 className="text-xl font-bold mb-4">Portal Chrome Extension</h1>
      <CustomizeView />
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}

/**
 * main.tsx - React 应用入口
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { assetUrl } from './utils/assets';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}
const fontStyleElementId = 'paradice-font-face';
if (!document.getElementById(fontStyleElementId)) {
  const fontStyleElement = document.createElement('style');
  fontStyleElement.id = fontStyleElementId;
  fontStyleElement.textContent = `
@font-face {
  font-family: "Zpix";
  src: url("${assetUrl('assets/font/zpix.ttf')}") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`;
  document.head.appendChild(fontStyleElement);
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

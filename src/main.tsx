/**
 * main.tsx - React 应用入口
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { assetUrl } from './utils/assets';
import { installGlobalButtonSfx } from './utils/buttonSfx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

installGlobalButtonSfx();
/**
 * Font loading strategy: progressive enhancement
 *
 * Phase 1 (immediate): Load GB2312 subset (~270KB WOFF2 / ~2MB TTF fallback)
 *   Covers 99%+ of common Chinese characters including all UI text.
 * Phase 2 (idle): Lazily load full Zpix font (~6.85MB TTF) via FontFace API.
 *   Covers rare characters (e.g. unusual display names) that fall outside GB2312.
 *   Characters outside GB2312 initially render with sans-serif fallback,
 *   then automatically switch to Zpix pixel style once the full font loads.
 */

const fontStyleElementId = 'paradice-font-face';
if (!document.getElementById(fontStyleElementId)) {
  const fontStyleElement = document.createElement('style');
  fontStyleElement.id = fontStyleElementId;
  fontStyleElement.textContent = `
@font-face {
  font-family: "Zpix";
  src: url("${assetUrl('assets/font/zpix-subset.woff2')}") format("woff2"),
       url("${assetUrl('assets/font/zpix-subset.ttf')}") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`;
  document.head.appendChild(fontStyleElement);
}

// Lazy-load full Zpix font during idle time for characters outside GB2312
const fullFontUrl = assetUrl('assets/font/zpix.ttf');
const loadFullFont = () => {
  const fullFont = new FontFace('Zpix', `url("${fullFontUrl}")`, {
    weight: '400',
    style: 'normal',
    display: 'swap',
  });
  fullFont
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
    })
    .catch(() => {
      // Network failure is tolerable — subset font covers most characters
    });
};

if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(loadFullFont);
} else {
  // requestIdleCallback fallback for older browsers
  setTimeout(loadFullFont, 2000);
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import WebApp from './WebApp.tsx';
import './index.css';

const isWebViewport = window.matchMedia('(min-width: 1024px)').matches;
const RootComponent = isWebViewport ? WebApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
);

import './assets/main.css'
import './index.css'
import './assets/games-responsive.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Add type declaration for the custom property
declare global {
  interface Window {
    __restoreConsole?: () => void;
  }
}

// Suppress console logs in production mode - safer approach
if (import.meta.env.PROD) {
  try {
    // Store original methods outside the try block in case something fails
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleDebug = console.debug;
    const originalConsoleInfo = console.info;

    // Create empty noop function that accepts any arguments
    const noop = (..._: any[]) => {};
    
    // Replace methods safely
    console.log = noop;
    console.debug = noop;
    console.info = noop; 
    console.warn = noop;
    
    // Keep error logging
    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);
    };
    
    // Add restore function
    window.__restoreConsole = () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      console.debug = originalConsoleDebug;
      console.info = originalConsoleInfo;
    };
  } catch (e) {
    // If something goes wrong, don't break the app
    console.error("Error setting up console suppression:", e);
  }
}

const app = createApp(App)

app.use(router)

app.mount('#app')

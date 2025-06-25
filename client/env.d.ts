/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API URLs and Server Configuration
  readonly VITE_API_URL: string
  readonly VITE_SERVER_PORT: string
  
  // Twilio TURN Credentials
  readonly VITE_TWILIO_TURN_USERNAME: string
  readonly VITE_TWILIO_TURN_CREDENTIAL: string
  
  // Xirsys TURN Credentials
  readonly VITE_XIRSYS_TURN_USERNAME: string
  readonly VITE_XIRSYS_TURN_CREDENTIAL: string
  
  // Metered TURN Credentials
  readonly VITE_METERED_TURN_USERNAME: string
  readonly VITE_METERED_TURN_CREDENTIAL: string
  readonly VITE_METERED_API_KEY: string
  
  // Environment
  readonly MODE: string
  readonly BASE_URL: string
  readonly PROD: boolean
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 
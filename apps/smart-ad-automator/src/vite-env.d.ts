/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OMNICONNECT_ADS_BRIDGE_CONNECTION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

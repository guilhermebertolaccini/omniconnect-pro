/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** UUID da IntegrationConnection provider `crm` no Omniconnect — emissor bridge autenticado */
  readonly VITE_OMNICONNECT_BRIDGE_CONNECTION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

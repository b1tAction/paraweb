/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NAKAMA_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

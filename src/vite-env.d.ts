/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Present only to show the GitHub sign-in button in the frontend. */
  readonly VITE_GITHUB_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GitHub OAuth App client ID used for the device-flow sign-in. */
  readonly VITE_GITHUB_CLIENT_ID?: string;
  /** Base path that proxies GitHub's device/token endpoints (defaults to "/gh"). */
  readonly VITE_GITHUB_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

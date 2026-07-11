import tls from "node:tls";
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

// Corporate proxies often intercept TLS with their own root CA. Browsers trust
// it via the OS certificate store, but Node ships its own bundle and ignores
// the system store by default — so github.com fails with UNABLE_TO_GET_ISSUER_
// CERT_LOCALLY. Merge the system CAs into Node's defaults so the dev-server
// proxy can validate the intercepted certificate the same way the browser does.
try {
  tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...tls.getCACertificates("system")]);
} catch {
  /* older Node without system-CA APIs — fall back to the bundled store */
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5180,
    // OAuth callbacks are served by Vercel Functions; use `npm run dev:vercel`
    // when testing GitHub sign-in locally.
  },
});

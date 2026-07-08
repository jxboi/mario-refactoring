import tls from "node:tls";
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import {HttpsProxyAgent} from "https-proxy-agent";

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

// When running behind a corporate proxy, Node (and therefore Vite's dev-server
// proxy) does NOT honor the system/HTTPS_PROXY settings the way a browser does.
// Without this, the /gh proxy connects to github.com directly and the network
// resets the connection, which surfaces in the app as "GitHub request failed
// (500).". Route the upstream request through the proxy when one is configured.
const upstreamProxy =
  process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
const proxyAgent = upstreamProxy ? new HttpsProxyAgent(upstreamProxy) : undefined;

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: Number(process.env.PORT) || 5180,
    // GitHub's device-code and token endpoints don't send CORS headers, so the
    // browser can't call them directly. Proxy them through the dev server.
    proxy: {
      "/gh": {
        target: "https://github.com",
        changeOrigin: true,
        agent: proxyAgent,
        rewrite: (path) => path.replace(/^\/gh/, ""),
      },
    },
  },
});

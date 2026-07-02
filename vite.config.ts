import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

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
        rewrite: (path) => path.replace(/^\/gh/, ""),
      },
    },
  },
});

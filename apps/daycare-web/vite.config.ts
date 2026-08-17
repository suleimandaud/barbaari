import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@barbaari/shared": path.resolve(__dirname, "../../packages/shared/src")
      }
    },
    define: {
      "globalThis.__BARBAARI_API_URL__": JSON.stringify(
        env.VITE_API_URL || "https://api-barbaari.pioneeriya.com/api"
      )
    }
  };
});
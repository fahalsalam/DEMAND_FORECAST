import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server runs on 5173; FastAPI on 8000. CORS is handled server-side.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});

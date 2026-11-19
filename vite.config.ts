import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    base: "/simulator-web/",
    plugins: [vue({ template: { transformAssetUrls: false } })],
    server: {
        host: "0.0.0.0",
        port: 5173,
        proxy: {
            '/api/ilab': { target: 'http://127.0.0.1:8787', changeOrigin: false },
        },
        fs: { deny: ['.env*', '*.{crt,pem}', '**/.git/**', '**/src/dev-pic/**', '**/.ilab-data/**'] },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes("scenes.generated.json"))
                        return "wpf-scenes";
                    if (id.includes("workflows.generated.json"))
                        return "wpf-workflows";
                    if (id.endsWith("/T11Exam.json")) return "questions-t11";
                    if (id.endsWith("/T12Exam.json")) return "questions-t12";
                    if (id.includes("/three/")) return "three";
                    if (id.includes("/node_modules/")) return "vendor";
                },
            },
        },
    },
});

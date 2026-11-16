import { defineConfig } from 'vite';
// O build vai para ../ilhas, publicado pelo GitHub Pages em mydecktcg.com.br/ilhas/
export default defineConfig({
  base: './',
  build: { outDir: '../ilhas', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});

import { defineConfig } from 'vite';

export default defineConfig({
  // Ассеты подключаются через `?url`-импорты из config/assets.ts, а не через
  // publicDir: тогда опечатка в пути падает на сборке, а не превращается
  // в 404 в рантайме.
  publicDir: false,
  build: {
    target: 'es2022',
    // GLB уже сжаты по содержимому — инлайнить их в JS смысла нет
    assetsInlineLimit: 0,
  },
});

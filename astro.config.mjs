import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite'; // This is fine if you are using the new Tailwind Vite integration

export default defineConfig({
  output: 'server',
  adapter: vercel({
    entrypointResolution: 'auto'
  }),
  integrations: [react()], // This replaces the need for @vitejs/plugin-react
  vite: {
    ssr: {
      noExternal: ['fast-technical-indicators', 'react-apexcharts', 'apexcharts']
    },
    plugins: [tailwindcss()]
  }
});
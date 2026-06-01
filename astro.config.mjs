import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel'; // Use the main package
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: vercel({
    // Explicitly set this to resolve the warning you saw
    entrypointResolution: 'auto' 
  }),
  integrations: [react()],
  vite: {
    ssr: {
      noExternal: ['fast-technical-indicators']
    },
    plugins: [tailwindcss()]
  }
});
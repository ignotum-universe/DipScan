import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel/serverless'; // Change this line
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: vercel(), // Update this line
  integrations: [react()],
  vite: {
    ssr: {
      noExternal: ['fast-technical-indicators']
    },
    plugins: [tailwindcss()]
  }
});
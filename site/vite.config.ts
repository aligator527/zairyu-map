import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base './' keeps every asset/data URL relative, so the same build works on
// Vercel (served at /) and GitHub Pages (served at /<repo>/).
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: { target: 'es2022' },
});

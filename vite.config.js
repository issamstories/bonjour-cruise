import { defineConfig } from 'vite';
import { resolve } from 'path';

// Multi-page static site: every HTML page must be declared as a rollup input
// so `vite build` emits all of them into dist/.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        experiences: resolve(__dirname, 'experiences.html'),
        privacyPromise: resolve(__dirname, 'privacy-promise.html'),
        book: resolve(__dirname, 'book.html'),
        cruises: resolve(__dirname, 'cruises.html'),
        account: resolve(__dirname, 'account.html'),
        admin: resolve(__dirname, 'admin.html'),
        discover: resolve(__dirname, 'discover.html'),
        welcomeAboard: resolve(__dirname, 'welcome-aboard.html'),
        contact: resolve(__dirname, 'contact.html'),
        privacyPolicy: resolve(__dirname, 'privacy-policy.html'),
        terms: resolve(__dirname, 'terms.html'),
        blog: resolve(__dirname, 'blog.html'),
        blogThingsToDo: resolve(__dirname, 'things-to-do-in-dubai.html'),
        blogBachelorette: resolve(__dirname, 'halal-yacht-party-dubai.html'),
        blogSoloTravel: resolve(__dirname, 'solo-travel-dubai.html'),
      },
    },
  },
});

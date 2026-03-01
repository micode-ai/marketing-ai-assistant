import sharedConfig from '../../packages/config/eslint.config.js';

export default [
  ...sharedConfig,
  {
    languageOptions: {
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'writable',
        sessionStorage: 'writable',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        RequestInit: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        // Node.js globals (SvelteKit server-side)
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
];

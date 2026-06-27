/** @type {import('tailwindcss').Config} */
const iris = {
  50: '#EEF0FF',
  100: '#E0E2FF',
  200: '#C7C8FF',
  300: '#A5A4FF',
  400: '#8A82FB',
  500: '#6E56F0',
  600: '#5B3DE8',
  700: '#4B2FC4',
  800: '#3C2599',
  900: '#2E1B73',
  950: '#1C0F47',
};

export default {
  darkMode: 'class',
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // Brand ramp
        iris,
        // `primary` aliased to the iris ramp during migration so any
        // un-migrated `primary-*` utility still renders on-brand.
        primary: iris,
        // Semantic tokens (flip per theme via CSS vars in app.css)
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--text) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
          subtle: 'rgb(var(--text-subtle) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          fg: 'rgb(var(--brand-fg) / <alpha-value>)',
          subtle: 'rgb(var(--brand-subtle) / <alpha-value>)',
          'subtle-fg': 'rgb(var(--brand-subtle-fg) / <alpha-value>)',
        },
        ring: 'rgb(var(--ring) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        bad: 'rgb(var(--bad) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--brand) / 0.12), 0 18px 50px -22px rgb(var(--brand) / 0.5)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};

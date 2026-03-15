/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f5f7f4',
        surface: '#ffffff',
        border: '#d8dfd7',
        'text-primary': '#18211b',
        'text-muted': '#5a665d',
        up: '#167f42',
        down: '#be3b3b',
        neutral: '#617066',
        accent: '#0f6d74',
      },
      boxShadow: {
        panel: '0 12px 32px rgba(24, 33, 27, 0.07)',
      },
    },
  },
  plugins: [],
}

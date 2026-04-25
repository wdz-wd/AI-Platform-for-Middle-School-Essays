/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111827',
        paper: '#f4f7fb',
        accent: '#2563eb',
      },
      boxShadow: {
        panel: '0 12px 30px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
}

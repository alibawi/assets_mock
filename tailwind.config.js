/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1F2A44', 600: '#2B3A5C', 50: '#EEF1F7' },
        page: '#F6F7F9',
        line: '#E5E7EB',
      },
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', 'Tajawal', 'system-ui', 'sans-serif'] },
      fontSize: { xs: ['12px', '16px'], sm: ['13px', '18px'] },
    },
  },
  plugins: [],
}

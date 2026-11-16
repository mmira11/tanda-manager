export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        cream: '#FBF8F3',
        // Slightly deeper than the mockup swatches so white and cream text clears WCAG AA.
        teal: '#127A74',
        coral: '#F4795B',
        coralink: '#C44832',
        ink: '#0E1113',
        panel: '#161A1D',
        mint: '#2DD4BF',
        amberwarm: '#F5B942',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

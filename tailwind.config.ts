import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        meta: {
          blue: '#008BCE',
          'electric-blue': '#99F0FA',
          'true-blue': '#006AC6',
          'rich-blue': '#004C97',
          'deep-blue': '#002E5D',
        },
        green: {
          lush: '#00BB7E',
          light: '#B9EFA3',
          eco: '#009775',
          rich: '#00664F',
        },
        brand: {
          black: '#161F28',
          white: '#FFFFFF',
          'grey-1': '#B9BCBF',
          'grey-2': '#DCDDDF',
          'grey-3': '#F3F4F4',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config

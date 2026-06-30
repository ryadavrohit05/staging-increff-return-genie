/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ported from the reference dashboard palette (styles.css :root).
        primary: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          light: 'rgba(79, 70, 229, 0.12)',
          glow: 'rgba(79, 70, 229, 0.35)',
        },
        success: {
          DEFAULT: '#10B981',
          light: 'rgba(16, 185, 129, 0.12)',
        },
        danger: {
          DEFAULT: '#EF4444',
          light: 'rgba(239, 68, 68, 0.12)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: 'rgba(245, 158, 11, 0.12)',
        },
        cyan: {
          DEFAULT: '#06B6D4',
          light: 'rgba(6, 182, 212, 0.12)',
        },
        ink: {
          primary: '#1e293b',
          secondary: '#64748b',
          muted: '#94a3b8',
        },
        terminal: {
          bg: '#0d1117',
          panel: '#161b22',
          border: '#21262d',
          info: '#8b949e',
          myntra: '#79c0ff',
          n8n: '#e3b341',
          ok: '#56d364',
          err: '#f85149',
          sys: '#7ee787',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '14px',
        lg: '20px',
        xl: '28px',
      },
      boxShadow: {
        sm: '0 2px 8px rgba(0,0,0,0.06)',
        md: '0 8px 24px rgba(0,0,0,0.08)',
        lg: '0 20px 48px rgba(0,0,0,0.10)',
        glow: '0 0 0 4px rgba(79, 70, 229, 0.35)',
      },
      keyframes: {
        gradientShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        dotPulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.7)' },
        },
        shimmerProgress: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(32px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '60%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        gradient: 'gradientShift 18s ease infinite',
        dotPulse: 'dotPulse 1.4s ease-in-out infinite',
        shimmer: 'shimmerProgress 2s linear infinite',
        slideUp: 'slideUp 0.45s cubic-bezier(0.175,0.885,0.32,1.275) forwards',
        fadeIn: 'fadeIn 0.4s ease forwards',
        bounceIn: 'bounceIn 0.7s cubic-bezier(0.175,0.885,0.32,1.275)',
        spin: 'spin 1s linear infinite',
      },
    },
  },
  plugins: [],
};

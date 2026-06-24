import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
          active: 'var(--bg-active)',
        },
        accent: {
          500: 'var(--accent-500)',
          600: 'var(--accent-600)',
        },
        // Alias: primary-* maps to accent tokens so existing consumers don't break.
        // Will be removed in Task 26 once all components are migrated.
        primary: {
          400: 'var(--accent-500)',
          500: 'var(--accent-500)',
          600: 'var(--accent-600)',
          700: 'var(--accent-600)',
          800: 'var(--accent-600)',
        },
        window: 'var(--window)',
        vibrancy: 'var(--vibrancy-bg)',
        separator: 'var(--separator)',
        bubble: {
          them: 'var(--bubble-them)',
        },
        stage: {
          s0: 'var(--stage-s0)',
          s1: 'var(--stage-s1)',
          s2: 'var(--stage-s2)',
          s3: 'var(--stage-s3)',
          s4: 'var(--stage-s4)',
          s5: 'var(--stage-s5)',
          s6: 'var(--stage-s6)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          hover: 'var(--border-hover)',
          active: 'var(--border-active)',
        },
        glass: {
          bg: 'var(--glass-bg)',
          border: 'var(--glass-border)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        info: 'var(--info)',
        ai: {
          on: 'var(--ai-on)',
          paused: 'var(--ai-paused)',
          off: 'var(--ai-off)',
          thinking: 'var(--ai-thinking)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        xs: 'var(--text-xs)',
        sm: 'var(--text-sm)',
        base: 'var(--text-base)',
        md: 'var(--text-md)',
        lg: 'var(--text-lg)',
        xl: 'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
      },
      borderRadius: {
        badge: 'var(--radius-badge)',
        input: 'var(--radius-input)',
        card: 'var(--radius-card)',
        modal: 'var(--radius-modal)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
        control: 'var(--radius-control)',
        'list-item': 'var(--radius-list-item)',
        panel: 'var(--radius-panel)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        elevated: 'var(--shadow-elevated)',
        control: 'var(--shadow-control)',
        panel: 'var(--shadow-panel)',
      },
      backdropBlur: {
        glass: 'var(--glass-blur)',
        'glass-heavy': 'var(--glass-blur-heavy)',
      },
      transitionTimingFunction: {
        'out-expo': 'var(--ease-out-expo)',
        'out-back': 'var(--ease-out-back)',
        spring: 'var(--ease-spring)',
        'in-out-smooth': 'var(--ease-in-out-smooth)',
      },
      transitionDuration: {
        instant: 'var(--duration-instant)',
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
        smooth: 'var(--duration-smooth)',
        slow: 'var(--duration-slow)',
        dramatic: 'var(--duration-dramatic)',
      },
      zIndex: {
        base: 'var(--z-base)',
        sidebar: 'var(--z-sidebar)',
        topbar: 'var(--z-topbar)',
        detail: 'var(--z-detail)',
        dropdown: 'var(--z-dropdown)',
        'modal-overlay': 'var(--z-modal-overlay)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
        'command-palette': 'var(--z-command-palette)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-in-right': 'slideInRight 200ms ease-out',
        'slide-out-right': 'slideOutRight 200ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'spin-slow': 'spin 1s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideOutRight: {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

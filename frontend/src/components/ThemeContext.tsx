import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeType = 'monochrome' | 'cyberpunk' | 'nebula' | 'amber';

interface Theme {
  name: string;
  variables: { [key: string]: string };
}

const themes: Record<ThemeType, Theme> = {
  monochrome: {
    name: 'Monochrome Silver',
    variables: {
      '--bg-main': '#000000',
      '--bg-gradient': 'linear-gradient(180deg, #000000 0%, #080808 100%)',
      '--bg-panel': '#0a0a0a',
      '--bg-panel-solid': '#0d0d0d',
      '--bg-panel-hover': '#171717',
      '--bg-input': '#020202',
      '--color-primary': '#ffffff',
      '--color-primary-glow': 'rgba(255, 255, 255, 0.15)',
      '--color-secondary': '#a3a3a3',
      '--color-secondary-glow': 'rgba(163, 163, 163, 0.1)',
      '--color-accent': '#ffffff',
      '--color-accent-glow': 'rgba(255, 255, 255, 0.15)',
      '--color-success': '#ffffff',
      '--color-warning': '#a3a3a3',
      '--color-text-primary': '#ffffff',
      '--color-text-secondary': '#a3a3a3',
      '--color-text-muted': '#525252',
      '--border-color': '#262626',
      '--border-glow': 'rgba(255, 255, 255, 0.08)',
      '--glass-shadow': '0 4px 24px rgba(0, 0, 0, 0.95)'
    }
  },
  cyberpunk: {
    name: 'Cyberpunk Poison',
    variables: {
      '--bg-main': '#000502',
      '--bg-gradient': 'radial-gradient(circle, #001205 0%, #000201 100%)',
      '--bg-panel': '#000e04',
      '--bg-panel-solid': '#001807',
      '--bg-panel-hover': '#00290c',
      '--bg-input': '#000401',
      '--color-primary': '#00ff66',
      '--color-primary-glow': 'rgba(0, 255, 102, 0.25)',
      '--color-secondary': '#00993d',
      '--color-secondary-glow': 'rgba(0, 153, 61, 0.15)',
      '--color-accent': '#ff0055',
      '--color-accent-glow': 'rgba(255, 0, 85, 0.25)',
      '--color-success': '#00ff66',
      '--color-warning': '#ffb700',
      '--color-text-primary': '#00ff66',
      '--color-text-secondary': '#00b347',
      '--color-text-muted': '#004d1f',
      '--border-color': '#003314',
      '--border-glow': 'rgba(0, 255, 102, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(0, 255, 102, 0.08)'
    }
  },
  nebula: {
    name: 'Deep Space Nebula',
    variables: {
      '--bg-main': '#020108',
      '--bg-gradient': 'radial-gradient(circle, #0d0624 0%, #020108 100%)',
      '--bg-panel': 'rgba(17, 12, 34, 0.55)',
      '--bg-panel-solid': '#120d29',
      '--bg-panel-hover': '#1e1545',
      '--bg-input': '#06040e',
      '--color-primary': '#bd93f9',
      '--color-primary-glow': 'rgba(189, 147, 249, 0.3)',
      '--color-secondary': '#ff79c6',
      '--color-secondary-glow': 'rgba(255, 121, 198, 0.2)',
      '--color-accent': '#8be9fd',
      '--color-accent-glow': 'rgba(139, 233, 253, 0.3)',
      '--color-success': '#50fa7b',
      '--color-warning': '#ffb86c',
      '--color-text-primary': '#f8f8f2',
      '--color-text-secondary': '#bd93f9',
      '--color-text-muted': '#6272a4',
      '--border-color': '#33236e',
      '--border-glow': 'rgba(189, 147, 249, 0.18)',
      '--glass-shadow': '0 8px 32px rgba(0, 0, 0, 0.7)'
    }
  },
  amber: {
    name: 'Phosphor Amber',
    variables: {
      '--bg-main': '#060300',
      '--bg-gradient': 'linear-gradient(180deg, #060300 0%, #140c00 100%)',
      '--bg-panel': '#140c00',
      '--bg-panel-solid': '#1b1100',
      '--bg-panel-hover': '#2e1c00',
      '--bg-input': '#060300',
      '--color-primary': '#ffb000',
      '--color-primary-glow': 'rgba(255, 176, 0, 0.25)',
      '--color-secondary': '#cc8d00',
      '--color-secondary-glow': 'rgba(204, 141, 0, 0.15)',
      '--color-accent': '#ff3c00',
      '--color-accent-glow': 'rgba(255, 60, 0, 0.25)',
      '--color-success': '#ffb000',
      '--color-warning': '#ff5500',
      '--color-text-primary': '#ffb000',
      '--color-text-secondary': '#d89600',
      '--color-text-muted': '#805900',
      '--border-color': '#4d3500',
      '--border-glow': 'rgba(255, 176, 0, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(255, 176, 0, 0.05)'
    }
  }
};

interface ThemeContextProps {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  themeName: string;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>(() => {
    return (localStorage.getItem('xtassy_theme') as ThemeType) || 'monochrome';
  });

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    localStorage.setItem('xtassy_theme', newTheme);
  };

  useEffect(() => {
    const activeTheme = themes[theme] || themes.monochrome;
    const root = document.documentElement;
    
    // Dynamically apply variables
    Object.entries(activeTheme.variables).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeName: themes[theme]?.name || 'Monochrome Silver' }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

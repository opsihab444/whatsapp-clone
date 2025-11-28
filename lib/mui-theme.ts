'use client';

import { createTheme, ThemeOptions } from '@mui/material/styles';

// WhatsApp-inspired color palette
const lightPalette: ThemeOptions['palette'] = {
  mode: 'light',
  primary: {
    main: '#00a884',
    light: '#06cf9c',
    dark: '#008f72',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#f0f2f5',
    light: '#ffffff',
    dark: '#e4e6eb',
    contrastText: '#1c1e21',
  },
  background: {
    default: '#ffffff',
    paper: '#f0f2f5',
  },
  text: {
    primary: '#111b21',
    secondary: '#667781',
  },
  error: {
    main: '#ea0038',
  },
  success: {
    main: '#25d366',
  },
  divider: '#e9edef',
};

const darkPalette: ThemeOptions['palette'] = {
  mode: 'dark',
  primary: {
    main: '#00a884',
    light: '#06cf9c',
    dark: '#008f72',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#202c33',
    light: '#2a3942',
    dark: '#111b21',
    contrastText: '#e9edef',
  },
  background: {
    default: '#0b141a',
    paper: '#111b21',
  },
  text: {
    primary: '#e9edef',
    secondary: '#8696a0',
  },
  error: {
    main: '#ea0038',
  },
  success: {
    main: '#25d366',
  },
  divider: '#222d34',
};

const getDesignTokens = (mode: 'light' | 'dark'): ThemeOptions => ({
  palette: mode === 'light' ? lightPalette : darkPalette,
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: { fontWeight: 600, letterSpacing: '-0.025em' },
    h2: { fontWeight: 600, letterSpacing: '-0.025em' },
    h3: { fontWeight: 600, letterSpacing: '-0.025em' },
    h4: { fontWeight: 600, letterSpacing: '-0.025em' },
    h5: { fontWeight: 600, letterSpacing: '-0.025em' },
    h6: { fontWeight: 600, letterSpacing: '-0.025em' },
    body1: { fontSize: '0.9375rem', lineHeight: 1.5 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          padding: '8px 16px',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'all 0.2s ease',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          transition: 'transform 0.2s ease',
          '&:hover': {
            transform: 'scale(1.05)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          margin: '2px 8px',
          '&.Mui-selected': {
            backgroundColor: mode === 'dark' ? 'rgba(0, 168, 132, 0.15)' : 'rgba(0, 168, 132, 0.1)',
          },
        },
      },
    },
  },
});

export const createAppTheme = (mode: 'light' | 'dark') => createTheme(getDesignTokens(mode));

export { lightPalette, darkPalette };

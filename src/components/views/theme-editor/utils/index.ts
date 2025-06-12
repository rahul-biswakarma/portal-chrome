import type { HSLColor, ThemeConfig, ConfigValidation } from '../types';

// Color conversion utilities
export const hexToHsl = (hex: string): HSLColor | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

export const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
};

// Validation utilities
export const isValidHexColor = (hex: string): boolean => {
  return /^#([0-9A-F]{3}){1,2}$/i.test(hex);
};

export const isValidFont = (fontName: string): boolean => {
  return fontName.trim().length > 0 && fontName.length <= 50;
};

export const validateThemeConfig = (config: Partial<ThemeConfig>): ConfigValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate fonts
  if (config.fonts) {
    if (!isValidFont(config.fonts.heading)) {
      errors.push('Invalid heading font name');
    }
    if (!isValidFont(config.fonts.paragraph)) {
      errors.push('Invalid paragraph font name');
    }
  }

  // Validate colors
  if (config.colors) {
    if (!isValidHexColor(config.colors.accent)) {
      errors.push('Invalid accent color format');
    }
    if (!isValidHexColor(config.colors.accentLabel)) {
      errors.push('Invalid accent label color format');
    }
    if (!isValidHexColor(config.colors.neutral)) {
      errors.push('Invalid neutral color format');
    }

    // Check color contrast warnings
    if (config.colors.accent && config.colors.accentLabel) {
      const accentHsl = hexToHsl(config.colors.accent);
      const labelHsl = hexToHsl(config.colors.accentLabel);
      if (accentHsl && labelHsl) {
        const contrast = Math.abs(accentHsl.l - labelHsl.l);
        if (contrast < 40) {
          warnings.push('Low contrast between accent and accent label colors');
        }
      }
    }
  }

  // Validate layout
  if (config.layout) {
    if (config.layout.spacingUnit < 0 || config.layout.spacingUnit > 2) {
      errors.push('Spacing unit must be between 0 and 2rem');
    }
    if (config.layout.radiusUnit < 0 || config.layout.radiusUnit > 1) {
      errors.push('Radius unit must be between 0 and 1rem');
    }
    if (config.layout.borderWidthUnit < 0 || config.layout.borderWidthUnit > 0.5) {
      errors.push('Border width unit must be between 0 and 0.5rem');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

// Font utilities
export const getGoogleFontUrl = (fontName: string): string => {
  const encodedName = fontName.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${encodedName}:wght@400;500;700&display=swap`;
};

export const getUniqueFonts = (config: ThemeConfig): string[] => {
  const fonts = new Set<string>();
  if (config.fonts.heading) fonts.add(config.fonts.heading);
  if (config.fonts.paragraph) fonts.add(config.fonts.paragraph);
  return Array.from(fonts);
};

// Default configurations
export const getDefaultThemeConfig = (): ThemeConfig => ({
  fonts: {
    heading: 'Inter',
    paragraph: 'Inter',
  },
  colors: {
    accent: hslToHex(237, 81, 56),
    accentLabel: hslToHex(0, 0, 100),
    neutral: hslToHex(228, 10, 97),
  },
  layout: {
    spacingUnit: 0.25,
    radiusUnit: 0.0625,
    borderWidthUnit: 0.0625,
  },
});

// Configuration merging
export const mergeThemeConfig = (
  base: ThemeConfig,
  updates: Partial<ThemeConfig>
): ThemeConfig => ({
  fonts: { ...base.fonts, ...updates.fonts },
  colors: { ...base.colors, ...updates.colors },
  layout: { ...base.layout, ...updates.layout },
});

// CSS utilities
export const formatCSSVariable = (name: string, value: string | number): string => {
  return `--${name}: ${value};`;
};

export const generateCSSVariables = (config: ThemeConfig): Record<string, string | number> => {
  const accentHsl = hexToHsl(config.colors.accent) || { h: 237, s: 81, l: 56 };
  const accentLabelHsl = hexToHsl(config.colors.accentLabel) || { h: 0, s: 0, l: 100 };
  const neutralHsl = hexToHsl(config.colors.neutral) || { h: 228, s: 10, l: 97 };

  return {
    // Theme colors
    'primary': `oklch(${accentHsl.l}% ${accentHsl.s / 100} ${accentHsl.h})`,
    'primary-foreground': `oklch(${accentLabelHsl.l}% ${accentLabelHsl.s / 100} ${accentLabelHsl.h})`,
    'background': `hsl(${neutralHsl.h}, ${neutralHsl.s}%, ${neutralHsl.l}%)`,
    'foreground': `oklch(${accentLabelHsl.l}% ${accentLabelHsl.s / 100} ${accentLabelHsl.h})`,
    'card': `hsl(${neutralHsl.h}, ${neutralHsl.s}%, ${neutralHsl.l}%)`,
    'card-foreground': `oklch(${accentLabelHsl.l}% ${accentLabelHsl.s / 100} ${accentLabelHsl.h})`,
    'accent': `oklch(${accentHsl.l}% ${accentHsl.s / 100} ${accentHsl.h})`,
    'accent-foreground': `oklch(${accentLabelHsl.l}% ${accentLabelHsl.s / 100} ${accentLabelHsl.h})`,

    // Legacy HSL variables for compatibility
    'accent-h': accentHsl.h,
    'accent-s': `${accentHsl.s}%`,
    'accent-l': `${accentHsl.l}%`,
    'accent-label-h': accentLabelHsl.h,
    'accent-label-s': `${accentLabelHsl.s}%`,
    'accent-label-l': `${accentLabelHsl.l}%`,
    'neutral-h': neutralHsl.h,
    'neutral-s': `${neutralHsl.s}%`,
    'neutral-l': `${neutralHsl.l}%`,
    'surface-h': neutralHsl.h,
    'surface-s': `${neutralHsl.s}%`,
    'surface-l': `${neutralHsl.l}%`,

    // Status colors
    'alert-h': 360,
    'alert-s': '72%',
    'alert-l': '52%',
    'warning-h': 47,
    'warning-s': '74%',
    'warning-l': '55%',
    'success-h': 135,
    'success-s': '55%',
    'success-l': '55%',
    'smart-h': 256,
    'smart-s': '94%',
    'smart-l': '63%',

    // Layout variables
    'spacing-unit': `${config.layout.spacingUnit}rem`,
    'radius-unit': `${config.layout.radiusUnit}rem`,
    'border-width-unit': `${config.layout.borderWidthUnit}rem`,
    'radius': `${config.layout.radiusUnit}rem`,
  };
};

// Debounce utility for frequent updates
export const debounce = <T extends unknown[]>(
  func: (...args: T) => void,
  wait: number
): ((...args: T) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: T) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}; 
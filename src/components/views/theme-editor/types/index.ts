// Theme Configuration Types
export interface ThemeConfig {
  fonts: FontConfig;
  colors: ColorConfig;
  layout: LayoutConfig;
}

export interface FontConfig {
  heading: string;
  paragraph: string;
}

export interface ColorConfig {
  accent: string;
  accentLabel: string;
  neutral: string;
}

export interface LayoutConfig {
  spacingUnit: number;
  radiusUnit: number;
  borderWidthUnit: number;
}

// Color conversion types
export interface HSLColor {
  h: number;
  s: number;
  l: number;
}

// Theme suggestions
export interface ThemeSuggestion {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  config: ThemeConfig;
  preview: {
    backgroundColor: string;
    accentColor: string;
    textColor: string;
  };
}

export type ThemeCategory = 'modern' | 'classic' | 'minimalist' | 'corporate' | 'creative';

// Component Props
export interface ThemeEditorProps {
  initialConfig?: Partial<ThemeConfig>;
  onConfigChange?: (config: ThemeConfig) => void;
}

export interface ColorSettingsProps {
  colors: ColorConfig;
  onColorsChange: (colors: ColorConfig) => void;
}

export interface FontSettingsProps {
  fonts: FontConfig;
  onFontsChange: (fonts: FontConfig) => void;
}

export interface LayoutSettingsProps {
  layout: LayoutConfig;
  onLayoutChange: (layout: LayoutConfig) => void;
}

export interface ThemeSuggestionsProps {
  suggestions: ThemeSuggestion[];
  currentConfig: ThemeConfig;
  onApplyTheme: (suggestion: ThemeSuggestion) => void;
}

// CSS Generation
export interface CSSGenerationOptions {
  includePortalSpecific: boolean;
  includeFontImports: boolean;
  useModernColorFormat: boolean;
}

// Service interfaces
export interface ThemeService {
  generateCSS(config: ThemeConfig, options?: CSSGenerationOptions): string;
  validateConfig(config: Partial<ThemeConfig>): ConfigValidation;
  getDefaultConfig(): ThemeConfig;
}

export interface ConfigValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Events
export interface ThemeChangeEvent {
  type: 'font' | 'color' | 'layout' | 'complete';
  config: ThemeConfig;
  timestamp: number;
}

export type ThemeEventHandler = (event: ThemeChangeEvent) => void;

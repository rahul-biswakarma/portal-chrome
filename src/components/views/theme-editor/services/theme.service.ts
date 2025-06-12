import type { 
  ThemeConfig, 
  ThemeService, 
  CSSGenerationOptions,
  ConfigValidation 
} from '../types';
import { 
  getDefaultThemeConfig,
  validateThemeConfig,
  getUniqueFonts,
  getGoogleFontUrl,
  generateCSSVariables
} from '../utils';

export class ThemeServiceImpl implements ThemeService {
  
  generateCSS(config: ThemeConfig, options: CSSGenerationOptions = this.getDefaultOptions()): string {
    const variables = generateCSSVariables(config);
    const fontImports = this.generateFontImports(config, options);
    const customStyles = this.generateCustomStyles(config);
    const portalStyles = this.generatePortalStyles(config, options);
    const typographyStyles = this.generateTypographyStyles(config);

    return [
      fontImports,
      this.generateRootVariables(variables),
      customStyles,
      typographyStyles,
      portalStyles
    ].filter(Boolean).join('\n\n');
  }

  validateConfig(config: Partial<ThemeConfig>): ConfigValidation {
    return validateThemeConfig(config);
  }

  getDefaultConfig(): ThemeConfig {
    return getDefaultThemeConfig();
  }

  private getDefaultOptions(): CSSGenerationOptions {
    return {
      includePortalSpecific: true,
      includeFontImports: true,
      useModernColorFormat: true,
    };
  }

  private generateFontImports(config: ThemeConfig, options: CSSGenerationOptions): string {
    if (!options.includeFontImports) return '';

    const uniqueFonts = getUniqueFonts(config);
    if (uniqueFonts.length === 0) return '';

    const imports = uniqueFonts
      .map(font => `@import url('${getGoogleFontUrl(font)}');`)
      .join('\n');

    return imports;
  }

  private generateRootVariables(variables: Record<string, string | number>): string {
    const variableDeclarations = Object.entries(variables)
      .map(([key, value]) => `  --${key}: ${value};`)
      .join('\n');

    return `:root {\n${variableDeclarations}\n}`;
  }

  private generateTypographyStyles(config: ThemeConfig): string {
    return `
/* Typography Styles */
h1, h2, h3, h4, h5, h6 {
  font-family: '${config.fonts.heading}', system-ui, -apple-system, sans-serif;
}

p, body, .text-default {
  font-family: '${config.fonts.paragraph}', system-ui, -apple-system, sans-serif;
}

/* Typography Scale */
h1 {
  font-size: var(--fontSize-h1, 1.75rem);
  line-height: var(--lineHeight-h1, 2.25rem);
  font-weight: var(--fontWeight-h1-medium, 500);
}

h2 {
  font-size: var(--fontSize-h2, 1.5rem);
  line-height: var(--lineHeight-h2, 2rem);
  font-weight: var(--fontWeight-h2-medium, 500);
}

h3 {
  font-size: var(--fontSize-h3, 1.25rem);
  line-height: var(--lineHeight-h3, 1.75rem);
  font-weight: var(--fontWeight-h3-medium, 500);
}

h4 {
  font-size: var(--fontSize-h4, 1.125rem);
  line-height: var(--lineHeight-h4, 1.5rem);
  font-weight: var(--fontWeight-h4-medium, 500);
}

h5 {
  font-size: var(--fontSize-h5, 1rem);
  line-height: var(--lineHeight-h5, 1.375rem);
  font-weight: var(--fontWeight-h5-medium, 500);
}

h6 {
  font-size: var(--fontSize-h6, 0.875rem);
  line-height: var(--lineHeight-h6, 1.25rem);
  font-weight: var(--fontWeight-h6-medium, 500);
}`.trim();
  }

  private generateCustomStyles(config: ThemeConfig): string {
    return `
/* Typography Size Variables */
:root {
  --fontSize-h1: 1.75rem;
  --lineHeight-h1: 2.25rem;
  --fontWeight-h1-medium: 500;

  --fontSize-h2: 1.5rem;
  --lineHeight-h2: 2rem;
  --fontWeight-h2-medium: 500;

  --fontSize-h3: 1.25rem;
  --lineHeight-h3: 1.75rem;
  --fontWeight-h3-medium: 500;

  --fontSize-h4: 1.125rem;
  --lineHeight-h4: 1.5rem;
  --fontWeight-h4-medium: 500;

  --fontSize-h5: 1rem;
  --lineHeight-h5: 1.375rem;
  --fontWeight-h5-medium: 500;

  --fontSize-h6: 0.875rem;
  --lineHeight-h6: 1.25rem;
  --fontWeight-h6-medium: 500;

  --fontSize-large: 1rem;
  --lineHeight-large: 1.375rem;
  --fontWeight-large-regular: 400;

  --fontSize-default: 0.875rem;
  --lineHeight-default: 1.125rem;
  --fontWeight-default-regular: 400;
  --fontWeight-default-medium: 500;

  --fontSize-small: 0.75rem;
  --lineHeight-small: 1.125rem;
  --fontWeight-small-regular: 400;
  --fontWeight-small-medium: 500;

  --fontSize-mini: 0.6875rem;
  --lineHeight-mini: 1rem;
  --fontWeight-mini-regular: 400;
  --fontWeight-mini-medium: 500;
}`.trim();
  }

  private generatePortalStyles(config: ThemeConfig, options: CSSGenerationOptions): string {
    if (!options.includePortalSpecific) return '';

    const neutralHsl = `hsl(var(--neutral-h), var(--neutral-s), var(--neutral-l))`;

    return `
/* Portal-specific Component Styles */
.portal-common-header,
.portal-home-page__container,
.portal-common-footer {
  background-color: ${neutralHsl} !important;
}

/* Additional portal component theming */
.portal-button-primary {
  background-color: var(--accent);
  color: var(--accent-foreground);
}

.portal-card {
  background-color: var(--card);
  color: var(--card-foreground);
}`.trim();
  }

  // Export and import utilities
  exportConfig(config: ThemeConfig): string {
    return JSON.stringify(config, null, 2);
  }

  importConfig(configJson: string): ThemeConfig | null {
    try {
      const parsed = JSON.parse(configJson);
      const validation = this.validateConfig(parsed);
      
      if (!validation.isValid) {
        console.warn('Invalid theme configuration:', validation.errors);
        return null;
      }

      return parsed as ThemeConfig;
    } catch (error) {
      console.error('Failed to parse theme configuration:', error);
      return null;
    }
  }

  // Generate CSS for specific sections
  generateFontCSS(config: ThemeConfig): string {
    return [
      this.generateFontImports(config, { includeFontImports: true, includePortalSpecific: false, useModernColorFormat: true }),
      this.generateTypographyStyles(config)
    ].filter(Boolean).join('\n\n');
  }

  generateColorCSS(config: ThemeConfig): string {
    const variables = generateCSSVariables(config);
    const colorVariables = Object.entries(variables)
      .filter(([key]) => key.includes('color') || key.includes('accent') || key.includes('neutral') || key.includes('primary') || key.includes('background'))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    
    return this.generateRootVariables(colorVariables);
  }

  generateLayoutCSS(config: ThemeConfig): string {
    const variables = generateCSSVariables(config);
    const layoutVariables = Object.entries(variables)
      .filter(([key]) => key.includes('spacing') || key.includes('radius') || key.includes('border'))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    
    return this.generateRootVariables(layoutVariables);
  }
}

// Export singleton instance
export const themeService = new ThemeServiceImpl(); 
import type { UserPreferences, CSSGenerationOptions, DetectedElement } from '../types';
import { getActiveTab } from '@/utils/chrome-utils';

export class CSSGenerationService {
  async generateCSS(
    preferences: UserPreferences,
    elements: DetectedElement[],
    options: CSSGenerationOptions = {
      minify: false,
      addComments: true,
      useImportant: false,
      respectExistingStyles: true,
    }
  ): Promise<string> {
    console.log('🎨 Starting CSS generation with preferences:', preferences);
    console.log(
      '🎨 Elements available:',
      elements.map(el => ({ id: el.id, prefCount: el.availablePreferences.length }))
    );

    const cssRules: string[] = [];

    if (options.addComments) {
      cssRules.push('/* Generated by Visual Customizer - LLM-based CSS */');
      cssRules.push(`/* Generated at: ${new Date().toISOString()} */`);
      cssRules.push('/* This CSS will be auto-removed on re-analysis */');
    }

    for (const element of elements) {
      const elementPreferences = preferences[element.id];
      if (!elementPreferences) {
        console.log(`⚠️ No preferences found for element ${element.id}`);
        continue;
      }

      console.log(`🔧 Processing element ${element.id} with preferences:`, elementPreferences);
      const elementCSS = this.generateElementCSSFromLLM(element, elementPreferences, options);
      if (elementCSS) {
        cssRules.push(elementCSS);
        console.log(`✅ Generated CSS for ${element.id}:`, elementCSS);
      } else {
        console.log(`⚠️ No CSS generated for element ${element.id}`);
      }
    }

    const css = cssRules.join('\n\n');
    console.log('🎨 Final generated CSS length:', css.length);
    console.log('🎨 Final CSS preview (first 500 chars):', css.slice(0, 500));
    return options.minify ? this.minifyCSS(css) : css;
  }

  // New method to update individual preference CSS
  async updatePreferenceCSS(
    elementId: string,
    preferenceId: string,
    userValue: unknown,
    element: DetectedElement,
    currentCSSContent: string
  ): Promise<string> {
    const preference = element.availablePreferences.find(p => p.id === preferenceId);
    if (!preference || !preference.metadata) {
      console.warn(`Preference not found or missing metadata: ${elementId}:${preferenceId}`);
      return currentCSSContent;
    }

    // Create unique identifier for this preference
    const prefId = `${elementId}:${preferenceId}`;
    const startComment = `/* PREF:${prefId}:START */`;
    const endComment = `/* PREF:${prefId}:END */`;

    // Check if this preference already exists in the CSS
    const startIndex = currentCSSContent.indexOf(startComment);
    const endIndex = currentCSSContent.indexOf(endComment);

    // If user value equals default value, remove the CSS block entirely
    const defaultValue = preference.currentValue;

    // Debug: Show exact comparison values and types
    console.log(`🔍 CSS Update for ${prefId}:`);
    console.log('  userValue:', userValue, '(type:', typeof userValue, ')');
    console.log('  defaultValue:', defaultValue, '(type:', typeof defaultValue, ')');
    console.log('  are equal?', userValue === defaultValue);
    console.log('  existing CSS block found?', startIndex !== -1 && endIndex !== -1);

    if (userValue === defaultValue) {
      if (startIndex !== -1 && endIndex !== -1) {
        // Remove existing CSS block - return to default styling
        console.log(`✅ Removing CSS block for ${prefId} (returned to default:`, defaultValue, ')');
        const beforeCSS = currentCSSContent.substring(0, startIndex);
        const afterCSS = currentCSSContent.substring(endIndex + endComment.length);
        return `${beforeCSS}${afterCSS}`.replace(/\n\n\n+/g, '\n\n').trim();
      }
      // No existing block and user is at default - nothing to do
      console.log(`✅ No CSS needed for ${prefId} (already at default:`, defaultValue, ')');
      return currentCSSContent;
    }

    // Generate CSS for non-default value
    const css = this.generateCSSForPreference(preference, userValue, {
      minify: false,
      addComments: false,
      useImportant: false,
      respectExistingStyles: true,
    });

    console.log(`📝 Generated CSS for ${prefId}:`, css.trim());

    if (!css.trim()) {
      console.warn(`⚠️ No CSS generated for ${prefId}, treating as default`);
      // If no CSS generated, treat as default and remove block
      if (startIndex !== -1 && endIndex !== -1) {
        const beforeCSS = currentCSSContent.substring(0, startIndex);
        const afterCSS = currentCSSContent.substring(endIndex + endComment.length);
        return `${beforeCSS}${afterCSS}`.replace(/\n\n\n+/g, '\n\n').trim();
      }
      return currentCSSContent;
    }

    if (startIndex !== -1 && endIndex !== -1) {
      // Replace existing preference CSS
      console.log(`🔄 Updating existing CSS block for ${prefId}`);
      const beforeCSS = currentCSSContent.substring(0, startIndex);
      const afterCSS = currentCSSContent.substring(endIndex + endComment.length);
      return `${beforeCSS}${startComment}\n${css}\n${endComment}${afterCSS}`;
    } else {
      // Add new preference CSS
      console.log(`➕ Adding new CSS block for ${prefId}`);
      const newSection = `\n\n${startComment}\n${css}\n${endComment}`;
      return currentCSSContent + newSection;
    }
  }

  private generateElementCSSFromLLM(
    element: DetectedElement,
    preferences: Record<string, unknown>,
    options: CSSGenerationOptions
  ): string {
    const rules: string[] = [];

    if (options.addComments) {
      rules.push(`/* ${element.description} */`);
    }

    // Process each preference for this element
    element.availablePreferences.forEach(preference => {
      const userValue = preferences[preference.id];

      // Only generate CSS if the value has been explicitly set AND is different from default
      if (userValue === undefined || userValue === null) return;

      // Check if the user value is different from the default value
      const defaultValue = preference.currentValue;
      if (userValue === defaultValue) return;

      const css = this.generateCSSForPreference(preference, userValue, options);
      if (css) {
        rules.push(css);
      }
    });

    return rules.length > 0 ? rules.join('\n') : '';
  }

  private generateCSSForPreference(
    preference: DetectedElement['availablePreferences'][0],
    userValue: unknown,
    options: CSSGenerationOptions
  ): string {
    const metadata = preference.metadata;
    if (!metadata) return '';

    let css = '';

    switch (preference.type) {
      case 'toggle':
        // For toggles, use cssOnTrue or cssOnFalse based on the boolean value
        if (typeof userValue === 'boolean') {
          css = userValue ? metadata.cssOnTrue || '' : metadata.cssOnFalse || '';
        }
        break;

      case 'dropdown':
      case 'layout-selector':
        // For dropdowns, use cssOptions based on the selected value
        if (typeof userValue === 'string' && metadata.cssOptions) {
          css = metadata.cssOptions[userValue] || '';
        }
        break;

      case 'color-picker':
        // For color pickers, use cssTemplate with color value interpolation
        if (typeof userValue === 'string' && metadata.cssTemplate) {
          // Validate and fix hex colors
          let colorValue = userValue;
          if (colorValue.startsWith('#')) {
            // Ensure hex colors are 6 characters (plus #)
            if (colorValue.length === 4) {
              // Convert #abc to #aabbcc
              colorValue = `#${colorValue[1]}${colorValue[1]}${colorValue[2]}${colorValue[2]}${colorValue[3]}${colorValue[3]}`;
            } else if (colorValue.length < 7) {
              // Pad incomplete hex colors
              colorValue = colorValue.padEnd(7, colorValue[colorValue.length - 1]);
            }
          }
          css = metadata.cssTemplate.replace(/\$\{value\}/g, colorValue);
        }
        break;

      case 'slider':
      case 'number-input':
        // For sliders and number inputs, use cssTemplate with numeric value interpolation
        if (typeof userValue === 'number' && metadata.cssTemplate) {
          const unit = metadata.range?.unit || metadata.unit || '';

          console.log(`🎛️ Processing ${preference.type} CSS:`, {
            preferenceId: preference.id,
            userValue,
            unit,
            template: metadata.cssTemplate,
            range: metadata.range,
          });

          // Check if the template already includes the unit to avoid double units
          const templateHasUnit =
            metadata.cssTemplate.includes(`\${value}${unit}`) ||
            metadata.cssTemplate.includes('${value}px') ||
            metadata.cssTemplate.includes('${value}%') ||
            metadata.cssTemplate.includes('${value}em') ||
            metadata.cssTemplate.includes('${value}rem') ||
            metadata.cssTemplate.includes('${value}vh') ||
            metadata.cssTemplate.includes('${value}vw');

          if (templateHasUnit) {
            // Template already has units, just replace the value
            css = metadata.cssTemplate.replace(/\$\{value\}/g, String(userValue));
          } else {
            // Template doesn't have units, add them
            css = metadata.cssTemplate.replace(/\$\{value\}/g, `${userValue}${unit}`);
          }

          console.log(`📝 Generated ${preference.type} CSS:`, css);
        }
        break;

      default:
        console.warn(`Unsupported preference type: ${preference.type}`);
    }

    // Validate and fix CSS - ensure it has actual selectors
    if (css && metadata.targetClasses && metadata.targetClasses.length > 0) {
      // If the CSS doesn't contain any of the target classes, it might be malformed
      const containsTargetClass = metadata.targetClasses.some(className =>
        css.includes(`.${className}`)
      );

      console.log(`🎯 CSS validation for ${preference.id}:`);
      console.log('  targetClasses:', metadata.targetClasses);
      console.log('  generated CSS:', css);
      console.log('  contains target class?', containsTargetClass);

      if (!containsTargetClass) {
        console.warn(`Visual Preferences: CSS template missing target classes, auto-fixing...`);

        // Try to extract CSS properties and apply them to actual target classes
        const cssDeclarations = this.extractCSSDeclarations(css);
        console.log('  extracted declarations:', cssDeclarations);

        if (cssDeclarations) {
          const fixedCSS = metadata.targetClasses
            .map(className => `.${className} { ${cssDeclarations} }`)
            .join('\n');
          console.log('  fixed CSS:', fixedCSS);
          css = fixedCSS;
        }
      }
    }

    // Add !important if specified
    if (css && options.useImportant) {
      css = css.replace(/;/g, ' !important;');
    }

    return css;
  }

  // Helper method to extract CSS declarations from potentially malformed CSS
  private extractCSSDeclarations(css: string): string | null {
    // Try to extract everything between { and }
    const match = css.match(/\{([^}]+)\}/);
    if (match && match[1]) {
      return match[1].trim();
    }

    // If no braces found, assume it's just declarations
    if (css.includes(':') && css.includes(';')) {
      return css.trim();
    }

    return null;
  }

  async applyTextReplacements(
    preferences: UserPreferences,
    elements: DetectedElement[]
  ): Promise<void> {
    // Text replacements are now handled by the LLM-generated CSS
    // This method remains for compatibility but may not be needed
    try {
      const tab = await getActiveTab();
      if (!tab.id) return;

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (prefs: UserPreferences, elems: DetectedElement[]) => {
          // Apply any text replacements defined in the LLM response
          elems.forEach((element: DetectedElement) => {
            const elementPrefs = prefs[element.id];
            if (!elementPrefs) return;
          });
        },
        args: [preferences, elements],
      });
    } catch (error) {
      console.error('Error applying text replacements:', error);
    }
  }

  private minifyCSS(css: string): string {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\s*{\s*/g, '{') // Remove spaces around opening braces
      .replace(/;\s*/g, ';') // Remove spaces after semicolons
      .replace(/\s*}\s*/g, '}') // Remove spaces around closing braces
      .trim();
  }

  // Helper method to extract CSS from LLM-generated preferences
  static extractCSSFromPreferences(
    preferences: UserPreferences,
    elements: DetectedElement[]
  ): { selector: string; css: string }[] {
    const cssBlocks: { selector: string; css: string }[] = [];

    elements.forEach((element: DetectedElement) => {
      const elementPrefs = preferences[element.id];
      if (!elementPrefs) return;

      element.availablePreferences.forEach((pref: DetectedElement['availablePreferences'][0]) => {
        const userValue = elementPrefs[pref.id];
        if (userValue === undefined || userValue === null || !pref.metadata) return;

        let css = '';

        if (pref.type === 'toggle' && typeof userValue === 'boolean') {
          css = userValue ? pref.metadata.cssOnTrue || '' : pref.metadata.cssOnFalse || '';
        } else if (pref.type === 'dropdown' || pref.type === 'layout-selector') {
          if (typeof userValue === 'string' && pref.metadata.cssOptions) {
            css = pref.metadata.cssOptions[userValue] || '';
          }
        }

        if (css && pref.metadata.targetClasses) {
          pref.metadata.targetClasses.forEach((targetClass: string) => {
            cssBlocks.push({
              selector: `.${targetClass}`,
              css: css,
            });
          });
        }
      });
    });

    return cssBlocks;
  }

  // Method to generate preview CSS for a single preference change
  generatePreviewCSS(element: DetectedElement, preferenceId: string, newValue: unknown): string {
    const preference = element.availablePreferences.find(p => p.id === preferenceId);
    if (!preference || !preference.metadata) return '';

    return this.generateCSSForPreference(preference, newValue, {
      minify: false,
      addComments: false,
      useImportant: false,
      respectExistingStyles: false,
    });
  }
}

export const cssGenerationService = new CSSGenerationService();

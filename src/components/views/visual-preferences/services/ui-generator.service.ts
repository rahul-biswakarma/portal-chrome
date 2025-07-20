import React from 'react';
import type { DetectedElement, UserPreferences, PreferenceValue } from '../types';
import { PreferenceToggle } from '../components/preference-toggle';
import { PreferenceDropdown } from '../components/preference-dropdown';
import { LayoutSelector } from '../components/layout-selector';
import { cssGenerationService } from './css-generation.service';
import { cssApplicationService } from '../../pilot-mode/services/css-application.service';

interface UIPreference {
  id: string;
  type: 'toggle' | 'dropdown' | 'slider' | 'color-picker' | 'layout-selector';
  label: string;
  description: string;
  category: 'visibility' | 'layout' | 'styling' | 'position' | 'behavior';
  defaultValue: string | number | boolean;
  options?: string[];
  range?: { min: number; max: number; step: number };
  cssOnTrue?: string;
  cssOnFalse?: string;
  cssOptions?: Record<string, string>;
  targetClasses: string[];
}

interface LLMUIElement {
  id: string;
  name: string;
  description: string;
  portalClasses: string[];
  preferences: UIPreference[];
}

interface LLMUIResponse {
  elements: LLMUIElement[];
  globalPreferences?: UIPreference[];
}

export class UIGeneratorService {
  /**
   * Convert LLM JSON response to DetectedElements with dynamic preferences
   */
  convertJSONToDetectedElements(llmResponse: LLMUIResponse): DetectedElement[] {
    const elements: DetectedElement[] = [];

    llmResponse.elements.forEach(elementGroup => {
      const preferences = elementGroup.preferences.map(pref => ({
        id: pref.id,
        type: pref.type as DetectedElement['availablePreferences'][0]['type'],
        label: pref.label,
        description: pref.description,
        currentValue: pref.defaultValue,
        availableValues: pref.options,
        category: pref.category,
        metadata: {
          cssOnTrue: pref.cssOnTrue,
          cssOnFalse: pref.cssOnFalse,
          cssOptions: pref.cssOptions,
          targetClasses: pref.targetClasses,
        },
      }));

      elements.push({
        id: elementGroup.id,
        selector: `.${elementGroup.portalClasses[0]}`,
        type: this.inferElementType(elementGroup.name),
        description: elementGroup.description,
        currentState: {
          visible: true,
          display: 'block',
          layout: 'column',
        },
        availablePreferences: preferences,
      });
    });

    return elements;
  }

  /**
   * Dynamically render a UI control based on preference metadata
   */
  renderDynamicControl(
    _element: DetectedElement,
    preference: DetectedElement['availablePreferences'][0],
    currentValue: PreferenceValue,
    onChange: (value: PreferenceValue) => void
  ): React.ReactElement | null {
    const props = {
      key: preference.id,
      option: preference,
      value: currentValue,
      onChange,
    };

    switch (preference.type) {
      case 'toggle':
        return React.createElement(PreferenceToggle, {
          ...props,
          value: currentValue as boolean,
          onChange: onChange as (value: boolean) => void,
        });

      case 'dropdown':
        return React.createElement(PreferenceDropdown, {
          ...props,
          value: String(currentValue),
          onChange: onChange as (value: string) => void,
        });

      case 'layout-selector':
        return React.createElement(LayoutSelector, {
          ...props,
          value: String(currentValue),
          onChange: onChange as (value: string) => void,
        });

      case 'slider':
        // TODO: Create slider component if needed
        console.warn('Slider component not implemented yet');
        return null;

      case 'color-picker':
        // TODO: Create color picker component if needed
        console.warn('Color picker component not implemented yet');
        return null;

      default:
        console.warn(`Unknown preference type: ${preference.type}`);
        return null;
    }
  }

  /**
   * Apply CSS changes based on user preferences
   */
  async applyPreferences(
    preferences: UserPreferences,
    elements: DetectedElement[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Generate CSS from LLM-based preferences
      const css = await cssGenerationService.generateCSS(preferences, elements, {
        minify: false,
        addComments: true,
        useImportant: true,
        respectExistingStyles: true,
      });

      // Apply the generated CSS
      const result = await cssApplicationService.applyCSS(css);

      if (result.success) {
        // Apply any text replacements if needed
        await cssGenerationService.applyTextReplacements(preferences, elements);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Error applying preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate preview CSS for a single preference change without applying it
   */
  generatePreviewCSS(
    element: DetectedElement,
    preferenceId: string,
    newValue: PreferenceValue
  ): string {
    return cssGenerationService.generatePreviewCSS(element, preferenceId, newValue);
  }

  /**
   * Get all available CSS that would be applied for current preferences
   */
  getAllApplicableCSS(preferences: UserPreferences, elements: DetectedElement[]): string[] {
    const cssBlocks: string[] = [];

    elements.forEach(element => {
      const elementPrefs = preferences[element.id];
      if (!elementPrefs) return;

      element.availablePreferences.forEach(pref => {
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

        if (css.trim()) {
          cssBlocks.push(`/* ${element.description} - ${pref.label} */`);
          cssBlocks.push(css);
        }
      });
    });

    return cssBlocks;
  }

  /**
   * Validate LLM JSON response structure
   */
  validateLLMResponse(response: unknown): response is LLMUIResponse {
    if (!response || typeof response !== 'object') return false;
    const responseObj = response as { elements?: unknown };
    if (!Array.isArray(responseObj.elements)) return false;

    return responseObj.elements.every(
      (element: unknown) =>
        typeof element === 'object' &&
        element !== null &&
        'id' in element &&
        'name' in element &&
        'description' in element &&
        'portalClasses' in element &&
        'preferences' in element &&
        Array.isArray((element as Record<string, unknown>).portalClasses) &&
        Array.isArray((element as Record<string, unknown>).preferences) &&
        ((element as Record<string, unknown>).preferences as unknown[]).every(
          (pref: unknown) =>
            typeof pref === 'object' &&
            pref !== null &&
            'id' in pref &&
            'type' in pref &&
            'label' in pref &&
            'category' in pref &&
            'defaultValue' in pref
        )
    );
  }

  /**
   * Create fallback UI elements when LLM fails
   */
  createFallbackElements(portalClasses: string[]): DetectedElement[] {
    return [
      {
        id: 'fallback-controls',
        selector: `.${portalClasses[0] || 'portal-element'}`,
        type: 'other',
        description: 'Basic Portal Controls',
        currentState: {
          visible: true,
          display: 'block',
          layout: 'column',
        },
        availablePreferences: [
          {
            id: 'visibility',
            type: 'toggle',
            label: 'Show Elements',
            description: 'Toggle visibility of portal elements',
            currentValue: true,
            category: 'visibility',
            metadata: {
              cssOnTrue: portalClasses
                .map(cls => `.${cls} { display: block !important; }`)
                .join('\n'),
              cssOnFalse: portalClasses
                .map(cls => `.${cls} { display: none !important; }`)
                .join('\n'),
              targetClasses: portalClasses,
            },
          },
        ],
      },
    ];
  }

  private inferElementType(name: string): DetectedElement['type'] {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('header')) return 'header';
    if (nameLower.includes('nav') || nameLower.includes('menu')) return 'navigation';
    if (nameLower.includes('button')) return 'button';
    if (nameLower.includes('tab')) return 'tab-group';
    if (nameLower.includes('card') || nameLower.includes('grid')) return 'card-container';
    if (nameLower.includes('form')) return 'form';
    if (nameLower.includes('list')) return 'list';
    return 'other';
  }
}

export const uiGeneratorService = new UIGeneratorService();

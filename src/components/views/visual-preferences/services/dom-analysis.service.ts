import { getActiveTab } from '@/utils/chrome-utils';
import { generateCSSWithGemini } from '@/utils/gemini';
import { getEnvVariable } from '@/utils/environment';
import { captureScreenshot } from '@/utils/screenshot';
import type { DetectedElement, DOMAnalysisResult, PreferenceOption, ElementType } from '../types';

// Types for LLM-generated UI preferences
interface UIPreference {
  id: string;
  type: 'toggle' | 'dropdown' | 'slider' | 'color-picker';
  label: string;
  description: string;
  category: 'visibility' | 'layout' | 'styling' | 'position' | 'behavior';
  defaultValue: string | number | boolean;
  options?: string[]; // For dropdowns
  range?: { min: number; max: number; step: number }; // For sliders
  cssOnTrue?: string; // For toggles - CSS when toggled ON
  cssOnFalse?: string; // For toggles - CSS when toggled OFF
  cssOptions?: Record<string, string>; // For dropdowns - CSS for each option
  targetClasses: string[]; // Which portal classes this affects
}

interface LLMUIPreferencesResponse {
  elements: Array<{
    id: string;
    name: string;
    description: string;
    portalClasses: string[];
    preferences: UIPreference[];
  }>;
  globalPreferences?: UIPreference[];
}

interface PortalElement {
  tagName: string;
  portalClasses: string[];
  tailwindClasses: string[];
  text?: string;
  children: PortalElement[];
}

export class DOMAnalysisService {
  async analyzeDOM(): Promise<DOMAnalysisResult> {
    try {
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Get portal elements and styles (same as chat customization)
      const [portalElements, , computedStyles] = await Promise.all([
        this.extractPortalElements(tab.id),
        this.getCurrentCSS(tab.id),
        this.getComputedStyles(tab.id),
      ]);

      if (portalElements.length === 0) {
        throw new Error('No portal elements found on this page');
      }

      // Generate UI preferences using LLM
      const llmPreferences = await this.generateUIPreferences(portalElements, computedStyles);

      // Convert LLM response to our DetectedElement format
      const elements = this.convertLLMResponseToElements(llmPreferences);

      return {
        elements,
        pageType: 'portal-page',
        confidence: elements.length > 0 ? 0.9 : 0,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error analyzing DOM:', error);
      throw error;
    }
  }

  private async extractPortalElements(tabId: number): Promise<PortalElement[]> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const extractElementData = (element: Element): PortalElement | null => {
            const classList = Array.from(element.classList);
            const portalClasses = classList.filter(cls => cls.startsWith('portal-'));
            const tailwindClasses = classList.filter(
              cls =>
                !cls.startsWith('portal-') &&
                (cls.startsWith('flex') ||
                  cls.startsWith('grid') ||
                  cls.startsWith('block') ||
                  cls.startsWith('p-') ||
                  cls.startsWith('m-') ||
                  cls.startsWith('bg-') ||
                  cls.startsWith('text-') ||
                  cls.startsWith('w-') ||
                  cls.startsWith('h-') ||
                  cls.startsWith('border') ||
                  cls.startsWith('rounded'))
            );

            if (portalClasses.length === 0) {
              const hasPortalDescendants = element.querySelector('[class*="portal-"]');
              if (!hasPortalDescendants) return null;
            }

            const children: PortalElement[] = [];
            Array.from(element.children).forEach(child => {
              const childData = extractElementData(child);
              if (childData) children.push(childData);
            });

            const textContent = Array.from(element.childNodes)
              .filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent?.trim())
              .filter(Boolean)
              .join(' ')
              .slice(0, 100);

            return {
              tagName: element.tagName.toLowerCase(),
              portalClasses,
              tailwindClasses,
              text: textContent || undefined,
              children,
            };
          };

          const elements: PortalElement[] = [];
          const portalElements = document.querySelectorAll('[class*="portal-"]');

          portalElements.forEach(element => {
            const data = extractElementData(element);
            if (data) elements.push(data);
          });

          return elements;
        },
      });

      return result[0]?.result || [];
    } catch (error) {
      console.error('Error extracting portal elements:', error);
      return [];
    }
  }

  private async getCurrentCSS(tabId: number): Promise<string> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          let css = '';
          const styleSheets = Array.from(document.styleSheets);

          styleSheets.forEach(sheet => {
            try {
              if (sheet.href && !sheet.href.includes(window.location.origin)) return;
              const rules = Array.from(sheet.cssRules || []);
              rules.forEach(rule => {
                if (rule.cssText.includes('portal-')) {
                  css += rule.cssText + '\n';
                }
              });
            } catch (e) {
              // Skip cross-origin stylesheets
            }
          });

          return css;
        },
      });

      return result[0]?.result || '';
    } catch (error) {
      console.error('Error getting current CSS:', error);
      return '';
    }
  }

  private async getComputedStyles(tabId: number): Promise<Record<string, Record<string, string>>> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const portalElements = document.querySelectorAll('[class*="portal-"]');
          const styles: Record<string, Record<string, string>> = {};

          portalElements.forEach(element => {
            const classes = Array.from(element.classList);
            const portalClasses = classes.filter(cls => cls.startsWith('portal-'));
            const computedStyle = window.getComputedStyle(element);

            portalClasses.forEach(portalClass => {
              if (!styles[portalClass]) {
                const styleProps: Record<string, string> = {};
                const props = [
                  'display',
                  'position',
                  'width',
                  'height',
                  'margin',
                  'padding',
                  'background-color',
                  'color',
                  'font-size',
                  'font-weight',
                  'border',
                  'border-radius',
                  'box-shadow',
                  'opacity',
                  'flex-direction',
                  'justify-content',
                  'align-items',
                ];

                props.forEach(prop => {
                  const value = computedStyle.getPropertyValue(prop);
                  if (value && value !== 'none' && value !== 'auto') {
                    styleProps[prop] = value;
                  }
                });

                styles[portalClass] = styleProps;
              }
            });
          });

          return styles;
        },
      });

      return result[0]?.result || {};
    } catch (error) {
      console.error('Error getting computed styles:', error);
      return {};
    }
  }

  private async generateUIPreferences(
    portalElements: PortalElement[],
    computedStyles: Record<string, Record<string, string>>
  ): Promise<LLMUIPreferencesResponse> {
    try {
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) {
        console.warn('Gemini API key not found, using fallback response');
        return this.generateFallbackUIPreferences(portalElements);
      }

      const prompt = this.createUIPreferencesPrompt(portalElements, computedStyles);

      // Get tab for screenshot
      const tab = await getActiveTab();
      const screenshot = tab?.id ? await captureScreenshot(tab.id) : undefined;

      // Use Gemini to generate UI preferences JSON
      const sessionId = `ui_prefs_${Date.now()}`;
      const response = await generateCSSWithGemini(
        apiKey,
        prompt,
        this.createTreeFromElements(portalElements),
        this.createTailwindData(portalElements),
        '', // No existing CSS needed
        undefined, // No reference image
        screenshot,
        computedStyles,
        sessionId
      );

      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as LLMUIPreferencesResponse;
      }

      throw new Error('No valid JSON found in LLM response');
    } catch (error) {
      console.error('Error generating UI preferences with LLM:', error);
      return this.generateFallbackUIPreferences(portalElements);
    }
  }

  private createUIPreferencesPrompt(
    portalElements: PortalElement[],
    _computedStyles: Record<string, Record<string, string>>
  ): string {
    const portalClasses = this.getAllPortalClasses(portalElements);
    const portalTree = this.formatPortalTree(portalElements);

    return `You are creating a user preferences interface for a portal website. Your goal is to analyze the available portal elements and generate intuitive customization options that users would actually want to change.

USE CASE: Users visit a portal website and want to customize how it looks and behaves. They should be able to:
- Show/hide interface elements they don't need
- Adjust spacing and layout density for their preference  
- Change visual styles to match their workflow
- Toggle features on/off based on their usage patterns

AVAILABLE PORTAL ELEMENTS:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

PAGE STRUCTURE:
${portalTree}

ANALYSIS APPROACH:
1. Look at the portal element names and infer what they represent (headers, navigation, cards, buttons, etc.)
2. For each element type, think: "What would users want to customize about this?"
3. Group related elements together logically
4. Create user-friendly controls that make intuitive sense

PREFERENCE GUIDELINES:
- Use "toggle" for binary choices (show/hide, on/off)
- Use "dropdown" for multiple style/layout options (typically 2-4 choices)
- Focus on high-impact changes (visibility, spacing, layout, basic styling)
- Avoid technical jargon - use simple, clear labels
- Each preference should solve a real user need

JSON STRUCTURE REQUIRED:
{
  "elements": [
    {
      "id": "unique-group-id",
      "name": "User-Friendly Group Name", 
      "description": "Brief description of what this controls",
      "portalClasses": ["list", "of", "portal-classes", "this", "group", "affects"],
      "preferences": [
        {
          "id": "unique-pref-id",
          "type": "toggle" | "dropdown",
          "label": "Simple User Label",
          "description": "What this preference does",
          "category": "visibility" | "layout" | "styling",
          "defaultValue": true | "option-name",
          "cssOnTrue": "CSS for toggle ON" (toggle only),
          "cssOnFalse": "CSS for toggle OFF" (toggle only),
          "options": ["option1", "option2", "option3"] (dropdown only),
          "cssOptions": {"option1": "CSS", "option2": "CSS"} (dropdown only),
          "targetClasses": ["portal-classes", "to", "apply", "css", "to"]
        }
      ]
    }
  ]
}

Create logical groupings based on what you see in the available elements. Return ONLY the JSON.`;
  }

  private generateFallbackUIPreferences(portalElements: PortalElement[]): LLMUIPreferencesResponse {
    const allClasses = this.getAllPortalClasses(portalElements);

    if (allClasses.length === 0) {
      return { elements: [] };
    }

    // Group classes by type for better fallback organization
    const headerClasses = allClasses.filter(cls => cls.includes('header') || cls.includes('nav'));
    const cardClasses = allClasses.filter(cls => cls.includes('card') || cls.includes('item'));
    const buttonClasses = allClasses.filter(cls => cls.includes('button') || cls.includes('btn'));
    const otherClasses = allClasses.filter(
      cls =>
        !headerClasses.includes(cls) && !cardClasses.includes(cls) && !buttonClasses.includes(cls)
    );

    const elements: LLMUIPreferencesResponse['elements'] = [];

    // Header/Navigation preferences
    if (headerClasses.length > 0) {
      elements.push({
        id: 'header-settings',
        name: 'Header & Navigation',
        description: 'Customize header and navigation appearance',
        portalClasses: headerClasses,
        preferences: [
          {
            id: 'header-visibility',
            type: 'toggle',
            label: 'Show Header',
            description: 'Display or hide header elements',
            category: 'visibility',
            defaultValue: true,
            cssOnTrue: headerClasses.map(cls => `.${cls} { display: flex; }`).join('\n'),
            cssOnFalse: headerClasses.map(cls => `.${cls} { display: none; }`).join('\n'),
            targetClasses: headerClasses,
          },
          {
            id: 'header-style',
            type: 'dropdown',
            label: 'Header Style',
            description: 'Choose header appearance',
            category: 'styling',
            defaultValue: 'standard',
            options: ['standard', 'compact'],
            cssOptions: {
              standard: headerClasses.map(cls => `.${cls} { padding: 12px; }`).join('\n'),
              compact: headerClasses.map(cls => `.${cls} { padding: 6px; }`).join('\n'),
            },
            targetClasses: headerClasses,
          },
        ],
      });
    }

    // Card/Content preferences
    if (cardClasses.length > 0) {
      elements.push({
        id: 'content-settings',
        name: 'Cards & Content',
        description: 'Customize card and content appearance',
        portalClasses: cardClasses,
        preferences: [
          {
            id: 'card-spacing',
            type: 'dropdown',
            label: 'Card Spacing',
            description: 'Adjust spacing between cards',
            category: 'layout',
            defaultValue: 'normal',
            options: ['tight', 'normal', 'loose'],
            cssOptions: {
              tight: cardClasses.map(cls => `.${cls} { margin: 4px; padding: 8px; }`).join('\n'),
              normal: cardClasses.map(cls => `.${cls} { margin: 8px; padding: 12px; }`).join('\n'),
              loose: cardClasses.map(cls => `.${cls} { margin: 16px; padding: 20px; }`).join('\n'),
            },
            targetClasses: cardClasses,
          },
          {
            id: 'card-borders',
            type: 'toggle',
            label: 'Show Borders',
            description: 'Display borders around cards',
            category: 'styling',
            defaultValue: true,
            cssOnTrue: cardClasses.map(cls => `.${cls} { border: 1px solid #e2e8f0; }`).join('\n'),
            cssOnFalse: cardClasses.map(cls => `.${cls} { border: none; }`).join('\n'),
            targetClasses: cardClasses,
          },
        ],
      });
    }

    // Button preferences
    if (buttonClasses.length > 0) {
      elements.push({
        id: 'button-settings',
        name: 'Buttons',
        description: 'Customize button appearance',
        portalClasses: buttonClasses,
        preferences: [
          {
            id: 'button-size',
            type: 'dropdown',
            label: 'Button Size',
            description: 'Choose button size',
            category: 'styling',
            defaultValue: 'medium',
            options: ['small', 'medium', 'large'],
            cssOptions: {
              small: buttonClasses
                .map(cls => `.${cls} { padding: 4px 8px; font-size: 12px; }`)
                .join('\n'),
              medium: buttonClasses
                .map(cls => `.${cls} { padding: 8px 16px; font-size: 14px; }`)
                .join('\n'),
              large: buttonClasses
                .map(cls => `.${cls} { padding: 12px 24px; font-size: 16px; }`)
                .join('\n'),
            },
            targetClasses: buttonClasses,
          },
        ],
      });
    }

    // Other elements
    if (otherClasses.length > 0) {
      elements.push({
        id: 'general-settings',
        name: 'General Interface',
        description: 'General interface settings',
        portalClasses: otherClasses,
        preferences: [
          {
            id: 'interface-density',
            type: 'dropdown',
            label: 'Interface Density',
            description: 'Adjust overall interface density',
            category: 'layout',
            defaultValue: 'normal',
            options: ['compact', 'normal', 'comfortable'],
            cssOptions: {
              compact: otherClasses.map(cls => `.${cls} { padding: 4px; margin: 2px; }`).join('\n'),
              normal: otherClasses.map(cls => `.${cls} { padding: 8px; margin: 4px; }`).join('\n'),
              comfortable: otherClasses
                .map(cls => `.${cls} { padding: 16px; margin: 8px; }`)
                .join('\n'),
            },
            targetClasses: otherClasses,
          },
        ],
      });
    }

    return { elements };
  }

  private convertLLMResponseToElements(llmResponse: LLMUIPreferencesResponse): DetectedElement[] {
    const elements: DetectedElement[] = [];

    llmResponse.elements.forEach(elementGroup => {
      const preferences: PreferenceOption[] = elementGroup.preferences.map(pref => ({
        id: pref.id,
        type: pref.type as PreferenceOption['type'],
        label: pref.label,
        description: pref.description,
        currentValue: pref.defaultValue,
        availableValues: pref.options || [], // Fix: map options to availableValues
        category: pref.category,
        // Store CSS data for later use
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

  private inferElementType(name: string): ElementType {
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

  private createTreeFromElements(elements: PortalElement[]) {
    return {
      element: 'div',
      portalClasses: [],
      children: elements.map(el => ({
        element: el.tagName,
        portalClasses: el.portalClasses,
        text: el.text,
        children: el.children.map(child => ({
          element: child.tagName,
          portalClasses: child.portalClasses,
          text: child.text,
          children: [],
        })),
      })),
    };
  }

  private createTailwindData(elements: PortalElement[]): Record<string, string[]> {
    const tailwindData: Record<string, string[]> = {};
    const processElement = (element: PortalElement) => {
      element.portalClasses.forEach(cls => {
        if (!tailwindData[cls]) {
          tailwindData[cls] = element.tailwindClasses;
        }
      });
      element.children.forEach(processElement);
    };
    elements.forEach(processElement);
    return tailwindData;
  }

  private getAllPortalClasses(elements: PortalElement[]): string[] {
    const classes: string[] = [];
    const extractClasses = (element: PortalElement) => {
      classes.push(...element.portalClasses);
      element.children.forEach(extractClasses);
    };
    elements.forEach(extractClasses);
    return [...new Set(classes)];
  }

  private formatPortalTree(elements: PortalElement[], indent = 0): string {
    return elements
      .map(element => {
        const indentation = '  '.repeat(indent);
        let result = `${indentation}<${element.tagName}`;

        if (element.portalClasses.length > 0) {
          result += ` portal-classes="${element.portalClasses.join(' ')}"`;
        }

        if (element.tailwindClasses.length > 0) {
          result += ` tailwind-classes="${element.tailwindClasses.join(' ')}"`;
        }

        result += `>${element.text ? ` ${element.text.slice(0, 50)}${element.text.length > 50 ? '...' : ''}` : ''}`;

        if (element.children.length > 0) {
          result += '\n' + this.formatPortalTree(element.children, indent + 1);
          result += `\n${indentation}</${element.tagName}>`;
        } else {
          result += ` </${element.tagName}>`;
        }

        return result;
      })
      .join('\n');
  }
}

export const domAnalysisService = new DOMAnalysisService();

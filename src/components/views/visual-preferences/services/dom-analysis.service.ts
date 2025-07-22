import { getActiveTab } from '@/utils/chrome-utils';
import { generateCSSWithGemini } from '@/utils/gemini';
import { getEnvVariable } from '@/utils/environment';
import { captureScreenshot } from '@/utils/screenshot';
import type { DetectedElement, DOMAnalysisResult, PreferenceOption, ElementType } from '../types';

// Types for LLM-generated UI preferences
interface UIPreference {
  id: string;
  type: 'toggle' | 'dropdown' | 'slider' | 'color-picker' | 'number-input';
  label: string;
  description: string;
  category: 'visibility' | 'layout' | 'styling' | 'position' | 'behavior';
  defaultValue: string | number | boolean;
  options?: string[]; // For dropdowns
  range?: { min: number; max: number; step: number; unit: string }; // For sliders and number inputs
  cssOnTrue?: string; // For toggles - CSS when toggled ON
  cssOnFalse?: string; // For toggles - CSS when toggled OFF
  cssOptions?: Record<string, string>; // For dropdowns - CSS for each option
  cssTemplate?: string; // For dynamic values: '.class { property: ${value}px; }'
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
  styleInfo?: {
    display: string;
    position: string;
    backgroundColor: string;
    color: string;
    fontSize: string;
    padding: string;
    margin: string;
    width: string;
    height: string;
    visibility: string;
  };
  layoutInfo?: {
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
  };
  semanticRole?: string;
  hasBackgroundImage?: boolean;
  hasInteractiveElements?: boolean;
  children: PortalElement[];
}

export class DOMAnalysisService {
  async analyzeDOM(customPrompt?: string, currentCSS?: string): Promise<DOMAnalysisResult> {
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
      const llmPreferences = await this.generateUIPreferences(
        portalElements,
        computedStyles,
        customPrompt,
        currentCSS // Pass current CSS to LLM
      );

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

            // Get computed style information for better context
            const computedStyle = window.getComputedStyle(element);
            const styleInfo = {
              display: computedStyle.display,
              position: computedStyle.position,
              backgroundColor: computedStyle.backgroundColor,
              color: computedStyle.color,
              fontSize: computedStyle.fontSize,
              padding: computedStyle.padding,
              margin: computedStyle.margin,
              width: computedStyle.width,
              height: computedStyle.height,
              visibility: computedStyle.visibility,
            };

            // Get element position and size for layout context
            const rect = element.getBoundingClientRect();
            const layoutInfo = {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              visible: rect.width > 0 && rect.height > 0 && computedStyle.visibility !== 'hidden',
            };

            // Extract semantic meaning from classes and content
            const inferSemanticRole = (element: Element, portalClasses: string[]): string => {
              const tagName = element.tagName.toLowerCase();
              const textContent = element.textContent?.toLowerCase() || '';

              // Infer from portal class names
              if (portalClasses.some(cls => cls.includes('header'))) return 'header';
              if (portalClasses.some(cls => cls.includes('nav'))) return 'navigation';
              if (portalClasses.some(cls => cls.includes('footer'))) return 'footer';
              if (portalClasses.some(cls => cls.includes('sidebar'))) return 'sidebar';
              if (portalClasses.some(cls => cls.includes('logo'))) return 'logo';
              if (portalClasses.some(cls => cls.includes('tab'))) return 'tabs';
              if (portalClasses.some(cls => cls.includes('card'))) return 'card';
              if (portalClasses.some(cls => cls.includes('button'))) return 'button';
              if (portalClasses.some(cls => cls.includes('menu'))) return 'menu';

              // Infer from HTML tag
              if (
                ['header', 'nav', 'footer', 'aside', 'main', 'section', 'article'].includes(tagName)
              ) {
                return tagName;
              }

              // Infer from content patterns
              if (textContent.includes('welcome')) return 'welcome-message';
              if (textContent.includes('search')) return 'search';
              if (element.querySelector('input[type="search"]')) return 'search';
              if (element.querySelector('img')) return 'image-container';

              return 'content';
            };

            const semanticRole = inferSemanticRole(element, portalClasses);

            // Get all visible text content (more comprehensive)
            const textContent = element.textContent?.trim().slice(0, 200);

            // Check if element has background image
            const hasBackgroundImage = computedStyle.backgroundImage !== 'none';

            // Check if element contains interactive elements
            const hasInteractiveElements =
              element.querySelector('button, a, input, select, textarea') !== null;

            const children: PortalElement[] = [];
            Array.from(element.children).forEach(child => {
              const childData = extractElementData(child);
              if (childData) children.push(childData);
            });

            return {
              tagName: element.tagName.toLowerCase(),
              portalClasses,
              tailwindClasses,
              text: textContent || undefined,
              styleInfo,
              layoutInfo,
              semanticRole,
              hasBackgroundImage,
              hasInteractiveElements,
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
    computedStyles: Record<string, Record<string, string>>,
    customPrompt?: string,
    currentCSS?: string
  ): Promise<LLMUIPreferencesResponse> {
    try {
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) {
        console.warn('Gemini API key not found, using fallback response');
        return this.generateFallbackUIPreferences(portalElements);
      }

      const prompt =
        customPrompt || this.createUIPreferencesPrompt(portalElements, computedStyles, currentCSS);

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
        currentCSS || '', // Pass current CSS to Gemini
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
    computedStyles: Record<string, Record<string, string>>,
    currentCSS?: string
  ): string {
    const portalClasses = this.getAllPortalClasses(portalElements);
    const portalTree = this.formatPortalTree(portalElements);
    const existingStylesSection = this.formatExistingStyles(portalClasses, computedStyles);

    // Format current CSS section if available
    const currentCSSSection =
      currentCSS && currentCSS.trim()
        ? `\nEXISTING CUSTOM CSS:\n${currentCSS.trim()}\n\nIMPORTANT: The above CSS shows what customizations are already applied. When generating preferences, please:\n- Include controls for settings that are already applied (so users can modify/reset them)\n- Look for comment blocks that show element IDs and preference IDs (/* Element: some-id, Preference: some-pref */)\n- Generate new preferences that complement existing ones\n- Ensure preference IDs are unique and don't conflict with existing ones\n`
        : '\nNOTE: No existing customizations found. Generate fresh preferences based on the page structure.\n';

    return `Generate UI customization preferences for this portal page. Analyze the screenshot to understand what elements exist and create practical customization options.

AVAILABLE PORTAL CLASSES:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

PAGE STRUCTURE:
${portalTree}

CURRENT STYLES:
${existingStylesSection}${currentCSSSection}

PREFERENCE TYPE SCHEMAS:

**toggle**: Show/hide or enable/disable options
{
  "type": "toggle",
  "label": "Show Element",
  "description": "Display or hide this element",
  "category": "visibility",
  "defaultValue": true,
  "cssOnTrue": ".portal-class { display: block; }",
  "cssOnFalse": ".portal-class { display: none; }",
  "targetClasses": ["portal-class"]
}

**color-picker**: Color customization
{
  "type": "color-picker", 
  "label": "Background Color",
  "description": "Choose background color",
  "category": "styling",
  "defaultValue": "#ffffff",
  "cssTemplate": ".portal-class { background-color: \${value}; }",
  "targetClasses": ["portal-class"]
}

**dropdown**: Predefined option selection
{
  "type": "dropdown",
  "label": "Layout Style", 
  "description": "Choose layout appearance",
  "category": "layout",
  "defaultValue": "default",
  "options": ["minimal", "default", "full"],
  "cssOptions": {
    "minimal": ".portal-class { padding: 0.5rem; }",
    "default": ".portal-class { padding: 1rem; }",
    "full": ".portal-class { padding: 2rem; }"
  },
  "targetClasses": ["portal-class"]
}

**slider**: Numeric values with ranges
{
  "type": "slider",
  "label": "Element Width",
  "description": "Adjust element width",
  "category": "layout", 
  "defaultValue": 200,
  "range": { "min": 100, "max": 500, "step": 10, "unit": "px" },
  "cssTemplate": ".portal-class { width: \${value}; }",
  "targetClasses": ["portal-class"]
}

**number-input**: Precise numeric input
{
  "type": "number-input",
  "label": "Font Size",
  "description": "Set exact font size", 
  "category": "styling",
  "defaultValue": 16,
  "range": { "min": 12, "max": 24, "step": 1, "unit": "px" },
  "cssTemplate": ".portal-class { font-size: \${value}; }",
  "targetClasses": ["portal-class"]
}

REQUIREMENTS:
- Create element groups based on what you see in the screenshot and available portal classes
- Generate preferences that make sense for each element group
- Use meaningful labels users would understand
- Include realistic default values and ranges
- Ensure targetClasses contain actual portal classes from the list above
- Units should be: px (pixels), rem (relative), % (percentage), or vh/vw (viewport)

RESPONSE FORMAT:
{
  "elements": [
    {
      "id": "unique-id",
      "name": "Element Group Name",
      "description": "What this group controls",
      "portalClasses": ["portal-class-1", "portal-class-2"],
      "preferences": [/* preference objects using schemas above */]
    }
  ]
}

NOTE: make preferences such that user feels like they have been provided with native control panel with options like u can hide or show actions, change layouts, change colors, change font and text size, etc.
REMEMBER: make sure the preferences you are generating should be css compatible, means if you are giving option to change layout make sure that element has properties like flex or grid or something as without that layout css change u gave wont work. Also try to good amount of granular hide/show options. so that user can hide/show any element they want, like a useful CTA or a heading or description or some text for a component 
Generate practical customization options based on the screenshot and portal classes. Return only JSON.`;
  }

  private generateFallbackUIPreferences(
    _portalElements: PortalElement[]
  ): LLMUIPreferencesResponse {
    // No fallback preferences - rely entirely on LLM for contextual generation
    // This ensures all preferences are genuinely relevant to the specific page
    console.warn('LLM failed to generate preferences - no fallback provided');
    return {
      elements: [],
    };
  }

  private convertLLMResponseToElements(llmResponse: LLMUIPreferencesResponse): DetectedElement[] {
    const elements: DetectedElement[] = [];

    llmResponse.elements.forEach((elementGroup, elementIndex) => {
      // Ensure element has a proper ID
      const elementId = elementGroup.id || `element-${elementIndex}`;

      const preferences: PreferenceOption[] = elementGroup.preferences.map((pref, prefIndex) => {
        // Generate proper IDs when missing or undefined
        const preferenceId =
          pref.id && pref.id !== 'undefined' ? pref.id : `${pref.type}-${prefIndex}`;

        console.log(`🔧 Processing preference for ${elementId}:`, {
          originalId: pref.id,
          generatedId: preferenceId,
          type: pref.type,
          label: pref.label,
        });

        return {
          id: preferenceId,
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
            cssTemplate: pref.cssTemplate,
            targetClasses: pref.targetClasses,
            range: pref.range,
            unit: pref.range?.unit || 'px', // Default unit for sliders
          },
        };
      });

      elements.push({
        id: elementId,
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

    console.log(
      '🔍 Converted elements:',
      elements.map(el => ({
        id: el.id,
        preferenceCount: el.availablePreferences.length,
        preferenceIds: el.availablePreferences.map(p => p.id),
      }))
    );

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

  getDefaultPrompt(currentCSS?: string): string {
    // Return a sample default prompt for display purposes
    const samplePortalClasses = ['portal-header', 'portal-nav', 'portal-content', 'portal-sidebar'];

    return this.createUIPreferencesPrompt(
      [
        {
          tagName: 'div',
          portalClasses: samplePortalClasses,
          tailwindClasses: ['flex', 'bg-white', 'p-4'],
          text: 'Sample portal content',
          children: [],
        },
      ],
      { 'portal-header': { display: 'flex', 'background-color': 'rgb(255, 255, 255)' } },
      currentCSS
    );
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

  private formatExistingStyles(
    portalClasses: string[],
    computedStyles: Record<string, Record<string, string>>
  ): string {
    const styles: string[] = [];

    // Define which properties are most relevant for UI customization
    const relevantProps = [
      'display',
      'position',
      'flex-direction',
      'justify-content',
      'align-items',
      'grid-template-columns',
      'margin',
      'padding',
      'width',
      'height',
      'background-color',
      'border',
      'border-radius',
      'font-size',
      'font-weight',
      'color',
    ];

    // Define values to skip (defaults/empty)
    const skipValues = new Set([
      '',
      'none',
      'auto',
      '0px',
      '0',
      'normal',
      'static',
      'visible',
      'rgba(0, 0, 0, 0)',
      'transparent',
      'initial',
      'inherit',
    ]);

    portalClasses.forEach(portalClass => {
      const computedStyle = computedStyles[portalClass];
      if (!computedStyle) return;

      const relevantStyles: string[] = [];

      relevantProps.forEach(prop => {
        const value = computedStyle[prop];
        if (value && !skipValues.has(value) && value.trim() !== '') {
          // Skip default text colors and backgrounds that aren't meaningful
          if (prop === 'color' && (value === 'rgb(0, 0, 0)' || value === 'rgb(255, 255, 255)'))
            return;
          if (prop === 'background-color' && value === 'rgb(255, 255, 255)') return;

          relevantStyles.push(`  ${prop}: ${value}`);
        }
      });

      // Only include classes that have meaningful styles
      if (relevantStyles.length > 0) {
        styles.push(`- .${portalClass}:`);
        styles.push(...relevantStyles);
      }
    });

    return styles.length > 0 ? styles.join('\n') : 'No significant computed styles detected.';
  }
}

export const domAnalysisService = new DOMAnalysisService();

// Real LLM service for CSS generation using Gemini
import { generateCSSWithGemini } from '@/utils/gemini';
import { getEnvVariable } from '@/utils/environment';
import { getActiveTab } from '@/utils/chrome-utils';
import { captureScreenshot } from '@/utils/screenshot';
import {
  CSS_GENERATION_RULES,
  ADDITIONAL_CSS_REQUIREMENTS,
} from '@/constants/css-generation-rules';

interface LLMResponse {
  understanding: string;
  reasoning: string;
  cssChanges: Array<{
    selector: string;
    property: string;
    oldValue: string;
    newValue: string;
    confidence: number;
  }>;
  suggestions: string[];
  processingTime: number;
}

interface LLMRequest {
  userInput: string;
  context?: {
    url: string;
    title: string;
    portalElements: PortalElement[];
  };
}

interface PortalElement {
  tagName: string;
  portalClasses: string[];
  tailwindClasses: string[];
  text?: string;
  children: PortalElement[];
}

export class LLMService {
  private isProcessing = false;

  async processMessage(request: LLMRequest): Promise<LLMResponse> {
    if (this.isProcessing) {
      throw new Error('LLM is already processing a request');
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Get API key
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) {
        console.warn('Gemini API key not found, using fallback response');
        return this.generateFallbackResponse(request, startTime);
      }

      // Get active tab for data collection
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Collect page data like pilot mode does
      const [screenshot, portalElements, currentCSS, computedStyles] = await Promise.all([
        captureScreenshot(tab.id),
        this.extractPortalElements(tab.id),
        this.getCurrentCSS(tab.id),
        this.getComputedStyles(tab.id),
      ]);

      if (portalElements.length === 0) {
        console.warn('No portal elements found on page');
        return this.generateFallbackResponse(request, startTime);
      }

      // Create prompt for Gemini
      const prompt = this.createChatPrompt(request.userInput, portalElements, currentCSS);

      // Convert to tree structure for Gemini
      const tree = this.createTreeFromElements(portalElements);
      const tailwindData = this.createTailwindData(portalElements);

      // Generate CSS using Gemini (same as pilot mode)
      const sessionId = `chat_${Date.now()}`;
      const rawGeneratedCSS = await generateCSSWithGemini(
        apiKey,
        prompt,
        tree,
        tailwindData,
        currentCSS,
        undefined, // No reference image for chat
        screenshot,
        computedStyles,
        sessionId
      );

      // Clean up the generated CSS
      const generatedCSS = this.cleanupGeneratedCSS(rawGeneratedCSS);

      if (!generatedCSS) {
        console.warn('No CSS generated from Gemini');
        return this.generateFallbackResponse(request, startTime);
      }

      // Parse CSS changes from generated CSS
      const cssChanges = this.parseCSSChanges(generatedCSS, portalElements);

      const response: LLMResponse = {
        understanding: `I understand you want to ${request.userInput.toLowerCase()}.`,
        reasoning: `I've analyzed the current page structure with ${portalElements.length} portal elements and generated appropriate CSS modifications.`,
        cssChanges,
        suggestions: this.generateContextualSuggestions(portalElements),
        processingTime: Date.now() - startTime,
      };

      return response;
    } catch (error) {
      console.error('Error processing message with Gemini:', error);
      return this.generateFallbackResponse(request, startTime);
    } finally {
      this.isProcessing = false;
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

          const portalElements = document.querySelectorAll('[class*="portal-"]');
          const elements: PortalElement[] = [];
          const processed = new Set<Element>();

          portalElements.forEach(element => {
            if (processed.has(element)) return;

            let topLevel = element;
            let parent = element.parentElement;
            while (parent && parent.classList.toString().includes('portal-')) {
              topLevel = parent;
              parent = parent.parentElement;
            }

            if (!processed.has(topLevel)) {
              const elementData = extractElementData(topLevel);
              if (elementData) {
                elements.push(elementData);
                const descendants = topLevel.querySelectorAll('[class*="portal-"]');
                descendants.forEach(desc => processed.add(desc));
                processed.add(topLevel);
              }
            }
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
          const styleEl = document.getElementById('portal-generated-css');
          return styleEl ? styleEl.textContent || '' : '';
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

  private createChatPrompt(
    userInput: string,
    portalElements: PortalElement[],
    currentCSS: string
  ): string {
    const portalClasses = this.getAllPortalClasses(portalElements);
    const portalTree = this.formatPortalTree(portalElements);

    return `You are a CSS expert. The user wants to: "${userInput}"

CURRENT PAGE STRUCTURE:
${portalTree}

AVAILABLE PORTAL CLASSES:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

CURRENT CSS:
${currentCSS || '/* No existing CSS */'}

${CSS_GENERATION_RULES}

${ADDITIONAL_CSS_REQUIREMENTS}
5. Focus on the specific styling the user mentioned
6. Make changes that are visually impactful
7. DO NOT duplicate existing CSS rules - only generate NEW or MODIFIED rules
8. Generate clean, minimal CSS without comments or explanations
9. Only use the portal classes listed above in the AVAILABLE PORTAL CLASSES section

Generate only the CSS rules needed to fulfill the user's request. Return only valid CSS without any explanations, comments, or markdown formatting.`;
  }

  private createTreeFromElements(elements: PortalElement[]): {
    element: string;
    portalClasses: string[];
    children: Array<{
      element: string;
      portalClasses: string[];
      text?: string;
      children: Array<{
        element: string;
        portalClasses: string[];
        text?: string;
        children: never[];
      }>;
    }>;
  } {
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
      element.portalClasses.forEach((cls: string) => {
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

  private cleanupGeneratedCSS(css: string): string {
    if (!css) return '';

    // Remove any markdown code blocks
    let cleanCSS = css.replace(/```css\n?|```\n?/g, '');

    // Remove any comments (including Chat AI comments)
    cleanCSS = cleanCSS.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove duplicate CSS rules
    cleanCSS = this.removeDuplicateCSS(cleanCSS);

    // Clean up whitespace
    cleanCSS = cleanCSS.replace(/\n\s*\n/g, '\n\n').trim();

    return cleanCSS;
  }

  private removeDuplicateCSS(css: string): string {
    const rules = css.match(/[^{}]+\{[^{}]*\}/g) || [];
    const uniqueRules = new Map<string, string>();

    rules.forEach(rule => {
      const selectorMatch = rule.match(/^([^{]+)\s*\{/);
      if (selectorMatch) {
        const selector = selectorMatch[1].trim();
        uniqueRules.set(selector, rule);
      }
    });

    return Array.from(uniqueRules.values()).join('\n\n');
  }

  private parseCSSChanges(
    generatedCSS: string,
    portalElements: PortalElement[]
  ): Array<{
    selector: string;
    property: string;
    oldValue: string;
    newValue: string;
    confidence: number;
  }> {
    const changes: Array<{
      selector: string;
      property: string;
      oldValue: string;
      newValue: string;
      confidence: number;
    }> = [];

    // Simple CSS parsing to extract changes
    const cssRules = generatedCSS.match(/[^{}]+\{[^{}]*\}/g) || [];

    cssRules.forEach(rule => {
      const selectorMatch = rule.match(/^([^{]+)\s*\{/);
      const propertiesMatch = rule.match(/\{([^}]*)\}/);

      if (selectorMatch && propertiesMatch) {
        const selector = selectorMatch[1].trim();
        const properties = propertiesMatch[1].trim();

        // Only include selectors that match our portal classes
        const portalClasses = this.getAllPortalClasses(portalElements);
        const hasPortalClass = portalClasses.some(cls => selector.includes(`.${cls}`));

        if (hasPortalClass) {
          const propertyLines = properties.split(';').filter(Boolean);
          propertyLines.forEach(line => {
            const [property, value] = line.split(':').map(s => s.trim());
            if (property && value) {
              changes.push({
                selector,
                property,
                oldValue: 'auto',
                newValue: value,
                confidence: 0.9,
              });
            }
          });
        }
      }
    });

    return changes;
  }

  private generateContextualSuggestions(portalElements: PortalElement[]): string[] {
    const suggestions = [
      'Try describing more specific changes',
      'Consider mentioning colors or layout preferences',
      'Ask for responsive design adjustments',
    ];

    // Add contextual suggestions based on available elements
    const portalClasses = this.getAllPortalClasses(portalElements);
    if (portalClasses.some(cls => cls.includes('header'))) {
      suggestions.push('Modify header styling');
    }
    if (portalClasses.some(cls => cls.includes('button'))) {
      suggestions.push('Improve button interactions');
    }
    if (portalClasses.some(cls => cls.includes('card'))) {
      suggestions.push('Enhance card appearance');
    }

    return suggestions;
  }

  private generateFallbackResponse(request: LLMRequest, startTime: number): LLMResponse {
    const { userInput } = request;
    const lowerInput = userInput.toLowerCase();

    let cssChanges = [];
    let understanding = '';
    let reasoning = '';

    if (lowerInput.includes('color') || lowerInput.includes('theme')) {
      understanding = 'I understand you want to modify the color scheme or theme.';
      reasoning = "I'll adjust the color palette to create better contrast and visual appeal.";
      cssChanges = [
        {
          selector: '.portal-primary',
          property: 'background-color',
          oldValue: '#007bff',
          newValue: '#4f46e5',
          confidence: 0.8,
        },
        {
          selector: '.portal-card',
          property: 'background-color',
          oldValue: '#ffffff',
          newValue: '#f8fafc',
          confidence: 0.85,
        },
      ];
    } else {
      understanding = `I understand you want to ${userInput.toLowerCase()}.`;
      reasoning = "I'll apply general improvements to enhance the visual appeal.";
      cssChanges = [
        {
          selector: '.portal-container',
          property: 'line-height',
          oldValue: '1.2',
          newValue: '1.6',
          confidence: 0.8,
        },
      ];
    }

    return {
      understanding,
      reasoning,
      cssChanges,
      suggestions: [
        'Try describing more specific changes',
        'Check that Gemini API key is set in Settings',
        'Ensure the page has portal elements',
      ],
      processingTime: Date.now() - startTime,
    };
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  generateSuggestions(context?: { portalElements: PortalElement[] }): string[] {
    if (context?.portalElements && context.portalElements.length > 0) {
      return [
        'Change the color scheme',
        'Improve button styling',
        'Add shadows to cards',
        'Make headers more prominent',
        'Adjust spacing and layout',
        'Enhance typography',
      ];
    }

    return [
      'Make the header more modern',
      'Improve button hover effects',
      'Add subtle shadows to cards',
      'Make the navigation more responsive',
      'Enhance the color scheme',
      'Improve typography spacing',
    ];
  }
}

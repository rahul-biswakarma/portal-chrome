// Context service for analyzing the current page
// This provides detailed page context for the Chat Customization System
import { getActiveTab } from '@/utils/chrome-utils';

interface DetailedPageContext {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  portalElements: PortalElement[];
  currentCSS: string;
  computedStyles: Record<string, Record<string, string>>;
  pageMetadata: {
    timestamp: number;
    elementsCount: number;
    portalClassesCount: number;
  };
}

interface PortalElement {
  tagName: string;
  portalClasses: string[];
  tailwindClasses: string[];
  text?: string;
  children: PortalElement[];
}

export class ContextService {
  private currentContext: DetailedPageContext | null = null;

  // Main analysis method - now does detailed analysis like pilot mode
  async analyzeCurrentPage(): Promise<DetailedPageContext> {
    const tab = await getActiveTab();
    if (!tab.id) {
      throw new Error('No active tab found');
    }

    // Get detailed data from the page
    const [portalElements, currentCSS, computedStyles, basicPageInfo] = await Promise.all([
      this.extractPortalElements(tab.id),
      this.getCurrentCSS(tab.id),
      this.getComputedStyles(tab.id),
      this.getBasicPageInfo(tab.id),
    ]);

    const context: DetailedPageContext = {
      url: basicPageInfo.url,
      title: basicPageInfo.title,
      viewport: basicPageInfo.viewport,
      portalElements,
      currentCSS,
      computedStyles,
      pageMetadata: {
        timestamp: Date.now(),
        elementsCount: portalElements.length,
        portalClassesCount: this.countUniquePortalClasses(portalElements),
      },
    };

    this.currentContext = context;
    return context;
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

  private async getBasicPageInfo(tabId: number): Promise<{
    url: string;
    title: string;
    viewport: { width: number; height: number };
  }> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          url: window.location.href,
          title: document.title,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        }),
      });

      return (
        result[0]?.result || {
          url: 'unknown',
          title: 'unknown',
          viewport: { width: 1920, height: 1080 },
        }
      );
    } catch (error) {
      console.error('Error getting basic page info:', error);
      return {
        url: 'unknown',
        title: 'unknown',
        viewport: { width: 1920, height: 1080 },
      };
    }
  }

  private countUniquePortalClasses(elements: PortalElement[]): number {
    const classes: string[] = [];
    const extractClasses = (element: PortalElement) => {
      classes.push(...element.portalClasses);
      element.children.forEach(extractClasses);
    };
    elements.forEach(extractClasses);
    return new Set(classes).size;
  }

  // Public getters
  getCurrentContext(): DetailedPageContext | null {
    return this.currentContext;
  }

  async refreshContext(): Promise<DetailedPageContext> {
    return this.analyzeCurrentPage();
  }
}

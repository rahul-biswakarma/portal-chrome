import { getActiveTab } from '@/utils/chrome-utils';
import { captureScreenshot } from '@/utils/screenshot';
import type {
  DataCollectionService,
  DataCollectionResult,
  PageData,
  PortalElement,
} from '../types';
import { createPilotError, validatePortalElements } from '../utils';

export class DataCollectionServiceImpl implements DataCollectionService {
  async collectPageData(): Promise<DataCollectionResult> {
    try {
      const tab = await getActiveTab();
      if (!tab.id) {
        return {
          success: false,
          error: 'No active tab found',
        };
      }

      // Collect all data in parallel where possible
      const [screenshot, portalElements, currentCSS, computedStyles, pageMetadata] =
        await Promise.all([
          this.capturePageScreenshot(tab.id),
          this.extractPortalElements(tab.id),
          this.getCurrentPageCSS(tab.id),
          this.getComputedStyles(tab.id),
          this.getPageMetadata(tab.id),
        ]);

      // Validate collected data
      const validation = validatePortalElements(portalElements);
      const warnings: string[] = [];

      if (!validation.valid) {
        warnings.push(...validation.issues);
      }

      if (!screenshot) {
        return {
          success: false,
          error: 'Failed to capture page screenshot',
        };
      }

      const data: PageData = {
        screenshot,
        portalElements,
        currentCSS,
        computedStyles,
        pageMetadata,
      };

      return {
        success: true,
        data,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      console.error('Error in data collection:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during data collection',
      };
    }
  }

  async extractPortalElements(tabId: number): Promise<PortalElement[]> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const extractElementData = (element: Element): PortalElement | null => {
            const classList = Array.from(element.classList);
            const portalClasses = classList.filter(cls => cls.startsWith('portal-'));

            // Enhanced Tailwind class detection
            const tailwindClasses = classList.filter(
              cls =>
                !cls.startsWith('portal-') &&
                // Layout
                (cls.startsWith('flex') ||
                  cls.startsWith('grid') ||
                  cls.startsWith('block') ||
                  cls.startsWith('inline') ||
                  cls.startsWith('hidden') ||
                  cls.startsWith('visible') ||
                  // Spacing
                  cls.startsWith('p-') ||
                  cls.startsWith('m-') ||
                  cls.startsWith('px-') ||
                  cls.startsWith('py-') ||
                  cls.startsWith('mx-') ||
                  cls.startsWith('my-') ||
                  cls.startsWith('pt-') ||
                  cls.startsWith('pb-') ||
                  cls.startsWith('pl-') ||
                  cls.startsWith('pr-') ||
                  cls.startsWith('mt-') ||
                  cls.startsWith('mb-') ||
                  cls.startsWith('ml-') ||
                  cls.startsWith('mr-') ||
                  cls.startsWith('space-') ||
                  // Sizing
                  cls.startsWith('w-') ||
                  cls.startsWith('h-') ||
                  cls.startsWith('min-w-') ||
                  cls.startsWith('min-h-') ||
                  cls.startsWith('max-w-') ||
                  cls.startsWith('max-h-') ||
                  // Colors
                  cls.startsWith('bg-') ||
                  cls.startsWith('text-') ||
                  cls.startsWith('border-') ||
                  cls.startsWith('ring-') ||
                  cls.startsWith('divide-') ||
                  cls.startsWith('placeholder-') ||
                  // Typography
                  cls.startsWith('font-') ||
                  cls.startsWith('text-') ||
                  cls.startsWith('leading-') ||
                  cls.startsWith('tracking-') ||
                  cls.startsWith('uppercase') ||
                  cls.startsWith('lowercase') ||
                  cls.startsWith('capitalize') ||
                  cls.startsWith('normal-case') ||
                  // Borders
                  cls.startsWith('rounded') ||
                  cls.startsWith('border') ||
                  cls.includes('border-') ||
                  // Effects
                  cls.startsWith('shadow') ||
                  cls.startsWith('opacity-') ||
                  cls.startsWith('backdrop-') ||
                  // Positioning
                  cls.startsWith('relative') ||
                  cls.startsWith('absolute') ||
                  cls.startsWith('fixed') ||
                  cls.startsWith('sticky') ||
                  cls.startsWith('static') ||
                  cls.startsWith('top-') ||
                  cls.startsWith('bottom-') ||
                  cls.startsWith('left-') ||
                  cls.startsWith('right-') ||
                  cls.startsWith('inset-') ||
                  cls.startsWith('z-') ||
                  // Display
                  cls.startsWith('table') ||
                  cls.startsWith('flow-') ||
                  cls.startsWith('contents') ||
                  // Overflow
                  cls.startsWith('overflow-') ||
                  cls.startsWith('overscroll-') ||
                  // Transform
                  cls.startsWith('transform') ||
                  cls.startsWith('rotate-') ||
                  cls.startsWith('scale-') ||
                  cls.startsWith('translate-') ||
                  cls.startsWith('skew-') ||
                  // Transition
                  cls.startsWith('transition') ||
                  cls.startsWith('duration-') ||
                  cls.startsWith('ease-') ||
                  cls.startsWith('delay-') ||
                  cls.startsWith('animate-'))
            );

            // Skip elements without portal classes and no portal descendants
            if (portalClasses.length === 0) {
              const hasPortalDescendants = element.querySelector('[class*="portal-"]');
              if (!hasPortalDescendants) return null;
            }

            // Get element attributes
            const attributes: Record<string, string> = {};
            for (const attr of element.attributes) {
              if (attr.name !== 'class') {
                attributes[attr.name] = attr.value;
              }
            }

            // Get bounding rectangle
            const rect = element.getBoundingClientRect();
            const boundingRect = {
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left,
            };

            // Extract children
            const children: PortalElement[] = [];
            Array.from(element.children).forEach(child => {
              const childData = extractElementData(child);
              if (childData) children.push(childData);
            });

            // Get text content (first 200 chars, excluding child text)
            const textContent =
              element.childNodes.length > 0
                ? Array.from(element.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent?.trim())
                    .filter(Boolean)
                    .join(' ')
                    .slice(0, 200)
                : '';

            return {
              tagName: element.tagName.toLowerCase(),
              portalClasses,
              tailwindClasses,
              text: textContent || undefined,
              children,
              attributes,
              boundingRect,
            };
          };

          // Start extraction from all portal elements
          const portalElements = document.querySelectorAll('[class*="portal-"]');
          const elements: PortalElement[] = [];
          const processed = new Set<Element>();

          portalElements.forEach(element => {
            if (processed.has(element)) return;

            // Find the top-level portal ancestor
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
                // Mark all descendants as processed
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

  async getCurrentPageCSS(tabId: number): Promise<string> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Try to get from portal-generated-css first
          const portalStyle = document.getElementById('portal-generated-css');
          if (portalStyle?.textContent) {
            return portalStyle.textContent;
          }

          // Fallback: extract all stylesheets that might contain portal classes
          let allCSS = '';

          // Check style elements
          const styleElements = document.querySelectorAll('style');
          styleElements.forEach(style => {
            const content = style.textContent || '';
            if (content.includes('.portal-')) {
              allCSS += content + '\n';
            }
          });

          // Check linked stylesheets (limited by CORS)
          try {
            const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
            linkElements.forEach(link => {
              const href = (link as HTMLLinkElement).href;
              if (href && href.startsWith(window.location.origin)) {
                // Can only access same-origin stylesheets
                fetch(href)
                  .then(response => response.text())
                  .then(css => {
                    if (css.includes('.portal-')) {
                      allCSS += css + '\n';
                    }
                  })
                  .catch(() => {
                    // Ignore CORS errors
                  });
              }
            });
          } catch (_error) {
            // Ignore errors from accessing stylesheets
          }

          return allCSS.trim();
        },
      });

      return result[0]?.result || '';
    } catch (error) {
      console.error('Error getting current CSS:', error);
      return '';
    }
  }

  async getComputedStyles(tabId: number): Promise<Record<string, Record<string, string>>> {
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

                // Comprehensive style properties to capture
                const props = [
                  // Layout
                  'display',
                  'position',
                  'top',
                  'right',
                  'bottom',
                  'left',
                  'z-index',
                  'float',
                  'clear',
                  'overflow',
                  'overflow-x',
                  'overflow-y',
                  // Box model
                  'width',
                  'height',
                  'min-width',
                  'min-height',
                  'max-width',
                  'max-height',
                  'margin',
                  'margin-top',
                  'margin-right',
                  'margin-bottom',
                  'margin-left',
                  'padding',
                  'padding-top',
                  'padding-right',
                  'padding-bottom',
                  'padding-left',
                  // Border
                  'border',
                  'border-width',
                  'border-style',
                  'border-color',
                  'border-top',
                  'border-right',
                  'border-bottom',
                  'border-left',
                  'border-radius',
                  'border-top-left-radius',
                  'border-top-right-radius',
                  'border-bottom-left-radius',
                  'border-bottom-right-radius',
                  // Background
                  'background',
                  'background-color',
                  'background-image',
                  'background-repeat',
                  'background-position',
                  'background-size',
                  'background-attachment',
                  // Typography
                  'color',
                  'font-family',
                  'font-size',
                  'font-weight',
                  'font-style',
                  'font-variant',
                  'line-height',
                  'letter-spacing',
                  'word-spacing',
                  'text-align',
                  'text-decoration',
                  'text-transform',
                  'text-indent',
                  'white-space',
                  'word-wrap',
                  'word-break',
                  // Visual effects
                  'opacity',
                  'visibility',
                  'box-shadow',
                  'text-shadow',
                  'filter',
                  'backdrop-filter',
                  // Flexbox
                  'flex',
                  'flex-direction',
                  'flex-wrap',
                  'flex-flow',
                  'justify-content',
                  'align-items',
                  'align-content',
                  'align-self',
                  'flex-grow',
                  'flex-shrink',
                  'flex-basis',
                  // Grid
                  'grid',
                  'grid-template-columns',
                  'grid-template-rows',
                  'grid-template-areas',
                  'grid-column',
                  'grid-row',
                  'grid-area',
                  'gap',
                  'column-gap',
                  'row-gap',
                  // Transform & transition
                  'transform',
                  'transform-origin',
                  'transition',
                  'animation',
                ];

                props.forEach(prop => {
                  const value = computedStyle.getPropertyValue(prop);
                  if (
                    value &&
                    value !== '' &&
                    value !== 'initial' &&
                    value !== 'auto' &&
                    value !== 'none'
                  ) {
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

  async capturePageScreenshot(tabId: number): Promise<string> {
    try {
      const screenshot = await captureScreenshot(tabId);
      return screenshot || '';
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      throw createPilotError('SCREENSHOT_FAILED', 'Failed to capture page screenshot', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async getPageMetadata(tabId: number): Promise<PageData['pageMetadata']> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          title: document.title,
          url: window.location.href,
          timestamp: Date.now(),
          viewportSize: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        }),
      });

      return (
        result[0]?.result || {
          title: '',
          url: '',
          timestamp: Date.now(),
          viewportSize: { width: 0, height: 0 },
        }
      );
    } catch (error) {
      console.error('Error getting page metadata:', error);
      return {
        title: '',
        url: '',
        timestamp: Date.now(),
        viewportSize: { width: 0, height: 0 },
      };
    }
  }
}

// Export singleton instance
export const dataCollectionService = new DataCollectionServiceImpl();

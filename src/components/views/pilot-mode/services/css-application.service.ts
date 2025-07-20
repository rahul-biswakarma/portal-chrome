import { getActiveTab } from '@/utils/chrome-utils';
import { captureScreenshot } from '@/utils/screenshot';
import type { CSSApplicationService, CSSApplicationResult } from '../types';
import { validateCSSStructure } from '../utils';

export class CSSApplicationServiceImpl implements CSSApplicationService {
  async applyCSS(css: string): Promise<CSSApplicationResult> {
    try {
      // Validate CSS before applying
      const validation = validateCSSStructure(css);
      if (!validation.valid) {
        return {
          success: false,
          appliedCSS: '',
          error: `Invalid CSS: ${validation.errors.join(', ')}`,
          validationResult: {
            validRules: 0,
            invalidRules: validation.errors,
            appliedRules: 0,
          },
        };
      }

      const tab = await getActiveTab();
      if (!tab.id) {
        return {
          success: false,
          appliedCSS: '',
          error: 'No active tab found',
        };
      }

      // Apply CSS to the page
      const applicationResult = await this.injectCSS(tab.id, css);

      if (!applicationResult.success) {
        return {
          success: false,
          appliedCSS: '',
          error: applicationResult.error || 'Failed to apply CSS',
        };
      }

      // Wait a moment for styles to be applied
      await new Promise(resolve => setTimeout(resolve, 500));

      // Capture screenshot after CSS application
      let screenshotAfter: string | undefined;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.id) {
          throw new Error('No active tab found');
        }
        screenshotAfter = await captureScreenshot(tab.id);
      } catch (error) {
        console.error('Error capturing screenshot after CSS application:', error);
      }

      // Count applied rules for validation result
      const ruleCount = this.countCSSRules(css);

      return {
        success: true,
        appliedCSS: css,
        screenshotAfter,
        validationResult: {
          validRules: ruleCount,
          invalidRules: [],
          appliedRules: ruleCount,
        },
      };
    } catch (error) {
      console.error('Error applying CSS:', error);
      return {
        success: false,
        appliedCSS: '',
        error: error instanceof Error ? error.message : 'Unknown error during CSS application',
      };
    }
  }

  async removeCSS(): Promise<boolean> {
    try {
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const styleEl = document.getElementById('portal-generated-css');
          if (styleEl) {
            styleEl.remove();
            return true;
          }
          return false;
        },
      });

      return true;
    } catch (error) {
      console.error('Error removing CSS:', error);
      return false;
    }
  }

  async validateApplication(css: string): Promise<boolean> {
    try {
      const tab = await getActiveTab();
      if (!tab.id) {
        return false;
      }

      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (expectedCSS: string) => {
          const styleEl = document.getElementById('portal-generated-css');
          if (!styleEl) {
            return false;
          }

          const appliedCSS = styleEl.textContent || '';
          return appliedCSS.trim() === expectedCSS.trim();
        },
        args: [css],
      });

      return result[0]?.result || false;
    } catch (error) {
      console.error('Error validating CSS application:', error);
      return false;
    }
  }

  private async injectCSS(
    tabId: number,
    css: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (cssCode: string) => {
          try {
            let styleEl = document.getElementById('portal-generated-css') as HTMLStyleElement;

            if (cssCode.trim() === '') {
              if (styleEl) {
                styleEl.remove();
              }
              return { success: true };
            }

            if (!styleEl) {
              styleEl = document.createElement('style');
              styleEl.id = 'portal-generated-css';
              styleEl.type = 'text/css';

              // Insert at the top of head for lower specificity (like main portal)
              // This requires generated CSS to use !important to override page styles
              if (document.head.firstChild) {
                document.head.insertBefore(styleEl, document.head.firstChild);
              } else {
                document.head.appendChild(styleEl);
              }
            }

            styleEl.textContent = cssCode;

            const appliedStyleEl = document.getElementById('portal-generated-css');
            if (appliedStyleEl && appliedStyleEl.textContent === cssCode) {
              return { success: true };
            } else {
              return { success: false, error: 'CSS application verification failed' };
            }
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error in CSS injection',
            };
          }
        },
        args: [css],
      });

      const injectionResult = result[0]?.result;
      if (!injectionResult) {
        return { success: false, error: 'No result from CSS injection script' };
      }

      return injectionResult;
    } catch (error) {
      console.error('Error injecting CSS:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to inject CSS',
      };
    }
  }

  private countCSSRules(css: string): number {
    try {
      // Count the number of CSS rules by counting opening braces
      // This is a simple approach - more sophisticated parsing could be added
      const ruleCount = (css.match(/\{/g) || []).length;
      return ruleCount;
    } catch (error) {
      console.error('Error counting CSS rules:', error);
      return 0;
    }
  }

  // Helper method to get current applied CSS
  async getCurrentAppliedCSS(): Promise<string> {
    try {
      const tab = await getActiveTab();
      if (!tab.id) {
        return '';
      }

      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const styleEl = document.getElementById('portal-generated-css');
          return styleEl ? styleEl.textContent || '' : '';
        },
      });

      return result[0]?.result || '';
    } catch (error) {
      console.error('Error getting current applied CSS:', error);
      return '';
    }
  }

  // Helper method to backup current CSS before applying new CSS
  async backupCurrentCSS(): Promise<string> {
    return await this.getCurrentAppliedCSS();
  }

  // Helper method to restore CSS from backup
  async restoreCSS(backupCSS: string): Promise<boolean> {
    if (!backupCSS) {
      return await this.removeCSS();
    }

    const result = await this.applyCSS(backupCSS);
    return result.success;
  }

  // Method to apply CSS with automatic backup and rollback on failure
  async applyCSSWithRollback(css: string): Promise<CSSApplicationResult> {
    const backup = await this.backupCurrentCSS();

    try {
      const result = await this.applyCSS(css);

      if (!result.success && backup) {
        // Rollback to previous CSS on failure
        console.log('CSS application failed, rolling back...');
        await this.restoreCSS(backup);
      }

      return result;
    } catch (error) {
      // Ensure rollback on any error
      if (backup) {
        await this.restoreCSS(backup);
      }

      throw error;
    }
  }

  // Method to gradually apply CSS (for debugging purposes)
  async applyCSSSafely(css: string, chunkSize = 10): Promise<CSSApplicationResult> {
    try {
      // Split CSS into rules
      const rules = css.split('}').filter(rule => rule.trim());

      // Apply rules in chunks
      let appliedRules = '';
      let successfulChunks = 0;

      for (let i = 0; i < rules.length; i += chunkSize) {
        const chunk = rules
          .slice(i, i + chunkSize)
          .map(rule => rule.trim() + '}')
          .join('\n');

        const chunkCSS = appliedRules + chunk;
        const result = await this.applyCSS(chunkCSS);

        if (result.success) {
          appliedRules = chunkCSS;
          successfulChunks++;
        } else {
          console.warn(`Failed to apply CSS chunk ${i / chunkSize + 1}:`, result.error);
          break;
        }
      }

      // Return final result
      if (appliedRules) {
        return await this.applyCSS(appliedRules);
      } else {
        return {
          success: false,
          appliedCSS: '',
          error: 'No CSS rules could be applied safely',
        };
      }
    } catch (error) {
      console.error('Error in safe CSS application:', error);
      return {
        success: false,
        appliedCSS: '',
        error: error instanceof Error ? error.message : 'Unknown error in safe CSS application',
      };
    }
  }
}

// Export singleton instance
export const cssApplicationService = new CSSApplicationServiceImpl();

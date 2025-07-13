// CSS Application Service for Chat AI
import { getActiveTab } from '@/utils/chrome-utils';
import type { CSSChange } from '../types/chat.types';

export class CSSApplicationService {
  private static instance: CSSApplicationService;

  static getInstance(): CSSApplicationService {
    if (!CSSApplicationService.instance) {
      CSSApplicationService.instance = new CSSApplicationService();
    }
    return CSSApplicationService.instance;
  }

  /**
   * Convert CSS changes array to actual CSS string
   */
  private convertChangesToCSS(changes: CSSChange[]): string {
    // Group changes by selector
    const groupedChanges: Record<string, CSSChange[]> = {};

    changes.forEach(change => {
      if (!groupedChanges[change.selector]) {
        groupedChanges[change.selector] = [];
      }
      groupedChanges[change.selector].push(change);
    });

    // Generate CSS rules
    const cssRules: string[] = [];

    Object.entries(groupedChanges).forEach(([selector, selectorChanges]) => {
      const properties = selectorChanges
        .map(change => `  ${change.property}: ${change.newValue};`)
        .join('\n');

      cssRules.push(`${selector} {\n${properties}\n}`);
    });

    return cssRules.join('\n\n');
  }

  /**
   * Apply CSS changes to the active tab and update CSS editor
   */
  async applyCSSChanges(
    changes: CSSChange[],
    setCssContent?: (css: string) => void
  ): Promise<boolean> {
    try {
      const tab = await getActiveTab();
      if (!tab.id) {
        console.error('No active tab found');
        return false;
      }

      // Convert changes to CSS
      const cssString = this.convertChangesToCSS(changes);

      // Get existing CSS to merge with new changes
      const existingCSS = await this.getCurrentCSS(tab.id);

      // Merge CSS (new changes will override existing ones)
      const mergedCSS = this.mergeCSS(existingCSS, cssString);

      // Apply the merged CSS to the page
      await this.applyCSS(tab.id, mergedCSS);

      // Update CSS editor content if setCssContent function is provided
      if (setCssContent) {
        setCssContent(mergedCSS);
      }

      return true;
    } catch (error) {
      console.error('Error applying CSS changes:', error);
      return false;
    }
  }

  /**
   * Get current CSS from the page
   */
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

  /**
   * Apply CSS to the page
   */
  private async applyCSS(tabId: number, css: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: (cssContent: string) => {
            // Remove existing style if it exists
            const existingStyle = document.getElementById('portal-generated-css');
            if (existingStyle) {
              existingStyle.remove();
            }

            // Create and add new style element
            const styleEl = document.createElement('style');
            styleEl.id = 'portal-generated-css';
            styleEl.textContent = cssContent;
            document.head.appendChild(styleEl);
          },
          args: [css],
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Merge existing CSS with new CSS
   */
  private mergeCSS(existingCSS: string, newCSS: string): string {
    if (!existingCSS) return newCSS;
    if (!newCSS) return existingCSS;

    // Remove previous Chat AI generated changes to avoid duplicates
    const cleanExistingCSS = this.removePreviousChatAIChanges(existingCSS);

    // Merge clean existing CSS with new CSS
    return `${cleanExistingCSS}\n\n${newCSS}`;
  }

  /**
   * Remove previous Chat AI generated changes from CSS
   */
  private removePreviousChatAIChanges(css: string): string {
    // Split by the Chat AI comment marker
    const parts = css.split('/* Chat AI Generated Changes */');

    // Keep only the first part (everything before the first Chat AI comment)
    return parts[0].trim();
  }

  /**
   * Remove applied CSS from the page and clear CSS editor
   */
  async removeAppliedCSS(setCssContent?: (css: string | null) => void): Promise<boolean> {
    try {
      const tab = await getActiveTab();
      if (!tab.id) {
        console.error('No active tab found');
        return false;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const existingStyle = document.getElementById('portal-generated-css');
          if (existingStyle) {
            existingStyle.remove();
          }
        },
      });

      // Clear CSS editor content if setCssContent function is provided
      if (setCssContent) {
        setCssContent(null);
      }

      return true;
    } catch (error) {
      console.error('Error removing CSS:', error);
      return false;
    }
  }
}

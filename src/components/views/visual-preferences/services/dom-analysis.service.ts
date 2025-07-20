import { getActiveTab } from '@/utils/chrome-utils';
import type { DetectedElement, DOMAnalysisResult, PreferenceOption } from '../types';

export class DOMAnalysisService {
  async analyzeDOM(): Promise<DOMAnalysisResult> {
    try {
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: this.analyzeDOMStructure,
      });

      const elements = result[0]?.result || [];

      return {
        elements,
        pageType: this.detectPageType(elements),
        confidence: this.calculateConfidence(elements),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error analyzing DOM:', error);
      throw error;
    }
  }

  private analyzeDOMStructure(): DetectedElement[] {
    const elements: DetectedElement[] = [];

    this.detectButtons(elements);
    this.detectNavigation(elements);
    this.detectCardContainers(elements);
    this.detectTabGroups(elements);

    return elements.filter(el => el.availablePreferences.length > 0);
  }

  private detectButtons(elements: DetectedElement[]): void {
    const buttons = document.querySelectorAll(
      'button, [role="button"], .btn, input[type="button"]'
    );
    buttons.forEach((button, index) => {
      if (!this.isVisible(button)) return;

      const text = this.getElementText(button);
      const isLoginButton = this.isLoginButton(text);

      elements.push({
        id: `button-${index}`,
        selector: this.generateUniqueSelector(button),
        type: 'button',
        description: `${text || 'Button'} ${isLoginButton ? '(Login)' : ''}`,
        currentState: {
          visible: true,
          display: window.getComputedStyle(button).display,
        },
        availablePreferences: this.getButtonPreferences(isLoginButton),
      });
    });
  }

  private detectNavigation(elements: DetectedElement[]): void {
    const navs = document.querySelectorAll('nav, [role="navigation"], .navbar, .menu');
    navs.forEach((nav, index) => {
      if (!this.isVisible(nav)) return;

      elements.push({
        id: `nav-${index}`,
        selector: this.generateUniqueSelector(nav),
        type: 'navigation',
        description: 'Navigation Menu',
        currentState: {
          visible: true,
          display: window.getComputedStyle(nav).display,
          layout: this.getLayoutType(nav),
        },
        availablePreferences: this.getNavigationPreferences(),
      });
    });
  }

  private detectCardContainers(elements: DetectedElement[]): void {
    const containers = document.querySelectorAll(
      '.card, .cards, .grid, .directory, [class*="card"]'
    );
    containers.forEach((container, index) => {
      if (!this.isVisible(container)) return;

      const childItems = container.querySelectorAll('.card, [class*="card"], .item');
      if (childItems.length < 2) return;

      elements.push({
        id: `cards-${index}`,
        selector: this.generateUniqueSelector(container),
        type: 'card-container',
        description: `Card Grid (${childItems.length} items)`,
        currentState: {
          visible: true,
          display: window.getComputedStyle(container).display,
          layout: this.getLayoutType(container),
        },
        availablePreferences: this.getCardContainerPreferences(),
      });
    });
  }

  private detectTabGroups(elements: DetectedElement[]): void {
    const tabGroups = document.querySelectorAll('[role="tablist"], .tabs, .tab-group');
    tabGroups.forEach((tabGroup, index) => {
      if (!this.isVisible(tabGroup)) return;

      elements.push({
        id: `tabs-${index}`,
        selector: this.generateUniqueSelector(tabGroup),
        type: 'tab-group',
        description: 'Tab Group',
        currentState: {
          visible: true,
          display: window.getComputedStyle(tabGroup).display,
          layout: this.getLayoutType(tabGroup),
        },
        availablePreferences: this.getTabGroupPreferences(),
      });
    });
  }

  private getButtonPreferences(isLoginButton: boolean): PreferenceOption[] {
    const preferences: PreferenceOption[] = [
      {
        id: 'visibility',
        type: 'toggle',
        label: 'Show Button',
        currentValue: true,
        category: 'visibility',
      },
    ];

    if (isLoginButton) {
      preferences.push({
        id: 'replace-text',
        type: 'dropdown',
        label: 'Button Text',
        currentValue: 'Login',
        availableValues: ['Login', 'Sign In', 'Log In', 'Enter', 'Access'],
        category: 'styling',
      });
    }

    return preferences;
  }

  private getNavigationPreferences(): PreferenceOption[] {
    return [
      {
        id: 'visibility',
        type: 'toggle',
        label: 'Show Navigation',
        currentValue: true,
        category: 'visibility',
      },
      {
        id: 'layout',
        type: 'layout-selector',
        label: 'Layout',
        currentValue: 'row',
        availableValues: ['row', 'column'],
        category: 'layout',
      },
    ];
  }

  private getCardContainerPreferences(): PreferenceOption[] {
    return [
      {
        id: 'layout',
        type: 'layout-selector',
        label: 'Card Layout',
        currentValue: 'grid',
        availableValues: ['row', 'column', 'grid'],
        category: 'layout',
      },
      {
        id: 'columns',
        type: 'dropdown',
        label: 'Columns',
        currentValue: 'auto',
        availableValues: ['1', '2', '3', '4', 'auto'],
        category: 'layout',
      },
    ];
  }

  private getTabGroupPreferences(): PreferenceOption[] {
    return [
      {
        id: 'visibility',
        type: 'toggle',
        label: 'Show Tabs',
        currentValue: true,
        category: 'visibility',
      },
      {
        id: 'layout',
        type: 'layout-selector',
        label: 'Tab Layout',
        currentValue: 'row',
        availableValues: ['row', 'column'],
        category: 'layout',
      },
    ];
  }

  private isVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    );
  }

  private generateUniqueSelector(element: Element): string {
    if (element.id) return `#${element.id}`;

    const classes = Array.from(element.classList).filter(
      cls => cls.length < 20 && !cls.startsWith('_')
    );

    if (classes.length > 0) {
      return `.${classes.join('.')}`;
    }

    return element.tagName.toLowerCase();
  }

  private getElementText(element: Element): string {
    return element.textContent?.trim().slice(0, 50) || '';
  }

  private isLoginButton(text: string): boolean {
    const loginKeywords = ['login', 'sign in', 'log in', 'enter', 'access'];
    return loginKeywords.some(keyword => text.toLowerCase().includes(keyword));
  }

  private getLayoutType(element: Element): 'row' | 'column' | 'grid' {
    const style = window.getComputedStyle(element);

    if (style.display === 'grid') return 'grid';
    if (style.display === 'flex') {
      return style.flexDirection === 'column' ? 'column' : 'row';
    }

    return 'column';
  }

  private detectPageType(elements: DetectedElement[]): string {
    const elementTypes = elements.map(el => el.type);

    if (elementTypes.includes('card-container')) return 'dashboard';
    if (elementTypes.includes('form') && elementTypes.includes('button')) return 'form-page';
    if (elementTypes.filter(type => type === 'navigation').length > 1) return 'complex-app';

    return 'general';
  }

  private calculateConfidence(elements: DetectedElement[]): number {
    if (elements.length === 0) return 0;
    if (elements.length < 3) return 0.3;
    if (elements.length < 6) return 0.7;
    return 0.9;
  }
}

export const domAnalysisService = new DOMAnalysisService();

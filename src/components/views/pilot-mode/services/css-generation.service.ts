import { generateCSSWithGemini } from '@/utils/gemini';
import type {
  CSSGenerationService,
  PageData,
  PilotConfig,
  CSSGenerationOptions,
  PortalElement,
} from '../types';
import type { TreeNode } from '@/types';

// Helper type for tree structure (local to avoid conflict with global TreeNode)
interface LocalTreeNode {
  element?: string;
  tagName?: string;
  portalClasses: string[];
  tailwindClasses: string[];
  text?: string;
  children: LocalTreeNode[];
}
import {
  cleanCSSResponse,
  validateCSSStructure,
  formatPortalTree,
  generateFreshSessionId,
} from '../utils';

export class CSSGenerationServiceImpl implements CSSGenerationService {
  async generateCSS(
    pageData: PageData,
    _config: PilotConfig,
    options: CSSGenerationOptions
  ): Promise<string> {
    try {
      // Generate fresh session ID for each CSS generation (no chat history)
      const sessionId = generateFreshSessionId('css-gen');

      if (options.iteration === 1) {
        // First iteration: generate CSS from scratch
        return await this.generateInitialCSS(pageData, _config, sessionId);
      } else {
        // Subsequent iterations: use feedback-based generation
        return await this.generateImprovedCSS(pageData, _config, options, sessionId);
      }
    } catch (error) {
      console.error('Error generating CSS:', error);
      throw new Error(
        `CSS generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async validateCSS(css: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const validation = validateCSSStructure(css);
    const warnings: string[] = [];

    // Additional validation checks
    if (css.length < 50) {
      warnings.push('Generated CSS appears to be very short');
    }

    if (!css.includes('@media')) {
      warnings.push('CSS does not include responsive breakpoints');
    }

    // Check for modern CSS features
    const modernFeatures = ['flex', 'grid', 'transform', 'transition'];
    const hasModernFeatures = modernFeatures.some(feature => css.toLowerCase().includes(feature));

    if (!hasModernFeatures) {
      warnings.push('CSS may not utilize modern layout features');
    }

    return {
      isValid: validation.valid,
      errors: validation.errors,
      warnings,
    };
  }

  private async generateInitialCSS(
    pageData: PageData,
    config: PilotConfig,
    sessionId: string
  ): Promise<string> {
    const prompt = this.createInitialPrompt(pageData, config);

    // Convert portal elements to tree structure expected by generateCSSWithGemini
    const localTree = this.createTreeFromPortalElements(pageData.portalElements);
    const simpleTree = this.convertToGlobalTreeNode(localTree);

    // Create tailwind data structure
    const tailwindData = this.createTailwindDataFromElements(pageData.portalElements);

    const response = await generateCSSWithGemini(
      process.env.GEMINI_API_KEY || '', // This will be handled by the function itself
      prompt,
      simpleTree,
      tailwindData,
      pageData.currentCSS,
      config.referenceImages[0]?.url,
      pageData.screenshot,
      pageData.computedStyles,
      sessionId
    );

    return cleanCSSResponse(response);
  }

  private async generateImprovedCSS(
    pageData: PageData,
    _config: PilotConfig,
    options: CSSGenerationOptions,
    sessionId: string
  ): Promise<string> {
    const prompt = this.createFeedbackPrompt(pageData, _config, options);

    // Convert portal elements to tree structure expected by generateCSSWithGemini
    const localTree = this.createTreeFromPortalElements(pageData.portalElements);
    const tree = this.convertToGlobalTreeNode(localTree);
    const tailwindData = this.createTailwindDataFromElements(pageData.portalElements);

    // Generate CSS using Gemini
    const css = await generateCSSWithGemini(
      process.env.GEMINI_API_KEY || '',
      prompt,
      tree,
      tailwindData,
      pageData.currentCSS,
      _config.referenceImages[0]?.url,
      pageData.screenshot,
      pageData.computedStyles,
      sessionId
    );

    if (!css) {
      throw new Error('No CSS generated from Gemini');
    }

    return cleanCSSResponse(css);
  }

  private createInitialPrompt(pageData: PageData, config: PilotConfig): string {
    const portalTree = formatPortalTree(pageData.portalElements);

    return `Create CSS to transform this page to match the reference design.

DESIGN GOAL: ${config.designDescription || 'Transform the page to match the reference design aesthetics'}

PORTAL ELEMENTS:
${portalTree}

CURRENT CSS:
${pageData.currentCSS || '/* No existing CSS */'}

REQUIREMENTS:
1. Use ONLY the portal classes listed above
2. Generate complete CSS that matches the reference design
3. Focus on colors, typography, spacing, layout, and visual effects
4. Make it modern and visually appealing
5. Ensure good contrast and accessibility

${config.advancedSettings.generateResponsiveCSS ? 'Include responsive breakpoints for mobile and tablet.' : ''}
${config.advancedSettings.useImportantDeclarations ? 'Use !important declarations where necessary to override existing styles.' : ''}
${config.advancedSettings.optimizeForPerformance ? 'Optimize CSS for performance with efficient selectors.' : ''}

Generate clean, modern CSS that transforms the page to match the reference design.`;
  }

  private createFeedbackPrompt(
    pageData: PageData,
    config: PilotConfig,
    options: CSSGenerationOptions
  ): string {
    const portalTree = formatPortalTree(pageData.portalElements);

    return `Improve the CSS based on feedback to better match the reference design.

DESIGN GOAL: ${config.designDescription || 'Transform the page to match the reference design aesthetics'}

ITERATION: ${options.iteration}
PREVIOUS FEEDBACK: ${options.previousFeedback || 'No specific feedback provided'}

PORTAL ELEMENTS:
${portalTree}

CURRENT CSS:
${pageData.currentCSS || '/* No existing CSS */'}

REQUIREMENTS:
1. Address the specific feedback provided
2. Improve visual accuracy to match the reference design
3. Build upon the existing CSS rather than starting over
4. Focus on the areas mentioned in the feedback
5. Maintain any working elements from the previous iteration

${config.advancedSettings.generateResponsiveCSS ? 'Ensure responsive design is maintained.' : ''}
${config.advancedSettings.useImportantDeclarations ? 'Use !important where needed to override existing styles.' : ''}

Generate improved CSS that addresses the feedback while maintaining existing improvements.`;
  }

  private convertToGlobalTreeNode(localNode: LocalTreeNode): TreeNode {
    return {
      element: localNode.element || localNode.tagName || 'div',
      portalClasses: localNode.portalClasses,
      children: localNode.children.map(child => this.convertToGlobalTreeNode(child)),
    };
  }

  private createTreeFromPortalElements(elements: PortalElement[]): LocalTreeNode {
    return {
      element: 'div',
      portalClasses: [],
      tailwindClasses: [],
      children: elements.map(element => this.convertElementToTreeNode(element)),
    };
  }

  private convertElementToTreeNode(element: PortalElement): LocalTreeNode {
    return {
      element: element.tagName,
      portalClasses: element.portalClasses,
      tailwindClasses: element.tailwindClasses,
      text: element.text,
      children: element.children.map(child => this.convertElementToTreeNode(child)),
    };
  }

  private createTailwindDataFromElements(elements: PortalElement[]): Record<string, string[]> {
    const tailwindData: Record<string, string[]> = {};

    const processElement = (element: PortalElement) => {
      if (element.portalClasses.length > 0) {
        tailwindData[element.portalClasses[0]] = element.tailwindClasses;
      }
      element.children.forEach(processElement);
    };

    elements.forEach(processElement);
    return tailwindData;
  }
}

// Export singleton instance
export const cssGenerationService = new CSSGenerationServiceImpl();

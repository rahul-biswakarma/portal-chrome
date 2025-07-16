import { generateCSSWithGemini } from '@/utils/gemini';
import { getEnvVariable } from '@/utils/environment';
import {
  CSS_GENERATION_RULES,
  ADDITIONAL_CSS_REQUIREMENTS,
} from '@/constants/css-generation-rules';
import type {
  CSSGenerationService,
  PageData,
  PilotConfig,
  CSSGenerationOptions,
  PortalElement,
} from '../types';
import {
  cleanCSSResponse,
  validateCSSStructure,
  formatPortalTree,
  getAllPortalClasses,
  generateFreshSessionId,
} from '../utils';

// Helper type for tree structure
interface TreeNode {
  element: string;
  portalClasses: string[];
  tailwindClasses: string[];
  text?: string;
  children: TreeNode[];
}

export class SimpleCSSGenerationService implements CSSGenerationService {
  async generateCSS(
    pageData: PageData,
    config: PilotConfig,
    options: CSSGenerationOptions
  ): Promise<string> {
    try {
      // Get API key
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('Gemini API key not found. Please set it in Settings.');
      }

      // Generate fresh session ID for each generation (no chat history)
      const sessionId = generateFreshSessionId('css-gen');

      // Create the prompt based on iteration
      const prompt =
        options.iteration === 1
          ? this.createInitialPrompt(pageData, config)
          : this.createFeedbackPrompt(pageData, config, options);

      // Convert portal elements to tree structure
      const tree = this.createTreeFromPortalElements(pageData.portalElements);

      // Create tailwind data structure
      const tailwindData = this.createTailwindDataFromElements(pageData.portalElements);

      // Generate CSS using Gemini
      const css = await generateCSSWithGemini(
        apiKey,
        prompt,
        tree,
        tailwindData,
        pageData.currentCSS,
        config.referenceImages[0]?.url,
        pageData.screenshot,
        pageData.computedStyles,
        sessionId
      );

      if (!css) {
        throw new Error('No CSS generated from Gemini');
      }

      const cleanedCSS = cleanCSSResponse(css);

      // Validate the generated CSS
      const validation = validateCSSStructure(cleanedCSS);
      if (!validation.valid) {
        console.warn('Generated CSS has validation issues:', validation.errors);
        // Still return it, but log the issues
      }

      return cleanedCSS;
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

    if (!css.includes('@media') && css.length > 200) {
      warnings.push('CSS does not include responsive breakpoints');
    }

    // Check for modern CSS features
    const modernFeatures = ['flex', 'grid', 'transform', 'transition'];
    const hasModernFeatures = modernFeatures.some(feature => css.toLowerCase().includes(feature));

    if (!hasModernFeatures && css.length > 100) {
      warnings.push('CSS may not utilize modern layout features');
    }

    return {
      isValid: validation.valid,
      errors: validation.errors,
      warnings,
    };
  }

  private createTreeFromPortalElements(elements: PortalElement[]): TreeNode {
    return {
      element: 'div',
      portalClasses: [],
      tailwindClasses: [],
      children: elements.map(el => this.convertElementToTreeNode(el)),
    };
  }

  private convertElementToTreeNode(element: PortalElement): TreeNode {
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

  private createInitialPrompt(pageData: PageData, config: PilotConfig): string {
    const portalClasses = getAllPortalClasses(pageData.portalElements);
    const portalTree = formatPortalTree(pageData.portalElements);

    return `Create CSS to transform this page to match the reference design.

DESIGN GOAL: ${config.designDescription || 'Transform the page to match the reference design aesthetics'}

PORTAL ELEMENTS:
${portalTree}

AVAILABLE CLASSES:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

CURRENT CSS:
${pageData.currentCSS || '/* No existing CSS */'}

${CSS_GENERATION_RULES}

${ADDITIONAL_CSS_REQUIREMENTS}
5. Generate complete CSS that matches the reference design
6. Only use the portal classes listed above in the AVAILABLE CLASSES section

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
    const portalClasses = getAllPortalClasses(pageData.portalElements);

    return `Improve the CSS based on feedback to better match the reference design.

DESIGN GOAL: ${config.designDescription || 'Transform the page to match the reference design aesthetics'}

ITERATION: ${options.iteration}
PREVIOUS FEEDBACK: ${options.previousFeedback || 'No specific feedback provided'}

FOCUS AREAS: ${options.focusAreas?.join(', ') || 'General improvements'}

CURRENT CSS:
${pageData.currentCSS || '/* No existing CSS */'}

AVAILABLE CLASSES:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

${CSS_GENERATION_RULES}

${ADDITIONAL_CSS_REQUIREMENTS}
5. Address the specific feedback provided
6. Improve visual accuracy to match the reference design
7. Build upon the existing CSS rather than starting over
8. Focus on the areas mentioned in the feedback
9. Maintain any working elements from the previous iteration
10. Only use the portal classes listed above in the AVAILABLE CLASSES section

${config.advancedSettings.generateResponsiveCSS ? 'Ensure responsive design is maintained.' : ''}
${config.advancedSettings.useImportantDeclarations ? 'Use !important where needed to override existing styles.' : ''}

Generate improved CSS that addresses the feedback while maintaining existing improvements.`;
  }
}

// Export singleton instance
export const simpleCSSGenerationService = new SimpleCSSGenerationService();

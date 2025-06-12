import { 
  generateCSSWithGemini, 
} from '@/utils/gemini-client';
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
  getAllPortalClasses,
  generateFreshSessionId
} from '../utils';

export class CSSGenerationServiceImpl implements CSSGenerationService {
  
  async generateCSS(
    pageData: PageData,
    config: PilotConfig,
    options: CSSGenerationOptions
  ): Promise<string> {
    try {
      // Generate fresh session ID for each CSS generation (no chat history)
      const sessionId = generateFreshSessionId('css-gen');
      
      if (options.iteration === 1) {
        // First iteration: generate CSS from scratch
        return await this.generateInitialCSS(pageData, config, sessionId);
      } else {
        // Subsequent iterations: use feedback-based generation
        return await this.generateImprovedCSS(pageData, config, options, sessionId);
      }
    } catch (error) {
      console.error('Error generating CSS:', error);
      throw new Error(`CSS generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    const hasModernFeatures = modernFeatures.some(feature => 
      css.toLowerCase().includes(feature)
    );
    
    if (!hasModernFeatures) {
      warnings.push('CSS may not utilize modern layout features');
    }
    
    return {
      isValid: validation.valid,
      errors: validation.errors,
      warnings
    };
  }

  private async generateInitialCSS(
    pageData: PageData,
    config: PilotConfig,
    sessionId: string
  ): Promise<string> {
    const prompt = this.createInitialCSSPrompt(pageData, config);
    
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
      0, // iteration
      config.referenceImages[0]?.url,
      pageData.screenshot,
      pageData.computedStyles,
      sessionId
    );

    return cleanCSSResponse(response);
  }

  private async generateImprovedCSS(
    pageData: PageData,
    config: PilotConfig,
    options: CSSGenerationOptions,
    sessionId: string
  ): Promise<string> {
    const prompt = this.createFeedbackCSSPrompt(pageData, config, options);
    
    // Convert portal elements to tree structure
    const localTree = this.createTreeFromPortalElements(pageData.portalElements);
    const simpleTree = this.convertToGlobalTreeNode(localTree);
    
    // Create tailwind data structure
    const tailwindData = this.createTailwindDataFromElements(pageData.portalElements);

    // Use generateCSSWithGemini for improved CSS as well
    const response = await generateCSSWithGemini(
      process.env.GEMINI_API_KEY || '',
      prompt,
      simpleTree,
      tailwindData,
      pageData.currentCSS,
      options.iteration - 1, // Gemini function expects 0-based iteration
      config.referenceImages[0]?.url,
      pageData.screenshot,
      pageData.computedStyles,
      sessionId
    );

    return cleanCSSResponse(response);
  }

  private createInitialCSSPrompt(pageData: PageData, config: PilotConfig): string {
    const portalClasses = getAllPortalClasses(pageData.portalElements);
    const portalTree = formatPortalTree(pageData.portalElements);
    
    return `
# CSS Generation Task

You are a professional web designer tasked with creating CSS that will transform the current page to match the provided reference design(s).

## Design Goal
${config.designDescription || 'Transform the page to match the reference design aesthetics'}

## Current Page Analysis

### Portal Elements Structure:
\`\`\`
${portalTree}
\`\`\`

### Available Portal Classes:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

### Current Applied CSS:
\`\`\`css
${pageData.currentCSS || '/* No existing portal CSS found */'}
\`\`\`

### Page Metadata:
- Title: ${pageData.pageMetadata.title}
- URL: ${pageData.pageMetadata.url}
- Viewport: ${pageData.pageMetadata.viewportSize.width}x${pageData.pageMetadata.viewportSize.height}

## Advanced Settings Applied:
- Preserve Existing Styles: ${config.advancedSettings.preserveExistingStyles ? 'Yes' : 'No'}
- Use Important Declarations: ${config.advancedSettings.useImportantDeclarations ? 'Yes' : 'No'}
- Generate Responsive CSS: ${config.advancedSettings.generateResponsiveCSS ? 'Yes' : 'No'}
- Optimize for Performance: ${config.advancedSettings.optimizeForPerformance ? 'Yes' : 'No'}

## Requirements:

1. **ONLY use the portal classes** listed above - do not create new classes
2. **Generate complete CSS** that transforms the current page to match the reference design
3. **Focus on visual accuracy** - colors, typography, spacing, layout, effects
4. **Ensure responsive design** if enabled in settings
5. **Preserve existing functionality** if specified in settings
6. **Use modern CSS features** for optimal results

## CSS Generation Guidelines:

- Use flexbox and grid for layout where appropriate
- Implement smooth transitions and hover effects
- Ensure proper color contrast and accessibility
- Generate responsive breakpoints (@media queries) if enabled
- Use CSS custom properties (variables) for consistency
- Optimize selectors for performance if enabled
- Add visual enhancements like shadows, gradients, animations where appropriate

## Output Format:
Provide only the CSS code, no explanations or markdown formatting.
Ensure all CSS rules target the existing portal classes.

Generate the CSS now:
`;
  }

  private createFeedbackCSSPrompt(
    pageData: PageData,
    config: PilotConfig,
    options: CSSGenerationOptions
  ): string {
    const portalClasses = getAllPortalClasses(pageData.portalElements);
    const portalTree = formatPortalTree(pageData.portalElements);
    
    return `
# CSS Improvement Task - Iteration ${options.iteration}

You are refining CSS based on feedback to better match the reference design(s).

## Design Goal
${config.designDescription || 'Transform the page to match the reference design aesthetics'}

## Previous Feedback
${options.previousFeedback || 'No specific feedback provided'}

## Focus Areas for This Iteration
${options.focusAreas?.map(area => `- ${area}`).join('\n') || '- General improvements needed'}

## Current Page Analysis

### Portal Elements Structure:
\`\`\`
${portalTree}
\`\`\`

### Available Portal Classes:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

### Previously Applied CSS:
\`\`\`css
${pageData.currentCSS || '/* No previous CSS found */'}
\`\`\`

### Priority Classes (if specified):
${options.priorityClasses?.map(cls => `- .${cls}`).join('\n') || 'None specified'}

### Styles to Preserve (if specified):
${options.preserveStyles?.map(style => `- ${style}`).join('\n') || 'None specified'}

## Improvement Strategy:

1. **Address specific feedback** provided above
2. **Focus on areas** that need the most improvement
3. **Maintain working elements** from previous iteration
4. **Enhance visual accuracy** to match reference design
5. **Improve responsiveness** and user experience

## Advanced Settings Applied:
- Preserve Existing Styles: ${config.advancedSettings.preserveExistingStyles ? 'Yes' : 'No'}
- Use Important Declarations: ${config.advancedSettings.useImportantDeclarations ? 'Yes' : 'No'}
- Generate Responsive CSS: ${config.advancedSettings.generateResponsiveCSS ? 'Yes' : 'No'}
- Optimize for Performance: ${config.advancedSettings.optimizeForPerformance ? 'Yes' : 'No'}

## Requirements:

1. **ONLY modify the portal classes** listed above
2. **Address the feedback** specifically and systematically
3. **Maintain visual improvements** from previous iterations
4. **Focus on problem areas** identified in feedback
5. **Ensure compatibility** with the existing page structure

## Output Format:
Provide only the improved CSS code, no explanations or markdown formatting.
Generate complete CSS that builds upon previous work while addressing feedback.

Generate the improved CSS now:
`;
  }

  // Helper method to analyze current CSS and suggest improvements
  async analyzeCSSForImprovement(
    currentCSS: string,
    pageData: PageData,
    config: PilotConfig
  ): Promise<{
    suggestions: string[];
    focusAreas: string[];
    priorityClasses: string[];
  }> {
    const suggestions: string[] = [];
    const focusAreas: string[] = [];
    const priorityClasses: string[] = [];
    
    // Analyze current CSS for common issues
    if (!currentCSS.includes('transition')) {
      suggestions.push('Add smooth transitions for better UX');
      focusAreas.push('Interactive elements and hover states');
    }
    
    if (!currentCSS.includes('@media')) {
      suggestions.push('Add responsive breakpoints');
      focusAreas.push('Mobile and tablet responsiveness');
    }
    
    if (!currentCSS.includes('box-shadow') && !currentCSS.includes('filter')) {
      suggestions.push('Add depth and visual hierarchy with shadows');
      focusAreas.push('Visual depth and modern aesthetics');
    }
    
    // Check for color usage
    const hasCustomColors = /color\s*:\s*(?!inherit|initial|unset)/.test(currentCSS);
    if (!hasCustomColors) {
      suggestions.push('Improve color scheme and branding');
      focusAreas.push('Color consistency and brand alignment');
    }
    
    // Check for spacing issues
    const hasSpacing = /(?:margin|padding)/.test(currentCSS);
    if (!hasSpacing) {
      suggestions.push('Improve spacing and layout');
      focusAreas.push('Layout spacing and visual rhythm');
    }
    
    // Identify priority classes (classes that appear most frequently)
    const allClasses = getAllPortalClasses(pageData.portalElements);
    const classFrequency = new Map<string, number>();
    
    pageData.portalElements.forEach(element => {
      element.portalClasses.forEach(cls => {
        classFrequency.set(cls, (classFrequency.get(cls) || 0) + 1);
      });
    });
    
    // Sort by frequency and take top classes
    const sortedClasses = Array.from(classFrequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cls]) => cls);
    
    priorityClasses.push(...sortedClasses);
    
    return {
      suggestions,
      focusAreas,
      priorityClasses
    };
  }

  private convertToGlobalTreeNode(localNode: LocalTreeNode): TreeNode {
    return {
      element: localNode.element || localNode.tagName || 'div',
      portalClasses: localNode.portalClasses,
      children: localNode.children.map(child => this.convertToGlobalTreeNode(child))
    };
  }

  private createTreeFromPortalElements(elements: PortalElement[]): LocalTreeNode {
    return {
      element: 'div',
      tagName: 'div',
      portalClasses: [],
      tailwindClasses: [],
      children: elements.map(el => this.convertElementToTreeNode(el))
    };
  }

  private convertElementToTreeNode(element: PortalElement): LocalTreeNode {
    return {
      element: element.tagName,
      tagName: element.tagName,
      portalClasses: element.portalClasses,
      tailwindClasses: element.tailwindClasses,
      text: element.text,
      children: element.children.map(child => this.convertElementToTreeNode(child))
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
}

// Export singleton instance
export const cssGenerationService = new CSSGenerationServiceImpl(); 
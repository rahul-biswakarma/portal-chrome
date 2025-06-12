// Simplified LLM service for CSS generation
// This is a mock implementation that can be easily replaced with real LLM integration

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
    portalElements: Element[];
  };
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
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

      // Generate mock response based on user input
      const response = this.generateMockResponse(request);
      response.processingTime = Date.now() - startTime;

      return response;
    } finally {
      this.isProcessing = false;
    }
  }

  private generateMockResponse(request: LLMRequest): LLMResponse {
    const { userInput } = request;
    const lowerInput = userInput.toLowerCase();

    // Simple pattern matching for demonstration
    if (lowerInput.includes('header') || lowerInput.includes('navigation')) {
      return this.generateHeaderResponse(userInput);
    } else if (lowerInput.includes('button')) {
      return this.generateButtonResponse(userInput);
    } else if (lowerInput.includes('color') || lowerInput.includes('theme')) {
      return this.generateColorResponse(userInput);
    } else if (lowerInput.includes('shadow') || lowerInput.includes('depth')) {
      return this.generateShadowResponse(userInput);
    } else if (lowerInput.includes('responsive') || lowerInput.includes('mobile')) {
      return this.generateResponsiveResponse(userInput);
    } else {
      return this.generateGenericResponse(userInput);
    }
  }

  private generateHeaderResponse(_userInput: string): LLMResponse {
    return {
      understanding: `I understand you want to modify the header/navigation styling.`,
      reasoning: `I'll enhance the header with modern styling including improved typography, subtle shadows, and better spacing for a more professional appearance.`,
      cssChanges: [
        {
          selector: '.portal-header',
          property: 'box-shadow',
          oldValue: 'none',
          newValue: '0 2px 8px rgba(0, 0, 0, 0.1)',
          confidence: 0.9
        },
        {
          selector: '.portal-header',
          property: 'backdrop-filter',
          oldValue: 'none',
          newValue: 'blur(10px)',
          confidence: 0.8
        },
        {
          selector: '.portal-nav-item',
          property: 'transition',
          oldValue: 'none',
          newValue: 'all 0.2s ease',
          confidence: 0.95
        }
      ],
      suggestions: [
        'Add hover effects to navigation items',
        'Consider a sticky header for better UX',
        'Adjust header height for mobile devices'
      ],
      processingTime: 0
    };
  }

  private generateButtonResponse(_userInput: string): LLMResponse {
    return {
      understanding: `I understand you want to improve button styling and interactions.`,
      reasoning: `I'll enhance buttons with smooth transitions, improved hover states, and better visual feedback for user interactions.`,
      cssChanges: [
        {
          selector: '.portal-button',
          property: 'transition',
          oldValue: 'none',
          newValue: 'all 0.3s ease',
          confidence: 0.95
        },
        {
          selector: '.portal-button:hover',
          property: 'transform',
          oldValue: 'none',
          newValue: 'translateY(-2px)',
          confidence: 0.85
        },
        {
          selector: '.portal-button',
          property: 'border-radius',
          oldValue: '4px',
          newValue: '8px',
          confidence: 0.8
        }
      ],
      suggestions: [
        'Add button loading states',
        'Consider disabled button styling',
        'Implement focus states for accessibility'
      ],
      processingTime: 0
    };
  }

  private generateColorResponse(_userInput: string): LLMResponse {
    return {
      understanding: `I understand you want to modify the color scheme or theme.`,
      reasoning: `I'll adjust the color palette to create better contrast, visual hierarchy, and overall aesthetic appeal.`,
      cssChanges: [
        {
          selector: '.portal-primary',
          property: 'background-color',
          oldValue: '#007bff',
          newValue: '#4f46e5',
          confidence: 0.8
        },
        {
          selector: '.portal-card',
          property: 'background-color',
          oldValue: '#ffffff',
          newValue: '#f8fafc',
          confidence: 0.85
        },
        {
          selector: '.portal-text',
          property: 'color',
          oldValue: '#333333',
          newValue: '#1e293b',
          confidence: 0.9
        }
      ],
      suggestions: [
        'Add dark mode support',
        'Consider brand color consistency',
        'Test color contrast for accessibility'
      ],
      processingTime: 0
    };
  }

  private generateShadowResponse(_userInput: string): LLMResponse {
    return {
      understanding: `I understand you want to add depth and shadows to elements.`,
      reasoning: `I'll add subtle shadows and depth effects to create visual hierarchy and a more modern, layered appearance.`,
      cssChanges: [
        {
          selector: '.portal-card',
          property: 'box-shadow',
          oldValue: 'none',
          newValue: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          confidence: 0.9
        },
        {
          selector: '.portal-card:hover',
          property: 'box-shadow',
          oldValue: 'none',
          newValue: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          confidence: 0.85
        }
      ],
      suggestions: [
        'Add transition effects for shadow changes',
        'Consider elevation hierarchy',
        'Adjust shadow intensity for brand feel'
      ],
      processingTime: 0
    };
  }

  private generateResponsiveResponse(_userInput: string): LLMResponse {
    return {
      understanding: `I understand you want to improve responsive design and mobile experience.`,
      reasoning: `I'll adjust layouts, spacing, and sizing to ensure optimal display across different screen sizes.`,
      cssChanges: [
        {
          selector: '.portal-container',
          property: 'padding',
          oldValue: '20px',
          newValue: 'clamp(16px, 4vw, 32px)',
          confidence: 0.9
        },
        {
          selector: '.portal-grid',
          property: 'grid-template-columns',
          oldValue: 'repeat(3, 1fr)',
          newValue: 'repeat(auto-fit, minmax(300px, 1fr))',
          confidence: 0.85
        }
      ],
      suggestions: [
        'Test on various device sizes',
        'Consider touch target sizes',
        'Add mobile-specific interactions'
      ],
      processingTime: 0
    };
  }

  private generateGenericResponse(_userInput: string): LLMResponse {
    return {
      understanding: `I understand you want to improve the overall styling of your website.`,
      reasoning: `I'll apply general improvements including better spacing, typography, and visual polish.`,
      cssChanges: [
        {
          selector: '.portal-container',
          property: 'line-height',
          oldValue: '1.2',
          newValue: '1.6',
          confidence: 0.8
        },
        {
          selector: '.portal-spacing',
          property: 'margin-bottom',
          oldValue: '16px',
          newValue: '24px',
          confidence: 0.75
        }
      ],
      suggestions: [
        'Specify more details for targeted changes',
        'Consider focusing on specific components',
        'Try describing the desired visual outcome'
      ],
      processingTime: 0
    };
  }

  // Utility methods
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  // Generate suggestions based on current context
  generateSuggestions(context?: { portalElements: Element[] }): string[] {
    const baseSuggestions = [
      "Make the header more modern",
      "Improve button hover effects", 
      "Add subtle shadows to cards",
      "Enhance the color scheme",
      "Improve mobile responsiveness",
      "Add smooth transitions"
    ];

    // Add context-specific suggestions if portal elements are available
    if (context?.portalElements) {
      const hasButtons = context.portalElements.some(el => 
        el.classList.contains('portal-button') || el.tagName.toLowerCase() === 'button'
      );
      const hasCards = context.portalElements.some(el => 
        el.classList.contains('portal-card')
      );

      if (hasButtons) {
        baseSuggestions.push("Add button loading states", "Improve button accessibility");
      }
      if (hasCards) {
        baseSuggestions.push("Add card hover animations", "Improve card spacing");
      }
    }

    return baseSuggestions.slice(0, 6); // Return up to 6 suggestions
  }
} 
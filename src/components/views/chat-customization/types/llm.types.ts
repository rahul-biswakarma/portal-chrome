// LLM integration types for the Chat Customization System
import type { CSSChange, PageContext } from './chat.types';

// LLM service request
export interface LLMRequest {
  userInput: string;
  context: PageContext;
  sessionHistory: LLMMessage[];
  constraints?: LLMConstraints;
  model?: string;
  temperature?: number;
}

// LLM message format
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

// LLM response structure
export interface LLMResponse {
  understanding: string;
  reasoning: string;
  cssChanges: CSSChange[];
  accessibility: A11yConsideration[];
  suggestions: string[];
  confidence: number;
  warnings?: string[];
  processingTime?: number;
  usage?: LLMUsage;
}

// Accessibility considerations from LLM
export interface A11yConsideration {
  type: 'improvement' | 'warning' | 'requirement';
  description: string;
  element?: string;
  property?: string;
  recommendation: string;
  wcagLevel?: 'A' | 'AA' | 'AAA';
}

// LLM constraints and settings
export interface LLMConstraints {
  maxTokens?: number;
  allowedSelectors?: string[];
  forbiddenSelectors?: string[];
  preserveExisting?: boolean;
  responsiveFirst?: boolean;
  darkModeSupport?: boolean;
}

// LLM usage statistics
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

// Prompt building context
export interface PromptContext {
  pageTitle: string;
  pageUrl: string;
  viewportSize: string;
  portalElementCount: number;
  cssLineCount: number;
  portalElementTree: string;
  currentCSS: string;
  tailwindClassMap: string;
  userInput: string;
}

// LLM service configuration
export interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  retryAttempts: number;
  rateLimitPerMinute: number;
}

// Error types for LLM operations
export interface LLMError {
  type: 'network' | 'auth' | 'quota' | 'validation' | 'parsing' | 'timeout';
  message: string;
  code?: string;
  retryable: boolean;
  context?: Record<string, unknown>;
}

// LLM provider types
export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'local';

// Model capabilities
export interface ModelCapabilities {
  maxContextLength: number;
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  costPerToken: number;
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

// Streaming response for real-time updates
export interface LLMStreamResponse {
  delta: string;
  isComplete: boolean;
  intermediateResult?: Partial<LLMResponse>;
}

// Validation result for LLM output
export interface LLMValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitizedResponse?: LLMResponse;
}

// Validation error types
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

// Validation warning types
export interface ValidationWarning {
  field: string;
  message: string;
  impact: 'low' | 'medium' | 'high';
}

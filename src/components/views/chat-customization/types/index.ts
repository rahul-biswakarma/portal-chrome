// Core interfaces and types for Chat Customization System
export * from './chat.types';
export * from './context.types';
export * from './llm.types';

// Re-export commonly used types
export type {
  ChatMessage,
  ChatSession,
  CSSChange,
  UserPreferences,
  StyleTemplate,
  PageContext,
  PortalElement,
  DOMSnapshot,
} from './chat.types';
export type { EnhancedPortalElement, StyleModificationRequest } from './context.types';
export type { LLMResponse, LLMRequest } from './llm.types';

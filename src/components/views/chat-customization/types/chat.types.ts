// Chat-specific types for the Chat Customization System

// Basic Portal Element type for chat context
export interface PortalElement {
  id: string;
  selector: string;
  className: string;
  tagName: string;
  textContent?: string;
  attributes: Record<string, string>;
  boundingRect?: DOMRect;
}

// DOM Structure snapshot
export interface DOMSnapshot {
  timestamp: number;
  elements: PortalElement[];
  rootElement: string;
}

// Chat message types
export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    cssChanges?: CSSChange[];
    portalElements?: PortalElement[];
    suggestions?: string[];
    processingTime?: number;
    isTyping?: boolean;
  };
}

// Chat session management
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  context: PageContext;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  isActive?: boolean;
}

// CSS modification tracking
export interface CSSChange {
  selector: string;
  property: string;
  oldValue: string;
  newValue: string;
  confidence: number;
  reasoning?: string;
  timestamp?: number;
}

// User preferences for chat system
export interface UserPreferences {
  defaultModel?: string;
  autoApplyChanges?: boolean;
  showSuggestions?: boolean;
  theme?: 'light' | 'dark' | 'system';
  maxHistoryLength?: number;
}

// Style template for reusable patterns
export interface StyleTemplate {
  id: string;
  name: string;
  description: string;
  cssChanges: CSSChange[];
  tags: string[];
  createdAt: number;
  usageCount: number;
}

// Page context for chat system
export interface PageContext {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  portalElements: PortalElement[];
  currentCSS: string;
  computedStyles: Record<string, CSSStyleDeclaration>;
  tailwindClasses: Record<string, string[]>;
  domStructure?: DOMSnapshot;
}

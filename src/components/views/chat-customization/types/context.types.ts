// Context analysis types for the Chat Customization System
import type { PortalElement, PageContext, DOMSnapshot } from './chat.types';

// Enhanced portal element with additional analysis data
export interface EnhancedPortalElement extends PortalElement {
  computedStyles: CSSStyleDeclaration;
  boundingBox: DOMRect;
  visibility: boolean;
  interactions: InteractionInfo[];
  semanticRole: string;
  accessibilityInfo: A11yInfo;
  parent?: EnhancedPortalElement;
  children: EnhancedPortalElement[];
}

// Interaction information for elements
export interface InteractionInfo {
  type: 'click' | 'hover' | 'focus' | 'scroll';
  frequency: number;
  lastInteraction: number;
  userIntent?: string;
}

// Accessibility information
export interface A11yInfo {
  role?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  tabIndex?: number;
  hasKeyboardAccess: boolean;
  contrastRatio?: number;
  issues: A11yIssue[];
}

// Accessibility issues
export interface A11yIssue {
  type: 'contrast' | 'keyboard' | 'aria' | 'structure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggestion?: string;
}

// Style modification request
export interface StyleModificationRequest {
  intent: string;
  targetElements: string[];
  styleProperties: string[];
  context: PageContext;
  constraints?: StyleConstraints;
  priority?: 'low' | 'medium' | 'high';
}

// Style constraints for modifications
export interface StyleConstraints {
  preserveLayout?: boolean;
  maintainAccessibility?: boolean;
  responsiveBreakpoints?: string[];
  maxFileSize?: number;
  allowedProperties?: string[];
  forbiddenProperties?: string[];
}

// Tailwind class mapping
export interface TailwindClassMap {
  [selector: string]: {
    classes: string[];
    utilities: string[];
    responsive: Record<string, string[]>;
  };
}

// Change impact analysis
export interface ChangeImpact {
  affectedElements: string[];
  layoutShifts: LayoutChange[];
  performanceImpact: PerformanceMetrics;
  accessibilityImpact: A11yImpact;
  responsiveBreakage: ResponsiveIssue[];
  riskLevel: 'low' | 'medium' | 'high';
}

// Layout change information
export interface LayoutChange {
  element: string;
  property: string;
  oldValue: string | number;
  newValue: string | number;
  impact: 'minor' | 'moderate' | 'major';
}

// Performance metrics
export interface PerformanceMetrics {
  cssSize: number;
  renderTime: number;
  reflowCount: number;
  repaintAreas: number;
  criticalRenderingPath: boolean;
}

// Accessibility impact assessment
export interface A11yImpact {
  contrastChanges: ContrastChange[];
  keyboardNavigationAffected: boolean;
  screenReaderImpact: 'none' | 'minor' | 'moderate' | 'major';
  focusOrderChanged: boolean;
  ariaAttributesAffected: string[];
}

// Contrast change tracking
export interface ContrastChange {
  element: string;
  oldRatio: number;
  newRatio: number;
  meetsWCAG: boolean;
  level: 'AA' | 'AAA';
}

// Responsive design issues
export interface ResponsiveIssue {
  breakpoint: string;
  element: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

// Export PageContext for compatibility
export type { PageContext, PortalElement, DOMSnapshot };

export type Tab =
  | 'customize'
  | 'hierarchy'
  | 'versions'
  | 'settings'
  | 'theme-editor';

// Node in the portal class tree
export interface TreeNode {
  element: string;
  portalClasses: string[];
  children: TreeNode[];
  id?: string; // Optional ID for node identification
}

// CSS version data
export interface CSSVersion {
  id: string;
  timestamp: number;
  description: string;
  css: string;
  prompt?: string;
}

// Tailwind class data
export interface TailwindClassData {
  [selector: string]: string[];
}

// Status types for UI feedback
export const StatusType = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

export type StatusType = (typeof StatusType)[keyof typeof StatusType];

// Processing stages for the UI
export const ProcessStage = {
  IDLE: 'idle',
  TAKING_SCREENSHOT: 'taking_screenshot',
  ANALYZING_CURRENT: 'analyzing_current',
  ANALYZING_TARGET: 'analyzing_target',
  COMPARING_IMAGES: 'comparing_images',
  GENERATING_PROMPT: 'generating_prompt',
  EXTRACTING_CLASSES: 'extracting_classes',
  GENERATING_CSS: 'generating_css',
  APPLYING: 'applying',
  VALIDATING: 'validating',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type ProcessStage = (typeof ProcessStage)[keyof typeof ProcessStage];

// Chrome message type
export interface ChromeMessage {
  action: string;
  data?: unknown;
}

export interface ViewTabsSchema {
  id: string;
  trigger: React.ReactNode;
  content: React.ReactNode;
}

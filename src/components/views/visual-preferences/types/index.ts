export interface DetectedElement {
  id: string;
  selector: string;
  type: ElementType;
  description: string;
  currentState: ElementState;
  availablePreferences: PreferenceOption[];
}

export type ElementType =
  | 'button'
  | 'navigation'
  | 'card-container'
  | 'tab-group'
  | 'header'
  | 'sidebar'
  | 'content-area'
  | 'form'
  | 'list'
  | 'other';

export interface ElementState {
  visible: boolean;
  display?: string;
  position?: string;
  layout?: 'row' | 'column' | 'grid';
  alignment?: 'left' | 'center' | 'right';
  size?: 'small' | 'medium' | 'large';
}

export interface PreferenceOption {
  id: string;
  type: PreferenceType;
  label: string;
  description?: string;
  currentValue: PreferenceValue;
  availableValues?: PreferenceValue[];
  category: PreferenceCategory;
}

export type PreferenceType =
  | 'toggle'
  | 'dropdown'
  | 'radio'
  | 'slider'
  | 'color-picker'
  | 'layout-selector';

export type PreferenceValue = boolean | string | number | Record<string, unknown>;

export type PreferenceCategory = 'visibility' | 'layout' | 'styling' | 'position' | 'behavior';

export interface UserPreferences {
  [elementId: string]: {
    [preferenceId: string]: PreferenceValue;
  };
}

export interface PreferenceGroup {
  id: string;
  title: string;
  description?: string;
  elements: DetectedElement[];
  category: PreferenceCategory;
}

export interface VisualPreferencesState {
  isLoading: boolean;
  detectedElements: DetectedElement[];
  userPreferences: UserPreferences;
  preferenceGroups: PreferenceGroup[];
  generatedCSS: string;
  hasUnsavedChanges: boolean;
}

export interface DOMAnalysisResult {
  elements: DetectedElement[];
  pageType: string;
  confidence: number;
  timestamp: number;
}

export interface CSSGenerationOptions {
  minify: boolean;
  addComments: boolean;
  useImportant: boolean;
  respectExistingStyles: boolean;
}

export interface PreferencesService {
  analyzeDOM(): Promise<DOMAnalysisResult>;
  generateCSS(preferences: UserPreferences, options?: CSSGenerationOptions): Promise<string>;
  savePreferences(preferences: UserPreferences): Promise<void>;
  loadPreferences(): Promise<UserPreferences>;
  resetPreferences(): Promise<void>;
}

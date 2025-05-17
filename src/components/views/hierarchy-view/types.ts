// Custom tree node interface
export interface ArboristNode {
  id: string;
  name: string;
  isElement: boolean;
  tagName?: string; // HTML tag name if isElement is true
  portalClasses?: string[];
  tailwindClasses?: Record<string, string[]>; // Map of portal classes to their associated Tailwind classes
  children?: ArboristNode[];
}

// Tree data structure
export interface TreeData {
  rootNode: ArboristNode;
}

// Colors mapping for different classes
export interface ClassColorMap {
  [className: string]: string;
}

// Hierarchy data hook return type
export interface HierarchyDataResult {
  treeData: TreeData | null;
  arboristData: ArboristNode[];
  loading: boolean;
  error: string | null;
  classColors: ClassColorMap;
  handleClassHover: (className: string | null) => void;
}

// Custom tree node interface
export interface ArboristNode {
  id: string;
  name: string;
  isElement: boolean;
  tagName?: string; // HTML tag name if isElement is true
  portalClasses?: string[];
  tailwindClasses?: Record<string, string[]>; // Map of portal classes to their associated Tailwind classes
  children?: ArboristNode[];
  parentId?: string; // Reference to parent node for better tree structure
}

// Tree data structure
export interface TreeData {
  rootNode: ArboristNode;
}

// Color map for portal classes
export type ClassColorMap = Record<string, string>;

// Hierarchy data hook return type
export interface HierarchyDataResult {
  treeData: TreeData | null;
  arboristData: ArboristNode[];
  loading: boolean;
  error: string | null;
  classColors: ClassColorMap;
  handleClassHover: (className: string | null) => void;
}

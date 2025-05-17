import type { TreeNode } from '@/types';
import type { ArboristNode } from '../types';

// Simplified function to check if we can access this page
export const canAccessPage = (url: string): boolean => {
  // Check if the URL is a restricted URL
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('about:')
  ) {
    return false;
  }
  return true;
};

// Convert TreeNode to format used by our custom tree
export const convertToArboristFormat = (
  node: TreeNode,
  parentId = '',
): ArboristNode => {
  const nodeId = parentId ? `${parentId}-${node.element}` : node.element;

  // Add element node
  const elementNode: ArboristNode = {
    id: nodeId,
    name: node.element,
    isElement: true,
    children: [],
  };

  // Add portal classes as children of the element node
  if (node.portalClasses.length > 0) {
    elementNode.children = node.portalClasses.map((cls) => ({
      id: `${nodeId}-${cls}`,
      name: cls,
      portalClasses: [cls],
      isElement: false,
    }));
  }

  // Process child elements
  if (node.children.length > 0) {
    const childrenNodes: ArboristNode[] = [];

    node.children.forEach((child) => {
      const childNode = convertToArboristFormat(child, nodeId);
      childrenNodes.push(childNode);
    });

    // Add children only if there are actual children
    if (childrenNodes.length > 0) {
      if (!elementNode.children) {
        elementNode.children = [];
      }
      elementNode.children.push(...childrenNodes);
    }
  }

  return elementNode;
};

// Check for any portal classes in the entire tree
export const hasPortalClasses = (node: TreeNode | null): boolean => {
  if (!node) return false;

  // Check if current node has portal classes
  if (node.portalClasses && node.portalClasses.length > 0) {
    return true;
  }

  // Check children recursively
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      if (hasPortalClasses(child)) {
        return true;
      }
    }
  }

  return false;
};

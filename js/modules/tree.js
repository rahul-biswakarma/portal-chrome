/**
 * Tree visualization module for portal class hierarchy
 */
import { safeSendMessage } from '../utils/messaging.js';

// Tree visualization functionality

// Tree-related functionality

/**
 * Creates a text representation of the tree node
 * @param {Object} node - The tree node to represent
 * @param {number} level - The indentation level
 * @param {boolean} isLast - Whether this is the last child at this level
 * @returns {string} Text representation of the tree
 */
export function createTreeNode(node, level = 0, isLast = true) {
  let text = '';

  // Create the indentation with vertical lines for hierarchy
  if (level > 0) {
    for (let i = 0; i < level - 1; i++) {
      text += '\u2502  ';
    }
    text += isLast ? '\u2514\u2500 ' : '\u251C\u2500 ';
  }

  // Add element tag and portal classes
  text += node.element;
  if (node.portalClasses.length > 0) {
    text += ' [' + node.portalClasses.join(', ') + ']';
  }
  text += '\n';

  // Add child nodes
  const childCount = node.children.length;
  node.children.forEach((child, index) => {
    text += createTreeNode(child, level + 1, index === childCount - 1);
  });

  return text;
}

/**
 * Extracts all portal classes from the tree
 * @param {Object} node - The tree node to extract classes from
 * @returns {Array} Array of portal classes
 */
export function extractPortalClasses(node) {
  let classes = [...node.portalClasses];
  node.children.forEach(child => {
    classes = classes.concat(extractPortalClasses(child));
  });
  return classes;
}

/**
 * Simplifies a tree structure for AI processing
 * @param {Object} node - The tree node to simplify
 * @returns {Object} Simplified tree structure
 */
export function simplifyTree(node) {
  const simplified = {
    element: node.element,
    portalClasses: node.portalClasses,
    tailwindClasses: node.tailwindClasses || [],
    children: []
  };

  if (node.children && node.children.length > 0) {
    simplified.children = node.children.map(child => simplifyTree(child));
  }

  return simplified;
}

/**
 * Load the portal class hierarchy from the active tab
 * @param {function} callback - Callback function with the tree data
 */
export function loadPortalClassHierarchy(callback) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs[0]) {
      callback(null, 'No active tab found');
      return;
    }

    safeSendMessage(tabs[0].id, {action: 'getPortalClassTree'}, (response) => {
      if (!response || !response.success) {
        callback(null, response?.error || 'Failed to get portal class tree');
        return;
      }
      callback(response.data);
    });
  });
}

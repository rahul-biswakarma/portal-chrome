import type { TreeNode } from '../types'
import { getActiveTab, safeSendMessage } from '../utils/chrome-utils'

/**
 * Load the portal class tree from the active tab
 * @returns Promise resolving to the portal class tree
 */
export const loadTreeData = async (): Promise<TreeNode> => {
  try {
    const tab = await getActiveTab()

    const response = await safeSendMessage(tab.id!, {
      action: 'getPortalClassTree',
    })

    if (!response || !response.success) {
      throw new Error('Failed to get portal class tree data')
    }

    return response.data
  } catch (error) {
    console.error('Error loading tree data:', error)
    throw error
  }
}

/**
 * Simplify a tree node for display or API use
 * @param node The node to simplify
 * @returns A simplified representation of the node
 */
export const simplifyTree = (node: TreeNode): any => {
  return {
    element: node.element,
    portalClasses: node.portalClasses,
    children: node.children.map(simplifyTree),
  }
}

/**
 * Collect all portal classes from a tree
 * @param node The root node
 * @returns Array of all portal classes
 */
export const extractPortalClasses = (node: TreeNode): string[] => {
  let classes = [...node.portalClasses]
  node.children.forEach((child) => {
    classes = classes.concat(extractPortalClasses(child))
  })
  // Remove duplicates
  return [...new Set(classes)]
}

/**
 * Collect tailwind classes from the current tab
 * @returns Promise resolving to the tailwind class data
 */
export const collectTailwindClasses = async (): Promise<
  Record<string, string[]>
> => {
  try {
    const tab = await getActiveTab()

    const response = await safeSendMessage(tab.id!, {
      action: 'getTailwindClasses',
    })

    if (!response || !response.success) {
      throw new Error('Failed to collect tailwind classes')
    }

    return response.data || {}
  } catch (error) {
    console.error('Error collecting tailwind classes:', error)
    // Return empty object as fallback
    return {}
  }
}

/**
 * Get the current CSS from the page
 * @returns Promise resolving to the current CSS
 */
export const getCurrentCSS = async (): Promise<string> => {
  try {
    const tab = await getActiveTab()

    const response = await safeSendMessage(tab.id!, {
      action: 'getCurrentCSS',
    })

    if (!response || !response.success) {
      throw new Error('Failed to get current CSS')
    }

    return response.data || ''
  } catch (error) {
    console.error('Error getting current CSS:', error)
    return ''
  }
}

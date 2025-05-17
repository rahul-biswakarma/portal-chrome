import { useState, useEffect, useCallback } from 'react';
import type { TreeNode, TailwindClassData } from '@/types';

import {
  canAccessPage,
  convertToArboristFormat,
} from '../utils/tree-data-utils';
import { generateUniqueColors } from '../utils/color-generator';
import type { ArboristNode } from '../types';

export function useHierarchyData() {
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [arboristData, setArboristData] = useState<ArboristNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [classColors, setClassColors] = useState<Record<string, string>>({});
  const [tailwindClasses, setTailwindClasses] = useState<TailwindClassData>({});

  // Fetch class hierarchy data
  const fetchTreeData = async (tabId: number) => {
    try {
      // Request tree data from content script
      const response = await chrome.tabs
        .sendMessage(tabId, {
          action: 'getPortalClassTree',
        })
        .catch((err) => {
          console.error('Message send error:', err);
          return { success: false, error: 'Failed to get response from page' };
        });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to get portal class tree');
      }

      setTreeData(response.data);

      // Now fetch Tailwind classes associated with portal classes
      const tailwindResponse = await chrome.tabs
        .sendMessage(tabId, {
          action: 'getTailwindClasses',
        })
        .catch((err) => {
          console.error('Message send error for Tailwind classes:', err);
          return { success: false, error: 'Failed to get Tailwind classes' };
        });

      if (tailwindResponse?.success) {
        console.log(
          'DEBUG: Received Tailwind classes from content script:',
          tailwindResponse.data,
        );
        setTailwindClasses(tailwindResponse.data);
      } else {
        console.warn(
          'DEBUG: Failed to get Tailwind classes:',
          tailwindResponse?.error,
        );
      }
    } catch (err) {
      console.error('Error fetching class tree:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Check connection and load data
  const initializeConnection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id || !tab.url) {
        setError('No active tab found or URL is undefined');
        setLoading(false);
        return;
      }

      // Check if the URL is restricted
      if (!canAccessPage(tab.url)) {
        setError(
          "Cannot access this page. Extension can't run on browser system pages.",
        );
        setLoading(false);
        return;
      }

      // Try to inject the content script first to ensure it's available
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
      } catch (injectionError) {
        console.error('Script injection error:', injectionError);
        setError(
          'Failed to inject content script. This page may not allow script injection.',
        );
        setLoading(false);
        return;
      }

      // Wait a moment to let the script initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now try to ping the content script
      const response = await chrome.tabs
        .sendMessage(tab.id, {
          action: 'ping',
        })
        .catch(() => ({
          success: false,
          error: 'Content script not available',
        }));

      if (response?.success) {
        setConnected(true);
        fetchTreeData(tab.id);
      } else {
        setError(
          'Cannot establish connection with the page content. The page might not be compatible.',
        );
        setLoading(false);
      }
    } catch (err) {
      console.error('Connection check failed:', err);
      setError('Failed to establish connection with the page');
      setLoading(false);
    }
  }, []);

  // Refresh data function that can be called from outside
  const refreshData = () => {
    initializeConnection();
  };

  // Initial load
  useEffect(() => {
    initializeConnection();
  }, [initializeConnection]);

  // Convert tree data when it changes
  useEffect(() => {
    if (treeData) {
      // Generate colors for unique classes
      const colors = generateUniqueColors(treeData);
      setClassColors(colors);

      // Start conversion from root
      const rootNode = convertToArboristFormat(treeData, tailwindClasses);
      setArboristData([rootNode]);
    }
  }, [treeData, tailwindClasses]);

  // Highlight elements when hovering over a class in the tree
  const handleClassHover = async (className: string | null) => {
    if (!connected) return;

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return;

      if (className) {
        // Highlight elements with the hovered class
        await chrome.tabs
          .sendMessage(tab.id, {
            action: 'highlightElements',
            data: { classes: [className] },
          })
          .catch((err) => console.error('Highlight error:', err));
      } else {
        // Remove highlight when not hovering
        await chrome.tabs
          .sendMessage(tab.id, {
            action: 'removeHighlight',
          })
          .catch((err) => console.error('Remove highlight error:', err));
      }
    } catch (err) {
      console.error('Error highlighting elements:', err);
    }
  };

  return {
    treeData,
    arboristData,
    loading,
    error,
    connected,
    classColors,
    handleClassHover,
    refreshData,
    tailwindClasses,
  };
}

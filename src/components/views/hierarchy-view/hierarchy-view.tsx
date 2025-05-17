import { useState, useEffect } from 'react';
import type { TreeNode } from '@/types';

export const HierarchyView = () => {
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredClass, setHoveredClass] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Simplified function to check if we can access this page
  const canAccessPage = (url: string): boolean => {
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

  // Check connection first
  useEffect(() => {
    const checkConnection = async () => {
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

        // No need for explicit permission checks since we have the proper permissions in the manifest
        // and are using activeTab + host_permissions

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
    };

    checkConnection();
  }, []);

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
    } catch (err) {
      console.error('Error fetching class tree:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Highlight elements when hovering over a class in the tree
  const handleClassHover = async (className: string | null) => {
    if (!connected) return;

    try {
      setHoveredClass(className);

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

  // Recursive function to render a tree node
  const renderNode = (node: TreeNode, depth = 0) => {
    return (
      <div key={node.element + node.portalClasses.join('-')} className="ml-4">
        <div className="flex items-start">
          <div className="mr-2">{node.element === 'body' ? '📄' : '📑'}</div>
          <div>
            <div className="font-medium">{node.element}</div>
            {node.portalClasses.length > 0 && (
              <div className="text-sm ml-4">
                {node.portalClasses.map((cls) => (
                  <div
                    key={cls}
                    className={`px-2 py-1 my-1 rounded cursor-pointer ${
                      hoveredClass === cls
                        ? 'bg-blue-100 font-bold'
                        : 'hover:bg-gray-100'
                    }`}
                    onMouseEnter={() => handleClassHover(cls)}
                    onMouseLeave={() => handleClassHover(null)}
                  >
                    {cls}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {node.children.length > 0 && (
          <div className="border-l-2 border-gray-200 pl-4 mt-2">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render loading state
  if (loading) {
    return <div className="p-4">Loading class hierarchy...</div>;
  }

  // Render error state
  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500 font-bold mb-2">
          Error loading class hierarchy:
        </div>
        <div className="p-3 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
        <div className="mt-4 text-sm text-gray-600">
          <p>Possible reasons:</p>
          <ul className="list-disc pl-5 mt-2">
            <li>You're on a restricted page (chrome:// URLs)</li>
            <li>The content script hasn't loaded properly</li>
            <li>The current page doesn't have any portal-* classes</li>
          </ul>
        </div>
      </div>
    );
  }

  // Improved check for empty tree data - look for any portal classes in the entire tree
  const hasPortalClasses = (node: TreeNode | null): boolean => {
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

  // Render empty state
  if (!treeData || !hasPortalClasses(treeData)) {
    return (
      <div className="p-4">
        <div className="font-bold">No portal classes found</div>
        <p className="mt-2">
          This page doesn't have any elements with class names starting with
          "portal-".
        </p>
      </div>
    );
  }

  // Render tree data
  return (
    <div className="p-4 overflow-auto max-h-[500px]">
      <h2 className="text-lg font-bold mb-4">Portal Class Hierarchy</h2>
      <div className="border rounded p-4 bg-white">{renderNode(treeData)}</div>
    </div>
  );
};

import { useState } from 'react';
import { useHierarchyData } from './hooks/use-hierarchy-data';
import { hasPortalClasses } from './utils/tree-data-utils';

import './tree.css';
import { TreeNodeComponent } from './components/tree-node';

export const HierarchyView = () => {
  const {
    treeData,
    arboristData,
    loading,
    error,
    classColors,
    handleClassHover,
  } = useHierarchyData();

  const [hoveredClass, setHoveredClass] = useState<string | null>(null);

  // Custom class hover handler to update local state and call the hook handler
  const onClassHover = (className: string | null) => {
    setHoveredClass(className);
    handleClassHover(className);
  };

  // Render loading state
  if (loading) {
    return (
      <div className="hierarchy-tree">
        <div className="tree-header">
          <div>
            <h2 className="tree-header-title">Class Hierarchy</h2>
            <div className="tree-header-stats">Loading...</div>
          </div>
        </div>
        <div className="tree-container flex items-center justify-center h-full">
          <div className="animate-pulse">Loading class hierarchy...</div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="hierarchy-tree">
        <div className="tree-header">
          <div>
            <h2 className="tree-header-title">Class Hierarchy</h2>
            <div className="tree-header-stats">Error loading</div>
          </div>
        </div>
        <div className="tree-container">
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
      </div>
    );
  }

  // Render empty state
  if (!treeData || !hasPortalClasses(treeData)) {
    return (
      <div className="hierarchy-tree">
        <div className="tree-header">
          <div>
            <h2 className="tree-header-title">Class Hierarchy</h2>
            <div className="tree-header-stats">No portal classes found</div>
          </div>
        </div>
        <div className="tree-container">
          <div className="font-bold">No portal classes found</div>
          <p className="mt-2">
            This page doesn't have any elements with class names starting with
            "portal-".
          </p>
        </div>
      </div>
    );
  }

  // Count total portal classes
  const portalClassCount = Object.keys(classColors).length;

  // Render tree data using our custom tree component
  return (
    <div className="hierarchy-tree">
      <div className="tree-header">
        <div>
          <h2 className="tree-header-title">Class Hierarchy</h2>
          <div className="tree-header-stats">
            {portalClassCount} portal{' '}
            {portalClassCount === 1 ? 'class' : 'classes'} found
          </div>
        </div>
      </div>

      <div className="tree-container">
        {arboristData.map((node) => (
          <TreeNodeComponent
            key={node.id}
            node={node}
            classColors={classColors}
            hoveredClass={hoveredClass}
            onClassHover={onClassHover}
          />
        ))}
      </div>
    </div>
  );
};

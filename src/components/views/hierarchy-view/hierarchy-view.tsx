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

  // Make sure we have valid tree data and arboristData has elements
  if (
    !treeData ||
    !hasPortalClasses(treeData) ||
    !arboristData ||
    arboristData.length === 0
  ) {
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

  // If we have only one root node, use it directly, otherwise wrap in a container
  const hasMultipleRootNodes = arboristData.length > 1;

  // Render tree data using our custom tree component
  return (
    <div className="hierarchy-tree max-h-[calc(100%-5vh)]">
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
        {hasMultipleRootNodes ? (
          // Multiple root nodes - treat as children of an invisible container
          arboristData.map((node, index) => (
            <TreeNodeComponent
              key={node.id}
              node={node}
              classColors={classColors}
              hoveredClass={hoveredClass}
              onClassHover={onClassHover}
              isRootNode={false}
              isLastChild={index === arboristData.length - 1}
            />
          ))
        ) : (
          // Single root node - treat as the true root
          <TreeNodeComponent
            key={arboristData[0].id}
            node={arboristData[0]}
            classColors={classColors}
            hoveredClass={hoveredClass}
            onClassHover={onClassHover}
            isRootNode={true}
          />
        )}
      </div>
    </div>
  );
};

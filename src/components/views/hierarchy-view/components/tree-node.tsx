import React from 'react';
import type { ArboristNode } from '../types';

interface TreeNodeProps {
  node: ArboristNode;
  depth?: number;
  isLastChild?: boolean;
  parentIsLastChild?: boolean[];
  classColors: Record<string, string>;
  hoveredClass: string | null;
  onClassHover: (className: string | null) => void;
}

export const TreeNodeComponent: React.FC<TreeNodeProps> = ({
  node,
  depth = 0,
  isLastChild = false,
  parentIsLastChild = [],
  classColors,
  hoveredClass,
  onClassHover,
}) => {
  const hasClasses = node.portalClasses && node.portalClasses.length > 0;
  const hasChildren = node.children && node.children.length > 0;

  // Create array to track which parent levels need connectors
  const childParentIsLastChild = [...parentIsLastChild];
  if (depth > 0) {
    childParentIsLastChild[depth - 1] = isLastChild;
  }

  return (
    <div className="tree-node">
      <div className="tree-node-row">
        {/* Generate connector areas for each depth level */}
        {Array.from({ length: depth }).map((_, index) => (
          <div key={`connector-${index}`} className="tree-connector-area">
            {parentIsLastChild[index] ? null : (
              <div className="tree-connector-line" />
            )}
          </div>
        ))}

        {/* Only show connector for non-root nodes */}
        {depth > 0 && (
          <div className="tree-connector-area">
            <div
              className={`tree-connector-line ${isLastChild ? 'last-child' : ''}`}
            />
            <div className="tree-horizontal-line" />
          </div>
        )}

        {/* Content area with element or class node */}
        <div className="tree-content">
          {node.isElement ? (
            <div className="tree-element">
              <span className="tree-element-tag">
                {node.tagName || node.name}
              </span>

              {/* Show classes associated with this element */}
              {hasClasses && (
                <div className="tree-class-list">
                  {node.portalClasses?.map((className) => (
                    <span
                      key={className}
                      className={`tree-class ${hoveredClass === className ? 'active' : ''}`}
                      style={{
                        color: classColors[className] || 'inherit',
                        backgroundColor:
                          hoveredClass === className
                            ? `${classColors[className]}15`
                            : 'transparent',
                      }}
                      onMouseEnter={() => onClassHover(className)}
                      onMouseLeave={() => onClassHover(null)}
                    >
                      {className}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Class-only node */
            <span
              className={`tree-class standalone ${hoveredClass === node.name ? 'active' : ''}`}
              style={{
                color: classColors[node.name] || 'inherit',
                backgroundColor:
                  hoveredClass === node.name
                    ? `${classColors[node.name]}15`
                    : 'transparent',
              }}
              onMouseEnter={() => onClassHover(node.name)}
              onMouseLeave={() => onClassHover(null)}
            >
              {node.name}
            </span>
          )}
        </div>
      </div>

      {/* Render children */}
      {hasChildren && (
        <div className="tree-children">
          {node.children!.map((child, index, array) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              depth={depth + 1}
              isLastChild={index === array.length - 1}
              parentIsLastChild={childParentIsLastChild}
              classColors={classColors}
              hoveredClass={hoveredClass}
              onClassHover={onClassHover}
            />
          ))}
        </div>
      )}
    </div>
  );
};

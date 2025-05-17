import React from 'react';
import type { ArboristNode } from '../types';

interface TreeNodeProps {
  node: ArboristNode;
  depth?: number;
  isLastChild?: boolean;
  classColors: Record<string, string>;
  hoveredClass: string | null;
  onClassHover: (className: string | null) => void;
  isRootNode?: boolean;
}

export const TreeNodeComponent: React.FC<TreeNodeProps> = ({
  node,
  depth = 0,
  isLastChild = false,
  classColors,
  hoveredClass,
  onClassHover,
  isRootNode = depth === 0,
}) => {
  const hasClasses = node.portalClasses && node.portalClasses.length > 0;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div
      className={`
      tree-node
      ${isRootNode ? 'root-node' : ''}
      ${isLastChild ? 'last-child' : ''}
      ${hasChildren ? 'has-children' : ''}
    `}
    >
      <div className="tree-node-row">
        {/* Only show connector for non-root nodes */}
        {depth > 0 && <div className="tree-connector" />}

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

      {/* Render children with proper indentation */}
      {hasChildren && (
        <div className="tree-children">
          {node.children!.map((child, index, array) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              depth={depth + 1}
              isLastChild={index === array.length - 1}
              classColors={classColors}
              hoveredClass={hoveredClass}
              onClassHover={onClassHover}
              isRootNode={false}
            />
          ))}
        </div>
      )}
    </div>
  );
};

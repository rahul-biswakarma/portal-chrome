import React, { useState } from 'react';
import type { ArboristNode } from '../types';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
  const [expandedClasses, setExpandedClasses] = useState<
    Record<string, boolean>
  >({});

  // Toggle tailwind classes visibility for a portal class
  const toggleTailwindClasses = (className: string) => {
    setExpandedClasses((prev) => ({
      ...prev,
      [className]: !prev[className],
    }));
  };

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
                  {node.portalClasses?.map((className) => {
                    const hasTailwindClasses =
                      node.tailwindClasses?.[className] &&
                      node.tailwindClasses[className].length > 0;
                    const isExpanded = expandedClasses[className];

                    return (
                      <div key={className} className="tree-class-container">
                        <div className="flex items-center">
                          {hasTailwindClasses && (
                            <button
                              className="tree-class-toggle mr-1"
                              onClick={() => toggleTailwindClasses(className)}
                            >
                              {isExpanded ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </button>
                          )}
                          <span
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
                          {hasTailwindClasses && !isExpanded && (
                            <span className="text-xs text-gray-500 ml-2">
                              ({node.tailwindClasses?.[className]?.length}{' '}
                              Tailwind classes)
                            </span>
                          )}
                        </div>

                        {/* Tailwind classes dropdown */}
                        {isExpanded && hasTailwindClasses && (
                          <div className="tailwind-classes ml-6 mt-1 mb-2">
                            <div className="text-xs text-gray-600 mb-1">
                              Tailwind classes:
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {node.tailwindClasses?.[className]?.map(
                                (twClass) => (
                                  <span
                                    key={twClass}
                                    className="tailwind-class text-xs px-1.5 py-0.5 bg-gray-100 rounded"
                                  >
                                    {twClass}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Class-only node */
            <div className="tree-class-container">
              <div className="flex items-center">
                {node.tailwindClasses?.[node.name] &&
                  node.tailwindClasses[node.name].length > 0 && (
                    <button
                      className="tree-class-toggle mr-1"
                      onClick={() => toggleTailwindClasses(node.name)}
                    >
                      {expandedClasses[node.name] ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                  )}
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
                {node.tailwindClasses?.[node.name] &&
                  node.tailwindClasses[node.name].length > 0 &&
                  !expandedClasses[node.name] && (
                    <span className="text-xs text-gray-500 ml-2">
                      ({node.tailwindClasses?.[node.name]?.length} Tailwind
                      classes)
                    </span>
                  )}
              </div>

              {/* Tailwind classes dropdown for standalone class node */}
              {expandedClasses[node.name] &&
                node.tailwindClasses?.[node.name] &&
                node.tailwindClasses[node.name].length > 0 && (
                  <div className="tailwind-classes ml-6 mt-1 mb-2">
                    <div className="text-xs text-gray-600 mb-1">
                      Tailwind classes:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {node.tailwindClasses?.[node.name]?.map((twClass) => (
                        <span
                          key={twClass}
                          className="tailwind-class text-xs px-1.5 py-0.5 bg-gray-100 rounded"
                        >
                          {twClass}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
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

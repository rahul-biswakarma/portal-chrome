import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Code } from 'lucide-react';

// Define HierarchyNode interface here to match the one used in hierarchy-view.tsx
interface HierarchyNode {
  id: string;
  name: string;
  isElement?: boolean;
  classes?: string[];
  children?: HierarchyNode[];
  portalClasses?: string[];
}

interface TreeNodeProps {
  node: HierarchyNode;
  classColors: Record<string, string>;
  hoveredClass: string | null;
  onClassHover: (className: string | null) => void;
  isRootNode?: boolean;
  isExpanded?: boolean;
}

export const TreeNodeComponent: React.FC<TreeNodeProps> = ({
  node,
  classColors,
  hoveredClass,
  onClassHover,
  isRootNode = false,
  isExpanded: parentIsExpanded = true,
}) => {
  const [isOpen, setIsOpen] = useState(isRootNode || parentIsExpanded);
  const [isHovered, setIsHovered] = useState(false);

  // Handle toggling node open/closed
  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  // Check if this node has children
  const hasChildren = node.children && node.children.length > 0;

  // Get portal classes from this node's class list
  const portalClasses = node.classes
    ? node.classes.filter((cls: string) => cls.startsWith('portal-'))
    : [];

  // Determine if this node should be highlighted based on hovered class
  const shouldHighlight = hoveredClass ? portalClasses.includes(hoveredClass) : false;

  // Handle mouse events
  const handleMouseEnter = () => {
    setIsHovered(true);
    if (portalClasses.length > 0) {
      onClassHover(portalClasses[0]);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onClassHover(null);
  };

  // Generate a unique hover class based on the first portal class (if any)
  const hoverClass = portalClasses.length > 0 ? `hover-${portalClasses[0]}` : '';

  return (
    <div className={`tree-node ${isRootNode ? 'root-node' : ''}`}>
      <div
        className={`node-content ${shouldHighlight ? 'node-highlighted' : ''} ${isHovered ? 'node-hovered' : ''} ${hoverClass}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Toggle button or spacer */}
        {hasChildren ? (
          <button
            className="toggle-btn"
            onClick={toggleOpen}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? (
              <ChevronDown size={14} className="text-gray-400" />
            ) : (
              <ChevronRight size={14} className="text-gray-400" />
            )}
          </button>
        ) : (
          <span className="toggle-spacer"></span>
        )}

        {/* Node name */}
        <div className="element-tag">
          <span className="tag-name">
            {node.isElement ? (
              <span className="element-name">{node.name}</span>
            ) : (
              <span className="text-node">{node.name}</span>
            )}
          </span>
        </div>

        {/* Portal classes */}
        {portalClasses.length > 0 && (
          <div className="portal-classes">
            {portalClasses.map((cls: string) => {
              const color = classColors[cls] || '#ccc';
              const style = {
                backgroundColor: `${color}20`, // 20% opacity
                borderColor: color,
                color: color,
              };

              return (
                <span
                  key={cls}
                  className={`portal-class ${cls === hoveredClass ? 'active' : ''}`}
                  style={style}
                  onMouseEnter={() => onClassHover(cls)}
                  onMouseLeave={() => onClassHover(null)}
                >
                  <Code size={10} className="mr-1" />
                  {cls}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && isOpen && (
        <div className="node-children">
          {node.children?.map((child: HierarchyNode) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              classColors={classColors}
              hoveredClass={hoveredClass}
              onClassHover={onClassHover}
              isExpanded={parentIsExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
};

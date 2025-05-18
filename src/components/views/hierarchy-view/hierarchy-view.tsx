import { useState } from 'react';
import { useHierarchyData } from './hooks/use-hierarchy-data';
import { hasPortalClasses } from './utils/tree-data-utils';
import {
  RefreshCw,
  AlertCircle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

import './tree.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Define a type for hierarchy nodes
interface HierarchyNode {
  id: string;
  name: string;
  isElement?: boolean;
  classes?: string[];
  children?: HierarchyNode[];
  portalClasses?: string[];
}

// Simple component for displaying portal classes
const PortalClassBadge = ({
  className,
  color,
  isActive,
  onMouseEnter,
  onMouseLeave,
}: {
  className: string;
  color: string;
  isActive: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) => {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mr-1 ${isActive ? 'ring-2 ring-offset-1' : ''}`}
      style={{
        backgroundColor: `${color}20`,
        borderColor: color,
        color: color,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {className}
    </span>
  );
};

// Simplified tree node component
const SimpleTreeNode = ({
  node,
  classColors,
  hoveredClass,
  onClassHover,
  depth = 0,
}: {
  node: HierarchyNode;
  classColors: Record<string, string>;
  hoveredClass: string | null;
  onClassHover: (className: string | null) => void;
  depth?: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const portalClasses = node.portalClasses || [];

  // Only show nodes that have portal classes or children with portal classes
  const hasPortalClassesOrChildren =
    portalClasses.length > 0 ||
    (hasChildren &&
      node.children!.some(
        (child) =>
          child.portalClasses?.length ||
          (child.children && child.children.length > 0),
      ));

  if (!hasPortalClassesOrChildren) return null;

  return (
    <div className="py-1">
      <div
        className={`flex items-center pl-${depth * 4} ${hoveredClass && portalClasses.includes(hoveredClass) ? 'bg-blue-50 dark:bg-blue-900/20 rounded' : ''}`}
      >
        {hasChildren && (
          <button
            className="p-1 mr-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-gray-400" />
            ) : (
              <ChevronRight size={14} className="text-gray-400" />
            )}
          </button>
        )}

        <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">
          &lt;{node.name}&gt;
        </span>

        <div className="flex flex-wrap gap-1">
          {portalClasses.map((cls) => (
            <PortalClassBadge
              key={cls}
              className={cls}
              color={classColors[cls] || '#888'}
              isActive={cls === hoveredClass}
              onMouseEnter={() => onClassHover(cls)}
              onMouseLeave={() => onClassHover(null)}
            />
          ))}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="ml-4 pl-2 border-l border-gray-200 dark:border-gray-700">
          {node.children!.map((child) => (
            <SimpleTreeNode
              key={child.id}
              node={child}
              classColors={classColors}
              hoveredClass={hoveredClass}
              onClassHover={onClassHover}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const HierarchyView = () => {
  const {
    treeData,
    arboristData,
    loading,
    error,
    classColors,
    handleClassHover,
    refreshData,
  } = useHierarchyData();

  const [hoveredClass, setHoveredClass] = useState<string | null>(null);

  // Custom class hover handler to update local state and call the hook handler
  const onClassHover = (className: string | null) => {
    setHoveredClass(className);
    handleClassHover(className);
  };

  // Handle refresh button click
  const handleRefresh = () => {
    refreshData();
  };

  // Render loading state
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 h-full overflow-hidden">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Portal Classes
          </h2>
          <Button
            variant="ghost"
            size="icon"
            disabled
            className="text-gray-400 h-7 w-7"
          >
            <RefreshCw size={14} className="animate-spin" />
          </Button>
        </div>
        <div className="flex items-center justify-center p-8">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-3"></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading classes...
          </p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 h-full overflow-hidden">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Portal Classes
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="h-7 w-7"
          >
            <RefreshCw size={14} />
          </Button>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-2 text-red-500 dark:text-red-400">
            <AlertCircle className="mt-0.5" size={14} />
            <div>
              <p className="text-sm font-medium">{error}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Try refreshing or check if you're on a supported page.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Make sure we have valid tree data with portal classes
  if (
    !treeData ||
    !hasPortalClasses(treeData) ||
    !arboristData ||
    arboristData.length === 0
  ) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 h-full overflow-hidden">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Portal Classes
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="h-7 w-7"
          >
            <RefreshCw size={14} />
          </Button>
        </div>
        <div className="p-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No portal classes found on this page.
          </p>
        </div>
      </div>
    );
  }

  // Count total portal classes
  const portalClassCount = Object.keys(classColors).length;

  // Ensure we always have only one root node
  const rootNode =
    arboristData.length === 1
      ? arboristData[0]
      : {
          id: 'root',
          name: 'body',
          isElement: true,
          children: arboristData,
        };

  return (
    <div className="h-full flex flex-col overflow-hidden p-2 pb-12">
      <div className="p-3 bg-secondary rounded-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Portal Classes</h2>
          <Badge variant="secondary">{portalClassCount}</Badge>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                className="h-7 w-7"
              >
                <RefreshCw size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Refresh class hierarchy</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="h-full flex-1 overflow-auto">
        <SimpleTreeNode
          node={rootNode}
          classColors={classColors}
          hoveredClass={hoveredClass}
          onClassHover={onClassHover}
        />
      </div>
    </div>
  );
};

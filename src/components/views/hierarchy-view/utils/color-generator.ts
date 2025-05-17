import type { TreeNode } from '@/types';

// Function to generate a unique color for each portal class with good contrast
export const generateUniqueColors = (
  tree: TreeNode | null,
): Record<string, string> => {
  if (!tree) return {};

  const colors: Record<string, string> = {};
  const hueStep = 360 / 20; // Dividing the color wheel

  // Collect all unique classes
  const collectClasses = (node: TreeNode) => {
    const classes = [...node.portalClasses];

    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => {
        collectClasses(child).forEach((cls) => {
          if (!classes.includes(cls)) {
            classes.push(cls);
          }
        });
      });
    }

    return classes;
  };

  const uniqueClasses = Array.from(new Set(collectClasses(tree)));

  // Assign colors to unique classes with better contrast for light backgrounds
  uniqueClasses.forEach((className, index) => {
    const hue = (index * hueStep) % 360;
    // Darker, more saturated colors for better contrast
    colors[className] = `hsl(${hue}, 85%, 35%)`;
  });

  return colors;
};

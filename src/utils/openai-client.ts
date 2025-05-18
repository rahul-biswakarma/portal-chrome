import type { TreeNode, TailwindClassData } from '../types';
import { getEnvVariable } from '../utils/environment';

// Default API parameters
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS_PROMPT = 3000;
const DEFAULT_MAX_TOKENS_CSS = 4000;
const DEFAULT_MAX_TOKENS_EVAL = 1500;

// Get environment variables or use defaults
const getApiParameters = async () => {
  const model = (await getEnvVariable('OPENAI_MODEL')) || DEFAULT_MODEL;
  const temperatureStr = await getEnvVariable('OPENAI_TEMPERATURE');
  const maxTokensPromptStr = await getEnvVariable('OPENAI_MAX_TOKENS_PROMPT');
  const maxTokensCssStr = await getEnvVariable('OPENAI_MAX_TOKENS_CSS');
  const maxTokensEvalStr = await getEnvVariable('OPENAI_MAX_TOKENS_EVAL');

  // Parse numeric values with fallbacks
  const temperature = temperatureStr
    ? parseFloat(temperatureStr)
    : DEFAULT_TEMPERATURE;
  const maxTokensPrompt = maxTokensPromptStr
    ? parseInt(maxTokensPromptStr, 10)
    : DEFAULT_MAX_TOKENS_PROMPT;
  const maxTokensCss = maxTokensCssStr
    ? parseInt(maxTokensCssStr, 10)
    : DEFAULT_MAX_TOKENS_CSS;
  const maxTokensEval = maxTokensEvalStr
    ? parseInt(maxTokensEvalStr, 10)
    : DEFAULT_MAX_TOKENS_EVAL;

  return {
    model,
    temperature,
    maxTokensPrompt,
    maxTokensCss,
    maxTokensEval,
  };
};

/**
 * Get the stored OpenAI API key
 * @returns Promise resolving to the API key or null if not set
 */
export const getOpenAIApiKey = async (): Promise<string | null> => {
  try {
    // Use the environment variable function instead of direct storage access
    // to align with how the API key is handled throughout the application
    const apiKey = await getEnvVariable('OPENAI_API_KEY');
    return apiKey || null;
  } catch (error) {
    console.error('Error getting OpenAI API key:', error);
    return null;
  }
};

/**
 * Check if an image data URL is valid
 * @param imageData The image data URL
 * @returns Whether the data URL is valid
 */
export const isValidImageData = (imageData: string): boolean => {
  return (
    typeof imageData === 'string' &&
    imageData.startsWith('data:image/') &&
    imageData.includes('base64,')
  );
};

/**
 * Generate a prompt using OpenAI API based on reference image and current screenshot
 * @param apiKey The OpenAI API key
 * @param referenceImage The reference image data URL
 * @param currentScreenshot The current screenshot data URL
 * @param portalClassTree The portal class tree
 * @param tailwindData The tailwind class data
 * @param currentCSS The current CSS
 * @param computedStyles The computed styles for each portal-* class element
 * @returns Promise resolving to the generated prompt
 */
export const generatePromptWithAI = async (
  apiKey: string,
  referenceImage: string,
  currentScreenshot: string,
  portalClassTree?: TreeNode,
  tailwindData?: TailwindClassData,
  currentCSS: string = '',
  computedStyles?: Record<string, Record<string, string>>,
): Promise<string> => {
  const url = 'https://api.openai.com/v1/chat/completions';
  const { model, temperature, maxTokensPrompt } = await getApiParameters();

  // Create enhanced tree and hierarchy text if data is provided
  let hierarchyText = '';
  let hierarchyData = '';

  if (portalClassTree && tailwindData) {
    // Process the tailwind data
    const simplifiedTailwindData: Record<string, string[]> = {};
    if (tailwindData) {
      Object.keys(tailwindData).forEach((selector) => {
        simplifiedTailwindData[selector] = Array.isArray(tailwindData[selector])
          ? tailwindData[selector]
          : [];
      });
    }

    // Create enhanced tree with tailwind classes
    const enhancedTree = createEnhancedClassTree(
      portalClassTree,
      simplifiedTailwindData,
    );

    // Format hierarchy for prompt
    hierarchyText = formatHierarchyForPrompt(enhancedTree);
    hierarchyData = JSON.stringify(enhancedTree, null, 2);
  }

  // Format computed styles in a readable way
  let computedStylesText = '';
  if (computedStyles) {
    computedStylesText = formatComputedStyles(computedStyles);
  }

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert in visual design analysis and CSS engineering. Your task is to analyze two images - a reference design and the current state - and create a detailed, structured prompt for a CSS generator that will transform the current state to match the reference design. Focus on precision, specificity, and addressing potential challenges in CSS implementation.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `I need you to analyze these two images and create a detailed prompt that will be used by another AI to generate CSS.

IMPORTANT CONTEXT:
1. The FIRST image is the REFERENCE design (what we want to achieve)
2. The SECOND image is the CURRENT state (what we need to transform)
${
  hierarchyText
    ? `3. DOM AND CLASS STRUCTURE: Below is the hierarchical tree of elements with their portal-* classes and Tailwind classes:

HIERARCHICAL VIEW:
${hierarchyText}

FULL CLASS DATA:
${hierarchyData}
`
    : ''
}
${
  computedStylesText
    ? `4. COMPUTED STYLES: Below are the actual computed styles for each portal-* class element:

${computedStylesText}
`
    : ''
}
${
  currentCSS
    ? `5. CURRENT CSS:
${currentCSS}
`
    : ''
}

INSTRUCTIONS FOR PROMPT CREATION:
1. Create a detailed, component-by-component analysis comparing the reference and current designs
2. For EACH UI component (header, buttons, cards, etc.), provide a separate section with specific changes needed
3. Specify EXACT measurements, including:
   - Precise color values (HEX/RGB/HSL)
   - Font sizes, weights, and families in appropriate units (px, rem, etc.)
   - Exact spacing values (padding, margin) in pixels
   - Specific border-radius, shadows, and other effects
4. Identify potential CSS specificity issues and recommend solutions (e.g., increased specificity, !important where needed)
5. Highlight elements with unusual or "wild" styling that require special attention
6. Suggest a priority order for implementing changes (most visually impactful to least)
7. Include instructions for handling responsive design considerations
8. Remember that the CSS generator will ONLY be able to use class selectors that start with "portal-"

PROMPT FORMAT:
- Start with an overview of the key differences between the designs
- Organize by component type (layout, typography, colors, spacing, effects)
- For each component, include:
  * Target element(s) description with portal-* classes
  * Specific CSS properties to change with exact values
  * Special concerns about implementation or overrides
- Conclude with a summary of the most critical changes for visual fidelity

GENERATE ONLY THE PROMPT TEXT with no additional explanations or markdown formatting.`,
        },
        {
          type: 'image_url',
          image_url: {
            url: referenceImage,
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: currentScreenshot,
          },
        },
      ],
    },
  ];

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages,
        temperature,
        max_tokens: maxTokensPrompt,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API error: ${errorData.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();

    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      return data.choices[0].message.content.trim();
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error generating prompt:', error);
    throw error;
  }
};

// Helper function to format computed styles for the prompt
function formatComputedStyles(
  computedStyles: Record<string, Record<string, string>>,
): string {
  let result = '';

  // For each portal class
  Object.entries(computedStyles).forEach(([className, styles]) => {
    result += `.${className} (${styles['element'] || 'element'}):\n`;

    // Check for parent relationship
    if (styles['parent-classes']) {
      result += `  Parent: ${styles['parent-classes']}\n`;
    }

    // Check for children
    if (styles['has-portal-children'] === 'true') {
      result += `  Has ${styles['child-elements'] || 'multiple'} portal children\n`;
    }

    // Group styles by categories
    const categories = {
      Typography: [
        'color',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        'text-align',
        'text-decoration',
        'text-transform',
      ],
      'Box Model': [
        'width',
        'height',
        'padding',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'margin',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
      ],
      Layout: [
        'display',
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'flex-direction',
        'flex-wrap',
        'justify-content',
        'align-items',
        'grid-template-columns',
        'grid-template-rows',
        'grid-gap',
      ],
      Visual: [
        'background-color',
        'background-image',
        'border',
        'border-radius',
        'box-shadow',
        'opacity',
        'transform',
        'transition',
      ],
      Other: ['z-index', 'overflow', 'cursor'],
    };

    // Add styles by category
    Object.entries(categories).forEach(([category, properties]) => {
      const categoryStyles = properties
        .filter((prop) => styles[prop])
        .map((prop) => `    ${prop}: ${styles[prop]}`)
        .join('\n');

      if (categoryStyles) {
        result += `  ${category}:\n${categoryStyles}\n`;
      }
    });

    result += '\n';
  });

  return result;
}

// Define types for OpenAI message content
type TextContent = {
  type: 'text';
  text: string;
};

type ImageContent = {
  type: 'image_url';
  image_url: {
    url: string;
  };
};

type MessageContent = TextContent | ImageContent;

/**
 * Generate CSS using OpenAI API
 * @param apiKey The OpenAI API key
 * @param prompt The user prompt
 * @param portalClassTree The portal class tree
 * @param tailwindData The tailwind class data
 * @param currentCSS The current CSS
 * @param retryCount The retry count (default 0)
 * @returns Promise resolving to the generated CSS
 */
export const generateCSSWithAI = async (
  apiKey: string,
  prompt: string,
  portalClassTree: TreeNode,
  tailwindData: TailwindClassData,
  currentCSS: string = '',
  retryCount: number = 0,
  referenceImage?: string,
  currentScreenshot?: string,
  computedStyles?: Record<string, Record<string, string>>,
): Promise<string> => {
  const url = 'https://api.openai.com/v1/chat/completions';
  const { model, temperature, maxTokensCss } = await getApiParameters();

  // Sanitize CSS to prevent refusal responses
  const sanitizedCSS = validateAndSanitizeCSS(currentCSS);

  // Debug log to check incoming tailwind data
  console.log('DEBUG: Incoming tailwind data:', tailwindData);

  // Process the tailwind data without additional filtering
  const simplifiedTailwindData: Record<string, string[]> = {};
  if (tailwindData) {
    Object.keys(tailwindData).forEach((selector) => {
      // Don't filter out any selector - the filtering was done in the content script
      console.log(
        `DEBUG: Processing classes for ${selector}:`,
        tailwindData[selector],
      );
      simplifiedTailwindData[selector] = Array.isArray(tailwindData[selector])
        ? tailwindData[selector]
        : [];
    });
  }

  console.log('DEBUG: Simplified tailwind data:', simplifiedTailwindData);

  // Create a hierarchical representation of the Tailwind classes
  const enhancedTree = createEnhancedClassTree(
    portalClassTree,
    simplifiedTailwindData,
  );

  console.log(
    'DEBUG: Enhanced tree for prompt:',
    JSON.stringify(enhancedTree, null, 2),
  );

  // Create a more readable hierarchical representation for the prompt
  const hierarchyText = formatHierarchyForPrompt(enhancedTree);

  // Create a detailed analysis of conflicting styles that might need higher specificity
  const specificityAnalysis = analyzeSpecificityIssues(
    enhancedTree,
    sanitizedCSS,
  );

  // Check for potential cascade issues with the provided tree
  const cascadeAnalysis = analyzeCascadeIssues(enhancedTree);

  // Analyze grouping opportunities for similar elements
  const groupingAnalysis = analyzeElementGroups(enhancedTree);

  // Format computed styles if available
  let computedStylesText = '';
  if (computedStyles) {
    computedStylesText = formatComputedStyles(computedStyles);
  }

  // Improved prompt for pixel-perfect matching and visual fidelity
  let improvedPrompt = `${prompt}\n\nIMPORTANT: The goal is to make the current design visually match the desired outcome. Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences. Only use the provided class names. If unsure, err on the side of making more changes.`;

  // Add iteration context if this isn't the first attempt
  if (retryCount > 0) {
    improvedPrompt += `\n\nThis is iteration ${retryCount + 1}. The previous CSS didn't fully match the reference image. Please make additional refinements to achieve better visual matching.`;
  }

  // Build the content array
  const contentArray: MessageContent[] = [
    {
      type: 'text',
      text: `You are an expert CSS generator. Your task is to write CSS to transform a current design to visually match a reference design based on the user's request.

USER REQUEST:
"${improvedPrompt}"

DOM AND CLASS STRUCTURE:
The following is a hierarchical tree of elements with their portal-* classes and associated Tailwind classes. You MUST use these portal-* class names in your CSS selectors.

HIERARCHICAL VIEW:
${hierarchyText}

FULL CLASS DATA (for context on existing Tailwind classes):
${JSON.stringify(enhancedTree, null, 2)}

${
  specificityAnalysis
    ? `SPECIFICITY ANALYSIS:
${specificityAnalysis}
`
    : ''
}

${
  cascadeAnalysis
    ? `CASCADE CHALLENGES:
${cascadeAnalysis}
`
    : ''
}

${
  groupingAnalysis
    ? `ELEMENT GROUPING OPPORTUNITIES:
${groupingAnalysis}
`
    : ''
}

${
  computedStylesText
    ? `COMPUTED STYLES (Current rendered state of elements):
${computedStylesText}
`
    : ''
}

CURRENT CSS (if any, to be built upon or replaced):
${sanitizedCSS ? sanitizedCSS : 'No pre-existing CSS. Generate all necessary styles.'}

CRITICAL INSTRUCTIONS:
1.  **Output Format:** RESPOND ONLY WITH VALID CSS CODE. Do NOT include any explanations, markdown (like \`\`\`css), or any text other than the CSS itself.
2.  **No Comments:** DO NOT include any comments in the CSS. Provide clean, comment-free CSS code only.
3.  **Selectors:** ONLY use selectors targeting classes that start with "portal-" (e.g., \`.portal-header\`, \`.portal-button--primary\`). Do NOT invent new class names.
4.  **Wild Styling Handling:** Be prepared to override complex combinations of Tailwind classes. When elements have many competing styles, use highly specific selectors or strategic !important declarations.
5.  **Override Tailwind:** Your primary goal is to override existing Tailwind CSS utility classes. Ensure your CSS rules have enough specificity or use \`!important\` strategically if absolutely necessary to ensure styles are applied correctly over Tailwind.
6.  **Specificity Strategies:**
    * Use specificity-increasing patterns when needed, like \`.portal-parent .portal-child\`
    * Consider attribute selectors for extra specificity: \`.portal-class[class]\`
    * Use direct child selectors (\`.portal-parent > .portal-child\`) when beneficial
    * Group similar elements together with comma-separated selectors
7.  **Completeness:**
    *   If \`CURRENT CSS\` is provided, your response should be the COMPLETE CSS file, including all existing styles from \`CURRENT CSS\` with your necessary modifications, improvements, and additions.
    *   If \`CURRENT CSS\` is 'No pre-existing CSS', generate all styles required to meet the USER REQUEST.
8.  **Pixel-Perfect:** Aim for a pixel-perfect match to the reference design, paying close attention to:
    *   Colors (backgrounds, text, borders)
    *   Typography (font-family, size, weight, line-height, letter-spacing)
    *   Sizing and Spacing (width, height, padding, margins, alignment)
    *   Layout (Flexbox, Grid, positioning)
    *   Visual Effects (shadows, borders, border-radius, transitions)
9.  **Cascade Awareness:** Be aware of how CSS cascade might affect your styles. Sometimes you may need to reset undesired inherited properties.
10. **Structure:** Organize your CSS logically (e.g., by component or section), but do not include any comments.
11. **Iterative Refinement (if applicable):** ${retryCount > 0 ? `This is iteration ${retryCount + 1}. Review the previous attempt and the user's feedback to make precise adjustments for a better match.` : 'This is the first attempt.'}
12. **Computed Styles Reference:** Use the COMPUTED STYLES section as your primary reference for the current state of elements. This shows the actual rendered values rather than just class names, which is more precise for targeting changes.

Based on all the above, generate the complete CSS code now WITHOUT ANY COMMENTS.`,
    },
  ];

  // Add images if provided
  if (referenceImage && isValidImageData(referenceImage)) {
    contentArray.push({
      type: 'image_url',
      image_url: {
        url: referenceImage,
      },
    });
  }

  if (currentScreenshot && isValidImageData(currentScreenshot)) {
    contentArray.push({
      type: 'image_url',
      image_url: {
        url: currentScreenshot,
      },
    });
  }

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert CSS developer specializing in pixel-perfect visual implementation. Your task is to generate CSS that will transform a web page to match a target design. You excel at solving complex styling challenges like specificity issues, cascade problems, and overriding existing styles.',
    },
    {
      role: 'user',
      content: contentArray,
    },
  ];

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages,
        temperature,
        max_tokens: maxTokensCss,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API error: ${errorData.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();

    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      let content = data.choices[0].message.content;

      // Clean the response by removing markdown code blocks if present
      content = content
        .replace(/```css\s*/g, '')
        .replace(/```\s*$/g, '')
        .replace(/```/g, '')
        .trim();

      return content;
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error generating CSS:', error);
    throw error;
  }
};

// Helper function to analyze specificity issues in the tree
function analyzeSpecificityIssues(
  tree: EnhancedTreeNode,
  currentCSS: string,
): string {
  // Identify portal classes with many Tailwind classes that might need specificity help
  const potentialIssues: string[] = [];

  // Check for nodes with many competing Tailwind classes
  const findSpecificityIssues = (node: EnhancedTreeNode, path: string = '') => {
    const nodePath = path ? `${path} > ${node.element}` : node.element;

    // Check if this node has portal classes with many Tailwind classes
    node.portalClasses.forEach((portalClass) => {
      if (portalClass.tailwindClasses.length > 10) {
        potentialIssues.push(
          `- \`.${portalClass.name}\` has ${portalClass.tailwindClasses.length} Tailwind classes that may need strong specificity to override.`,
        );
      }

      // Look for conflicting Tailwind classes (e.g., multiple colors, sizes)
      const colorClasses = portalClass.tailwindClasses.filter(
        (cls) =>
          cls.startsWith('bg-') ||
          cls.startsWith('text-') ||
          cls.startsWith('border-'),
      );

      if (colorClasses.length > 2) {
        potentialIssues.push(
          `- \`.${portalClass.name}\` has conflicting color classes: ${colorClasses.join(', ')}`,
        );
      }

      // Check for inline styles (will appear in the element, not classes)
      if (nodePath.includes('style=')) {
        potentialIssues.push(
          `- \`.${portalClass.name}\` may have inline styles that will need !important to override.`,
        );
      }
    });

    // Recursively check children
    if (node.children) {
      node.children.forEach((child) => findSpecificityIssues(child, nodePath));
    }
  };

  findSpecificityIssues(tree);

  // Check if currentCSS contains !important declarations already
  const importantDeclarations = (currentCSS.match(/!important/g) || []).length;
  if (importantDeclarations > 0) {
    potentialIssues.push(
      `- Current CSS already contains ${importantDeclarations} !important declarations, indicating existing specificity challenges.`,
    );
  }

  if (potentialIssues.length === 0) {
    return '';
  }

  return `The following elements may need special handling for specificity issues:\n${potentialIssues.join('\n')}`;
}

// Helper function to analyze cascade issues
function analyzeCascadeIssues(tree: EnhancedTreeNode): string {
  const cascadeIssues: string[] = [];

  // Look for nested portal classes where inheritance might cause issues
  const findCascadeIssues = (
    node: EnhancedTreeNode,
    parentPortalClasses: string[] = [],
  ) => {
    const currentPortalClasses = node.portalClasses.map((pc) => pc.name);

    // Check if this node has portal classes that might be affected by parent classes
    if (parentPortalClasses.length > 0 && currentPortalClasses.length > 0) {
      cascadeIssues.push(
        `- Classes ${currentPortalClasses.join(', ')} are nested inside ${parentPortalClasses.join(', ')} and may inherit unwanted styles.`,
      );
    }

    // Recursively check children, adding current portal classes to parent list
    if (node.children) {
      node.children.forEach((child) =>
        findCascadeIssues(child, [
          ...parentPortalClasses,
          ...currentPortalClasses,
        ]),
      );
    }
  };

  findCascadeIssues(tree);

  if (cascadeIssues.length === 0) {
    return '';
  }

  return `The following cascade relationships might need attention:\n${cascadeIssues.join('\n')}`;
}

// Helper function to identify grouping opportunities
function analyzeElementGroups(tree: EnhancedTreeNode): string {
  // Group similar classes by tailwind patterns
  const classGroups: Record<string, string[]> = {};

  // Find potential groups of similar elements
  const findGroups = (node: EnhancedTreeNode) => {
    // Look for similar portal classes by their Tailwind classes
    node.portalClasses.forEach((portalClass) => {
      // Create a signature of the most common Tailwind classes
      const commonClasses = portalClass.tailwindClasses
        .filter(
          (cls) =>
            cls.startsWith('text-') ||
            cls.startsWith('bg-') ||
            cls.startsWith('p-') ||
            cls.startsWith('m-'),
        )
        .sort()
        .join(',');

      if (commonClasses) {
        if (!classGroups[commonClasses]) {
          classGroups[commonClasses] = [];
        }
        classGroups[commonClasses].push(portalClass.name);
      }
    });

    // Recursively check children
    if (node.children) {
      node.children.forEach((child) => findGroups(child));
    }
  };

  findGroups(tree);

  // Filter to groups with at least 2 elements
  const relevantGroups = Object.entries(classGroups)
    .filter(([_, classes]) => classes.length >= 2)
    .map(([signature, classes]) => ({
      signature,
      classes,
    }));

  if (relevantGroups.length === 0) {
    return '';
  }

  // Format output
  return `The following classes could be styled together for consistency:\n${relevantGroups
    .map(
      (group) =>
        `- Group with similar properties: ${group.classes.map((c) => `.${c}`).join(', ')}`,
    )
    .join('\n')}`;
}

// Define types for enhanced tree structure
interface EnhancedPortalClass {
  name: string;
  tailwindClasses: string[];
}

interface EnhancedTreeNode {
  element: string;
  portalClasses: EnhancedPortalClass[];
  children?: EnhancedTreeNode[];
}

/**
 * Create an enhanced tree that includes Tailwind classes for each portal class
 * @param node The portal class tree node
 * @param tailwindData Tailwind class data
 * @returns Enhanced tree with Tailwind classes
 */
function createEnhancedClassTree(
  node: TreeNode,
  tailwindData: Record<string, string[]>,
): EnhancedTreeNode {
  // Debug logging to inspect the inputs
  console.log('DEBUG: Creating enhanced class tree with node:', node);
  console.log('DEBUG: Tailwind data available:', tailwindData);

  // Create the base node
  const enhancedNode: EnhancedTreeNode = {
    element: node.element,
    portalClasses: [],
  };

  // Add portal classes with associated tailwind classes
  if (node.portalClasses && node.portalClasses.length > 0) {
    enhancedNode.portalClasses = node.portalClasses.map((cls) => {
      const tailwindClasses = tailwindData[cls] || [];
      console.log(
        `DEBUG: Portal class ${cls} has Tailwind classes:`,
        tailwindClasses,
      );
      return {
        name: cls,
        tailwindClasses: tailwindClasses,
      };
    });
  }

  // Process child nodes recursively
  if (node.children && node.children.length > 0) {
    enhancedNode.children = node.children.map((child) =>
      createEnhancedClassTree(child, tailwindData),
    );
  }

  return enhancedNode;
}

/**
 * Format hierarchy for prompt
 * @param node The enhanced tree node
 * @param depth Current depth level for indentation
 * @param prefix The prefix to use for this line
 * @returns Formatted hierarchy string
 */
function formatHierarchyForPrompt(
  node: EnhancedTreeNode,
  depth: number = 0,
  prefix: string = '',
): string {
  let result = '';

  // First line: element name with portal classes and tailwind classes
  const portalClassesStr = node.portalClasses
    .map((cls) => {
      const tailwindStr =
        cls.tailwindClasses.length > 0
          ? ` [${JSON.stringify(cls.tailwindClasses)}]`
          : '';
      return `${cls.name}${tailwindStr}`;
    })
    .join(', ');

  // Only add the element line if we're at depth 0 or have portal classes
  if (depth === 0 || portalClassesStr) {
    result += `${prefix}${node.element}${portalClassesStr ? ` - ${portalClassesStr}` : ''}\n`;
  }

  // If there are children, add connecting lines
  if (node.children && node.children.length > 0) {
    // Add vertical connection line
    result += `${prefix}|\n`;

    // Process all children except the last one
    for (let i = 0; i < node.children.length - 1; i++) {
      const childPrefix = `${prefix}| - `;
      const restPrefix = `${prefix}|   `;
      result +=
        formatHierarchyForPrompt(node.children[i], depth + 1, childPrefix)
          .replace(/\n$/, '')
          .replace(/\n/g, `\n${restPrefix}`) + '\n';
    }

    // Process the last child with different connection
    if (node.children.length > 0) {
      const lastChildPrefix = `${prefix}| - `;
      const lastRestPrefix = `${prefix}    `;
      result +=
        formatHierarchyForPrompt(
          node.children[node.children.length - 1],
          depth + 1,
          lastChildPrefix,
        )
          .replace(/\n$/, '')
          .replace(/\n/g, `\n${lastRestPrefix}`) + '\n';
    }
  }

  return result;
}

/**
 * Evaluate CSS results using OpenAI API
 * @param apiKey The OpenAI API key
 * @param referenceImage The reference image data URL
 * @param resultScreenshot The screenshot with applied CSS
 * @param currentCSS The current applied CSS
 * @param portalClassTree The portal class tree structure
 * @param tailwindData The tailwind class data
 * @param computedStyles The computed styles for each portal-* class element
 * @returns Promise resolving to evaluation results {isMatch: boolean, feedback: string}
 */
export const evaluateCSSResultWithAI = async (
  apiKey: string,
  referenceImage: string,
  resultScreenshot: string,
  currentCSS: string,
  portalClassTree?: TreeNode,
  tailwindData?: TailwindClassData,
  computedStyles?: Record<string, Record<string, string>>,
): Promise<{ isMatch: boolean; feedback: string }> => {
  const url = 'https://api.openai.com/v1/chat/completions';
  const { model, maxTokensEval } = await getApiParameters();

  // Use a lower temperature for evaluation for more consistent results
  const evaluationTemperature = 0.5;

  // Sanitize CSS to prevent refusal responses
  const sanitizedCSS = validateAndSanitizeCSS(currentCSS);

  // Format hierarchy data if provided
  let hierarchyText = '';
  let hierarchyData = '';

  if (portalClassTree && tailwindData) {
    // Process the tailwind data without additional filtering
    const simplifiedTailwindData: Record<string, string[]> = {};
    if (tailwindData) {
      Object.keys(tailwindData).forEach((selector) => {
        simplifiedTailwindData[selector] = Array.isArray(tailwindData[selector])
          ? tailwindData[selector]
          : [];
      });
    }

    // Create enhanced tree with tailwind classes
    const enhancedTree = createEnhancedClassTree(
      portalClassTree,
      simplifiedTailwindData,
    );

    // Format hierarchy for prompt
    hierarchyText = formatHierarchyForPrompt(enhancedTree);
    hierarchyData = JSON.stringify(enhancedTree, null, 2);
  }

  // Format computed styles if provided
  let computedStylesText = '';
  if (computedStyles) {
    computedStylesText = formatComputedStyles(computedStyles);
  }

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert in visual design analysis and CSS. Your task is to evaluate if the applied CSS has successfully transformed the page to match the reference design. Be thorough in your analysis but constructive in your feedback for what needs improvement.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `I've applied CSS to transform a page to match a reference design. I need you to evaluate the results and provide specific improvements if needed.

IMAGES:
1. The FIRST image is the REFERENCE design (the target we aim to match)
2. The SECOND image is the CURRENT state (with the applied CSS)

CURRENT CSS:
\`\`\`css
${sanitizedCSS}
\`\`\`

${
  hierarchyText
    ? `DOM AND CLASS STRUCTURE:
The following is a hierarchical tree of elements with their portal-* classes and associated Tailwind classes:

HIERARCHICAL VIEW:
${hierarchyText}

FULL CLASS DATA:
${hierarchyData}

`
    : ''
}${
            computedStylesText
              ? `COMPUTED STYLES (Current rendered state of elements):
${computedStylesText}

`
              : ''
          }EVALUATION INSTRUCTIONS:
1. Compare the visual appearance of both images with pixel-perfect precision
2. Focus on these key aspects:
   - Colors (backgrounds, text, borders) - exact hex values are important
   - Typography (size, weight, family, spacing, alignment)
   - Layout & Spacing (padding, margins, element positioning)
   - Visual Effects (shadows, borders, border-radius, transitions)
   - Overall fidelity to the reference design

RESPONSE FORMAT:
- If the current state matches the reference design well enough (90%+ accuracy), respond with ONLY the word "DONE"
- If improvements are needed, respond with COMPLETE, VALID CSS that would improve the match. Do not include JSON, markdown formatting, or explanations, JUST the CSS.

IMPORTANT CSS REQUIREMENTS:
1. Your CSS must ONLY use selectors that target classes starting with "portal-"
2. Do NOT include any comments in the CSS. Provide clean, comment-free CSS code only.
3. Ensure your CSS has sufficient specificity to override Tailwind classes
4. Provide the COMPLETE CSS file including all current styles plus your improvements
5. Include precise values (exact colors, pixel measurements, etc.) to achieve a pixel-perfect match
6. Fix ANY visual discrepancies, no matter how small
7. Use the computed styles as your primary reference for understanding the current state

CRITICAL: Focus on specific CSS improvements, not general descriptions of what's wrong. If you see a difference, provide the exact CSS code to fix it. DO NOT include any comments in the CSS.`,
        },
        {
          type: 'image_url',
          image_url: {
            url: referenceImage,
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: resultScreenshot,
          },
        },
      ],
    },
  ];

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages,
        temperature: evaluationTemperature,
        max_tokens: maxTokensEval,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API error: ${errorData.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();

    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      const result = data.choices[0].message.content.trim();

      if (result === 'DONE') {
        return {
          isMatch: true,
          feedback: 'CSS matches reference design',
        };
      }

      return {
        isMatch: false,
        feedback: result,
      };
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error evaluating CSS result:', error);
    throw error;
  }
};

/**
 * Validates and sanitizes CSS to prevent refusal responses
 * @param css The CSS to validate and sanitize
 * @returns Sanitized CSS
 */
function validateAndSanitizeCSS(css: string): string {
  // Check if CSS contains common refusal messages
  const refusalPhrases = [
    "I'm sorry",
    'I cannot',
    "I can't",
    'I apologize',
    'I am not able to',
    "I'm unable to",
    'not appropriate',
    'against my ethical guidelines',
    'unable to assist',
  ];

  // If CSS is a refusal message, replace with placeholder CSS
  if (
    refusalPhrases.some((phrase) =>
      css.toLowerCase().includes(phrase.toLowerCase()),
    )
  ) {
    console.warn(
      'Detected refusal message in CSS content, replacing with placeholder',
    );
    return '/* CSS content will be generated based on the evaluation */';
  }

  // Remove any markdown code block syntax if present
  let sanitized = css
    .replace(/```css\s*/g, '')
    .replace(/```\s*$/g, '')
    .replace(/```/g, '');

  // Ensure CSS is valid by checking for basic CSS syntax (this is a very simple check)
  if (
    !sanitized.includes('{') &&
    !sanitized.includes('}') &&
    sanitized.trim().length > 0
  ) {
    console.warn('CSS content may not be valid CSS, adding minimal structure');
    sanitized = '/* CSS content appears to be malformed */\n' + sanitized;
  }

  return sanitized;
}

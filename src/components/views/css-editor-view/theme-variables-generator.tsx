import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { HexColorPicker } from 'react-colorful';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAppContext } from '@/contexts';
import { Plus, RotateCcw } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface ThemeVariablesGeneratorProps {
  forceShow?: boolean;
}

// CSS Variables types
interface ColorVariable {
  h: number;
  s: number;
  l: number;
  name: string;
  description: string;
}

interface FontVariable {
  size: string;
  lineHeight: string;
  weight: number;
  name: string;
}

interface SpacingVariable {
  value: string;
  name: string;
}

// Default values for state reset
const defaultColorVariables: Record<string, ColorVariable> = {
  accent: {
    h: 237,
    s: 81,
    l: 56,
    name: 'Accent',
    description: 'Primary color',
  },
  accentLabel: {
    h: 0,
    s: 100,
    l: 100,
    name: 'Accent Label',
    description: 'Primary button text color',
  },
  neutral: {
    h: 228,
    s: 10,
    l: 50,
    name: 'Neutral',
    description: 'Background color',
  },
  alert: {
    h: 360,
    s: 72,
    l: 52,
    name: 'Alert',
    description: 'Error messages',
  },
  warning: {
    h: 47,
    s: 74,
    l: 55,
    name: 'Warning',
    description: 'Warning messages',
  },
  success: {
    h: 135,
    s: 55,
    l: 55,
    name: 'Success',
    description: 'Success messages',
  },
  smart: {
    h: 256,
    s: 94,
    l: 63,
    name: 'Smart',
    description: 'Smart actions',
  },
};

const defaultHeadingVariables: Record<string, FontVariable> = {
  h1: { size: '1.75rem', lineHeight: '2.25rem', weight: 500, name: 'H1' },
  h2: { size: '1.5rem', lineHeight: '2rem', weight: 500, name: 'H2' },
  h3: { size: '1.25rem', lineHeight: '1.75rem', weight: 500, name: 'H3' },
  h4: { size: '1.125rem', lineHeight: '1.5rem', weight: 500, name: 'H4' },
  h5: { size: '1rem', lineHeight: '1.375rem', weight: 500, name: 'H5' },
  h6: { size: '0.875rem', lineHeight: '1.25rem', weight: 500, name: 'H6' },
};

const defaultTextVariables: Record<string, FontVariable> = {
  large: { size: '1rem', lineHeight: '1.375rem', weight: 400, name: 'Large' },
  default: {
    size: '0.875rem',
    lineHeight: '1.125rem',
    weight: 400,
    name: 'Default',
  },
  small: {
    size: '0.75rem',
    lineHeight: '1.125rem',
    weight: 400,
    name: 'Small',
  },
  mini: { size: '0.6875rem', lineHeight: '1rem', weight: 400, name: 'Mini' },
};

const defaultSpacingVariables: Record<string, SpacingVariable> = {
  spacing: { value: '0.25rem', name: 'Spacing Unit' },
  radius: { value: '0.0625rem', name: 'Radius Unit' },
  borderWidth: { value: '0.0625rem', name: 'Border Width Unit' },
};

const defaultFonts = {
  heading: 'Inter',
  paragraph: 'Inter',
  code: 'Consolas',
};

// Function to convert HSL to HEX
const hslToHex = (h: number, s: number, l: number): string => {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

// Function to convert HEX to HSL
const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  // Remove the # if present
  hex = hex.replace(/^#/, '');

  // Parse the hex values
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  s = Math.round(s * 100);
  l = Math.round(l * 100);

  return { h, s, l };
};

export const ThemeVariablesGenerator = ({
  forceShow = false,
}: ThemeVariablesGeneratorProps) => {
  const { setCssContent } = useAppContext();
  const [showGenerator, setShowGenerator] = useState(forceShow);

  // Color variables
  const [colorVariables, setColorVariables] = useState<
    Record<string, ColorVariable>
  >({ ...defaultColorVariables });

  // Typography variables
  const [headingVariables, setHeadingVariables] = useState<
    Record<string, FontVariable>
  >({ ...defaultHeadingVariables });

  const [textVariables, setTextVariables] = useState<
    Record<string, FontVariable>
  >({ ...defaultTextVariables });

  // Spacing variables
  const [spacingVariables, setSpacingVariables] = useState<
    Record<string, SpacingVariable>
  >({ ...defaultSpacingVariables });

  // Font families
  const [headingFont, setHeadingFont] = useState(defaultFonts.heading);
  const [paragraphFont, setParagraphFont] = useState(defaultFonts.paragraph);
  const [codeFont, setCodeFont] = useState(defaultFonts.code);

  const fontOptions = [
    'Inter',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Source Sans Pro',
    'Poppins',
    'Roboto Condensed',
    'Oswald',
  ];

  const codeFontOptions = [
    'Consolas',
    'Menlo',
    'Monaco',
    'Courier New',
    'monospace',
    'Fira Code',
    'Source Code Pro',
    'JetBrains Mono',
  ];

  // Initialize showGenerator when forceShow changes
  useEffect(() => {
    if (forceShow) {
      setShowGenerator(true);
    }
  }, [forceShow]);

  // Generate CSS variables string
  const generateCSSVariables = (): string => {
    let css = ':root {\n';

    // Color variables
    Object.entries(colorVariables).forEach(([key, variable]) => {
      const prefix = key === 'accentLabel' ? 'accent-label' : key;
      css += `  --${prefix}-h: ${variable.h} !important; /* ${variable.description} */\n`;
      css += `  --${prefix}-s: ${variable.s}% !important;\n`;
      css += `  --${prefix}-l: ${variable.l}% !important;\n\n`;
    });

    // Typography variables - headings
    Object.entries(headingVariables).forEach(([key, variable]) => {
      css += `  --fontSize-${key}: ${variable.size} !important;\n`;
      css += `  --lineHeight-${key}: ${variable.lineHeight} !important;\n`;
      css += `  --fontWeight-${key}-medium: ${variable.weight} !important;\n\n`;
    });

    // Typography variables - text
    Object.entries(textVariables).forEach(([key, variable]) => {
      css += `  --fontSize-${key}: ${variable.size} !important;\n`;
      css += `  --lineHeight-${key}: ${variable.lineHeight} !important;\n`;
      css += `  --fontWeight-${key}-regular: ${variable.weight} !important;\n`;
      if (key !== 'large') {
        css += `  --fontWeight-${key}-medium: ${Number(variable.weight) + 100} !important;\n`;
      }
      css += '\n';
    });

    // Spacing variables
    css += `  --spacing-unit: ${spacingVariables.spacing.value} !important;\n`;
    css += `  --radius-unit: ${spacingVariables.radius.value} !important;\n`;
    css += `  --border-width-unit: ${spacingVariables.borderWidth.value} !important;\n\n`;

    // Font families
    css += `  --font-family: "${paragraphFont}", -apple-system, BlinkMacSystemFont, sans-serif !important;\n`;
    css += `  --font-family-headings: "${headingFont}", -apple-system, BlinkMacSystemFont, sans-serif !important;\n`;
    css += `  --font-family-code: "${codeFont}", monospace !important;\n`;

    css += '}';
    return css;
  };

  // Auto apply CSS changes when any variable changes
  useEffect(() => {
    if (showGenerator) {
      const cssVariables = generateCSSVariables();
      setCssContent((prevContent) => {
        // Check if there's already a theme variables section
        const themeVarsRegex = /\/\* Theme Variables \*\/\n:root \{[\s\S]*?\}/;

        if (themeVarsRegex.test(prevContent)) {
          // Replace existing theme variables section
          return prevContent.replace(
            themeVarsRegex,
            `/* Theme Variables */\n${cssVariables}`,
          );
        } else {
          // If there's already content, add a newline
          const prefix =
            prevContent && prevContent.trim() !== ''
              ? `${prevContent}\n\n`
              : '';
          return `${prefix}/* Theme Variables */\n${cssVariables}`;
        }
      });

      // Note: Changes from this component are automatically applied to the page
      // 1. This useEffect updates the cssContent in the global context
      // 2. The CssEditor component detects that change and updates its editor
      // 3. The CssEditor's auto-apply feature then applies the changes to the page
      // This creates a seamless workflow where theme variable changes instantly appear on the page
    }
  }, [
    colorVariables,
    headingVariables,
    textVariables,
    spacingVariables,
    headingFont,
    paragraphFont,
    codeFont,
    showGenerator,
    setCssContent,
  ]);

  // Handler for color variable changes using color picker
  const handleColorPickerChange = (varKey: string, hexColor: string) => {
    const { h, s, l } = hexToHsl(hexColor);
    setColorVariables((prev) => ({
      ...prev,
      [varKey]: { ...prev[varKey], h, s, l },
    }));
  };

  // Handler for font variable changes
  const handleHeadingChange = (
    varKey: string,
    type: 'size' | 'lineHeight' | 'weight',
    value: string | number,
  ) => {
    setHeadingVariables((prev) => ({
      ...prev,
      [varKey]: { ...prev[varKey], [type]: value },
    }));
  };

  const handleTextChange = (
    varKey: string,
    type: 'size' | 'lineHeight' | 'weight',
    value: string | number,
  ) => {
    setTextVariables((prev) => ({
      ...prev,
      [varKey]: { ...prev[varKey], [type]: value },
    }));
  };

  // Handler for spacing variable changes
  const handleSpacingChange = (varKey: string, value: string) => {
    setSpacingVariables((prev) => ({
      ...prev,
      [varKey]: { ...prev[varKey], value },
    }));
  };

  // Reset all values to defaults
  const handleReset = () => {
    setColorVariables({ ...defaultColorVariables });
    setHeadingVariables({ ...defaultHeadingVariables });
    setTextVariables({ ...defaultTextVariables });
    setSpacingVariables({ ...defaultSpacingVariables });
    setHeadingFont(defaultFonts.heading);
    setParagraphFont(defaultFonts.paragraph);
    setCodeFont(defaultFonts.code);
  };

  if (!showGenerator && !forceShow) {
    return (
      <Button
        variant="outline"
        className="mb-2"
        onClick={() => setShowGenerator(true)}
      >
        <Plus className="mr-2 h-4 w-4" /> Add Theme Variables
      </Button>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex justify-end mb-6">
        <Button
          variant="outline"
          onClick={handleReset}
          size="sm"
          className="bg-white dark:bg-gray-800 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Reset
        </Button>
        {!forceShow && (
          <Button
            variant="outline"
            onClick={() => setShowGenerator(false)}
            size="sm"
            className="ml-2"
          >
            Cancel
          </Button>
        )}
      </div>

      <div className="space-y-10 overflow-y-auto max-h-[80vh] pb-6">
        {/* Font Family Section - Always visible */}
        <section className="rounded-lg bg-white dark:bg-gray-800/50 p-4 shadow-sm">
          <h4 className="text-lg font-medium mb-4 pb-2 border-b text-gray-800 dark:text-gray-200">
            Font Family
          </h4>
          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <label className="text-sm font-medium mb-2 block text-gray-700 dark:text-gray-300">
                Headings
              </label>
              <select
                value={headingFont}
                onChange={(e) => setHeadingFont(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary"
              >
                {fontOptions.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
              <div
                className="mt-3 p-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm text-lg"
                style={{ fontFamily: `"${headingFont}", sans-serif` }}
              >
                <span className="font-medium">Heading Sample</span>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <label className="text-sm font-medium mb-2 block text-gray-700 dark:text-gray-300">
                Paragraphs
              </label>
              <select
                value={paragraphFont}
                onChange={(e) => setParagraphFont(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary"
              >
                {fontOptions.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
              <div
                className="mt-3 p-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm"
                style={{ fontFamily: `"${paragraphFont}", sans-serif` }}
              >
                <span>
                  This is a paragraph text sample that shows how your content
                  will appear on the page.
                </span>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <label className="text-sm font-medium mb-2 block text-gray-700 dark:text-gray-300">
                Code
              </label>
              <select
                value={codeFont}
                onChange={(e) => setCodeFont(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary"
              >
                {codeFontOptions.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
              <div
                className="mt-3 p-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm font-mono text-sm overflow-x-auto"
                style={{ fontFamily: `"${codeFont}", monospace` }}
              >
                <span>
                  function example() {`{ return "Sample Code Block"; }`}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Colors Section */}
        <section className="rounded-lg bg-white dark:bg-gray-800/50 p-4 shadow-sm">
          <h4 className="text-lg font-medium mb-4 pb-2 border-b text-gray-800 dark:text-gray-200">
            Colors
          </h4>
          <div className="grid grid-cols-1 gap-4">
            {Object.entries(colorVariables).map(([key, variable]) => (
              <div
                key={key}
                className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg flex justify-between items-center"
              >
                <div>
                  <h3 className="font-medium text-gray-800 dark:text-gray-200">
                    {variable.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {variable.description}
                  </p>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="w-16 h-16 rounded-md cursor-pointer shadow-md hover:ring-2 ring-offset-2 ring-offset-background transition-shadow border border-gray-300 dark:border-gray-700"
                      style={{
                        backgroundColor: `hsl(${variable.h}, ${variable.s}%, ${variable.l}%)`,
                      }}
                      aria-label={`Select ${variable.name} color`}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" side="right">
                    <div className="mb-2 text-xs font-medium text-center text-gray-600 dark:text-gray-400">
                      {hslToHex(
                        variable.h,
                        variable.s,
                        variable.l,
                      ).toUpperCase()}
                    </div>
                    <HexColorPicker
                      color={hslToHex(variable.h, variable.s, variable.l)}
                      onChange={(hexColor) =>
                        handleColorPickerChange(key, hexColor)
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </div>
        </section>

        {/* Typography Section with Accordions */}
        <section className="rounded-lg bg-white dark:bg-gray-800/50 p-4 shadow-sm">
          <h4 className="text-lg font-medium mb-4 pb-2 border-b text-gray-800 dark:text-gray-200">
            Typography
          </h4>

          <Accordion type="single" collapsible className="space-y-2">
            <AccordionItem
              value="headings"
              className="border-0 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="py-3 px-4 hover:bg-gray-100 dark:hover:bg-gray-700">
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  Headings
                </span>
              </AccordionTrigger>
              <AccordionContent className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                <div className="space-y-5 p-4">
                  {Object.entries(headingVariables).map(([key, variable]) => (
                    <div
                      key={key}
                      className="pt-2 pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0"
                    >
                      <h4 className="font-medium text-sm mb-3 text-gray-800 dark:text-gray-200">
                        {variable.name}
                      </h4>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1.5">
                            Font Size
                          </label>
                          <input
                            type="text"
                            value={variable.size}
                            onChange={(e) =>
                              handleHeadingChange(key, 'size', e.target.value)
                            }
                            className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1.5">
                            Line Height
                          </label>
                          <input
                            type="text"
                            value={variable.lineHeight}
                            onChange={(e) =>
                              handleHeadingChange(
                                key,
                                'lineHeight',
                                e.target.value,
                              )
                            }
                            className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1.5">
                            Weight
                          </label>
                          <select
                            value={variable.weight}
                            onChange={(e) =>
                              handleHeadingChange(
                                key,
                                'weight',
                                Number(e.target.value),
                              )
                            }
                            className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary text-sm"
                          >
                            <option value="300">Light</option>
                            <option value="400">Regular</option>
                            <option value="500">Medium</option>
                            <option value="600">SemiBold</option>
                            <option value="700">Bold</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="text-sizes"
              className="border-0 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="py-3 px-4 hover:bg-gray-100 dark:hover:bg-gray-700">
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  Text Sizes
                </span>
              </AccordionTrigger>
              <AccordionContent className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                <div className="space-y-5 p-4">
                  {Object.entries(textVariables).map(([key, variable]) => (
                    <div
                      key={key}
                      className="pt-2 pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0"
                    >
                      <h4 className="font-medium text-sm mb-3 text-gray-800 dark:text-gray-200">
                        {variable.name}
                      </h4>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1.5">
                            Font Size
                          </label>
                          <input
                            type="text"
                            value={variable.size}
                            onChange={(e) =>
                              handleTextChange(key, 'size', e.target.value)
                            }
                            className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1.5">
                            Line Height
                          </label>
                          <input
                            type="text"
                            value={variable.lineHeight}
                            onChange={(e) =>
                              handleTextChange(
                                key,
                                'lineHeight',
                                e.target.value,
                              )
                            }
                            className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1.5">
                            Weight
                          </label>
                          <select
                            value={variable.weight}
                            onChange={(e) =>
                              handleTextChange(
                                key,
                                'weight',
                                Number(e.target.value),
                              )
                            }
                            className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary text-sm"
                          >
                            <option value="300">Light</option>
                            <option value="400">Regular</option>
                            <option value="500">Medium</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Spacing Section */}
        <section className="rounded-lg bg-white dark:bg-gray-800/50 p-4 shadow-sm">
          <h4 className="text-lg font-medium mb-4 pb-2 border-b text-gray-800 dark:text-gray-200">
            Spacing Units
          </h4>
          <div className="space-y-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            {Object.entries(spacingVariables).map(([key, variable]) => (
              <div key={key} className="flex items-center space-x-4">
                <label className="text-sm font-medium w-40 text-gray-700 dark:text-gray-300">
                  {variable.name}
                </label>
                <input
                  type="text"
                  value={variable.value}
                  onChange={(e) => handleSpacingChange(key, e.target.value)}
                  className="p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary flex-1"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

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

const defaultFont = 'Inter';

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
  const [selectedFont, setSelectedFont] = useState(defaultFont);
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
    css += `  --border-width-unit: ${spacingVariables.borderWidth.value} !important;\n`;

    // Font family
    css += `  --font-family: "${selectedFont}", -apple-system, BlinkMacSystemFont, sans-serif !important;\n`;

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
    }
  }, [
    colorVariables,
    headingVariables,
    textVariables,
    spacingVariables,
    selectedFont,
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
    setSelectedFont(defaultFont);
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
    <div className="border rounded-md p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Theme Variables Generator</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} size="sm">
            <RotateCcw className="mr-2 h-4 w-4" /> Reset
          </Button>
          {!forceShow && (
            <Button
              variant="outline"
              onClick={() => setShowGenerator(false)}
              size="sm"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6 overflow-y-auto max-h-[70vh]">
        {/* Colors Section */}
        <div>
          <h4 className="text-md font-medium mb-3 pb-1 border-b">Colors</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(colorVariables).map(([key, variable]) => (
              <div key={key} className="border rounded-md p-3">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h3 className="font-medium">{variable.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {variable.description}
                    </p>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="w-10 h-10 rounded-md border cursor-pointer overflow-hidden"
                        style={{
                          backgroundColor: `hsl(${variable.h}, ${variable.s}%, ${variable.l}%)`,
                        }}
                        aria-label={`Select ${variable.name} color`}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" side="right">
                      <HexColorPicker
                        color={hslToHex(variable.h, variable.s, variable.l)}
                        onChange={(hexColor) =>
                          handleColorPickerChange(key, hexColor)
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="text-sm text-muted-foreground bg-gray-50 dark:bg-gray-900 p-2 rounded-md">
                  HSL: {variable.h}, {variable.s}%, {variable.l}%<br />
                  HEX: {hslToHex(variable.h, variable.s, variable.l)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Font Family Section */}
        <div>
          <h4 className="text-md font-medium mb-3 pb-1 border-b">
            Font Family
          </h4>
          <div className="border rounded-md p-3">
            <select
              value={selectedFont}
              onChange={(e) => setSelectedFont(e.target.value)}
              className="w-full p-2 border rounded-md"
            >
              {fontOptions.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Headings Section */}
        <div>
          <h4 className="text-md font-medium mb-3 pb-1 border-b">Headings</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(headingVariables).map(([key, variable]) => (
              <div key={key} className="border rounded-md p-3">
                <h4 className="font-medium mb-2">{variable.name}</h4>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm block mb-1">Font Size</label>
                    <input
                      type="text"
                      value={variable.size}
                      onChange={(e) =>
                        handleHeadingChange(key, 'size', e.target.value)
                      }
                      className="w-full p-1 border rounded-md"
                    />
                  </div>

                  <div>
                    <label className="text-sm block mb-1">Line Height</label>
                    <input
                      type="text"
                      value={variable.lineHeight}
                      onChange={(e) =>
                        handleHeadingChange(key, 'lineHeight', e.target.value)
                      }
                      className="w-full p-1 border rounded-md"
                    />
                  </div>

                  <div>
                    <label className="text-sm block mb-1">Font Weight</label>
                    <select
                      value={variable.weight}
                      onChange={(e) =>
                        handleHeadingChange(
                          key,
                          'weight',
                          Number(e.target.value),
                        )
                      }
                      className="w-full p-1 border rounded-md"
                    >
                      <option value="300">Light (300)</option>
                      <option value="400">Regular (400)</option>
                      <option value="500">Medium (500)</option>
                      <option value="600">SemiBold (600)</option>
                      <option value="700">Bold (700)</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Text Sizes Section */}
        <div>
          <h4 className="text-md font-medium mb-3 pb-1 border-b">Text Sizes</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(textVariables).map(([key, variable]) => (
              <div key={key} className="border rounded-md p-3">
                <h4 className="font-medium mb-2">{variable.name}</h4>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm block mb-1">Font Size</label>
                    <input
                      type="text"
                      value={variable.size}
                      onChange={(e) =>
                        handleTextChange(key, 'size', e.target.value)
                      }
                      className="w-full p-1 border rounded-md"
                    />
                  </div>

                  <div>
                    <label className="text-sm block mb-1">Line Height</label>
                    <input
                      type="text"
                      value={variable.lineHeight}
                      onChange={(e) =>
                        handleTextChange(key, 'lineHeight', e.target.value)
                      }
                      className="w-full p-1 border rounded-md"
                    />
                  </div>

                  <div>
                    <label className="text-sm block mb-1">
                      Font Weight (Regular)
                    </label>
                    <select
                      value={variable.weight}
                      onChange={(e) =>
                        handleTextChange(key, 'weight', Number(e.target.value))
                      }
                      className="w-full p-1 border rounded-md"
                    >
                      <option value="300">Light (300)</option>
                      <option value="400">Regular (400)</option>
                      <option value="500">Medium (500)</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spacing Section */}
        <div>
          <h4 className="text-md font-medium mb-3 pb-1 border-b">
            Spacing Units
          </h4>
          <div className="border rounded-md p-3">
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(spacingVariables).map(([key, variable]) => (
                <div key={key} className="flex items-center space-x-4">
                  <label className="text-sm w-40">{variable.name}</label>
                  <input
                    type="text"
                    value={variable.value}
                    onChange={(e) => handleSpacingChange(key, e.target.value)}
                    className="p-1 border rounded-md flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

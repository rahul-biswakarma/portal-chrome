import { useState } from 'react';
// Assuming Button, Card, CardContent, CardFooter, CardHeader, CardTitle are from shadcn/ui
// If your path is different, please adjust the import
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';

// These are your utility functions, ensure their paths are correct
import { captureScreenshot } from '@/utils/screenshot';
import { makeGeminiRequest, isValidImageData } from '@/utils/gemini-client';
import type { GeminiMessage, MessagePart } from '@/utils/gemini-client';
import { getEnvVariable } from '@/utils/environment';

// Define the structure of a theme object
export interface Theme {
  name: string; // e.g., "Vibrant Dusk", "Minimalist Ocean"
  headingFont: string;
  paragraphFont: string;
  accentColor: string; // HEX
  accentLabelColor: string; // HEX (for text/icons on accentColor)
  neutralColor: string; // HEX (main background/neutral elements)
  // Optional: A dedicated color for primary text on neutral backgrounds.
  // If not provided, we'll derive or use a sensible default.
  neutralTextColor?: string; // HEX
  spacingUnit: number;
  radiusUnit: number;
  borderWidthUnit: number;
}

interface ThemeSuggestionsProps {
  onApplyTheme: (theme: Theme) => void;
  currentTheme?: Omit<Theme, 'name'>; // Current theme values to send to Gemini
}

// Helper function to convert data URL to base64
const dataUrlToBase64 = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};

// Helper function to determine if a color is light or dark
// Returns true if light, false if dark
const isColorLight = (hexColor: string | undefined): boolean => {
  if (!hexColor || typeof hexColor !== 'string' || !hexColor.startsWith('#')) {
    return true; // Default to light background if color is invalid
  }
  try {
    let r, g, b;
    const color = hexColor.slice(1); // Remove #

    if (color.length === 3) {
      // #RGB
      r = parseInt(color[0] + color[0], 16);
      g = parseInt(color[1] + color[1], 16);
      b = parseInt(color[2] + color[2], 16);
    } else if (color.length === 6) {
      // #RRGGBB
      r = parseInt(color.slice(0, 2), 16);
      g = parseInt(color.slice(2, 4), 16);
      b = parseInt(color.slice(4, 6), 16);
    } else {
      return true; // Invalid hex length
    }
    // Using YIQ formula for perceived brightness (threshold 128-150 is common)
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 140; // Adjusted threshold for better visual separation
  } catch (e) {
    console.error('Error parsing color for lightness check:', hexColor, e);
    return true; // Default assumption: background is light
  }
};

// Function to generate themes using Gemini AI (your existing function)
const generateThemesWithGemini = async (
  currentTheme?: ThemeSuggestionsProps['currentTheme'],
): Promise<Theme[]> => {
  try {
    const apiKey = await getEnvVariable('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('Gemini API key not found. Please set it in Settings.');
    }

    const screenshot = await captureScreenshot({ fullPage: false });

    const themePrompt = `You are an expert UI/UX designer specializing in theme generation for web applications.

TASK: Generate 6 diverse, professional theme suggestions based on the current page screenshot and theme context.

CURRENT THEME CONTEXT:
${
  currentTheme
    ? `
- Heading Font: ${currentTheme.headingFont}
- Paragraph Font: ${currentTheme.paragraphFont}
- Accent Color: ${currentTheme.accentColor}
- Accent Label Color: ${currentTheme.accentLabelColor}
- Neutral Color: ${currentTheme.neutralColor}
- Spacing Unit: ${currentTheme.spacingUnit}rem (Default: 0.25rem = 100%)
- Radius Unit: ${currentTheme.radiusUnit}rem (Default: 0.0625rem)
- Border Width: ${currentTheme.borderWidthUnit}rem (Default: 0.0625rem)
`
    : `Default values: Spacing=0.25rem (100% base), Radius=0.0625rem, Border=0.0625rem`
}

REQUIREMENTS:
1. Generate 6 unique themes with creative names.
2. Each theme should be professionally designed and cohesive.
3. Vary font combinations from: Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Source Sans Pro, Nunito Sans, Work Sans, DM Sans.
4. Create harmonious color schemes with proper contrast.
   - Provide 'accentColor', 'accentLabelColor' (for text/icons on accent), 'neutralColor' (for backgrounds).
   - Optionally, provide 'neutralTextColor' for primary text on neutral backgrounds. If not provided, ensure 'accentLabelColor' or a standard dark/light color would be appropriate.
   - The neutralColor will be automatically applied to portal header, footer, and container elements.
5. Use rem units for layout values:
   - Spacing: 0.225rem-0.275rem range (where 0.25rem = 100% base, default)
   - Radius: 0rem-0.5rem range (where 0.0625rem = default small radius)
   - Border: 0rem-0.1875rem range (where 0.0625rem = default thin border)
6. Ensure themes work well for the application shown in the screenshot.
7. Make themes distinct from each other and the current theme.

RESPONSE FORMAT:
Return a valid JSON array with exactly 6 theme objects. Each theme must have this exact structure:

[
  {
    "name": "Theme Name",
    "headingFont": "Font Name",
    "paragraphFont": "Font Name",
    "accentColor": "#HEXCODE",
    "accentLabelColor": "#HEXCODE",
    "neutralColor": "#HEXCODE",
    "neutralTextColor": "#HEXCODE", // Optional, but recommended for clarity
    "spacingUnit": number,
    "radiusUnit": number,
    "borderWidthUnit": number
  }
]

IMPORTANT: Return ONLY the JSON array, no other text or explanations.`;

    const parts: MessagePart[] = [{ text: themePrompt }];

    if (isValidImageData(screenshot)) {
      const imgData = dataUrlToBase64(screenshot);
      const mimeType = screenshot.split(';')[0].split(':')[1];
      parts.push({
        inline_data: {
          // Using your existing 'inline_data' structure
          data: imgData,
          mime_type: mimeType,
        },
      });
    }

    const messages: GeminiMessage[] = [{ role: 'user', parts }];
    const model = (await getEnvVariable('GEMINI_MODEL')) || 'gemini-2.0-flash'; // Updated to general latest flash

    const responseText = await makeGeminiRequest({
      // Assuming makeGeminiRequest returns the text directly
      apiKey,
      messages,
      modelName: model,
      sessionId: `theme_gen_${Date.now()}`,
      temperature: 0.7,
    });

    try {
      const cleanResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const themes = JSON.parse(cleanResponse) as Theme[];

      if (!Array.isArray(themes) || themes.length === 0) {
        throw new Error(
          'Invalid response format from Gemini: Not an array or empty.',
        );
      }

      themes.forEach((theme, index) => {
        if (
          !theme.name ||
          !theme.headingFont ||
          !theme.paragraphFont ||
          !theme.accentColor ||
          !theme.accentLabelColor ||
          !theme.neutralColor ||
          typeof theme.spacingUnit !== 'number' ||
          typeof theme.radiusUnit !== 'number' ||
          typeof theme.borderWidthUnit !== 'number'
        ) {
          console.warn(`Invalid theme structure at index ${index}:`, theme);
          throw new Error(
            `Invalid theme structure at index ${index}. Ensure all required fields are present.`,
          );
        }
        // Basic HEX color validation
        const hexColorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/;
        if (
          !hexColorRegex.test(theme.accentColor) ||
          !hexColorRegex.test(theme.accentLabelColor) ||
          !hexColorRegex.test(theme.neutralColor) ||
          (theme.neutralTextColor &&
            !hexColorRegex.test(theme.neutralTextColor))
        ) {
          throw new Error(
            `Invalid HEX color format in theme at index ${index}.`,
          );
        }
      });

      return themes;
    } catch (parseError: unknown) {
      if (parseError instanceof Error) {
        console.error('Error parsing Gemini response:', parseError.message);
      } else {
        console.error('Unknown error parsing Gemini response:', parseError);
      }
      console.error('Raw response:', responseText);
      throw new Error(
        `Failed to parse theme suggestions from Gemini: ${parseError}`,
      );
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error generating themes with Gemini:', error.message);
      throw error;
    } else {
      console.error('Unknown error generating themes with Gemini:', error);
      throw new Error('Unknown error occurred');
    }
  }
};

// New component for the aesthetic theme preview card content
const AestheticThemePreviewCardContent = ({ theme }: { theme: Theme }) => {
  // Determine contrasting text color based on the neutralColor's lightness
  const isNeutralLight = isColorLight(theme.neutralColor);
  const textColor = isNeutralLight ? '#374151' : '#F9FAFB'; // Dark gray for light bg, light gray for dark bg

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header section with accent color */}
      <div
        className="h-8 w-full relative"
        style={{ backgroundColor: theme.accentColor }}
      >
        <div className="absolute inset-0 flex items-center justify-end pr-2">
          <div
            className="w-4 h-4 rounded"
            style={{
              backgroundColor: theme.accentLabelColor,
              opacity: 0.9,
            }}
          />
        </div>
      </div>

      {/* Main content area with neutral background */}
      <div
        className="flex-1 p-3 flex flex-col justify-between"
        style={{ backgroundColor: theme.neutralColor }}
      >
        {/* Content lines */}
        <div className="space-y-2">
          <div
            className="h-2 rounded-full"
            style={{
              backgroundColor: textColor,
              opacity: 0.8,
              width: '80%',
            }}
          />
          <div
            className="h-1.5 rounded-full"
            style={{
              backgroundColor: textColor,
              opacity: 0.6,
              width: '60%',
            }}
          />
        </div>

        {/* Color palette indicator */}
        <div className="flex items-center space-x-1 mt-3">
          <div
            className="w-3 h-3 rounded-full border border-white/20"
            style={{ backgroundColor: theme.accentColor }}
          />
          <div
            className="w-3 h-3 rounded-full border border-white/20"
            style={{ backgroundColor: theme.accentLabelColor }}
          />
          <div
            className="w-3 h-3 rounded-full border border-white/20"
            style={{ backgroundColor: theme.neutralColor }}
          />
        </div>
      </div>
    </div>
  );
};

export const ThemeSuggestions = ({
  onApplyTheme,
  currentTheme,
}: ThemeSuggestionsProps) => {
  const [suggestedThemes, setSuggestedThemes] = useState<Theme[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateClick = async () => {
    setIsLoading(true);
    setError(null);
    setSuggestedThemes(null); // Clear previous suggestions

    try {
      const themes = await generateThemesWithGemini(currentTheme);
      setSuggestedThemes(themes);
      console.log('Successfully generated themes with Gemini:', themes);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error('Failed to generate themes with Gemini:', err.message);
        setError(err.message);
      } else {
        console.error('Unknown error generating themes with Gemini:', err);
        setError(
          'Failed to generate AI themes. Please check console for details.',
        );
      }
      // Fallback themes can be set here if desired
      // setSuggestedThemes(getFallbackThemes());
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-foreground">
          🎨 AI Theme Suggestions
        </h2>
        <Button onClick={handleGenerateClick} disabled={isLoading} size="sm">
          {isLoading ? (
            <>
              <div className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mr-2"></div>
              Generating...
            </>
          ) : (
            '✨ Generate Themes'
          )}
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-blue-700 bg-blue-100 p-3 rounded-md flex items-center gap-2 border border-blue-200">
          <div className="inline-block w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0"></div>
          Analyzing page and crafting personalized themes with Gemini AI... This
          might take a moment.
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-100 p-3 rounded-md border border-red-200">
          ⚠️ Error: {error}
          {/* Removed "Using fallback themes." unless you implement fallback themes */}
        </div>
      )}

      {suggestedThemes && suggestedThemes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {suggestedThemes.map((theme, index) => (
            <Card
              key={index}
              className="overflow-hidden transition-all hover:shadow-lg cursor-pointer border-0 group"
              style={{
                aspectRatio: '4 / 5',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={() => onApplyTheme(theme)}
            >
              <CardHeader className="pb-2 pt-3 px-3 flex-shrink-0 bg-white"></CardHeader>
              {/* CardContent will now be our aesthetic preview */}
              <CardContent className="p-0 flex-grow">
                <AestheticThemePreviewCardContent theme={theme} />
              </CardContent>
              <CardFooter className="pt-2 pb-3 px-3 flex-shrink-0 bg-white">
                <div
                  className="w-full text-xs font-medium text-center py-2 px-3 rounded-md transition-all group-hover:shadow-sm"
                  style={{
                    backgroundColor: theme.accentColor,
                    color: theme.accentLabelColor,
                    borderRadius: `${Math.max(theme.radiusUnit * 4, 0.375)}rem`,
                  }}
                >
                  Apply Theme
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      {suggestedThemes &&
        suggestedThemes.length === 0 &&
        !isLoading &&
        !error && (
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md border border-gray-200">
            No themes were generated. Try adjusting your prompt or check the
            Gemini configuration.
          </div>
        )}
    </div>
  );
};

// Example of how you might call this component in your app:
// const App = () => {
//   const [currentAppTheme, setCurrentAppTheme] = useState<Theme | null>(null);
//   const handleApplyTheme = (theme: Theme) => {
//     console.log("Applying theme:", theme);
//     setCurrentAppTheme(theme);
//     // Here you would actually apply the theme to your app's styles:
//     // document.documentElement.style.setProperty('--accent-color', theme.accentColor);
//     // ... and so on for all CSS variables your app uses.
//   };

//   const initialThemeForGemini = currentAppTheme ? {
//       headingFont: currentAppTheme.headingFont,
//       paragraphFont: currentAppTheme.paragraphFont,
//       accentColor: currentAppTheme.accentColor,
//       accentLabelColor: currentAppTheme.accentLabelColor,
//       neutralColor: currentAppTheme.neutralColor,
//       spacingUnit: currentAppTheme.spacingUnit,
//       radiusUnit: currentAppTheme.radiusUnit,
//       borderWidthUnit: currentAppTheme.borderWidthUnit,
//   } : undefined;

//   return (
//     <div className="p-4">
//       <h1 className="text-2xl font-bold mb-4">Theme Customizer</h1>
//       <ThemeSuggestions
//         onApplyTheme={handleApplyTheme}
//         currentTheme={initialThemeForGemini}
//       />
//       {/* Rest of your app, styled by currentAppTheme */}
//     </div>
//   );
// };

// export default App; // If this is the main app component

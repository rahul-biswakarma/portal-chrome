import { useState } from 'react';
// Assuming Button, Card, CardContent, CardFooter, CardHeader, CardTitle are from shadcn/ui
// If your path is different, please adjust the import
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
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
- Spacing Unit: ${currentTheme.spacingUnit}rem
- Radius Unit: ${currentTheme.radiusUnit}rem
- Border Width: ${currentTheme.borderWidthUnit}rem
`
    : 'No current theme data available'
}

REQUIREMENTS:
1. Generate 6 unique themes with creative names.
2. Each theme should be professionally designed and cohesive.
3. Vary font combinations from: Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Source Sans Pro, Nunito Sans, Work Sans, DM Sans.
4. Create harmonious color schemes with proper contrast.
   - Provide 'accentColor', 'accentLabelColor' (for text/icons on accent), 'neutralColor' (for backgrounds).
   - Optionally, provide 'neutralTextColor' for primary text on neutral backgrounds. If not provided, ensure 'accentLabelColor' or a standard dark/light color would be appropriate.
5. Suggest appropriate spacing (0.5-1.5rem typical for base unit), radius (0-1rem typical), and border values (0.0625-0.1875rem typical).
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
    const model =
      (await getEnvVariable('GEMINI_MODEL')) || 'gemini-1.5-flash-latest'; // Updated to general latest flash

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
  const spacing = theme.spacingUnit;
  const radius = theme.radiusUnit;

  // Determine contrasting text/line color based on the neutralColor's lightness
  // This will be used for abstract lines and dots inside the preview
  const isNeutralLight = isColorLight(theme.neutralColor);
  const previewLineColor = theme.neutralTextColor
    ? theme.neutralTextColor
    : isNeutralLight
      ? '#4A5568'
      : '#E2E8F0'; // Tailwind gray-700 and gray-300

  // Color for the dots in the top bar (slightly darker/lighter than neutral)
  // const topBarDotColor = isNeutralLight
  //   ? `rgba(${parseInt(theme.neutralColor.slice(1, 3), 16) - 20}, ${parseInt(theme.neutralColor.slice(3, 5), 16) - 20}, ${parseInt(theme.neutralColor.slice(5, 7), 16) - 20}, 1)` // crude darken
  //   : `rgba(${parseInt(theme.neutralColor.slice(1, 3), 16) + 20}, ${parseInt(theme.neutralColor.slice(3, 5), 16) + 20}, ${parseInt(theme.neutralColor.slice(5, 7), 16) + 20}, 1)`; // crude lighten

  // Fallback for topBarDotColor if hex manipulation is too complex without a library
  const safeTopBarDotColor = isNeutralLight ? '#CBD5E0' : '#4A5568'; // Tailwind gray-400 / gray-700

  // Background for the inner content area (slightly different from main neutral)
  // For simplicity, we'll use the main neutralColor and rely on borders or shadows for separation if needed.
  // Or, a fixed offset. Let's use a fixed offset for demonstration.
  // const innerContentBg = isNeutralLight
  //   ? `rgba(${Math.max(0, parseInt(theme.neutralColor.slice(1, 3), 16) - 10)}, ${Math.max(0, parseInt(theme.neutralColor.slice(3, 5), 16) - 10)}, ${Math.max(0, parseInt(theme.neutralColor.slice(5, 7), 16) - 10)}, 1)`
  //   : `rgba(${Math.min(255, parseInt(theme.neutralColor.slice(1, 3), 16) + 10)}, ${Math.min(255, parseInt(theme.neutralColor.slice(3, 5), 16) + 10)}, ${Math.min(255, parseInt(theme.neutralColor.slice(5, 7), 16) + 10)}, 1)`;
  const safeInnerContentBg = isNeutralLight ? '#F7FAFC' : '#2D3748'; // Tailwind gray-100 / gray-800

  const listSectionBg = isNeutralLight ? '#FFFFFF' : '#1A202C'; // White or Tailwind gray-900

  return (
    <div
      className="flex flex-col gap-1 overflow-hidden" // Reduced gap for tighter look
      style={{
        padding: `${spacing * 0.75}rem`, // Use theme spacing
        borderRadius: `${radius}rem`, // Use theme radius
        // The main card will have theme.neutralColor as background
      }}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-1 px-1"
        style={{ height: `${spacing * 1.5}rem` }}
      >
        <span
          className="block w-2 h-2 rounded-full"
          style={{ backgroundColor: safeTopBarDotColor }}
        ></span>
        <span
          className="block w-2 h-2 rounded-full"
          style={{ backgroundColor: safeTopBarDotColor }}
        ></span>
        <span
          className="block w-2 h-2 rounded-full"
          style={{ backgroundColor: safeTopBarDotColor }}
        ></span>
      </div>

      {/* Main content area */}
      <div
        className="relative p-2 overflow-hidden" // Reduced padding
        style={{
          backgroundColor: safeInnerContentBg, // Slightly different neutral
          borderRadius: `${radius * 0.75}rem`,
          minHeight: '60px', // Ensure some height
        }}
      >
        {/* Wavy background element - using accent color with opacity */}
        <div
          className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] opacity-20 -z-1"
          style={{
            backgroundColor: theme.accentColor,
            borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
            transform: 'rotate(-15deg)',
          }}
        />
        <div className="relative z-10 flex justify-between items-start">
          <div className="flex-grow pr-2">
            {' '}
            {/* Text lines group */}
            <div
              className="h-2 mb-1"
              style={{
                width: '70%',
                backgroundColor: previewLineColor,
                borderRadius: `${radius * 0.25}rem`,
              }}
            ></div>
            <div
              className="h-1.5 mb-1"
              style={{
                width: '90%',
                backgroundColor: previewLineColor,
                borderRadius: `${radius * 0.25}rem`,
              }}
            ></div>
            <div
              className="h-1.5"
              style={{
                width: '50%',
                backgroundColor: previewLineColor,
                borderRadius: `${radius * 0.25}rem`,
              }}
            ></div>
          </div>
          <div // Accent placeholder shape
            className="flex-shrink-0"
            style={{
              width: `${spacing * 3.5}rem`,
              height: `${spacing * 3.5}rem`,
              backgroundColor: theme.accentColor,
              borderRadius: `${radius * 0.5}rem`,
            }}
          ></div>
        </div>
      </div>

      {/* Lower list-like section */}
      <div
        className="p-2 mt-1" // Reduced padding and margin
        style={{
          backgroundColor: listSectionBg,
          borderRadius: `${radius * 0.75}rem`,
        }}
      >
        {[
          theme.accentColor,
          theme.accentLabelColor,
          theme.neutralTextColor || previewLineColor,
        ].map((color, i) => (
          <div key={i} className="flex items-center gap-1.5 mb-1 last:mb-0">
            <span
              className="block flex-shrink-0"
              style={{
                width: `${spacing * 1}rem`,
                height: `${spacing * 1}rem`,
                backgroundColor: color,
                borderRadius: `${radius * 0.25}rem`,
              }}
            ></span>
            <div
              className="flex-grow h-1"
              style={{
                backgroundColor: previewLineColor,
                opacity: 0.7,
                borderRadius: `${radius * 0.25}rem`,
              }}
            ></div>
            <div className="flex flex-col gap-px">
              <i
                className="block w-px h-px rounded-full"
                style={{
                  backgroundColor: previewLineColor,
                  width: '1.5px',
                  height: '1.5px',
                }}
              ></i>
              <i
                className="block w-px h-px rounded-full"
                style={{
                  backgroundColor: previewLineColor,
                  width: '1.5px',
                  height: '1.5px',
                }}
              ></i>
              <i
                className="block w-px h-px rounded-full"
                style={{
                  backgroundColor: previewLineColor,
                  width: '1.5px',
                  height: '1.5px',
                }}
              ></i>
            </div>
          </div>
        ))}
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

  const getCardTitleColor = (neutralColor: string | undefined) => {
    return isColorLight(neutralColor) ? '#1A202C' : '#F7FAFC'; // Dark for light bg, Light for dark bg
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
              <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2"></div>
              Generating...
            </>
          ) : (
            '✨ Generate Themes'
          )}
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-blue-700 bg-blue-100 p-3 rounded-md flex items-center gap-2 border border-blue-200">
          <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
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
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {suggestedThemes.map((theme, index) => (
            <Card
              key={index}
              className="shadow-lg overflow-hidden transition-all hover:shadow-xl cursor-pointer"
              style={{
                backgroundColor: theme.neutralColor,
                borderRadius: '0px',
                border: `${theme.borderWidthUnit}rem solid ${isColorLight(theme.neutralColor) ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                aspectRatio: '1 / 1',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={() => onApplyTheme(theme)}
            >
              <CardHeader className="pb-1 pt-2 px-2.5 flex-shrink-0">
                <CardTitle
                  className="text-xs font-semibold truncate"
                  style={{
                    fontFamily: theme.headingFont,
                    color: getCardTitleColor(theme.neutralColor),
                  }}
                  title={theme.name}
                >
                  {theme.name}
                </CardTitle>
              </CardHeader>
              {/* CardContent will now be our aesthetic preview */}
              <CardContent className="p-0 flex-grow">
                <AestheticThemePreviewCardContent theme={theme} />
              </CardContent>
              <CardFooter className="pt-1.5 pb-2 px-2 flex-shrink-0">
                <div
                  className="w-full text-xs font-medium text-center py-1 px-2 rounded"
                  style={{
                    backgroundColor: theme.accentColor,
                    color: theme.accentLabelColor,
                    borderRadius: `${theme.radiusUnit * 0.75}rem`,
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

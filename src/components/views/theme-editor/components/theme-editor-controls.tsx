import { useState, useEffect } from 'react';
import { FontFamilySettings } from './font-family-settings';
import { ColorSettings } from './color-settings';
import { LayoutSettings } from './layout-settings';
import { ThemeSuggestions, Theme } from './theme-suggestions';
import { useAppContext } from '@/contexts';

// Utility functions for color conversion
// HEX to HSL conversion
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

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
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// HSL to HEX conversion
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// Default font values, can be moved to a constants file later
const defaultFonts = {
  heading: 'Inter',
  paragraph: 'Inter',
  // code: 'Consolas', // Not currently used in UI
};

export const ThemeEditorControls = () => {
  const { setCssContent } = useAppContext();

  // Font settings
  const [headingFont, setHeadingFont] = useState(defaultFonts.heading);
  const [paragraphFont, setParagraphFont] = useState(defaultFonts.paragraph);

  // Color settings - Initialized from provided HSL values
  const [accentColor, setAccentColor] = useState(hslToHex(237, 81, 56)); // --accent-h/s/l
  const [accentLabelColor, setAccentLabelColor] = useState(hslToHex(0, 0, 100)); // --accent-label-h/s/l (using 0,0,100 for white as 0,100,100 is also white)
  const [neutralColor, setNeutralColor] = useState(hslToHex(228, 10, 97)); // --neutral-h/s + assumed L for light background

  // Layout settings
  const [spacingUnit, setSpacingUnit] = useState(0.25); // --spacing-unit: 0.25rem
  const [radiusUnit, setRadiusUnit] = useState(0.0625); // --radius-unit: 0.0625rem
  const [borderWidthUnit, setBorderWidthUnit] = useState(0.0625); // --border-width-unit: 0.0625rem

  // Function to apply a suggested theme
  const handleApplySuggestedTheme = (theme: Theme) => {
    setHeadingFont(theme.headingFont);
    setParagraphFont(theme.paragraphFont);
    setAccentColor(theme.accentColor);
    setAccentLabelColor(theme.accentLabelColor);
    setNeutralColor(theme.neutralColor);
    setSpacingUnit(theme.spacingUnit);
    setRadiusUnit(theme.radiusUnit);
    setBorderWidthUnit(theme.borderWidthUnit);
  };

  const generateThemeCSS = () => {
    const accentHsl = hexToHsl(accentColor) || { h: 237, s: 81, l: 56 };
    const accentLabelHsl = hexToHsl(accentLabelColor) || { h: 0, s: 0, l: 100 };
    const neutralHsl = hexToHsl(neutralColor) || { h: 228, s: 10, l: 97 };

    // Create @import statements for selected fonts
    const uniqueFonts = new Set<string>();
    if (headingFont) uniqueFonts.add(headingFont);
    if (paragraphFont) uniqueFonts.add(paragraphFont);

    let fontImports = '';
    uniqueFonts.forEach((font) => {
      // Replace spaces with '+' for Google Fonts URL
      const googleFontName = font.replace(/ /g, '+');
      fontImports += `@import url('https://fonts.googleapis.com/css2?family=${googleFontName}:wght@400;500;700&display=swap');\n`;
    });

    return `
      ${fontImports}
      :root {
        /* Font Variables */
        --font-heading: ${headingFont};
        --font-paragraph: ${paragraphFont};

        /* Color Variables */
        --accent-h: ${accentHsl.h};
        --accent-s: ${accentHsl.s}%;
        --accent-l: ${accentHsl.l}%;

        --accent-label-h: ${accentLabelHsl.h};
        --accent-label-s: ${accentLabelHsl.s}%;
        --accent-label-l: ${accentLabelHsl.l}%;

        --neutral-h: ${neutralHsl.h};
        --neutral-s: ${neutralHsl.s}%;
        --neutral-l: ${neutralHsl.l}%; /* Added neutral lightness */

        /* Static Color Variables (as provided by user) */
        --alert-h: 360;
        --alert-s: 72%;
        --alert-l: 52%;

        --warning-h: 47;
        --warning-s: 74%;
        --warning-l: 55%;

        --success-h: 135;
        --success-s: 55%;
        --success-l: 55%;

        --smart-h: 256;
        --smart-s: 94%;
        --smart-l: 63%;

        /* Layout Variables */
        --spacing-unit: ${spacingUnit}rem;
        --radius-unit: ${radiusUnit}rem;
        --border-width-unit: ${borderWidthUnit}rem;

        /* Font Size/Weight Variables (as provided by user, static for now) */
        --fontSize-h1: 1.75rem;
        --lineHeight-h1: 2.25rem;
        --fontWeight-h1-medium: 500;

        --fontSize-h2: 1.5rem;
        --lineHeight-h2: 2rem;
        --fontWeight-h2-medium: 500;

        --fontSize-h3: 1.25rem;
        --lineHeight-h3: 1.75rem;
        --fontWeight-h3-medium: 500;

        --fontSize-h4: 1.125rem;
        --lineHeight-h4: 1.5rem;
        --fontWeight-h4-medium: 500;

        --fontSize-h5: 1rem;
        --lineHeight-h5: 1.375rem;
        --fontWeight-h5-medium: 500;

        --fontSize-h6: 0.875rem;
        --lineHeight-h6: 1.25rem;
        --fontWeight-h6-medium: 500;

        --fontSize-large: 1rem;
        --lineHeight-large: 1.375rem;
        --fontWeight-large-regular: 400;

        --fontSize-default: 0.875rem;
        --lineHeight-default: 1.125rem;
        --fontWeight-default-regular: 400;
        --fontWeight-default-medium: 500;

        --fontSize-small: 0.75rem;
        --lineHeight-small: 1.125rem;
        --fontWeight-small-regular: 400;
        --fontWeight-small-medium: 500;

        --fontSize-mini: 0.6875rem;
        --lineHeight-mini: 1rem;
        --fontWeight-mini-regular: 400;
        --fontWeight-mini-medium: 500;
      }
    `;
  };

  useEffect(() => {
    const themeCSS = generateThemeCSS();
    setCssContent(themeCSS);

    // Apply styles directly to documentElement for instant preview
    const root = document.documentElement;

    // Fonts
    root.style.setProperty('--font-heading', headingFont);
    root.style.setProperty('--font-paragraph', paragraphFont);

    // Colors (HSL components)
    const accentHsl = hexToHsl(accentColor) || { h: 237, s: 81, l: 56 };
    root.style.setProperty('--accent-h', String(accentHsl.h));
    root.style.setProperty('--accent-s', `${accentHsl.s}%`);
    root.style.setProperty('--accent-l', `${accentHsl.l}%`);

    const accentLabelHsl = hexToHsl(accentLabelColor) || { h: 0, s: 0, l: 100 };
    root.style.setProperty('--accent-label-h', String(accentLabelHsl.h));
    root.style.setProperty('--accent-label-s', `${accentLabelHsl.s}%`);
    root.style.setProperty('--accent-label-l', `${accentLabelHsl.l}%`);

    const neutralHsl = hexToHsl(neutralColor) || { h: 228, s: 10, l: 97 };
    root.style.setProperty('--neutral-h', String(neutralHsl.h));
    root.style.setProperty('--neutral-s', `${neutralHsl.s}%`);
    root.style.setProperty('--neutral-l', `${neutralHsl.l}%`);

    // Layout Units
    root.style.setProperty('--spacing-unit', `${spacingUnit}rem`);
    root.style.setProperty('--radius-unit', `${radiusUnit}rem`);
    root.style.setProperty('--border-width-unit', `${borderWidthUnit}rem`);
  }, [
    headingFont,
    paragraphFont,
    accentColor,
    accentLabelColor,
    neutralColor,
    spacingUnit,
    radiusUnit,
    borderWidthUnit,
    setCssContent,
  ]);

  // Handlers for color changes
  const handleAccentColorChange = (color: string) => setAccentColor(color);
  const handleAccentLabelColorChange = (color: string) =>
    setAccentLabelColor(color);
  const handleNeutralColorChange = (color: string) => setNeutralColor(color);

  // Handlers for layout changes
  const handleSpacingUnitChange = (value: number) => setSpacingUnit(value);
  const handleRadiusUnitChange = (value: number) => setRadiusUnit(value);
  const handleBorderWidthUnitChange = (value: number) =>
    setBorderWidthUnit(value);

  return (
    <div className="flex flex-col gap-4">
      <FontFamilySettings
        headingFont={headingFont}
        paragraphFont={paragraphFont}
        onHeadingFontChange={setHeadingFont}
        onParagraphFontChange={setParagraphFont}
      />
      <ColorSettings
        accentColor={accentColor}
        accentLabelColor={accentLabelColor}
        neutralColor={neutralColor}
        onAccentColorChange={handleAccentColorChange}
        onAccentLabelColorChange={handleAccentLabelColorChange}
        onNeutralColorChange={handleNeutralColorChange}
      />
      <LayoutSettings
        spacingUnit={spacingUnit}
        radiusUnit={radiusUnit}
        borderWidthUnit={borderWidthUnit}
        onSpacingUnitChange={handleSpacingUnitChange}
        onRadiusUnitChange={handleRadiusUnitChange}
        onBorderWidthUnitChange={handleBorderWidthUnitChange}
      />
      <ThemeSuggestions onApplyTheme={handleApplySuggestedTheme} />
    </div>
  );
};

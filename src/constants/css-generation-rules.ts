/**
 * Shared CSS generation rules for all AI services
 * These rules ensure compliance with portal CSS validation
 */

export const CSS_GENERATION_RULES = `STRICT CSS GENERATION RULES:
1. ONLY use class selectors starting with .portal- (e.g., .portal-header, .portal-button, .portal-card)
2. NEVER use element selectors (e.g., div, span, p, h1, body, html)
3. NEVER use ID selectors (e.g., #header, #content)
4. NEVER use attribute selectors (e.g., [data-attr], [type="text"])
5. NEVER use pseudo-elements (e.g., ::before, ::after)
6. NEVER use combinator selectors (e.g., >, +, ~)
7. You may use nested selectors with spaces (e.g., .portal-card .portal-title)
8. You may use pseudo-classes like :hover, :focus, :active
9. Universal selector (*) is allowed if needed
10. All class names in selectors MUST start with .portal-

VALID EXAMPLES:
- .portal-header { background-color: #f8f9fa; }
- .portal-button:hover { transform: scale(1.05); }
- .portal-card .portal-title { font-size: 1.2rem; }
- .portal-container .portal-item { margin: 10px; }

INVALID EXAMPLES (DO NOT USE):
- div { color: red; }
- #header { background: blue; }
- .portal-button > span { color: green; }
- .portal-card::before { content: ""; }
- [data-role="button"] { padding: 10px; }
- body .portal-header { font-size: 16px; }`;

export const ADDITIONAL_CSS_REQUIREMENTS = `ADDITIONAL REQUIREMENTS:
1. Focus on colors, typography, spacing, layout, and visual effects
2. Make it modern and visually appealing
3. Ensure good contrast and accessibility
4. Only use the portal classes provided in the context`;

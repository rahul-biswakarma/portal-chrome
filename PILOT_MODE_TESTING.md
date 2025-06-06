# Pilot Mode Testing Guide

## Prerequisites

- Ensure Gemini API key is set in Settings tab
- Have 1-3 reference images ready (screenshots of desired designs)
- Access to a portal with `.portal-directory-card` elements
- Portal pages with elements that have `portal-*` class names

## New Features to Test

### Stop Button Functionality

- [ ] Verify stop button appears during processing stages
- [ ] Test stopping during each stage (screenshot, CSS generation, applying, feedback)
- [ ] Check that process gracefully stops and returns to appropriate state
- [ ] Verify no partial/broken CSS is left in editor when stopped

### DOM Structure Extraction

- [ ] Check that portal elements are correctly identified
- [ ] Verify Tailwind classes are separated from portal classes
- [ ] Test hierarchical structure display (parent-child relationships)
- [ ] Ensure DOM structure is included in Gemini prompts

## Testing Flow

### 1. Initial Setup Test

- [ ] Navigate to Pilot Mode tab
- [ ] Verify Gemini API key warning shows if key is missing
- [ ] Upload 1-3 reference images
- [ ] Verify images display correctly with remove buttons
- [ ] Check that "Customize Portal" button is disabled without images
- [ ] Check that button enables when images are uploaded

### 2. Home Page Customization Test

- [ ] Click "Customize Portal" button
- [ ] Verify stage changes to "Customizing Home Page"
- [ ] Check that feedback loop runs automatically:
  - [ ] DOM structure analysis (brief loading)
  - [ ] Screenshot taking (progress ~20%)
  - [ ] CSS generation (progress ~50%)
  - [ ] CSS application (progress ~70%)
  - [ ] AI feedback (progress ~85%)
  - [ ] Completion (progress 100%)
- [ ] Verify stop button appears during processing
- [ ] Test stopping at different stages
- [ ] Verify CSS appears in CSS Editor tab
- [ ] Check that page styling actually changes
- [ ] Verify loop stops early if AI responds with "DONE"
- [ ] Test that loop completes after max 3 iterations

### 3. Stop Button Tests

- [ ] Stop during initial screenshot - should return to reference collection
- [ ] Stop during CSS generation - should return to reference collection
- [ ] Stop during CSS application - should return to reference collection
- [ ] Stop during feedback loop - should return to reference collection
- [ ] Verify CSS Editor content remains unchanged when stopped
- [ ] Test starting new customization after stopping

### 4. Navigation Test

- [ ] Click "Customize Next Page" when home page is complete
- [ ] Verify navigation stage shows with yellow background
- [ ] Verify stop button appears during navigation
- [ ] Test stopping during navigation
- [ ] Check that first `.portal-directory-card` is clicked automatically
- [ ] Verify 3-second wait for page load (with stop checks)
- [ ] Check that page title updates correctly

### 5. Inner Page Customization Test

- [ ] Verify same feedback loop process as home page
- [ ] Test stop functionality during inner page customization
- [ ] Check that CSS continues to accumulate (not replace)
- [ ] Verify styling applies to inner page elements
- [ ] Test completion flow

### 6. DOM Structure Tests

- [ ] Verify portal elements are detected on current page
- [ ] Check DOM structure format matches specification:
  ```
  div [portal-home-page] [tailwind: mx-2 py-3 bg-red-500]
  |_ a [portal-home-link] [tailwind: ...]
  |    |_ svg [portal-home-icon] [tailwind: ...]
  |_ h1 [portal-title] [tailwind: ...]
  ```
- [ ] Test with nested portal elements
- [ ] Test with portal elements that have no Tailwind classes
- [ ] Verify non-portal elements are ignored

### 7. Error Handling Tests

- [ ] Test with no internet connection
- [ ] Test with invalid Gemini API key
- [ ] Test with malformed reference images
- [ ] Test navigation when no `.portal-directory-card` exists
- [ ] Test DOM extraction when no portal elements exist
- [ ] Verify graceful error messages and recovery

### 8. UI/UX Tests

- [ ] Verify status messages are clear and helpful
- [ ] Check progress bars update smoothly
- [ ] Test loading states show appropriate spinners
- [ ] Verify button states (enabled/disabled) are correct
- [ ] Check that error states are visually distinct
- [ ] Verify stop button is prominently displayed and accessible
- [ ] Test stop button visual feedback

### 9. Edge Cases

- [ ] Test with very large reference images
- [ ] Test with black and white reference images
- [ ] Test rapid clicking of buttons
- [ ] Test rapid clicking of stop button
- [ ] Test browser refresh during process
- [ ] Test with minimal portal content
- [ ] Test with deeply nested portal elements
- [ ] Test with many portal elements (performance)

## Expected Behaviors

### Success Indicators

- ✅ CSS accumulates properly between home and inner pages
- ✅ Visual changes are immediately visible on the portal
- ✅ AI feedback loop improves styling iteratively
- ✅ Process completes gracefully with success message
- ✅ Generated CSS targets only `.portal-*` classes
- ✅ Stop button cleanly halts process at any stage
- ✅ DOM structure is correctly extracted and formatted
- ✅ Gemini prompts include detailed portal element hierarchy

### Warning Signs

- ⚠️ CSS editor content gets replaced instead of accumulated
- ⚠️ Feedback loops run indefinitely without stopping
- ⚠️ Generated CSS targets non-portal elements
- ⚠️ Navigation fails without clear error message
- ⚠️ Process gets stuck in any stage without progress
- ⚠️ Stop button doesn't appear during processing
- ⚠️ Stopping leaves CSS editor in inconsistent state
- ⚠️ DOM structure extraction fails silently
- ⚠️ Non-portal elements appear in DOM structure

## Debug Information

- Check browser console for error messages
- Monitor Network tab for API call failures
- Verify CSS Editor tab shows accumulated styles
- Check Logger tab for detailed operation logs
- Check console for DOM structure extraction logs
- Monitor stop flag state changes in debug tools

## Performance Notes

- Each feedback loop adds ~10-15 seconds
- Full process typically takes 2-4 minutes
- Large reference images may slow down API calls
- Multiple browser tabs may affect screenshot quality
- DOM structure extraction adds ~1-2 seconds per page
- Stop functionality should respond within 1 second

## DOM Structure Testing

### Test Portal Element Hierarchy

Create test portal with structure like:

```html
<div class="portal-home-page mx-4 py-6 bg-blue-100">
  <header class="portal-header p-4 bg-white shadow-md">
    <h1 class="portal-title text-2xl font-bold text-gray-800">Title</h1>
    <nav class="portal-nav flex space-x-4">
      <a class="portal-nav-link text-blue-600 hover:text-blue-800">Link</a>
    </nav>
  </header>
  <main class="portal-content grid grid-cols-2 gap-4 p-6">
    <div class="portal-directory-card bg-white rounded-lg shadow p-4">
      <h2 class="portal-card-title text-lg font-semibold">Card Title</h2>
      <p class="portal-card-description text-gray-600">Description</p>
    </div>
  </main>
</div>
```

Expected DOM structure output:

```
div [portal-home-page] [tailwind: mx-4 py-6 bg-blue-100]
|_ header [portal-header] [tailwind: p-4 bg-white shadow-md]
|  |_ h1 [portal-title] [tailwind: text-2xl font-bold text-gray-800]
|  |_ nav [portal-nav] [tailwind: flex space-x-4]
|     |_ a [portal-nav-link] [tailwind: text-blue-600 hover:text-blue-800]
|_ main [portal-content] [tailwind: grid grid-cols-2 gap-4 p-6]
   |_ div [portal-directory-card] [tailwind: bg-white rounded-lg shadow p-4]
      |_ h2 [portal-card-title] [tailwind: text-lg font-semibold]
      |_ p [portal-card-description] [tailwind: text-gray-600]
```

# Portal Chrome Extension - Pilot Mode Testing

## Overview

This document outlines the testing procedures and capabilities for the Pilot Mode feature of the Portal Chrome Extension.

## Pilot Mode Capabilities

### 1. Reference Image Collection

- Upload 1-3 reference images showing the desired design
- Images are used as visual targets for CSS generation
- Supports common image formats (PNG, JPG, etc.)

### 2. Two-Stage Customization Process

#### Stage 1: Home Page Customization

- Automatically detects portal-\* classes in the DOM
- Generates initial CSS based on reference images
- Runs feedback loops to iteratively improve the styling
- Takes screenshots to compare against reference images

#### Stage 2: Inner Page Navigation & Customization

- Automatically navigates to inner pages by clicking portal-directory-card elements
- Applies the same customization process to inner pages
- Maintains consistency across the portal

### 3. Feedback Loop System (IMPROVED)

The feedback loop system has been significantly enhanced to address quality degradation issues:

#### Previous Issues:

- Generated wrong CSS using custom classes like `.humand-`, `.site-`, etc.
- Did not provide available portal classes to the AI
- Lacked current CSS context and computed styles
- Quality degraded after first iteration

#### New Improvements:

**1. Comprehensive Context Provision:**

- Extracts all available `.portal-` classes from the DOM
- Provides current computed styles for each portal class
- Sends complete current CSS along with new requests
- Includes DOM structure for better understanding

**2. Enhanced Prompts:**

- Clear instructions to ONLY use `.portal-` class selectors
- Explicit warnings against creating custom class names
- Better guidance for maintaining quality from first generation
- Emphasis on preserving good existing styles while improving mismatches

**3. CSS Validation:**

- Validates generated CSS to ensure only portal classes are used
- Provides warnings when non-portal classes are detected
- Filters out problematic non-portal CSS rules automatically
- Maintains CSS quality through iterations

**4. Improved Initial Generation:**

- Uses same comprehensive context as feedback loops
- Better instructions for creating robust, maintainable CSS
- Validates initial CSS for portal-only classes
- Creates strong foundation for iterative improvements

#### Technical Implementation:

```typescript
// Enhanced feedback loop with comprehensive context
const getSimpleFeedback = async (newScreenshot, domStructure, currentCSS) => {
  // Extract all portal classes from DOM
  const availablePortalClasses = await extractPortalClasses();

  // Get computed styles for context
  const computedStyles = await extractComputedStyles();

  // Provide comprehensive prompt with:
  // - Current CSS
  // - Available portal classes
  // - Computed styles
  // - Clear instructions for portal-only usage

  // Validate generated CSS
  const hasOnlyPortalClasses = validatePortalOnlyCSS(generatedCSS);
};
```

## Testing Procedures

### Prerequisites

1. **API Keys Required:**

   - Gemini API Key (for AI-powered CSS generation)
   - Set via environment variables or extension options

2. **Compatible Websites:**
   - Must contain elements with `portal-*` class names
   - Portal elements should be properly structured in the DOM

### Test Cases

#### Test Case 1: Basic Functionality

1. **Setup:**

   - Navigate to a portal-enabled website
   - Open the extension and go to Pilot Mode
   - Upload 1-2 reference images

2. **Expected Behavior:**

   - Extension detects portal classes
   - Generates initial CSS based on reference images
   - Applies CSS and takes screenshots
   - Runs feedback loops (max 3 iterations)
   - Provides option to navigate to inner pages

3. **Success Criteria:**
   - CSS generated uses only `.portal-` classes
   - Visual styling improves with each iteration
   - No custom class names (like `.humand-`) in generated CSS
   - Process completes within reasonable time

#### Test Case 2: Edge Cases

1. **No Portal Classes Found:**

   - Expected: Warning message, graceful degradation

2. **API Key Missing:**

   - Expected: Clear error message, setup instructions

3. **Network Issues:**

   - Expected: Timeout handling, retry mechanisms

4. **Invalid Reference Images:**
   - Expected: Format validation, error handling

#### Test Case 3: CSS Quality Validation

1. **Initial CSS Generation:**

   - Should contain only `.portal-` class selectors
   - Should be comprehensive and well-structured
   - Should provide good foundation for iterations

2. **Feedback Loop Iterations:**
   - Should maintain portal-only classes
   - Should preserve good existing styles
   - Should only modify styles that don't match reference
   - Should improve visual matching with each iteration

### Performance Metrics

- **CSS Generation Time:** < 30 seconds per iteration
- **Screenshot Capture:** < 5 seconds
- **Feedback Loop:** Max 3 iterations, 2-3 minutes total
- **Memory Usage:** Monitor for memory leaks during long sessions

### Common Issues & Troubleshooting

#### Issue: "Non-portal classes detected"

- **Cause:** AI generated CSS with custom class names
- **Fix:** Enhanced prompts now prevent this issue
- **Monitoring:** CSS validation provides warnings

#### Issue: "Quality degradation after first iteration"

- **Cause:** Insufficient context in feedback loops
- **Fix:** Comprehensive context now provided to AI
- **Prevention:** Better prompts and CSS validation

#### Issue: "CSS not applying correctly"

- **Cause:** Specificity issues or malformed CSS
- **Solution:** Use !important declarations, validate CSS syntax

### Monitoring & Logging

- Enable debug logs: `[PILOT-DEBUG]` prefixed messages
- Monitor API request/response times
- Track CSS validation warnings
- Review generated CSS for quality issues

### Future Improvements

1. **Enhanced Visual Comparison:** More sophisticated image analysis
2. **CSS Optimization:** Minification and optimization of generated CSS
3. **Template Library:** Pre-built CSS templates for common portal layouts
4. **A/B Testing:** Compare different AI models and prompts for best results

## Example Workflow

```
1. User uploads reference image showing desired design
2. Extension detects portal classes: [portal-header, portal-card, portal-footer]
3. Initial CSS generated with comprehensive context
4. CSS applied, screenshot taken
5. Feedback loop compares screenshot to reference
6. AI generates improved CSS using only portal classes
7. Process repeats until visual match achieved or max iterations reached
8. User can navigate to inner pages for consistent styling
```

This improved system ensures high-quality, maintainable CSS generation that uses only the available portal classes and maintains visual consistency throughout the feedback process.

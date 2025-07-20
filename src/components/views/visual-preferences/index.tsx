import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Wand2, Search, CheckCircle2 } from 'lucide-react';
import { domAnalysisService } from './services/dom-analysis.service';
import { uiGeneratorService } from './services/ui-generator.service';
import { cssGenerationService } from './services/css-generation.service';
import type { DetectedElement, UserPreferences, PreferenceValue } from './types';
import { useAppContext } from '@/contexts';

export const VisualPreferencesView: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [elements, setElements] = useState<DetectedElement[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { addLog, setCssContent, cssContent } = useAppContext();

  const analyzeCurrentPage = async () => {
    // Prevent multiple simultaneous API calls
    if (isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setIsLoading(true);
    try {
      addLog('🔍 Scanning page for UI elements...', 'info');
      addLog('🤖 Asking AI to generate custom UI controls...', 'info');

      // Use the new LLM-based analysis
      const analysis = await domAnalysisService.analyzeDOM();
      setElements(analysis.elements);

      // Initialize preferences as empty - only store values when explicitly changed
      const initialPreferences: UserPreferences = {};
      analysis.elements.forEach(element => {
        initialPreferences[element.id] = {};
        // Don't set default values - only store when user explicitly changes them
      });

      setPreferences(initialPreferences);

      if (analysis.elements.length > 0) {
        addLog(`✨ Generated ${analysis.elements.length} UI controls`, 'success');
      } else {
        addLog('⚠️ No UI controls could be generated for this page', 'warning');
      }
    } catch (error) {
      console.error('Error analyzing page:', error);
      addLog('❌ Failed to generate UI controls', 'error');
    } finally {
      setIsLoading(false);
      setIsAnalyzing(false);
    }
  };

  const updatePreference = async (
    elementId: string,
    preferenceId: string,
    value: PreferenceValue
  ) => {
    // Update state immediately
    const newPreferences = {
      ...preferences,
      [elementId]: {
        ...preferences[elementId],
        [preferenceId]: value,
      },
    };

    setPreferences(newPreferences);
    setHasUnsavedChanges(true);

    // Find the element for this preference
    const element = elements.find(el => el.id === elementId);
    if (!element) {
      console.error('Element not found for preference update:', elementId);
      return;
    }

    // Use the new comment-based CSS update system
    try {
      const updatedCSS = await cssGenerationService.updatePreferenceCSS(
        elementId,
        preferenceId,
        value,
        element,
        cssContent || ''
      );

      // Debug: CSS update successful
      console.log('Updated CSS with comment wrapper (length):', updatedCSS.length);
      console.log('Preference:', `${elementId}:${preferenceId}`, '=', value);

      // Set updated CSS in editor (the editor has auto-apply functionality)
      setCssContent(updatedCSS);
    } catch (error) {
      console.error('Error updating preference CSS:', error);
    }
  };

  const applyChanges = async () => {
    setIsLoading(true);
    try {
      addLog('💾 Saving preferences to CSS editor...', 'info');

      // Generate final CSS and set in CSS editor
      const css = await cssGenerationService.generateCSS(preferences, elements, {
        minify: false,
        addComments: false,
        useImportant: false,
        respectExistingStyles: true,
      });

      setCssContent(css);
      setHasUnsavedChanges(false);
      addLog('🎉 Preferences saved to CSS editor! CSS will auto-apply.', 'success');
    } catch (error) {
      console.error('Error saving preferences:', error);
      addLog('❌ Failed to save preferences', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const resetPreferences = () => {
    // Clear all preferences back to empty state (no CSS generation)
    const initialPreferences: UserPreferences = {};
    elements.forEach(element => {
      initialPreferences[element.id] = {};
      // Don't set any default values - keep empty
    });
    setPreferences(initialPreferences);
    setHasUnsavedChanges(false);

    // Clear the CSS editor
    setCssContent('');

    addLog('🔄 Preferences reset to defaults', 'info');
  };

  const renderPreferenceControl = (
    element: DetectedElement,
    option: DetectedElement['availablePreferences'][0]
  ) => {
    const currentValue = preferences[element.id]?.[option.id];

    // Use the dynamic UI generator service
    return uiGeneratorService.renderDynamicControl(element, option, currentValue, value =>
      updatePreference(element.id, option.id, value)
    );
  };

  if (isLoading && elements.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center space-y-4">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <Search className="h-6 w-6 text-primary/60 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              {isAnalyzing ? 'Analyzing Your Page' : 'Scanning Your Page'}
            </h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              {isAnalyzing
                ? 'Analyzing your page structure and generating UI controls...'
                : 'Preparing analysis tools...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">UI Editor</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Click below to analyze your page and generate customization options.
            </p>
          </div>

          {elements.length > 0 && (
            <>
              {/* Action Buttons */}
              <div className="flex items-center justify-center gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={resetPreferences}
                  disabled={isLoading || !hasUnsavedChanges}
                  className="shadow-sm"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                <Button
                  onClick={applyChanges}
                  disabled={isLoading || !hasUnsavedChanges}
                  className="shadow-sm"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  {isLoading ? 'Saving...' : 'Save to CSS Editor'}
                </Button>
              </div>

              {/* Status Indicator */}
              {hasUnsavedChanges && (
                <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-sm">
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                  Unsaved changes
                </div>
              )}
            </>
          )}
        </div>

        {/* Content */}
        {elements.length === 0 ? (
          <Card className="mx-auto max-w-lg">
            <CardContent className="py-16 text-center space-y-6">
              <div className="space-y-4">
                <div className="mx-auto w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                  <Wand2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">Ready to Analyze</h3>
                  <p className="text-muted-foreground">
                    Click the button below to analyze your page and generate customization options.
                  </p>
                </div>
              </div>

              <Button
                variant="default"
                onClick={analyzeCurrentPage}
                className="shadow-sm"
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Analyzing Page...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Analyze Page
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {elements.map(element => (
              <div key={element.id} className="border rounded-lg p-4 bg-card">
                <h3 className="font-medium text-base mb-3">{element.description}</h3>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {element.availablePreferences.map(option =>
                    renderPreferenceControl(element, option)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

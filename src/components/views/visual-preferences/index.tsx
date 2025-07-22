import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Wand2, Search, Settings, RotateCcw } from 'lucide-react';
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
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [defaultPrompt, setDefaultPrompt] = useState<string>('');
  const { addLog, setCssContent, cssContent } = useAppContext();

  // Load the default prompt when dialog opens
  const handlePromptDialogOpen = (open: boolean) => {
    if (open && !defaultPrompt) {
      // Get the default prompt from the service
      const prompt = domAnalysisService.getDefaultPrompt();
      setDefaultPrompt(prompt);
    }
    setIsPromptDialogOpen(open);
  };

  const analyzeCurrentPage = async () => {
    // Prevent multiple simultaneous API calls
    if (isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setIsLoading(true);

    // Clear existing state for re-analysis
    setElements([]);
    setPreferences({});
    setCssContent(''); // Clear any existing CSS from previous analysis

    try {
      addLog('🔍 Scanning page for UI elements...', 'info');
      addLog('🤖 Asking AI to generate custom UI controls...', 'info');

      // Use the new LLM-based analysis
      const analysis = await domAnalysisService.analyzeDOM(customPrompt || undefined);
      setElements(analysis.elements);

      // Initialize preferences as empty - only store values when explicitly changed
      const initialPreferences: UserPreferences = {};
      analysis.elements.forEach(element => {
        initialPreferences[element.id] = {};
        // Initialize with current values to prevent resetting but ensure proper isolation
        element.availablePreferences.forEach(pref => {
          // Only initialize if we have valid IDs to prevent undefined keys
          if (pref.id && pref.id !== 'undefined') {
            initialPreferences[element.id][pref.id] = pref.currentValue;
          } else {
            console.warn(`⚠️ Skipping preference with invalid ID:`, pref);
          }
        });
      });

      console.log('🏗️ Initialized preferences state:', initialPreferences);

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
    // Debug: Log the preference update
    console.log(
      `🔄 Updating preference: ${elementId}:${preferenceId}`,
      '=',
      value,
      '(type:',
      typeof value,
      ')'
    );

    // Ensure the elementId exists in preferences with all its current values preserved
    const currentElementPrefs = preferences[elementId] || {};

    // Make sure we don't lose any existing preference values for this element
    const element = elements.find(el => el.id === elementId);
    if (element) {
      // Initialize any missing preferences with their current values
      element.availablePreferences.forEach(pref => {
        if (!(pref.id in currentElementPrefs)) {
          currentElementPrefs[pref.id] = pref.currentValue;
        }
      });
    }

    // Update state with the new value while preserving all other preferences
    const newPreferences = {
      ...preferences,
      [elementId]: {
        ...currentElementPrefs,
        [preferenceId]: value,
      },
    };

    console.log('📊 Updated preferences state:', newPreferences);
    setPreferences(newPreferences);

    // Find the element for this preference
    if (!element) {
      console.error('Element not found for preference update:', elementId);
      return;
    }

    // Find the specific preference to debug its metadata
    const preference = element.availablePreferences.find(p => p.id === preferenceId);
    if (preference) {
      console.log('🎚️ Preference metadata:', {
        id: preference.id,
        type: preference.type,
        currentValue: preference.currentValue,
        newValue: value,
        metadata: preference.metadata,
      });
    }

    // Use the new comment-based CSS update system
    try {
      console.log('🎨 Starting CSS generation for:', { elementId, preferenceId, value });
      console.log('🎨 Current CSS content length:', cssContent?.length || 0);

      const updatedCSS = await cssGenerationService.updatePreferenceCSS(
        elementId,
        preferenceId,
        value,
        element,
        cssContent || ''
      );

      console.log('✅ CSS generation completed. New length:', updatedCSS.length);
      console.log('📝 CSS preview (last 300 chars):', updatedCSS.slice(-300));

      // Set updated CSS in editor (the editor has auto-apply functionality)
      setCssContent(updatedCSS);
      console.log('✅ CSS content updated in state');
    } catch (error) {
      console.error('❌ Error updating preference CSS:', error);
    }
  };

  const resetPreference = async (elementId: string, preferenceId: string) => {
    // Find the element and preference
    const element = elements.find(el => el.id === elementId);
    const preference = element?.availablePreferences.find(p => p.id === preferenceId);

    if (!element || !preference) {
      console.error('Element or preference not found for reset:', elementId, preferenceId);
      return;
    }

    // Reset to default value in state
    const defaultValue = preference.currentValue;
    const newPreferences = {
      ...preferences,
      [elementId]: {
        ...preferences[elementId],
        [preferenceId]: defaultValue,
      },
    };

    setPreferences(newPreferences);

    // Remove the CSS block for this preference
    try {
      const updatedCSS = await cssGenerationService.updatePreferenceCSS(
        elementId,
        preferenceId,
        defaultValue, // This will trigger removal since it equals default
        element,
        cssContent || ''
      );

      setCssContent(updatedCSS);
    } catch (error) {
      console.error('Error resetting preference CSS:', error);
    }
  };

  const renderPreferenceControl = (
    element: DetectedElement,
    option: DetectedElement['availablePreferences'][0]
  ) => {
    // Get the current value from preferences, but ensure it's properly typed
    let currentValue = preferences[element.id]?.[option.id];

    // Debug: Log the element and option details
    console.log(`🎛️ Rendering control for ${element.id}:${option.id}:`, {
      type: option.type,
      currentValue,
      defaultValue: option.currentValue,
      valueType: typeof currentValue,
      optionId: option.id,
      elementId: element.id,
      hasOptionId: option.id !== undefined,
      hasElementId: element.id !== undefined,
    });

    // Validate that we have proper IDs
    if (option.id === undefined || option.id === null) {
      console.error(`❌ Option ID is undefined for element ${element.id}:`, option);
      return null;
    }

    if (element.id === undefined || element.id === null) {
      console.error(`❌ Element ID is undefined:`, element);
      return null;
    }

    // If no value is set in preferences, use the option's current value (default)
    if (currentValue === undefined || currentValue === null) {
      currentValue = option.currentValue;
    }

    // Ensure proper type conversion based on the preference type
    switch (option.type) {
      case 'toggle':
        currentValue = Boolean(currentValue);
        break;
      case 'slider':
      case 'number-input': {
        // Ensure it's a valid number, use default if not
        const numValue = Number(currentValue);
        currentValue = isNaN(numValue) ? (option.currentValue as number) : numValue;
        break;
      }
      case 'dropdown':
      case 'layout-selector':
      case 'color-picker':
        currentValue = String(currentValue || option.currentValue);
        break;
      default:
        // Keep as-is for other types
        break;
    }

    // Create a unique key to prevent React from reusing components
    const uniqueKey = `${element.id}-${option.id}-${option.type}`;

    // Use the dynamic UI generator service with reset callback
    return uiGeneratorService.renderDynamicControl(
      element,
      option,
      currentValue,
      value => updatePreference(element.id, option.id, value),
      resetPreference,
      uniqueKey
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
      <div className="p-6 space-y-8">
        {/* Header Section */}
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">Visual Customizer</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Analyze your page to generate contextual customization options.
            </p>
          </div>

          {elements.length > 0 && (
            <div className="flex items-center justify-between">
              {/* Prompt Customization */}
              <Dialog open={isPromptDialogOpen} onOpenChange={handlePromptDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="shadow-sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Customize Prompt
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Customize Analysis Prompt</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Modify the prompt used to analyze your page and generate UI preferences. This
                      allows you to guide the AI towards specific types of customizations.
                    </p>

                    {defaultPrompt && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Default Prompt (for reference)
                        </label>
                        <Textarea
                          value={defaultPrompt}
                          readOnly
                          className="min-h-[200px] font-mono text-xs bg-muted"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Your Custom Prompt</label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCustomPrompt('')}
                          className="h-6 text-xs"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Clear Custom
                        </Button>
                      </div>
                      <Textarea
                        value={customPrompt}
                        onChange={e => setCustomPrompt(e.target.value)}
                        placeholder="Enter your custom prompt here, or leave empty to use the default prompt shown above..."
                        className="min-h-[200px] font-mono text-sm"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsPromptDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => setIsPromptDialogOpen(false)}>Apply Changes</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Re-analyze button */}
              <Button
                variant="outline"
                onClick={analyzeCurrentPage}
                disabled={isAnalyzing}
                className="shadow-sm"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Re-analyzing...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Re-analyze Current Page
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        {elements.length === 0 ? (
          <div className="flex items-center justify-center min-h-[500px]">
            <div className="text-center space-y-6 max-w-lg">
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                  <Wand2 className="h-7 w-7 text-muted-foreground" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold">Ready to Analyze</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Click the button below to analyze your page and generate comprehensive
                    customization options including colors, layout, typography, and more.
                  </p>
                </div>
              </div>

              <Button
                variant="default"
                onClick={analyzeCurrentPage}
                className="shadow-sm px-6 py-2"
                disabled={isAnalyzing}
                size="lg"
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
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Organized preference sections */}
            <div className="space-y-6">
              {elements.map(element => (
                <Card key={element.id} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="space-y-4">
                      {/* Section Header */}
                      <div className="space-y-1 pb-3 border-b border-border/30">
                        <h3 className="text-base font-semibold text-foreground">
                          {element.description}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Customize the appearance and behavior of this section
                        </p>
                      </div>

                      {/* Compact Preferences Grid */}
                      <div className="space-y-4">
                        {element.availablePreferences.map(option =>
                          renderPreferenceControl(element, option)
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

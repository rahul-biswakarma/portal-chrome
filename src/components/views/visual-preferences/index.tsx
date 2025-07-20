import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Eye, Layout, Palette, Move, Zap } from 'lucide-react';
import { PreferenceToggle } from './components/preference-toggle';
import { PreferenceDropdown } from './components/preference-dropdown';
import { LayoutSelector } from './components/layout-selector';
import { domAnalysisService } from './services/dom-analysis.service';
import { cssGenerationService } from './services/css-generation.service';
import { cssApplicationService } from '../pilot-mode/services/css-application.service';
import type {
  DetectedElement,
  UserPreferences,
  PreferenceGroup,
  PreferenceValue,
  PreferenceOption,
  PreferenceCategory,
} from './types';
import { useAppContext } from '@/contexts';

export const VisualPreferencesView: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [elements, setElements] = useState<DetectedElement[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { addLog } = useAppContext();

  useEffect(() => {
    analyzeCurrentPage();
  }, []);

  const analyzeCurrentPage = async () => {
    setIsLoading(true);
    try {
      addLog('Analyzing page structure...', 'info');
      const analysis = await domAnalysisService.analyzeDOM();
      setElements(analysis.elements);

      const initialPreferences: UserPreferences = {};
      analysis.elements.forEach(element => {
        initialPreferences[element.id] = {};
        element.availablePreferences.forEach(pref => {
          initialPreferences[element.id][pref.id] = pref.currentValue;
        });
      });

      setPreferences(initialPreferences);
      addLog(`Found ${analysis.elements.length} customizable elements`, 'success');
    } catch (error) {
      console.error('Error analyzing page:', error);
      addLog('Failed to analyze page structure', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreference = (elementId: string, preferenceId: string, value: PreferenceValue) => {
    setPreferences(prev => ({
      ...prev,
      [elementId]: {
        ...prev[elementId],
        [preferenceId]: value,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const applyChanges = async () => {
    setIsLoading(true);
    try {
      addLog('Generating CSS from preferences...', 'info');
      const css = await cssGenerationService.generateCSS(preferences, elements);

      addLog('Applying CSS to page...', 'info');
      const result = await cssApplicationService.applyCSS(css);

      if (result.success) {
        await cssGenerationService.applyTextReplacements(preferences, elements);
        addLog('Visual preferences applied successfully!', 'success');
        setHasUnsavedChanges(false);
      } else {
        addLog(`Failed to apply preferences: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Error applying preferences:', error);
      addLog('Failed to apply visual preferences', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const resetPreferences = () => {
    const initialPreferences: UserPreferences = {};
    elements.forEach(element => {
      initialPreferences[element.id] = {};
      element.availablePreferences.forEach(pref => {
        initialPreferences[element.id][pref.id] = pref.currentValue;
      });
    });
    setPreferences(initialPreferences);
    setHasUnsavedChanges(false);
  };

  const groupElementsByCategory = (): PreferenceGroup[] => {
    const groups: { [key: string]: DetectedElement[] } = {};

    elements.forEach(element => {
      const primaryCategory = element.availablePreferences[0]?.category || 'other';
      if (!groups[primaryCategory]) {
        groups[primaryCategory] = [];
      }
      groups[primaryCategory].push(element);
    });

    return Object.entries(groups).map(([category, categoryElements]) => ({
      id: category,
      title: getCategoryTitle(category),
      elements: categoryElements,
      category: category as PreferenceCategory,
    }));
  };

  const getCategoryTitle = (category: string): string => {
    switch (category) {
      case 'visibility':
        return 'Visibility';
      case 'layout':
        return 'Layout';
      case 'styling':
        return 'Styling';
      case 'position':
        return 'Position';
      case 'behavior':
        return 'Behavior';
      default:
        return 'Other';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'visibility':
        return <Eye className="h-4 w-4" />;
      case 'layout':
        return <Layout className="h-4 w-4" />;
      case 'styling':
        return <Palette className="h-4 w-4" />;
      case 'position':
        return <Move className="h-4 w-4" />;
      case 'behavior':
        return <Zap className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const renderPreferenceControl = (element: DetectedElement, option: PreferenceOption) => {
    const currentValue = preferences[element.id]?.[option.id];

    switch (option.type) {
      case 'toggle':
        return (
          <PreferenceToggle
            key={option.id}
            option={option}
            value={currentValue as boolean}
            onChange={value => updatePreference(element.id, option.id, value)}
          />
        );
      case 'dropdown':
        return (
          <PreferenceDropdown
            key={option.id}
            option={option}
            value={String(currentValue)}
            onChange={value => updatePreference(element.id, option.id, value)}
          />
        );
      case 'layout-selector':
        return (
          <LayoutSelector
            key={option.id}
            option={option}
            value={String(currentValue)}
            onChange={value => updatePreference(element.id, option.id, value)}
          />
        );
      default:
        return null;
    }
  };

  if (isLoading && elements.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Analyzing page structure...</p>
        </div>
      </div>
    );
  }

  const preferenceGroups = groupElementsByCategory();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Visual Preferences</h2>
          <p className="text-muted-foreground">Customize UI elements with visual controls</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={resetPreferences} disabled={isLoading}>
            Reset
          </Button>
          <Button onClick={applyChanges} disabled={isLoading || !hasUnsavedChanges}>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Apply Changes
          </Button>
        </div>
      </div>

      {elements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No customizable elements found on this page.</p>
            <Button variant="outline" onClick={analyzeCurrentPage} className="mt-4">
              Re-analyze Page
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {preferenceGroups.map(group => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {getCategoryIcon(group.category)}
                  {group.title}
                  <Badge variant="secondary">{group.elements.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {group.elements.map((element, elementIndex) => (
                  <div key={element.id}>
                    {elementIndex > 0 && <Separator />}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{element.description}</h4>
                        <Badge variant="outline" className="text-xs">
                          {element.type}
                        </Badge>
                      </div>
                      <div className="grid gap-4">
                        {element.availablePreferences.map(option =>
                          renderPreferenceControl(element, option)
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

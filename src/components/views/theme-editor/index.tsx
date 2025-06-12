import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Download, RotateCcw, Upload } from 'lucide-react';
import { useThemeEditor } from './hooks/use-theme-editor';
import { ColorSettings } from './components/color-settings';
import { FontSettings } from './components/font-settings';
import { LayoutSettings } from './components/layout-settings';
import type { ThemeEditorProps } from './types';

export const ThemeEditorView: React.FC<ThemeEditorProps> = ({
  initialConfig,
  onConfigChange,
}) => {
  const {
    config,
    validation,
    isValid,
    hasWarnings,
    updateFonts,
    updateColors,
    updateLayout,
    resetConfig,
    exportConfig,
    importConfig,
    isModified,
    canReset,
  } = useThemeEditor(initialConfig, onConfigChange);

  const handleExport = () => {
    const configJson = exportConfig();
    const blob = new Blob([configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theme-config-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const success = importConfig(content);
          if (!success) {
            alert('Failed to import theme configuration. Please check the file format.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Theme Editor</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Customize colors, typography, and layout to create your perfect theme
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleImport}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            
            {canReset && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetConfig}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Validation Messages */}
      {(!isValid || hasWarnings) && (
        <div className="flex-shrink-0 px-6 py-4 space-y-2">
          {!isValid && validation.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">Configuration errors:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {validation.errors.map((error, index) => (
                      <li key={index} className="text-sm">{error}</li>
                    ))}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {hasWarnings && validation.warnings.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">Recommendations:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {validation.warnings.map((warning, index) => (
                      <li key={index} className="text-sm">{warning}</li>
                    ))}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-6 space-y-8">
          {/* Color Settings */}
          <div>
            <ColorSettings
              colors={config.colors}
              onColorsChange={updateColors}
            />
          </div>

          <Separator />

          {/* Font Settings */}
          <div>
            <FontSettings
              fonts={config.fonts}
              onFontsChange={updateFonts}
            />
          </div>

          <Separator />

          {/* Layout Settings */}
          <div>
            <LayoutSettings
              layout={config.layout}
              onLayoutChange={updateLayout}
            />
          </div>

          {/* Status Information */}
          <div className="mt-8 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Configuration Status</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {isValid ? 'Theme is valid and ready to use' : 'Theme has configuration issues'}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${isValid ? 'bg-green-500' : 'bg-red-500'}`} />
                  {isValid ? 'Valid' : 'Invalid'}
                </div>
                {isModified && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    Modified
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Export for backward compatibility
export { ThemeEditorView as ThemeEditor };
export default ThemeEditorView; 
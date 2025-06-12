import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { AdvancedSettingsProps } from '../types';

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  config,
  onChange,
  isProcessing
}) => {
  const updateAdvancedSetting = (key: keyof typeof config.advancedSettings, value: boolean) => {
    onChange({
      advancedSettings: {
        ...config.advancedSettings,
        [key]: value
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Max Iterations: {config.maxIterations}</Label>
          <Slider
            value={[config.maxIterations]}
            onValueChange={([value]) => onChange({ maxIterations: value })}
            min={1}
            max={10}
            step={1}
            className="mt-2"
            disabled={isProcessing}
          />
          <p className="text-xs text-gray-500 mt-1">
            Number of refinement cycles
          </p>
        </div>
        
        <div>
          <Label>Quality Threshold: {(config.evaluationThreshold * 100).toFixed(0)}%</Label>
          <Slider
            value={[config.evaluationThreshold * 100]}
            onValueChange={([value]) => onChange({ evaluationThreshold: value / 100 })}
            min={50}
            max={100}
            step={5}
            className="mt-2"
            disabled={isProcessing}
          />
          <p className="text-xs text-gray-500 mt-1">
            Minimum quality to complete
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <h4 className="font-medium text-sm">Advanced Options</h4>
        
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Generate Responsive CSS</Label>
            <p className="text-xs text-gray-500">
              Include mobile and tablet breakpoints
            </p>
          </div>
          <Switch
            checked={config.advancedSettings.generateResponsiveCSS}
            onCheckedChange={(checked) => updateAdvancedSetting('generateResponsiveCSS', checked)}
            disabled={isProcessing}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Use !important Declarations</Label>
            <p className="text-xs text-gray-500">
              Override existing styles with !important
            </p>
          </div>
          <Switch
            checked={config.advancedSettings.useImportantDeclarations}
            onCheckedChange={(checked) => updateAdvancedSetting('useImportantDeclarations', checked)}
            disabled={isProcessing}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Optimize for Performance</Label>
            <p className="text-xs text-gray-500">
              Use efficient selectors and minimal CSS
            </p>
          </div>
          <Switch
            checked={config.advancedSettings.optimizeForPerformance}
            onCheckedChange={(checked) => updateAdvancedSetting('optimizeForPerformance', checked)}
            disabled={isProcessing}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Preserve Existing Styles</Label>
            <p className="text-xs text-gray-500">
              Maintain current styling where possible
            </p>
          </div>
          <Switch
            checked={config.advancedSettings.preserveExistingStyles}
            onCheckedChange={(checked) => updateAdvancedSetting('preserveExistingStyles', checked)}
            disabled={isProcessing}
          />
        </div>
      </div>
    </div>
  );
}; 
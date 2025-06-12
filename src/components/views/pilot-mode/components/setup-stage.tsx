import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Play } from 'lucide-react';
import { ReferenceImageManager } from './reference-image-manager';
import { AdvancedSettings } from './advanced-settings';
import type { SetupStageProps } from '../types';

export const SetupStage: React.FC<SetupStageProps> = ({
  config,
  onConfigUpdate,
  onStart,
  isProcessing,
  onAddImage,
  onRemoveImage
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    setError(null);
    
    // Validation
    if (config.referenceImages.length === 0) {
      setError('Please add at least one reference image');
      return;
    }
    
    if (!config.designDescription.trim()) {
      setError('Please provide a design description');
      return;
    }
    
    onStart();
  };

  const isValid = config.referenceImages.length > 0 && config.designDescription.trim().length > 0;

  return (
    <div className="space-y-6">
      <ReferenceImageManager
        images={config.referenceImages}
        onAdd={onAddImage}
        onRemove={onRemoveImage}
        maxImages={5}
        isProcessing={isProcessing}
      />

      <Card>
        <CardHeader>
          <CardTitle>Design Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="description">
              Design Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Describe the design you want to achieve... (e.g., 'Modern dark theme with blue accents', 'Clean minimal design with rounded corners')"
              value={config.designDescription}
              onChange={(e) => onConfigUpdate({ designDescription: e.target.value })}
              className="mt-1"
              disabled={isProcessing}
              rows={3}
            />
            <p className="text-xs text-gray-500 mt-1">
              Be specific about colors, layout, style preferences, etc.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Show Advanced Settings</Label>
              <p className="text-xs text-gray-500">
                Configure iterations, quality threshold, and CSS options
              </p>
            </div>
            <Switch
              checked={showAdvanced}
              onCheckedChange={setShowAdvanced}
              disabled={isProcessing}
            />
          </div>

          {showAdvanced && (
            <div className="border-t pt-4">
              <AdvancedSettings
                config={config}
                onChange={onConfigUpdate}
                isProcessing={isProcessing}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <h4 className="font-medium mb-2">How it works:</h4>
              <ol className="list-decimal list-inside space-y-1">
                <li>Upload reference images showing your desired design</li>
                <li>Describe the design goals and preferences</li>
                <li>AI analyzes your page and generates CSS to match the references</li>
                <li>Iterative refinement until the design matches your vision</li>
              </ol>
            </div>
            
            <Button
              onClick={handleStart}
              disabled={isProcessing || !isValid}
              className="w-full"
              size="lg"
            >
              <Play className="w-5 h-5 mr-2" />
              {isProcessing ? 'Processing...' : 'Start Pilot Mode'}
            </Button>
            
            {!isValid && (
              <p className="text-xs text-gray-500 text-center">
                Add reference images and provide a design description to continue
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 
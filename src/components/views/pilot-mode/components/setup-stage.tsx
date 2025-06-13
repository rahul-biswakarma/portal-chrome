import React, { useState } from 'react';
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
  onRemoveImage,
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
    <div className="flex flex-col items-center justify-center w-full h-full p-6">
      <div className="w-full max-w-xl bg-[color:var(--card)] border border-[color:var(--border)] rounded-xl shadow-md p-6 space-y-8">
        <ReferenceImageManager
          images={config.referenceImages}
          onAdd={onAddImage}
          onRemove={onRemoveImage}
          maxImages={5}
          isProcessing={isProcessing}
        />

        <div className="space-y-4">
          <div>
            <div className="font-semibold text-lg text-[color:var(--foreground)] mb-2">
              Design Configuration
            </div>
            <Label htmlFor="description">
              Design Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Describe the design you want to achieve... (e.g., 'Modern dark theme with blue accents', 'Clean minimal design with rounded corners')"
              value={config.designDescription}
              onChange={e => onConfigUpdate({ designDescription: e.target.value })}
              className="mt-1 bg-[color:var(--muted)] border-[color:var(--border)] text-[color:var(--foreground)]"
              disabled={isProcessing}
              rows={3}
            />
            <p className="text-xs text-[color:var(--muted-foreground)] mt-1">
              Be specific about colors, layout, style preferences, etc.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-[color:var(--foreground)]">Show Advanced Settings</Label>
              <p className="text-xs text-[color:var(--muted-foreground)]">
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
            <div className="border-t pt-4 border-[color:var(--border)]">
              <AdvancedSettings
                config={config}
                onChange={onConfigUpdate}
                isProcessing={isProcessing}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="w-full bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="text-sm text-[color:var(--muted-foreground)]">
            <h4 className="font-medium mb-2 text-[color:var(--foreground)]">How it works:</h4>
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
            className="w-full text-base py-3"
            size="lg"
          >
            <Play className="w-5 h-5 mr-2" />
            {isProcessing ? 'Processing...' : 'Start Pilot Mode'}
          </Button>
          {!isValid && (
            <p className="text-xs text-[color:var(--muted-foreground)] text-center">
              Add reference images and provide a design description to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

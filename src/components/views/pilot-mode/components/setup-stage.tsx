import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Upload, Sparkles, Image, RotateCcw } from 'lucide-react';
import type { SetupStageProps } from '../types';

export const SetupStage: React.FC<SetupStageProps> = ({
  config,
  onConfigUpdate,
  onStart,
  isProcessing,
  onAddImage,
  onRemoveImage,
}) => {
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    setError(null);
    if (config.referenceImages.length === 0) {
      setError('Please add at least one reference image');
      return;
    }
    onStart();
  };

  const handleIterationsChange = (value: number[]) => {
    onConfigUpdate({ maxIterations: value[0] });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      if (config.referenceImages.length < 5) {
        try {
          await onAddImage(file);
        } catch (error) {
          console.error('Failed to add image:', error);
        }
      }
    }
    event.target.value = '';
  };

  const getIterationsDescription = (iterations: number) => {
    switch (iterations) {
      case 1:
        return 'Quick single attempt';
      case 2:
        return 'Basic refinement';
      case 3:
        return 'Balanced quality';
      case 4:
        return 'High quality';
      case 5:
        return 'Maximum refinement';
      default:
        return 'Balanced quality';
    }
  };

  const isValid = config.referenceImages.length > 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-muted/50 rounded-2xl mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-light text-foreground">Transform Your Portal</h1>
          <p className="text-muted-foreground text-sm">
            Upload a design you love, and AI will adapt it to your portal
          </p>
        </div>

        {/* Image Upload */}
        <div className="space-y-4">
          {config.referenceImages.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {config.referenceImages.map(image => (
                <div
                  key={image.id}
                  className="relative group aspect-square rounded-xl overflow-hidden bg-muted border border-border"
                >
                  <img src={image.url} alt={image.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => onRemoveImage(image.id)}
                    className="absolute top-2 right-2 w-6 h-6 bg-destructive/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={isProcessing}
                  >
                    <span className="text-destructive-foreground text-xs">×</span>
                  </button>
                </div>
              ))}
              {config.referenceImages.length < 5 && (
                <label className="aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center cursor-pointer bg-muted/20 hover:bg-muted/30 transition-colors group">
                  <Upload className="w-6 h-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors mt-1">
                    Add More
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    disabled={isProcessing}
                  />
                </label>
              )}
            </div>
          ) : (
            <label className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer bg-muted/20 hover:bg-muted/30 transition-colors group">
              <Image className="w-10 h-10 text-muted-foreground group-hover:text-foreground transition-colors mb-3" />
              <span className="text-foreground font-medium mb-1">Upload Reference Image</span>
              <span className="text-muted-foreground text-sm text-center">
                Drop an image here or click to browse
              </span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                disabled={isProcessing}
              />
            </label>
          )}
        </div>

        {/* Optional Description */}
        {config.referenceImages.length > 0 && (
          <div className="space-y-2">
            <Textarea
              placeholder="Optional: Describe specific aspects to focus on..."
              value={config.designDescription}
              onChange={e => onConfigUpdate({ designDescription: e.target.value })}
              className="bg-background border-border text-foreground placeholder:text-muted-foreground rounded-xl resize-none"
              disabled={isProcessing}
              rows={2}
            />
          </div>
        )}

        {/* Iterations Control */}
        {config.referenceImages.length > 0 && (
          <div className="space-y-4 bg-muted/20 rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-primary" />
              <Label className="text-sm font-medium text-foreground">Refinement Iterations</Label>
            </div>
            <div className="space-y-3">
              <Slider
                value={[config.maxIterations]}
                onValueChange={handleIterationsChange}
                max={5}
                min={1}
                step={1}
                disabled={isProcessing}
                className="w-full"
              />
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {config.maxIterations} iteration{config.maxIterations > 1 ? 's' : ''}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getIterationsDescription(config.maxIterations)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="space-y-3">
          <Button
            onClick={handleStart}
            disabled={isProcessing || !isValid}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            {isProcessing ? 'Generating Style...' : 'Transform My Portal'}
          </Button>

          {error && <p className="text-destructive text-sm text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
};

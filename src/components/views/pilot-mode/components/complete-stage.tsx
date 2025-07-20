import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, RotateCcw, Sparkles } from 'lucide-react';
import type { CompleteStageProps } from '../types';

export const CompleteStage: React.FC<CompleteStageProps> = ({
  result,
  onRestart,
  isProcessing,
}) => {
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Success Animation */}
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-2xl animate-pulse">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-light text-foreground">✨ Transformation Complete!</h1>
            <p className="text-muted-foreground">Your portal has been beautifully transformed</p>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-muted/20 rounded-xl p-6 border border-border">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-light text-foreground">
                {formatDuration(result.processingTime)}
              </div>
              <div className="text-muted-foreground text-sm">Processing Time</div>
            </div>
            <div>
              <div className="text-2xl font-light text-foreground">
                {result.finalQualityScore
                  ? `${Math.round(result.finalQualityScore * 100)}%`
                  : `${result.iterationsUsed}`}
              </div>
              <div className="text-muted-foreground text-sm">
                {result.finalQualityScore ? 'Quality Match' : 'Iterations Used'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={onRestart}
            variant="outline"
            className="w-full h-10"
            disabled={isProcessing}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Try Another Style
          </Button>
        </div>

        {/* Celebration Message */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-500" />
            <span className="text-muted-foreground text-sm">
              Your CSS is also available in the CSS Editor tab
            </span>
            <Sparkles className="w-4 h-4 text-yellow-500" />
          </div>
        </div>
      </div>
    </div>
  );
};

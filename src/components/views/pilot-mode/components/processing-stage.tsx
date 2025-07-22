import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles, Square } from 'lucide-react';
import React from 'react';
import type { ProcessingStageProps } from '../types';

export const ProcessingStage: React.FC<ProcessingStageProps> = ({
  progress,
  onStop,
  isProcessing,
  logs,
}) => {
  const getStageMessage = () => {
    const stage = progress.stage;
    switch (stage) {
      case 'collecting-data':
        return 'Analyzing your portal...';
      case 'taking-screenshot':
        return 'Capturing page snapshot...';
      case 'generating-css':
        return 'Generating beautiful styles...';
      case 'applying-css':
        return 'Applying transformation...';
      case 'complete':
        return 'Transformation complete!';
      default:
        return 'Preparing magic...';
    }
  };

  const isComplete = progress.stage === 'complete';

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-muted/50 rounded-2xl">
            {isComplete ? (
              <Sparkles className="w-8 h-8 text-primary" />
            ) : (
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            )}
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-light text-foreground">
              {isComplete ? 'All Done!' : 'Transforming Portal'}
            </h1>
            <p className="text-muted-foreground text-sm">{getStageMessage()}</p>
          </div>
        </div>

        {/* Progress */}
        {!isComplete && (
          <div className="space-y-3">
            <Progress
              value={progress.progress}
              className="h-2 bg-muted rounded-full overflow-hidden"
            />
            <p className="text-center text-muted-foreground text-sm">
              {Math.round(progress.progress)}% complete
            </p>
          </div>
        )}

        {/* Recent logs (simplified) */}
        <div className="bg-muted/20 rounded-xl p-4 border border-border">
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {logs.slice(-3).map((log, index) => (
              <div key={index} className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    log.level === 'success'
                      ? 'bg-green-500'
                      : log.level === 'error'
                        ? 'bg-destructive'
                        : log.level === 'warning'
                          ? 'bg-yellow-500'
                          : 'bg-primary'
                  }`}
                />
                <span className="text-foreground text-sm">{log.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stop button */}
        {!isComplete && (
          <Button
            onClick={onStop}
            disabled={!isProcessing}
            variant="outline"
            className="w-full h-10"
          >
            <Square className="w-4 h-4 mr-2" />
            Stop Processing
          </Button>
        )}
      </div>
    </div>
  );
};

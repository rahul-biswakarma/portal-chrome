import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Square, Clock } from 'lucide-react';
import { ProcessingLog } from './processing-log';
import { formatDuration } from '../utils';
import type { ProcessingStageProps } from '../types';

export const ProcessingStage: React.FC<ProcessingStageProps> = ({
  progress,
  config,
  onStop,
  isProcessing,
  logs
}) => {
  const getStageDescription = (stage: string) => {
    switch (stage) {
      case 'collecting-data':
        return 'Analyzing page structure and portal elements...';
      case 'taking-screenshot':
        return 'Capturing page screenshot for AI analysis...';
      case 'generating-css':
        return `Generating CSS design (iteration ${progress.iteration})...`;
      case 'applying-css':
        return 'Applying generated CSS to the page...';
      case 'evaluating':
        return 'Evaluating design match against reference images...';
      case 'complete':
        return 'Processing complete!';
      default:
        return 'Preparing for processing...';
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'complete':
        return 'bg-green-500';
      case 'generating-css':
      case 'evaluating':
        return 'bg-blue-500';
      case 'applying-css':
        return 'bg-purple-500';
      case 'collecting-data':
      case 'taking-screenshot':
        return 'bg-orange-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Processing Progress</span>
            <Badge variant="secondary" className="text-xs">
              {progress.stage}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span>Iteration {progress.iteration} of {progress.totalIterations}</span>
            <span className="text-gray-500">
              {Math.round(progress.progress)}% complete
            </span>
          </div>
          
          <div className="relative">
            <Progress value={progress.progress} className="h-3" />
            <div 
              className={`absolute left-0 top-0 h-3 rounded-full transition-all duration-300 ${getStageColor(progress.stage)}`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium">{progress.message}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {getStageDescription(progress.stage)}
            </p>
          </div>

          {progress.estimatedTimeRemaining && progress.estimatedTimeRemaining > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>
                Estimated time remaining: {formatDuration(progress.estimatedTimeRemaining)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Current Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Reference Images:</span>
              <span className="ml-2 font-medium">{config.referenceImages.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Max Iterations:</span>
              <span className="ml-2 font-medium">{config.maxIterations}</span>
            </div>
            <div>
              <span className="text-gray-500">Quality Threshold:</span>
              <span className="ml-2 font-medium">
                {(config.evaluationThreshold * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-gray-500">Responsive CSS:</span>
              <span className="ml-2 font-medium">
                {config.advancedSettings.generateResponsiveCSS ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
          
          {config.designDescription && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-gray-500 mb-1">Design Goal:</p>
              <p className="text-sm italic">"{config.designDescription}"</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ProcessingLog 
        logs={logs}
        maxEntries={15}
        showTimestamps={true}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Processing is running automatically. You can stop it at any time.
              </p>
              
              <Button
                onClick={onStop}
                variant="destructive"
                className="w-full"
                disabled={!isProcessing}
              >
                <Square className="w-5 h-5 mr-2" />
                Stop Processing
              </Button>
            </div>
            
            <div className="text-xs text-gray-500 text-center space-y-1">
              <p>
                • Fresh screenshots are taken after each CSS application
              </p>
              <p>
                • Each evaluation uses a clean AI session (no chat history)
              </p>
              <p>
                • Processing will stop automatically when quality threshold is reached
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 
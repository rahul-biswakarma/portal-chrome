import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, RotateCcw, Download, Sparkles } from 'lucide-react';
import { formatDuration } from '../utils';
import type { CompleteStageProps } from '../types';

export const CompleteStage: React.FC<CompleteStageProps> = ({
  result,
  onRestart,
  onDownloadCSS,
  isProcessing
}) => {
  const getResultColor = (success: boolean) => {
    return success ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400';
  };

  const getResultIcon = (success: boolean) => {
    return success ? CheckCircle : Sparkles;
  };

  const ResultIcon = getResultIcon(result.success);

  return (
    <div className="space-y-6">
      <Card className={`border-2 ${result.success ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-3 ${getResultColor(result.success)}`}>
            <ResultIcon className="w-6 h-6" />
            {result.success ? 'Design Complete!' : 'Process Finished'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Final Quality Score</p>
              <div className="flex items-center gap-2">
                <Badge 
                  variant={result.success ? 'default' : 'secondary'}
                  className="text-sm"
                >
                  {(result.finalQualityScore * 100).toFixed(1)}%
                </Badge>
                {result.success && (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    ✓ Target reached
                  </span>
                )}
              </div>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Iterations Used</p>
              <p className="font-medium">{result.iterationsUsed}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Processing Time</p>
              <p className="font-medium">{formatDuration(result.processingTime)}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">CSS Lines Generated</p>
              <p className="font-medium">{result.generatedCSS.split('\n').length}</p>
            </div>
          </div>

          {result.finalMessage && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
              <p className="text-sm font-medium mb-1">AI Assessment:</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                "{result.finalMessage}"
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Generated CSS Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-60 overflow-y-auto">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {result.generatedCSS.slice(0, 500)}
              {result.generatedCSS.length > 500 && (
                <span className="text-gray-500">
                  ... ({result.generatedCSS.length - 500} more characters)
                </span>
              )}
            </pre>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button
          onClick={onDownloadCSS}
          variant="outline"
          className="w-full"
          disabled={isProcessing}
        >
          <Download className="w-5 h-5 mr-2" />
          Download CSS
        </Button>
        
        <Button
          onClick={onRestart}
          className="w-full"
          disabled={isProcessing}
        >
          <RotateCcw className="w-5 h-5 mr-2" />
          Start New Session
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">
              What happened:
            </h4>
            <ul className="space-y-2 list-disc list-inside">
              <li>
                Analyzed your page structure and extracted {result.elementsAnalyzed || 'multiple'} portal elements
              </li>
              <li>
                Generated CSS through {result.iterationsUsed} iteration{result.iterationsUsed > 1 ? 's' : ''} of AI refinement
              </li>
              <li>
                Each iteration included fresh screenshots and complete context evaluation
              </li>
              <li>
                {result.success 
                  ? `Achieved target quality score of ${(result.finalQualityScore * 100).toFixed(1)}%`
                  : `Reached maximum iterations with ${(result.finalQualityScore * 100).toFixed(1)}% quality`
                }
              </li>
              <li>
                CSS has been applied to your page and is ready for use
              </li>
            </ul>
            
            {!result.success && (
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                  <strong>Tip:</strong> Try adjusting your design description to be more specific, 
                  or increase the maximum iterations for better results.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 
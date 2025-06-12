import React from 'react';
import { usePilotMode } from './hooks/use-pilot-mode';
import { SetupStage, ProcessingStage, CompleteStage } from './components';
import type { ProcessingResult } from './types';

export const PilotModeView: React.FC = () => {
  const {
    pilotStage,
    config,
    progress,
    pageData,
    processingContext,
    logs,
    isProcessing,
    error,
    updateConfig,
    startProcessing,
    stopProcessing,
    resetSession,
    addReferenceImage,
    removeReferenceImage,
  } = usePilotMode();

  const handleDownloadCSS = () => {
    if (processingContext?.previousCSS) {
      const blob = new Blob([processingContext.previousCSS], { type: 'text/css' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pilot-mode-generated-${Date.now()}.css`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Create processing result for complete stage
  const createProcessingResult = (): ProcessingResult => {
    const lastEvaluation = processingContext?.feedbackHistory[processingContext.feedbackHistory.length - 1];
    const processingTime = processingContext ? Date.now() - processingContext.startTime : 0;
    
    return {
      success: lastEvaluation?.isDone || false,
      finalQualityScore: lastEvaluation?.qualityScore || 0,
      iterationsUsed: processingContext?.iteration || 0,
      processingTime,
      generatedCSS: processingContext?.previousCSS || '',
      finalMessage: lastEvaluation?.feedback,
      elementsAnalyzed: pageData?.portalElements.length
    };
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-lg font-semibold">
            Error: {error.message}
          </div>
          {error.suggestions && error.suggestions.length > 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium mb-2">Suggestions:</p>
              <ul className="list-disc list-inside space-y-1">
                {error.suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}
          {error.recoverable && (
            <button
              onClick={resetSession}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Start Over
            </button>
          )}
        </div>
      </div>
    );
  }

  switch (pilotStage) {
    case 'setup':
      return (
        <SetupStage
          config={config}
          onConfigUpdate={updateConfig}
          onStart={startProcessing}
          isProcessing={isProcessing}
          onAddImage={addReferenceImage}
          onRemoveImage={removeReferenceImage}
        />
      );

    case 'processing':
      return (
        <ProcessingStage
          progress={progress}
          config={config}
          onStop={stopProcessing}
          isProcessing={isProcessing}
          logs={logs}
        />
      );

    case 'complete':
      return (
        <CompleteStage
          result={createProcessingResult()}
          onRestart={resetSession}
          onDownloadCSS={handleDownloadCSS}
          isProcessing={isProcessing}
        />
      );

    default:
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-lg font-semibold">Initializing Pilot Mode...</p>
          </div>
        </div>
      );
  }
}; 
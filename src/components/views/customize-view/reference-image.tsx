import { PromptInput } from './prompt-input';

export const ReferenceImage = () => {
  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-medium mb-2">Reference Image</h3>
      <p className="text-sm text-gray-600 mb-3">
        Upload a reference image to generate CSS that makes the current page look similar
      </p>

      {/* Using the consolidated PromptInput component */}
      <PromptInput />
    </div>
  );
};

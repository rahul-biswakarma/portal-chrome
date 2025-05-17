import { PromptInput } from './prompt-input';
import { CssEditor } from './css-editor';
import { Settings } from './settings';

export const CustomizeView = () => {
  return (
    <div className="pb-4 h-full flex flex-col gap-2">
      <PromptInput />
      <CssEditor />
      <Settings />
    </div>
  );
};

import { createContext, useState, useRef, useCallback } from 'react';
import type {
  ChangeEvent,
  ReactNode,
  Dispatch,
  SetStateAction,
  RefObject,
} from 'react';
import { convertFileToBase64 } from '../lib/image-utils';

export type GenerationStage = 'idle' | 'generating' | 'success' | 'error';

interface AppContextType {
  // Image Upload State
  selectedImage: string | null;
  setSelectedImage: Dispatch<SetStateAction<string | null>>;
  imageFile: File | null;
  setImageFile: Dispatch<SetStateAction<File | null>>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleImageChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRemoveImage: () => void;
  triggerFileUpload: () => void;

  // API Key State
  apiKey: string | null;
  setApiKey: Dispatch<SetStateAction<string | null>>;

  // CSS Content State
  cssContent: string;
  setCssContent: Dispatch<SetStateAction<string>>;

  // Generation Stage State
  generationStage: GenerationStage;
  setGenerationStage: Dispatch<SetStateAction<GenerationStage>>;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  // Image Upload State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // API Key State
  const [apiKey, setApiKey] = useState<string | null>(null);

  // CSS Content State
  const [cssContent, setCssContent] = useState<string>('');

  // Generation Stage State
  const [generationStage, setGenerationStage] =
    useState<GenerationStage>('idle');

  const handleImageChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        try {
          const base64 = await convertFileToBase64(file);
          setSelectedImage(base64);
          setImageFile(file);
        } catch (error) {
          console.error('Error converting file to base64:', error);
          setSelectedImage(null);
          setImageFile(null);
        }
      }
    },
    [],
  );

  const handleRemoveImage = useCallback(() => {
    setSelectedImage(null);
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const triggerFileUpload = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        selectedImage,
        setSelectedImage,
        imageFile,
        setImageFile,
        fileInputRef,
        handleImageChange,
        handleRemoveImage,
        triggerFileUpload,
        apiKey,
        setApiKey,
        cssContent,
        setCssContent,
        generationStage,
        setGenerationStage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

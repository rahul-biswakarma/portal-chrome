import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction, RefObject } from 'react';
import { convertFileToBase64 } from '../lib/image-utils';
import { getEnvVariable } from '@/utils/environment';
import { initializeCssFromDevRev } from '@/services/devrev-api';

export type GenerationStage = 'idle' | 'generating' | 'success' | 'error';
export type DevRevCssStage = 'idle' | 'loading' | 'loaded' | 'error';

export interface AppContextType {
  // Image Upload State
  selectedImage: string | null;
  setSelectedImage: (image: string | null) => void;
  imageFile: File | null;
  setImageFile: Dispatch<SetStateAction<File | null>>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleImageChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRemoveImage: () => void;
  triggerFileUpload: () => void;

  // API Key State
  geminiKey: string | null;
  setGeminiKey: Dispatch<SetStateAction<string | null>>;

  // CSS Content State
  cssContent: string | null;
  setCssContent: (css: string | null) => void;

  // Generation Stage State
  generationStage: 'idle' | 'generating' | 'complete' | 'error';
  setGenerationStage: (stage: 'idle' | 'generating' | 'complete' | 'error') => void;

  // DevRev CSS Stage
  devRevCssStage: 'idle' | 'loading' | 'loaded' | 'error';
  setDevRevCssStage: (stage: 'idle' | 'loading' | 'loaded' | 'error') => void;

  // DevRev CSS Fetch Function
  fetchCssFromDevRev: () => Promise<string | null>;

  // Add Log Function
  addLog: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  // Image Upload State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // API Key State
  const [geminiKey, setGeminiKey] = useState<string | null>(null);

  // CSS Content State
  const [cssContent, setCssContent] = useState<string | null>(null);

  // DevRev CSS State
  const [devRevCssStage, setDevRevCssStage] = useState<DevRevCssStage>('idle');

  // Generation Stage State
  const [generationStage, setGenerationStage] = useState<
    'idle' | 'generating' | 'complete' | 'error'
  >('idle');

  // Function to fetch CSS from DevRev
  const fetchCssFromDevRev = async (): Promise<string | null> => {
    try {
      // Check if DevRev credentials exist
      const pat = await getEnvVariable('DEVREV_PAT');
      const donId = await getEnvVariable('DEVREV_ORG_DON_ID');

      if (!pat || !donId) {
        throw new Error(
          'DevRev credentials missing. Please set DevRev PAT and Org DON ID in Settings.'
        );
      }

      // Start loading
      setDevRevCssStage('loading');

      // Get CSS from DevRev
      const css = await initializeCssFromDevRev();

      if (css) {
        setDevRevCssStage('loaded');
        return css;
      } else {
        setDevRevCssStage('idle');
        throw new Error(
          'No CSS found in DevRev portal preferences. Upload CSS first using "Apply CSS in Portal" in Settings.'
        );
      }
    } catch (error) {
      console.error('Error fetching CSS from DevRev:', error);
      setDevRevCssStage('error');
      throw error;
    }
  };

  const handleImageChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
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
  }, []);

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

  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

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
        geminiKey,
        setGeminiKey,
        cssContent,
        setCssContent,
        generationStage,
        setGenerationStage,
        devRevCssStage,
        setDevRevCssStage,
        fetchCssFromDevRev,
        addLog,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

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
      console.log('🔍 [APP-CONTEXT] Starting fetchCssFromDevRev...');

      // Check if DevRev credentials exist
      console.log('🔍 [APP-CONTEXT] Checking DevRev credentials...');
      const pat = await getEnvVariable('DEVREV_PAT');
      const donId = await getEnvVariable('DEVREV_ORG_DON_ID');

      console.log('🔍 [APP-CONTEXT] DevRev credentials status:', {
        hasPat: !!pat,
        hasDonId: !!donId,
        patLength: pat?.length || 0,
        donIdLength: donId?.length || 0,
        patPreview: pat ? pat.substring(0, 10) + '...' : 'null',
        donIdPreview: donId ? donId.substring(0, 20) + '...' : 'null',
      });

      if (!pat || !donId) {
        const error = new Error(
          'DevRev credentials missing. Please set DevRev PAT and Org DON ID in Settings.'
        );
        console.error('❌ [APP-CONTEXT] Missing credentials:', error.message);
        throw error;
      }

      // Start loading
      console.log('🔍 [APP-CONTEXT] Setting devRevCssStage to loading...');
      setDevRevCssStage('loading');

      // Get CSS from DevRev
      console.log('🔍 [APP-CONTEXT] Calling initializeCssFromDevRev...');
      const css = await initializeCssFromDevRev();

      console.log('🔍 [APP-CONTEXT] initializeCssFromDevRev result:', {
        success: !!css,
        cssLength: css?.length || 0,
        cssPreview: css ? css.substring(0, 200) + '...' : 'null',
        timestamp: new Date().toISOString(),
      });

      if (css) {
        console.log('✅ [APP-CONTEXT] CSS fetched successfully, setting stage to loaded');
        setDevRevCssStage('loaded');
        return css;
      } else {
        console.log('⚠️ [APP-CONTEXT] No CSS returned, setting stage to idle');
        setDevRevCssStage('idle');
        const error = new Error(
          'No CSS found in DevRev portal preferences. Upload CSS first using "Apply CSS in Portal" in Settings.'
        );
        console.error('❌ [APP-CONTEXT] No CSS found:', error.message);
        throw error;
      }
    } catch (error) {
      console.error('❌ [APP-CONTEXT] Error fetching CSS from DevRev:', error);
      console.log('🔍 [APP-CONTEXT] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.constructor.name : typeof error,
        timestamp: new Date().toISOString(),
      });
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

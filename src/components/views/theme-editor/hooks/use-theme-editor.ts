import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppContext } from '@/contexts';
import type { 
  ThemeConfig, 
  FontConfig, 
  ColorConfig, 
  LayoutConfig,
  ThemeChangeEvent,
  ThemeEventHandler,
  ConfigValidation
} from '../types';
import { themeService } from '../services/theme.service';
import { debounce, mergeThemeConfig } from '../utils';

export interface UseThemeEditorReturn {
  // Configuration state
  config: ThemeConfig;
  
  // Validation
  validation: ConfigValidation;
  isValid: boolean;
  hasWarnings: boolean;
  
  // Update methods
  updateFonts: (fonts: Partial<FontConfig>) => void;
  updateColors: (colors: Partial<ColorConfig>) => void;
  updateLayout: (layout: Partial<LayoutConfig>) => void;
  updateConfig: (config: Partial<ThemeConfig>) => void;
  resetConfig: () => void;
  
  // CSS generation
  currentCSS: string;
  regenerateCSS: () => void;
  
  // Import/Export
  exportConfig: () => string;
  importConfig: (configJson: string) => boolean;
  
  // Event handling
  addEventListener: (handler: ThemeEventHandler) => void;
  removeEventListener: (handler: ThemeEventHandler) => void;
  
  // Utility
  isModified: boolean;
  canReset: boolean;
}

export const useThemeEditor = (
  initialConfig?: Partial<ThemeConfig>,
  onConfigChange?: (config: ThemeConfig) => void
): UseThemeEditorReturn => {
  const { setCssContent } = useAppContext();
  
  // Initialize configuration
  const defaultConfig = useMemo(() => themeService.getDefaultConfig(), []);
  const [config, setConfig] = useState<ThemeConfig>(() => 
    initialConfig ? mergeThemeConfig(defaultConfig, initialConfig) : defaultConfig
  );
  
  // Event handlers
  const [eventHandlers, setEventHandlers] = useState<Set<ThemeEventHandler>>(new Set());
  
  // Validation state
  const validation = useMemo(() => themeService.validateConfig(config), [config]);
  const isValid = validation.isValid;
  const hasWarnings = validation.warnings.length > 0;
  
  // CSS generation
  const currentCSS = useMemo(() => themeService.generateCSS(config), [config]);
  
  // Track modifications
  const isModified = useMemo(() => 
    JSON.stringify(config) !== JSON.stringify(defaultConfig), 
    [config, defaultConfig]
  );
  const canReset = isModified;
  
    // Debounced CSS application
  const debouncedSetCssContent = useMemo(
    () => debounce((css: string) => {
      setCssContent(css);
    }, 300),
    [setCssContent]
  );

  // Apply CSS changes
  useEffect(() => {
    if (isValid) {
      debouncedSetCssContent(currentCSS);
    }
  }, [currentCSS, isValid, debouncedSetCssContent]);
  
  // Notify external handlers
  useEffect(() => {
    if (onConfigChange) {
      onConfigChange(config);
    }
  }, [config, onConfigChange]);
  
  // Event emission helper
  const emitEvent = useCallback((type: ThemeChangeEvent['type']) => {
    const event: ThemeChangeEvent = {
      type,
      config,
      timestamp: Date.now(),
    };
    
    eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Theme event handler error:', error);
      }
    });
  }, [config, eventHandlers]);
  
  // Update methods
  const updateFonts = useCallback((fonts: Partial<FontConfig>) => {
    setConfig(prevConfig => ({
      ...prevConfig,
      fonts: { ...prevConfig.fonts, ...fonts }
    }));
    emitEvent('font');
  }, [emitEvent]);
  
  const updateColors = useCallback((colors: Partial<ColorConfig>) => {
    setConfig(prevConfig => ({
      ...prevConfig,
      colors: { ...prevConfig.colors, ...colors }
    }));
    emitEvent('color');
  }, [emitEvent]);
  
  const updateLayout = useCallback((layout: Partial<LayoutConfig>) => {
    setConfig(prevConfig => ({
      ...prevConfig,
      layout: { ...prevConfig.layout, ...layout }
    }));
    emitEvent('layout');
  }, [emitEvent]);
  
  const updateConfig = useCallback((updates: Partial<ThemeConfig>) => {
    setConfig(prevConfig => {
      const newConfig = mergeThemeConfig(prevConfig, updates);
      return newConfig;
    });
    emitEvent('complete');
  }, [emitEvent]);
  
  const resetConfig = useCallback(() => {
    setConfig(defaultConfig);
    emitEvent('complete');
  }, [defaultConfig, emitEvent]);
  
  // CSS regeneration
  const regenerateCSS = useCallback(() => {
    // Force re-generation by updating the config timestamp
    const newCSS = themeService.generateCSS(config);
    setCssContent(newCSS);
  }, [config, setCssContent]);
  
  // Import/Export
  const exportConfig = useCallback(() => {
    return themeService.exportConfig(config);
  }, [config]);
  
  const importConfig = useCallback((configJson: string): boolean => {
    const importedConfig = themeService.importConfig(configJson);
    if (importedConfig) {
      setConfig(importedConfig);
      emitEvent('complete');
      return true;
    }
    return false;
  }, [emitEvent]);
  
  // Event management
  const addEventListener = useCallback((handler: ThemeEventHandler) => {
    setEventHandlers(prev => new Set([...prev, handler]));
  }, []);
  
  const removeEventListener = useCallback((handler: ThemeEventHandler) => {
    setEventHandlers(prev => {
      const newSet = new Set(prev);
      newSet.delete(handler);
      return newSet;
    });
  }, []);
  
  return {
    // Configuration state
    config,
    
    // Validation
    validation,
    isValid,
    hasWarnings,
    
    // Update methods
    updateFonts,
    updateColors,
    updateLayout,
    updateConfig,
    resetConfig,
    
    // CSS generation
    currentCSS,
    regenerateCSS,
    
    // Import/Export
    exportConfig,
    importConfig,
    
    // Event handling
    addEventListener,
    removeEventListener,
    
    // Utility
    isModified,
    canReset,
  };
}; 
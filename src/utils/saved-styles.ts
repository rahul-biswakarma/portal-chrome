/**
 * Saved CSS styles utility
 */

export interface SavedStyle {
  id: string;
  name: string;
  css: string;
  createdAt: number;
  imageUrl?: string;
  description?: string;
}

// Get all saved styles
export const getSavedStyles = async (): Promise<SavedStyle[]> => {
  try {
    const result = await chrome.storage.local.get('savedStyles');
    return result.savedStyles || [];
  } catch (error) {
    console.error('Error getting saved styles:', error);
    return [];
  }
};

// Save a new style
export const saveStyle = async (
  name: string,
  css: string,
  imageUrl?: string,
  description?: string,
): Promise<SavedStyle> => {
  try {
    const styles = await getSavedStyles();

    const newStyle: SavedStyle = {
      id: crypto.randomUUID(),
      name,
      css,
      createdAt: Date.now(),
      imageUrl,
      description,
    };

    await chrome.storage.local.set({ savedStyles: [...styles, newStyle] });
    return newStyle;
  } catch (error) {
    console.error('Error saving style:', error);
    throw error;
  }
};

// Get a style by ID
export const getStyleById = async (
  id: string,
): Promise<SavedStyle | undefined> => {
  const styles = await getSavedStyles();
  return styles.find((style) => style.id === id);
};

// Update a style
export const updateStyle = async (
  id: string,
  updates: Partial<Omit<SavedStyle, 'id' | 'createdAt'>>,
): Promise<SavedStyle | null> => {
  try {
    const styles = await getSavedStyles();
    const styleIndex = styles.findIndex((style) => style.id === id);

    if (styleIndex === -1) {
      return null;
    }

    const updatedStyle = {
      ...styles[styleIndex],
      ...updates,
    };

    styles[styleIndex] = updatedStyle;
    await chrome.storage.local.set({ savedStyles: styles });

    return updatedStyle;
  } catch (error) {
    console.error('Error updating style:', error);
    throw error;
  }
};

// Delete a style
export const deleteStyle = async (id: string): Promise<boolean> => {
  try {
    const styles = await getSavedStyles();
    const newStyles = styles.filter((style) => style.id !== id);

    if (newStyles.length === styles.length) {
      return false; // Style not found
    }

    await chrome.storage.local.set({ savedStyles: newStyles });
    return true;
  } catch (error) {
    console.error('Error deleting style:', error);
    throw error;
  }
};

/**
 * Save CSS to storage for the CSS editor
 * @param siteName Site domain name for naming the saved style
 * @param css CSS content to save
 * @returns Name of the saved style
 */
export const saveCssToStorage = async (
  siteName: string,
  css: string,
): Promise<string> => {
  try {
    const timestamp = new Date().toLocaleString().replace(/[\/\s:,]/g, '-');
    const name = `${siteName}-${timestamp}`;

    // Save using the existing saveStyle function
    await saveStyle(name, css);

    // Also save as the last edited CSS for quick loading
    await chrome.storage.local.set({ lastEditedCSS: css });

    return name;
  } catch (error) {
    console.error('Error saving CSS to storage:', error);
    throw error;
  }
};

/**
 * Load CSS from storage for the CSS editor
 * Shows a prompt to select from saved styles or loads the last edited CSS
 * @returns Promise resolving to the loaded CSS or null if cancelled
 */
export const loadCssFromStorage = async (): Promise<string | null> => {
  try {
    // First, try to get all saved styles
    const styles = await getSavedStyles();

    if (styles.length === 0) {
      // If no saved styles, check for last edited CSS
      const result = await chrome.storage.local.get('lastEditedCSS');
      return result.lastEditedCSS || null;
    }

    // Sort styles by creation date (newest first)
    const sortedStyles = [...styles].sort((a, b) => b.createdAt - a.createdAt);

    // For now, just return the most recent style's CSS
    // In a future enhancement, this could display a modal for selection
    return sortedStyles[0].css;
  } catch (error) {
    console.error('Error loading CSS from storage:', error);
    throw error;
  }
};

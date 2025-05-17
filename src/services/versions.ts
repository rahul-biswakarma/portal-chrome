import { getFromStorage, saveToStorage } from '@/utils/storage';
import type { CSSVersion } from '../types';
import { getActiveTab, safeSendMessage } from '@/utils/chrome-utils';

const VERSIONS_STORAGE_KEY = 'css_versions';

/**
 * Get all saved CSS versions
 * @returns Promise resolving to an array of CSS versions
 */
export const getAllVersions = async (): Promise<CSSVersion[]> => {
  try {
    return await getFromStorage<CSSVersion[]>(VERSIONS_STORAGE_KEY, []);
  } catch (error) {
    console.error('Error getting CSS versions:', error);
    return [];
  }
};

/**
 * Save a new CSS version
 * @param css The CSS content
 * @param description A description of the version
 * @param prompt Optional prompt used to generate the CSS
 * @returns Promise resolving to the saved version
 */
export const saveCSSVersion = async (
  css: string,
  description: string = 'CSS Version',
  prompt?: string,
): Promise<CSSVersion> => {
  try {
    const versions = await getAllVersions();

    const newVersion: CSSVersion = {
      id: generateVersionId(),
      timestamp: Date.now(),
      description,
      css,
      prompt,
    };

    const updatedVersions = [newVersion, ...versions];
    await saveToStorage(VERSIONS_STORAGE_KEY, updatedVersions);

    return newVersion;
  } catch (error) {
    console.error('Error saving CSS version:', error);
    throw error;
  }
};

/**
 * Delete a CSS version
 * @param versionId The ID of the version to delete
 * @returns Promise resolving when the version is deleted
 */
export const deleteCSSVersion = async (versionId: string): Promise<void> => {
  try {
    const versions = await getAllVersions();
    const filteredVersions = versions.filter((v) => v.id !== versionId);

    if (versions.length === filteredVersions.length) {
      throw new Error(`Version with ID ${versionId} not found`);
    }

    await saveToStorage(VERSIONS_STORAGE_KEY, filteredVersions);
  } catch (error) {
    console.error('Error deleting CSS version:', error);
    throw error;
  }
};

/**
 * Apply a CSS version to the current tab
 * @param versionId The ID of the version to apply
 * @returns Promise resolving when the CSS is applied
 */
export const applyVersion = async (versionId: string): Promise<void> => {
  try {
    const versions = await getAllVersions();
    const version = versions.find((v) => v.id === versionId);

    if (!version) {
      throw new Error(`Version with ID ${versionId} not found`);
    }

    const tab = await getActiveTab();

    await safeSendMessage(tab.id!, {
      action: 'applyCSS',
      data: { css: version.css },
    });
  } catch (error) {
    console.error('Error applying CSS version:', error);
    throw error;
  }
};

/**
 * Generate a unique version ID
 * @returns A unique version ID
 */
const generateVersionId = (): string => {
  return 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

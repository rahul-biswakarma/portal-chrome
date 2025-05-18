import { getEnvVariable } from '@/utils/environment';

/**
 * Service for interacting with DevRev APIs
 */

interface DevRevConfig {
  baseUrl: string;
  pat: string;
  donId: string;
}

interface StylesheetInfo {
  preview_url: string;
  [key: string]: unknown;
}

interface PortalConfiguration {
  aat_keyring_id?: string;
  org_favicon?: { id: string } | string;
  [key: string]: unknown;
}

interface PreferencesGetResponse {
  type: string;
  object: string;
  preference: {
    stylesheet?: string | StylesheetInfo;
    configuration?: PortalConfiguration;
    [key: string]: unknown;
  };
}

interface ArtifactPrepareResponse {
  id: string;
  url: string;
  form_data: Array<{ key: string; value: string }>;
}

export const getDevRevConfig = async (): Promise<DevRevConfig> => {
  const pat = (await getEnvVariable('DEVREV_PAT')) || '';
  const donId = (await getEnvVariable('DEVREV_ORG_DON_ID')) || '';
  const baseUrl =
    (await getEnvVariable('DEVREV_API_URL')) || 'https://api.dev.devrev-eng.ai';

  return { baseUrl, pat, donId };
};

/**
 * Get portal preferences from DevRev
 */
export const getPortalPreferences =
  async (): Promise<PreferencesGetResponse | null> => {
    try {
      const { baseUrl, pat, donId } = await getDevRevConfig();

      if (!pat || !donId) {
        throw new Error('DevRev PAT or DON ID is missing');
      }

      const url = new URL(`${baseUrl}/internal/preferences.get`);
      url.searchParams.append('type', 'portal_preferences');
      url.searchParams.append('object', donId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: pat,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Failed to get preferences: ${response.status} ${response.statusText}`,
          errorText,
        );
        throw new Error(
          `Failed to get preferences: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting portal preferences:', error);
      return null;
    }
  };

/**
 * Prepare an artifact for upload
 */
export const prepareArtifact = async (
  fileName: string,
  fileType?: string,
): Promise<ArtifactPrepareResponse | null> => {
  try {
    const { baseUrl, pat } = await getDevRevConfig();

    if (!pat) {
      throw new Error('DevRev PAT is missing');
    }

    // The endpoint might be /internal/artifacts.prepare based on your Postman screenshot
    const response = await fetch(`${baseUrl}/internal/artifacts.prepare`, {
      method: 'POST',
      headers: {
        Authorization: pat,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        configuration_set: 'portal_css',
        file_name: fileName,
        file_type: fileType,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to prepare artifact: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error preparing artifact:', error);
    return null;
  }
};

/**
 * Upload a file to the prepared URL
 */
export const uploadArtifactContent = async (
  url: string,
  formData: Array<{ key: string; value: string }>,
  fileContent: string,
): Promise<boolean> => {
  try {
    const formDataObj = new FormData();

    // Add all form fields from the prepare response
    formData.forEach((field) => {
      formDataObj.append(field.key, field.value);
    });

    // Create a blob from the CSS string and append as the file
    const blob = new Blob([fileContent], { type: 'text/css' });
    formDataObj.append('file', blob);

    const response = await fetch(url, {
      method: 'POST',
      body: formDataObj,
    });

    return response.ok;
  } catch (error) {
    console.error('Error uploading artifact content:', error);
    return false;
  }
};

/**
 * Update portal preferences
 */
export const updatePortalPreferences = async (
  preferences: PreferencesGetResponse,
  stylesheetArtifactId: string,
): Promise<boolean> => {
  try {
    const { baseUrl, pat, donId } = await getDevRevConfig();

    if (!pat) {
      throw new Error('DevRev PAT is missing');
    }

    // Create a new preferences object with the updated stylesheet
    // and remove the modified_by field if it exists
    const { modified_by, modified_date, id, ...preferenceWithoutModifiedBy } =
      preferences.preference;

    // Process configuration to remove aat_keyring_id and fix org_favicon
    const configuration =
      preferenceWithoutModifiedBy.configuration || ({} as PortalConfiguration);
    const { aat_keyring_id, org_favicon, ...restConfig } = configuration;

    const updatedPreferences = {
      ...preferenceWithoutModifiedBy,
      object: donId,
      configuration: {
        ...restConfig,
        ...(org_favicon && typeof org_favicon === 'object'
          ? { org_favicon: org_favicon.id }
          : {}),
      },
      stylesheet: stylesheetArtifactId,
    };

    const response = await fetch(`${baseUrl}/internal/preferences.update`, {
      method: 'POST',
      headers: {
        Authorization: pat,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatedPreferences),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error updating preferences:', errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating portal preferences:', error);
    return false;
  }
};

/**
 * Upload CSS to DevRev and update portal preferences
 */
export const uploadCssToDevRev = async (
  cssContent: string,
): Promise<boolean> => {
  try {
    if (!cssContent || cssContent.trim() === '') {
      console.error('Empty CSS content provided');
      return false;
    }

    // Step 1: Get current preferences
    const preferences = await getPortalPreferences();
    if (!preferences) {
      throw new Error('Failed to get current preferences');
    }

    // Step 2: Prepare artifact upload
    const fileName = `portal-stylesheet-${new Date().toISOString()}.css`;
    const artifactResponse = await prepareArtifact(fileName, 'text/css');
    if (!artifactResponse) {
      throw new Error('Failed to prepare artifact');
    }

    // Step 3: Upload CSS content
    const uploadSuccess = await uploadArtifactContent(
      artifactResponse.url,
      artifactResponse.form_data,
      cssContent,
    );

    if (!uploadSuccess) {
      throw new Error('Failed to upload CSS content');
    }

    // Step 4: Update preferences with new artifact ID
    const updateSuccess = await updatePortalPreferences(
      preferences,
      artifactResponse.id,
    );

    return updateSuccess;
  } catch (error) {
    console.error('Error uploading CSS to DevRev:', error);
    return false;
  }
};

/**
 * Get artifact content by ID
 */
export const getArtifactContent = async (
  artifactId: string,
): Promise<string | null> => {
  try {
    const { baseUrl, pat } = await getDevRevConfig();

    if (!pat) {
      throw new Error('DevRev PAT is missing');
    }

    const url = new URL(`${baseUrl}/internal/artifacts.get`);
    url.searchParams.append('id', artifactId);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: pat,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get artifact: ${response.status} ${response.statusText}`,
      );
    }

    // The artifact API returns the raw file content
    // For CSS files, we can convert to text
    return await response.text();
  } catch (error) {
    console.error('Error getting artifact content:', error);
    return null;
  }
};

/**
 * Initialize CSS from DevRev portal preferences
 * This should be called once when the extension is opened
 */
export const initializeCssFromDevRev = async (): Promise<string | null> => {
  try {
    // Get current preferences to check if stylesheet exists
    const preferences = await getPortalPreferences();

    if (!preferences?.preference?.stylesheet) {
      return null;
    }

    // The stylesheet can be either a string (artifact ID) or an object with preview_url
    const stylesheet = preferences.preference.stylesheet;

    if (typeof stylesheet === 'string') {
      // Old format: stylesheet is an artifact ID
      return await getArtifactContent(stylesheet);
    } else if (typeof stylesheet === 'object' && stylesheet.preview_url) {
      // New format: stylesheet is an object with preview_url
      const response = await fetch(stylesheet.preview_url);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch CSS from preview URL: ${response.status} ${response.statusText}`,
        );
      }

      const cssContent = await response.text();

      return cssContent;
    }

    throw new Error(
      `Invalid stylesheet format in DevRev preferences: ${JSON.stringify(stylesheet)}`,
    );
  } catch (error) {
    console.error('Error initializing CSS from DevRev:', error);
    return null;
  }
};

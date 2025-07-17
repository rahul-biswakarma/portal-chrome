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
  org_logo?: { id: string } | string;
  [key: string]: unknown;
}

interface StylingInfo {
  header_image?: { id: string } | string;
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

interface StagedContent {
  type: string;
  error?: string;
  etag: string;
  expires_at: string;
  id: string;
  status: string;
}

interface ContentsPrepareResponse {
  form_data: Array<{ key: string; value: string }>;
  staged_content: StagedContent;
  url: string;
}

interface ContentsValidateResponse {
  staged_content: StagedContent;
}

interface ArtifactCreateResponse {
  artifact: {
    id: string;
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
  const baseUrl = (await getEnvVariable('DEVREV_API_URL')) || 'https://api.dev.devrev-eng.ai';

  return { baseUrl, pat, donId };
};

/**
 * Get portal preferences from DevRev
 */
export const getPortalPreferences = async (): Promise<PreferencesGetResponse | null> => {
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
    throw new Error(
      `Failed to get preferences: ${response.status} ${response.statusText}. Response: ${errorText}`
    );
  }

  const data = await response.json();
  return data;
};

/**
 * Prepare an artifact for upload
 */
export const prepareArtifact = async (
  fileName: string,
  fileType?: string
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
      throw new Error(`Failed to prepare artifact: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error preparing artifact:', error);
    return null;
  }
};

/**
 * Prepare content upload for an artifact
 */
export const prepareArtifactContent = async (
  fileType: string = 'text/css'
): Promise<ContentsPrepareResponse | null> => {
  try {
    const { baseUrl, pat } = await getDevRevConfig();

    if (!pat) {
      throw new Error('DevRev PAT is missing');
    }

    const response = await fetch(`${baseUrl}/internal/artifacts.contents.prepare`, {
      method: 'POST',
      headers: {
        Authorization: pat,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        configuration_set: 'portal_css',
        file_type: fileType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to prepare artifact content: ${response.status} ${response.statusText}. Response: ${errorText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error preparing artifact content:', error);
    throw error;
  }
};

/**
 * Validate staged content
 */
export const validateArtifactContent = async (
  stagedContentId: string
): Promise<ContentsValidateResponse | null> => {
  try {
    const { baseUrl, pat } = await getDevRevConfig();

    if (!pat) {
      throw new Error('DevRev PAT is missing');
    }

    const response = await fetch(`${baseUrl}/internal/artifacts.contents.validate`, {
      method: 'POST',
      headers: {
        Authorization: pat,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: stagedContentId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to validate artifact content: ${response.status} ${response.statusText}. Response: ${errorText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error validating artifact content:', error);
    throw error;
  }
};

/**
 * Create artifact from staged content
 */
export const createArtifactFromContent = async (
  fileName: string,
  stagedContentId: string
): Promise<ArtifactCreateResponse | null> => {
  try {
    const { baseUrl, pat } = await getDevRevConfig();

    if (!pat) {
      throw new Error('DevRev PAT is missing');
    }

    const response = await fetch(`${baseUrl}/internal/artifacts.create-from-content`, {
      method: 'POST',
      headers: {
        Authorization: pat,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_name: fileName,
        staged_content_id: stagedContentId,
        configuration_set: 'portal_css',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create artifact from content: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating artifact from content:', error);
    return null;
  }
};

/**
 * Upload a file to the prepared URL
 */
export const uploadArtifactContent = async (
  url: string,
  formData: Array<{ key: string; value: string }>,
  fileContent: string
): Promise<boolean> => {
  try {
    const formDataObj = new FormData();

    // Add all form fields from the prepare response
    formData.forEach(field => {
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
  stylesheetArtifactId: string
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
    const configuration = preferenceWithoutModifiedBy.configuration || ({} as PortalConfiguration);
    const styling = preferenceWithoutModifiedBy.styling || ({} as StylingInfo);
    const { aat_keyring_id, org_favicon, ...restConfig } = configuration;
    const { header_image, ...restStyling } = styling as StylingInfo;

    const updatedPreferences = {
      ...preferenceWithoutModifiedBy,
      object: donId,
      configuration: {
        ...restConfig,
        ...(configuration.org_logo && typeof configuration.org_logo === 'object'
          ? { org_logo: configuration.org_logo.id }
          : {}),
        ...(org_favicon && typeof org_favicon === 'object' ? { org_favicon: org_favicon.id } : {}),
      },
      styling: {
        ...restStyling,
        ...(header_image && typeof header_image === 'object'
          ? { header_image: header_image.id }
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
      throw new Error(
        `Failed to update portal preferences: ${response.status} ${response.statusText}. Response: ${errorText}`
      );
    }

    return true;
  } catch (error) {
    console.error('Error updating portal preferences:', error);
    throw error;
  }
};

/**
 * Upload CSS to DevRev and update portal preferences
 */
export const uploadCssToDevRev = async (cssContent: string): Promise<boolean> => {
  if (!cssContent || cssContent.trim() === '') {
    throw new Error('Empty CSS content provided');
  }

  // Step 1: Get current preferences
  const preferences = await getPortalPreferences();
  if (!preferences) {
    throw new Error('Failed to get current preferences');
  }

  // Step 2: Prepare artifact content upload
  const contentsPrepareResponse = await prepareArtifactContent('text/css');
  if (!contentsPrepareResponse) {
    throw new Error('Failed to prepare artifact content');
  }

  // Step 3: Upload CSS content to the provided URL
  const uploadSuccess = await uploadArtifactContent(
    contentsPrepareResponse.url,
    contentsPrepareResponse.form_data,
    cssContent
  );

  if (!uploadSuccess) {
    throw new Error('Failed to upload CSS content');
  }

  // Step 4: Validate the uploaded content
  const stagedContentId = contentsPrepareResponse.staged_content.id;
  const validateResponse = await validateArtifactContent(stagedContentId);

  if (!validateResponse || validateResponse.staged_content.status !== 'succeeded') {
    throw new Error(
      'Content validation failed: ' + (validateResponse?.staged_content.error || 'Unknown error')
    );
  }

  // Step 5: Create artifact from staged content
  const fileName = `portal-stylesheet-${new Date().toISOString()}.css`;
  const createResponse = await createArtifactFromContent(fileName, stagedContentId);

  if (!createResponse) {
    throw new Error('Failed to create artifact from content');
  }

  // Step 6: Update preferences with new artifact ID
  const updateSuccess = await updatePortalPreferences(preferences, createResponse.artifact.id);

  if (!updateSuccess) {
    throw new Error('Failed to update portal preferences');
  }

  return true;
};

/**
 * Get artifact content by ID
 */
export const getArtifactContent = async (artifactId: string): Promise<string | null> => {
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
    const errorText = await response.text();
    throw new Error(
      `Failed to get artifact: ${response.status} ${response.statusText}. Response: ${errorText}`
    );
  }

  // The artifact API returns the raw file content
  // For CSS files, we can convert to text
  return await response.text();
};

/**
 * Initialize CSS from DevRev portal preferences
 * This should be called once when the extension is opened
 */
export const initializeCssFromDevRev = async (): Promise<string | null> => {
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
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch CSS from preview URL: ${response.status} ${response.statusText}. Response: ${errorText}`
      );
    }

    const cssContent = await response.text();
    return cssContent;
  }

  throw new Error(`Invalid stylesheet format in DevRev preferences: ${JSON.stringify(stylesheet)}`);
};

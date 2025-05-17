/**
 * Environment variable utility
 */

// Get environment variables from storage
export const getEnvVariables = async (): Promise<Record<string, string>> => {
  try {
    const result = await chrome.storage.local.get('env');
    return result.env || {};
  } catch (error) {
    console.error('Error getting environment variables:', error);
    return {};
  }
};

// Set environment variables to storage
export const setEnvVariables = async (
  variables: Record<string, string>,
): Promise<void> => {
  try {
    await chrome.storage.local.set({ env: variables });
  } catch (error) {
    console.error('Error setting environment variables:', error);
  }
};

// Get a specific environment variable
export const getEnvVariable = async (
  key: string,
): Promise<string | undefined> => {
  const env = await getEnvVariables();
  return env[key];
};

// Set a specific environment variable
export const setEnvVariable = async (
  key: string,
  value: string,
): Promise<void> => {
  const env = await getEnvVariables();
  env[key] = value;
  await setEnvVariables(env);
};

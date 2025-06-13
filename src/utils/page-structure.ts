export const getPageStructure = async (tabId: number): Promise<string> => {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      return document.documentElement.outerHTML;
    },
  });
  return result[0]?.result || '';
};

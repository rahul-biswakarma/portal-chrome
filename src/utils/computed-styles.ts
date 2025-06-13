export const extractComputedStyles = async (
  tabId: number
): Promise<Record<string, Record<string, string>>> => {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const elements = document.querySelectorAll('[class*="portal-"]');
      const styleMap: Record<string, Record<string, string>> = {};
      elements.forEach(el => {
        const computedStyle = window.getComputedStyle(el);
        const styles: Record<string, string> = {};
        for (const prop of computedStyle) {
          styles[prop] = computedStyle.getPropertyValue(prop);
        }
        styleMap[el.tagName.toLowerCase()] = styles;
      });
      return styleMap;
    },
  });
  return result[0]?.result || {};
};

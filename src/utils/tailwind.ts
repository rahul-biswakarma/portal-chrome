export const extractTailwindClasses = async (tabId: number): Promise<Record<string, string[]>> => {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const elements = document.querySelectorAll('[class*="portal-"]');
      const classMap: Record<string, string[]> = {};
      elements.forEach(el => {
        const classes = Array.from(el.classList).filter(cls => cls.startsWith('portal-'));
        if (classes.length > 0) {
          classMap[el.tagName.toLowerCase()] = classes;
        }
      });
      return classMap;
    },
  });
  return result[0]?.result || {};
};

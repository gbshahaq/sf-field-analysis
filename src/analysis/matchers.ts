/** Case-insensitive, whole-word matching to reduce false positives */
export function containsField(
  text: string,
  fieldName: string,
  opts: { ignoreCase?: boolean; wholeWord?: boolean } = { ignoreCase: true, wholeWord: true }
): boolean {
  const { ignoreCase = true, wholeWord = true } = opts;
  if (!text || !fieldName) return false;

  if (!wholeWord) {
    return ignoreCase ? text.toLowerCase().includes(fieldName.toLowerCase()) : text.includes(fieldName);
  }

  const esc = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${esc}\\b`, ignoreCase ? "i" : "");
  return re.test(text);
}

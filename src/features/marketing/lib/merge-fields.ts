/** The one merge field messages support; replaced with each recipient's first name. */
export const FIRST_NAME_TAG = "{{first_name}}";

/** The name previews show in place of the tag. */
export const SAMPLE_FIRST_NAME = "Maria";

export function render(text: string, firstName: string) {
  return text.replaceAll(FIRST_NAME_TAG, firstName);
}

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

/** A plain-text message as simple email HTML: a paragraph per blank-line block, line breaks kept. */
export function textToHtml(text: string) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => `<p>${escapeHtml(block.trim()).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

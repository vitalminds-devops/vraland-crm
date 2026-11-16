const startsWith = (head: Uint8Array, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => head[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** Whether the first bytes of a file match the type the browser declared for it. */
export function matchesSignature(type: string, head: Uint8Array): boolean {
  switch (type) {
    case "image/jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8);
    case "application/pdf":
      return startsWith(head, ascii("%PDF-"));
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]);
    case "text/plain":
      return !head.includes(0);
    default:
      return false;
  }
}

export async function matchesDeclaredType(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  return matchesSignature(file.type, head);
}

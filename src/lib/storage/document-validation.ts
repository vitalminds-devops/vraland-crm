import { matchesDeclaredType } from "./file-signature";

export const requirementFileTypes: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const documentFileTypes: Record<string, string> = {
  ...requirementFileTypes,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

/** Shared by browser preflight and server validation; no file is sent or stored on failure. */
export async function documentFileError(
  file: File,
  types = documentFileTypes,
): Promise<string | null> {
  if (!file.size) return `${file.name} is empty. Choose a file with content.`;
  if (file.size > 15 * 1024 * 1024)
    return `${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The maximum is 15 MB per file. Compress it or choose a smaller file.`;
  if (!Object.hasOwn(types, file.type))
    return `${file.name} has an unsupported file type. Accepted formats: ${Object.values(types).join(", ").toUpperCase()}.`;
  try {
    if (!(await matchesDeclaredType(file)))
      return `${file.name}: the file contents do not match its declared type. Export it again in the correct format; renaming the extension is not enough.`;
  } catch {
    return `${file.name} could not be read. Choose the file again or export a new copy.`;
  }
  return null;
}

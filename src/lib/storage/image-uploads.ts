import { matchesDeclaredType } from "./file-signature";

const storedImageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const storedImageAccept = Object.keys(storedImageTypes).join(",");

/** Five megabytes: a photograph, not a print-resolution scan. */
const storedImageLimit = 5 * 1024 * 1024;

export type ImageUploadCheck =
  | {
      ok: true;
      file: File;
      extension: string;
      mimeType: string;
      size: number;
    }
  | { ok: false; message: string };

export async function checkImageUpload(file: FormDataEntryValue | null): Promise<ImageUploadCheck> {
  if (!(file instanceof File) || !file.size)
    return { ok: false, message: "Choose a picture to upload." };

  const extension = storedImageTypes[file.type];
  if (!extension || !(await matchesDeclaredType(file)))
    return { ok: false, message: "Choose a JPEG, PNG or WebP image." };

  if (file.size > storedImageLimit)
    return { ok: false, message: "Pictures must be 5 MB or smaller." };

  return {
    ok: true,
    file,
    extension,
    mimeType: file.type,
    size: file.size,
  };
}

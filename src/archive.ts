import { zip, type Zippable } from "fflate";

export interface ArchiveFile {
  name: string;
  bytes: Uint8Array;
}

export function createArchive(files: ArchiveFile[]): Promise<Uint8Array> {
  const entries: Zippable = Object.fromEntries(files.map((file) => [file.name, file.bytes]));
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

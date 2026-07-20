const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "html", "htm", "json", "yaml", "yml", "xml", "csv", "tsv",
]);

export type UploadInspection = { ok: true } | { ok: false; reason: string };

export function inspectUploadBytes(filename: string, bytes: Uint8Array): UploadInspection {
  const extension = filename.toLowerCase().split(".").at(-1) ?? "";
  if (!bytes.byteLength) return { ok: false, reason: "The file is empty." };
  if (extension === "pdf") {
    return asciiPrefix(bytes, "%PDF-") ? { ok: true } : { ok: false, reason: "The file extension is PDF, but its bytes are not a PDF." };
  }
  if (extension === "doc") {
    const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    return ole.every((value, index) => bytes[index] === value)
      ? { ok: true }
      : { ok: false, reason: "The file extension is DOC, but its bytes are not an OLE document." };
  }
  if (extension === "docx" || extension === "pptx") return inspectOfficeArchive(extension, bytes);
  if (TEXT_EXTENSIONS.has(extension)) {
    if (bytes.includes(0)) {
      return { ok: false, reason: "The selected text file contains binary data." };
    }
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return { ok: true };
    } catch {
      return { ok: false, reason: "Text uploads must use valid UTF-8 encoding." };
    }
  }
  return { ok: false, reason: "This file type is not supported." };
}

function inspectOfficeArchive(extension: "docx" | "pptx", bytes: Uint8Array): UploadInspection {
  if (!zipPrefix(bytes)) return { ok: false, reason: `The file extension is ${extension.toUpperCase()}, but its bytes are not a ZIP-based Office document.` };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) return { ok: false, reason: "The Office archive has no valid central directory." };
  const entries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (!entries || entries === 0xffff || entries > 5_000) return { ok: false, reason: "The Office archive has an unsafe entry count." };
  if (centralOffset + centralSize > bytes.byteLength) return { ok: false, reason: "The Office archive central directory is malformed." };

  let cursor = centralOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let hasContentTypes = false;
  let hasExpectedRoot = false;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
      return { ok: false, reason: "The Office archive contains a malformed entry." };
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength || flags & 0x1 || ![0, 8].includes(method)) {
      return { ok: false, reason: "The Office archive uses encryption or an unsupported compression method." };
    }
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replaceAll("\\", "/");
    if (!name || name.startsWith("/") || name.split("/").some((segment) => segment === "..")) {
      return { ok: false, reason: "The Office archive contains an unsafe path." };
    }
    hasContentTypes ||= name === "[Content_Types].xml";
    hasExpectedRoot ||= name.startsWith(extension === "docx" ? "word/" : "ppt/");
    totalCompressed += compressed;
    totalUncompressed += uncompressed;
    if (totalUncompressed > 100 * 1024 * 1024
      || (totalCompressed > 0 && totalUncompressed / totalCompressed > 100)) {
      return { ok: false, reason: "The Office archive exceeds safe decompression limits." };
    }
    cursor = end;
  }
  if (!hasContentTypes || !hasExpectedRoot) {
    return { ok: false, reason: `The archive does not contain the expected ${extension.toUpperCase()} document structure.` };
  }
  return { ok: true };
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function asciiPrefix(bytes: Uint8Array, value: string): boolean {
  return [...value].every((character, index) => bytes[index] === character.charCodeAt(0));
}

function zipPrefix(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2] ?? -1);
}

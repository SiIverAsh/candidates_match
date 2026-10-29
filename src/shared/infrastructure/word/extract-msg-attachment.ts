import { MAX_RESUME_FILE_BYTES } from "../../domain/import-file";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// word-extractor pins the OLE reader we already use for legacy Word documents.
// Keep this adapter isolated so its private API can be replaced independently.
interface StorageEntry { storages: Record<string, StorageEntry>; streams: Record<string, { size: number }> }
interface Storage { _dirEntry: StorageEntry; stream(name: string): AsyncIterable<Buffer> }
interface CompoundDocument { read(): Promise<CompoundDocument>; _rootStorage: Storage; storage(name: string): Storage }
const Compound = require("word-extractor/lib/ole-compound-doc") as new (reader: unknown) => CompoundDocument;
const BufferReader = require("word-extractor/lib/buffer-reader") as new (bytes: Buffer) => unknown;
const FORMATS = ["pdf", "doc", "docx", "html", "txt", "pptx"] as const;
export type MailAttachmentFormat = typeof FORMATS[number];

async function streamBytes(storage: Storage, key: string): Promise<Buffer | null> {
  const entry = storage._dirEntry.streams[key];
  if (!entry) return null;
  if (entry.size > MAX_RESUME_FILE_BYTES) throw new Error("MSG_ATTACHMENT_TOO_LARGE");
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of storage.stream(key)) {
    length += chunk.length;
    if (length > MAX_RESUME_FILE_BYTES) throw new Error("MSG_ATTACHMENT_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function extractMsgAttachment(bytes: Uint8Array): Promise<{ format: MailAttachmentFormat; bytes: Uint8Array }> {
  const document = await new Compound(new BufferReader(Buffer.from(bytes))).read();
  const attachments: Array<{ format: MailAttachmentFormat; bytes: Uint8Array }> = [];
  for (const name of Object.keys(document._rootStorage._dirEntry.storages).filter(value => value.startsWith("__attach_version1.0_"))) {
    const storage = document.storage(name);
    const extensionBytes = await streamBytes(storage, "__substg1.0_3703001F");
    const extension = extensionBytes?.toString("utf16le").replace(/\0/gu, "").replace(/^\./u, "").toLowerCase();
    const format = extension === "htm" ? "html" : extension;
    if (!FORMATS.includes(format as MailAttachmentFormat)) continue;
    const data = await streamBytes(storage, "__substg1.0_37010102");
    if (data?.length) attachments.push({ format: format as MailAttachmentFormat, bytes: data });
  }
  if (attachments.length > 1) throw new Error("MSG_MULTIPLE_ATTACHMENTS");
  if (!attachments.length) throw new Error("MSG_NO_RESUME_ATTACHMENT");
  return attachments[0];
}

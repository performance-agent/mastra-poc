import { BadRequestException } from '@nestjs/common';
import { MAX_KNOWLEDGE_BYTES, MAX_KNOWLEDGE_TEXT } from './knowledge.types';

export function documentMime(name: string, buffer: Buffer): string {
  if (!buffer.length || buffer.length > MAX_KNOWLEDGE_BYTES)
    throw new BadRequestException('Choose a non-empty document up to 20 MB');
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'pdf' && buffer.subarray(0, 5).toString() === '%PDF-')
    return 'application/pdf';
  if (
    extension === 'docx' &&
    buffer.length >= 4 &&
    buffer.readUInt16LE(0) === 0x4b50
  ) {
    validateDocxArchive(buffer);
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (['txt', 'md', 'csv'].includes(extension ?? '')) {
    decodeText(buffer);
    return extension === 'csv'
      ? 'text/csv'
      : extension === 'md'
        ? 'text/markdown'
        : 'text/plain';
  }
  throw new BadRequestException(
    'Supported documents: PDF, DOCX, UTF-8 TXT, Markdown and CSV. The file content must match its extension.',
  );
}

function decodeText(buffer: Buffer) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (text.includes('\0')) throw new Error('Binary data');
    return text;
  } catch {
    throw new BadRequestException(
      'Text documents must contain UTF-8 text, not binary data',
    );
  }
}

// Bound DOCX expansion before giving the archive to Mammoth. Reject ZIP64 and
// malformed archives rather than allowing a small upload to expand without limit.
function validateDocxArchive(buffer: Buffer) {
  let end = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 65557);
    i--
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new BadRequestException('The DOCX archive is damaged');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  let expanded = 0;
  let document = false;
  if (count > 10000 || count === 65535)
    throw new BadRequestException('This DOCX archive is too large to process');
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw new BadRequestException('The DOCX archive is damaged');
    const size = buffer.readUInt32LE(offset + 24);
    const nameSize = buffer.readUInt16LE(offset + 28);
    const extraSize = buffer.readUInt16LE(offset + 30);
    const commentSize = buffer.readUInt16LE(offset + 32);
    expanded += size;
    if (size === 0xffffffff || expanded > 100 * 1024 * 1024)
      throw new BadRequestException(
        'The expanded DOCX exceeds the 100 MB processing limit',
      );
    if (
      buffer.subarray(offset + 46, offset + 46 + nameSize).toString() ===
      'word/document.xml'
    )
      document = true;
    offset += 46 + nameSize + extraSize + commentSize;
  }
  if (!document)
    throw new BadRequestException('The file is not a Word DOCX document');
}

export async function extractDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  let text: string;
  if (mimeType === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      text = (await parser.getText({ pageJoiner: '' })).pages
        .map((page) => page.text)
        .join('\n\n');
    } finally {
      await parser.destroy();
    }
  } else if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    validateDocxArchive(buffer);
    const mammoth = await import('mammoth');
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (mimeType.startsWith('text/')) {
    text = decodeText(buffer);
  } else throw new BadRequestException('This document format is not supported');
  text = text.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim();
  if (text.length < 2)
    throw new BadRequestException(
      'No readable text was found. Scanned PDFs need OCR before uploading.',
    );
  if (text.length > MAX_KNOWLEDGE_TEXT)
    throw new BadRequestException(
      'This document exceeds one million text characters. Split it into smaller documents.',
    );
  return text;
}

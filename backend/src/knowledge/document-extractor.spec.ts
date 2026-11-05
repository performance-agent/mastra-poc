import { documentMime, extractDocument } from './document-extractor';
describe('knowledge document validation and extraction', () => {
  it('extracts UTF-8 text without rendering markup or executing instructions', async () => {
    const buffer = Buffer.from(
      '# Requirements\r\n<script>untrusted()</script>\r\nProject context',
    );
    expect(documentMime('brief.md', buffer)).toBe('text/markdown');
    expect(await extractDocument(buffer, 'text/markdown')).toBe(
      '# Requirements\n<script>untrusted()</script>\nProject context',
    );
  });
  it.each([
    ['fake.pdf', Buffer.from('not a PDF')],
    ['fake.docx', Buffer.from('x')],
    ['binary.txt', Buffer.from([0, 1, 2])],
    ['document.exe', Buffer.from('executable')],
    ['empty.txt', Buffer.alloc(0)],
  ])('rejects unsupported or mismatched %s', (name, buffer) => {
    expect(() => documentMime(name, buffer)).toThrow();
  });
  it('rejects malformed or unbounded DOCX archives before decompression', () => {
    expect(() =>
      documentMime('fake.docx', Buffer.from('PK00not a document')),
    ).toThrow('damaged');
  });
  it('does not mark empty extracted text as ready', async () => {
    await expect(
      extractDocument(Buffer.from('   '), 'text/plain'),
    ).rejects.toThrow('No readable text');
  });
  it('rejects oversized text instead of silently truncating evidence', async () => {
    await expect(
      extractDocument(Buffer.from('x'.repeat(1_000_001)), 'text/plain'),
    ).rejects.toThrow('one million');
  });
});

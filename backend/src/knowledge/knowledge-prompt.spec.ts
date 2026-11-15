import {
  knowledgePackage,
  validateKnowledgeReferences,
} from './knowledge-prompt';
import type { KnowledgeSnapshot } from './knowledge.types';
const source = {
  id: 'n',
  versionId: 'v',
  name: 'Requirements',
  usage: 'CONTEXT' as const,
  origin: 'UPLOAD',
  scope: 'workspace' as const,
  revision: 'r',
  digest: 'sha',
  sourceUrl: null,
  capturedAt: '2026-11-03T00:00:00Z',
};
const snapshot: KnowledgeSnapshot = {
  capturedAt: source.capturedAt,
  sources: [source],
  unavailable: 1,
};
describe('bounded knowledge retrieval and citation validation', () => {
  it('retrieves relevant text beyond the document beginning and records omissions', () => {
    const text =
      'irrelevant background '.repeat(300) +
      ' critical authentication requirement ' +
      'more reference material '.repeat(300);
    const result = knowledgePackage(
      snapshot,
      [{ ...source, text }],
      'authentication',
      2200,
    );
    expect(
      result.sources[0].excerpts.some((e) => e.text.includes('authentication')),
    ).toBe(true);
    expect(result.sources[0].totalCharacters).toBe(text.length);
    expect(result.sources[0].includedCharacters).toBeLessThan(text.length);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(2200);
  });
  it('includes every selected document within a UTF-8 byte budget', () => {
    const documents = Array.from({ length: 20 }, (_, i) => ({
      ...source,
      id: 'n' + i,
      versionId: 'v' + i,
      text: '📚 objetivos del proyecto '.repeat(200),
    }));
    const result = knowledgePackage(
      {
        ...snapshot,
        sources: documents.map(({ text, ...s }) => {
          void text;
          return s;
        }),
      },
      documents,
      'objetivos',
      20000,
    );
    expect(result.sources).toHaveLength(20);
    expect(result.sources.every((s) => s.excerpts.length > 0)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      20000,
    );
  });
  it('rejects invented excerpt references while accepting actual ones and provider references', () => {
    const result = knowledgePackage(
      snapshot,
      [{ ...source, text: 'Real document evidence' }],
      '',
    );
    expect(() =>
      validateKnowledgeReferences(
        {
          evidence: [
            { reference: result.sources[0].excerpts[0].reference },
            { reference: 'github:abc' },
          ],
        },
        result,
      ),
    ).not.toThrow();
    expect(() =>
      validateKnowledgeReferences(
        { evidence: [{ reference: 'knowledge:other:0' }] },
        result,
      ),
    ).toThrow('unknown knowledge excerpt');
  });
  it('handles an explicitly empty knowledge package', () => {
    expect(
      knowledgePackage({ ...snapshot, sources: [] }, [], '').sources,
    ).toEqual([]);
  });
});

// Real PostgreSQL + private Firebase Storage round trip. Creates isolated test
// entities and deletes only those entities and uploaded test objects afterward.
// Run from backend after npm run build: node test/knowledge.integration.cjs
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdir, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const {
  AccessControlService,
} = require('../dist/src/access-control/access-control.service');
const { FirebaseService } = require('../dist/src/firebase/firebase.service');
const {
  KnowledgeStorageService,
} = require('../dist/src/knowledge/knowledge-storage.service');
const { KnowledgeService } = require('../dist/src/knowledge/knowledge.service');
const {
  extractDocument,
  documentMime,
} = require('../dist/src/knowledge/document-extractor');

function pdf(text) {
  const stream = `BT /F1 12 Tf 50 750 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}
async function main() {
  const db = new PrismaService();
  const storage = new KnowledgeStorageService(new FirebaseService());
  const service = new KnowledgeService(
    db,
    new AccessControlService(db),
    storage,
  );
  const run = randomUUID();
  let org;
  const users = [];
  const checks = [];
  let workspaceId;
  try {
    org = await db.organization.create({
      data: { name: 'Knowledge integration test ' + run },
    });
    const workspace = await db.workspace.create({
      data: { name: 'Isolated knowledge test', organizationId: org.id },
    });
    workspaceId = workspace.id;
    const group = await db.group.create({
      data: { name: 'Knowledge project', workspaceId },
    });
    const otherGroup = await db.group.create({
      data: { name: 'Private sibling project', workspaceId },
    });
    for (const role of ['OWNER', 'VIEWER', 'PROJECT_ADMIN']) {
      const user = await db.user.create({
        data: {
          name: role,
          email: `knowledge-${role.toLowerCase()}-${run}@example.test`,
          firebaseUid: 'knowledge-' + role + '-' + run,
        },
      });
      users.push(user);
      await db.membership.create({
        data: {
          userId: user.id,
          role: role === 'PROJECT_ADMIN' ? 'ADMIN' : role,
          ...(role === 'PROJECT_ADMIN'
            ? { groupId: group.id }
            : { workspaceId }),
        },
      });
    }
    const [owner, viewer, projectAdmin] = users;
    const folder = await service.createFolder(owner.id, {
      workspaceId,
      name: 'References',
    });
    const child = await service.createFolder(owner.id, {
      workspaceId,
      parentId: folder.id,
      name: 'Requirements',
    });
    const content = Buffer.from(
      'KNOWLEDGE-INTEGRATION-ONLY\nThe project must expose document provenance and preserve captured revisions.',
    );
    const uploaded = await service.upload(
      owner.id,
      { workspaceId, parentId: child.id, usage: 'CONTEXT' },
      {
        buffer: content,
        originalname: 'Requirements.txt',
        size: content.length,
      },
    );
    await service.processPending();
    const detail = await service.detail(owner.id, uploaded.id);
    assert.equal(detail.status, 'READY');
    assert.equal(detail.version.text, content.toString());
    const file = await service.download(viewer.id, uploaded.id);
    assert.equal(file.buffer.toString(), content.toString());
    checks.push(
      'Private Firebase upload, processing, immutable version, authorized preview and original download',
    );
    const snapshot = await service.snapshot(group.id, {
      folderIds: [folder.id],
      sourceIds: [uploaded.id],
    });
    assert.equal(snapshot.sources.length, 1);
    assert.equal(snapshot.sources[0].versionId, detail.version.id);
    await service.update(owner.id, uploaded.id, {
      usage: 'BOTH',
      name: 'Renamed requirements.txt',
    });
    assert.equal(snapshot.sources[0].usage, 'CONTEXT');
    assert.equal(snapshot.sources[0].name, 'Requirements.txt');
    assert.equal(
      (await service.snapshotText(snapshot))[0].text,
      content.toString(),
    );
    checks.push(
      'Nested folder expansion deduplicates documents and captured versions survive metadata changes',
    );
    await service.exclude(projectAdmin.id, group.id, folder.id, true);
    assert.equal((await service.snapshot(group.id)).sources.length, 0);
    assert.equal(
      (await service.list(viewer.id, { workspaceId })).nodes.find(
        (n) => n.id === uploaded.id,
      ).excluded,
      false,
    );
    await service.exclude(projectAdmin.id, group.id, folder.id, false);
    checks.push(
      'Project folder exclusions do not alter the shared workspace library',
    );
    await assert.rejects(
      service.createFolder(viewer.id, { workspaceId, name: 'Denied' }),
      /permissions/,
    );
    await assert.rejects(
      service.update(projectAdmin.id, uploaded.id, { name: 'Denied.txt' }),
      /permissions/,
    );
    const privateNode = await service.createFolder(owner.id, {
      workspaceId,
      groupId: otherGroup.id,
      name: 'Sibling private',
    });
    await assert.rejects(
      service.detail(projectAdmin.id, privateNode.id),
      /permissions/,
    );
    await assert.rejects(
      service.update(owner.id, folder.id, { parentId: child.id }),
      /descendants/,
    );
    checks.push(
      'Real database memberships enforce viewer, inherited-edit and sibling-project boundaries; cyclic moves rejected',
    );
    const pdfBuffer = pdf(
      'Knowledge PDF extraction verifies actual document content.',
    );
    assert.match(
      await extractDocument(pdfBuffer, documentMime('Test.pdf', pdfBuffer)),
      /Knowledge PDF extraction/,
    );
    const JSZip = require('jszip');
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      '_rels/.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Knowledge DOCX extraction verifies actual content.</w:t></w:r></w:p></w:body></w:document>',
    );
    const docx = await zip.generateAsync({ type: 'nodebuffer' });
    assert.match(
      await extractDocument(docx, documentMime('Test.docx', docx)),
      /Knowledge DOCX extraction/,
    );
    checks.push('Actual PDF and DOCX text extraction with real parsers');
    if (process.argv.includes('--report')) {
      const { ReportsService } = require('../dist/src/reports/reports.service');
      const {
        PluginRuntimeService,
      } = require('../dist/src/plugins/runtime/plugin-runtime.service');
      const runtime = new PluginRuntimeService(
        {
          get: async () => {
            throw new Error('No plugins are assigned in this isolated test');
          },
        },
        {},
      );
      const reports = new ReportsService(db, runtime, {}, service);
      console.log(
        'Generating an isolated real report using the configured model and the uploaded knowledge document…',
      );
      const report = await reports.createGroupReport(group.id, {
        type: 'GROUP_REPORT',
        knowledgeSelection: { sourceIds: [uploaded.id] },
      });
      assert.equal(report.data.knowledgeSources.sources.length, 1);
      assert.equal(
        report.data.knowledgeSources.sources[0].versionId,
        detail.version.id,
      );
      assert.ok(
        report.data.knowledgeSources.sources[0].excerpts.some((e) =>
          e.text.includes('KNOWLEDGE-INTEGRATION-ONLY'),
        ),
      );
      assert.ok(report.data.summary.length > 0);
      checks.push(
        'Actual configured-model generation and persisted knowledge-only report with the uploaded document’s exact version and excerpts',
      );
    }
    await service.remove(owner.id, folder.id);
    assert.equal(
      (await service.list(owner.id, { workspaceId })).nodes.some(
        (n) => n.id === uploaded.id,
      ),
      false,
    );
    assert.equal(
      (await service.snapshotText(snapshot))[0].text,
      content.toString(),
    );
    checks.push(
      'Soft deletion removes sources from the library while preserving captured report text',
    );
    const { DriveService } = require('../dist/src/knowledge/drive.service');
    const drive = new DriveService(db, service, storage);
    const anotherAdmin = await db.user.create({
      data: {
        name: 'Another administrator',
        email: `knowledge-admin-${run}@example.test`,
        firebaseUid: 'knowledge-admin-' + run,
      },
    });
    users.push(anotherAdmin);
    await db.membership.create({
      data: { userId: anotherAdmin.id, workspaceId, role: 'ADMIN' },
    });
    const connection = await db.knowledgeConnection.create({
      data: {
        workspaceId,
        ownerId: owner.id,
        email: 'private-account@example.test',
        accountId: 'private-google-account',
        credentials: {},
        rootIds: ['published-file'],
      },
    });
    const original = await db.knowledgeVersion.findUniqueOrThrow({
      where: { id: detail.version.id },
    });
    const shared = await db.knowledgeNode.create({
      data: {
        workspaceId,
        connectionId: connection.id,
        externalId: 'published-file',
        name: 'Shared Drive document',
        kind: 'DOCUMENT',
        origin: 'GOOGLE_DRIVE',
        status: 'READY',
        versions: {
          create: {
            revision: '1',
            digest: original.digest,
            text: original.text,
            objectPath: original.objectPath,
            mimeType: original.mimeType,
            bytes: original.bytes,
          },
        },
      },
    });
    assert.equal(
      (await drive.list(owner.id, { workspaceId })).connections[0].canManage,
      true,
    );
    const summary = (await drive.list(anotherAdmin.id, { workspaceId }))
      .connections[0];
    assert.equal(summary.canManage, false);
    for (const field of [
      'email',
      'accountId',
      'credentials',
      'rootIds',
      'destinationId',
      'usage',
    ])
      assert.equal(field in summary, false);
    for (const actor of [anotherAdmin, viewer]) {
      await assert.rejects(
        drive.browse(actor.id, connection.id, {}),
        /owner|person who connected|permissions/i,
      );
      await assert.rejects(
        drive.configure(actor.id, connection.id, { rootIds: ['private-file'] }),
        /owner|person who connected|permissions/i,
      );
      await assert.rejects(
        drive.syncNow(actor.id, connection.id),
        /owner|person who connected|permissions/i,
      );
      await assert.rejects(
        drive.disconnect(actor.id, connection.id),
        /owner|person who connected|permissions/i,
      );
      await assert.rejects(
        drive.authorize(actor.id, { workspaceId, connectionId: connection.id }),
        /owner|person who connected|permissions/i,
      );
      assert.equal(
        (await service.detail(actor.id, shared.id)).version.text,
        original.text,
      );
      assert.equal(
        (await service.download(actor.id, shared.id)).buffer.toString(),
        original.text,
      );
    }
    assert.equal(
      (await service.snapshot(group.id, { sourceIds: [shared.id] })).sources
        .length,
      1,
    );
    await db.membership.updateMany({
      where: { userId: owner.id, workspaceId },
      data: { role: 'VIEWER' },
    });
    await drive.synchronize(connection);
    assert.match(
      (
        await db.knowledgeConnection.findUniqueOrThrow({
          where: { id: connection.id },
        })
      ).error,
      /Synchronization paused/,
    );
    assert.equal((await service.detail(viewer.id, shared.id)).status, 'READY');
    checks.push(
      'Real memberships: other admins/viewers read and download published Drive copies and select them for reports, but cannot browse or manage the private connection; lost owner permissions pause sync without removing copies',
    );
    const evidence = {
      type: 'Real PostgreSQL and Firebase Storage integration; no simulated storage or memberships',
      run,
      checks,
    };
    const directory = resolve('../artifacts/knowledge-base/implementation');
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(
        directory,
        process.argv.includes('--report')
          ? 'integration.json'
          : 'permissions-integration.json',
      ),
      JSON.stringify(evidence, null, 2) + '\n',
    );
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    if (workspaceId) {
      const nodes = await db.knowledgeNode.findMany({
        where: { workspaceId },
        include: { versions: { select: { objectPath: true } } },
      });
      const paths = new Set(
        nodes
          .flatMap((n) => [
            n.pendingObjectPath,
            ...n.versions.map((v) => v.objectPath),
          ])
          .filter(Boolean),
      );
      for (const path of paths) await storage.remove(path);
    }
    if (org) await db.organization.delete({ where: { id: org.id } });
    for (const user of users) await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

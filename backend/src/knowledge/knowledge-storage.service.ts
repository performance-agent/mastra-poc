import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class KnowledgeStorageService {
  constructor(private readonly firebase: FirebaseService) {}
  async save(workspaceId: string, buffer: Buffer, mimeType: string) {
    const path = `knowledge/${workspaceId}/${randomUUID()}`;
    await this.firebase
      .storageBucket()
      .file(path)
      .save(buffer, {
        resumable: false,
        metadata: { contentType: mimeType, cacheControl: 'private, no-store' },
      });
    return path;
  }
  async read(path: string) {
    const [buffer] = await this.firebase.storageBucket().file(path).download();
    return buffer;
  }
  async remove(path: string) {
    await this.firebase
      .storageBucket()
      .file(path)
      .delete({ ignoreNotFound: true });
  }
}

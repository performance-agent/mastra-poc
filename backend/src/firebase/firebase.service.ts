import { Injectable } from '@nestjs/common';
import { App, applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class FirebaseService {
  private readonly app: App;
  private readonly auth: Auth;
  private readonly CHECK_REVOKED = true;

  constructor() {
    this.app = initializeApp({
      credential: applicationDefault(),
    });
    this.auth = getAuth(this.app);
  }

  async verifyIdToken(idToken: string) {
    const decodedToken = await this.auth.verifyIdToken(
      idToken,
      this.CHECK_REVOKED,
    );
    return decodedToken;
  }

  storageBucket() {
    const bucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucket)
      throw new ServiceUnavailableException(
        'Image uploads are not configured yet',
      );
    return getStorage(this.app).bucket(bucket);
  }
}

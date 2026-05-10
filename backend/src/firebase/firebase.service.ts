import { Injectable } from '@nestjs/common';
import { App, applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

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
}

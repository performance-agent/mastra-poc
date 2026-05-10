import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { FirebaseModule } from '../firebase/firebase.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [FirebaseModule, UsersModule],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}

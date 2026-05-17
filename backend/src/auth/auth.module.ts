import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [FirebaseModule, UsersModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

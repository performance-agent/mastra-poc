import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { ExperienceController } from './experience.controller';
import { MediaController, MediaService } from './media.controller';

@Module({
  imports: [AccessControlModule, FirebaseModule],
  controllers: [ExperienceController, MediaController],
  providers: [MediaService],
})
export class ExperienceModule {}

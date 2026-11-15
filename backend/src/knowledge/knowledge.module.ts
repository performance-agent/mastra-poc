import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeStorageService } from './knowledge-storage.service';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';

@Module({
  imports: [AccessControlModule, FirebaseModule],
  controllers: [KnowledgeController, DriveController],
  providers: [KnowledgeService, KnowledgeStorageService, DriveService],
  exports: [KnowledgeService, KnowledgeStorageService],
})
export class KnowledgeModule {}

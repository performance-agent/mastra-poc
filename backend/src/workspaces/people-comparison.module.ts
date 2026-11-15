import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PeopleComparisonService } from './people-comparison.service';
@Module({
  imports: [AccessControlModule],
  providers: [PeopleComparisonService],
  exports: [PeopleComparisonService],
})
export class PeopleComparisonModule {}

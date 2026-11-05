import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { EvaluatorsController } from './evaluators.controller';
import { EvaluatorsService } from './evaluators.service';

@Module({
  imports: [AccessControlModule],
  controllers: [EvaluatorsController],
  providers: [EvaluatorsService],
  exports: [EvaluatorsService],
})
export class EvaluatorsModule {}

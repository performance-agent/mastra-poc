import { Module } from '@nestjs/common';
import { DataTypesService } from './data-types.service';
import { DataTypesController } from './data-types.controller';

@Module({
  controllers: [DataTypesController],
  providers: [DataTypesService],
  exports: [DataTypesService],
})
export class DataTypesModule {}

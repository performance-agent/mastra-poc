import { Global, Module } from '@nestjs/common';
import { GenerationService } from './generation.service';
@Global()
@Module({ providers: [GenerationService], exports: [GenerationService] })
export class GenerationModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MastraModule } from '@mastra/nestjs';
import { mastra } from './mastra';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot(), MastraModule.register({ mastra })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

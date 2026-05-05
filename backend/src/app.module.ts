import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MastraModule } from '@mastra/nestjs';
import { mastra } from './mastra';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { OrganizationsModule } from './organizations/organizations.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { GroupsModule } from './groups/groups.module';
import { GithubModule } from './integrations/github/github.module';
import { UsersModule } from './users/users.module';
import { MembersModule } from './members/members.module';
import { ResourcesModule } from './resources/resources.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    OrganizationsModule,
    WorkspacesModule,
    GroupsModule,
    GithubModule,
    MastraModule.register({ mastra }),
    UsersModule,
    MembersModule,
    ResourcesModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}

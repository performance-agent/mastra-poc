import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { OrganizationsModule } from './organizations/organizations.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { GroupsModule } from './groups/groups.module';
import { GithubModule } from './integrations/github/github.module';
import { UsersModule } from './users/users.module';
import { MembersModule } from './members/members.module';
import { ResourcesModule } from './resources/resources.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { FirebaseModule } from './firebase/firebase.module';
import { PrismaModule } from './prisma/prisma.module';
import { AccessControlModule } from './access-control/access-control.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    OrganizationsModule,
    WorkspacesModule,
    GroupsModule,
    GithubModule,
    UsersModule,
    MembersModule,
    ResourcesModule,
    IntegrationsModule,
    AuthModule,
    FirebaseModule,
    PrismaModule,
    AccessControlModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { GenerationModule } from './generation/generation.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ExperienceModule } from './experience/experience.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { OrganizationsModule } from './organizations/organizations.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { GroupsModule } from './groups/groups.module';
import { UsersModule } from './users/users.module';
import { MembersModule } from './members/members.module';
import { ResourcesModule } from './resources/resources.module';
import { AuthModule } from './auth/auth.module';
import { FirebaseModule } from './firebase/firebase.module';
import { PrismaModule } from './prisma/prisma.module';
import { AccessControlModule } from './access-control/access-control.module';
import { ReportsModule } from './reports/reports.module';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { MembershipGuard } from './access-control/membership.guard';
import { DataTypesModule } from './data-types/data-types.module';
import { PluginsModule } from './plugins/plugins.module';
import { PluginInstallationsModule } from './plugin-installations/plugin-installations.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { EvaluatorsModule } from './evaluators/evaluators.module';
import { InvitationsModule } from './invitations/invitations.module';
import { PerformanceMcpModule } from './mcp/performance-mcp.module';

@Module({
  imports: [
    KnowledgeModule,
    ExperienceModule,
    GenerationModule,
    ConfigModule.forRoot(),
    OrganizationsModule,
    WorkspacesModule,
    GroupsModule,
    UsersModule,
    MembersModule,
    ResourcesModule,
    AuthModule,
    FirebaseModule,
    PrismaModule,
    AccessControlModule,
    ReportsModule,
    DataTypesModule,
    PluginsModule,
    PluginInstallationsModule,
    EvaluationsModule,
    EvaluatorsModule,
    InvitationsModule,
    PerformanceMcpModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: MembershipGuard },
  ],
})
export class AppModule {}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GitHubPluginOptions = {
  appInstallationUrl: string;
  app: {
    appId: string;
    privateKey: string;
    appSlug?: string;
    webhookSecret?: string;
  };
};

@Injectable()
export class PluginRuntimeConfigService {
  constructor(private readonly configService: ConfigService) {}

  getGitHubPluginOptions(): GitHubPluginOptions {
    const appId = this.require('GITHUB_APP_ID');
    const privateKey = this.require('GITHUB_PRIVATE_KEY');
    const appSlug = this.require('GITHUB_APP_SLUG');
    const appInstallationUrl = this.githubAppInstallationUrl(appSlug);
    const webhookSecret = this.optional('GITHUB_WEBHOOK_SECRET');

    return {
      appInstallationUrl,
      app: {
        appId,
        privateKey,
        ...(appSlug ? { appSlug } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      },
    };
  }

  getGitHubWebhookSecret() {
    return this.require('GITHUB_WEBHOOK_SECRET');
  }

  private require(key: string) {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`Missing required plugin runtime config: ${key}`);
    }
    return value;
  }

  private optional(key: string) {
    return this.configService.get<string>(key) || undefined;
  }

  private githubAppInstallationUrl(appSlug: string) {
    const configured =
      this.optional('GITHUB_APP_INSTALLATION_URL') ??
      this.optional('GITHUB_SETUP_URL');
    if (configured?.includes('/installations/new')) {
      return configured;
    }
    return `https://github.com/apps/${appSlug}/installations/new`;
  }
}

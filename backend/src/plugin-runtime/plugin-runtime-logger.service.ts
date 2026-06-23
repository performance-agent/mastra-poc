import { Injectable, Logger } from '@nestjs/common';
import type { ConnectionSetupLogger } from '@pa/core';

@Injectable()
export class PluginRuntimeLoggerService implements ConnectionSetupLogger {
  private readonly logger = new Logger('PluginRuntime');

  info(message: string, details?: Record<string, unknown>) {
    this.logger.log(this.format(message, details));
  }

  warn(message: string, details?: Record<string, unknown>) {
    this.logger.warn(this.format(message, details));
  }

  error(message: string, details?: Record<string, unknown>) {
    this.logger.error(this.format(message, details));
  }

  private format(message: string, details?: Record<string, unknown>) {
    if (!details || Object.keys(details).length === 0) {
      return message;
    }
    return `${message} ${JSON.stringify(details)}`;
  }
}

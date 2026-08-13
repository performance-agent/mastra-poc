import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { validateSecretsEncryptionKey } from './plugins/configuration-crypto';
import { validateModelConfiguration } from './mastra/model-configuration';

async function bootstrap() {
  validateSecretsEncryptionKey();
  validateModelConfiguration();
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin:
      process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ??
      true,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe());
  const config = new DocumentBuilder()
    .setTitle('Performance Agent API')
    .setDescription('The performance agent API description')
    .setVersion('1.0')
    .addTag('performance-agent')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);
  app.setGlobalPrefix('api', {
    exclude: [
      {
        path: '.well-known/oauth-protected-resource',
        method: RequestMethod.GET,
      },
      {
        path: '.well-known/oauth-authorization-server',
        method: RequestMethod.GET,
      },
      { path: 'oauth/authorize', method: RequestMethod.GET },
      { path: 'oauth/token', method: RequestMethod.POST },
      { path: 'oauth/revoke', method: RequestMethod.POST },
      { path: 'oauth/register', method: RequestMethod.POST },
    ],
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

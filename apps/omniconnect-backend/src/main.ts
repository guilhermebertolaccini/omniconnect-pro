import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Habilitar raw body para webhooks
  });

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
  });

  app.use(cookieParser());

  // Compression
  app.use(compression());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      skipMissingProperties: false,
      skipNullProperties: false,
      skipUndefinedProperties: true, // Permitir undefined (útil para query params opcionais)
    }),
  );

  // Swagger/OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('NewVend API')
    .setDescription('API para gerenciamento de atendimento WhatsApp')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Autenticação')
    .addTag('users', 'Usuários')
    .addTag('conversations', 'Conversas')
    .addTag('lines', 'Linhas')
    .addTag('campaigns', 'Campanhas')
    .addTag('reports', 'Relatórios')
    .addTag('control-panel', 'Painel de Controle')
    .addTag('api-messages', 'API de Mensagens')
    .addServer(process.env.API_URL || 'http://localhost:3000', 'Servidor Principal')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // Global interceptor para charset UTF-8
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/') && res.getHeader('Content-Type')?.toString().includes('json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    next();
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
}

bootstrap();

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { MongoModule } from './db/mongo.module';
import { AuthModule } from './auth/auth.module';
import { OpaModule } from './opa/opa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    MongoModule,
    AuthModule,
    OpaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

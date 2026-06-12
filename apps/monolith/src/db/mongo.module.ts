import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const uri = configService.get<string>('MONGO_URI') || 'mongodb://localhost:27017/hybrid_auth';
        return { uri };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class MongoModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LoginAttempt, LoginAttemptSchema } from './schemas/attempt.schema';
import { OtpToken, OtpTokenSchema } from './schemas/otp.schema';
import * as fs from 'fs';
import * as path from 'path';

// Helper to load keys from multiple potential paths depending on execution mode (dev vs dist)
function loadKey(filename: string): string {
  const pathsToTry = [
    path.join(__dirname, '../config', filename),       // dev mode
    path.join(__dirname, '../../config', filename),    // dist mode
    path.resolve(process.cwd(), 'src/config', filename),
    path.resolve(process.cwd(), 'dist/config', filename),
  ];

  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }
  throw new Error(`JWT Key file ${filename} not found!`);
}

const privateKey = loadKey('jwt-private.pem');
const publicKey = loadKey('jwt-public.pem');

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      privateKey,
      publicKey,
      signOptions: {
        algorithm: 'RS256',
      },
    }),
    MongooseModule.forFeature([
      { name: LoginAttempt.name, schema: LoginAttemptSchema },
      { name: OtpToken.name, schema: OtpTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}

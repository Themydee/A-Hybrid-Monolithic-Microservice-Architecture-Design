import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as fs from 'fs';
import * as path from 'path';

// Helper to load keys from multiple potential paths depending on execution mode (dev vs dist)
function loadKey(filename: string): string {
  const pathsToTry = [
    path.join(__dirname, '../../config', filename),    // dev mode
    path.join(__dirname, '../../../config', filename),   // dist mode
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

const publicKey = loadKey('jwt-public.pem');

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      email: payload.email,
      roles: payload.roles || [],
      permissions: payload.permissions || [],
    };
  }
}

import { Injectable, Inject, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../db/db.module';
import * as dbSchema from '../db/schema/schema';
import { LoginAttempt, LoginAttemptDocument } from './schemas/attempt.schema';
import { OtpToken, OtpTokenDocument } from './schemas/otp.schema';
import { UserStatus, UserRole } from '@hybrid/shared';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly lockoutThreshold: number;
  private readonly lockoutDurationMinutes: number;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof dbSchema>,
    @InjectModel(LoginAttempt.name)
    private readonly attemptModel: Model<LoginAttemptDocument>,
    @InjectModel(OtpToken.name)
    private readonly otpModel: Model<OtpTokenDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.lockoutThreshold = this.configService.get<number>('LOCKOUT_THRESHOLD') || 5;
    this.lockoutDurationMinutes = this.configService.get<number>('LOCKOUT_DURATION_MINUTES') || 15;
  }

  // 1. REGISTER
  async register(dto: RegisterDto) {
    const { email, password } = dto;

    // Check if user exists
    const existing = await this.db
      .select()
      .from(dbSchema.users)
      .where(eq(dbSchema.users.email, email))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('Email is already registered');
    }

    // Hash password with cost factor 12 (NFR1 compliance)
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert user (defaults to PENDING status)
    const newUsers = await this.db
      .insert(dbSchema.users)
      .values({
        email,
        passwordHash,
        status: UserStatus.ACTIVE, // for dev experience, we seed as active
      })
      .returning();

    const user = newUsers[0];

    // Get standard USER role
    const userRolesList = await this.db
      .select()
      .from(dbSchema.roles)
      .where(eq(dbSchema.roles.name, UserRole.USER))
      .limit(1);

    const userRole = userRolesList[0];
    if (userRole) {
      await this.db.insert(dbSchema.userRoles).values({
        userId: user.id,
        roleId: userRole.id,
      });
    }

    return {
      message: 'User registered successfully',
      userId: user.id,
      email: user.email,
    };
  }

  // 2. LOGIN
  async login(dto: LoginDto, ipAddress: string, userAgent: string) {
    const { email, password } = dto;

    // Load user with roles and permissions in a single join query
    const result = await this.db
      .select({
        user: dbSchema.users,
        role: dbSchema.roles,
        permission: dbSchema.permissions,
      })
      .from(dbSchema.users)
      .leftJoin(dbSchema.userRoles, eq(dbSchema.users.id, dbSchema.userRoles.userId))
      .leftJoin(dbSchema.roles, eq(dbSchema.userRoles.roleId, dbSchema.roles.id))
      .leftJoin(dbSchema.rolePermissions, eq(dbSchema.roles.id, dbSchema.rolePermissions.roleId))
      .leftJoin(dbSchema.permissions, eq(dbSchema.rolePermissions.permissionId, dbSchema.permissions.id))
      .where(eq(dbSchema.users.email, email));

    const user = result[0]?.user;
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check Lockout
    if (user.status === UserStatus.LOCKED) {
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingMs = user.lockedUntil.getTime() - Date.now();
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        throw new UnauthorizedException(
          `Account is temporarily locked. Try again in ${remainingMinutes} minute(s).`,
        );
      } else {
        // Lockout expired, unlock user
        await this.db
          .update(dbSchema.users)
          .set({
            status: UserStatus.ACTIVE,
            failedLoginAttempts: 0,
            lockedUntil: null,
          })
          .where(eq(dbSchema.users.id, user.id));
        user.status = UserStatus.ACTIVE;
      }
    }

    // Verify Password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      await this.handleFailedLogin(user.id, email);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Successful login: Reset attempts
    await this.resetFailedAttempts(user.id, email);

    // Extract roles and permissions
    const rolesSet = new Set<string>();
    const permissionsSet = new Set<string>();
    for (const row of result) {
      if (row.role?.name) rolesSet.add(row.role.name);
      if (row.permission?.name) permissionsSet.add(row.permission.name);
    }
    const roles = Array.from(rolesSet);
    const permissions = Array.from(permissionsSet);

    // Generate tokens
    const tokens = await this.generateTokenPair(user.id, user.email, roles, permissions, ipAddress, userAgent);
    return tokens;
  }

  // 3. REFRESH TOKEN ROTATION
  async refresh(oldRefreshToken: string, ipAddress: string, userAgent: string) {
    const hash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');

    // Retrieve active session
    const activeSessions = await this.db
      .select({
        session: dbSchema.sessions,
        user: dbSchema.users,
      })
      .from(dbSchema.sessions)
      .innerJoin(dbSchema.users, eq(dbSchema.sessions.userId, dbSchema.users.id))
      .where(
        and(
          eq(dbSchema.sessions.refreshTokenHash, hash),
          eq(dbSchema.sessions.isRevoked, false),
          gt(dbSchema.sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const sessionData = activeSessions[0];
    if (!sessionData) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { session, user } = sessionData;

    // Revoke old session
    await this.db
      .update(dbSchema.sessions)
      .set({ isRevoked: true })
      .where(eq(dbSchema.sessions.id, session.id));

    // Fetch latest user roles and permissions
    const result = await this.db
      .select({
        role: dbSchema.roles,
        permission: dbSchema.permissions,
      })
      .from(dbSchema.users)
      .leftJoin(dbSchema.userRoles, eq(dbSchema.users.id, dbSchema.userRoles.userId))
      .leftJoin(dbSchema.roles, eq(dbSchema.userRoles.roleId, dbSchema.roles.id))
      .leftJoin(dbSchema.rolePermissions, eq(dbSchema.roles.id, dbSchema.rolePermissions.roleId))
      .leftJoin(dbSchema.permissions, eq(dbSchema.rolePermissions.permissionId, dbSchema.permissions.id))
      .where(eq(dbSchema.users.id, user.id));

    const rolesSet = new Set<string>();
    const permissionsSet = new Set<string>();
    for (const row of result) {
      if (row.role?.name) rolesSet.add(row.role.name);
      if (row.permission?.name) permissionsSet.add(row.permission.name);
    }

    const tokens = await this.generateTokenPair(
      user.id,
      user.email,
      Array.from(rolesSet),
      Array.from(permissionsSet),
      ipAddress,
      userAgent,
    );

    return tokens;
  }

  // 4. LOGOUT
  async logout(refreshToken: string) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await this.db
      .update(dbSchema.sessions)
      .set({ isRevoked: true })
      .where(eq(dbSchema.sessions.refreshTokenHash, hash));

    return { message: 'Logged out successfully' };
  }

  // 5. OTP ENDPOINTS
  async sendOtp(email: string) {
    // Check if user exists
    const existing = await this.db
      .select()
      .from(dbSchema.users)
      .where(eq(dbSchema.users.email, email))
      .limit(1);

    if (existing.length === 0) {
      throw new BadRequestException('User does not exist');
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store/Upsert in MongoDB
    await this.otpModel.findOneAndUpdate(
      { email },
      { code, createdAt: new Date() },
      { upsert: true, new: true },
    );

    // Output code to stdout for local development ease
    console.log(`[OTP] Generated OTP code for ${email}: ${code} (Expires in 5 minutes)`);

    return { message: 'OTP code sent' };
  }

  async verifyOtp(email: string, code: string) {
    const record = await this.otpModel.findOne({ email });
    if (!record || record.code !== code) {
      throw new UnauthorizedException('Invalid or expired OTP code');
    }

    // Consume OTP code
    await this.otpModel.deleteOne({ email });

    return { message: 'OTP verified successfully' };
  }

  // HELPERS
  private async handleFailedLogin(userId: string, email: string) {
    // 1. Increment in MongoDB (TTL 15 mins)
    const attempt = await this.attemptModel.findOneAndUpdate(
      { email },
      { $inc: { count: 1 }, lastAttemptAt: new Date() },
      { upsert: true, new: true },
    );

    // 2. Increment in PostgreSQL
    const postgresUser = await this.db
      .select()
      .from(dbSchema.users)
      .where(eq(dbSchema.users.id, userId))
      .limit(1);

    const newAttemptsCount = (postgresUser[0]?.failedLoginAttempts || 0) + 1;

    if (attempt.count >= this.lockoutThreshold || newAttemptsCount >= this.lockoutThreshold) {
      // Lock user in PostgreSQL
      const lockedUntil = new Date(Date.now() + this.lockoutDurationMinutes * 60 * 1000);
      await this.db
        .update(dbSchema.users)
        .set({
          status: UserStatus.LOCKED,
          failedLoginAttempts: newAttemptsCount,
          lockedUntil,
        })
        .where(eq(dbSchema.users.id, userId));
    } else {
      await this.db
        .update(dbSchema.users)
        .set({
          failedLoginAttempts: newAttemptsCount,
        })
        .where(eq(dbSchema.users.id, userId));
    }
  }

  private async resetFailedAttempts(userId: string, email: string) {
    // Reset in MongoDB
    await this.attemptModel.deleteOne({ email });

    // Reset in PostgreSQL
    await this.db
      .update(dbSchema.users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(dbSchema.users.id, userId));
  }

  private async generateTokenPair(
    userId: string,
    email: string,
    roles: string[],
    permissions: string[],
    ipAddress: string,
    userAgent: string,
  ) {
    // Payload matching JWT Claim shape for gateway & OPA verification
    const payload = {
      sub: userId,
      email,
      roles,
      permissions,
    };

    // Sign Access Token (uses the RS256 private key defined in JwtModule configuration)
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

    // Generate Refresh Token (secure random string)
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Save Refresh Token Hash in SQL sessions table
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Days
    await this.db.insert(dbSchema.sessions).values({
      userId,
      refreshTokenHash,
      expiresAt: sessionExpiresAt,
      ipAddress,
      userAgent,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes
    };
  }
}

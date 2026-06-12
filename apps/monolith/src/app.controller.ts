import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { OpaGuard } from './opa/opa.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard, OpaGuard)
  getProfile() {
    return { message: 'Access granted by OPA for profile' };
  }

  @Get('policies')
  @UseGuards(JwtAuthGuard, OpaGuard)
  getPolicies() {
    return { message: 'Access granted by OPA for policies (Admin/Auditor only)' };
  }

  @Get('users/profile')
  @UseGuards(JwtAuthGuard, OpaGuard)
  getUserProfile(@Req() req: any) {
    return { message: `Access granted by OPA for resource owner ID: ${req.user.userId}` };
  }
}

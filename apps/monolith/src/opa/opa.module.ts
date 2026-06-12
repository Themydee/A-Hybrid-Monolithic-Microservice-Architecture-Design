import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpaService } from './opa.service';
import { OpaGuard } from './opa.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [OpaService, OpaGuard],
  exports: [OpaService, OpaGuard],
})
export class OpaModule {}

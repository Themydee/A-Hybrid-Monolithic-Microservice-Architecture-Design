import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpaService {
  private readonly opaUrl: string;
  private readonly logger = new Logger(OpaService.name);

  constructor(private readonly configService: ConfigService) {
    this.opaUrl = this.configService.get<string>('OPA_URL') || 'http://localhost:8181';
  }

  async evaluate(policyPath: string, input: any): Promise<boolean> {
    const url = `${this.opaUrl}/v1/data/${policyPath}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        this.logger.error(`OPA query failed with status: ${response.status}`);
        return false;
      }

      const body = await response.json() as any;

      if (body && body.result !== undefined) {
        // Handle {"result": {"allow": true}} or {"result": true}
        if (body.result && typeof body.result === 'object' && body.result.allow !== undefined) {
          return !!body.result.allow;
        }
        return !!body.result;
      }
      return false;
    } catch (error) {
      this.logger.error(`Error querying OPA at ${url}:`, error);
      return false;
    }
  }
}

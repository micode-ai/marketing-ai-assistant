import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { encryptData, decryptData } from '../common/crypto.util';

interface CsePayload {
  type: 'CSE';
  apiKey: string;
  cseId: string;
}

@Injectable()
export class CseConfigService {
  private readonly logger = new Logger(CseConfigService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Upsert encrypted CSE credentials in ProjectApiKey (platform: GOOGLE_CSE).
   * Also clears any pre-existing lastValidationError on the row.
   */
  async saveCredentials(
    projectId: string,
    credentials: { apiKey: string; cseId: string },
  ): Promise<void> {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');

    const payload: CsePayload = {
      type: 'CSE',
      apiKey: credentials.apiKey,
      cseId: credentials.cseId,
    };

    const encryptedKey = encryptData(payload, encryptionKey);

    await this.prisma.projectApiKey.upsert({
      where: {
        projectId_platform: {
          projectId,
          platform: 'GOOGLE_CSE',
        },
      },
      create: {
        projectId,
        platform: 'GOOGLE_CSE',
        encryptedKey,
        scopes: [],
        lastValidationError: null,
      },
      update: {
        encryptedKey,
        lastValidationError: null,
      },
    });
  }

  /**
   * Returns { apiKey, cseId } (decrypted) or null when no row exists.
   */
  async getCredentials(
    projectId: string,
  ): Promise<{ apiKey: string; cseId: string } | null> {
    const record = await this.prisma.projectApiKey.findUnique({
      where: {
        projectId_platform: {
          projectId,
          platform: 'GOOGLE_CSE',
        },
      },
    });

    if (!record) {
      return null;
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const payload = decryptData(record.encryptedKey, encryptionKey) as CsePayload;

    return { apiKey: payload.apiKey, cseId: payload.cseId };
  }

  /**
   * UI-safe status:
   *   missing:  { configured: false, lastValidationError: null }
   *   present:  { configured: true, cseId, lastValidationError: string | null }
   * Never returns apiKey.
   */
  async getStatus(
    projectId: string,
  ): Promise<
    | { configured: false; lastValidationError: null }
    | { configured: true; cseId: string; lastValidationError: string | null }
  > {
    const record = await this.prisma.projectApiKey.findUnique({
      where: {
        projectId_platform: {
          projectId,
          platform: 'GOOGLE_CSE',
        },
      },
    });

    if (!record) {
      return { configured: false, lastValidationError: null };
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const payload = decryptData(record.encryptedKey, encryptionKey) as CsePayload;

    return {
      configured: true,
      cseId: payload.cseId,
      lastValidationError: record.lastValidationError ?? null,
    };
  }

  /**
   * Delete the ProjectApiKey row for GOOGLE_CSE.
   */
  async clearCredentials(projectId: string): Promise<void> {
    await this.prisma.projectApiKey.deleteMany({
      where: { projectId, platform: 'GOOGLE_CSE' },
    });
  }

  /**
   * Sets lastValidationError on the ProjectApiKey row (if it exists).
   * Silently ignores P2025 (record not found).
   */
  async markValidationError(projectId: string, errorCode: string): Promise<void> {
    try {
      await this.prisma.projectApiKey.update({
        where: {
          projectId_platform: { projectId, platform: 'GOOGLE_CSE' },
        },
        data: { lastValidationError: errorCode },
      });
    } catch (err: any) {
      if (err?.code !== 'P2025') {
        this.logger.warn(`markValidationError failed for project ${projectId}: ${err?.message}`);
      }
    }
  }

  /**
   * Clears lastValidationError on the ProjectApiKey row (if it exists).
   * Silently ignores P2025 (record not found).
   */
  async clearValidationError(projectId: string): Promise<void> {
    try {
      await this.prisma.projectApiKey.update({
        where: {
          projectId_platform: { projectId, platform: 'GOOGLE_CSE' },
        },
        data: { lastValidationError: null },
      });
    } catch (err: any) {
      if (err?.code !== 'P2025') {
        this.logger.warn(`clearValidationError failed for project ${projectId}: ${err?.message}`);
      }
    }
  }
}

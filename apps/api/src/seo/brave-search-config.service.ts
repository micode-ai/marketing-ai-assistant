import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { encryptData, decryptData } from '../common/crypto.util';

interface BraveSearchPayload {
  type: 'BRAVE_SEARCH';
  apiKey: string;
}

@Injectable()
export class BraveSearchConfigService {
  private readonly logger = new Logger(BraveSearchConfigService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Upsert encrypted Brave Search credentials in ProjectApiKey (platform: BRAVE_SEARCH).
   * Also clears any pre-existing lastValidationError on the row.
   */
  async saveCredentials(projectId: string, credentials: { apiKey: string }): Promise<void> {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');

    const payload: BraveSearchPayload = {
      type: 'BRAVE_SEARCH',
      apiKey: credentials.apiKey,
    };

    const encryptedKey = encryptData(payload, encryptionKey);

    await this.prisma.projectApiKey.upsert({
      where: {
        projectId_platform: {
          projectId,
          platform: 'BRAVE_SEARCH',
        },
      },
      create: {
        projectId,
        platform: 'BRAVE_SEARCH',
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
   * Returns { apiKey } (decrypted) or null when no row exists.
   */
  async getCredentials(projectId: string): Promise<{ apiKey: string } | null> {
    const record = await this.prisma.projectApiKey.findUnique({
      where: {
        projectId_platform: {
          projectId,
          platform: 'BRAVE_SEARCH',
        },
      },
    });

    if (!record) {
      return null;
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const payload = decryptData(record.encryptedKey, encryptionKey) as BraveSearchPayload;

    return { apiKey: payload.apiKey };
  }

  /**
   * UI-safe status:
   *   missing: { configured: false, lastValidationError: null }
   *   present: { configured: true, lastValidationError: string | null }
   * Never returns apiKey.
   */
  async getStatus(
    projectId: string,
  ): Promise<{ configured: false; lastValidationError: null } | { configured: true; lastValidationError: string | null }> {
    const record = await this.prisma.projectApiKey.findUnique({
      where: {
        projectId_platform: {
          projectId,
          platform: 'BRAVE_SEARCH',
        },
      },
    });

    if (!record) {
      return { configured: false, lastValidationError: null };
    }

    return {
      configured: true,
      lastValidationError: record.lastValidationError ?? null,
    };
  }

  /**
   * Delete the ProjectApiKey row for BRAVE_SEARCH.
   */
  async clearCredentials(projectId: string): Promise<void> {
    await this.prisma.projectApiKey.deleteMany({
      where: { projectId, platform: 'BRAVE_SEARCH' },
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
          projectId_platform: { projectId, platform: 'BRAVE_SEARCH' },
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
          projectId_platform: { projectId, platform: 'BRAVE_SEARCH' },
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

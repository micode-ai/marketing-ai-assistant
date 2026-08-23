import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SocialPlatform } from '@prisma/client';
import { CreateContentDto } from './create-content.dto';

/** Build a minimally valid payload, overridden per case. */
function dto(overrides: Record<string, unknown>) {
  return plainToInstance(CreateContentDto, {
    projectId: 'ckxyz',
    type: 'SOCIAL_POST',
    title: 'Launch',
    body: 'text',
    ...overrides,
  });
}

async function errorsFor(overrides: Record<string, unknown>) {
  return (await validate(dto(overrides))).map((e) => e.property);
}

describe('CreateContentDto platform validation', () => {
  // The hand-maintained list drifted twice (THREADS, then TIKTOK) and each
  // omission only surfaced as a validation error at publish time.
  it('accepts every platform the database knows about', async () => {
    for (const platform of Object.values(SocialPlatform)) {
      expect(await errorsFor({ platform })).not.toContain('platform');
      expect(await errorsFor({ platforms: [platform] })).not.toContain('platforms');
    }
  });

  it('accepts TIKTOK specifically', async () => {
    expect(await errorsFor({ platform: 'TIKTOK' })).not.toContain('platform');
    expect(await errorsFor({ platforms: ['TIKTOK', 'INSTAGRAM'] })).not.toContain('platforms');
  });

  it('rejects an unknown platform', async () => {
    expect(await errorsFor({ platform: 'MYSPACE' })).toContain('platform');
    expect(await errorsFor({ platforms: ['INSTAGRAM', 'MYSPACE'] })).toContain('platforms');
  });

  it('keeps both fields optional', async () => {
    const errors = await errorsFor({});
    expect(errors).not.toContain('platform');
    expect(errors).not.toContain('platforms');
  });
});

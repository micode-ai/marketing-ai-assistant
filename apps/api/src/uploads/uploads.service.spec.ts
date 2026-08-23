import { BadRequestException } from '@nestjs/common';
import { UploadsService, VIDEO_MAX_BYTES } from './uploads.service';

// fs module properties are non-configurable here, so jest.spyOn cannot patch
// them — replace the module wholesale instead.
jest.mock('fs');
import * as fs from 'fs';
const mockedFs = fs as jest.Mocked<typeof fs>;

/** Minimal stand-in for a multer file. */
function file(
  overrides: Partial<{ mimetype: string; size: number; originalname: string }> = {},
) {
  return {
    mimetype: 'video/mp4',
    size: 1024,
    originalname: 'clip.mp4',
    buffer: Buffer.from('bytes'),
    ...overrides,
  } as any;
}

describe('UploadsService', () => {
  let service: UploadsService;
  let written: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    written = [];
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.writeFileSync.mockImplementation(((p: any) => {
      written.push(String(p));
    }) as any);
    service = new UploadsService();
  });

  describe('saveVideo', () => {
    it('accepts mp4, mov and webm and serves them from the videos folder', async () => {
      // Distinctive base names: a UUID happens to contain single letters, so
      // "does not keep the caller's name" needs something recognisable.
      const cases = [
        ['video/mp4', 'promo-reel.mp4', '.mp4'],
        ['video/quicktime', 'teaser-cut.mov', '.mov'],
        ['video/webm', 'launch-clip.webm', '.webm'],
      ] as const;

      for (const [mimetype, originalname, ext] of cases) {
        const res = await service.saveVideo(file({ mimetype, originalname }));
        expect(res.url.startsWith('/api/uploads/videos/')).toBe(true);
        expect(res.url.endsWith(ext)).toBe(true);
        // The stored name is randomised, never the caller's.
        expect(res.filename).not.toContain(originalname.replace(ext, ''));
      }

      expect(written).toHaveLength(3);
      expect(written.every((p) => p.includes('videos'))).toBe(true);
    });

    it('rejects a non-video mime', async () => {
      await expect(
        service.saveVideo(file({ mimetype: 'image/png', originalname: 'x.png' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(written).toHaveLength(0);
    });

    it('rejects a file over the size cap', async () => {
      await expect(service.saveVideo(file({ size: VIDEO_MAX_BYTES + 1 }))).rejects.toThrow(
        /under 100MB/,
      );
    });

    it('rejects a missing file instead of throwing on undefined', async () => {
      await expect(service.saveVideo(undefined as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('saveFile', () => {
    it('still stores images under the images folder', async () => {
      const res = await service.saveFile(
        file({ mimetype: 'image/png', originalname: 'p.png' }),
      );
      expect(res.url.startsWith('/api/uploads/images/')).toBe(true);
      expect(written[0]).toContain('images');
    });

    it('rejects a video sent to the image endpoint', async () => {
      await expect(service.saveFile(file())).rejects.toThrow(/jpeg, png, webp/);
    });

    it('keeps the 5MB image cap', async () => {
      await expect(
        service.saveFile(
          file({ mimetype: 'image/png', originalname: 'p.png', size: 6 * 1024 * 1024 }),
        ),
      ).rejects.toThrow(/under 5MB/);
    });
  });
});

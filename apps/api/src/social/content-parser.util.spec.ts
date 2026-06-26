import { resolvePublishMedia } from './content-parser.util';

describe('resolvePublishMedia', () => {
  const base = 'https://app.example.com';

  it('extracts body images and resolves relative URLs to absolute', () => {
    const content = { body: 'Hello ![a](/uploads/images/a.png) world', mediaUrls: [] };
    const { images, videos } = resolvePublishMedia(content, base);
    expect(images).toEqual(['https://app.example.com/uploads/images/a.png']);
    expect(videos).toEqual([]);
  });

  it('treats mediaUrls ending in video extensions as videos', () => {
    const content = { body: 'caption', mediaUrls: ['/uploads/videos/reel.mp4', 'https://cdn.test/clip.MOV'] };
    const { images, videos } = resolvePublishMedia(content, base);
    expect(videos).toEqual(['https://app.example.com/uploads/videos/reel.mp4', 'https://cdn.test/clip.MOV']);
    expect(images).toEqual([]);
  });

  it('includes non-video mediaUrls as images without duplicating body images', () => {
    const content = { body: '![a](https://cdn/a.png)', mediaUrls: ['https://cdn/a.png', 'https://cdn/b.jpg'] };
    const { images } = resolvePublishMedia(content, base);
    expect(images).toEqual(['https://cdn/a.png', 'https://cdn/b.jpg']);
  });
});

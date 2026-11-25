import { BadRequestException } from '@nestjs/common';
import { assertPublicHost, assertPublicUrl, isNonPublicAddress } from './ssrf.util';

describe('isNonPublicAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.19.0.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])(
    'blocks %s',
    (ip) => expect(isNonPublicAddress(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '134.122.173.40', '2606:4700::1111'])('allows %s', (ip) => expect(isNonPublicAddress(ip)).toBe(false));
});

describe('assertPublicHost / assertPublicUrl', () => {
  it('refuses localhost names and literal private IPs', async () => {
    await expect(assertPublicHost('localhost')).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertPublicHost('172.19.0.4')).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertPublicUrl('http://[::1]:8080/')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuses non-http schemes', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertPublicUrl('gopher://example.com')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts a literal public IP', async () => {
    await expect(assertPublicHost('8.8.8.8')).resolves.toBeUndefined();
  });
});

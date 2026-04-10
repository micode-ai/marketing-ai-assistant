import * as crypto from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';

export function getEncryptionKey(raw: string): Buffer {
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new InternalServerErrorException(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return key;
}

export function encryptData(data: object, encryptionKeyHex: string): string {
  const key = getEncryptionKey(encryptionKeyHex);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptData(encrypted: string, encryptionKeyHex: string): any {
  const key = getEncryptionKey(encryptionKeyHex);
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data!, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

import type { User } from '@marketing-ai/shared-types';

declare global {
  namespace App {
    interface Locals {
      user: User | null;
    }
    interface PageData {
      user?: User | null;
    }
  }
}

export {};

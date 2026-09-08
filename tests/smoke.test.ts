import { describe, it, expect } from 'vitest';
import { user } from '@/db/schema';

describe('vitest setup', () => {
  it('runs tests and verifies assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('resolves @/ path aliases correctly', () => {
    expect(user).toBeDefined();
  });
});

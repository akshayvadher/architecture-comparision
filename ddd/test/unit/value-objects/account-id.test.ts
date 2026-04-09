import { describe, expect, it } from 'vitest';
import { InvalidIdError } from '../../../src/domain/errors/domain-errors';
import { AccountId } from '../../../src/domain/value-objects/account-id';

describe('AccountId value object', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('wraps a valid UUID string', () => {
    const id = AccountId.create(VALID_UUID);

    expect(id.value).toBe(VALID_UUID);
  });

  it('rejects a non-UUID string', () => {
    expect(() => AccountId.create('not-a-uuid')).toThrow(InvalidIdError);
  });

  it('rejects an empty string', () => {
    expect(() => AccountId.create('')).toThrow(InvalidIdError);
  });

  it('rejects a UUID missing a section', () => {
    expect(() => AccountId.create('550e8400-e29b-41d4-a716')).toThrow(
      InvalidIdError,
    );
  });

  it('two AccountIds with the same UUID are equal', () => {
    const id1 = AccountId.create(VALID_UUID);
    const id2 = AccountId.create(VALID_UUID);

    expect(id1.equals(id2)).toBe(true);
  });

  it('two AccountIds with different UUIDs are not equal', () => {
    const id1 = AccountId.create('550e8400-e29b-41d4-a716-446655440000');
    const id2 = AccountId.create('660e8400-e29b-41d4-a716-446655440000');

    expect(id1.equals(id2)).toBe(false);
  });

  it('accepts uppercase hex digits in UUID', () => {
    const id = AccountId.create('550E8400-E29B-41D4-A716-446655440000');

    expect(id.value).toBe('550E8400-E29B-41D4-A716-446655440000');
  });
});

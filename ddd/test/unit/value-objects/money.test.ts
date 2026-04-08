import { describe, it, expect } from 'vitest';
import { Money } from '../../../src/domain/value-objects/money';
import { InvalidBalanceError } from '../../../src/domain/errors/domain-errors';

describe('Money value object', () => {
  it('wraps a positive numeric amount', () => {
    const money = Money.create(100);

    expect(money.value).toBe(100);
  });

  it('wraps zero as a valid amount', () => {
    const money = Money.create(0);

    expect(money.value).toBe(0);
  });

  it('rejects a negative amount', () => {
    expect(() => Money.create(-1)).toThrow(InvalidBalanceError);
  });

  it('rejects a large negative amount', () => {
    expect(() => Money.create(-1000)).toThrow(InvalidBalanceError);
  });

  describe('add', () => {
    it('returns a new Money with the sum of both amounts', () => {
      const a = Money.create(100);
      const b = Money.create(50);

      const result = a.add(b);

      expect(result.value).toBe(150);
    });

    it('does not mutate the original Money instances', () => {
      const a = Money.create(100);
      const b = Money.create(50);

      a.add(b);

      expect(a.value).toBe(100);
      expect(b.value).toBe(50);
    });
  });

  describe('subtract', () => {
    it('returns a new Money with the difference when sufficient', () => {
      const a = Money.create(100);
      const b = Money.create(30);

      const result = a.subtract(b);

      expect(result.value).toBe(70);
    });

    it('returns zero Money when subtracting equal amounts', () => {
      const a = Money.create(50);
      const b = Money.create(50);

      const result = a.subtract(b);

      expect(result.value).toBe(0);
    });

    it('throws when subtraction would produce a negative result', () => {
      const a = Money.create(30);
      const b = Money.create(50);

      expect(() => a.subtract(b)).toThrow(InvalidBalanceError);
    });

    it('does not mutate the original Money instances', () => {
      const a = Money.create(100);
      const b = Money.create(30);

      a.subtract(b);

      expect(a.value).toBe(100);
      expect(b.value).toBe(30);
    });
  });

  describe('equality', () => {
    it('two Money with the same amount are equal', () => {
      const a = Money.create(100);
      const b = Money.create(100);

      expect(a.equals(b)).toBe(true);
    });

    it('two Money with different amounts are not equal', () => {
      const a = Money.create(100);
      const b = Money.create(200);

      expect(a.equals(b)).toBe(false);
    });
  });

  describe('isGreaterThanOrEqual', () => {
    it('returns true when amount is greater', () => {
      const a = Money.create(100);
      const b = Money.create(50);

      expect(a.isGreaterThanOrEqual(b)).toBe(true);
    });

    it('returns true when amounts are equal', () => {
      const a = Money.create(100);
      const b = Money.create(100);

      expect(a.isGreaterThanOrEqual(b)).toBe(true);
    });

    it('returns false when amount is less', () => {
      const a = Money.create(50);
      const b = Money.create(100);

      expect(a.isGreaterThanOrEqual(b)).toBe(false);
    });
  });
});

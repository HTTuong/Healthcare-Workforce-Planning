import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ParseIdPipe } from './parse-id.pipe.js';

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();

  it('turns a valid id into a number', () => {
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('2147483647')).toBe(2147483647);
  });

  it('rejects an id that does not fit in a database integer (F-02)', () => {
    expect(() => pipe.transform('2147483648')).toThrow(BadRequestException);
    expect(() => pipe.transform('99999999999')).toThrow(BadRequestException);
  });

  it('rejects zero, negative numbers and anything that is not plain digits', () => {
    for (const value of ['0', '-1', '1e3', ' 1', '1.0', 'abc', '']) {
      expect(() => pipe.transform(value), value).toThrow(BadRequestException);
    }
  });

  it('allows a missing value only when it is optional', () => {
    expect(new ParseIdPipe({ optional: true }).transform(undefined)).toBeUndefined();
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});

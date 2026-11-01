import { BadRequestException, Injectable, Optional, type PipeTransform } from '@nestjs/common';
import { MAX_INT32 } from './parse.js';

export interface ParseIdOptions {
  optional?: boolean;
}

// Turns a path or query value into a database id from 1 to 2147483647.
// ParseIntPipe accepted larger numbers, which then made Prisma fail with 500 (F-02).
@Injectable()
export class ParseIdPipe implements PipeTransform<string | undefined, number | undefined> {
  constructor(@Optional() private readonly options: ParseIdOptions = {}) {}

  transform(value: string | undefined): number | undefined {
    if (value === undefined && this.options.optional) return undefined;
    if (typeof value !== 'string' || !/^\d{1,10}$/.test(value)) {
      throw new BadRequestException('Expected a positive integer id');
    }
    const id = Number(value);
    if (id < 1 || id > MAX_INT32) throw new BadRequestException(`Expected an id between 1 and ${MAX_INT32}`);
    return id;
  }
}

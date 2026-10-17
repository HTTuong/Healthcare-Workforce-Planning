import { NotFoundException } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';

describe('DepartmentsService', () => {
  it('throws NotFoundException for an unknown id', () => {
    const service = new DepartmentsService();
    expect(() => service.findOne(99)).toThrow(NotFoundException);
  });

  it('gives each new department its own id', () => {
    const service = new DepartmentsService();
    const first = service.create('ER', 'Emergency');
    const second = service.create('ICU', 'Intensive Care');
    expect(second.id).not.toBe(first.id);
  });
});

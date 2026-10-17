import { Test } from '@nestjs/testing';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';

describe('DepartmentsController', () => {
  it('returns the departments provided by the service', async () => {
    // Replace the real service with a fake one through dependency injection.
    const fakeService = {
      findAll: vi.fn().mockResolvedValue([{ id: 1, code: 'ER', name: 'Emergency' }]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [DepartmentsController],
      providers: [{ provide: DepartmentsService, useValue: fakeService }],
    }).compile();

    const controller = moduleRef.get(DepartmentsController);

    expect(await controller.findAll()).toEqual([{ id: 1, code: 'ER', name: 'Emergency' }]);
    expect(fakeService.findAll).toHaveBeenCalledTimes(1);
  });
});

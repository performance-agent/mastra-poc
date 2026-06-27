jest.mock('./data-types.service', () => ({
  DataTypesService: class DataTypesService {},
}));

import { DataTypesController } from './data-types.controller';
import { DataTypesService } from './data-types.service';

describe('DataTypesController', () => {
  const service = {
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  let controller: DataTypesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DataTypesController(
      service as unknown as DataTypesService,
    );
  });

  it('forwards reads to the service', async () => {
    service.findOne.mockResolvedValue({ id: 'data-type-1' });
    await expect(controller.findOne('data-type-1')).resolves.toEqual({
      id: 'data-type-1',
    });
    expect(service.findOne).toHaveBeenCalledWith('data-type-1');
  });

  it('forwards updates to the service', async () => {
    const update = { name: 'Updated' };
    await controller.update('data-type-1', update);
    expect(service.update).toHaveBeenCalledWith('data-type-1', update);
  });

  it('forwards deletion to the service', async () => {
    await controller.remove('data-type-1');
    expect(service.remove).toHaveBeenCalledWith('data-type-1');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { DataTypesController } from './data-types.controller';
import { DataTypesService } from './data-types.service';

describe('DataTypesController', () => {
  let controller: DataTypesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataTypesController],
      providers: [DataTypesService],
    }).compile();

    controller = module.get<DataTypesController>(DataTypesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

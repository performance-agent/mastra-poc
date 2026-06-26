import { Test, TestingModule } from '@nestjs/testing';
import { DataTypesService } from './data-types.service';

describe('DataTypesService', () => {
  let service: DataTypesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataTypesService],
    }).compile();

    service = module.get<DataTypesService>(DataTypesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

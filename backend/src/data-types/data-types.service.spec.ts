jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { BadRequestException } from '@nestjs/common';
import { DataTypesService } from './data-types.service';

describe('DataTypesService', () => {
  const prismaService = {
    dataType: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  let service: DataTypesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DataTypesService(prismaService as any);
  });

  it('creates an organization data type with a valid Draft 2020-12 schema', async () => {
    const schema = {
      type: 'object',
      properties: { score: { type: 'number' } },
      required: ['score'],
      additionalProperties: false,
    };
    prismaService.dataType.create.mockResolvedValue({ id: 'data-type-1' });

    await service.create('organization-1', {
      name: 'Performance score',
      schema,
    });

    expect(prismaService.dataType.create).toHaveBeenCalledWith({
      data: {
        name: 'Performance score',
        schema,
        organization: { connect: { id: 'organization-1' } },
      },
    });
  });

  it('rejects an invalid JSON Schema before writing', () => {
    expect(() =>
      service.create('organization-1', {
        name: 'Invalid',
        schema: { type: 'not-a-json-schema-type' },
      }),
    ).toThrow(BadRequestException);
    expect(prismaService.dataType.create).not.toHaveBeenCalled();
  });

  it('lists only data types from the requested organization', async () => {
    await service.findAll('organization-1');

    expect(prismaService.dataType.findMany).toHaveBeenCalledWith({
      where: { organization: { id: 'organization-1' } },
    });
  });
});

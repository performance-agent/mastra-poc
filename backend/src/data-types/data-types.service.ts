import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateDataTypeDto } from './dto/create-data-type.dto';
import { UpdateDataTypeDto } from './dto/update-data-type.dto';
import { PrismaService } from '../prisma/prisma.service';
import Ajv2020 from 'ajv/dist/2020';

@Injectable()
export class DataTypesService {
  private readonly ajv = new Ajv2020({ strict: false, allErrors: true });

  constructor(private readonly prismaService: PrismaService) {}

  create(organizationId: string, createDataTypeDto: CreateDataTypeDto) {
    const schema = this.validateJsonSchema(createDataTypeDto.schema);

    const dataType = this.prismaService.dataType.create({
      data: {
        ...createDataTypeDto,
        schema,
        organization: {
          connect: { id: organizationId },
        },
      },
    });
    return dataType;
  }

  findAll(organizationId: string) {
    return this.prismaService.dataType.findMany({
      where: {
        organization: {
          id: organizationId,
        },
      },
    });
  }

  findOne(id: string) {
    return this.prismaService.dataType.findUnique({
      where: { id },
    });
  }

  update(id: string, updateDataTypeDto: UpdateDataTypeDto) {
    const schema = updateDataTypeDto.schema
      ? this.validateJsonSchema(updateDataTypeDto.schema)
      : undefined;

    return this.prismaService.dataType.update({
      where: { id },
      data: {
        ...updateDataTypeDto,
        schema,
      },
    });
  }

  remove(id: string) {
    return this.prismaService.dataType.delete({
      where: { id },
    });
  }

  private validateJsonSchema(schema: Record<string, unknown>): object {
    const isValidJsonSchema = this.ajv.validateSchema(schema);

    if (!isValidJsonSchema) {
      throw new BadRequestException({
        message: 'Invalid JSON Schema',
        errors: this.ajv.errors,
      });
    }

    return schema;
  }
}

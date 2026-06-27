import { Controller, Get, Body, Patch, Param, Delete } from '@nestjs/common';
import { DataTypesService } from './data-types.service';
import { UpdateDataTypeDto } from './dto/update-data-type.dto';
import { RequireMembership } from '../access-control/require-membership.decorator';

@Controller('data-types')
export class DataTypesController {
  constructor(private readonly dataTypesService: DataTypesService) {}

  @RequireMembership({
    resource: 'dataType',
    param: 'id',
    roles: ['OWNER', 'ADMIN', 'VIEWER'],
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dataTypesService.findOne(id);
  }

  @RequireMembership({
    resource: 'dataType',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDataTypeDto: UpdateDataTypeDto,
  ) {
    return this.dataTypesService.update(id, updateDataTypeDto);
  }

  @RequireMembership({
    resource: 'dataType',
    param: 'id',
    roles: ['OWNER', 'ADMIN'],
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.dataTypesService.remove(id);
  }
}

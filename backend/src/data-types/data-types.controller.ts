import { Controller, Get, Body, Patch, Param, Delete } from '@nestjs/common';
import { DataTypesService } from './data-types.service';
import { UpdateDataTypeDto } from './dto/update-data-type.dto';

@Controller('data-types')
export class DataTypesController {
  constructor(private readonly dataTypesService: DataTypesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dataTypesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDataTypeDto: UpdateDataTypeDto,
  ) {
    return this.dataTypesService.update(id, updateDataTypeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.dataTypesService.remove(id);
  }
}

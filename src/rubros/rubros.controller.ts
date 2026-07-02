import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { RubrosService } from './rubros.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';
import { SetRubrosDto } from './dto/set-rubros.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rubros')
export class RubrosController {
  constructor(private service: RubrosService) {}

  // Cualquier usuario autenticado lo lee (lo necesita el form de alta de cliente).
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // Solo el admin edita la lista, desde la página de configuración.
  @Roles(UserRole.ADMIN)
  @Put()
  setAll(@Body() dto: SetRubrosDto) {
    return this.service.setAll(dto.names);
  }
}

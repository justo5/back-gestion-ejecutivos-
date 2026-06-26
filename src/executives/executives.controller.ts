import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ExecutivesService } from './executives.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ImportExecutivesDto } from './dto/import-executives.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('executives')
export class ExecutivesController {
  constructor(private service: ExecutivesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAllForUser(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOneForUser(id, user);
  }

  @Roles(UserRole.ADMIN)
  @Post('import')
  import(@Body() dto: ImportExecutivesDto) {
    return this.service.importAll(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/image')
  updateImage(@Param('id') id: string, @Body('imageUrl') imageUrl: string) {
    return this.service.updateImage(id, imageUrl);
  }
}

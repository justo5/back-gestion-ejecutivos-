import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  @Roles(UserRole.ADMIN)
  @Get()
  async findAll() {
    const users = await this.repo.find({ relations: ['executive'] });
    return users.map(({ passwordHash, ...rest }) => rest);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  async create(@Body() dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.repo.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role,
      executiveId: dto.role === UserRole.EJECUTIVO ? dto.executiveId ?? null : null,
    });
    const saved = await this.repo.save(user);
    const { passwordHash: _, ...rest } = saved;
    return rest;
  }
}

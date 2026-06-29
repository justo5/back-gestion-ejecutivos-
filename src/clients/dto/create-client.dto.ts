import { IsBoolean, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateClientDto {
  // Only used (and required) when the caller is an admin creating a client
  // on behalf of an executive. Ignored for ejecutivo callers, who can only
  // ever create clients under their own executiveId.
  @IsOptional()
  @IsString()
  executiveId?: string;

  @IsString()
  name: string;

  @IsBoolean()
  active: boolean;

  @IsOptional()
  @IsInt()
  contactDay?: number | null;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

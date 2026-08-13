import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { MembershipRole } from '../../../generated/prisma/enums';

export class CreateInvitationDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsEnum(MembershipRole)
  role!: MembershipRole;
}

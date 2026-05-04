import { IsEnum, IsNotEmpty } from 'class-validator';
import { MembershipRole } from '../../../generated/prisma/enums';

export class SetMemberDto {
  @IsNotEmpty()
  @IsEnum(MembershipRole)
  role!: MembershipRole;
}

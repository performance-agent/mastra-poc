export class CreateUserDto {
  name!: string;
  email!: string;
  firebaseUid!: string;
  photoUrl?: string;
}

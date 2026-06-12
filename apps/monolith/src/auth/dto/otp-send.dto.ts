import { IsEmail, IsNotEmpty } from 'class-validator';

export class OtpSendDto {
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}

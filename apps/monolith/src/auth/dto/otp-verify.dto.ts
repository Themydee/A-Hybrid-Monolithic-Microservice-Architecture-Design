import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class OtpVerifyDto {
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsNotEmpty({ message: 'OTP code is required' })
  @Length(6, 6, { message: 'OTP code must be exactly 6 characters' })
  code: string;
}

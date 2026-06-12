import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class LoginAttempt extends Document {
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true, default: 0 })
  count: number;

  @Prop({ type: Date, default: Date.now, expires: 900 }) // 900 seconds = 15 minutes
  lastAttemptAt: Date;
}

export const LoginAttemptSchema = SchemaFactory.createForClass(LoginAttempt);
export type LoginAttemptDocument = LoginAttempt & Document;

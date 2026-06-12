import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class OtpToken extends Document {
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  code: string;

  @Prop({ type: Date, default: Date.now, expires: 300 }) // 300 seconds = 5 minutes
  createdAt: Date;
}

export const OtpTokenSchema = SchemaFactory.createForClass(OtpToken);
export type OtpTokenDocument = OtpToken & Document;

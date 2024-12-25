import mongoose, { Document, Schema } from 'mongoose';

// Define the IMessage interface extending Document
export interface IMessage extends Document {
  uid: string;
  role: 'user' | 'admin' | 'consult';
  name: string;
  room: string;
  message: string;
  type: string;
  filename?: string;
  timestamp: Date;
}

// Define the schema
const messageSchema: Schema = new Schema({
  uid: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'consultant'], required: true },
  name: { type: String, required: true },
  room: { type: String, required: true },
  message: { type: String, required: true },
  type: {type: String},
  filename: {type: String},
  timestamp: { type: Date, default: Date.now },
});

// Export the model
const Message = mongoose.model<IMessage>('Message', messageSchema);
export default Message;

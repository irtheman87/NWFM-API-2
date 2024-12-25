import mongoose, { Document, Schema } from 'mongoose';

// Define the Time type
type Time = {
  hours: number;
  minutes: number;
  seconds: number;
};

// Define the IAvailability interface extending Document
export interface IAvailability extends Document {
  cid: mongoose.Schema.Types.ObjectId;
  otime: Time;
  ctime: Time;
  expertise: string[]; // Updated to string array
  status: 'open' | 'close';
  day: string; // To hold the day of the week, e.g., "Monday", "Tuesday"
}

// Define the schema
const AvailabilitySchema: Schema = new Schema({
  cid: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Consultant' },
  otime: {
    hours: { type: Number, required: true },
    minutes: { type: Number, required: true },
    seconds: { type: Number, required: true },
  },
  ctime: {
    hours: { type: Number, required: true },
    minutes: { type: Number, required: true },
    seconds: { type: Number, required: true },
  },
  day: { type: String, required: true }, // Example values: "Monday", "Tuesday"
  status: { type: String, enum: ['open', 'close'], required: true },
  expertise: { type: [String], required: true }, // Updated to an array of strings
});

// Export the model
const AvailabilityModel = mongoose.model<IAvailability>('Availability', AvailabilitySchema);
export default AvailabilityModel;

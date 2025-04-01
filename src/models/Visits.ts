import mongoose, { Document, Schema } from "mongoose";

// Define interface for TypeScript
export interface IVisitor extends Document {
  ip: string;
  visits: {
    page: string;
    date: Date;
  }[];
}

// Define Schema
const VisitorSchema = new Schema<IVisitor>(
  {
    ip: { type: String, required: true, unique: true }, // Unique IP addresses
    visits: [
      {
        page: { type: String, required: true }, // Page route visited
        date: { type: Date, default: Date.now }, // Date of visit (defaults to current date)
      },
    ],
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt
);

// Create Mongoose Model
const Visitor = mongoose.model<IVisitor>("Visitor", VisitorSchema);

export default Visitor;

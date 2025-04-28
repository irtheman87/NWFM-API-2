import mongoose, { Schema, Document } from "mongoose";

// Interface for QuizMeta
export interface QuizMeta extends Document {
  name: string;
  type: string;
  description?: string;
  category: string;
  durationInSeconds: number;
}

const QuizMetaSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    description: { type: String },
    category: { type: String, required: true },
    durationInSeconds: { type: Number, required: true }, // Changed to seconds
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<QuizMeta>("QuizMeta", QuizMetaSchema);
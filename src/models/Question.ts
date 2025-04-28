import mongoose, { Schema, Document } from "mongoose";

interface Question extends Document {
  quizMetaId: mongoose.Types.ObjectId; // Reference to QuizMeta
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: "A" | "B" | "C" | "D";
  period?: number; // Optional field
}

const QuestionSchema: Schema = new Schema(
  {
    quizMetaId: { type: Schema.Types.ObjectId, ref: "QuizMeta", required: true },
    questionText: { type: String, required: true },
    options: {
      A: { type: String, required: true },
      B: { type: String, required: true },
      C: { type: String, required: true },
      D: { type: String, required: true },
    },
    correctAnswer: { type: String, enum: ["A", "B", "C", "D"], required: true },
    period: { type: Number }, // optional
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<Question>("Question", QuestionSchema);
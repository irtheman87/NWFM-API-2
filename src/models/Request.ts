import mongoose, { Document, Schema } from 'mongoose';

type Time = {
  hours: number;
  minutes: number;
  seconds: number;
};

export interface IRequest extends Document {
  movie_title?: string;
  synopsis?: string;
  stattusof?: string;
  type?: string;
  nameofservice?: string;
  genre?: string;
  platform?: string;
  script?: string;
  concerns?: string;
  link?: string;
  socialTarget?: string;
  oohTarget?: string;
  budget?: number;
  budgetMin?: number;
  budgetMax?: number;
  actors?: string;
  crew?: string;
  visualStyle?: string;
  info?: string;
  noCr?: boolean;
  productionCompany?: string;
  contactInfo?: string;
  days?: string;
  orderId: string;
  time?: Time;
  date: Date;
  createdAt?: Date;
  chat_title?: string;
  summary?: string;
  consultant: string;
  userId: string;
  expertise: string;
  files?: string[];
  budgetrange?: string;
  day?: string;
  filename?: string;
  booktime?: string; // Changed from `Timestamp` to `Date`
  endTime?: string;
  cid?: string;
}

const timeSchema = new Schema<Time>({
  hours: { type: Number },
  minutes: { type: Number },
  seconds: { type: Number },
});

const requestSchema = new Schema<IRequest>(
  {
    movie_title: { type: String },
    synopsis: { type: String },
    stattusof: { type: String },
    type: { type: String },
    nameofservice: { type: String },
    genre: { type: String },
    platform: { type: String },
    script: { type: String },
    concerns: { type: String },
    link: { type: String },
    socialTarget: { type: String },
    oohTarget: { type: String },
    budget: { type: Number },
    budgetMin: { type: Number },
    budgetMax: { type: Number },
    actors: { type: String },
    crew: { type: String },
    visualStyle: { type: String },
    info: { type: String },
    noCr: { type: Boolean },
    productionCompany: { type: String },
    contactInfo: { type: String },
    days: { type: String },
    orderId: { type: String, required: true },
    time: timeSchema,
    date: { type: Date, required: true, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    chat_title: { type: String },
    summary: { type: String },
    consultant: { type: String },
    userId: { type: String },
    expertise: { type: String },
    files: { type: [String] },
    budgetrange: { type: String },
    day: { type: String },
    filename: { type: String },
    booktime: { type: String }, // Corrected here
    endTime: { type: String }, // Corrected here
    cid: {type: String},
  },
  { timestamps: true }
);

const RequestModel = mongoose.model<IRequest>('Request', requestSchema);
export default RequestModel;

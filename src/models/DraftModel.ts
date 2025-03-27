import mongoose, { Document, Schema } from "mongoose";

type Time = {
  hours: number;
  minutes: number;
  seconds: number;
};

type KeyCharacter = {
  character: string;
  actor: string;
};

type KeyCrew = {
  crew: string;
  role: string;
};

type TeamMember = {
  name: string;
  bio: string;
};

type StartPop = {
  date: string;
};

type CharacterLockDate = {
  date: string[];
  name: string;
};

type LocationLockedDate = {
  date: string[];
  name: string;
};

export interface IDraft extends Document {
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
  links?: string[];
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
  booktime?: string;
  endTime?: string;
  cid?: string;
  showtype?: string;
  episodes?: number;
  loginline?: string;
  keycharacters?: KeyCharacter[];
  keycrew?: KeyCrew[];
  teamMembers?: TeamMember[];
  estimatedBudget?: string;
  putinfestivals?: string;
  fundingtype?: string;
  revprojection?: string;
  stage?: string;
  shootdays?: number;
  startpop?: StartPop[];
  characterlockdate?: CharacterLockDate[];
  locationlockeddate?: LocationLockedDate[];
  characterbible?: string;
  keyArtCreated?: string[];
  continued?: boolean;
  continueCount?: number;
  usebooktimed?: string;
  useendTimed?: string;
}

const timeSchema = new Schema<Time>({
  hours: { type: Number },
  minutes: { type: Number },
  seconds: { type: Number },
});

const keyCharacterSchema = new Schema<KeyCharacter>({
  character: { type: String, required: true },
  actor: { type: String, required: true },
});

const keyCrewSchema = new Schema<KeyCrew>({
  crew: { type: String, required: true },
  role: { type: String, required: true },
});

const teamMemberSchema = new Schema<TeamMember>({
  name: { type: String, required: true },
  bio: { type: String, required: true },
});

const startpopSchema = new Schema<StartPop>({
  date: { type: String, required: true },
});

const characterlockdateSchema = new Schema<CharacterLockDate>({
  date: [{ type: String, required: true }],
  name: { type: String, required: true },
});

const locationlockeddateSchema = new Schema<LocationLockedDate>({
  date: [{ type: String, required: true }],
  name: { type: String, required: true },
});

const draftSchema = new Schema<IDraft>(
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
    links: { type: [String], default: [] },
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
    booktime: { type: String },
    endTime: { type: String },
    cid: { type: String },
    showtype: { type: String },
    episodes: { type: Number },
    loginline: { type: String },
    keycharacters: { type: [keyCharacterSchema], default: [] },
    keycrew: { type: [keyCrewSchema], default: [] },
    teamMembers: { type: [teamMemberSchema], default: [] },
    estimatedBudget: { type: String },
    putinfestivals: { type: String },
    fundingtype: { type: String },
    revprojection: { type: String },
    stage: { type: String },
    shootdays: { type: Number },
    startpop: { type: [startpopSchema], default: [] },
    characterlockdate: { type: [characterlockdateSchema], default: [] },
    locationlockeddate: { type: [locationlockeddateSchema], default: [] },
    characterbible: { type: String },
    keyArtCreated: { type: [String] },
    continued: { type: Boolean },
    continueCount: { type: Number },
    usebooktimed: { type: String },
    useendTimed: { type: String },
  },
  { timestamps: true }
);

const DraftModel = mongoose.model<IDraft>("Draft", draftSchema);
export default DraftModel;

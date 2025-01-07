import mongoose, { Schema, Document } from "mongoose";

interface Work {
    title: string;
    role: string;
    link?: string; // Optional: link to work
    year: number; // Year of the work
}

interface Location {
    address: string;
    city: string;
    state: string;
    country: string;
}

interface Crew extends Document {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    dob: Date;
    bio?: string;
    propic?: string;
    department: string;
    role: string[];
    works: Work[];
    fee: string;
    location: Location;
    verificationDocType: string;
    document?: string;
    idNumber: string;
}

const CrewSchema: Schema = new Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true },
    dob: { type: Date, required: true },
    bio: { type: String },
    propic: { type: String },
    department: { type: String, required: true },
    role: { type: [String], required: true },
    works: [
        {
            title: { type: String},
            role: { type: String },
            link: { type: String },
            year: { type: Number },
        },
    ],
    fee: { type: String},
    location: {
        address: { type: String},
        city: { type: String },
        state: { type: String},
        country: { type: String},
    },
    verificationDocType: { type: String, required: true },
    document: { type: String },
    idNumber: { type: String, required: true },
});

export default mongoose.model<Crew>("Crew", CrewSchema);

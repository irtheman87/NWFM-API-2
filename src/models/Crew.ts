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
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    dob: { type: Date, required: true },
    bio: { type: String },
    propic: { type: String },
    department: { type: String, required: true },
    role: { type: [String], required: true },
    works: [
        {
            title: { type: String, required: true },
            role: { type: String, required: true },
            link: { type: String },
            year: { type: Number, required: true },
        },
    ],
    fee: { type: String, required: true },
    location: {
        address: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        country: { type: String, required: true },
    },
    verificationDocType: { type: String, required: true },
    document: { type: String },
    idNumber: { type: String, required: true },
});

export default mongoose.model<Crew>("Crew", CrewSchema);

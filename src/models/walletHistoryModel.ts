import mongoose, { Document, Schema } from 'mongoose';

export interface IWalletHistory extends Document {
  cid: string;
  amount: number;
  type: 'deposit' | 'withdrawal';  // You can add more types if needed
  status: 'completed' | 'pending' | 'failed';  // You can add more statuses if needed
  createdAt: Date;
  updatedAt: Date;
}

const walletHistorySchema = new Schema<IWalletHistory>({
  cid: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['completed', 'pending', 'failed'], 
    required: true 
  },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

const WalletHistory = mongoose.model<IWalletHistory>('WalletHistory', walletHistorySchema);
export default WalletHistory;

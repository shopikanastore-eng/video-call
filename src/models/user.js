import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
    {
        deviceId: { type: String },
        blockTime: { type: Date },
        blockDetails: [{
            blockTime: { type: Date },
            partnerDeviceId: { type: String },
            isBlock: { type: Boolean, default: false }
        }],

        isBlock: { type: Boolean, default: false },
        socketId: { type: String }
    },
    { timestamps: true }
);

const User = mongoose.model('user', userSchema);

export default User;
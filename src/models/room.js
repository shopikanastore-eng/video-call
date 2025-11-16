import mongoose from 'mongoose';

const RoomSchema = new mongoose.Schema({
    socketID1: { type: String },
    socketID2: { type: String },
    socketCount: { type: Number, default: 0 }
}, { timestamps: true });

const Room = mongoose.model('Room', RoomSchema);
export default Room;

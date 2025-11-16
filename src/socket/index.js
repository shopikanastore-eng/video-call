import Room from '../models/room.js';
import User from '../models/user.js';

const socketHandler = (io) => {
    io.on('connection', (socket) => {

        socket.on('join', async (data) => {
            let room = await Room.findOne({ socketCount: { $lt: 2 } });
            let checkUserBlockOrNot = await User.findOne({ deviceId: data?.deviceId, isBlock: true })

            if (checkUserBlockOrNot?._id) {

                const gapInMilliseconds = new Date().getTime() - checkUserBlockOrNot?.blockTime?.getTime();
                const gapInMinutes = Math.floor(gapInMilliseconds / (1000 * 60));

                socket.emit("block", { message: `You’ve been temporarily blocked due to unusual activity. Please wait ${gapInMinutes} minutes and try again.` })
                return;
            }

            await User.findOneAndUpdate({ deviceId: data?.deviceId }, { deviceId: data?.deviceId, socketId: socket.id }, { new: true, upsert: true })

            if (!room) {
                room = new Room({
                    socketID1: socket.id,
                    socketCount: 1
                });
            } else {
                if (!room.socketID1 && room.socketID2 !== socket.id) {
                    room.socketID1 = socket.id;
                    room.socketCount += 1;
                } else if (room.socketID1 !== socket.id) {
                    room.socketID2 = socket.id;
                    room.socketCount += 1;
                }
            }

            await room.save();

            const peers = [room.socketID1, room.socketID2].filter(id => id && id !== socket.id);
            socket.emit('matched', { partnerId: peers[0], isCaller: peers.length === 1 });

            if (peers.length === 1) {
                const partnerSocket = io.sockets.sockets.get(peers[0]);
                if (partnerSocket) {
                    partnerSocket.emit('matched', { partnerId: socket.id, isCaller: false });
                }
            }
        });

        socket.on('offer', (data) => {
            const partnerSocket = io.sockets.sockets.get(data.partnerId);
            if (partnerSocket) {
                partnerSocket.emit('offer', { sdp: data.sdp, senderId: socket.id });
            }
        });

        socket.on('answer', (data) => {
            const partnerSocket = io.sockets.sockets.get(data.partnerId);
            if (partnerSocket) {
                partnerSocket.emit('answer', { sdp: data.sdp, senderId: socket.id });
            }
        });

        socket.on('ice-candidate', (data) => {
            const partnerSocket = io.sockets.sockets.get(data.partnerId);
            if (partnerSocket) {
                partnerSocket.emit('ice-candidate', { candidate: data.candidate, senderId: socket.id });
            }
        });

        socket.on('chat-message', (data) => {
            io.to(data.partnerId).emit('chat-message', {
                message: data.message,
                senderId: socket.id
            });
        });

        socket.on('block-user', async (data) => {
            await User?.findOneAndUpdate(
                { socketId: data?.partnerId },
                { blockTime: new Date(), isBlock: true, socketId: "" },
                { new: true, upsert: true }
            )

            socket.emit('block-user', { message: "ok" })
        })

        socket.on('leave-call', () => {
            handleDisconnect(socket);
        });

        socket.on('disconnect', () => {
            handleDisconnect(socket);
        });

        async function handleDisconnect(socketInstance) {
            const socketId = socketInstance.id;
            const room = await Room.findOne({
                $or: [{ socketID1: socketId }, { socketID2: socketId }]
            });

            await User.findOneAndUpdate({ socketId: socketId }, { socketId: "" })

            if (room) {
                const remainingPeer = [room.socketID1, room.socketID2].find(id => id && id !== socketId);
                if (remainingPeer) {
                    const peerSocket = io.sockets.sockets.get(remainingPeer);
                    if (peerSocket) {
                        peerSocket.emit('partner-disconnected', { peerId: socketId });
                    }
                }
                await Room.deleteOne({ _id: room._id });
            }
        }
    });
};

export default socketHandler;

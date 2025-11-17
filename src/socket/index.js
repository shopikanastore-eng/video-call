import Room from '../models/room.js';
import User from '../models/user.js';

const socketHandler = (io) => {
    io.on('connection', (socket) => {

        // socket.on('join', async (data) => {
        //     let room = await Room.findOne({ socketCount: { $lt: 2 } });

        //     await User.findOneAndUpdate({ deviceId: data?.deviceId }, { deviceId: data?.deviceId, socketId: socket.id }, { new: true, upsert: true })

        //     if (!room) {
        //         room = new Room({
        //             socketID1: socket.id,
        //             socketCount: 1
        //         });

        //         await room.save();
        //     } else {
        //         if (room.socketID1 != socket.id) {

        //             let findFirstUser = await User.findOne({ socketId: room.socketID1 })
        //             if (findFirstUser?._id) {
        //                 let checkData = await User.findOne({ deviceId: findFirstUser?.deviceId, "blockDetails.partnerDeviceId": data?.deviceId })
        //                 if (checkData?._id) {


        //                     let newRoom

        //                     newRoom = new Room({
        //                         socketID1: socket.id,
        //                         socketCount: 1
        //                     });

        //                     await newRoom.save();

        //                     const peers = [newRoom.socketID1, newRoom.socketID2].filter(id => id && id !== socket.id);
        //                     socket.emit('matched', { partnerId: peers[0], isCaller: peers.length === 1, isMessage: true, message: `This user Blocked you you can't talk with them` });

        //                     if (peers.length === 1) {
        //                         const partnerSocket = io.sockets.sockets.get(peers[0]);
        //                         if (partnerSocket) {
        //                             partnerSocket.emit('matched', { partnerId: socket.id, isCaller: false, isMessage: true, message: `This user Blocked you you can't talk with them` });
        //                         }
        //                     }
        //                     return;

        //                 } else {
        //                     room.socketID2 = socket.id;
        //                     room.socketCount += 1;
        //                     await room.save();

        //                 }
        //             }

        //         }
        //     }

        //     const peers = [room.socketID1, room.socketID2].filter(id => id && id !== socket.id);
        //     socket.emit('matched', { partnerId: peers[0], isCaller: peers.length === 1 });

        //     if (peers.length === 1) {
        //         const partnerSocket = io.sockets.sockets.get(peers[0]);
        //         if (partnerSocket) {
        //             partnerSocket.emit('matched', { partnerId: socket.id, isCaller: false });
        //         }
        //     }
        // });




        socket.on('join', async (data) => {
            let room = await Room.findOne({ socketCount: { $lt: 2 } });

            await User.findOneAndUpdate({ deviceId: data?.deviceId }, { deviceId: data?.deviceId, socketId: socket.id }, { new: true, upsert: true })

            if (!room) {
                room = new Room({
                    socketID1: socket.id,
                    socketCount: 1
                });

                await room.save();
            } else {
                if (room.socketID1 != socket.id) {

                    let findFirstUser = await User.findOne({ socketId: room.socketID1 })
                    if (findFirstUser?._id) {
                        let checkData = await User.findOne({ deviceId: findFirstUser?.deviceId, "blockDetails.partnerDeviceId": data?.deviceId })
                        if (checkData?._id) {


                            let newRoom

                            newRoom = new Room({
                                socketID1: socket.id,
                                socketCount: 1
                            });

                            await newRoom.save();

                            const peers = [newRoom.socketID1, newRoom.socketID2].filter(id => id && id !== socket.id);
                            socket.emit('matched', { partnerId: peers[0], isCaller: peers.length === 1, isMessage: true, message: `This user Blocked you you can't talk with them` });

                            if (peers.length === 1) {
                                const partnerSocket = io.sockets.sockets.get(peers[0]);
                                if (partnerSocket) {
                                    partnerSocket.emit('matched', { partnerId: socket.id, isCaller: false, isMessage: true, message: `This user Blocked you you can't talk with them` });
                                }
                            }
                            return;

                        } else {
                            room.socketID2 = socket.id;
                            room.socketCount += 1;
                            await room.save();

                        }
                    }

                }
            }

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
            // await User?.findOneAndUpdate(
            //     { socketId: data?.partnerId },
            //     { blockTime: new Date(), isBlock: true, socketId: "" },
            //     { new: true, upsert: true }
            // )

            let dataOfPartner = await User.findOne({ socketId: data?.partnerId })

            if (dataOfPartner?.deviceId) {
                await User.findOneAndUpdate(
                    { deviceId: data?.deviceId },
                    {
                        $push: {
                            blockDetails: {
                                blockTime: new Date(),
                                partnerDeviceId: dataOfPartner?.deviceId,
                                isBlock: true
                            }
                        }
                    })

                await User.findOneAndUpdate(
                    { _id: dataOfPartner?._id },
                    {
                        $push: {
                            blockDetails: {
                                blockTime: new Date(),
                                partnerDeviceId: data?.deviceId,
                                isBlock: true
                            }
                        }
                    },
                    { new: true }
                );
            }
            socket.emit('block-user', { message: "ok" })
        })

        socket.on('leave-call', () => {
            socket.emit("leave-call", { success: true })
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

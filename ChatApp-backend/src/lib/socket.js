import { Server } from 'socket.io';
import http from 'http';
import express from 'express';


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3001"],
        credentials: true,
    }
});

export function getReceiverSocketId(userId) {
    return userSocketMap[userId];
}

//used to store the online user
const userSocketMap = {};

io.on("connection", (socket) => {
    console.log("a user connected", socket.id);

    const userId = socket.handshake.query.userId
    if (userId) userSocketMap[userId] = socket.id // we use [] i.e brackect notion because userId is a variable

    //io.emit is used to send event to all the connected users
    io.emit("getOnlineUsers", Object.keys(userSocketMap))

    socket.on("disconnect", () => {
        console.log("user disconnected", socket.id);
        delete userSocketMap[userId];
        io.emit("getOnlineUsers", Object.keys(userSocketMap))
    });
});

export { io, server, app };
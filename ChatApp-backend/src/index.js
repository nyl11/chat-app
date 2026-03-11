import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import path from "path";

import authRoutes from "./routes/auth.route.js"
import messageRoutes from "./routes/message.route.js"

import { connectDB } from "./lib/db.js"
import { app, server } from "./lib/socket.js";

dotenv.config();


const PORT = process.env.PORT;
const __dirname = path.resolve();

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(cors(
    {
        origin: ["http://localhost:3001"],
        credentials: true
    }
))


app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

//health check
app.get("/health", (req, res) => {
    res.send("OK");
})

if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "../ChatApp-frontend/dist")));

    app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "../ChatApp-frontend", "dist", "index.html"));
    });
}

server.listen(PORT, () => {
    console.log('server is running on port:' + PORT)
    connectDB();
})

# 💬 ChatApp Backend

A real-time chat application backend built with **Node.js**, **Express**, **MongoDB**, and **Socket.IO**. Supports user authentication (including Google OAuth), real-time messaging, image sharing via Cloudinary, and online user presence tracking.

---

## 🚀 Features

- **User Authentication** — Sign up, log in, and log out with JWT-based auth stored in secure HTTP-only cookies.
- **Google OAuth** — Sign in with Google using the Google Auth Library.
- **Real-Time Messaging** — Instant message delivery powered by Socket.IO.
- **Online Presence** — Track and broadcast online users in real time.
- **Image Sharing** — Upload and share images in chats using Cloudinary.
- **Profile Management** — Update profile pictures stored on Cloudinary.
- **Protected Routes** — JWT middleware to guard authenticated endpoints.
- **Security** — Password hashing with bcrypt, XSS & CSRF protections on cookies.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js** | JavaScript runtime |
| **Express 5** | Web framework |
| **MongoDB + Mongoose** | Database & ODM |
| **Socket.IO** | Real-time WebSocket communication |
| **JWT** | Token-based authentication |
| **bcrypt** | Password hashing |
| **Cloudinary** | Image storage & delivery |
| **Google Auth Library** | Google OAuth integration |
| **dotenv** | Environment variable management |
| **cookie-parser** | Cookie handling |
| **CORS** | Cross-origin resource sharing |

---

## 📁 Project Structure

```
ChatApp-backend/
├── src/
│   ├── controllers/
│   │   ├── auth.controller.js      # Auth logic (signup, login, logout, Google OAuth)
│   │   └── message.controller.js   # Messaging logic (send, get messages, sidebar users)
│   ├── models/
│   │   ├── user.model.js           # User schema (email, fullName, password, profilePic)
│   │   └── message.model.js        # Message schema (senderId, reciverId, text, image)
│   ├── routes/
│   │   ├── auth.route.js           # Auth routes (/api/auth)
│   │   └── message.route.js        # Message routes (/api/messages)
│   ├── middleware/
│   │   └── auth.middleware.js       # JWT verification middleware
│   ├── lib/
│   │   ├── db.js                   # MongoDB connection
│   │   ├── socket.js               # Socket.IO server setup & online user tracking
│   │   ├── cloudinary.js           # Cloudinary configuration
│   │   └── utils.js                # JWT token generation & cookie setting
│   └── index.js                    # App entry point
├── .env.example                    # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## ⚙️ Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/) (local instance or [MongoDB Atlas](https://www.mongodb.com/atlas))
- [Cloudinary](https://cloudinary.com/) account (for image uploads)
- [Google Cloud Console](https://console.cloud.google.com/) project with OAuth 2.0 Client ID (for Google sign-in)

---

## 📦 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/<your-username>/ChatApp-backend.git
   cd ChatApp-backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   ```

4. **Start the development server**

   ```bash
   npm run dev
   ```

   The server will start on the port specified in your `.env` file (default: `5001`).

---

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/chatapp` |
| `PORT` | Server port | `5001` |
| `JWT_SECRET` | Secret key for signing JWTs | `your_jwt_secret_key` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | `your_cloud_name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `your_api_secret` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | `your_client_id.apps.googleusercontent.com` |
| `NODE_ENV` | Environment mode | `development` |

---

## 📡 API Endpoints

### Auth Routes — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/signup` | ❌ | Register a new user |
| `POST` | `/login` | ❌ | Log in with email & password |
| `POST` | `/logout` | ❌ | Log out and clear JWT cookie |
| `POST` | `/google-signup` | ❌ | Sign in / sign up with Google token |
| `PUT` | `/update-profile` | ✅ | Update profile picture |
| `GET` | `/check` | ✅ | Verify auth status & get user data |

### Message Routes — `/api/messages`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | ✅ | Get all users for sidebar (excludes current user) |
| `GET` | `/:id` | ✅ | Get message history with a specific user |
| `POST` | `/send/:id` | ✅ | Send a message (text and/or image) to a user |

> **✅ = Requires Authentication** — The request must include a valid JWT cookie.

---

## 🔌 Socket.IO Events

| Event | Direction | Description |
|---|---|---|
| `connection` | Client → Server | User connects; mapped to socket ID for real-time delivery |
| `disconnect` | Client → Server | User disconnects; removed from online users map |
| `getOnlineUsers` | Server → All Clients | Broadcasts the list of currently online user IDs |
| `newMessage` | Server → Specific Client | Delivers a new message to the recipient in real time |

**Connection:** Clients connect with a `userId` query parameter:

```javascript
const socket = io("http://localhost:5001", {
  query: { userId: "user_id_here" },
});
```

---

## 📨 Request & Response Examples

### Sign Up

```bash
curl -X POST http://localhost:5001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

**Response (201):**

```json
{
  "_id": "65f...",
  "fullName": "John Doe",
  "email": "john@example.com",
  "profilePic": ""
}
```

### Send a Message

```bash
curl -X POST http://localhost:5001/api/messages/send/<receiver_id> \
  -H "Content-Type: application/json" \
  --cookie "jwt=<your_token>" \
  -d '{
    "text": "Hello!",
    "image": ""
  }'
```

**Response (201):**

```json
{
  "_id": "65f...",
  "senderId": "65f...",
  "reciverId": "65f...",
  "text": "Hello!",
  "image": "",
  "createdAt": "2026-03-11T...",
  "updatedAt": "2026-03-11T..."
}
```

---

## 🗃️ Database Models

### User

| Field | Type | Description |
|---|---|---|
| `email` | String | Unique email address (required) |
| `fullName` | String | User's display name (required) |
| `password` | String | Hashed password (min 6 chars) |
| `profilePic` | String | Cloudinary URL for profile picture |
| `createdAt` | Date | Auto-generated timestamp |
| `updatedAt` | Date | Auto-generated timestamp |

### Message

| Field | Type | Description |
|---|---|---|
| `senderId` | ObjectId | Reference to sender User |
| `reciverId` | ObjectId | Reference to receiver User |
| `text` | String | Text content of the message |
| `image` | String | Cloudinary URL for image attachment |
| `createdAt` | Date | Auto-generated timestamp |
| `updatedAt` | Date | Auto-generated timestamp |

---

## 🧪 Scripts

| Script | Command | Description |
|---|---|---|
| **Dev** | `npm run dev` | Start dev server with nodemon (hot reload) |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **ISC License**.

---

## 🙏 Acknowledgements

- [Express.js](https://expressjs.com/)
- [MongoDB](https://www.mongodb.com/)
- [Socket.IO](https://socket.io/)
- [Cloudinary](https://cloudinary.com/)
- [Google Identity Services](https://developers.google.com/identity)

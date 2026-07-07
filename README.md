# 💬 ChatApp — Real-Time Encrypted Chat Application

A full-stack real-time chat application with **end-to-end encryption**, group messaging, friend management, and Google OAuth support.

---

## ✨ Features

- 🔐 **End-to-End Encryption (E2EE)** — DM and group messages encrypted using ECDH P-256 + AES-128-CTR + HMAC-SHA-256
- 💬 **Real-Time Messaging** — Powered by Socket.IO for instant message delivery
- 👥 **Group Chats** — Create and manage encrypted group conversations
- 🤝 **Friend System** — Send, accept, and manage friend requests
- 🔑 **Google OAuth** — Sign in with your Google account
- 🖼️ **Image Uploads** — Profile pictures and media sharing via Cloudinary
- 🌗 **Theme Support** — Multiple UI themes via DaisyUI
- 📱 **Responsive Design** — Works across desktop and mobile

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 19 | UI Framework |
| Vite | Build Tool & Dev Server |
| Tailwind CSS v4 | Styling |
| DaisyUI | Component Library & Themes |
| Zustand | State Management |
| Socket.IO Client | Real-Time Communication |
| React Router v7 | Client-Side Routing |
| Axios | HTTP Client |
| @react-oauth/google | Google Sign-In |
| Lucide React | Icons |
| date-fns | Date Formatting |

### Backend
| Technology | Purpose |
|---|---|
| Node.js + Express v5 | REST API Server |
| MongoDB + Mongoose | Database |
| Socket.IO | WebSocket Server |
| JWT | Authentication Tokens |
| bcrypt | Password Hashing |
| Cloudinary | Image Storage |
| google-auth-library | Google OAuth Verification |
| cookie-parser | Cookie Handling |

---

## 🔐 End-to-End Encryption

All messages are encrypted **client-side** before being sent to the server. The server never sees plaintext message content.

### DM (Direct Message) Encryption
- **Key Agreement:** ECDH P-256 — each user generates a permanent key pair stored in the browser
- **Key Derivation:** HKDF-SHA-256 with domain label `dm-message-v1`
- **Encryption:** AES-128-CTR + HMAC-SHA-256 (Encrypt-then-MAC)
- The server stores only the encrypted ciphertext, IV, and MAC

### Group Encryption
- Uses a **sender key** architecture for efficient group messaging
- Same cryptographic primitives as DM but with a distinct HKDF info label
- Group keys are distributed securely to all members

---

## 📁 Project Structure

```
chat-app/
├── ChatApp-backend/        # Express + Socket.IO server
│   └── src/
│       ├── controllers/    # Route handlers
│       ├── models/         # Mongoose schemas
│       │   ├── user.model.js
│       │   ├── message.model.js
│       │   ├── group.model.js
│       │   ├── groupMessage.model.js
│       │   ├── groupKeyDistribution.model.js
│       │   └── friendRequest.model.js
│       ├── routes/         # API routes
│       │   ├── auth.route.js
│       │   ├── message.route.js
│       │   ├── friend.route.js
│       │   └── group.route.js
│       ├── middleware/     # Auth middleware
│       ├── lib/            # DB connection, Socket.IO setup
│       └── index.js        # Server entry point
│
└── ChatApp-frontend/       # React + Vite client
    └── src/
        ├── api/            # Axios API calls
        ├── components/     # Reusable UI components
        ├── lib/            # Crypto engine & operations
        │   ├── cryptoEngine.js      # Core crypto primitives
        │   ├── dmCryptoOps.js       # DM E2EE logic
        │   └── groupCryptoOps.js    # Group E2EE logic
        ├── pages/          # App pages
        │   ├── HomePage.jsx
        │   ├── LoginPage.jsx
        │   ├── SignUpPage.jsx
        │   ├── ProfilePage.jsx
        │   ├── FriendsPage.jsx
        │   ├── GroupsPage.jsx
        │   └── SettingsPage.jsx
        └── store/          # Zustand state stores
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local or [MongoDB Atlas](https://www.mongodb.com/atlas))
- A [Cloudinary](https://cloudinary.com/) account
- A [Google Cloud](https://console.cloud.google.com/) project with OAuth 2.0 credentials

---

### 1. Clone the Repository

```bash
git clone https://github.com/nyl11/chat-app.git
cd chat-app
```

---

### 2. Configure the Backend

```bash
cd ChatApp-backend
cp .env.example .env
```

Fill in your `.env`:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/chatapp
PORT=5001
JWT_SECRET=your_super_secret_jwt_key

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

NODE_ENV=development
```

---

### 3. Configure the Frontend

```bash
cd ../ChatApp-frontend
cp .env.example .env
```

Fill in your `.env`:

```env
VITE_GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
```

---

### 4. Install Dependencies & Run

**Backend:**
```bash
cd ChatApp-backend
npm install
npm run dev
# Server starts on http://localhost:5001
```

**Frontend** (in a new terminal):
```bash
cd ChatApp-frontend
npm install
npm run dev
# App starts on http://localhost:3001
```

---

## 📦 Production Build

From the project root:

```bash
npm run build   # Installs deps and builds the frontend
npm start       # Starts the backend (serves frontend from dist/)
```

> In production mode, the backend serves the compiled React app from `ChatApp-frontend/dist/`.

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Login with email & password |
| POST | `/api/auth/google` | Login with Google OAuth |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/check` | Check auth status |
| GET | `/api/messages/:id` | Get DM conversation |
| POST | `/api/messages/send/:id` | Send a DM |
| GET | `/api/friends` | Get friend list |
| POST | `/api/friends/request/:id` | Send friend request |
| GET | `/api/groups` | Get user's groups |
| POST | `/api/groups/create` | Create a group |
| POST | `/api/groups/:id/message` | Send a group message |
| GET | `/health` | Server health check |

---

## 🔒 Security Notes

- Passwords are hashed with **bcrypt** before storage
- Authentication uses **HTTP-only cookies** with JWT tokens
- All message content is **E2EE** — the server stores only ciphertext
- CORS is configured to allow only the frontend origin

---

## 📄 License

This project is licensed under the **ISC License**.

---

## 🙋 Author

**Noyal Khadka** — [github.com/nyl11](https://github.com/nyl11)

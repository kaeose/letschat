# LetsChat

A minimalist, privacy-focused chat application featuring end-to-end encryption (E2EE) and a zero-knowledge architecture.

**Live Demo:** [https://kaeose.github.io/letschat/](https://kaeose.github.io/letschat/)

## Overview

LetsChat is designed for ephemeral, anonymous communication. It utilizes a "Trust No One" model where the server acts strictly as a blind relay, with no access to message content or decryption keys.

### Core Features
- **End-to-End Encryption:** All data (messages, metadata) is encrypted client-side using **AES-GCM (256-bit)** via the Web Crypto API.
- **Zero-Knowledge Relay:** The server never receives raw keys or unencrypted data.
- **Ephemeral State:** No database or persistence. All data exists only in memory and is wiped on session termination.
- **Secure Key Exchange:** Keys are transmitted via URL fragments (which are never sent to the server) and immediately masked in the browser history to prevent leakage.

## Tech Stack
- **Frontend:** React, TypeScript, Vite, Tailwind CSS.
- **Backend:** Node.js, Socket.io.
- **Security:** Web Crypto API (AES-GCM, HMAC-SHA256).

---

## Security Architecture

### 1. Authentication Protocol
Uses a derived key approach to allow room access without the server knowing the room's secret.

1. **Raw Key (K):** Stays in the browser.
2. **Token (T):** `HMAC(K, "auth")`. Used by clients to authenticate.
3. **Server Hash (S):** `HMAC(T, "verify")`. Stored by server to verify `T`.

The server can verify `T` matches `S` but cannot reverse the hash to obtain the original key `K`.

### 2. Message Transport
Messages are encrypted using AES-GCM before transmission. The server blindly broadcasts the `{ ciphertext, iv }` payload to participants.

---

## Local Development

### Prerequisites
- Node.js (v18+)
- npm

### Setup

1. **Relay Server**
   ```bash
   cd server
   npm install
   npm start
   ```

2. **Client**
   ```bash
   cd client
   npm install
   npm run dev
   ```

## Deployment

- **Frontend:** Static SPA, deployable to GitHub Pages, Vercel, or Netlify.
- **Backend:** Node.js environment supporting WebSockets (Render, Railway, etc.).

## Disclaimer
Educational project. While it uses standard cryptographic primitives, security is a moving target. Use at your own risk.
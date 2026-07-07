// groupCrypto.js — Pure-JavaScript Group E2EE Engine
//
// Implements the full cryptographic stack for group chat from scratch:
//   • AES-128 block cipher (SubBytes, ShiftRows, MixColumns, AddRoundKey + key schedule)
//   • AES-128 in CTR mode (stream cipher — no padding needed)
//   • SHA-256 (full 64-round compression function)
//   • HMAC-SHA-256 (ipad/opad construction)
//   • HKDF (RFC 5869) built on HMAC-SHA-256
//   • ECDH key agreement on NIST P-256 using BigInt point arithmetic
//   • Sender Key pattern for group encryption
//
// ZERO Web Crypto subtle API.  ZERO external libraries.
// crypto.getRandomValues() IS used — it is NOT part of subtle and is just a CSPRNG.

// ═══════════════════════════════════════════════════════════════════════════
// § IndexedDB helpers  (shared with crypto.js but kept self-contained here)
// ═══════════════════════════════════════════════════════════════════════════

const GC_DB_NAME = "ChatAppGroupE2EE";
const GC_DB_VERSION = 1;
const GC_STORE = "groupKeys";

function gcOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GC_DB_NAME, GC_DB_VERSION);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(GC_STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function gcSave(key, value) {
  const db = await gcOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GC_STORE, "readwrite");
    tx.objectStore(GC_STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function gcLoad(key) {
  const db = await gcOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GC_STORE, "readonly");
    const req = tx.objectStore(GC_STORE).get(key);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// § Utility helpers
// ═══════════════════════════════════════════════════════════════════════════

export function gcBufToB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function gcB64ToBuf(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function xorBytes(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

function numToU8(n, len) {
  const buf = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) {
    buf[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return buf;
}

function u8ToNum(u8) {
  let n = 0n;
  for (const b of u8) n = (n << 8n) | BigInt(b);
  return n;
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function randomBytes(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf); // NOT subtle — just the CSPRNG
  return buf;
}

// ═══════════════════════════════════════════════════════════════════════════
// § AES-128 Block Cipher
// ═══════════════════════════════════════════════════════════════════════════

// AES S-box (forward substitution table)
const SBOX = new Uint8Array([
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]);

// Round constants for key schedule
const RCON = new Uint8Array([
  0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36,
]);

// GF(2^8) multiplication (used in MixColumns)
function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hiBit = a & 0x80;
    a = (a << 1) & 0xff;
    if (hiBit) a ^= 0x1b; // x^8 + x^4 + x^3 + x + 1 (AES irreducible polynomial)
    b >>= 1;
  }
  return p;
}

// AES key schedule: 16-byte key → 11 × 16-byte round keys (176 bytes total)
function aesKeyExpand(key) {
  const w = new Uint8Array(176);
  w.set(key, 0);
  for (let i = 4; i < 44; i++) {
    const prev = w.slice((i - 1) * 4, i * 4);
    let temp = new Uint8Array(prev);
    if (i % 4 === 0) {
      // RotWord + SubWord + RCON
      temp = new Uint8Array([
        SBOX[temp[1]] ^ RCON[i / 4 - 1],
        SBOX[temp[2]],
        SBOX[temp[3]],
        SBOX[temp[0]],
      ]);
    }
    const base = (i - 4) * 4;
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[base + j] ^ temp[j];
  }
  return w;
}

// Encrypt one 16-byte block (AES-128, 10 rounds)
function aesEncryptBlock(block, roundKeys) {
  // State is a 4×4 column-major matrix stored as flat 16-byte array
  let s = new Uint8Array(block);

  // Initial round key addition
  for (let i = 0; i < 16; i++) s[i] ^= roundKeys[i];

  for (let round = 1; round <= 10; round++) {
    // SubBytes
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];

    // ShiftRows — row r shifts left by r bytes
    s = new Uint8Array([
      s[0],  s[5],  s[10], s[15],  // row 0 — no shift
      s[4],  s[9],  s[14], s[3],   // row 1 — shift 1
      s[8],  s[13], s[2],  s[7],   // row 2 — shift 2
      s[12], s[1],  s[6],  s[11],  // row 3 — shift 3
    ]);

    // MixColumns (skip on last round)
    if (round < 10) {
      for (let c = 0; c < 4; c++) {
        const i = c * 4;
        const a = s[i], b = s[i+1], cc = s[i+2], d = s[i+3];
        s[i]   = gmul(2,a) ^ gmul(3,b) ^ cc       ^ d;
        s[i+1] = a         ^ gmul(2,b) ^ gmul(3,cc)^ d;
        s[i+2] = a         ^ b         ^ gmul(2,cc)^ gmul(3,d);
        s[i+3] = gmul(3,a) ^ b         ^ cc        ^ gmul(2,d);
      }
    }

    // AddRoundKey
    const rk = roundKeys.slice(round * 16, (round + 1) * 16);
    for (let i = 0; i < 16; i++) s[i] ^= rk[i];
  }

  return s;
}

// AES-128-CTR: encrypt or decrypt (CTR is symmetric)
// key: Uint8Array(16), nonce: Uint8Array(12), data: Uint8Array
export function aesCTR(key, nonce, data) {
  const roundKeys = aesKeyExpand(key);
  const out = new Uint8Array(data.length);
  let counter = 0;
  for (let off = 0; off < data.length; off += 16) {
    // Counter block = nonce(12) || counter(4, big-endian)
    const ctrBlock = new Uint8Array(16);
    ctrBlock.set(nonce, 0);
    ctrBlock[12] = (counter >>> 24) & 0xff;
    ctrBlock[13] = (counter >>> 16) & 0xff;
    ctrBlock[14] = (counter >>>  8) & 0xff;
    ctrBlock[15] =  counter         & 0xff;
    const ks = aesEncryptBlock(ctrBlock, roundKeys);
    const chunk = Math.min(16, data.length - off);
    for (let i = 0; i < chunk; i++) out[off + i] = data[off + i] ^ ks[i];
    counter++;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// § SHA-256
// ═══════════════════════════════════════════════════════════════════════════

// 64 round constants (first 32 bits of fractional parts of cube roots of first 64 primes)
const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

// Initial hash values (first 32 bits of fractional parts of square roots of first 8 primes)
const SHA256_H0 = new Uint32Array([
  0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
  0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
]);

function rotr32(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

export function sha256(data) {
  // Pre-processing: padding
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  // Pad to 512-bit (64-byte) boundary: append 0x80, then zeros, then 8-byte big-endian length
  const padLen = ((msgLen % 64) < 56 ? 56 - (msgLen % 64) : 120 - (msgLen % 64));
  const padded = new Uint8Array(msgLen + padLen + 8);
  padded.set(data);
  padded[msgLen] = 0x80;
  // Write 64-bit big-endian bit length (JS bitwise is 32-bit so handle high word separately)
  const dvLen = new DataView(padded.buffer, padded.byteOffset);
  dvLen.setUint32(msgLen + padLen,     Math.floor(bitLen / 0x100000000), false);
  dvLen.setUint32(msgLen + padLen + 4, bitLen >>> 0,                     false);

  // Process 512-bit chunks
  const H = new Uint32Array(SHA256_H0);
  const dv = new DataView(padded.buffer, padded.byteOffset);
  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    const W = new Uint32Array(64);
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(chunk + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr32(W[t-15],7) ^ rotr32(W[t-15],18) ^ (W[t-15] >>> 3);
      const s1 = rotr32(W[t-2],17) ^ rotr32(W[t-2],19)  ^ (W[t-2]  >>> 10);
      W[t] = (W[t-16] + s0 + W[t-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1  = rotr32(e,6) ^ rotr32(e,11) ^ rotr32(e,25);
      const ch  = (e & f) ^ (~e & g);
      const T1  = (h + S1 + ch + SHA256_K[t] + W[t]) >>> 0;
      const S0  = rotr32(a,2) ^ rotr32(a,13) ^ rotr32(a,22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const T2  = (S0 + maj) >>> 0;
      h=g; g=f; f=e; e=(d+T1)>>>0; d=c; c=b; b=a; a=(T1+T2)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }

  // Produce 32-byte digest
  const digest = new Uint8Array(32);
  const dvOut = new DataView(digest.buffer);
  for (let i = 0; i < 8; i++) dvOut.setUint32(i * 4, H[i], false);
  return digest;
}

// ═══════════════════════════════════════════════════════════════════════════
// § HMAC-SHA-256
// ═══════════════════════════════════════════════════════════════════════════

export function hmacSha256(key, data) {
  // Key normalisation: if >64 bytes, hash it; if <64, pad with zeros
  let k = key.length > 64 ? sha256(key) : key;
  const kp = new Uint8Array(64);
  kp.set(k);
  const ipad = new Uint8Array(64).fill(0x36);
  const opad = new Uint8Array(64).fill(0x5c);
  return sha256(concat(xorBytes(kp, opad), sha256(concat(xorBytes(kp, ipad), data))));
}

// ═══════════════════════════════════════════════════════════════════════════
// § HKDF (RFC 5869) — Extract + Expand using HMAC-SHA-256
// ═══════════════════════════════════════════════════════════════════════════

// ikm: Uint8Array (input keying material, e.g. ECDH shared secret x-coord)
// salt: Uint8Array | null
// info: Uint8Array (domain-separation label)
// length: number of bytes to output (≤ 255 * 32)
export function hkdf(ikm, salt, info, length) {
  const realSalt = salt ?? new Uint8Array(32); // RFC default: all-zeros
  // Extract
  const prk = hmacSha256(realSalt, ikm);
  // Expand
  const out = new Uint8Array(length);
  let T = new Uint8Array(0);
  let written = 0;
  for (let i = 1; written < length; i++) {
    T = hmacSha256(prk, concat(T, info, new Uint8Array([i])));
    const take = Math.min(T.length, length - written);
    out.set(T.slice(0, take), written);
    written += take;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// § ECDH on NIST P-256 (pure BigInt arithmetic)
// ═══════════════════════════════════════════════════════════════════════════
//
// Curve parameters (NIST SP 800-186)
//   p  = prime field
//   a  = curve coefficient (= -3 mod p)
//   Gx,Gy = generator point
//   n  = group order

const P256 = {
  p:  BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff"),
  a:  BigInt("0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc"),
  b:  BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b"),
  Gx: BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),
  Gy: BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"),
  n:  BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"),
};

function modP(x) {
  return ((x % P256.p) + P256.p) % P256.p;
}

// Modular inverse via Fermat's little theorem (p is prime)
function modInv(a, m) {
  // m is prime → a^(m-2) mod m
  let result = 1n;
  let base = ((a % m) + m) % m;
  let exp = m - 2n;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    base = (base * base) % m;
    exp >>= 1n;
  }
  return result;
}

// Point at infinity represented as null
function pointAdd(P1, P2) {
  if (P1 === null) return P2;
  if (P2 === null) return P1;
  const { p, a } = P256;
  if (P1.x === P2.x) {
    if (P1.y !== P2.y) return null; // P + (-P) = infinity
    // Point doubling
    const lam = (3n * P1.x * P1.x + a) * modInv(2n * P1.y, p) % p;
    const xR = modP(lam * lam - 2n * P1.x);
    const yR = modP(lam * (P1.x - xR) - P1.y);
    return { x: xR, y: yR };
  }
  const lam = modP(P2.y - P1.y) * modInv(modP(P2.x - P1.x), p) % p;
  const xR = modP(lam * lam - P1.x - P2.x);
  const yR = modP(lam * (P1.x - xR) - P1.y);
  return { x: xR, y: yR };
}

// Scalar multiplication: k * point using double-and-add
function scalarMult(k, point) {
  let result = null;
  let addend = point;
  while (k > 0n) {
    if (k & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    k >>= 1n;
  }
  return result;
}

const G = { x: P256.Gx, y: P256.Gy };

// Generate an ECDH key pair for group use
// Returns { privateScalar: BigInt, publicX: BigInt, publicY: BigInt }
export async function generateGroupKeyPair() {
  // Random 32-byte scalar in [1, n-1]
  let d;
  do {
    const bytes = randomBytes(32);
    d = u8ToNum(bytes);
  } while (d === 0n || d >= P256.n);
  const pub = scalarMult(d, G);
  return { privateScalar: d, publicX: pub.x, publicY: pub.y };
}

// Encode public key as 65-byte uncompressed point → base64
export function encodePublicKey(publicX, publicY) {
  const buf = new Uint8Array(65);
  buf[0] = 0x04; // uncompressed prefix
  buf.set(numToU8(publicX, 32), 1);
  buf.set(numToU8(publicY, 32), 33);
  return gcBufToB64(buf);
}

// Decode base64 uncompressed point → { publicX, publicY } as BigInt
export function decodePublicKey(b64) {
  const buf = gcB64ToBuf(b64);
  if (buf[0] !== 0x04 || buf.length !== 65) throw new Error("Invalid public key format");
  return {
    publicX: u8ToNum(buf.slice(1, 33)),
    publicY: u8ToNum(buf.slice(33, 65)),
  };
}

// ECDH shared secret: returns 32-byte x-coordinate of shared point
export function ecdhSharedSecret(myPrivateScalar, theirPublicX, theirPublicY) {
  const shared = scalarMult(myPrivateScalar, { x: theirPublicX, y: theirPublicY });
  if (shared === null) throw new Error("ECDH produced point at infinity");
  return numToU8(shared.x, 32);
}

// ═══════════════════════════════════════════════════════════════════════════
// § Key Pair Persistence in IndexedDB
// ═══════════════════════════════════════════════════════════════════════════

// Stores scalar as hex string (BigInt is not directly IDB-serialisable on all browsers)
export async function getOrCreateGroupKeyPair(userId) {
  const privHex = await gcLoad(`groupPriv_${userId}`);
  const pubB64  = await gcLoad(`groupPub_${userId}`);
  if (privHex && pubB64) {
    return {
      privateScalar: BigInt("0x" + privHex),
      publicKeyB64: pubB64,
    };
  }
  const kp = await generateGroupKeyPair();
  const hex = kp.privateScalar.toString(16).padStart(64, "0");
  const b64 = encodePublicKey(kp.publicX, kp.publicY);
  await gcSave(`groupPriv_${userId}`, hex);
  await gcSave(`groupPub_${userId}`, b64);
  return { privateScalar: kp.privateScalar, publicKeyB64: b64 };
}

// ═══════════════════════════════════════════════════════════════════════════
// § Sender Key (the symmetric key each member uses to encrypt their messages)
// ═══════════════════════════════════════════════════════════════════════════

// Get (or create) this user's Sender Key for a specific group
// Returns Uint8Array(16) — stored as base64 in IDB
export async function getOrCreateSenderKey(userId, groupId) {
  const stored = await gcLoad(`senderKey_${userId}_${groupId}`);
  if (stored) return gcB64ToBuf(stored);
  const key = randomBytes(16);
  await gcSave(`senderKey_${userId}_${groupId}`, gcBufToB64(key));
  return key;
}

// Save a received sender key (from another member) into IDB
export async function storeSenderKey(senderId, groupId, keyBytes) {
  await gcSave(`senderKey_${senderId}_${groupId}`, gcBufToB64(keyBytes));
}

// Load a sender key received from another member
export async function loadSenderKey(senderId, groupId) {
  const stored = await gcLoad(`senderKey_${senderId}_${groupId}`);
  return stored ? gcB64ToBuf(stored) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// § Sender Key Wrapping (encrypt it per-recipient using ECDH + HKDF + AES-CTR)
// ═══════════════════════════════════════════════════════════════════════════

const WRAP_INFO = new TextEncoder().encode("group-sender-key-wrap-v1");
const MSG_INFO  = new TextEncoder().encode("group-message-auth-v1");

// Wrap the sender key for a specific recipient (before first message send)
// Returns { encryptedKey, nonce, mac } all base64
export function wrapSenderKey(senderKey, sharedSecretBytes) {
  const wrapKey = hkdf(sharedSecretBytes, null, WRAP_INFO, 16);
  const nonce   = randomBytes(12);
  const encrypted = aesCTR(wrapKey, nonce, senderKey);
  const mac = hmacSha256(wrapKey, concat(nonce, encrypted));
  return {
    encryptedKey: gcBufToB64(encrypted),
    nonce:        gcBufToB64(nonce),
    mac:          gcBufToB64(mac),
  };
}

// Unwrap a received sender key — verifies MAC before decrypting
// Returns Uint8Array(16) or throws on MAC failure
export function unwrapSenderKey(encryptedKeyB64, nonceB64, macB64, sharedSecretBytes) {
  const wrapKey   = hkdf(sharedSecretBytes, null, WRAP_INFO, 16);
  const encrypted = gcB64ToBuf(encryptedKeyB64);
  const nonce     = gcB64ToBuf(nonceB64);
  const macGiven  = gcB64ToBuf(macB64);
  const macCalc   = hmacSha256(wrapKey, concat(nonce, encrypted));
  // Constant-time comparison to avoid timing attacks
  if (macGiven.length !== macCalc.length) throw new Error("MAC length mismatch");
  let diff = 0;
  for (let i = 0; i < macGiven.length; i++) diff |= macGiven[i] ^ macCalc[i];
  if (diff !== 0) throw new Error("MAC verification failed — key tampered!");
  return aesCTR(wrapKey, nonce, encrypted);
}

// ═══════════════════════════════════════════════════════════════════════════
// § Group Message Encrypt / Decrypt
// ═══════════════════════════════════════════════════════════════════════════

// Encrypt a plaintext string with the sender's own Sender Key
// Returns { ciphertext, iv, mac } all base64
export function encryptGroupMessage(senderKey, plaintext) {
  const iv        = randomBytes(12);
  const data      = new TextEncoder().encode(plaintext);
  const ciphertext = aesCTR(senderKey, iv, data);
  const authKey   = hkdf(senderKey, null, MSG_INFO, 32);
  const mac       = hmacSha256(authKey, concat(iv, ciphertext));
  return {
    ciphertext: gcBufToB64(ciphertext),
    iv:         gcBufToB64(iv),
    mac:        gcBufToB64(mac),
  };
}

// Decrypt a group message using the sender's Sender Key
// Returns plaintext string or throws on MAC failure
export function decryptGroupMessage(senderKey, ciphertextB64, ivB64, macB64) {
  const iv         = gcB64ToBuf(ivB64);
  const ciphertext = gcB64ToBuf(ciphertextB64);
  const macGiven   = gcB64ToBuf(macB64);
  const authKey    = hkdf(senderKey, null, MSG_INFO, 32);
  const macCalc    = hmacSha256(authKey, concat(iv, ciphertext));
  if (macGiven.length !== macCalc.length) throw new Error("MAC length mismatch");
  let diff = 0;
  for (let i = 0; i < macGiven.length; i++) diff |= macGiven[i] ^ macCalc[i];
  if (diff !== 0) throw new Error("Message MAC failed — message was tampered!");
  const plain = aesCTR(senderKey, iv, ciphertext);
  return new TextDecoder().decode(plain);
}

// ═══════════════════════════════════════════════════════════════════════════
// § Self-test (runs once in dev mode to confirm all primitives are correct)
// ═══════════════════════════════════════════════════════════════════════════

export function runGroupCryptoSelfTest() {
  const pass = (label) => console.log(`[groupCrypto] ✅ ${label}`);
  const fail = (label, e) => console.error(`[groupCrypto] ❌ ${label}`, e);

  // AES-CTR round-trip
  try {
    const key   = new Uint8Array(16).fill(0x2b);
    const nonce = new Uint8Array(12).fill(0x01);
    const plain = new TextEncoder().encode("hello world from AES-CTR");
    const enc   = aesCTR(key, nonce, plain);
    const dec   = aesCTR(key, nonce, enc);
    if (new TextDecoder().decode(dec) !== "hello world from AES-CTR") throw new Error("mismatch");
    pass("AES-CTR round-trip");
  } catch (e) { fail("AES-CTR round-trip", e); }

  // SHA-256 known vector: sha256("") = e3b0c44298...
  try {
    const h = sha256(new Uint8Array(0));
    if (gcBufToB64(h) !== "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=") throw new Error("wrong hash");
    pass("SHA-256 empty string");
  } catch (e) { fail("SHA-256 empty string", e); }

  // HMAC-SHA-256 (RFC 4231 test case 1)
  try {
    const k = new Uint8Array(20).fill(0x0b);
    const d = new TextEncoder().encode("Hi There");
    const h = hmacSha256(k, d);
    const expected = "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7";
    const hex = Array.from(h).map(b => b.toString(16).padStart(2,"0")).join("");
    if (hex !== expected) throw new Error(`got ${hex}`);
    pass("HMAC-SHA-256 RFC 4231 vector");
  } catch (e) { fail("HMAC-SHA-256 RFC 4231 vector", e); }

  // ECDH — Alice and Bob must derive the same shared secret
  try {
    const alicePriv = BigInt("0xc9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721");
    const bobPriv   = BigInt("0xf4b7ff68e4b2a7e8c35b4b7a0a9a10b5e3e7de1b2c3d4e5f6a7b8c9d0e1f2a3");
    const alicePub = scalarMult(alicePriv, G);
    const bobPub   = scalarMult(bobPriv,   G);
    const s1 = ecdhSharedSecret(alicePriv, bobPub.x,   bobPub.y);
    const s2 = ecdhSharedSecret(bobPriv,   alicePub.x, alicePub.y);
    if (gcBufToB64(s1) !== gcBufToB64(s2)) throw new Error("shared secrets differ");
    pass("ECDH P-256 commutativity");
  } catch (e) { fail("ECDH P-256 commutativity", e); }

  // Full encrypt/decrypt round-trip
  try {
    const sk = new Uint8Array(16).fill(0xab);
    const { ciphertext, iv, mac } = encryptGroupMessage(sk, "secret group message");
    const plain = decryptGroupMessage(sk, ciphertext, iv, mac);
    if (plain !== "secret group message") throw new Error("decryption mismatch");
    pass("Full encrypt/decrypt round-trip");
  } catch (e) { fail("Full encrypt/decrypt round-trip", e); }

  // Wrap/unwrap sender key
  try {
    const senderKey = randomBytes(16);
    const sharedSec = randomBytes(32);
    const wrapped = wrapSenderKey(senderKey, sharedSec);
    const recovered = unwrapSenderKey(wrapped.encryptedKey, wrapped.nonce, wrapped.mac, sharedSec);
    if (gcBufToB64(recovered) !== gcBufToB64(senderKey)) throw new Error("key mismatch");
    pass("Sender key wrap/unwrap");
  } catch (e) { fail("Sender key wrap/unwrap", e); }
}

// Run tests in development mode automatically
if (import.meta.env?.DEV) runGroupCryptoSelfTest();

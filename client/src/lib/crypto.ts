const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Utility to convert ArrayBuffer to Hex string
function buf2hex(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

// Utility to convert ArrayBuffer to Base64
function buf2base64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Utility to convert Base64 to ArrayBuffer
function base642buf(base64: string): Uint8Array {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}

export const CryptoHelper = {
    async generateKey() {
        // Generate a random 32-byte key for the URL
        const key = crypto.getRandomValues(new Uint8Array(32));
        return buf2hex(key.buffer);
    },

    // 1. Derive T (Auth Token) and S (Server Verify Hash)
    async deriveAuthKeys(rawKey: string) {
        // Import rawKey as HMAC key
        const baseKey = await crypto.subtle.importKey(
            'raw', 
            encoder.encode(rawKey), 
            { name: 'HMAC', hash: 'SHA-256' }, 
            false, 
            ['sign']
        );

        // T = HMAC(K, "auth_token_purpose")
        const tBuf = await crypto.subtle.sign(
            'HMAC', 
            baseKey, 
            encoder.encode('auth_token_purpose')
        );

        // Import T as a new Key to derive S
        const tKey = await crypto.subtle.importKey(
            'raw', 
            tBuf, 
            { name: 'HMAC', hash: 'SHA-256' }, 
            false, 
            ['sign']
        );

        // S = HMAC(T, "server_verify_purpose")
        const sBuf = await crypto.subtle.sign(
            'HMAC', 
            tKey, 
            encoder.encode('server_verify_purpose')
        );
        
        return {
            token: buf2hex(tBuf),     // T: Sent to server to join
            serverHash: buf2hex(sBuf) // S: Sent to server to create room (verification)
        };
    },

    // 2. AES-GCM Encrypt
    async encrypt(text: string, rawKey: string) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this._importAESKey(rawKey);
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, 
            key, 
            encoder.encode(text)
        );

        return {
            ciphertext: buf2base64(encrypted),
            iv: buf2base64(iv.buffer)
        };
    },

    // 3. AES-GCM Decrypt
    async decrypt(payload: { ciphertext: string; iv: string }, rawKey: string) {
        try {
            const key = await this._importAESKey(rawKey);
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: base642buf(payload.iv) as BufferSource },
                key,
                base642buf(payload.ciphertext) as BufferSource
            );
            return decoder.decode(decrypted);
        } catch (e) {
            console.error("Decryption failed:", e);
            return null; // Failed to decrypt (wrong key or tampered)
        }
    },

    async _importAESKey(rawKey: string) {
        // Hash the rawKey to ensure 256-bit fixed length for AES
        const hash = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey));
        return crypto.subtle.importKey(
            'raw', 
            hash, 
            'AES-GCM', 
            false, 
            ['encrypt', 'decrypt']
        );
    }
};

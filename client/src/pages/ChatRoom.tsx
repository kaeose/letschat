import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { Send, Copy, Users, LogOut, ShieldCheck, AlertCircle, Menu, X, Smile, Image as ImageIcon } from 'lucide-react';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import { CryptoHelper } from '../lib/crypto';
import clsx from 'clsx';

interface MessageContent {
    type: 'text' | 'image';
    content: string;
}

interface Message {
    id: string;
    senderId: string;
    content: MessageContent; // Parsed content
    timestamp: number;
    isSystem?: boolean;
    senderName?: string;
}

interface User {
    id: string;
    encryptedUsername: string;
    displayName?: string; // Decrypted locally
}

export function ChatRoom() {
    const { id: roomId } = useParams();
    const { hash, state, search, pathname } = useLocation();
    const navigate = useNavigate();
    
    // 1. Determine Key and Server (Priority: State > URL)
    // We try to grab them from state first (clean URL mode), then from URL (first load)
    const urlSearchParams = new URLSearchParams(search);
    
    const rawKey = state?.key || (hash.length > 1 ? hash.substring(1) : "");
    const serverUrl = state?.server || urlSearchParams.get('server') || 'http://localhost:3001';
    
    // State
    const [username, setUsername] = useState<string>(state?.username || "");
    const [joinName, setJoinName] = useState("");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'joining'>('joining');
    const [myId, setMyId] = useState<string>("");
    
    const socketRef = useRef<Socket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 2. Auto-Hide URL Secrets (Masking)
    useEffect(() => {
        // If we have secrets in the URL (hash or search), move them to State and clean URL
        if (hash || search) {
            navigate(pathname, {
                replace: true,
                state: { 
                    key: rawKey, 
                    server: serverUrl, 
                    username: username // Preserve username if it exists
                }
            });
        }
    }, [hash, search, pathname, rawKey, serverUrl, username, navigate]);

    // 3. Connection Logic
    useEffect(() => {
        if (!roomId || !rawKey) {
            if (!hash && !state?.key) {
                // Only redirect if we truly have no key in URL OR State
                navigate('/');
            }
            return;
        }
        
        // If we don't have a username yet, don't connect. Wait for user input.
        if (!username) {
            setStatus('joining');
            return;
        }

        setStatus('connecting');
        let activeSocket: Socket | null = null;
        let mounted = true;

        const init = async () => {
            try {
                // 1. Derive Auth Token
                const keys = await CryptoHelper.deriveAuthKeys(rawKey);
                
                if (!mounted) return;

                // 2. Encrypt My Username
                const encryptedNameObj = await CryptoHelper.encrypt(username, rawKey);
                // We combine IV and Ciphertext for transport: iv:ciphertext
                const packedName = `${encryptedNameObj.iv}:${encryptedNameObj.ciphertext}`;

                // 3. Connect Socket
                const socket = io(serverUrl, {
                    auth: {
                        chatId: roomId,
                        token: keys.token,
                        encryptedUsername: packedName
                    }
                });

                activeSocket = socket;
                socketRef.current = socket;

                socket.on('connect', () => {
                    if (mounted) {
                        setStatus('connected');
                        setMyId(socket.id || "");
                    }
                });

                socket.on('connect_error', (err) => {
                    console.error("Connection Error:", err.message);
                    if (mounted) setStatus('error');
                });

                socket.on('room_users', async (serverUsers: User[]) => {
                    if (!mounted) return;
                    // Decrypt all usernames
                    const decryptedUsers = await Promise.all(serverUsers.map(async u => {
                        const name = await decryptString(u.encryptedUsername, rawKey);
                        return { ...u, displayName: name || "Unknown" };
                    }));
                    setUsers(decryptedUsers);
                });

                socket.on('user_joined', async (user: User) => {
                    if (!mounted) return;
                    const name = await decryptString(user.encryptedUsername, rawKey);
                    const decryptedUser = { ...user, displayName: name || "Unknown" };
                    setUsers(prev => [...prev, decryptedUser]);
                    addSystemMessage(`${name || "Someone"} joined the secure channel.`);
                });

                socket.on('user_left', async (user: User) => {
                    if (!mounted) return;
                    const name = await decryptString(user.encryptedUsername, rawKey);
                    setUsers(prev => prev.filter(u => u.id !== user.id));
                    addSystemMessage(`${name || "Someone"} left.`);
                });

                socket.on('msg', async (payload: { ciphertext: string; iv: string; senderId: string }) => {
                    if (!mounted) return;
                    const decryptedText = await CryptoHelper.decrypt(payload, rawKey);
                    if (decryptedText) {
                        let content: MessageContent;
                        try {
                            const parsed = JSON.parse(decryptedText);
                            if (parsed && (parsed.type === 'text' || parsed.type === 'image') && typeof parsed.content === 'string') {
                                content = parsed;
                            } else {
                                content = { type: 'text', content: decryptedText };
                            }
                        } catch {
                            content = { type: 'text', content: decryptedText };
                        }

                        setMessages(prev => [...prev, {
                            id: Math.random().toString(36),
                            senderId: payload.senderId,
                            content: content,
                            timestamp: Date.now()
                        }]);
                    }
                });

            } catch (e) {
                console.error(e);
                if (mounted) setStatus('error');
            }
        };

        init();

        return () => {
            mounted = false;
            if (activeSocket) {
                activeSocket.disconnect();
            }
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [roomId, rawKey, serverUrl, username]); 

    // Helper to decrypt packed string "iv:ciphertext"
    const decryptString = async (packed: string, key: string) => {
        if (!packed || !packed.includes(':')) return null;
        const [iv, ciphertext] = packed.split(':');
        return await CryptoHelper.decrypt({ iv, ciphertext }, key);
    };

    const addSystemMessage = (text: string) => {
        setMessages(prev => [...prev, {
            id: Math.random().toString(),
            senderId: "system",
            content: { type: 'text', content: text },
            timestamp: Date.now(),
            isSystem: true
        }]);
    };

    const sendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inputValue.trim() || !socketRef.current) return;

        const text = inputValue;
        setInputValue("");
        setShowEmojiPicker(false);

        await sendEncryptedMessage({ type: 'text', content: text });
    };

    const sendEncryptedMessage = async (content: MessageContent) => {
        if (!socketRef.current) return;

        // Encrypt JSON string
        const jsonString = JSON.stringify(content);
        const encrypted = await CryptoHelper.encrypt(jsonString, rawKey);
        
        // Optimistic UI update
        setMessages(prev => [...prev, {
            id: Math.random().toString(),
            senderId: socketRef.current?.id || "me",
            content: content,
            timestamp: Date.now()
        }]);

        // Send
        socketRef.current.emit('msg', { ...encrypted, senderId: socketRef.current.id });
    };

    const handleEmojiClick = (emojiData: EmojiClickData) => {
        setInputValue(prev => prev + emojiData.emoji);
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !socketRef.current) return;

        // Check size (e.g. 5MB limit to be safe for now)
        if (file.size > 5 * 1024 * 1024) {
            alert("Image too large (max 5MB).");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            await sendEncryptedMessage({ type: 'image', content: base64 });
        };
        reader.readAsDataURL(file);
        
        // Reset input
        e.target.value = "";
    };

    const copyLink = () => {
        // Reconstruct the full URL for sharing
        const activeKey = state?.key || "";
        const activeServer = state?.server || "";

        const origin = window.location.origin;
        // BASE_URL includes leading/trailing slashes (e.g., "/letschat/")
        const base = import.meta.env.BASE_URL;
        // Ensure we don't end up with double slashes
        const baseUrl = `${origin}${base}`.replace(/\/$/, ""); 
        
        const encodedServer = encodeURIComponent(activeServer);
        const fullLink = `${baseUrl}/room/${roomId}?server=${encodedServer}#${activeKey}`;
        
        navigator.clipboard.writeText(fullLink);
        alert("Encrypted link copied to clipboard! Share it securely.");
    };

    const handleJoin = () => {
        if (joinName.trim()) {
            // Update History State with ALL info (Key, Server, Username) so it survives refresh
            navigate(pathname, { 
                state: { 
                    key: rawKey,
                    server: serverUrl,
                    username: joinName 
                },
                replace: true 
            });
            setUsername(joinName);
        }
    };

    if (status === 'error') {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-900 text-red-400 flex-col gap-4">
                <AlertCircle className="w-16 h-16" />
                <h2 className="text-2xl font-bold">Access Denied</h2>
                <p className="text-slate-400">Invalid link or authentication failed.</p>
                <button onClick={() => navigate('/')} className="px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 text-white">Go Home</button>
            </div>
        );
    }

    if (!username) {
         return (
            <div className="h-screen flex items-center justify-center bg-slate-900 text-slate-200">
                <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full space-y-6 border border-slate-700">
                    <div className="text-center">
                        <ShieldCheck className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold">Join Secure Room</h2>
                        <p className="text-slate-400 text-sm mt-2">Enter a display name to join this encrypted chat.</p>
                    </div>
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="Display Name"
                            value={joinName}
                            onChange={(e) => setJoinName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                            className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            autoFocus
                        />
                        <button 
                            onClick={handleJoin}
                            disabled={!joinName.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Join Chat
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-[100dvh] bg-slate-900 text-slate-200 overflow-hidden">
            {/* Mobile Backdrop */}
            {isMobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar (Desktop & Mobile) */}
            <div className={clsx(
                "flex flex-col w-64 bg-slate-950 border-r border-slate-800 p-4 transition-transform duration-300 ease-in-out z-50",
                "md:translate-x-0 md:static md:h-auto", // Desktop: Always visible, static
                "fixed inset-y-0 left-0", // Mobile: Fixed position
                isMobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full" // Mobile: Toggle visibility
            )}>
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                        <ShieldCheck className="w-6 h-6" />
                        <span>Secure Room</span>
                    </div>
                    {/* Close button for mobile */}
                    <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                    <div className="flex items-center gap-2 text-slate-500 mb-4 text-sm uppercase tracking-wider font-semibold">
                        <Users className="w-4 h-4" />
                        <span>Online ({users.length})</span>
                    </div>
                    <ul className="space-y-2">
                        {users.map(u => (
                            <li key={u.id} className={clsx("flex items-center gap-2 p-2 rounded", u.id === myId ? "bg-slate-800/50 text-blue-300" : "text-slate-400")}>
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                <span className="truncate text-sm font-medium">{u.displayName} {u.id === myId && "(You)"}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-500 hover:text-red-400 transition-colors mt-4 text-sm">
                    <LogOut className="w-4 h-4" />
                    Leave Room
                </button>
            </div>

            {/* Main Chat */}
            <div className="flex-1 flex flex-col relative w-full">
                {/* Header */}
                <div className="h-16 border-b border-slate-800 flex items-center justify-between px-4 md:px-6 bg-slate-900/50 backdrop-blur z-10">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="md:hidden p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="font-semibold text-white">Anonymous Chat</h1>
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                Encrypted
                            </div>
                        </div>
                    </div>
                    <button onClick={copyLink} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 rounded-lg text-sm transition-colors border border-blue-600/20">
                        <Copy className="w-4 h-4" />
                        <span className="hidden sm:inline">Copy Link</span>
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="flex justify-center my-4">
                        <span className="text-xs bg-slate-800 text-slate-500 px-3 py-1 rounded-full">
                            Messages are end-to-end encrypted. Not even the server can read them.
                        </span>
                    </div>
                    
                    {messages.map((msg) => {
                        const isMe = msg.senderId === myId;
                        
                        if (msg.isSystem) {
                            return (
                                <div key={msg.id} className="flex justify-center my-2">
                                    <span className="text-xs text-slate-600">{msg.content.content}</span>
                                </div>
                            );
                        }

                        // Find sender name
                        const senderName = users.find(u => u.id === msg.senderId)?.displayName || "Unknown";

                        return (
                            <div key={msg.id} className={clsx("flex flex-col max-w-[80%]", isMe ? "ml-auto items-end" : "mr-auto items-start")}>
                                <span className="text-[10px] text-slate-500 mb-1 px-1">{isMe ? "You" : senderName}</span>
                                <div className={clsx(
                                    "px-4 py-2 rounded-2xl break-words overflow-hidden",
                                    isMe ? "bg-blue-600 text-white rounded-tr-sm" : "bg-slate-800 text-slate-200 rounded-tl-sm",
                                    msg.content.type === 'image' && "p-1" // Less padding for images
                                )}>
                                    {msg.content.type === 'image' ? (
                                        <img 
                                            src={msg.content.content} 
                                            alt="Encrypted attachment" 
                                            className="max-w-full max-h-[300px] rounded-xl object-contain" 
                                        />
                                    ) : (
                                        msg.content.content
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-2 md:p-4 bg-slate-900 border-t border-slate-800 relative shrink-0">
                    {/* Emoji Picker Popover */}
                    {showEmojiPicker && (
                        <div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-xl overflow-hidden border border-slate-700">
                             <EmojiPicker 
                                theme={Theme.DARK} 
                                onEmojiClick={handleEmojiClick}
                                width={300}
                                height={400}
                            />
                        </div>
                    )}

                    <form onSubmit={sendMessage} className="flex gap-1 md:gap-2 max-w-4xl mx-auto items-center">
                        <button 
                            type="button"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className={clsx(
                                "p-2 rounded-xl transition-colors shrink-0", 
                                showEmojiPicker ? "bg-slate-800 text-blue-400" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                            )}
                        >
                            <Smile className="w-6 h-6" />
                        </button>

                        <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors shrink-0"
                        >
                            <ImageIcon className="w-6 h-6" />
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            className="hidden" 
                            accept="image/*"
                            onChange={handleImageSelect}
                        />

                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onClick={() => setShowEmojiPicker(false)}
                            placeholder="Type a secure message..."
                            className="flex-1 min-w-0 bg-slate-800 border-slate-700 border text-slate-200 rounded-xl px-3 py-2 md:px-4 md:py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-600"
                        />
                        <button 
                            type="submit" 
                            disabled={!inputValue.trim()}
                            className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-3 py-2 md:px-4 md:py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

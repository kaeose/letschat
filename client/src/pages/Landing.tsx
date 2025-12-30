import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { CryptoHelper } from '../lib/crypto';
import { api } from '../lib/api';

export function Landing() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState("");
    const [relayUrl, setRelayUrl] = useState("https://letschat-03sh.onrender.com");

    const handleCreate = async () => {
        if (!username.trim()) {
            alert("Please enter a username");
            return;
        }
        if (!relayUrl.trim()) {
            alert("Please enter a Relay Server URL");
            return;
        }

        try {
            setLoading(true);
            // 1. Generate local secret key
            const rawKey = await CryptoHelper.generateKey();
            
            // 2. Derive verification keys
            const { serverHash } = await CryptoHelper.deriveAuthKeys(rawKey);
            
            // 3. Register room on server (only sending the verification hash)
            const { chatId } = await api.createRoom(relayUrl, serverHash);
            
            // 4. Redirect to room DIRECTLY with State (Clean URL from the start)
            // We pass key and server in state so they never appear in the address bar for the creator.
            navigate(`/room/${chatId}`, { 
                state: { 
                    username,
                    key: rawKey,
                    server: relayUrl
                } 
            });
        } catch (e) {
            console.error(e);
            alert("Failed to create room: " + (e instanceof Error ? e.message : String(e)));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
            <div className="max-w-md w-full text-center space-y-6 my-auto">
                <div className="flex justify-center">
                    <div className="bg-blue-600/20 p-5 rounded-full ring-1 ring-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                        <Shield className="w-12 h-12 text-blue-400" />
                    </div>
                </div>

                <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 pb-2">
                    LetsChat
                </h1>

                <div className="pt-4 space-y-4">
                    <div className="space-y-2 text-left">
                        <label className="text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Username</label>
                        <input
                            type="text"
                            placeholder="Enter your username..."
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-6 py-4 bg-slate-800/50 border border-slate-700 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-slate-600 transition-all"
                        />
                    </div>

                    <div className="space-y-2 text-left">
                        <label className="text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Relay Server</label>
                        <input
                            type="text"
                            placeholder="https://letschat-03sh.onrender.com"
                            value={relayUrl}
                            onChange={(e) => setRelayUrl(e.target.value)}
                            className="w-full px-6 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-slate-600 transition-all font-mono text-sm"
                        />
                        <div className="px-1 pt-1">
                            <p className="text-xs text-slate-500 leading-normal">
                                <span className="text-amber-500/80 font-semibold">Demo Notice:</span> This default server is for demonstration only. Please 
                                <a href="https://github.com/kaeose/letschat" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline mx-1">
                                    deploy your own relay server
                                </a> 
                                from the source code.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleCreate}
                        disabled={loading || !username.trim() || !relayUrl.trim()}
                        className="group relative inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold text-white transition-all duration-200 bg-blue-600 rounded-xl hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <div className="flex items-center">
                                <Loader2 className="w-6 h-6 animate-spin mr-3" />
                                <span>Creating secure room...</span>
                            </div>
                        ) : (
                            <>
                                <Lock className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
                                Create Secure Room
                                <ArrowRight className="w-5 h-5 ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                            </>
                        )}
                    </button>
                </div>
            </div>
            
            <div className="mt-12 text-slate-600 text-[10px] sm:text-xs text-center max-w-sm pb-4">
                Encryption happens in your browser using AES-GCM. 
                The URL hash contains the key and is never sent to the server.
            </div>
        </div>
    );
}

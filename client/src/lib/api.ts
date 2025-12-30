export const api = {
    async createRoom(baseUrl: string, serverHash: string) {
        // Remove trailing slash if present
        const cleanUrl = baseUrl.replace(/\/$/, "");
        const res = await fetch(`${cleanUrl}/api/room/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverHash })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{ chatId: string }>;
    }
};
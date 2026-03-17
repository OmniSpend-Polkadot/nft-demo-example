import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";

const AUCTIONEER_URL = "http://localhost:3001";

// Intent status types
export type IntentStatus =
    | "pending"
    | "solver_accepted"
    | "origin_escrow_started"
    | "origin_escrow_complete"
    | "destination_executing"
    | "destination_success"
    | "destination_failed"
    | "completed";

export interface IntentStep {
    status: IntentStatus;
    message: string;
    txHash?: string;
    timestamp: number;
}

export interface Intent {
    requestId: string;
    status: IntentStatus;
    currentStep: number;
    steps: IntentStep[];
    legs: { chain: string; chainId: number; amount: string }[];
    totalOutputAmount: string;
    winnerName: string;
    nftName?: string;
    createdAt: number;
    updatedAt: number;
}

interface IntentUpdate {
    requestId: string;
    status: IntentStatus;
    message: string;
    txHash?: string;
    step: number;
    legs?: { chain: string; chainId: number; amount: string }[];
    totalOutputAmount?: string;
    winnerName?: string;
}

// LocalStorage helpers
const STORAGE_KEY = "omnispend_intents";

function getStoredIntents(): Record<string, Intent> {
    if (typeof window === "undefined") return {};
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

function saveIntent(intent: Intent): void {
    if (typeof window === "undefined") return;
    const intents = getStoredIntents();
    intents[intent.requestId] = intent;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(intents));
}

export function useIntentTracker(userAddress?: string) {
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [currentIntent, setCurrentIntent] = useState<Intent | null>(null);
    const [intents, setIntents] = useState<Record<string, Intent>>({});

    // Load stored intents on mount
    useEffect(() => {
        setIntents(getStoredIntents());
    }, []);

    // Connect to Socket.io when userAddress is available
    useEffect(() => {
        if (!userAddress) return;

        // Clean up old connection
        if (socketRef.current) {
            socketRef.current.disconnect();
        }

        const socket = io(`${AUCTIONEER_URL}/client`, {
            query: { address: userAddress },
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socket.on("connect", () => {
            console.log("🔌 Connected to intent tracker");
            setIsConnected(true);

            // Re-subscribe to any stored intents
            const stored = getStoredIntents();
            Object.keys(stored).forEach((requestId) => {
                socket.emit("subscribe_intent", requestId);
            });
        });

        socket.on("disconnect", () => {
            console.log("🔌 Disconnected from intent tracker");
            setIsConnected(false);
        });

        socket.on("intent_update", (data: IntentUpdate) => {
            console.log("📊 Intent update received:", data);

            const newIntent: Intent = {
                requestId: data.requestId,
                status: data.status,
                currentStep: data.step,
                steps: [
                    ...(intents[data.requestId]?.steps || []),
                    {
                        status: data.status,
                        message: data.message,
                        txHash: data.txHash,
                        timestamp: Date.now(),
                    },
                ],
                legs: data.legs || [],
                totalOutputAmount: data.totalOutputAmount || "0",
                winnerName: data.winnerName || "",
                createdAt: intents[data.requestId]?.createdAt || Date.now(),
                updatedAt: Date.now(),
            };

            // Save to state and localStorage
            setCurrentIntent(newIntent);
            setIntents((prev) => {
                const updated = { ...prev, [data.requestId]: newIntent };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                return updated;
            });
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
        };
    }, [userAddress]);

    // Subscribe to specific intent
    const subscribeToIntent = useCallback((requestId: string) => {
        console.log("📡 Subscribing to intent:", requestId);

        if (socketRef.current?.connected) {
            socketRef.current.emit("subscribe_intent", requestId);
        }

        // Poll REST API for updates (backup for WebSocket)
        const pollInterval = setInterval(() => {
            fetch(`${AUCTIONEER_URL}/api/intent/${requestId}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.requestId && data.status) {
                        const intent: Intent = {
                            requestId: data.requestId,
                            status: data.status,
                            currentStep: data.currentStep,
                            steps: data.steps || [],
                            legs: data.legs || [],
                            totalOutputAmount: data.totalOutputAmount || "0",
                            winnerName: data.winnerName || "",
                            nftName: data.nftName,
                            createdAt: data.createdAt,
                            updatedAt: data.updatedAt,
                        };
                        setCurrentIntent(intent);
                        setIntents((prev) => {
                            const updated = { ...prev, [requestId]: intent };
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                            return updated;
                        });

                        // Stop polling if completed
                        if (data.status === "completed" || data.status === "destination_success" || data.status === "destination_failed") {
                            console.log("🎉 Intent final status received, stopping poll");
                            clearInterval(pollInterval);
                        }
                    }
                })
                .catch(console.error);
        }, 3000); // Poll every 3 seconds

        // Initial fetch
        fetch(`${AUCTIONEER_URL}/api/intent/${requestId}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.requestId) {
                    const intent: Intent = {
                        requestId: data.requestId,
                        status: data.status,
                        currentStep: data.currentStep,
                        steps: data.steps || [],
                        legs: data.legs || [],
                        totalOutputAmount: data.totalOutputAmount || "0",
                        winnerName: data.winnerName || "",
                        nftName: data.nftName,
                        createdAt: data.createdAt,
                        updatedAt: data.updatedAt,
                    };
                    setCurrentIntent(intent);
                    setIntents((prev) => {
                        const updated = { ...prev, [requestId]: intent };
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                        return updated;
                    });
                }
            })
            .catch(console.error);

        // Return cleanup function
        return () => clearInterval(pollInterval);
    }, []);

    // Unsubscribe from intent
    const unsubscribeFromIntent = useCallback((requestId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit("unsubscribe_intent", requestId);
        }
    }, []);

    // Get all intents for user
    const getUserIntents = useCallback((): Intent[] => {
        return Object.values(intents).sort((a, b) => b.createdAt - a.createdAt);
    }, [intents]);

    // Clear intent history
    const clearHistory = useCallback(() => {
        setIntents({});
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        isConnected,
        currentIntent,
        intents,
        subscribeToIntent,
        unsubscribeFromIntent,
        getUserIntents,
        clearHistory,
    };
}

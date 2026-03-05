import { useState, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const AUCTIONEER_URL = "http://localhost:3001";

export interface SolverBid {
    solverAddress: string;
    solverName: string;
    fee: string; // in USDC
    requestId: string;
}

export interface AuctionResult {
    requestId: string;
    winner: SolverBid | null;
    allBids: SolverBid[];
    auctionDurationMs: number;
}

export function useAuctioneer() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    // Note: the widget acts as an API client, it doesn't need to connect via WebSocket.
    // The solvers connect via WebSocket. The Widget asks for quotes via REST to the Auctioneer,
    // who then broadcasts via WebSocket.

    const requestQuote = useCallback(async (
        user: string,
        legs: { chain: string; chainId: number; amount: string }[],
        destination: { chain: string; chainId: number },
        totalOutputAmount: string,
        target: string,
        callData: string
    ): Promise<AuctionResult> => {
        const requestId = `rfq-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const payload = {
            requestId,
            user,
            legs,
            destination,
            totalOutputAmount,
            target,
            callData
        };

        const response = await fetch(`${AUCTIONEER_URL}/api/request-quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch quote: ${response.statusText}`);
        }

        return response.json();
    }, []);

    const submitSignature = useCallback(async (
        requestId: string,
        winnerAddress: string,
        signedPayload: any
    ) => {
        const response = await fetch(`${AUCTIONEER_URL}/api/submit-signature`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId, winnerAddress, signedPayload }),
        });

        if (!response.ok) {
            throw new Error(`Failed to submit signature: ${response.statusText}`);
        }

        return response.json();
    }, []);

    return { requestQuote, submitSignature };
}

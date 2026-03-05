import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuctioneer } from "../hooks/useAuctioneer";
import type { AuctionResult } from "../hooks/useAuctioneer";
import { useWeb3 } from "../hooks/useWeb3";
import { ethers } from "ethers";

// Constants matching our deployed contracts
const ORIGIN_SETTLER_OP = "0xd2839302132984bE900Fbd769F043721A7d8Bb7C";
const ORIGIN_SETTLER_BASE = "0xDc38039f0FB91BF79b4AF1cD83220D1f65b50AaC";
const USDC_OP = "0x5fd84259d66Cd46123540766Be93DFE6D43130D7";
const USDC_BASE = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const DEST_CHAIN_ID = 420420417; // Polkadot Paseo
const MOCK_NFT_TARGET = "0x8496f66335596483d65e9FC9E03F70B21Ee1C6ba";

type WidgetState = "INPUT" | "REQUESTING_QUOTE" | "QUOTE_REVIEW" | "SIGNING" | "SUCCESS";

export function OmniSpendWidget() {
    const { address, connect, isConnecting, signOrder } = useWeb3();
    const { requestQuote, submitSignature } = useAuctioneer();

    const [uiState, setUiState] = useState<WidgetState>("INPUT");
    const [auctionResult, setAuctionResult] = useState<AuctionResult | null>(null);
    const [totalOutput] = useState("5.0"); // Fixed for demo: 5 USDC NFT

    // Hardcoded legs for demo: user paying from OP and Base
    const legs = [
        { chain: "OP Sepolia", chainId: 11155420, amount: "2.0" },
        { chain: "Base Sepolia", chainId: 84532, amount: "3.0" }
    ];

    // React Query Mutation to fetch RFQ Quote
    const quoteMutation = useMutation({
        mutationFn: () => requestQuote(
            address || "0xDEMO",
            legs,
            { chain: "Polkadot Paseo", chainId: DEST_CHAIN_ID },
            totalOutput,
            MOCK_NFT_TARGET,
            "0x" // Empty calldata for MockNFT
        ),
        onMutate: () => setUiState("REQUESTING_QUOTE"),
        onSuccess: (data) => {
            setAuctionResult(data);
            setUiState("QUOTE_REVIEW");
        },
        onError: (err) => {
            console.error(err);
            setUiState("INPUT");
            alert("Failed to get quote from solvers.");
        }
    });

    // React Query Mutation for Execution
    const executeMutation = useMutation({
        mutationFn: async () => {
            if (!auctionResult?.winner) throw new Error("No winning quote");

            // For demo, we sign the OP Sepolia leg
            const amountInWei = ethers.parseUnits(legs[0].amount, 6); // 2.0 USDC
            const amountOutWei = ethers.parseUnits("2.5", 6); // Just proportional output for mock
            const solverFeeWei = ethers.parseUnits(auctionResult.winner.fee, 6);

            const signedData = await signOrder(
                ORIGIN_SETTLER_OP,
                USDC_OP,
                amountInWei,
                BigInt(DEST_CHAIN_ID),
                amountOutWei,
                MOCK_NFT_TARGET,
                solverFeeWei,
                auctionResult.winner.solverAddress
            );

            return submitSignature(auctionResult.requestId, auctionResult.winner.solverAddress, signedData);
        },
        onMutate: () => setUiState("SIGNING"),
        onSuccess: () => setUiState("SUCCESS"),
        onError: (err) => {
            console.error(err);
            setUiState("QUOTE_REVIEW");
            alert("Signature rejected or execution failed.");
        }
    });

    return (
        <div className="w-full max-w-md mx-auto glass-panel rounded-2xl p-6 shadow-2xl transition-all duration-300">

            {/* HEADER */}
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <span className="bg-blue-500 text-white p-1 rounded-md text-xs">JIT</span>
                    OmniSpend
                </h2>
                {address ? (
                    <div className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
                        {address.slice(0, 6)}...{address.slice(-4)}
                    </div>
                ) : (
                    <button
                        onClick={connect}
                        disabled={isConnecting}
                        className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-full transition-colors font-medium border border-blue-400/30"
                    >
                        {isConnecting ? "Connecting..." : "Connect Wallet"}
                    </button>
                )}
            </div>

            {/* STATE 1: INPUT */}
            {uiState === "INPUT" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

                    <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Pay From</p>
                        {legs.map((leg, i) => (
                            <div key={i} className="flex justify-between items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${leg.chain.includes('OP') ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                        {leg.chain.substring(0, 2)}
                                    </div>
                                    <span className="font-medium text-slate-200">{leg.chain}</span>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono text-lg text-white">{leg.amount} <span className="text-sm text-slate-400">USDC</span></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-center -my-2 relative z-10">
                        <div className="bg-slate-900 border border-slate-700 p-2 rounded-full">
                            <ArrowRight className="w-5 h-5 text-slate-400 rotate-90" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Receive On</p>
                        <div className="flex justify-between items-center bg-slate-800/80 p-4 rounded-xl border border-slate-600">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-pink-500/20 text-pink-500 flex items-center justify-center text-xs font-bold">
                                    DOT
                                </div>
                                <div>
                                    <div className="font-medium text-slate-200">Polkadot Paseo</div>
                                    <div className="text-xs text-slate-400">Mock NFT Mint</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono text-xl text-white">{totalOutput} <span className="text-sm text-slate-400">USDC</span></div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => quoteMutation.mutate()}
                        disabled={!address}
                        className="w-full mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {address ? "Get Firm Quote" : "Connect Wallet to Continue"}
                    </button>
                </div>
            )}

            {/* STATE 2: REQUESTING QUOTE */}
            {uiState === "REQUESTING_QUOTE" && (
                <div className="py-12 flex flex-col items-center justify-center space-y-6 text-center animate-in fade-in duration-300">
                    <div className="relative w-20 h-20">
                        <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold text-blue-400">RFQ</span>
                        </div>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white mb-2">Broadcasting to Solvers</h3>
                        <p className="text-slate-400 text-sm max-w-[250px]">
                            Waiting 500ms for solvers to submit their lowest execution fees...
                        </p>
                    </div>
                </div>
            )}

            {/* STATE 3: QUOTE REVIEW */}
            {uiState === "QUOTE_REVIEW" && auctionResult && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">

                    <div className="bg-blue-950/40 p-5 rounded-xl border border-blue-500/20 flex flex-col items-center text-center">
                        {auctionResult.winner ? (
                            <>
                                <div className="text-blue-400 font-semibold mb-1 text-sm uppercase tracking-wider">Winning Quote</div>
                                <div className="text-3xl font-bold text-white font-mono mb-2">
                                    <span className="text-slate-400 text-lg line-through mr-2">
                                        {auctionResult.allBids.length > 1 ? `${Math.max(...auctionResult.allBids.map(b => parseFloat(b.fee)))}` : ""}
                                    </span>
                                    {auctionResult.winner.fee} <span className="text-lg text-slate-400">USDC</span>
                                </div>
                                <div className="text-xs text-slate-500">
                                    from {auctionResult.winner.solverName} ({auctionResult.winner.solverAddress.slice(0, 6)}...)
                                </div>
                            </>
                        ) : (
                            <div className="text-red-400 py-4 font-medium flex items-center gap-2">
                                <AlertCircle className="w-5 h-5" />
                                No solvers responded
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Target Output</span>
                            <span className="text-white font-mono">{totalOutput} USDC</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Solver Execution Fee</span>
                            <span className="text-white font-mono">{auctionResult.winner?.fee || "0.0"} USDC</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Protocol Fee (0.3% origin)</span>
                            <span className="text-blue-400 font-mono">0.015 USDC</span>
                        </div>
                        <div className="h-px w-full bg-slate-700 my-2"></div>
                        <div className="flex justify-between font-bold text-lg">
                            <span className="text-slate-200">You Pay</span>
                            <span className="text-white font-mono">
                                {parseFloat(totalOutput) + (parseFloat(auctionResult.winner?.fee || "0")) + 0.015} USDC
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setUiState("INPUT")}
                            disabled={executeMutation.isPending}
                            className="px-6 py-4 rounded-xl text-slate-300 font-medium hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => executeMutation.mutate()}
                            disabled={!auctionResult.winner || executeMutation.isPending}
                            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {executeMutation.isPending ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Signing...</>
                            ) : (
                                "Sign & Pay"
                            )}
                        </button>
                    </div>

                    <p className="text-xs text-center text-slate-500">
                        By signing, you exclusively allow {auctionResult.winner?.solverName || "this solver"} to execute this transaction, preventing MEV front-running.
                    </p>
                </div>
            )}

            {/* STATE 4: SUCCESS */}
            {uiState === "SUCCESS" && (
                <div className="py-12 flex flex-col items-center justify-center space-y-6 text-center animate-in zoom-in-95 duration-500">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mt-4">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white mb-2">Intent Sent to Solver!</h3>
                        <p className="text-slate-400 text-sm max-w-[280px] mx-auto">
                            Your signature has been forwarded exclusively to the winning solver. They are executing the transaction right now.
                        </p>
                    </div>
                    <button
                        onClick={() => setUiState("INPUT")}
                        className="mt-8 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors border border-blue-500/30 px-6 py-2 rounded-full"
                    >
                        Start New Payment
                    </button>
                </div>
            )}

        </div>
    );
}

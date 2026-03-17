import { useState } from "react";
import type { Route } from "./+types/home";
import { NFTCard } from "../components/NFTCard";
import { useWeb3 } from "../hooks/useWeb3";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "OmniSpend NFT | Cross-Chain Minting" },
    { name: "description", content: "Mint NFTs using funds from multiple chains with OmniSpend" },
  ];
}

export default function Home() {
  const { address, connect, isConnecting } = useWeb3();
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePaymentSuccess = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-pink-600/20 blur-[120px] pointer-events-none" />

      {/* Header */}
      <div className="z-10 w-full mb-8 text-center space-y-2">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-xl">
            <span className="text-2xl">🎨</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300">
            OmniSpend NFT
          </h1>
        </div>
        <p className="text-slate-400 max-w-lg mx-auto">
          Mint NFTs using funds from multiple chains. Powered by JIT Auctions, Permit2, and permissionless solvers.
        </p>
      </div>

      {/* Wallet Connection */}
      <div className="z-20 mb-6">
        {address ? (
          <div className="flex items-center gap-3 bg-slate-800/50 backdrop-blur-sm px-4 py-2 rounded-full border border-slate-700">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-slate-300 font-mono">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          </div>
        ) : (
          <button
            onClick={connect}
            disabled={isConnecting}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded-full transition-colors border border-blue-400/30"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </div>

      {/* NFT Card */}
      <div className="z-20 w-full max-w-md">
        <NFTCard key={refreshKey} onPaymentSuccess={handlePaymentSuccess} />
      </div>

      {/* Footer Links */}
      <div className="z-10 mt-12 flex gap-6 text-sm text-slate-500 font-medium">
        <a href="#" className="hover:text-purple-400 transition-colors">Documentation</a>
        <a href="#" className="hover:text-purple-400 transition-colors">GitHub</a>
        <a href="/mint" className="hover:text-purple-400 transition-colors">Faucet</a>
      </div>
    </div>
  );
}

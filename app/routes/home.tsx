import type { Route } from "./+types/home";
import { OmniSpendWidget } from "../components/OmniSpendWidget";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "OmniSpend | Fast Cross-Chain intent payments" },
    { name: "description", content: "JIT Auction RFQ Widget for OmniSpend" },
  ];
}

export default function Home() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />

      <div className="z-10 w-full mb-8 text-center space-y-2">
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
          Pay From Everywhere
        </h1>
        <p className="text-slate-400 max-w-lg mx-auto">
          Experience instant cross-chain payments powered by JIT Auctions, Permit2, and permissionless solvers.
        </p>
      </div>

      <div className="z-20 w-full">
        <OmniSpendWidget />
      </div>

      <div className="z-10 mt-12 flex gap-6 text-sm text-slate-500 font-medium">
        <a href="#" className="hover:text-blue-400 transition-colors">Documentation</a>
        <a href="#" className="hover:text-blue-400 transition-colors">GitHub</a>
        <a href="#" className="hover:text-blue-400 transition-colors">Solvers</a>
      </div>
    </div>
  );
}

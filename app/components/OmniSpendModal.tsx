import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Loader2, CheckCircle2, AlertCircle, X, Wallet, Check, Clock, Rocket, Shield, Layers, ExternalLink } from "lucide-react";
import { OmniSpend, getUSDCAddress, getOriginSettler, type Quote } from "@omnispend/sdk";
import { useWeb3 } from "../hooks/useWeb3";
import { useIntentTracker } from "@omnispend/sdk";
import type { IntentStatus, IntentStep } from "@omnispend/sdk";
import { ethers } from "ethers";

// SDK configuration
const AUCTIONEER_URL = "http://localhost:3001";
const omnispend = new OmniSpend(AUCTIONEER_URL);

// Constants matching our deployed contracts
const ORIGIN_SETTLER_OP = "0xd2839302132984bE900Fbd769F043721A7d8Bb7C";
const ORIGIN_SETTLER_BASE = "0xDc38039f0FB91BF79b4AF1cD83220D1f65b50AaC";
const USDC_OP = "0x5fd84259d66Cd46123540766Be93DFE6D43130D7";
const USDC_BASE = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_PASEO = "0x9Dd96D4BC333A4A3Bbe1238C03f28Bf4a9c8aCAb";
const DEST_CHAIN_ID = 420420417; // Polkadot Paseo
const MOCK_NFT_TARGET = "0xd5abE7C17F2E5B7840A0D9DE52dC1A85e2111230";

type WidgetState = "INPUT" | "REQUESTING_QUOTE" | "QUOTE_REVIEW" | "SIGNING" | "SUCCESS";

interface LegState {
  name: string;
  chainId: number;
  amount: string;
  enabled: boolean;
}

interface OmniSpendModalProps {
  isOpen: boolean;
  onClose: () => void;
  nftPrice: string;
  nftName: string;
  onSuccess: () => void;
}

// Status to step mapping
const statusToStep: Record<IntentStatus, number> = {
  pending: 0,
  solver_accepted: 1,
  origin_escrow_started: 2,
  origin_escrow_complete: 3,
  destination_executing: 4,
  destination_success: 5,
  destination_failed: -1,
  completed: 5,
};

const stepLabels = [
  { icon: Rocket, label: "Intent Created", desc: "Signatures submitted" },
  { icon: Shield, label: "Solver Accepted", desc: "Quote locked" },
  { icon: Layers, label: "Escrow Secured", desc: "Origin chains" },
  { icon: Clock, label: "Executing", desc: "Destination chain" },
  { icon: Check, label: "Complete", desc: "NFT minted!" },
];

// Helper to get explorer URL based on chain name in message
function getExplorerUrl(message: string): string {
  if (message.includes("OP Sepolia")) {
    return "https://sepolia-optimism.etherscan.io/tx";
  } else if (message.includes("Base")) {
    return "https://sepolia.basescan.org/tx";
  } else if (message.includes("Polkadot") || message.includes("Paseo") || message.includes("NFT")) {
    return "https://polkadot.testnet.routescan.io/tx";
  }
  return "https://polkadot.testnet.routescan.io/tx";
}

// Real Intent Tracker Component - Shows actual solver progress
function IntentTracker({ currentStep, steps, isConnected }: { currentStep: number; steps: IntentStep[]; isConnected: boolean }) {
  const latestStep = steps[steps.length - 1];

  // Get all steps that correspond to each tracker step (for multiple origin chains)
  const getStepsForIndex = (index: number): IntentStep[] => {
    if (index === 0) return steps.filter(s => s.status === "pending");
    if (index === 1) return steps.filter(s => s.status === "solver_accepted");
    if (index === 2) return steps.filter(s => s.status.startsWith("origin_"));
    if (index === 3) return steps.filter(s => s.status === "destination_executing");
    if (index === 4) return steps.filter(s => s.status === "destination_success" || s.status === "completed");
    return [];
  };

  return (
    <div className="space-y-2">
      {stepLabels.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isFailed = currentStep === -1;
        const Icon = step.icon;
        const stepDataList = getStepsForIndex(index);
        const txHashes = stepDataList.filter(s => s.txHash).map(s => s.txHash as string);

        return (
          <div
            key={index}
            className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              isFailed
                ? index === 4 ? "bg-red-500/10" : "bg-green-500/10"
                : isCompleted ? "bg-green-500/10" : isCurrent ? "bg-blue-500/10" : "bg-slate-800/30"
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              isFailed
                ? "bg-red-500/20 text-red-500"
                : isCompleted
                ? "bg-green-500/20 text-green-500"
                : isCurrent
                ? "bg-blue-500/20 text-blue-500 animate-pulse"
                : "bg-slate-700 text-slate-500"
            }`}>
              {isFailed && index === 4 ? (
                <AlertCircle className="w-4 h-4" />
              ) : isCompleted ? (
                <Check className="w-4 h-4" />
              ) : isCurrent ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className={`text-sm font-medium ${isCompleted || isCurrent || isFailed ? "text-white" : "text-slate-500"}`}>
                {step.label}
              </p>
              <p className="text-xs text-slate-400">{step.desc}</p>
              {/* Show txHash links for completed steps that have txHashes */}
              {isCompleted && txHashes.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                  {txHashes.map((txHash, i) => {
                    const stepData = stepDataList.find(s => s.txHash === txHash);
                    const url = getExplorerUrl(stepData?.message || "");
                    return (
                      <a
                        key={i}
                        href={`${url}/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {stepData?.message?.includes("Base") ? "Base" : stepData?.message?.includes("OP") ? "OP" : `Tx ${i + 1}`}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Connection Status */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-2">
        <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-yellow-500"}`} />
        {isConnected ? "Live updates enabled" : "Connecting..."}
      </div>

      {/* Latest Message */}
      {latestStep && (
        <div className="text-xs text-center text-slate-400 bg-slate-800/50 rounded p-2 mt-2">
          {latestStep.message}
        </div>
      )}
    </div>
  );
}

export function OmniSpendModal({ isOpen, onClose, nftPrice, nftName, onSuccess }: OmniSpendModalProps) {
  const { address, connect, isConnecting, signOrder, switchNetwork, fetchBalanceAsync } = useWeb3();
  const { isConnected: trackerConnected, currentIntent, subscribeToIntent } = useIntentTracker(address, AUCTIONEER_URL);

  const [uiState, setUiState] = useState<WidgetState>("INPUT");
  const [auctionResult, setAuctionResult] = useState<Quote | null>(null);
  const [signingProgress, setSigningProgress] = useState("");
  const [requestId, setRequestId] = useState<string>("");

  const [opBalance, setOpBalance] = useState("0.0");
  const [baseBalance, setBaseBalance] = useState("0.0");

  // Default legs that sum to the NFT price
  const [legs, setLegs] = useState<LegState[]>([
    { name: "OP Sepolia", chainId: 11155420, amount: String(Math.floor(parseFloat(nftPrice) * 0.4 * 100) / 100), enabled: true },
    { name: "Base Sepolia", chainId: 84532, amount: String(Math.floor(parseFloat(nftPrice) * 0.6 * 100) / 100), enabled: true }
  ]);

  // Update legs when nftPrice changes
  useEffect(() => {
    const price = parseFloat(nftPrice);
    if (price > 0) {
      setLegs([
        { name: "OP Sepolia", chainId: 11155420, amount: String(Math.floor(price * 0.4 * 100) / 100), enabled: true },
        { name: "Base Sepolia", chainId: 84532, amount: String(Math.floor(price * 0.6 * 100) / 100), enabled: true }
      ]);
    }
  }, [nftPrice]);

  // Fetch balances when address changes
  useEffect(() => {
    if (address && isOpen) {
      fetchBalanceAsync(11155420, USDC_OP, address).then(setOpBalance).catch(console.error);
      fetchBalanceAsync(84532, USDC_BASE, address).then(setBaseBalance).catch(console.error);
    }
  }, [address, fetchBalanceAsync, isOpen]);

  // Subscribe to intent updates when requestId is set
  useEffect(() => {
    if (requestId && uiState === "SUCCESS") {
      subscribeToIntent(requestId);
    }
  }, [requestId, uiState, subscribeToIntent]);

  // Call onSuccess when intent is complete (for refreshing NFT supply)
  // But DON'T call it - it will cause re-render and close the modal
  // Instead, we'll let the user see the success state in the tracker
  useEffect(() => {
    if (currentIntent && (currentIntent.status === "completed" || currentIntent.status === "destination_success")) {
      console.log("🎉 Intent complete! User can now close the modal.");
    }
  }, [currentIntent?.status]);

  // Calculate sum of active legs
  const currentTotal = legs.filter(l => l.enabled).reduce((sum, leg) => sum + (parseFloat(leg.amount) || 0), 0);
  const isValidInput = Math.abs(currentTotal - parseFloat(nftPrice)) < 0.01 && legs.some(l => l.enabled);

  const quoteMutation = useMutation({
    mutationFn: () => {
      const activeLegs = legs.filter(l => l.enabled).map(l => ({
        name: l.name,
        chainId: l.chainId,
        amount: l.amount,
        token: l.chainId === 84532 ? USDC_BASE : USDC_OP
      }));

      // Generate calldata for the NFT purchase
      const iface = new ethers.Interface(["function buyItem(address receiver)"]);
      const callData = address ? iface.encodeFunctionData("buyItem", [address]) : "0x";

      return omnispend.requestQuote(
        address || "0xDEMO",
        activeLegs,
        { name: "Polkadot Paseo", chainId: DEST_CHAIN_ID, target: MOCK_NFT_TARGET, callData, outputAmount: nftPrice },
        MOCK_NFT_TARGET,
        callData
      );
    },
    onMutate: () => setUiState("REQUESTING_QUOTE"),
    onSuccess: (data: Quote) => {
      setAuctionResult(data);
      setUiState("QUOTE_REVIEW");
    },
    onError: (err) => {
      console.error(err);
      setUiState("INPUT");
      alert("Failed to get quote from solvers.");
    }
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!auctionResult?.winner) throw new Error("No winning quote");
      if (!address) throw new Error("User disconnected");

      const activeLegs = legs.filter(l => l.enabled).map(l => ({
        name: l.name,
        chainId: l.chainId,
        amount: l.amount,
        token: l.chainId === 84532 ? USDC_BASE : USDC_OP
      }));
      const signedPayloads = [];
      const totalFeeNumber = parseFloat(auctionResult.winner.fee);

      try {
        for (let i = 0; i < activeLegs.length; i++) {
          const leg = activeLegs[i];

          console.log(`🔄 Processing leg ${i + 1}/${activeLegs.length}: ${leg.name}`);
          setSigningProgress(`Step ${i + 1}/${activeLegs.length}: Switching to ${leg.name}...`);

          await switchNetwork(leg.chainId);

          const targetOriginSettler = leg.chainId === 84532 ? ORIGIN_SETTLER_BASE : ORIGIN_SETTLER_OP;
          const targetUsdc = leg.chainId === 84532 ? USDC_BASE : USDC_OP;

          const legAmountNumber = parseFloat(leg.amount);
          const feeShare = (legAmountNumber / currentTotal) * totalFeeNumber;

          const amountInWei = ethers.parseUnits(leg.amount, 6);
          const amountOutWei = ethers.parseUnits(leg.amount, 6);
          const solverFeeWei = ethers.parseUnits(feeShare.toFixed(6), 6);

          setSigningProgress(`Step ${i + 1}/${activeLegs.length}: Checking USDC approval on ${leg.name}...`);

          setSigningProgress(`Step ${i + 1}/${activeLegs.length}: Please sign on ${leg.name}...`);

          console.log(`✍️ Signing for ${leg.name}...`);
          const signedData = await signOrder(
            targetOriginSettler,
            targetUsdc,
            amountInWei,
            BigInt(DEST_CHAIN_ID),
            amountOutWei,
            MOCK_NFT_TARGET,
            solverFeeWei,
            auctionResult.winner.solverAddress
          );

          console.log(`✅ Signed for ${leg.name}`);
          signedPayloads.push(signedData);
        }
      } catch (err) {
        console.error("❌ Error during signing loop:", err);
        throw err;
      }

      setSigningProgress("Submitting signatures to solver...");
      console.log("📤 Submitting signatures to auctioneer...");

      // Store requestId for tracking
      const rid = auctionResult.requestId;
      setRequestId(rid);

      return omnispend.submitSignature(auctionResult.requestId, auctionResult.winner.solverAddress, {
        isBatch: true,
        payloads: signedPayloads,
      }, {
        user: address,
        legs: activeLegs,
        destination: { name: "Polkadot Paseo", chainId: DEST_CHAIN_ID, target: MOCK_NFT_TARGET, callData: "0x", outputAmount: nftPrice },
        nftName,
      });
    },
    onMutate: () => {
      setUiState("SIGNING");
      setSigningProgress("Preparing transactions...");
    },
    onSuccess: () => {
      console.log("✅ Signatures submitted successfully!");
      setUiState("SUCCESS");
      // Don't call onSuccess() here - it causes parent re-render which closes modal
      // We'll call it when intent is complete or not at all
    },
    onError: (err: any) => {
      console.error("❌ Execute mutation error:", err);
      // Don't close the modal on error - stay in SIGNING state so user can see what happened
      setSigningProgress(`Error: ${err.message || "Unknown error"}. Please try again.`);
      // Keep in SIGNING state so user can see the error
    }
  });

  const handleLegChange = (index: number, field: string, value: any) => {
    const newLegs = [...legs];
    newLegs[index] = { ...newLegs[index], [field]: value };
    setLegs(newLegs);
  };

  const handleClose = () => {
    // Only allow closing if intent is complete or user explicitly wants to close during processing
    const isComplete = currentIntent?.status === "completed" || currentIntent?.status === "destination_success";

    if (uiState === "SUCCESS" && !isComplete) {
      // Show warning that intent is still processing
      if (!confirm("Your intent is still being processed. Are you sure you want to close? You can check your transaction status on the blockchain.")) {
        return;
      }
    }

    setUiState("INPUT");
    setAuctionResult(null);
    setRequestId("");
    onClose();
  };

  // Get current step from intent tracker
  const currentStep = currentIntent ? statusToStep[currentIntent.status] : 0;
  const intentSteps = currentIntent?.steps || [];

  // Debug logging
  console.log("📊 Modal state:", { isOpen, uiState, requestId, signingProgress });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-auto glass-panel rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">

        {/* Close Button */}
        {uiState !== "SIGNING" && uiState !== "SUCCESS" && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <span className="text-xl">🎨</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Pay with OmniSpend</h2>
            <p className="text-sm text-slate-400">{nftName}</p>
          </div>
        </div>

        {/* STATE 1: INPUT */}
        {uiState === "INPUT" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

            {/* Wallet Connect if needed */}
            {!address && (
              <div className="bg-blue-950/40 p-4 rounded-xl border border-blue-500/20 text-center">
                <Wallet className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                <p className="text-sm text-slate-300 mb-3">Connect your wallet to pay</p>
                <button
                  onClick={connect}
                  disabled={isConnecting}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded-lg transition-colors"
                >
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </button>
              </div>
            )}

            {address && (
              <>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Pay From</p>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${isValidInput ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      Total: {currentTotal.toFixed(2)} / {nftPrice} USDC
                    </span>
                  </div>

                  {legs.map((leg, i) => (
                    <div key={i} className={`flex flex-col bg-slate-800/50 p-4 rounded-xl border transition-colors ${leg.enabled ? 'border-slate-600' : 'border-slate-800 opacity-50'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={leg.enabled}
                            onChange={(e) => handleLegChange(i, 'enabled', e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-700 checked:bg-blue-500"
                          />
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${leg.name.includes('OP') ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                            {leg.name.substring(0, 2)}
                          </div>
                          <span className="font-medium text-slate-200">{leg.name}</span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Bal: {leg.name.includes('OP') ? opBalance : baseBalance} USDC
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-9">
                        <input
                          type="number"
                          value={leg.amount}
                          onChange={(e) => handleLegChange(i, 'amount', e.target.value)}
                          disabled={!leg.enabled}
                          step="0.1"
                          min="0"
                          className="bg-slate-900 border border-slate-700 text-white text-lg font-mono rounded-lg px-3 py-1.5 w-full focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                        />
                        <span className="text-sm text-slate-400 font-mono">USDC</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Arrow */}
                <div className="flex justify-center -my-2 relative z-10">
                  <div className="bg-slate-900 border border-slate-700 p-2 rounded-full">
                    <ArrowRight className="w-5 h-5 text-slate-400 rotate-90" />
                  </div>
                </div>

                {/* Destination */}
                <div className="flex justify-between items-center bg-slate-800/80 p-4 rounded-xl border border-slate-600">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-pink-500/20 text-pink-500 flex items-center justify-center text-xs font-bold">
                      DOT
                    </div>
                    <div>
                      <div className="font-medium text-slate-200">Polkadot Paseo</div>
                      <div className="text-xs text-slate-400">NFT Mint</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xl text-white">{nftPrice} <span className="text-sm text-slate-400">USDC</span></div>
                  </div>
                </div>

                <button
                  onClick={() => quoteMutation.mutate()}
                  disabled={!address || !isValidInput}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!address ? "Connect Wallet to Continue"
                    : !isValidInput ? `Amount must equal ${nftPrice}`
                      : "Get Firm Quote"}
                </button>
              </>
            )}
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
                <span className="text-slate-400">NFT Price</span>
                <span className="text-white font-mono">{nftPrice} USDC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Solver Execution Fee</span>
                <span className="text-white font-mono">{auctionResult.winner?.fee || "0.0"} USDC</span>
              </div>
              <div className="h-px w-full bg-slate-700 my-2"></div>
              <div className="flex justify-between font-bold text-lg">
                <span className="text-slate-200">Total</span>
                <span className="text-white font-mono">
                  {(parseFloat(nftPrice) + (parseFloat(auctionResult.winner?.fee || "0"))).toFixed(2)} USDC
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
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50 flex flex-col items-center justify-center"
              >
                {executeMutation.isPending ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Executing...</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-80">{signingProgress}</span>
                  </>
                ) : (
                  "Sign & Pay"
                )}
              </button>
            </div>

            <p className="text-xs text-center text-slate-500">
              By signing, you exclusively allow this solver to execute this transaction.
            </p>
          </div>
        )}

        {/* STATE 3.5: SIGNING - Show signing progress */}
        {uiState === "SIGNING" && (
          <div className="py-12 flex flex-col items-center justify-center space-y-6 text-center animate-in fade-in duration-300">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-blue-400">SIGN</span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Processing Your Intent</h3>
              <p className="text-slate-400 text-sm max-w-[250px]">
                {signingProgress || "Preparing transactions..."}
              </p>
            </div>
            <div className="w-full bg-slate-800/50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-slate-300">Quote accepted</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                <span className="text-slate-300">Signing and submitting...</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Clock className="w-4 h-4" />
                <span>Waiting for solver execution</span>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Please wait while your signatures are processed. Do not close this modal.
            </p>
          </div>
        )}

        {/* STATE 4: SUCCESS with Real-Time Tracker */}
        {uiState === "SUCCESS" && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            {/* Header */}
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Intent Submitted!</h3>
              <p className="text-slate-400 text-sm">Your cross-chain payment is being processed</p>
              {requestId && (
                <p className="text-xs text-slate-500 font-mono mt-1">ID: {requestId.slice(0, 20)}...</p>
              )}
            </div>

            {/* Real-Time Tracker */}
            <IntentTracker
              currentStep={currentIntent ? statusToStep[currentIntent.status] : 0}
              steps={intentSteps}
              isConnected={trackerConnected}
            />

            {/* Summary */}
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total Input</span>
                <span className="text-white font-mono">{currentTotal.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Destination</span>
                <span className="text-white">Polkadot Paseo</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">NFT</span>
                <span className="text-white font-mono">{nftName}</span>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-3 text-xs text-slate-400 text-center">
              Your signatures have been sent to the solver. The solver is now executing the cross-chain transactions. Please keep this modal open to track progress.
            </div>

            <button
              onClick={handleClose}
              className="w-full text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors border border-blue-500/30 px-6 py-2 rounded-full"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { ethers, BrowserProvider, Contract } from "ethers";
import { useWeb3 } from "../hooks/useWeb3";
import { OmniSpendModal } from "./OmniSpendModal";

// NFT Contract on Polkadot Paseo
const NFT_CONTRACT = "0xd5abE7C17F2E5B7840A0D9DE52dC1A85e2111230";
const NFT_ABI = [
  "function itemPrice() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function buyItem(address receiver) returns (uint256)",
  "function totalSupply() view returns (uint256)"
];

const MOCK_USDC_PASEO = "0x9Dd96D4BC333A4A3Bbe1238C03f28Bf4a9c8aCAb";
const USDC_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

interface NFTCardProps {
  onPaymentSuccess?: () => void;
}

export function NFTCard({ onPaymentSuccess }: NFTCardProps) {
  const { address, connect, isConnecting } = useWeb3();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nftPrice, setNftPrice] = useState<string>("0");
  const [totalSupply, setTotalSupply] = useState<number>(0);
  const [userBalance, setUserBalance] = useState<string>("0");
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);

  // Fetch NFT info on mount
  useEffect(() => {
    const fetchNFTInfo = async () => {
      try {
        const provider = new ethers.JsonRpcProvider("https://services.polkadothub-rpc.com/testnet");
        const nftContract = new Contract(NFT_CONTRACT, NFT_ABI, provider);

        const price = await nftContract.itemPrice();
        const supply = await nftContract.totalSupply();

        setNftPrice(ethers.formatUnits(price, 6));
        setTotalSupply(Number(supply));
      } catch (err) {
        console.error("Failed to fetch NFT info:", err);
        // Fallback price for demo
        setNftPrice("4.0");
        setTotalSupply(0);
      } finally {
        setIsLoadingPrice(false);
      }
    };

    fetchNFTInfo();
  }, []);

  // Fetch user USDC balance on Polkadot
  useEffect(() => {
    if (!address) return;

    const fetchBalance = async () => {
      try {
        const provider = new ethers.JsonRpcProvider("https://services.polkadothub-rpc.com/testnet");
        const usdcContract = new Contract(MOCK_USDC_PASEO, USDC_ABI, provider);
        const balance = await usdcContract.balanceOf(address);
        setUserBalance(ethers.formatUnits(balance, 6));
      } catch (err) {
        console.error("Failed to fetch balance:", err);
      }
    };

    fetchBalance();
  }, [address]);

  const handlePayWithOmnispend = () => {
    console.log("🔘 Pay with OmniSpend clicked, address:", address);
    if (!address) {
      console.log("⚠️ No address, calling connect()");
      connect();
      return;
    }
    console.log("✅ Opening modal...");
    setIsModalOpen(true);
  };

  // Debug effect to track isModalOpen changes
  useEffect(() => {
    console.log("📊 NFTCard isModalOpen changed to:", isModalOpen);
  }, [isModalOpen]);

  const handleMintDirectly = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    try {
      const provider = new BrowserProvider(window.ethereum);

      // Switch to Polkadot Paseo
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0x190f1b41" }]);
      } catch {
        // Chain not added, try adding
        await provider.send("wallet_addEthereumChain", [{
          chainId: "0x190f1b41",
          chainName: "Polkadot Paseo Testnet",
          rpcUrls: ["https://services.polkadothub-rpc.com/testnet"],
          nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 18 },
          blockExplorerUrls: ["https://evm.testnet.polkadothub.io/"]
        }]);
      }

      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();

      const usdcContract = new Contract(MOCK_USDC_PASEO, USDC_ABI, signer);
      const nftContract = new Contract(NFT_CONTRACT, NFT_ABI, signer);

      const priceWei = ethers.parseUnits(nftPrice, 6);

      // Check and set approval
      const allowance = await usdcContract.allowance(address, NFT_CONTRACT);
      if (allowance < priceWei) {
        const approveTx = await usdcContract.approve(NFT_CONTRACT, ethers.MaxUint256);
        await approveTx.wait();
      }

      // Mint NFT
      const tx = await nftContract.buyItem(address);
      await tx.wait();

      alert("NFT minted successfully!");
      onPaymentSuccess?.();

      // Refresh supply
      const supply = await nftContract.totalSupply();
      setTotalSupply(Number(supply));
    } catch (err: any) {
      console.error("Mint failed:", err);
      alert(err.message || "Mint failed");
    }
  };

  return (
    <>
      <div className="relative group">
        {/* NFT Card */}
        <div className="glass-panel rounded-2xl p-6 w-full max-w-sm mx-auto transform transition-all duration-300 hover:scale-[1.02]">
          {/* Image */}
          <div className="relative aspect-square rounded-xl overflow-hidden mb-4 bg-gradient-to-br from-purple-600/30 to-pink-600/30">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-8xl">🎨</div>
            </div>
            <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full">
              <span className="text-xs font-medium text-white">#{totalSupply + 1}</span>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-3">
            <div>
              <h3 className="text-xl font-bold text-white">Genesis Art #{(totalSupply || 0) + 1}</h3>
              <p className="text-sm text-slate-400">Limited edition generative art</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Price</p>
                <p className="text-2xl font-bold text-white font-mono">
                  {isLoadingPrice ? "..." : nftPrice} <span className="text-sm text-slate-400">USDC</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Minted</p>
                <p className="text-lg font-semibold text-slate-300">{totalSupply} / 100</p>
              </div>
            </div>

            {/* Balance Display */}
            {address && (
              <div className="bg-slate-800/50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">Your USDC Balance</span>
                <span className="font-mono text-sm text-white">{parseFloat(userBalance).toFixed(2)}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                onClick={handlePayWithOmnispend}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
              >
                <span>⚡</span> Pay with OmniSpend
              </button>

              <button
                onClick={handleMintDirectly}
                disabled={isLoadingPrice}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl transition-all border border-slate-600 flex items-center justify-center gap-2"
              >
                <span>💳</span> Mint Directly
              </button>
            </div>
          </div>
        </div>

        {/* Glow Effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 rounded-3xl blur-xl -z-10 group-hover:opacity-100 opacity-50 transition-opacity" />
      </div>

      {/* OmniSpend Modal */}
      <OmniSpendModal
        isOpen={isModalOpen}
        onClose={() => {
          console.log("🔴 Modal close requested");
          setIsModalOpen(false);
        }}
        nftPrice={nftPrice}
        nftName={`Genesis Art #${(totalSupply || 0) + 1}`}
        onSuccess={() => {
          onPaymentSuccess?.();
          // Refresh supply
          setTotalSupply(prev => prev + 1);
        }}
      />
    </>
  );
}

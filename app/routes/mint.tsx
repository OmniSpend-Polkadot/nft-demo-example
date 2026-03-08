import { useState, useEffect } from "react";
import { ethers, BrowserProvider, Contract } from "ethers";
import { useWeb3 } from "../hooks/useWeb3";

// Polkadot Paseo Deployed Addresses
const MOCK_USDC_ADDRESS = "0x9Dd96D4BC333A4A3Bbe1238C03f28Bf4a9c8aCAb";
const PASEO_CHAIN_ID_HEX = "0x190f1b41"; // 420420417 in hex

// Basic ERC20 ABI with a custom mint() function for MockUSDC
const MOCK_USDC_ABI = [
    "function mint(address to, uint256 amount) public",
    "function balanceOf(address account) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

export default function MintPage() {
    const { address: connectedAddress, isConnecting, connect } = useWeb3();
    const [address, setAddress] = useState("");
    const [amount, setAmount] = useState("1000"); // Default 1000 USDC
    const [status, setStatus] = useState<"IDLE" | "LOADING" | "SUCCESS" | "ERROR">("IDLE");
    const [txHash, setTxHash] = useState("");

    // Auto-fill target address when wallet connects
    useEffect(() => {
        if (connectedAddress && !address) {
            setAddress(connectedAddress);
        }
    }, [connectedAddress]);

    const switchToPaseo = async (provider: BrowserProvider) => {
        try {
            await provider.send("wallet_switchEthereumChain", [{ chainId: PASEO_CHAIN_ID_HEX }]);
            return true;
        } catch (switchError: any) {
            // This error code indicates that the chain has not been added to MetaMask.
            if (switchError.code === 4902 || switchError?.info?.error?.code === 4902) {
                try {
                    await provider.send("wallet_addEthereumChain", [
                        {
                            chainId: PASEO_CHAIN_ID_HEX,
                            chainName: "Polkadot Paseo Testnet",
                            rpcUrls: ["https://services.polkadothub-rpc.com/testnet"],
                            nativeCurrency: {
                                name: "PAS",
                                symbol: "PAS",
                                decimals: 18,
                            },
                            blockExplorerUrls: ["https://evm.testnet.polkadothub.io/"],
                        },
                    ]);
                    return true;
                } catch (addError) {
                    console.error("Failed to add network:", addError);
                    return false;
                }
            }
            return false;
        }
    };

    const handleMint = async () => {
        if (!window.ethereum) {
            alert("Please install MetaMask to mint tokens.");
            return;
        }

        if (!address) {
            alert("Please enter a destination address.");
            return;
        }

        try {
            setStatus("LOADING");
            const provider = new BrowserProvider(window.ethereum);

            // Ensure we are on Polkadot Paseo
            const network = await provider.getNetwork();
            if (Number(network.chainId) !== 420420417) {
                const switched = await switchToPaseo(provider);
                if (!switched) {
                    alert("Please switch MetaMask to Polkadot Paseo (Chain ID: 420420417)");
                    setStatus("IDLE");
                    return;
                }
            }

            await provider.send("eth_requestAccounts", []);
            const signer = await provider.getSigner();

            const usdcContract = new Contract(MOCK_USDC_ADDRESS, MOCK_USDC_ABI, signer);
            const amountWei = ethers.parseUnits(amount, 6); // MockUSDC has 6 decimals

            const tx = await usdcContract.mint(address, amountWei);
            setTxHash(tx.hash);

            await tx.wait();
            setStatus("SUCCESS");

        } catch (error: any) {
            console.error(error);
            setStatus("ERROR");
            alert(error.message || "Minting failed.");
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-xl">
                <div className="flex justify-between items-start mb-2">
                    <h1 className="text-2xl font-bold text-white">Polkadot Faucet</h1>
                    {connectedAddress ? (
                        <div className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
                            {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
                        </div>
                    ) : null}
                </div>

                <p className="text-slate-400 text-sm mb-6">
                    Mint Mock USDC on Polkadot Paseo Testnet for Solver liquidity.
                </p>

                {!connectedAddress ? (
                    <div className="py-8 text-center">
                        <button
                            onClick={connect}
                            disabled={isConnecting}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-blue-500/30 w-full"
                        >
                            {isConnecting ? "Connecting..." : "Connect Wallet"}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Target Address</label>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="0x..."
                                className="w-full bg-slate-800 text-white border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Amount (USDC)</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-slate-800 text-white border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <button
                            onClick={handleMint}
                            disabled={status === "LOADING"}
                            className="w-full mt-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                        >
                            {status === "LOADING" ? "Ming..." : "Mint Mock USDC"}
                        </button>

                        {status === "SUCCESS" && (
                            <div className="mt-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400 text-sm text-center">
                                Mint successful! <br />
                                <a
                                    href={`https://evm.testnet.polkadothub.io/tx/${txHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs break-all hover:underline"
                                >
                                    {txHash}
                                </a>
                            </div>
                        )}
                        {status === "ERROR" && (
                            <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
                                Mint failed. Check MetaMask network and console.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

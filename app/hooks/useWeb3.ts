import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, JsonRpcSigner, ethers } from "ethers";

// EIP-712 Domain and Types based on our smart contracts
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const getDomain = (chainId: number) => ({
    name: "Permit2",
    chainId: chainId,
    verifyingContract: PERMIT2_ADDRESS,
});

// Based on OriginSettler GASLESS_ORDER_WITNESS_TYPES
const TYPES = {
    PermitWitnessTransferFrom: [
        { name: "permitted", type: "TokenPermissions" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "order", type: "GaslessCrossChainOrder" },
    ],
    TokenPermissions: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
    ],
    GaslessCrossChainOrder: [
        { name: "originSettler", type: "address" },
        { name: "user", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "originChainId", type: "uint256" },
        { name: "openDeadline", type: "uint32" },
        { name: "fillDeadline", type: "uint32" },
        { name: "orderDataType", type: "bytes32" },
        { name: "orderData", type: "bytes" },
        { name: "exclusiveSolver", type: "address" }
    ],
};

export function useWeb3() {
    const [provider, setProvider] = useState<BrowserProvider | null>(null);
    const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
    const [address, setAddress] = useState<string>("");
    const [isConnecting, setIsConnecting] = useState(false);

    useEffect(() => {
        if (window.ethereum) {
            const initProvider = new BrowserProvider(window.ethereum as any);
            setProvider(initProvider);

            // Listen for account changes
            window.ethereum.on?.("accountsChanged", (accounts: string[]) => {
                if (accounts.length > 0) {
                    setAddress(accounts[0]);
                } else {
                    setAddress("");
                    setSigner(null);
                }
            });
        }
    }, []);

    const connect = async () => {
        if (typeof window === "undefined" || !window.ethereum) {
            alert("Please install MetaMask or a compatible Web3 wallet!");
            return;
        }
        try {
            setIsConnecting(true);
            const currentProvider = provider || new BrowserProvider(window.ethereum as any);
            if (!provider) {
                setProvider(currentProvider);
            }

            await currentProvider.send("eth_requestAccounts", []);
            const newSigner = await currentProvider.getSigner();
            setSigner(newSigner);
            setAddress(await newSigner.getAddress());
        } catch (error) {
            console.error("Failed to connect wallet:", error);
        } finally {
            setIsConnecting(false);
        }
    };

    const signOrder = useCallback(async (
        originSettler: string,
        token: string,
        amountIn: bigint,
        destChainId: bigint,
        amountOut: bigint,
        target: string,
        solverFee: bigint,
        exclusiveSolver: string
    ) => {
        if (!window.ethereum) throw new Error("Wallet not connected");

        // Re-initialize provider and signer locally to avoid "network changed" errors
        // when looping across different chains.
        const localProvider = new BrowserProvider(window.ethereum as any);
        const localSigner = await localProvider.getSigner();
        const localAddress = await localSigner.getAddress();

        const network = await localProvider.getNetwork();
        const activeChainId = Number(network.chainId);

        // 1. Check and request ERC-20 Approval for Permit2
        const ERC20_ABI = [
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function balanceOf(address account) view returns (uint256)"
        ];
        const tokenContract = new ethers.Contract(token, ERC20_ABI, localSigner);

        try {
            // Check Balance first!
            const balance = await tokenContract.balanceOf(localAddress);
            if (balance < amountIn) {
                const required = ethers.formatUnits(amountIn, 6);
                const current = ethers.formatUnits(balance, 6);
                throw new Error(`Insufficient MockUSDC balance. You have ${current} USDC, but need ${required} USDC.`);
            }

            // Check Allowance
            const currentAllowance = await tokenContract.allowance(localAddress, PERMIT2_ADDRESS);
            if (currentAllowance < amountIn) {
                console.log("Requesting Permit2 approval...");
                // Request max approval for better UX on subsequent trades
                const approveTx = await tokenContract.approve(PERMIT2_ADDRESS, ethers.MaxUint256);
                await approveTx.wait();
                console.log("Permit2 approved successfully.");
            }
        } catch (err: any) {
            console.error("ERC-20 Approval failed:", err);
            throw new Error(`Permit2 Approval failed: ${err.message}`);
        }

        // 2. Generate Order and Sign Permit2 Intent
        const nonce = BigInt(Math.floor(Math.random() * 1000000));
        const openDeadline = Math.floor(Date.now() / 1000) + 3600; // +1 hour
        const fillDeadline = Math.floor(Date.now() / 1000) + 7200; // +2 hours

        // orderData: (amountIn, recipient, amountOut, destChainId, solverFee, exclusiveSolver)
        const orderData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "bytes32", "uint256", "uint256", "uint256", "address"],
            [
                amountIn,
                ethers.zeroPadValue(target, 32),
                amountOut,
                destChainId,
                solverFee,
                exclusiveSolver
            ]
        );

        const order = {
            originSettler,
            user: localAddress,
            nonce,
            originChainId: activeChainId,
            openDeadline,
            fillDeadline,
            orderDataType: ethers.ZeroHash,
            orderData,
            exclusiveSolver
        };

        const message = {
            permitted: { token, amount: amountIn },
            spender: originSettler,
            nonce,
            deadline: openDeadline,
            order
        };

        try {
            const signature = await localSigner.signTypedData(getDomain(activeChainId), TYPES, message);
            return { signature, order, message };
        } catch (err) {
            console.error("Signature failed:", err);
            throw err;
        }
    }, []);

    // Utility to switch network
    const switchNetwork = async (targetChainId: number) => {
        if (!window.ethereum) throw new Error("No wallet");
        const hexChainId = "0x" + targetChainId.toString(16);
        try {
            const tempProvider = new BrowserProvider(window.ethereum as any);
            await tempProvider.send("wallet_switchEthereumChain", [{ chainId: hexChainId }]);
            // wait a bit for it to take effect
            await new Promise((r) => setTimeout(r, 1000));
        } catch (err: any) {
            throw new Error(`Failed to switch to chain ${targetChainId}. Error: ${err.message}`);
        }
    };

    // Utility to fetch balance without needing to be connected to that chain
    const fetchBalanceAsync = async (chainId: number, tokenAddress: string, userAddress: string) => {
        const rpcUrl = chainId === 11155420 ? "https://sepolia.optimism.io" : "https://sepolia.base.org";
        const tempProvider = new ethers.JsonRpcProvider(rpcUrl);
        const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)"];
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, tempProvider);
        const balance = await contract.balanceOf(userAddress);
        return ethers.formatUnits(balance, 6);
    };

    return { address, isConnecting, connect, signOrder, switchNetwork, fetchBalanceAsync };
}

// Add ethereum to window type
declare global {
    interface Window {
        ethereum?: any;
    }
}

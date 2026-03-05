import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, JsonRpcSigner, ethers } from "ethers";

// EIP-712 Domain and Types based on our smart contracts
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const DOMAIN = {
    name: "Permit2",
    chainId: 11155420, // Example: OP Sepolia
    verifyingContract: PERMIT2_ADDRESS,
};

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
        if (!provider) {
            alert("Please install MetaMask!");
            return;
        }
        try {
            setIsConnecting(true);
            await provider.send("eth_requestAccounts", []);
            const newSigner = await provider.getSigner();
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
        if (!signer || !address) throw new Error("Wallet not connected");

        // Mock order generation for demo purposes
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
            user: address,
            nonce,
            originChainId: 11155420, // OP Sepolia
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
            const signature = await signer.signTypedData(DOMAIN, TYPES, message);
            return { signature, order, message };
        } catch (err) {
            console.error("Signature failed:", err);
            throw err;
        }
    }, [signer, address]);

    return { address, isConnecting, connect, signOrder };
}

// Add ethereum to window type
declare global {
    interface Window {
        ethereum?: any;
    }
}

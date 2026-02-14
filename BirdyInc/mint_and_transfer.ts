console.log("Starting mint_and_transfer script...");
import fs from 'fs';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
    mintV1,
    TokenStandard,
    updateV1
} from '@metaplex-foundation/mpl-token-metadata';
import {
    setAuthority,
    AuthorityType,
    mplToolbox
} from '@metaplex-foundation/mpl-toolbox';
import {
    keypairIdentity,
    publicKey,
    createSignerFromKeypair
} from '@metaplex-foundation/umi';

// --- CONFIGURATION ---
const DESTINATION_WALLET = publicKey("9CmjZcTQ8iovjbBKYgWyH6iEKFZpqAuyDpsmbQj5nRHu");
// REPLACE WITH YOUR MINT ADDRESS OR PASS IT AS ARGUMENT
const MINT_ADDRESS = publicKey("67QXgy6J8iaYzmDV9HUtsVZLTowEf1QSszQSFyG9mKyf"); 

const TOKEN_CONFIG = {
    supply: 100
};

const run = async () => {
    // 1. Initialize Umi with Devnet
    const umi = createUmi('https://api.devnet.solana.com');
    umi.use(mplToolbox());

    // 2. Load "Burner" Wallet
    const WALLET_FILE = 'burner-wallet.json';
    if (!fs.existsSync(WALLET_FILE)) {
        throw new Error("Burner wallet not found. Run create_token.ts first.");
    }
    const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    const burnerKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(walletData.secretKey));
    console.log(`📂 Loaded Burner Wallet: ${burnerKeypair.publicKey}`);
    
    umi.use(keypairIdentity(burnerKeypair));

    console.log("Using Mint Address:", MINT_ADDRESS);

    // 5. Mint Tokens to YOUR Wallet
    console.log(`Minting ${TOKEN_CONFIG.supply} tokens to ${DESTINATION_WALLET}...`);
    await mintV1(umi, {
        mint: MINT_ADDRESS,
        authority: createSignerFromKeypair(umi, burnerKeypair), // Burner signs the minting
        amount: TOKEN_CONFIG.supply,
        tokenOwner: DESTINATION_WALLET, // <--- Tokens go to 9Cmj...
        tokenStandard: TokenStandard.Fungible,
    }).sendAndConfirm(umi);
    console.log("✅ Tokens Minted.");

    // 6. Hand over Mint Authority to YOU (Final Step)
    console.log("Transferring Mint Authority...");
    await setAuthority(umi, {
        owned: MINT_ADDRESS,
        owner: createSignerFromKeypair(umi, burnerKeypair), // Current owner is Burner
        authorityType: AuthorityType.MintTokens,
        newAuthority: DESTINATION_WALLET, // New owner is 9Cmj...
    }).sendAndConfirm(umi);
    console.log("✅ Mint Authority Transferred.");

    // 7. Transfer Metadata Update Authority to YOU
    console.log("Transferring Metadata Update Authority...");
    try {
        await updateV1(umi, {
            mint: MINT_ADDRESS,
            authority: createSignerFromKeypair(umi, burnerKeypair),
            newUpdateAuthority: DESTINATION_WALLET,
        }).sendAndConfirm(umi);
        console.log("✅ Metadata Authority Transferred.");
    } catch (e) {
        console.log("⚠️ Metadata update failed (maybe it already happened or metadata is missing).");
        console.error(e);
    }

    console.log(`✅ Success!`);
    console.log(`-------------------------------------`);
    console.log(`Token Mint Address: ${MINT_ADDRESS}`);
    console.log(`Sent ${TOKEN_CONFIG.supply} Tokens to: ${DESTINATION_WALLET}`);
    console.log(`Authority Transferred to: ${DESTINATION_WALLET}`);
    console.log(`-------------------------------------`);
};

run().catch(err => console.error(err));

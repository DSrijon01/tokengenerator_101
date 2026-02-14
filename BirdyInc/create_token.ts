console.log("Starting script...");
import fs from 'fs';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
    createFungible,
    mintV1,
    TokenStandard,
    updateV1,
    createV1
} from '@metaplex-foundation/mpl-token-metadata';
import {
    setAuthority,
    AuthorityType,
    mplToolbox,
    initializeMint2
} from '@metaplex-foundation/mpl-toolbox';
import {
    keypairIdentity,
    generateSigner,
    percentAmount,
    publicKey,
    sol,
    createSignerFromKeypair,
    transactionBuilder,
    publicKeyBytes
} from '@metaplex-foundation/umi';

// --- CONFIGURATION ---
const DESTINATION_WALLET = publicKey("9CmjZcTQ8iovjbBKYgWyH6iEKFZpqAuyDpsmbQj5nRHu");

// The Token Data
const TOKEN_CONFIG = {
    name: "Birdy Inc",
    symbol: "BIRD",
    uri: "https://raw.githubusercontent.com/DSrijon01/tokengenerator_101/main/BirdyInc/birdy.json", // <--- REPLACE THIS
    decimals: 0,
    supply: 100
};

const run = async () => {
    // 1. Initialize Umi with Devnet
    const umi = createUmi('https://api.devnet.solana.com');
    umi.use(mplToolbox());

    // 2. Load or Generate a "Burner" Wallet
    let burnerKeypair;
    const WALLET_FILE = 'burner-wallet.json';

    if (fs.existsSync(WALLET_FILE)) {
        const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
        burnerKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(walletData.secretKey));
        console.log(`📂 Loaded Burner Wallet from ${WALLET_FILE}: ${burnerKeypair.publicKey}`);
    } else {
        burnerKeypair = umi.eddsa.generateKeypair();
        const walletData = {
            publicKey: burnerKeypair.publicKey,
            secretKey: Array.from(burnerKeypair.secretKey)
        };
        fs.writeFileSync(WALLET_FILE, JSON.stringify(walletData));
        console.log(`🔥 Generated New Burner Wallet: ${burnerKeypair.publicKey}`);
        console.log(`� Saved to ${WALLET_FILE}`);
    }
    
    umi.use(keypairIdentity(burnerKeypair));

    // 3. Check Balance and Fund if needed
    const balance = await umi.rpc.getBalance(burnerKeypair.publicKey);
    console.log(`💰 Current Balance: ${Number(balance.basisPoints) / 1000000000} SOL`);

    if (Number(balance.basisPoints) < 500000000) { // Less than 0.5 SOL
        console.log(`💧 Low balance. Requesting Airdrop...`);
        try {
            await umi.rpc.airdrop(burnerKeypair.publicKey, sol(1));
            console.log("✅ Airdrop successful!");
        } catch (e) {
            console.log("⚠️ Airdrop failed due to rate limits.");
            console.log(`👉 PLEASE MANUALLY FUND THIS WALLET: ${burnerKeypair.publicKey}`);
            console.log(`   You can use https://faucet.solana.com/`);
            console.log(`   Or send SOL from another wallet.`);
            console.log(`   Waiting 30 seconds for funding...`);
            await new Promise(r => setTimeout(r, 30000));
            
            // Re-check balance
            const newBalance = await umi.rpc.getBalance(burnerKeypair.publicKey);
             if (Number(newBalance.basisPoints) < 10000000) { // Still very low
                 throw new Error("❌ Insufficient funds. Please fund the wallet and run again.");
             }
        }
    }

    // (Wait a moment for confirmation if funded just now)
    await new Promise(r => setTimeout(r, 2000));

    console.log(`🏭 Minting ${TOKEN_CONFIG.name}...`);

    // 4. Create the Token Mint
    const mint = generateSigner(umi);
    console.log(`🔑 Generated Mint Address: ${mint.publicKey}`);

    // We set the "Update Authority" to YOU via updateV1 later.
    console.log("Creating Mint Account...");
    const burnerSigner = createSignerFromKeypair(umi, burnerKeypair);
    await transactionBuilder()
    .add({
        instruction: {
            keys: [
                { pubkey: burnerKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: mint.publicKey, isSigner: true, isWritable: true }
            ],
            programId: publicKey('11111111111111111111111111111111'),
            data: Buffer.concat([
                Buffer.alloc(4, 0), // Discriminator for CreateAccount (0)
                Buffer.from(new BigUint64Array([BigInt((await umi.rpc.getRent(82)).basisPoints)]).buffer), // Lamports
                Buffer.from(new BigUint64Array([BigInt(82)]).buffer), // Space
                publicKeyBytes(publicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')), // Owner
            ])
        },
        signers: [burnerSigner, mint],
        bytesCreatedOnChain: 82
    })
    .add(initializeMint2(umi, {
        mint: mint.publicKey,
        decimals: TOKEN_CONFIG.decimals,
        mintAuthority: burnerKeypair.publicKey,
        freezeAuthority: burnerKeypair.publicKey,
    }))
    .sendAndConfirm(umi);
    console.log("✅ Mint Account Created.");

    console.log("Creating Metadata...");
    await createV1(umi, {
        mint: mint.publicKey,
        name: TOKEN_CONFIG.name,
        symbol: TOKEN_CONFIG.symbol,
        uri: TOKEN_CONFIG.uri,
        sellerFeeBasisPoints: percentAmount(0),
        tokenStandard: TokenStandard.Fungible,
    }).sendAndConfirm(umi);
    console.log("✅ Metadata Created.");

    console.log(`✅ Success! Metadata Created.`);
    console.log(`-------------------------------------`);
    console.log(`Token Mint Address: ${mint.publicKey}`);
    console.log(`-------------------------------------`);
    console.log(`SAVE THIS MINT ADDRESS! You need it for the next step.`);
};

run().catch(err => console.error(err));
import fs from 'fs';
import {
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
    PublicKey,
    LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createInitializeTransferFeeConfigInstruction,
    createInitializePermanentDelegateInstruction,
    createInitializeMetadataPointerInstruction,
    createInitializeMintInstruction,
    getMintLen,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddressSync,
    createMintToInstruction,
    createSetAuthorityInstruction,
    AuthorityType
} from '@solana/spl-token';
import {
    createInitializeInstruction,
    pack,
    TokenMetadata,
} from '@solana/spl-token-metadata';

// --- CONFIGURATION ---
const DESTINATION_WALLET = new PublicKey("9CmjZcTQ8iovjbBKYgWyH6iEKFZpqAuyDpsmbQj5nRHu");

const TOKEN_CONFIG = {
    name: "Drag Inc",
    symbol: "DRG",
    uri: "",
    decimals: 0,
    supply: 100,
    feeBasisPoints: 100, // 100 = 1% Transfer Fee
    maxFee: BigInt(5)    // Maximum 5 tokens taken as a fee per transaction
};

const run = async () => {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // --- 1. BURNER WALLET LOGIC ---
    let burnerKeypair: Keypair;
    const WALLET_FILE = 'burner-wallet.json';

    if (fs.existsSync(WALLET_FILE)) {
        const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
        burnerKeypair = Keypair.fromSecretKey(new Uint8Array(walletData.secretKey));
        console.log(`📂 Loaded Burner Wallet: ${burnerKeypair.publicKey.toBase58()}`);
    } else {
        burnerKeypair = Keypair.generate();
        const walletData = {
            publicKey: burnerKeypair.publicKey.toBase58(),
            secretKey: Array.from(burnerKeypair.secretKey)
        };
        fs.writeFileSync(WALLET_FILE, JSON.stringify(walletData));
        console.log(`🔥 Generated New Burner Wallet: ${burnerKeypair.publicKey.toBase58()}`);
    }

    // --- 2. FUNDING CHECK ---
    const balance = await connection.getBalance(burnerKeypair.publicKey);
    console.log(`💰 Current Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < 0.5 * LAMPORTS_PER_SOL) {
        console.log(`💧 Low balance. Requesting Airdrop...`);
        try {
            const sig = await connection.requestAirdrop(burnerKeypair.publicKey, 1 * LAMPORTS_PER_SOL);
            await connection.confirmTransaction(sig, 'confirmed');
            console.log("✅ Airdrop successful!");
        } catch (e) {
            console.log("⚠️ Airdrop failed. Please manually fund:", burnerKeypair.publicKey.toBase58());
            await new Promise(r => setTimeout(r, 15000));
        }
    }

    console.log(`🏭 Minting ${TOKEN_CONFIG.name}...`);

    // --- 3. MEMORY ALLOCATION FOR EXTENSIONS ---
    const mintKeypair = Keypair.generate();

    // We declare the exact extensions we are using (Features 1, 3, 8)
    const extensions = [
        ExtensionType.TransferFeeConfig,
        ExtensionType.PermanentDelegate,
        ExtensionType.MetadataPointer,
    ];
    const mintLen = getMintLen(extensions);

    // We define the Metadata contents (Feature 7)
    const metaData: TokenMetadata = {
        updateAuthority: DESTINATION_WALLET,
        mint: mintKeypair.publicKey,
        name: TOKEN_CONFIG.name,
        symbol: TOKEN_CONFIG.symbol,
        uri: TOKEN_CONFIG.uri,
        additionalMetadata: [],
    };

    // Calculate how many extra bytes the Metadata strings need
    const TYPE_SIZE = 2;
    const LENGTH_SIZE = 2;
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metaData).length;

    // Calculate rent to keep the token alive forever
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

    // --- 4. THE MINT CREATION TRANSACTION ---
    // Note: The order of instructions here is strictly enforced by Solana
    const createTx = new Transaction().add(
        // A. Carve out space on the blockchain
        SystemProgram.createAccount({
            fromPubkey: burnerKeypair.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: mintLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        // B. Initialize Feature 1: Transfer Fee
        createInitializeTransferFeeConfigInstruction(
            mintKeypair.publicKey,
            DESTINATION_WALLET, // User who can change the fee %
            DESTINATION_WALLET, // User who can withdraw the collected fees
            TOKEN_CONFIG.feeBasisPoints,
            TOKEN_CONFIG.maxFee,
            TOKEN_2022_PROGRAM_ID
        ),
        // C. Initialize Feature 3: Permanent Delegate
        createInitializePermanentDelegateInstruction(
            mintKeypair.publicKey,
            DESTINATION_WALLET, // Your platform wallet has ultimate control
            TOKEN_2022_PROGRAM_ID
        ),
        // D. Initialize Feature 8: Metadata Pointer
        createInitializeMetadataPointerInstruction(
            mintKeypair.publicKey,
            DESTINATION_WALLET, // User who can change metadata
            mintKeypair.publicKey, // Points to itself
            TOKEN_2022_PROGRAM_ID
        ),
        // E. Initialize the physical Mint
        createInitializeMintInstruction(
            mintKeypair.publicKey,
            TOKEN_CONFIG.decimals,
            burnerKeypair.publicKey, // Burner holds authority temporarily
            null, // Freeze authority
            TOKEN_2022_PROGRAM_ID
        ),
        // F. Initialize Feature 7: Write the Metadata
        createInitializeInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            metadata: mintKeypair.publicKey,
            updateAuthority: DESTINATION_WALLET,
            mint: mintKeypair.publicKey,
            mintAuthority: burnerKeypair.publicKey,
            name: metaData.name,
            symbol: metaData.symbol,
            uri: metaData.uri,
        })
    );

    console.log("📝 Sending Mint Creation Transaction...");
    await sendAndConfirmTransaction(connection, createTx, [burnerKeypair, mintKeypair]);
    console.log("✅ Mint & Extensions Initialized.");

    // --- 5. MINT THE SUPPLY TO PLATFORM WALLET ---
    console.log(`📦 Minting ${TOKEN_CONFIG.supply} tokens to ${DESTINATION_WALLET.toBase58()}...`);

    // Find the Token-2022 vault address for your platform wallet
    const destAta = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        DESTINATION_WALLET,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    const mintSupplyTx = new Transaction().add(
        // Create the folder in your wallet to hold the tokens
        createAssociatedTokenAccountInstruction(
            burnerKeypair.publicKey,
            destAta,
            DESTINATION_WALLET,
            mintKeypair.publicKey,
            TOKEN_2022_PROGRAM_ID
        ),
        // Mint exactly 100 tokens into that folder
        createMintToInstruction(
            mintKeypair.publicKey,
            destAta,
            burnerKeypair.publicKey,
            TOKEN_CONFIG.supply,
            [],
            TOKEN_2022_PROGRAM_ID
        ),
        // Hand over the keys! Burner gives up minting power to your platform wallet
        createSetAuthorityInstruction(
            mintKeypair.publicKey,
            burnerKeypair.publicKey,
            AuthorityType.MintTokens,
            DESTINATION_WALLET,
            [],
            TOKEN_2022_PROGRAM_ID
        )
    );

    await sendAndConfirmTransaction(connection, mintSupplyTx, [burnerKeypair]);

    console.log(`🎉 SUCCESS!`);
    console.log(`-------------------------------------`);
    console.log(`Token Mint Address: ${mintKeypair.publicKey.toBase58()}`);
    console.log(`Permanent Delegate: ${DESTINATION_WALLET.toBase58()}`);
    console.log(`Check it on Solscan: https://solscan.io/token/${mintKeypair.publicKey.toBase58()}?cluster=devnet`);
    console.log(`-------------------------------------`);
};

run().catch(err => console.error(err));
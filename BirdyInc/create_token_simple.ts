console.log("Starting simple script...");
import fs from 'fs';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
    createV1,
    TokenStandard
} from '@metaplex-foundation/mpl-token-metadata';
import {
    keypairIdentity,
    generateSigner,
    publicKey,
    sol,
    createSignerFromKeypair,
    transactionBuilder,
    publicKeyBytes,
    percentAmount
} from '@metaplex-foundation/umi';
import { initializeMint2 } from '@metaplex-foundation/mpl-toolbox';

const run = async () => {
    const umi = createUmi('https://api.devnet.solana.com');

    // Load Burner
    const WALLET_FILE = 'burner-wallet.json';
    if (!fs.existsSync(WALLET_FILE)) {
        throw new Error("No burner wallet");
    }
    const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    const burnerKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(walletData.secretKey));
    umi.use(keypairIdentity(burnerKeypair));
    
    // Create Mint Keypair
    const mint = generateSigner(umi);
    console.log(`Keypair generated: ${mint.publicKey}`);

    const burnerSigner = createSignerFromKeypair(umi, burnerKeypair);

    console.log("Building transaction...");
    const builder = transactionBuilder()
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
        decimals: 0,
        mintAuthority: burnerKeypair.publicKey,
        freezeAuthority: burnerKeypair.publicKey,
    }))
    .add(createV1(umi, {
        mint: mint.publicKey,
        name: "Birdy Inc",
        symbol: "BIRD",
        uri: "https://raw.githubusercontent.com/DSrijon01/tokengenerator_101/main/BirdyInc/birdy.json",
        sellerFeeBasisPoints: percentAmount(0),
        tokenStandard: TokenStandard.Fungible,
    }));

    console.log("Sending transaction...");
    await builder.sendAndConfirm(umi);
    console.log("✅ Account & Metadata Created.");
    console.log(`Mint Address: ${mint.publicKey}`);
};

run().catch(err => console.error(err));

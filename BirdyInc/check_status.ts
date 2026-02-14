import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey } from '@metaplex-foundation/umi';
import { fetchMint } from '@metaplex-foundation/mpl-toolbox';
import { fetchMetadata, findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';

const run = async () => {
    const umi = createUmi('https://api.devnet.solana.com');
    const mintAddress = publicKey("BZQQXZ7RRYwKLzJGhuuAVGkti3jCtHejKURnfL74hkNW"); // Last generated mint

    console.log(`🔍 Checking Mint: ${mintAddress}`);

    try {
        const mint = await fetchMint(umi, mintAddress);
        console.log("✅ Mint Account exists!");
        console.log(`   Supply: ${mint.supply}`);
        console.log(`   Decimals: ${mint.decimals}`);
        console.log(`   Mint Authority: ${mint.mintAuthority.value}`);
        console.log(`   Freeze Authority: ${mint.freezeAuthority.value}`);
    } catch (e) {
        console.log("❌ Mint Account NOT found or invalid.");
        console.error(e);
    }

    try {
        const metadataPda = findMetadataPda(umi, { mint: mintAddress });
        const metadata = await fetchMetadata(umi, metadataPda);
        console.log("✅ Metadata Account exists!");
        console.log(`   Name: ${metadata.name}`);
        console.log(`   Symbol: ${metadata.symbol}`);
        console.log(`   Update Authority: ${metadata.updateAuthority}`);
    } catch (e) {
        console.log("⚠️ Metadata Account NOT found.");
    }
};

run();

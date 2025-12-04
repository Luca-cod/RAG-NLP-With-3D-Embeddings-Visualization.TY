// @ts-ignore
import { TSNE } from '@saehrimnir/druidjs';

import { config } from '../config/RAG.js';



/*
 *Applies t-SNE for dimensionality reduction, reducing from ~768D to 3D.
 */
export async function applyTSNE(embeddings: number[][]): Promise<number[][]> {
    console.log("Applying t-SNE dimensionality reduction...");

    return new Promise((resolve, reject) => {
        try {
            const perplexity = Math.max(2, Math.min(
                config.visualization.perplexity,
                Math.floor((embeddings.length - 1) / 3)
            ));

            console.log(`t-SNE config: perplexity=${perplexity}, dim=${config.visualization.nComponents}`);

            const tsne = new TSNE(embeddings, {
                d: config.visualization.nComponents,
                perplexity: perplexity
            });

            const solution = tsne.transform();

            console.log("✅ t-SNE completed successfully");
            console.log(`   Output shape: ${solution.length} points x ${solution[0]?.length || 0} dimensions`);

            resolve(solution);
        } catch (error) {
            console.error("Error in t-SNE:", error);
            reject(error);
        }
    });
}

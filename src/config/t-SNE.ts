// @ts-ignore
import { TSNE } from '@saehrimnir/druidjs';

import { config } from '../config/RAG.js';

/*export async function applyTSNE(embeddings: number[][]): Promise<number[][]> {

    console.log("Applying t-SNE dimensionality reduction...");

    return new Promise((resolve) => {
        const tsne = new TSNE({
            dim: config.visualization.nComponents,
            perpelxity: config.visualization.perplexity,
            earlyExaggeration: 4.0,
            learningRate: 100.0,
            nIter: 1000,    
            metric: 'euclidean'
        });

        //Initalized and exec t-SNE
        tsne.init({
            data: embeddings,
            type: 'dense'
        });

        //Execution of all iterations
        for (let i = 0; i < 1000; i++) {
            tsne.step();
        }

        //Obtain the results
        const reduceVectors = tsne.getOutputScaled();
        console.log("t-SNE completed");
        return (reduceVectors);
    });
}*/





/*export async function applyTSNE(embeddings: number[][]): Promise<number[][]> {
    console.log("Applying t-SNE dimensionality reduction...");

    return new Promise((resolve) => {
        const tsne = new TSNE({
            dim: config.visualization.nComponents,
            perplexity: config.visualization.perplexity,
            earlyExaggeration: 4.0,
            learningRate: 100.0,
            nIter: 1000,
            metric: 'euclidean'
        });

        // Inizializza e esegui t-SNE
        tsne.init({
            data: embeddings,
            type: 'dense'
        });

        // Esegui le iterazioni
        for (let i = 0; i < 1000; i++) {
            tsne.step();
        }

        // Ottieni i risultati
        const reducedVectors = tsne.getOutputScaled();

        console.log("t-SNE completed");
        resolve(reducedVectors);
    });
}*/


/*                 Libreria non funzionante
export async function applyTSNE(embeddings: number[][]): Promise<number[][]> {
    console.log("Applying t-SNE dimensionality reduction...");

    return new Promise((resolve, reject) => {
        try {
            // Import dinamico per gestire meglio tsne-js
            const tsneModule = require('tsne-js');
            const TSNEConstructor = tsneModule.default || tsneModule.TSNE || tsneModule;

            const tsne = new TSNEConstructor({
                dim: config.visualization.nComponents,
                perplexity: config.visualization.perplexity,
                earlyExaggeration: 4.0,
                learningRate: 100.0,
                nIter: 1000,
                metric: 'euclidean'
            });

            // Inizializza e esegui t-SNE
            tsne.init({
                data: embeddings,
                type: 'dense'
            });

            // Esegui le iterazioni
            for (let i = 0; i < 1000; i++) {
                tsne.step();
            }

            // Ottieni i risultati
            const reducedVectors = tsne.getOutputScaled();

            console.log("✅ t-SNE completed successfully");
            resolve(reducedVectors);
        } catch (error) {
            console.error("Error in t-SNE:", error);
            reject(error);
        }
    });
}*/



/**
 * Applica t-SNE per riduzione dimensionalità, riduce da ~768D a 3D

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

/*
💡 Lezione appresa
Quando una libreria ti da problemi di import/constructor:

Non è colpa tua - È un problema della libreria
Cerca alternative - L'ecosistema npm è vasto
Controlla l'activity - Librerie abbandonate = problemi garantiti
Preferisci librerie con TS types - Meno debug, più produttività


🔍 Analisi dei problemi
1. tsne-js ❌

Problema principale: Libreria abbandonata (ultimo update 2018)
Export inconsistente: Mix di CommonJS/ES6 module mal gestito
API instabile: TSNE.step() non sempre disponibile
TypeScript: Zero type definitions

2. @keckelt/tsne ❌

Problema principale: Export sbagliato nel package.json
Esporta come default export ma TypeScript si aspetta named export
Errore classico: TSNE is not a constructor perché in realtà è { default: TSNE }
Avresti dovuto fare: import tsne from '@keckelt/tsne' poi new tsne.TSNE()

3. @saehrimnir/druidjs ✅

Ben mantenuta: Update regolari, community attiva
Export corretti: Named exports funzionano perfettamente
API pulita: new TSNE(data, options).transform() - semplicissimo!
TypeScript-friendly: Type definitions incluse
Bonus: Include anche PCA, UMAP, e altri algoritmi di riduzione dimensionalità*/
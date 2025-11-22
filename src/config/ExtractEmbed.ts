
import { embeddings } from "../config/RAG.js";

//The embedings should be extracts from documents retrieval
export async function extractEmbeddings(docs: any[], queryEmbedding: number[]): Promise<number[][]> {

    console.log("Extracts Embeddings from documents...");

    const allEmbeddings: number[][] = [];

    //Adding fist, the embeddings Query
    allEmbeddings.push(queryEmbedding);

    //Extracts embeddings for every documents
    for (const doc of docs) {
        try {

            const embedding = await embeddings.embedQuery(doc.pageContent);
            allEmbeddings.push(embedding);

        } catch (error) {
            console.error("Erro during the extractions of embeddings from query or documents", error);
        }
    }

    //Embeddings extract from docs
    console.log(`Extracted ${allEmbeddings.length} embeddings total`);

    return allEmbeddings;
}


function euclideanDistance(point1: number[], point2: number[]): number {

    /*Formula per distanza euclidea per tre dimensioni
    d(A,B) = sqrt( (xb - xa)^2 + (yb -ya)^2 + (zb - za )^2 )
    Quindi devo trovare i punti delle tre dimensioni di A e B ovvero devo calcolare la distanza tra gli embeddings ottenuti, ma cmoe
    associo degli embeddings alle due variabili A e B?
    Beh ogni punto ha le sue coordinate, per cui essendo che viene calcolata la distanza tra tutti i punti devo fare un ciclo che appunto
    calcoli questa distanza tra tutti i punti nel piano e dia una rilevanza a quelli più vicini tra loro, il punto che ha più embedding vicini è
    un cluster, il cluster più vicino all'embedding della query è il documento più rilevante o il cluster più vicino è quello più rilevante

    Usando questa distanza, lo spazio euclideo diventa uno spazio metrico (più in particolare risulta uno spazio di Hilbert, spazio vettoriale su cui 
    è definito un prodotto scalare8quindi è possibile calcolare/parlare di norma, distanze, angoli e ortogonalità)

    */

    return Math.sqrt(
        point1.reduce((sum, val, i) => sum + Math.pow(val - point2[i], 2), 0)
    )



}

//La mia ide aè quella di ciclare per tutti i punti/embeddings che ottengo dalla riduzione da 768 dimensione a 3d avvenuta in t-SNE 
export function cacolateEuclideanDistancesForAllEmbedings(
    reducedVectors: number[][]

) {

    console.log("\n" + "=".repeat(70));
    console.log(" CALCOLO DISTANZE EUCLIDEE");
    console.log("=".repeat(70));

    const queryPoint = reducedVectors[0]; //Nella posizione zero dell'indice troviamo il punto tridimensionale della query
    const numPoints = reducedVectors.length; //Qua troviamo tutti gli altri punti

    console.log(`\nTotale embeddings: ${numPoints}`);
    console.log(`    -Query: 1 punto`);
    console.log(`    -Documenti: ${numPoints - 1} punti`);

    //Array per salvare le distanze con i loro indici  ---> ?????
    const distances: Array<{ index: number; distance: number; point: number[] }> = [];

    //Ciclo 1: Calcola la distanza tra la query e tutti gli altri punti:
    for (let i = 1; i < numPoints; i++) { //Parte da 1 fino alla lunghezza totale dei punti trovati, perchè 0 è la query
        const docPoint = reducedVectors[i];//Punti che andrò a confrontare con queryPoint tramite la funzione euclideanDistance
        const distance = euclideanDistance(docPoint, queryPoint);

        distances.push({ index: i, distance, point: docPoint });
        console.log(`   Doc${i}: distance:${distance.toFixed(4)}`);
        console.log(`          posizione = [${docPoint.map(v => v.toFixed(5)).join(", ")}]`);
    }

    //Ordina per distanza (più vicini)
    distances.sort((a, b) => a.distance - b.distance);

    console.log("\n TOP 5 Documenti più vicini alla query:");

    for (let i = 0; i < Math.min(5, distances.length); i++) {
        const d = distances[i];
        console.log(`   ${i + 1}. Doc ${d.index}: distanza = ${d.distance.toFixed(4)}`);
    }

    //Ciclo2: Calcola le distanze tra tutti i punti! (matrice di distanze)
    console.log("\nMatrice delle distanze tra tutti i punti:\n");

    //Matrice distanze
    const distanceMatrix: number[][] = [];

    for (let i = 0; i < numPoints; i++) {

        distanceMatrix[i] = [];

        for (let j = 0; j < numPoints; j++) {
            if (i === j) {
                distanceMatrix[i][j] = 0;//Distanza da se stesso = 0
            } else {
                distanceMatrix[i][j] = euclideanDistance(reducedVectors[i], reducedVectors[j]);
            }
        }
    }

    //Mostriamo un campione della matrice, un 5x5 per esempio
    /*const sampleSize = Math.min(5, numPoints);

    for (let i = 0; i < 5; i++) {
        distanceMatrix[i] = [];
        for (let j = 0; j < 5; j++) {
            distanceMatrix[j] = [];
        }
    }*/

    //Ciclo3: Identifichiamo il cluster (documenti vicini tra loro)
    console.log("\nIDENTIFICAZIONE CLUSTER:");
    console.log("(Documenti con distanza < 2.0 vengono considerati nello stesso cluster)\n");

    const trheshold = 2.0;
    const clusters: Map<number, number[]> = new Map();
    const visited = new Set<number>();

    for (let i = 1; i < numPoints; i++) {//Ignoro lo 0 perr il cluster essendo la query, a me interessano gli altri punti
        if (visited.has(i)) continue;

        //Definisco il punto di partenza a cui andrò a confrontare cno tutti gli altri per cercare quelli vicini ad esso!
        const cluster: number[] = [i]; //Array di number di posizione i-esima, ovvero il punto che stiamo valutando durante il ciclo
        visited.add(i);

        //Tovo tutti i punti vicini a questo
        for (let a = i + 1; a < numPoints; a++) { //Ovviamente parto dal succesivo
            if (visited.has(a)) continue;

            if (distanceMatrix[i][a] < trheshold) {
                cluster.push(a);
                visited.add(a);
            }
        }

        clusters.set(i, cluster);// --> ???
    }

    //Mostra i cluster trovati:
    let clusterNum = 1;
    for (const [lead, members] of clusters.entries()) {//Ciclo per tutti i memebers dell'oggetto clusters, clusters è un 'oggetto perquesto uso entries
        if (members.length > 1) {
            console.log(`   Cluster ${clusterNum}`);
            console.log(`       Documenti: [${members.join(", ")}]`);
            console.log(`       Dimensione ${members.length} documenti`);
        }

        //Calcolo distanza media del cluster dalla query
        const avgDistanceFromQuery = members.reduce((sum, index) =>
            sum + euclideanDistance(queryPoint, reducedVectors[index]), 0
        ) / members.length;

        console.log(`     Distanza media dalla query: ${avgDistanceFromQuery.toFixed(4)}\n`);
        clusterNum++;

    }

    if (clusterNum === 1) {
        console.log("  Nessun cluster trovato(documenti troppo distanti tra loro");
    }

    console.log("=".repeat(70) + "\n");

    //Ritorno informazioni utili
    return {
        totalPoints: numPoints,
        distanceMatrix,
        sortedDistance: distances,
        clusters: Array.from(clusters.values())
    };

}
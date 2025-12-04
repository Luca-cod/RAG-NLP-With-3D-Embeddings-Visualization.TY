
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
    return Math.sqrt(
        point1.reduce((sum, val, i) => sum + Math.pow(val - point2[i], 2), 0)
    )
}

//My idea is to loop through all the points/embeddings obtained from the reduction from 768 dimensions to 3D performed by t-SNE.
export function cacolateEuclideanDistancesForAllEmbedings(
    reducedVectors: number[][]

) {

    console.log("\n" + "=".repeat(70));
    console.log(" CALCOLO DISTANZE EUCLIDEE");
    console.log("=".repeat(70));

    const queryPoint = reducedVectors[0]; //At index zero, we find the three-dimensional point of the query.
    const numPoints = reducedVectors.length; //Here we find all the other points.

    console.log(`\nTotale embeddings: ${numPoints}`);
    console.log(`    -Query: 1 punto`);
    console.log(`    -Documenti: ${numPoints - 1} punti`);

    //Array to store the distances along with their indices ---> ?????
    const distances: Array<{ index: number; distance: number; point: number[] }> = [];

    //Loop 1: Calculate the distance between the query and all the other points.
    for (let i = 1; i < numPoints; i++) { //It starts from 1 up to the total number of points found, because 0 is the query.
        const docPoint = reducedVectors[i];//Points that I will compare with `queryPoint` using the `euclideanDistance` function.
        const distance = euclideanDistance(docPoint, queryPoint);

        distances.push({ index: i, distance, point: docPoint });
        console.log(`   Doc${i}: distance:${distance.toFixed(4)}`);
        console.log(`          posizione = [${docPoint.map(v => v.toFixed(5)).join(", ")}]`);
    }

    //Sort by distance (closest first)
    distances.sort((a, b) => a.distance - b.distance);

    console.log("\n TOP 5 Documents closest to the query:");

    for (let i = 0; i < Math.min(5, distances.length); i++) {
        const d = distances[i];
        console.log(`   ${i + 1}. Doc ${d.index}: distance = ${d.distance.toFixed(4)}`);
    }

    //Loop 2: Calculate the distances between all points! (distance matrix)
    console.log("\nDistance matrix between all points:\n");

    //Matrice distanze
    const distanceMatrix: number[][] = [];

    for (let i = 0; i < numPoints; i++) {

        distanceMatrix[i] = [];

        for (let j = 0; j < numPoints; j++) {
            if (i === j) {
                distanceMatrix[i][j] = 0;//Distance to itself = 0
            } else {
                distanceMatrix[i][j] = euclideanDistance(reducedVectors[i], reducedVectors[j]);
            }
        }
    }


    //Loop 3: Identify the cluster (documents close to each other)
    console.log("CLUSTER IDENTIFICATION:\n");
    console.log("(Documents with distance < 2.0 are considered part of the same cluster.)\n");

    const trheshold = 2.0;
    const clusters: Map<number, number[]> = new Map();
    const visited = new Set<number>();

    for (let i = 1; i < numPoints; i++) {//I ignore the 0 for the cluster since it’s the query; I’m only interested in the other points.
        if (visited.has(i)) continue;

        //I define the starting point, which I will compare with all the others to find those close to it.
        const cluster: number[] = [i]; //Array of numbers at the i-th position, representing the point we are evaluating during the loop.
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

    //Show the cluster found:
    let clusterNum = 1;
    for (const [lead, members] of clusters.entries()) {//Loop through all members of the `clusters` object; since `clusters` is an object, I use `entries`.

        if (members.length > 1) {
            console.log(`   Cluster ${clusterNum}`);
            console.log(`       Documenti: [${members.join(", ")}]`);
            console.log(`       Dimensione ${members.length} documenti`);
        }

        //Average distance of the cluster from the query
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


    return {
        totalPoints: numPoints,
        distanceMatrix,
        sortedDistance: distances,
        clusters: Array.from(clusters.values())
    };

}
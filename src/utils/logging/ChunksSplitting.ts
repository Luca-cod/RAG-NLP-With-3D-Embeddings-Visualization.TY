import { Chunk } from "src/core/retrieval/splitters/createSchemaAware.js";
import { splitLargeJsonObjectByArrayField } from "src/core/retrieval/splitters/SecondSplit2.js";


//=================================================  Logging e diagnostica  ========================================
/**It's the coordinator that:

Calls createSchemaAwareChunk for intelligent work
Calls RecursiveCharacterTextSplitter if additional splitting is needed
Should log and return results (but currently doesn't)

It's like a manager who delegates specific work to his specialists.

*/


/**    
         WHAT IT DOES: Chunk creation (preprocessing)

Purpose: Prepare documents for indexing!

When: During system setup, before use

Input: Original documents + chunking configuration

Output: Chunks optimized for the vector store


Avoid silent chunking errors that ruin retrieval

Optimize parameters based on real data instead of guesswork

Quick troubleshooting when RAG isn't performing well

Quality control ensures critical metadata isn't lost*/



//Provare o vedere RecursiveCharacterTextSplitter per splittare in chuks i documenti, è una funz di LangChain

export async function ChunkSplitter(
    //documents: ExtendDocument[],
    chunks: Chunk[],
    chunkSize: number,
    chunkOverlap: number
): Promise<{ original: Chunk; chunks: Chunk[]; deviceFamilies: Map<string, Chunk[]> }[]> {

    console.log(`\n=== CHUNK PROCESSING STARTED ===`);

    console.log(`\n\nProcessing ${chunks.length} pre-chunked documents`);
    console.log(`Max chunk size: ${chunkSize}, overlap: ${chunkOverlap}`);

    chunks.forEach((chunk, i) => {
        console.log(`Chunks ${i}:`, {
            //preview: chunk.pageContent.slice(0, 50),
            name: chunk.metadata.name,
            uuid: chunk.metadata.uuid,
            category: chunk.metadata.category,
            visualizationType: chunk.metadata.visualizationType,
            chunkType: chunk.metadata.chunkType
        });
    });


    const inputUUIDs = chunks.map(d => d.metadata.uuid);
    let inputChunkType = chunks.map(d => d.metadata.chunkType);
    const uniqueUUIDs = [...new Set(inputUUIDs)];


    // Trova duplicati esatti
    const duplicateUUIDs = inputUUIDs.filter((uuid, index) =>
        inputUUIDs.indexOf(uuid) !== index
    );
    console.log(`UUID duplicati: ${[...new Set(duplicateUUIDs)]}`);

    // Analizza per chunkType
    const chunkTypes = chunks.map(d => d.metadata.chunkType);
    const typeCount = chunkTypes.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});
    console.log("Distribuzione chunkType:", typeCount);

    // Filtra SOLO se necessario
    const originalLength = chunks.length;

    // chunks = chunks.filter(d => d.metadata.chunkType === "summary");
    //console.log(`Filtrati da ${originalLength} a ${chunks.length} documenti`);

    // Analizza i chunks risultanti
    console.log("\n CHUNKS RISULTANTI:");
    chunks.forEach((chunk, index) => {
        console.log(`[${index}] ${chunk.metadata.name} (${chunk.metadata.uuid}) - ${chunk.pageContent.length} chars`);
    });


    //DEBUG per contenuto, mi interressa sapere isFirstFloor e l'altra se c'è qualcosa al loro interno
    chunks.forEach((doc, i) => {
        if (typeof doc.metadata.isFirstFloor === 'undefined' || typeof doc.metadata.isSecondFloor === 'undefined') {
            console.warn(` Documento ${i} (${doc.metadata.name}) manca isFirstFloor o isSecondFloor`);
        }
    });


    // Trova duplicati
    /* const duplicateMap = new Map();
    chunks.forEach((doc, idx) => {
        const key = `${doc.metadata.uuid}-${doc.metadata.chunkType}`;
        if (!duplicateMap.has(key)) duplicateMap.set(key, []);
        duplicateMap.get(key).push({ index: idx, name: doc.metadata.name });
    });
 
    duplicateMap.forEach((entries, key) => {
        if (entries.length > 1) {
            console.log(` DUPLICATI trovati per ${key}:`);
            entries.forEach((entry: any) => {
                console.log(`   - Index ${entry.index}: ${entry.name}`);
            });
        }
    });*/






    const results = [];
    const globalDeviceFamilies = new Map<string, Chunk[]>();


    // Statistics tracking
    let totalOriginalChunks = 0;
    let totalFinalChunks = 0;
    let chunksRequiringSplitting = 0;
    let chunksRequiringSecondSplit = 0;
    const chunkTypeStats: Record<string, number> = {};





    for (const [index, doc] of chunks.entries()) {
        console.log(`\n--- Processing chunk ${index + 1}/${chunks.length} ---`);
        console.log(`Chunk type: ${doc.metadata.chunkType}`);
        console.log(`Source: ${doc.metadata.source || 'unknown'}`);
        console.log(`Size: ${doc.pageContent.length} characters`);
        console.log(`Location metadata: floorLocation=${doc.metadata.floorLocation}, isFirstFloor=${doc.metadata.isFirstFloor}, isSecondFloor=${doc.metadata.isSecondFloor}`);


        // Update statistics
        totalOriginalChunks++;
        const chunkType = doc.metadata.chunkType || 'unknown';
        chunkTypeStats[chunkType] = (chunkTypeStats[chunkType] || 0) + 1;

        // Each document is already a chunk - validate and process
        let finalChunks = [doc];

        console.log("Dimensione chunks che dovrebbero essere splittati ulteriormente:", doc.pageContent.length);
        //console.log("Curiosità", JSON.stringify(finalChunks));


        //  ==========================================================================================================================
        //                                              secondary splitting
        //  ==========================================================================================================================
        if (doc.pageContent.length > chunkSize) { //chunkSize === 1000

            console.log(` \nChunk oversized (${doc.pageContent.length} > ${chunkSize}), applying secondary splitting...`);

            /*if (doc.metadata.chunkType === 'summary') {
                console.log("Chunks di tipo summary non splittabili per splitLargeJsonObjectByArrayField");
                finalChunks = [doc]; //Chunk in analisi
                continue;
            }*/

            chunksRequiringSplitting++;

            const parsedContent = JSON.parse(doc.pageContent);


            console.log("\n\nStruttura parsedContent:", Object.keys(parsedContent))

            console.log(" ParsedContent keys:", Object.keys(parsedContent));
            console.log(" Has .data?", !!parsedContent.data);
            console.log(" Has .endpoints?", !!parsedContent.endpoints);
            console.log(" Has .data.endpoints?", !!parsedContent.data?.endpoints);



            //Proviamo a splittare per chunkType? Almeno in base al chunk Type sappiamo a che livello della struttura JSON andare a lavorare
            try {

                const parsedContent = JSON.parse(doc.pageContent);
                const documentData = parsedContent;//parsedContent.data ||
                let preSplitChunks: any[] = [];



                // if (chunkTypeForSplitting === "detail") {
                if (documentData.parameters && Array.isArray(documentData.parameters)) {

                    console.log(`Splitting by parameters (${documentData.parameters.length} items)`);

                    preSplitChunks = splitLargeJsonObjectByArrayField(

                        documentData,  // Passa i dati, non il wrapper completo
                        chunkSize,
                        {
                            pageContent: JSON.stringify(documentData), //Evita di avere un doppione del campo data
                            metadata: { ...doc.metadata, chunkType: 'detail' }
                        }

                    );
                    finalChunks = preSplitChunks;
                }

                // } else if (chunkTypeForSplitting === "area") {
                if (documentData.areas && Array.isArray(documentData.areas)) { //|| documentData.devices && Array.isArray(documentData.devices)) {
                    console.log(`Splitting by area (${documentData.areas.length} items)`);
                    preSplitChunks = splitLargeJsonObjectByArrayField(
                        documentData,
                        chunkSize,
                        {
                            pageContent: JSON.stringify(documentData),
                            metadata: {
                                ...doc.metadata,
                                chunkType: 'area'
                            }
                        }
                    );
                    finalChunks = preSplitChunks;
                }

                console.log("Chunks correct dimension");
                //For now, summary chunks have a size smaller than maxChunkSize          

            } catch (error) {
                console.error(` Error splitting chunk: ${error}`);
                finalChunks = [doc];// Keep original chunk if splitting fails

            }

            validateParentChildRelations(finalChunks);

        } //SecondSplit finished!




        //finalChunks contains the new chunks obtained from the splittings, so we should apllying the critic metadata of original chunks
        //If the chunks is not splitted, finalChunks is [doc] (original chunk). Is processed from .map but is not modified
        /**
         * If the chunks has dimensione bigger than chunkSize:
         * 
         *   Prima dello splitting
             finalChunks = [doc] // chunk originale grande

        Dopo lo splitting  
            finalChunks = [parentChunk, childChunk1, childChunk2, ...] // chunks più piccoli

         Dopo il map() - tutti ereditano metadati critici
         
         *
        
        if the chunks hasn't dimensione over 1000(chunkSize)
        
        Prima e dopo sono uguali
            finalChunks = [doc] // chunk originale mantenuto

         Dopo il map() - stesso chunk con metadati preservati
        
         */
        finalChunks = finalChunks.map(chunk => {
            const criticalMetadata = {
                floorLocation: doc.metadata.floorLocation,
                isFirstFloor: doc.metadata.isFirstFloor,
                isSecondFloor: doc.metadata.isSecondFloor,
                partitionNames: doc.metadata.partitionNames,
                areaName: doc.metadata.areaName,
                areaUuid: doc.metadata.areaUuid,
                visualizationType: doc.metadata.visualizationType,
                category: doc.metadata.category,
                chunkType: doc.metadata.chunkType
            };

            return {
                ...chunk,
                metadata: {
                    ...doc.metadata, // Metadati originali come base
                    ...chunk.metadata, // Nuovi metadati
                    ...criticalMetadata // Assicura i metadati critici
                }
            };

        });



        totalFinalChunks += finalChunks.length;

        // =================================================================
        // ORGANIZZAZIONE IN FAMIGLIE DI DEVICE
        // =================================================================

        const deviceFamilies = new Map<string, Chunk[]>();

        //In this section we create a hierarchic maps for chunks with chunkType === detail
        //group for chunk father with the parameter parentUuid
        //Update the global statistics
        finalChunks.forEach(chunk => {
            //if (chunk.metadata.chunkType === 'detail') {
            const deviceKey = chunk.metadata.parentUuid || chunk.metadata.uuid;
            const deviceName = chunk.metadata.parentName || chunk.metadata.name;

            // DEBUG: Verifica il sistema gerarchico
            if (chunk.metadata.chunkId && chunk.metadata.parentChunkId) {
                console.log(`\n   • Hierarchy:  Device:${chunk.metadata.name} With Uuid:${chunk.metadata.chunkId} → Parent ${chunk.metadata.parentChunkId}`);
            }

            if (!deviceFamilies.has(deviceKey)) {
                deviceFamilies.set(deviceKey, []);
                globalDeviceFamilies.set(deviceKey, []);
            }

            deviceFamilies.get(deviceKey)!.push(chunk);
            globalDeviceFamilies.get(deviceKey)!.push(chunk);
            // }

            //If is a parent log his UUID
            console.log(`   • Parent device: ${chunk.metadata.parentName || 'None'} (${chunk.metadata.parentUuid || 'No UUID'})`);


        });

        // Log chunk analysis 
        /* console.log(` Chunk ${index + 1} analysis:`);
         console.log(`   • Original size: ${doc.pageContent.length} chars`);
         console.log(`   • Chunk type: ${chunkType}`);
         console.log(`   • Final chunks: ${finalChunks.length}`);
         console.log(`   • Area info: ${doc.metadata.hasAreaInfo ? 'Yes' : 'No'}`);
         console.log(`   • Location filters: first=${doc.metadata.isFirstFloor}, second=${doc.metadata.isSecondFloor}`);
         console.log(`   • Location preserved: ${finalChunks.every(c =>
             c.metadata.floorLocation === doc.metadata.floorLocation &&
             c.metadata.isFirstFloor === doc.metadata.isFirstFloor &&
             c.metadata.isSecondFloor === doc.metadata.isSecondFloor
         ) ? ' Yes' : ' No'}`);*/



        results.push({
            original: doc,
            chunks: finalChunks,
            deviceFamilies: deviceFamilies
        });
        /*
        if (doc.metadata.chunkType === 'area') {
            console.log(`   • Area name: ${doc.metadata.areaNames || 'Unknown'}`);
            //console.log(`   • Devices count: ${doc.metadata.devicesCount || 0}`);
        }

        results.push({
            original: doc,
            chunks: finalChunks,
            deviceFamilies: deviceFamilies
        })*/
    }

    // Final statistics
    console.log(`\n=== CHUNK PROCESSING COMPLETED ===`);

    console.log(` \n\nPROCESSING STATISTICS:`);
    console.log(`   • Original documents: ${chunks.length}`);
    console.log(`   • Total original chunks: ${totalOriginalChunks}`);
    console.log(`   • Total final chunks: ${totalFinalChunks}`);
    console.log(`   • Chunks requiring splitting: ${chunksRequiringSplitting}`);
    console.log(`   • Chunk types distribution:`);

    Object.entries(chunkTypeStats).forEach(([type, count]) => {
        console.log(`     - ${type}: ${count}`);
    });

    console.log(`\n=== DEVICE FAMILIES SUMMARY ===`);
    console.log(`Total device families: ${globalDeviceFamilies.size}`);

    for (const [deviceKey, chunks] of globalDeviceFamilies.entries()) {
        const mainDevice = chunks.find(c => !c.metadata.isSubChunk) || chunks[0];
        const parameters = chunks.filter(c => c.metadata.isSubChunk);
        const floorLocation = mainDevice.metadata.floorLocation || 'unknown';

        console.log(`  ${mainDevice.metadata.name} (${floorLocation}): ${chunks.length} total chunks, \nall parameters: ${parameters}`);
    }


    /*
            // POST-SPLITTING VALIDATION
        console.log(`\n POST-SPLITTING VALIDATION:`);
        let validChunks = 0;
        let oversizedChunks = 0;
        let missingMetadataChunks = 0;
    
        results.forEach(result => {
            result.chunks.forEach(chunk => {
                // Controlla dimensione
                if (chunk.pageContent.length > 4000) {
                    oversizedChunks++;
                    console.warn(` OVERSIZED: ${chunk.pageContent.length} chars, type: ${chunk.metadata?.chunkType}`);
                }
                
                // Controlla metadati critici
                if (!chunk.metadata?.chunkType || chunk.metadata.chunkType === 'undefined') {
                    missingMetadataChunks++;
                    console.warn(` MISSING METADATA: ${chunk.pageContent.length} chars`);
                }
                
                validChunks++;
            });
        });
    
        console.log(`   • Valid chunks: ${validChunks}`);
        console.log(`   • Oversized chunks: ${oversizedChunks}`);
        console.log(`   • Chunks with missing metadata: ${missingMetadataChunks}`);
    
        if (oversizedChunks > 0) {
            console.error(` CRITICAL: ${oversizedChunks} chunks still exceed Ollama limits!`);
        }
    */

    // Validate critical chunks are present
    const hasAreaChunks = results.some(r =>
        r.chunks.some(c => c.metadata.chunkType === 'area')
    );
    const hasSummaryChunks = results.some(r =>
        r.chunks.some(c => c.metadata.chunkType === 'summary')
    );
    const hasDetailChunks = results.some(r =>
        r.chunks.some(c => c.metadata.chunkType === 'detail')
    );

    console.log(`\n Chunk Type Validation:`);
    console.log(`   • Summary chunks: ${hasSummaryChunks ? ' Present' : ' Missing'}`);
    console.log(`   • Area chunks: ${hasAreaChunks ? ' Present' : ' Missing'}`);
    console.log(`   • Detail chunks: ${hasDetailChunks ? ' Present' : ' Missing'}`);

    if (!hasAreaChunks) {
        console.warn(`WARNING: No area chunks found! Location-based queries may not work properly.`);
    };


    return results;
}

function validateParentChildRelations(chunks: Chunk[]): void {
    const parentChunks = chunks.filter(c => !c.metadata.isSubChunk); //if it's without the isSubChunk parameter is the father
    const childChunks = chunks.filter(c => c.metadata.isSubChunk);

    console.log(`Parent chunks: ${parentChunks.length}`);
    console.log(`Child chunks: ${childChunks.length}`);

    /*childChunks.forEach(child => {
        if (!child.metadata.parentUuid) {
            console.warn(` Child chunk without parent: ${child.metadata.name}`);
        }
    });*/
    childChunks.forEach(child => {
        const parent = parentChunks.find(p => p.metadata.chunkId === child.metadata.parentChunkId);
        if (!parent) {
            console.warn(` Orphaned child: ${child.metadata.name} (${child.metadata.chunkId})`);
        } else {
            console.log(` Valid parent-child: ${child.metadata.name} → ${parent.metadata.name}`);
        }
    });
}


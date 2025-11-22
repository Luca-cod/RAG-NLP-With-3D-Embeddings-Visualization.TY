import { Document as LangChainDocument } from "langchain/document";
import { EndpointMetadata } from "src/core/retrieval/loaders/loadDocumentJSON3.js";
import { ChunkType } from "src/core/retrieval/loaders/loadDocumentJSON3.js";


// Service dedicated to deduplication and lightweight document filtering



/**
 * Apply lightweight deduplication and filtering to documents
 */


export function filterAndDeduplicateDocuments(
    docs: LangChainDocument[],
    query: string
): LangChainDocument[] {
    console.log(`Start processing of ${docs.length} documents for query: "${query}"`);

    //Raggruppa per ACK session ID invece che per UUID 
    const seqSessions = new Map<string, LangChainDocument[]>();

    for (const doc of docs) {

        const meta = doc.metadata as EndpointMetadata;
        const sessionId = meta.ackSystem?.sessioId || 'no-ack';

        if (!seqSessions.has(sessionId)) {
            seqSessions.set(sessionId, []);
        }
        seqSessions.get(sessionId)!.push(doc);

        //console.log("Riproviamo a vedere se prima del master filtraggio ci sono documenti con type area dc", JSON.stringify(meta.type));

    }

    //For every ack session, mantain the father + relevant children
    const filteredDocs: LangChainDocument[] = [];
    for (const [sessionId, sessionDocs] of seqSessions.entries()) {
        if (sessionId === 'no-ack') {
            // Documenti senza sistema ACK - applica logica normale
            filteredDocs.push(...sessionDocs);
            continue;
        }

        // Trova il chunk padre (ID 0)
        const parentChunk = sessionDocs.find(d =>
            d.metadata.ackSystem?.chunkId === 0
        );

        if (parentChunk) {
            filteredDocs.push(parentChunk);

            // Aggiungi i chunk figli più rilevanti per la query
            const childChunks = sessionDocs.filter(d =>
                d.metadata.ackSystem?.chunkId > 0
            );

            /*   DEVO FARE UNA FUNZIONE PER CAPIRE IN BASE ALLA QUERY QUALI SONO I PARAMETRI PIÙ RILEVANGTI IN UN CHUNK TROPPO GRANDE E SPLITTATO BOH!
            const relevantChildren = selectRelevantAckChildren(childChunks, query);
            filteredDocs.push(...relevantChildren);*/
        } else {
            // Se non c'è padre, mantieni tutto
            filteredDocs.push(...sessionDocs);
        }
    }


    //Deduplication (removes duplicates while keeping the most relevant)
    /* const deduplicatedDocs = deduplicateDocuments(docs);

     // Final validation
     const validDocs = validateDocuments(deduplicatedDocs);

     console.log(`Processing completed: ${docs.length} → ${validDocs.length} documents`);

     return validDocs;*/
    return filteredDocs;
}

/*
        FUNZIONE CHE DOVREBBE DETERMNIARE TRA I CHUNK SPLITTATI QUALE PARAMETRO IN BASE ALLA QUERY È PIÙ RILEVANTE,  NON MI IMPORTA ADESSO
function selectRelevantAckChildren(children: LangChainDocument[], query: string): LangChainDocument[] {
    const queryKeywords = extractKeywords(query);

    return children.filter(child => {
        const content = child.pageContent.toLowerCase();
        const hasRelevantKeyword = queryKeywords.some((keyword: any) =>
            content.includes(keyword.toLowerCase())
        );

        // Se è rilevante o se è uno dei primi chunk (priorità)
        return hasRelevantKeyword || child.metadata.ackSystem?.chunkId <= 3;
    }).slice(0, 5); // Massimo 5 chunk figli
}*/

/**
 * Deduplicates documents while keeping the most relevant version of each UUID
 */
function deduplicateDocuments(docs: LangChainDocument[]): LangChainDocument[] {
    console.log(` Deduplication of ${docs.length} documents`);


    const docsByKey = new Map<string, LangChainDocument>();
    const uniqueDocs = Array.from(docsByKey.values());
    const seenUUIDs = new Set<string>();

    //Don't deduplicate different chunks if they are create by the same device
    if (docs.length > 0) {
        const firstDoc = docs[0];
        const firstMeta = firstDoc.metadata as EndpointMetadata;

        //Se sono tutti dello stesso dispositivo ma chunk diversi, mantieni tuttp
        const allSameDevice = docs.every(doc =>
            (doc.metadata as EndpointMetadata).uuid === firstMeta.uuid
        );

        /* 
                         OTTIMO FUNZIONA, STAMPA TUTTI CHUNK DETAIL!
        if (allSameDevice && docs.length > 1) {
             console.log(` Keeping all ${docs.length} chunks for device ${firstMeta.name} - they contain different information`);
             return docs; //Stampa 78 documenti tutti detail
         }*/

    }


    for (const doc of docs) {
        try {
            const meta = doc.metadata as EndpointMetadata;
            //const uuid = meta.uuid || meta.areaUuid;

            // 🔥 PRESERVA TUTTI I DETAIL CHUNKS 
            if (meta.chunkType === 'detail') {
                console.log(` Keeping detail chunk: ${meta.name}`);
                uniqueDocs.push(doc);
                continue;
            }

            // Per altri tipi, applica deduplicazione normale
            const uuid = meta.uuid || meta.areaUuid;
            if (!uuid || !seenUUIDs.has(uuid)) {
                if (uuid) seenUUIDs.add(uuid);
                uniqueDocs.push(doc);
            }

            if (!uuid) {
                console.warn("Document without UUID, maintained for safety");
                const key = `no-uuid-${Math.random()}`;
                if (!docsByKey.has(key)) {
                    docsByKey.set(key, doc);
                }
                continue;
            }

            if (meta.isSubChunk || meta.subChunkIndex !== undefined) {
                console.log(` Keeping sub-chunk: ${meta.name} - ${meta.subChunkIndex}`);
                uniqueDocs.push(doc);
                continue;
            }




            // Create a unique key for UUID + chunkType
            const uniqueKey = `${uuid}-${meta.chunkType}-${meta.subChunkIndex || 'main'}-${meta.splitField || 'none'}- ${meta.uniqueChunkId || ''}`;

            //if is a subChunks, mantain always
            if (meta.isSubChunk || meta.subChunkIndex !== undefined) {
                docsByKey.set(uniqueKey, doc);
                console.log(` Keeping sub-chunk: ${uniqueKey}`);
            }
            //else applic the normal logic for deduplication
            else if (!docsByKey.has(uniqueKey) || isMoreInformative(doc, docsByKey.get(uniqueKey)!)) {
                docsByKey.set(uniqueKey, doc);
            }

        } catch (error) {
            console.error("Error in deduplication:", error);
        }
    }




    console.log(` Deduplication: ${docs.length} → ${uniqueDocs.length} documents`);

    //Log of mantain chunks type
    const chunkTypes = uniqueDocs.reduce((acc: any, doc: any) => {
        const type = (doc.metadata as EndpointMetadata).chunkType || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;

    }, {} as Record<string, any>);


    console.log(` Final chunk types:`, chunkTypes);
    // console.log(` Deduplication: ${docs.length} → ${uniqueDocs.length} documents`);

    return uniqueDocs;
}

/**
 * Determine whether one document is more informative than another
 */
function isMoreInformative(doc1: LangChainDocument, doc2: LangChainDocument): boolean {
    const meta1 = doc1.metadata as EndpointMetadata;
    const meta2 = doc2.metadata as EndpointMetadata;

    // Prefer documents with more parameters (for detail chunks)
    const params1 = meta1.parametersCount || 0;
    const params2 = meta2.parametersCount || 0;

    if (params1 > params2) return true;
    if (params1 < params2) return false;

    // Prefer documents with area information (for area chunks)
    const hasArea1 = meta1.hasAreaInfo || false;
    const hasArea2 = meta2.hasAreaInfo || false;

    if (hasArea1 && !hasArea2) return true;
    if (!hasArea1 && hasArea2) return false;

    // For area chunks, prefer those with more devices
    if (meta1.chunkType === 'area' && meta2.chunkType === 'area') {
        const devices1 = meta1.devicesCount || 0;
        const devices2 = meta2.devicesCount || 0;

        if (devices1 > devices2) return true;
        if (devices1 < devices2) return false;
    }

    // In case of a tie, keep the first
    return false;
}



/**
 * Final validation for documents
 */
function validateDocuments(docs: LangChainDocument[]): LangChainDocument[] {

    const validDocs = docs.filter(doc => {

        const meta = doc.metadata as EndpointMetadata;


        if (!doc?.metadata || !doc.pageContent) {
            console.warn("Document without metadata or pageContent discarded");
            return false;
        }

        //Check for parentUuid
        if (meta.chunkType === 'detail' && !meta.parentUuid) {
            console.warn("Detail chunk without parentUuid", meta.name);
            return false;
        }


        //Allow both UUID and aeaUuid for different chunk type
        const hasValid = meta.uuid || (meta.chunkType === 'area' && meta.areaUuid);
        if (!hasValid) {
            console.warn(`Document without valid ID discarded: ${meta.name}`);
            return false;
        }

        // Basic content check with different thresholds per chunk type
        const minLength = meta.chunkType === 'area' ? 50 : 10; // Area chunks need more content
        if (doc.pageContent.trim().length < minLength) {
            console.warn(`Document with too short content discarded: ${meta.name} (${doc.pageContent.trim().length} chars)`);
            return false;
        }

        return true;
    });

    if (validDocs.length === 0 && docs.length > 0) {
        console.warn("Warning: Validation has deleted all documents");
        // Fallback: Returns the first 3 documents for debugging
        return docs.slice(0, 3);
    }

    return validDocs;
}

/**
 * Utility method for detailed logging
 */
export function logFilteringResults(
    originalDocs: LangChainDocument[],
    filteredDocs: LangChainDocument[],
    query: string
): void {
    console.log("\n FILTERING RESULTS:");
    console.log(`Query: "${query}"`);
    console.log(`Original documents: ${originalDocs.length}`);
    console.log(`Final documents: ${filteredDocs.length}`);

    // Statistics for type
    const typeStats: Record<string, number> = {};
    filteredDocs.forEach(doc => {
        const meta = doc.metadata as EndpointMetadata;
        const type = meta.type || 'unknown';
        typeStats[type] = (typeStats[type] || 0) + 1;
    });

    //console.log(" Statistiche per tipo:", typeStats);

    console.log("\n Final documents (first 5):");
    filteredDocs.slice(0, 5).forEach((doc, i) => {
        const meta = doc.metadata as EndpointMetadata;
        console.log(`- [${i + 1}] ${meta.name || 'Without name'} (${meta.type}/${meta.chunkType})`);
    });

    if (filteredDocs.length === 0 && originalDocs.length > 0) {
        console.log("\n Debugging - Available Document Types:");
        const availableTypes = new Set(originalDocs.map(doc =>
            (doc.metadata as EndpointMetadata).type || 'unknown'
        ));
        console.log("Available types:", Array.from(availableTypes));
    }
}

// Helper function per debug
export function debugDocumentStructure(doc: LangChainDocument): void {
    console.log(" Document structure:", {
        metadataType: doc.metadata?.type,
        chunkType: doc.metadata?.chunkType,
        uuid: doc.metadata?.uuid,
        name: doc.metadata?.name,
        hasAreaInfo: doc.metadata?.hasAreaInfo,
        pageContentLength: doc.pageContent?.length
    });
}
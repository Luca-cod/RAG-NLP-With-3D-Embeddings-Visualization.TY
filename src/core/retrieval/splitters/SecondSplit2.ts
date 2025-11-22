

import { ChunkType, EndpointMetadata, SeqMetadata } from "../loaders/loadDocumentJSON.js";
import { Chunk } from "./createSchemaAware.js";



export interface ExtendsSeqMetadata extends EndpointMetadata {
    sequenceNumberSystem?: SeqMetadata;
    parentChunkId?: string;
    chunkId?: string;
    isParent?: boolean;
    totalChildren?: number;

}



/**
The problem:the RecursiveCharacterTextSplitter fails because installation-config.json is a single compact JSON object with no natural separators 
that the text splitter can use. 
 
The new structural approach fixes the problem.
Why it failed before:

RecursiveCharacterTextSplitter looks for text separators (\n\n, ., spaces)
installation-config.json is a compact JSON blob with no natural separators.
The system was always looping over the same 37,005-character object.

This function is used to split or divide a JSON object that is too large into chunks!
Since an object (e.g., a device) can contain multiple parameters (we split by parameters), I was encountering system blocking issues.
If I recursively split using LangChain’s splitter, I ended up with many chunks not linked to the “parent” chunk, thus risking loss of information and being unable to connect 
the split data back to the object from which it was obtained, potentially losing relevant information and creating significant “noise” in the context that I would then pass to the LLM.
For this reason, I opted for a secondary function that further splits and recursively divides oversized objects/chunks, while maintaining a link/hierarchy between 
the “parent” object and the resulting “child” chunks. This ensures that no relevant information is lost for the system.

Main Features

Recursive: Can split child chunks that are too large.

JSON Structure Parsing: Identifies main arrays (area, partitions, endpoints, devices).

Element-based Splitting: Each array element becomes a separate chunk.

Hierarchical: Each child chunk retains the parent’s links and information.

Robust: Protects against infinite recursion and splitting errors.

Guaranteed Validation: Ensures each chunk is ≤ chunkSize; otherwise, applies text splitting.

Intelligent Fallback: If no arrays are found, it tries splitting by properties; otherwise, it truncates.

This code is designed to break a complex JSON into smaller, manageable pieces, preserving the hierarchical structure and critical metadata. It can perform recursive splitting or fallback splitting if needed.*/


export function splitLargeJsonObjectByArrayField(
    obj: any, //→ Represents the JSON object to be split (e.g., device, area, or endpoint)
    maxChunkSize: number,
    chunk: Chunk,
    depth: number = 0 //Recursion depth, to avoid infinite loops (default 0)
): Chunk[] {

    let count = 0;

    const metadata = chunk.metadata as EndpointMetadata;



    // Check if it is receiving the correct structure.
    if (obj.data) {
        console.log(`   - Data object keys: ${Object.keys(obj.data).join(', ')}`);
    }
    if (obj.endpoints) {
        console.log(`   - Endpoints count: ${obj.endpoints.length}`);
    }


    // Recursion protection.
    if (depth > 5) {
        console.warn("Max depth reached, truncating");
        return [{
            pageContent: JSON.stringify(obj).substring(0, maxChunkSize),
            metadata: {
                ...metadata,
                warning: "Max depth reached - truncated",
                error: "Structural splitting failed"
            }
        }
        ];
    }


    try {

        const normalizeMetadata = normalizeLocationMetadata(metadata); //mantiene parametri di locazione

        //Preserve all critical metadata 
        const criticalMetadata: EndpointMetadata = {
            ...normalizeMetadata,
            splitAttempted: true,
            name: metadata.name,
            visualizationType: metadata.visualizationType,
            category: metadata.category,
            chunkType: metadata.chunkType
        };
        //Critical metadata ha parametri di locazione + splitAttempted, visulaType, cateogria. Il resto può cambiare


        let targetObject = obj;  //`targetObject` represents the specific data; we use it for array splitting.

        //console.log("Content of targetObject:", JSON.stringify(targetObject, null, 2));

        if (obj.parameterData && typeof obj.parameterData === 'object') {
            console.log(`   - Switching to parameterData for array search`);
            targetObject = obj.parameterData;
        }
        else if (obj.data && typeof obj.data === 'object') {
            targetObject = obj.data;
            console.log("   - Switching to data object for array search");
        }

        //console.log(`   - Final target object structure ${Object.keys(targetObject).join(', ')}`);

        //   ==============================================================================================================================
        //                                      SPECILA HANDLIGN FOR SUMMARY CHUNKS
        //   ==============================================================================================================================

        if (criticalMetadata.chunkType === 'summary') {
            return splitSummaryChunksHierarchical(obj, maxChunkSize, criticalMetadata, depth);
        }


        //   ==============================================================================================================================
        //                                       ORIGINAL LOGIC FOR DETAIL/AREA CHUNKS                          
        //   ==============================================================================================================================
        const topLevelArrays = ['area', 'partitions', 'endpoints', 'devices', 'parameters']; //Top-level structure of the input JSON file.


        /*DEBUG for visula what arrays is found
       console.log(`   -Checking for arrays in targetObject`);
        topLevelArrays.forEach(field => {
            if (Array.isArray(targetObject[field])) {
              //  console.log(`  FOUND: ${field} with targetObject dimension:${targetObject[field].length}`);
            }
        });*/

        //Version with sequence number to link children to parent
        const splitSessionId = `split-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const totalChunks = calculateTotalChunks(targetObject, topLevelArrays);

        //Create a father chunk
        const parentChunk = createParentChunk(obj, criticalMetadata, splitSessionId, totalChunks);

        const chunks: Chunk[] = [parentChunk];


        //create chunk father (header)
        let chunkIndex = 1; //Inizia da 1 (0) il padre




        // Search for array fields to split – now we look directly in the object, not in `obj.data`.
        for (const field of topLevelArrays) {
            const array = targetObject[field];

            if (Array.isArray(array) && array.length > 0) {

                console.log(`Splitting field ${field} with ${array.length} items`);


                for (const [index, item] of array.entries()) {

                    const chunkMetadata: EndpointMetadata = {  //For more informations 
                        ...criticalMetadata,
                        // chunkType: 'detail' as const,

                        //System SequenceNumb like IP
                        sequenceNumberSystem: {
                            sessionId: splitSessionId,
                            chunkId: chunkIndex,
                            totalChunks: totalChunks,
                            parentChunkId: 0, //0 = parent chunk
                            isSequneceNumbChunk: true,
                            role: chunkIndex === 0 ? 'parent_device' : 'device_parameter',
                            relationship: chunkIndex === 0 ? 'contains_parameters' : `parameter_of_device_${metadata.uuid}`
                        },
                        chunkId: `0.${index + 1}`, // Hierarchical System: 0.1, 0.2, 0.3
                        parentChunkId: "0", //Explicit reference to parent
                        structuralChunk: true,
                        sourceArray: field,
                        arrayIndex: index,
                        totalArrayItems: array.length,
                        subChunkIndex: count++,
                        uuid: item.uuid || item.id || `${field}-${index}`,
                        name: item.name || `${field} ${index + 1}`,
                        /*
                        
                        / UUID unico per ogni chunk figlio (evita deduplicazione)
                        uuid: `${criticalMetadata.uuid}-param-${index}`,
  
                         //  NAME of the parent device (for textual queries)*/
                        fatherName: criticalMetadata.name,
                        isSubChunk: true,
                        usbChunkIndex: index,  //Unique index
                        totalSubChunks: array.length, // Total chunks
                        splitField: field, // Split field
                        uniqueChunkId: `${metadata.uuid}-params-${index}-${field}`, // ID univoco

                        //Link to parent device, hierarchic relation
                        parentUuid: criticalMetadata.uuid,
                        parentName: criticalMetadata.name,
                        parentChunktype: criticalMetadata.chunkType,
                        deviceCategory: criticalMetadata.category,
                        visualizationType: criticalMetadata.visualizationType,
                        hierarchicalRole: chunkIndex === 0 ? 'device_parent' : 'parameter_child',
                        parentDeviceName: metadata.name, // Readable name, not just UUID
                        parentDeviceCategory: metadata.category,

                        // Parameter-specific metadata
                        isParameterChunk: true,
                        parameterIndex: index,
                        parameterName: item.name,
                        parameterDataType: item.dataType,

                        // Inherit all query flags from the parent!
                        hasControlParams: criticalMetadata.hasControlParams,
                        hasMeasurementParams: criticalMetadata.hasMeasurementParams,
                        hasConfigParams: criticalMetadata.hasConfigParams,
                        hasAutomationParams: criticalMetadata.hasAutomationParams,

                        // Inherited location metadata
                        isFirstFloor: criticalMetadata.isFirstFloor,
                        isSecondFloor: criticalMetadata.isSecondFloor,
                        floorLocation: criticalMetadata.floorLocation,
                        partitionNames: criticalMetadata.partitionNames,


                    };



                    const childChunk = createChildChunk(item, chunkMetadata, field, index);
                    if (childChunk.pageContent.length <= maxChunkSize) {
                        chunks.push(childChunk);
                        //console.log("Child chunk create:", JSON.stringify(childChunk, null, 2)) //----> Provo a stampare il contenuto dei figli per debug

                    } else {
                        console.log(`Recursing into oversized ${field} item ${index}`);

                        const subChunk = splitLargeJsonObjectByArrayField(
                            JSON.parse(childChunk.pageContent),
                            maxChunkSize,
                            //Creo oggetto Chunk che unisce anche oggetto EndpointMetadata
                            {
                                pageContent: childChunk.pageContent,
                                metadata: chunkMetadata
                            },
                            depth + 1
                        );
                        chunks.push(...subChunk);


                    }

                    chunkIndex++;

                    // Print child chunks
                    //console.log(` This is a child ${JSON.stringify(childChunk,null,2)}- ${metadata.ackMetadata?.sessionId}  of ---> ${JSON.stringify(parentChunk)} with 
                    //${JSON.stringify(chunkIndex)}`);

                }
                console.log(`   Split completed for ${field}. Chunks created: ${chunks.length}`);

            }

        }
        if (chunks.length > 0) {
            return chunks;
        }
        // FALLBACK: If no array is found, split by main properties
        console.log(" No arrays found, attempting property-based split");
        return splitByProperties(obj, maxChunkSize, criticalMetadata, depth);

    } catch (error) {
        console.error(" Error in splitLargeJsonObjectByArrayField:", error);

        let errorMessages = "Uknown error";
        if (error instanceof Error) errorMessages = error.message;

        return [{

            pageContent: JSON.stringify(obj).substring(0, maxChunkSize),
            metadata: {
                ...metadata,
                error: `Splitting error: ${errorMessages}`
            }
        }];
    }


}
// ==============================================================================================================
//                                   Fallback function to split by properties
// ==============================================================================================================
function splitByProperties(obj: any, maxChunkSize: number, metadata: EndpointMetadata, depth: number): Chunk[] {
    const chunks: Chunk[] = [];
    const properties = ['area', 'endpoints', 'metadata', 'configurations'];

    for (const prop of properties) {
        if (obj[prop] && typeof obj[prop] === 'object') {
            const propChunk = {
                type: prop,
                [prop]: obj[prop]
            };

            const str = JSON.stringify(propChunk);
            if (str.length <= maxChunkSize) {
                chunks.push({
                    pageContent: str,
                    metadata: {
                        ...metadata,
                        chunkType: 'partial' as ChunkType,
                        splitProperty: prop,
                        floorLocation: metadata.floorLocation || 'Unknown'
                    }
                }
                );
            }
        }
    }

    if (chunks.length > 0) {
        console.log(` Fallback split created ${chunks.length} chunks with location metadata`);
        return chunks;
    }

    return [{
        pageContent: JSON.stringify(obj).substring(0, maxChunkSize),
        metadata: {
            ...metadata,
            warning: "Fallback truncation",
            originalSize: JSON.stringify(obj).length,
            floorLocation: metadata.floorLocation || 'unknown'
        }
    }
    ];
}


// ===================================================================================================================
//                                      Chunk creation for the hierarchy
// ===================================================================================================================

//Create the main chunk with general information about the device/object. It contains the total number of chunks and a summary message.
function createParentChunk(originalObj: any, baseMetadata: EndpointMetadata, sessionId: string, totalChunks: number): Chunk {
    const parentContent = {
        type: 'parent',
        SeqHeader: {
            sessionId: sessionId,
            chunkId: 0, // ID 0 = chunk padre
            totalChunks: totalChunks,
            message: `This device has ${totalChunks - 1} parameter chunks. Refer to chunks 1-${totalChunks - 1} for details.`,
            chunkType: baseMetadata.chunkType
        },
        deviceInfo: {
            name: baseMetadata.name,
            uuid: baseMetadata.uuid,
            category: baseMetadata.category
        }
    };

    return {
        pageContent: JSON.stringify(parentContent),
        metadata: {
            ...baseMetadata,
            chunkType: parentContent.SeqHeader.chunkType, // Ritorno ovviamente il chunkType del padre, che sia detail,summer o area
            sequenceNumberSystem: {
                sessionId: sessionId,
                chunkId: 0,
                totalChunks: totalChunks,
                isParent: true
            }
        }
    };
}


//Create child chunks for each element of the array. Inherits metadata from the parent chunk. Includes hierarchical information (parentUuid, sequenceNumberSystem, etc.).
function createChildChunk(item: any, metadata: EndpointMetadata, field: string, index: number): Chunk {

    const chunkObj = {
        type: 'parameter',
        seqInfo: {
            sessionId: metadata.sequenceNumberSystem!.sessionId,
            chunkId: metadata.sequenceNumberSystem!.chunkId,
            parentChunkId: 0,
            parameterIndex: index
        },
        parameterData: item
    };

    //Preserve critical metadatas of parent
    const preservedMetadata: EndpointMetadata = {
        ...metadata,
        visualizationType: metadata.visualizationType,
        category: metadata.category,
        categoryName: metadata.categoryName,
        deviceType: metadata.deviceType,
        name: metadata.name,
        uuid: metadata.uuid,

        // Location metadata
        isFirstFloor: metadata.isFirstFloor,
        isSecondFloor: metadata.isSecondFloor,
        floorLocation: metadata.floorLocation,
        partitionNames: metadata.partitionNames,

        // Flags of query
        hasControlParams: metadata.hasControlParams,
        hasMeasurementParams: metadata.hasMeasurementParams,
        hasConfigParams: metadata.hasConfigParams
    };

    return {
        pageContent: JSON.stringify(chunkObj),
        metadata: preservedMetadata
    };
}


function calculateTotalChunks(targetObject: any, fields: string[]): number { //---> Calcola i chunks che sono stati splittati dal chunk padre?????
    let total = 1; // Always include at least the parent chunk

    for (const field of fields) {
        const array = targetObject[field];
        if (Array.isArray(array)) {
            total += array.length;
        }
    }

    return total;
}


function normalizeLocationMetadata(meta: EndpointMetadata): EndpointMetadata {
    //Handle both booleans and strings
    const isFirst = meta.isFirstFloor === 'first' || meta.isFirstFloor === 'First' || meta.isFirstFloor === 'true';
    const isSecond = meta.isSecondFloor === 'second' || meta.isSecondFloor === 'Second' || meta.isSecondFloor === 'true';

    let floorLocation = meta.floorLocation;

    // Calcola floorLocation solo se non è già definito o è incoerente
    if (!floorLocation || floorLocation === 'unknown' || floorLocation === undefined) {
        if (isFirst && isSecond) floorLocation = 'both';
        else if (isFirst) floorLocation = 'first';
        else if (isSecond) floorLocation = 'second';
        else floorLocation = 'unknown';
    }

    return {
        ...meta,
        isFirstFloor: isFirst ? 'first' : 'unknown',
        isSecondFloor: isSecond ? 'second' : 'unknown',
        floorLocation: floorLocation.toLowerCase()
    };


};


function splitSummaryChunksHierarchical(
    obj: any,
    maxChunkSize: number,
    baseMetadata: EndpointMetadata,
    depth: number
): Chunk[] {

    const chunk: Chunk[] = [];
    const splitSessionId = `summary-split-${Date.now()}-${Math.random().toString(36).substring(2, 9)} `;

    //Calculate total chunks for summary(endpoint + stats)
    const totalChunks = 3; //parent + endpoint + stats

    //1. Create parent Chunk
    const parentChunk = createSummaryParentChunk(obj, baseMetadata, splitSessionId, totalChunks);
    chunk.push(parentChunk);

    let chunkIndex = 1;

    //2. Create endpoint overview chunk
    if (obj.endpoint) {
        const endpointChunk = createSummarySubChunk(
            {
                type: 'summary-endpoint',
                endpoint: obj.endpoint,
                searchableText: obj.searchableText
            },
            baseMetadata,
            splitSessionId,
            chunkIndex++,
            totalChunks,
            'endpoint-overview',
            'Endpoint-overview'
        );

        if (endpointChunk.pageContent.length <= maxChunkSize) {
            chunk.push(endpointChunk);
        } else {
            //Recursive splitting if endpoint chunks is too large
            const subChunks = splitLargeJsonObjectByArrayField(
                JSON.parse(endpointChunk.pageContent),
                maxChunkSize,
                {
                    pageContent: endpointChunk.pageContent,
                    metadata: endpointChunk.metadata
                },
                depth + 1
            );
            chunk.push(...subChunks);
        }
    }

    //3.Create a prameter stats chunk
    if (obj.parametersStats) {
        const statsChunk = createSummarySubChunk(
            {
                type: 'summary-stats',
                parametersStats: obj.parametersStats,
                endpointUuid: obj.endpoint?.uuid
            },
            baseMetadata,
            splitSessionId,
            chunkIndex++,
            totalChunks,
            'parameters-stats',
            'Parameters statistics'
        );

        if (statsChunk.pageContent.length <= maxChunkSize) {
            chunk.push(statsChunk);
        } else {
            //Handle oversize stats chunk
            const subChunk = splitByProperties(
                { parametersStats: obj.parametersStats },
                maxChunkSize,
                statsChunk.metadata as EndpointMetadata,
                depth + 1
            );

            chunk.push(...subChunk);
        }
    }

    console.log(`Summary chunk split into ${chunk.length} hierarchical chunks`);
    return chunk;
}

function createSummaryParentChunk(
    originalObj: any,
    baseMetadata: EndpointMetadata,
    sessionId: string,
    totalChunks: number
): Chunk {

    const parentContent = {
        type: 'parent',
        SeqHeader: {
            sessionId: sessionId,
            chunkId: 0,
            totalChunks: totalChunks,
            chunktype: 'summary'
        },
        summaryInfo: {
            name: baseMetadata.name,
            uuid: baseMetadata.uuid,
            category: baseMetadata.cateogry,
            visualizationType: baseMetadata.visualizationType,
            originalChunkType: baseMetadata.chunkType //Se sempre summary come appunto dovrebbe per forza di cose essere, cancello, oppure mantengo questa e cancello quella statica sopra
        }

    };

    return {
        pageContent: JSON.stringify(parentContent),
        metadata: {
            ...baseMetadata,
            chunkType: 'summary',
            sequenceNumberSystem: {
                sessionId: sessionId,
                chunkId: 0,
                totalChunks: totalChunks,
                isParent: true
            }
        }
    };
}

function createSummarySubChunk(
    data: any,
    baseMetadata: EndpointMetadata,
    sessionId: string,
    chunkId: number,
    totalChunks: number,
    subChunkType: string,
    name: string
): Chunk {

    const chunkMetadata: EndpointMetadata = {
        ...baseMetadata,

        //Info for type EndpointMetadata
        source: baseMetadata.source,
        loc: baseMetadata.loc,
        type: baseMetadata.type,
        isValid: baseMetadata.isValid,
        timestamp: baseMetadata.timestamp,


        sequenceNumberSystem: {
            sessionId: sessionId,
            chunkId: chunkId,
            totalChunks: totalChunks,
            parentChunkId: 0,
            //isSequenceNumberChunk: true,
            //role: 'summary-component',
            //relationship: `component_of_${baseMetadata.uuid}`
        },
        chunkId: `0.${chunkId}`,
        parentChunkId: "0",
        structuralChunk: true,
        //sourceArray: 'summary_components',
        arrayIndex: chunkId - 1,
        //totalArrayItems: totalChunks - 1,
        subChunkIndex: chunkId - 1,
        uuid: `${baseMetadata.uuid}-${subChunkType}`,
        name: `${baseMetadata.name} - ${name}`,
        fatherName: baseMetadata.name,
        isSubChunk: true,
        //usbChunkIndex: chunkId - 1,
        totalSubChunks: totalChunks - 1,
        //splitField: 'summary',
        uniqueChunkId: `${baseMetadata.uuid}-${subChunkType}-${chunkId}`,
        parentUuid: baseMetadata.uuid,
        parentName: baseMetadata.name,
        parentChunktype: 'summary',
        deviceCategory: baseMetadata.category,
        visualizationType: baseMetadata.visualizationType,
        //hierarchicalRole: 'summary_component',
        //parentDeviceName: baseMetadata.name,
        //parentDeviceCategory: baseMetadata.category,
        //isParameterChunk: false,
        parameterIndex: chunkId - 1,
        parameterName: name,
        subChunkType: subChunkType
    };

    return {
        pageContent: JSON.stringify(data),
        metadata: chunkMetadata
    };
}

/**
 * Helper function to create child metadata (extracted from main function)
 */
function createChildMetadata(
    criticalMetadata: EndpointMetadata,
    sessionId: string,
    chunkIndex: number,
    totalChunks: number,
    field: string,
    index: number,
    count: number,
    item: any
): EndpointMetadata {
    return {
        ...criticalMetadata,
        sequenceNumberSystem: {
            sessionId: sessionId,
            chunkId: chunkIndex,
            totalChunks: totalChunks,
            parentChunkId: 0,
            isSequneceNumbChunk: true,
            role: chunkIndex === 0 ? 'parent_device' : 'device_parameter',
            relationship: chunkIndex === 0 ? 'contains_parameters' : `parameter_of_device_${criticalMetadata.uuid}`
        },
        chunkId: `0.${index + 1}`,
        parentChunkId: "0",
        structuralChunk: true,
        sourceArray: field,
        arrayIndex: index,
        totalArrayItems: totalChunks - 1,
        subChunkIndex: count,
        uuid: item.uuid || item.id || `${field}-${index}`,
        name: item.name || `${field} ${index + 1}`,
        fatherName: criticalMetadata.name,
        isSubChunk: true,
        usbChunkIndex: index,
        totalSubChunks: totalChunks - 1,
        splitField: field,
        uniqueChunkId: `${criticalMetadata.uuid}-params-${index}-${field}`,
        parentUuid: criticalMetadata.uuid,
        parentName: criticalMetadata.name,
        parentChunktype: criticalMetadata.chunkType,
        deviceCategory: criticalMetadata.category,
        visualizationType: criticalMetadata.visualizationType,
        hierarchicalRole: chunkIndex === 0 ? 'device_parent' : 'parameter_child',
        parentDeviceName: criticalMetadata.name,
        parentDeviceCategory: criticalMetadata.category,
        isParameterChunk: true,
        parameterIndex: index,
        parameterName: item.name,
        parameterDataType: item.dataType,
        hasControlParams: criticalMetadata.hasControlParams,
        hasMeasurementParams: criticalMetadata.hasMeasurementParams,
        hasConfigParams: criticalMetadata.hasConfigParams,
        hasAutomationParams: criticalMetadata.hasAutomationParams,
        isFirstFloor: criticalMetadata.isFirstFloor,
        isSecondFloor: criticalMetadata.isSecondFloor,
        floorLocation: criticalMetadata.floorLocation,
        partitionNames: criticalMetadata.partitionNames,
    };
}
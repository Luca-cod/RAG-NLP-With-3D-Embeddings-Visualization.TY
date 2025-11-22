import { DEVICE_CATEGORIES } from "../../../config/RAG.js";
import { EndpointMetadata, ChunkType } from "../loaders/loadDocumentJSON.js";
import { getConfig } from "src/services/query/getConfig.js";
import { debugDeviceType } from "../../../utils/logging/debugLogger.js"



/**
 * Creates multiple chunk types from a single installation-config document, specifically, 7 chunks detail, 7 chunks summary, and 1 area chunks.
 */



export type Chunk = {
    pageContent: string;
    metadata: Record<string, any>;
};

let count = 0;

export async function createSchemaAwareChunk(
    parsedDocs: { parsedContent: any, metadata: EndpointMetadata }[],
    chunkSize: number,
    globalPartitionMap: any
): Promise<Chunk[]> {


    const allChunks: Chunk[] = [];
    console.log("PartitionMap received in createSchemaAwareChunk:", globalPartitionMap.size);

    if (!parsedDocs || !Array.isArray(parsedDocs)) {
        console.error("parsedDocs should be a valid document array");

    }

    //Now we expected only 1 document, so check for dimension of that document
    if (parsedDocs.length > 1) {
        console.warn("Error: we have expected only one documents but we got more,", parsedDocs.length);

    }

    const mainDoc = parsedDocs[0]; //Just take only the first (and guess unique) document
    const localAreas: any[] = [];

    // Raccogli tutte le aree da tutti i documenti --> Ora solamente da 1 documento!
    /*
    parsedDocs.forEach(doc => {
        if (doc.parsedContent && doc.parsedContent.areas && Array.isArray(doc.parsedContent.areas)) {
            localAreas.push(...doc.parsedContent.areas);
        }
    });*/

    if (mainDoc.parsedContent && mainDoc.parsedContent.areas && Array.isArray(mainDoc.parsedContent.areas)) {
        localAreas.push(...mainDoc.parsedContent.areas);
        console.log(` Collected ${localAreas.length} areas from main document`);

    } else {
        console.log(" No areas found in main document");
    }


    try {

        const { parsedContent, metadata } = mainDoc;


        if (!parsedContent || !metadata) {
            console.warn("Document without parsedContent or metadata, skipped");
            return [];
        }

        // Ensure we're working with installation-config type
        const normalizedMetadata = {
            ...metadata,
            type: 'installation-config' as const // Force single document type
        };

        //   ==========================================================================================================
        //                                      Create area chunks if areas is present
        //   ==========================================================================================================
        if (parsedContent.areas && Array.isArray(parsedContent.areas) && parsedContent.areas.length > 0) {
            console.log("Creating area chunks for ", parsedContent.areas.length);
            const areaChunks = createAreaTypeChunks(
                parsedContent,
                normalizedMetadata,
                globalPartitionMap,
            );
            allChunks.push(...areaChunks);
            console.log(` Created ${areaChunks.length} area chunks`);
        }
        else {
            console.log(" No areas found, skippiing area chunks");
        }

        //  ==========================================================================================================
        //                                            Create detail chunks
        //  ==========================================================================================================
        if (parsedContent.endpoints && Array.isArray(parsedContent.endpoints) && parsedContent.endpoints.length > 0) {


            console.log("Creating detail chunks! for", parsedContent.endpoints.length);

            const detailChunks = createDetailTypeChunks(
                parsedContent,
                normalizedMetadata,
                globalPartitionMap,
                localAreas
            );

            allChunks.push(...detailChunks);
            console.log("Count value:", count);


            //  ==========================================================================================================
            //                                            Create summary chunks
            //  ==========================================================================================================

            const summaryChunks = createInstallationSummaryChunk(
                parsedContent,
                normalizedMetadata,
                globalPartitionMap,
                localAreas
            );

            allChunks.push(...summaryChunks);


            console.log("Created:", detailChunks.length, "detail chunks, ", summaryChunks.length, "summary chunks");


        } else {
            console.log(" No endpoints found, skipping detail chunks");
        }

        console.log(` Created ${allChunks.length} total chunks from main document`);

    } catch (error) {
        console.error(" Error processing main document:", error);
    }


    return allChunks;
}



/**
 * Creates area-type chunks from areas data (for location queries)
 */
function createAreaTypeChunks(
    parsedContent: any,
    baseMetadata: EndpointMetadata,
    partitionMap: Map<string, any>,
): Chunk[] {

    const chunks: Chunk[] = [];



    if (!parsedContent.areas || !Array.isArray(parsedContent.areas)) {
        console.log("In parsedContent non c'è il parametro areas! ");
        return chunks;
    }


    console.log(`Creating area-type chunks for ${parsedContent.areas.length} areas`);

    parsedContent.areas.forEach((area: any, areaIndex: number) => {
        if (!area) return;

        if (!area?.uuid) {
            console.warn(`Skipping invalid area at index ${areaIndex}`);
            return;
        }

        // DEBUG: Calcolo dettagliato del floor
        let areaFloorInfo = AreaFloorCalculation(area, partitionMap, area.name);

        // Estrai le partizioni e determina i piani
        areaFloorInfo = { isFirstFloor: 'Unknown', isSecondFloor: 'Unknown', floorName: 'Unknown floor' };

        if (area.partitions && Array.isArray(area.partitions)) {
            for (const partition of area.partitions) {
                const partitionUuid = typeof partition === 'object' ? partition.uuid : partition;
                const partitionFloor = getFloorInfoFromPartition(partitionUuid, partitionMap);

                if (partitionFloor.isFirstFloor) areaFloorInfo.isFirstFloor = 'First';
                if (partitionFloor.isSecondFloor) areaFloorInfo.isSecondFloor = 'Second';

                // Se trova un floor specifico, aggiorna il nome
                if (partitionFloor.floorName !== 'Unknown floor') {
                    areaFloorInfo.floorName = partitionFloor.floorName;
                }
            }
        }


        const areaPartitionNames = (area.partitions || []).map(((partition: any) => {
            const uuid = typeof partition === 'object' ? partition.uuid : partition;
            return partitionMap.get(uuid) || 'Unknown';

        })).filter((name: any) => !name.startsWith('Unknown'));

        // Get partition IDs for this area
        const areaPartitionIds = (area.partitions || []).map((p: any) =>
            typeof p === 'object' ? p.uuid : p
        );// getPartitionIds(areas);

        const associatedEndpoints = parsedContent.endpoints?.filter((endpoint: any) => {
            if (!endpoint.partitions || !Array.isArray(endpoint.partitions)) return false;
            return endpoint.partitions.some((endpointPartitionId: string) =>
                areaPartitionIds.includes(endpointPartitionId)
            );
        }) || [];

        // Get complete partition objects
        /*  const areaPartitions = getAreaPartitions(areas, partitionMap);
          const mainFloorName = findMainFloorName(areaPartitions);
          const floorInfo = extractFloorInfoFromArea(areas, areaPartitions);*/

        console.log(`Area ${area.name}: isFirstFloor=${areaFloorInfo.isFirstFloor}, isSecondFloor=${areaFloorInfo.isSecondFloor}`);


        /*  
                    OTTIMA ALTERNATIVA, ELIMINA USO DI FUNZIONI INUTILI
        const isFirstFloor = areaPartitions.some((partition: any) =>
            partition.name.toLowerCase().includes('first') || partition.name.toLowerCase().includes('primo')
        );
        
        const isSecondFloor = areaPartitions.some((partition: any) =>
            partition.name.toLowerCase().includes('second') || partition.name.toLowerCase().includes('secondo')
        );*/




        //ogni partitions contiene un uuid, ogni uuid è collegato ad un nome, ogni 
        //dispositivo ha un uuid che cosi collega il dispositivo ad una determinata sala
        //proprio perchè partitions è un id collegato ad una determinata sala.
        //Per cui devo associatere tale uuid al nome della sala es(First floor) e poi
        //cercando tra i dispositivi l'uuid associarlo al nome etrovare cosi la stanza



        const areaData = {
            type: 'installation-config',
            chunkType: 'area',
            areas: {
                uuid: area.uuid,
                name: area.name,
                id: area.id,
                longitude: area.longitude,
                latitude: area.latitude,
                partitions: (area.partitions || []).map((partition: any) => {
                    const uuid = typeof partition === 'object' ? partition.uuid : partition;
                    return {
                        uuid: uuid,
                        id: typeof partition === 'object' ? partition.id : uuid,
                        name: partitionMap.get(uuid) || `Partition_${uuid.substring(0, 8)}`
                    };
                })
            },
            devices: associatedEndpoints.map((endpoint: any) => ({
                uuid: endpoint.uuid,
                name: endpoint.name || 'Unnamed Device',
                id: endpoint.id,
                category: endpoint.category,
                categoryName: getCategoryName(endpoint.category),
                visualizationType: endpoint.visualizationType,
                deviceType: getDeviceType(endpoint.category),
                parametersCount: endpoint.parameters?.length || 0,
                defaultParameter: endpoint.defaultParameter,
                mainParameters: endpoint.parameters?.slice(0, 3)?.map((param: any) => ({
                    name: param.name,
                    dataType: param.dataType,
                    unit: param.unit,
                    operation: param.operation?.type
                })) || []
            })),
            searchableText: createAreaSearchableText(area, associatedEndpoints)

        };
        //Debug for length fo area chunks
        const areaContent = JSON.stringify(areaData, null, 2);
        if (areaContent.length < 10) {
            console.warn(`Area chunk content too short for area ${area.name}: ${areaContent.length} chars`);
        }

        const areaChunk: Chunk = {
            pageContent: JSON.stringify(areaData, null, 2),
            metadata: {
                ...baseMetadata,
                type: 'installation-config', // Single document type
                chunkType: 'area' as ChunkType,
                section: 'area',
                uuid: area.uuid,
                areaName: area.name,
                areaUuid: area.uuid,
                areaIndex: areaIndex,

                devicesCount: associatedEndpoints.length,

                // Location-specific FAISS filters
                isFirstFloor: areaFloorInfo.isFirstFloor,
                isSecondFloor: areaFloorInfo.isSecondFloor,
                floorInfo: areaFloorInfo.floorName,

                floorLocation: areaFloorInfo.isFirstFloor ? "first" : areaFloorInfo.isSecondFloor ? "second" : "unknown", // string

                deviceTypes: [...new Set(associatedEndpoints.map((ep: any) =>
                    getDeviceType(ep.category)
                ))],
                deviceCategories: [...new Set(associatedEndpoints.map((ep: any) => ep.category))],
                partitionNames: areaPartitionNames.map((p: any) => p.name),
                partitionIds: areaPartitionNames.map((p: any) => p.uuid),
                hasAreaInfo: true,
                location: areaPartitionNames.map((p: any) => p.name), // Per il filtro location

                // FAISS-compatible single-value filters
                category: associatedEndpoints.length > 0 ? associatedEndpoints[0].category : " ",
                visualizationType: associatedEndpoints.length > 0 ? associatedEndpoints[0].visualizationType : " ",

                // Device type flags (FAISS boolean filters)
                hasControllers: associatedEndpoints.some((ep: any) =>
                    getDeviceType(ep.category) === 'controller'
                ),
                hasSensors: associatedEndpoints.some((ep: any) =>
                    getDeviceType(ep.category) === 'sensor' || [1, 11, 18].includes(ep.category)
                ),
                hasActuators: associatedEndpoints.some((ep: any) =>
                    getDeviceType(ep.category) === 'actuator'
                ),

                // Parameters metadata
                parametersCount: associatedEndpoints.reduce((total: any, ep: any) =>
                    total + (ep.parameters?.length || 0), 0
                ),
                hasControlParams: associatedEndpoints.some((ep: any) =>
                    ep.parameters?.some((p: any) =>
                        p.operation?.type === 'button' || p.operation?.type === 'switch'
                    )

                )

            }
        };

        const isFirstFloor = baseMetadata.isFirstFloor;

        const isSecondFloor = baseMetadata.isSecondFloor;
        console.log("Control area parameters:", JSON.stringify(isFirstFloor));

        console.log("Control area parameters:", JSON.stringify(isSecondFloor));
        chunks.push(areaChunk);
    });


    console.log(`Created ${chunks.length} area-type chunks`);
    /*  console.log("=== DEBUG AREA CHUNK METADATA ===");
      chunks.forEach((chunk, i) => {
          if (chunk.metadata.chunkType === 'area') {
              console.log(`Area Chunk ${i}:`, {
                  name: chunk.metadata.areaName,
                  isFirstFloor: chunk.metadata.isFirstFloor,
                  isSecondFloor: chunk.metadata.isSecondFloor,
                  hasAreaInfo: chunk.metadata.hasAreaInfo,
                  location: chunk.metadata.location
              });
          }
     
      });*/


    return chunks;
}

function createInstallationSummaryChunk(
    parsedContent: any,
    baseMetadata: EndpointMetadata,
    partitionMap: Map<string, any>,
    allAreas: any[] = []): Chunk[] {

    const chunks: Chunk[] = [];

    if (!parsedContent || !parsedContent.endpoints || !Array.isArray(parsedContent.endpoints)) {
        console.warn("parsedContent.endpoints is undefined or not an array, using empty array");
        parsedContent.endpoints = []; // o return un chunk vuoto
    }

    parsedContent.endpoints.forEach((endpoint: any, index: number) => {
        const deviceNames = parsedContent.endpoints?.map((endpoint: any) => endpoint.name) || [];
        const associatedArea = findAreaForEndpoints(endpoint, allAreas, partitionMap);

        //Ereditarity: take all metadatas from location area
        let floorInfo = { isFirstFloor: 'Unknown', isSecondFloor: 'Unknown', floorName: 'Unknown' };

        if (associatedArea) {
            //Using the metadatas if is present from area
            floorInfo = {
                isFirstFloor: associatedArea.isFirstFloor || "Unknown",
                isSecondFloor: associatedArea.isSecondFloor || "Unknown",
                floorName: associatedArea.floorName || "Unknown"
            };

        } else {
            // Fallback al calcolo tradizionale solo se non c'è area associata
            for (const partitionUuid of endpoint.partitions || []) {
                const partitionName = partitionMap.get(partitionUuid);
                if (partitionName) {
                    const lowerName = partitionName.toLowerCase();
                    if (lowerName.includes('first') || lowerName.includes('primo')) {
                        floorInfo.isFirstFloor = 'first';
                        floorInfo.floorName = 'First floor';
                    }
                    if (lowerName.includes('second') || lowerName.includes('secondo')) {
                        floorInfo.isSecondFloor = 'second';
                        if (floorInfo.floorName === 'Unknown') {
                            floorInfo.floorName = 'Second floor';
                        }
                    }
                }
            }

        }

        //Resolve partitionNames
        const partitionNames = (endpoint.partitions || [])
            .map((uuid: string) => partitionMap.get(uuid))
            .filter(Boolean);
        const floorLocation = floorInfo.isFirstFloor === 'first' ? 'first' :
            floorInfo.isSecondFloor === 'second' ? 'second' : 'Unknown';



        const commonMetadata = {
            ...baseMetadata,
            type: 'installation-config' as const,
            uuid: endpoint.uuid,
            name: endpoint.name || 'Unnamed Device',
            category: endpoint.category,
            categoryName: getCategoryName(endpoint.category),
            deviceType: getDeviceType(endpoint.category),
            visualizationType: endpoint.visualizationType,

            // Floor info
            isFirstFloor: floorInfo.isFirstFloor,
            isSecondFloor: floorInfo.isSecondFloor,
            floorInfo: floorInfo.floorName,
            floorLocation: floorLocation,

            // Location
            partitions: endpoint.partitions || [],
            partitionNames: partitionNames,
            location: partitionNames,
            hasAreaInfo: Boolean(associatedArea || (endpoint.partitions && endpoint.partitions.length > 0)),

            // Parameters metadata
            parametersCount: endpoint.parameters?.length || 0,
            hasControlParams: endpoint.parameters?.some((p: any) =>
                p.operation?.type === 'button' || p.operation?.type === 'switch'
            ) || false,
            hasMeasurementParameters: endpoint.parameters?.some((p: any) => p.logType === 3) || false,
            hasEnumerationParameters: endpoint.parameters?.some((p: any) => p.enumerationVal?.length > 0) || false,
            hasConfigParameters: endpoint.parameters?.some((p: any) => p.logType === 0) || false,

            // Parameter analysis
            parameterUnits: [...new Set((endpoint.parameters || []).map((p: any) => p.unit).filter(Boolean))],
            parameterDataTypes: [...new Set((endpoint.parameters || []).map((p: any) => p.dataType))]

        };

        //  =============================================================================================================
        //                                          CREATE SUMMARY CHUNK (lightweigth)
        //  =============================================================================================================

        const summaryData = {
            chunkType: 'summary',//'summary-endpoint',
            endpoint: {
                uuid: endpoint.uuid,
                name: endpoint.name || 'Unnamed Device',
                id: endpoint.id,
                category: endpoint.category,
                categoryName: getCategoryName(endpoint.category),
                visualizationType: endpoint.visualizationType,
                deviceType: getDeviceType(endpoint.category),

                //LocationInfo
                partitions: endpoint.partitions || [],
                partitionNames: partitionNames,
                associatedArea: associatedArea ? {
                    name: associatedArea.name,
                    uuid: associatedArea.uuid
                } : null
            },

            //Statistichs of parameters (no details)
            parametersStats: {
                total: endpoint.parameters?.length || 0,

                //Conteggi per tipo
                byLogtype: endpoint.parameters?.reduce((acc: any, p: any) => {
                    const logType = p.logType || 'unknown';
                    acc[logType] = (acc[logType] || 0) + 1;
                    return acc;
                }, {}) || {},

                //Conteggio per operation type
                byOperationType: endpoint.parameters?.reduce((acc: any, p: any) => {
                    const opType = p.operation?.type || 'none';
                    acc[opType] = (acc[opType] || 0) + 1;
                    return acc;
                }, {}) || {},
                // Lista nomi parametri (utile per matching)
                parameterNames: endpoint.parameters?.map((p: any) => p.name).filter(Boolean) || [],

                // Unità disponibili
                availableUnits: [...new Set((endpoint.parameters || []).map((p: any) => p.unit).filter(Boolean))],

                // Capabilities
                hasControl: endpoint.parameters?.some((p: any) =>
                    p.operation?.type === 'button' || p.operation?.type === 'switch'
                ) || false,
                hasMeasurement: endpoint.parameters?.some((p: any) => p.logType === 3) || false,
                hasEnumeration: endpoint.parameters?.some((p: any) => p.enumerationVal?.length > 0) || false
            },
            // Testo ricercabile compatto
            searchableText: createEndpointSummarySearchableText(endpoint, getCategoryName(endpoint.category))

        }

        const summaryChunk: Chunk = {
            pageContent: JSON.stringify(summaryData, null, 2),
            metadata: {
                ...commonMetadata,
                chunkType: 'summary' as ChunkType, // Usa il tipo esistente
                isEndpointSummary: true, // Flag per distinguere da installation summary

                // IMPORTANTE: mantieni i filtri per le query
                hasEndpoints: true // Per le query generiche
            }
        };

        chunks.push(summaryChunk);



    });
    // console.log(` Created summary chunk for: ${endpoint.name}`);
    return chunks;

}





/**  
     ===================================================================================================================
                     Creates detail-type chunks from endpoints data (for specific/automation queries)
     ===================================================================================================================    
*/
function createDetailTypeChunks(
    parsedContent: any,
    baseMetadata: EndpointMetadata,
    partitionMap: Map<string, any>,
    allAreas: any[] = []
): Chunk[] {

    const chunks: Chunk[] = [];


    if (!parsedContent.endpoints || !Array.isArray(parsedContent.endpoints)) {
        return chunks;
    }

    console.log(`Creating detail-type chunks for ${parsedContent.endpoints.length} endpoints`);

    parsedContent.endpoints.forEach((endpoint: any, index: number) => {
        if (!endpoint || !endpoint.uuid) {
            console.warn(`Invalid endpoint at index ${index}, skipping`);
            return;
        }

        const associatedArea = findAreaForEndpoints(endpoint, allAreas, partitionMap);

        //Ereditarity: take all metadatas from location area
        let floorInfo = { isFirstFloor: 'Unknown', isSecondFloor: 'Unknown', floorName: 'Unknown' };

        if (associatedArea) {
            //Using the metadatas if is present from area
            floorInfo = {
                isFirstFloor: associatedArea.isFirstFloor || "Unknown",
                isSecondFloor: associatedArea.isSecondFloor || "Unknown",
                floorName: associatedArea.floorName || "Unknown"
            };

        } else {
            // Fallback al calcolo tradizionale solo se non c'è area associata
            for (const partitionUuid of endpoint.partitions || []) {
                const partitionName = partitionMap.get(partitionUuid);
                if (partitionName) {
                    const lowerName = partitionName.toLowerCase();
                    if (lowerName.includes('first') || lowerName.includes('primo')) {
                        floorInfo.isFirstFloor = 'first';
                        floorInfo.floorName = 'First floor';
                    }
                    if (lowerName.includes('second') || lowerName.includes('secondo')) {
                        floorInfo.isSecondFloor = 'second';
                        if (floorInfo.floorName === 'Unknown') {
                            floorInfo.floorName = 'Second floor';
                        }
                    }
                }
            }

        }

        //Resolve partitionNames
        const partitionNames = (endpoint.partitions || [])
            .map((uuid: string) => partitionMap.get(uuid))
            .filter(Boolean);
        const floorLocation = floorInfo.isFirstFloor === 'first' ? 'first' :
            floorInfo.isSecondFloor === 'second' ? 'second' : 'Unknown';


        //  =============================================================================================================
        //                                        Metadata Comuni (for detail and summary)
        //  =============================================================================================================

        const commonMetadata = {
            ...baseMetadata,
            type: 'installation-config' as const,
            uuid: endpoint.uuid,
            name: endpoint.name || 'Unnamed Device',
            category: endpoint.category,
            categoryName: getCategoryName(endpoint.category),
            deviceType: getDeviceType(endpoint.category),
            visualizationType: endpoint.visualizationType,

            // Floor info
            isFirstFloor: floorInfo.isFirstFloor,
            isSecondFloor: floorInfo.isSecondFloor,
            floorInfo: floorInfo.floorName,
            floorLocation: floorLocation,

            // Location
            partitions: endpoint.partitions || [],
            partitionNames: partitionNames,
            location: partitionNames,
            hasAreaInfo: Boolean(associatedArea || (endpoint.partitions && endpoint.partitions.length > 0)),

            // Parameters metadata
            parametersCount: endpoint.parameters?.length || 0,
            hasControlParams: endpoint.parameters?.some((p: any) =>
                p.operation?.type === 'button' || p.operation?.type === 'switch'
            ) || false,
            hasMeasurementParameters: endpoint.parameters?.some((p: any) => p.logType === 3) || false,
            hasEnumerationParameters: endpoint.parameters?.some((p: any) => p.enumerationVal?.length > 0) || false,
            hasConfigParameters: endpoint.parameters?.some((p: any) => p.logType === 0) || false,

            // Parameter analysis
            parameterUnits: [...new Set((endpoint.parameters || []).map((p: any) => p.unit).filter(Boolean))],
            parameterDataTypes: [...new Set((endpoint.parameters || []).map((p: any) => p.dataType))]

        };

        // =============================================================================================================
        //                              CREATE DETAIL CHUNK (with all parameters)
        // =============================================================================================================
        const endpointDetailData = {
            chunkType: 'detail',
            endpoint: {
                uuid: endpoint.uuid,
                name: endpoint.name || 'Unnamed Device',
                id: endpoint.id,
                category: endpoint.category,
                categoryName: getCategoryName(endpoint.category),
                visualizationType: endpoint.visualizationType,
                deviceType: getDeviceType(endpoint.category),
                partitions: endpoint.partitions || [],
                partitionNames: partitionNames,
                associatedArea: associatedArea ? {
                    name: associatedArea.name,
                    uuid: associatedArea.uuid
                } : null
            },

            // TUTTI I PARAMETRI DETTAGLIATI
            parameters: endpoint.parameters?.map((param: any) => ({
                name: param.name,
                value: param.value || param.defaultStateValue,
                dataType: param.dataType,
                unit: param.unit,
                unitPrefix: param.unitPrefix,
                operation: param.operation,
                logType: param.logType,
                minVal: param.minVal,
                maxVal: param.maxVal,
                enumerationVal: param.enumerationVal
            })),//|| [],

            searchableText: createEndpointSearchableText(endpoint, getCategoryName(endpoint.category))
        };


        const detailChunk: Chunk = {
            pageContent: JSON.stringify(endpointDetailData, null, 2),
            metadata: {
                ...commonMetadata,
                chunkType: 'detail' as ChunkType,
                isEndpointDetail: true // Flag per distinguere
            }
        };


        chunks.push(detailChunk);
        count++;
        //console.log(`Created detail chunk for: ${endpoint.name}`);
    });

    console.log(`Chunks created: ${chunks.length} (${parsedContent.endpoints.length} summary + ${parsedContent.endpoints.length} detail)`);
    return chunks;

}



/*
This function generates a concise , pipe-delimited string that serves as the pageContent for summary-type chunks.
The parts variable includes the parameters contained in the pipe-delimited string 
*/
function createEndpointSummarySearchableText(endpoint: any, categoryName: string): string {

    const parts = [
        `Device: ${endpoint.name || 'Unnamed'}`,
        `UUID: ${endpoint.uuid || 'N/A'}`,
        `Category: ${categoryName}`,
        `Type: ${endpoint.visualizationType || 'Unknown'}`,
        `Parameters: ${endpoint.parameters?.length || 0}`
    ];

    if (endpoint.parameters && endpoint.parameters.length > 0) {
        // Solo nomi parametri, no dettagli
        const paramNames = endpoint.parameters.map((p: any) => p.name).filter(Boolean);
        if (paramNames.length > 0) {
            parts.push(`Available parameters: ${paramNames.join(', ')}`);
        }

        // Capabilities summary
        const capabilities = [];
        if (endpoint.parameters.some((p: any) => p.operation?.type === 'button' || p.operation?.type === 'switch')) {
            capabilities.push('controllable');
        }
        if (endpoint.parameters.some((p: any) => p.logType === 3)) {
            capabilities.push('has measurements');
        }
        if (endpoint.parameters.some((p: any) => p.enumerationVal?.length > 0)) {
            capabilities.push('has enumerations');
        }
        if (capabilities.length > 0) {
            parts.push(`Capabilities: ${capabilities.join(', ')}`);
        }
    }

    return parts.join(' | ');
}


/* 
   =============================================================================================================
                                                HELPER FUNCTIONS
   =============================================================================================================
*/

function calculateTotalPartitions(parsedContent: any): number {
    if (!parsedContent.areas) return 0;
    return parsedContent.areas.reduce((total: number, areas: any) => {
        return total + (areas.partitions?.length || 0);
    }, 0);
}

function extractDeviceCategories(parsedContent: any): number[] {
    if (!parsedContent.endpoints) return [];
    const categories = parsedContent.endpoints
        .map((ep: any) => ep.category)
        .filter((category: any): category is number =>
            typeof category === 'number' && !isNaN(category)
        ) as number[];

    return [...new Set(categories)];
}

function extractFloorInfoFromArea(areas: any, partitions: any[]): {
    isFirstFloor: string;
    isSecondFloor: string;
    floorName: string;
} {

    const areaName = (areas.name || '').toLowerCase();

    const partitionNames = partitions.map(p => (p.name || '').toLowerCase()).join(' ');

    const allText = `${areaName} ${partitionNames}`.toLowerCase();
    return {
        isFirstFloor: allText.includes('First') || allText.includes('primo') || allText.includes('1') ? "First" : "unknown",
        isSecondFloor: allText.includes('Second') || allText.includes('Secondo') || allText.includes('2') ? "Second" : "unknown",
        floorName: allText.includes('Second') ? 'Second floor' :
            allText.includes('first') ? 'First floor' : 'Unknown'
    };
}


function createAreaSearchableText(areas: any, endpoints: any[]): string {
    const parts = [
        `Area: ${areas.name || 'Unnamed Area'}`,
        `UUID: ${areas.uuid || 'N/A'}`,
        `ID: ${areas.id || 'N/A'}`
    ];

    if (areas.partitions && Array.isArray(areas.partitions)) {
        parts.push(`Partitions: ${areas.partitions.map((p: any) => p.name || p.uuid).join(', ')}`);
    }

    if (endpoints.length > 0) {
        parts.push(`Devices (${endpoints.length}):`);
        endpoints.forEach((endpoint: any, index: number) => {
            const deviceInfo = [
                endpoint.name || 'Unnamed',
                getCategoryName(endpoint.category),
                endpoint.visualizationType
            ].filter(Boolean).join(' - ');
            parts.push(`  ${index + 1}. ${deviceInfo}`);
        });

        const deviceTypes: Record<string, number> = endpoints.reduce((acc: any, ep: any) => {
            const type = getDeviceType(ep.category);
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        const typeStats = Object.entries(deviceTypes)
            .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
            .join(', ');
        parts.push(`Device types: ${typeStats}`);
    }

    if (areas.longitude && areas.latitude) {
        parts.push(`Coordinates: ${areas.longitude}, ${areas.latitude}`);
    }

    return parts.join('\n');
}

function createEndpointSearchableText(endpoint: any, categoryName: string): string {
    const parts = [
        `Device: ${endpoint.name || 'Unnamed'}`,
        `UUID: ${endpoint.uuid || 'N/A'}`,
        `Category: ${categoryName} (${endpoint.category || 'unknown'})`,
        `Type: ${endpoint.visualizationType || 'Unknown'}`,
        `ID: ${endpoint.id || 'N/A'}`
    ];

    if (endpoint.parameters && Array.isArray(endpoint.parameters) && endpoint.parameters.length > 0) {
        parts.push(`Parameters (${endpoint.parameters.length}):`);
        endpoint.parameters.forEach((param: any, index: number) => {
            if (!param) return;
            const paramDesc = [
                param.name || 'Unnamed parameter',
                param.unit ? `(${param.unit})` : '',
                `Type: ${param.dataType || 'Unknown'}`
            ].filter(Boolean).join(' ');
            parts.push(`  ${index + 1}. ${paramDesc}`);
        });
    }

    if (endpoint.partitions && Array.isArray(endpoint.partitions) && endpoint.partitions.length > 0) {
        parts.push(`Partitions: ${endpoint.partitions.join(', ')}`);
    }

    return parts.join('\n');
}

export function extractFloorKeywords(name: string, partitions: any[] = []): string[] {
    const keywords: string[] = [];
    const text = `${name} ${partitions.map(p => p.name || '').join(' ')}`.toLowerCase();

    if (text.includes("ground floor")) keywords.push("Ground floor");
    if (text.includes("First floor")) keywords.push("First floor");
    if (text.includes("Second floor")) keywords.push("Second floor");

    const floorNumbers = text.match(/(\d+)[°º]?\s*piano|piano\s*(\d+)|floor\s*(\d+)|(\d+)[°º]?\s*floor/gi);
    if (floorNumbers) {
        keywords.push(...floorNumbers);
    }

    return [...new Set(keywords)];
}

export function getCategoryName(category: number): string {
    try {
        if (category !== undefined && typeof DEVICE_CATEGORIES !== 'undefined') {
            return DEVICE_CATEGORIES[category]?.name || `Category_${category}`;
        }
    } catch (error) {
        console.warn("Error accessing DEVICE_CATEGORIES:", error);
    }
    return 'Unknown';
}

export function getDeviceType(category: number | string): string {
    const config = getConfig();

    /*
            SOLO LOG DI DEBUG
    if (category === undefined || category === null || category === 'unknown') {
        debugDeviceType("CATEGORY EMPTY", category, "unclassified");
        return "unclassified";
    }*/

    const numericCategory = Number(category);
    for (const mapping of Object.values(config.keywordMappings)) {
        if (mapping.categories?.includes(numericCategory)) {
            const resolved = mapping.visualizationCategories?.[0] || "device";
            // debugDeviceType("CATEGORY MATCH", category, resolved);
            return resolved;
        }
    }

    debugDeviceType("CATEGORY FALLBACK", category, "other");
    return 'other';
}


//Functions for finds area partitions associations




function getFloorInfoFromPartition(uuid: string, partitionMap: Map<string, any>): {
    isFirstFloor: string;
    isSecondFloor: string;
    floorName: string
} {
    const partitionName = partitionMap.get(uuid) || 'Unknown';
    const lowerName = partitionName.toLowerCase();

    return {
        isFirstFloor: (lowerName.includes('first') || lowerName.includes('primo')) ? "first" : "Unknown",
        isSecondFloor: (lowerName.includes('second') || lowerName.includes('secondo')) ? "second" : "Unknown",
        floorName: partitionName
    };
}

//Funzione per DEBUG:
function AreaFloorCalculation(areas: any, partitionMap: Map<string, any>, areaName: string) {

    //console.log("\nDEBUG FLOOR CALCULATION for area:", areaName);

    if (!areas.partitions) {
        console.warn("No partitions foun in area");
    }

    console.log("Area partitions:", areas.partitions);

    let areaFloorInfo = { isFirstFloor: 'Unknown', isSecondFloor: 'Unknown', floorName: 'Unknown floor' };

    areas.partitions.forEach((partition: any, index: number) => {
        const partitionUuid = typeof partition === 'object' ? partition.uuid : partition;
        const partitionName = partitionMap.get(partitionUuid);

        console.log(`Partition ${index}: UUID=${partitionUuid}, Name=${partitionName}`);

        if (partitionName) {
            const partitionFloor = getFloorInfoFromPartition(partitionUuid, partitionMap);
            console.log("For analysis ", JSON.stringify(partitionFloor));

            if (partitionFloor.isFirstFloor === "first") areaFloorInfo.isFirstFloor = 'first';
            if (partitionFloor.isSecondFloor === "second") areaFloorInfo.isSecondFloor = 'second';

            if (partitionFloor.floorName !== 'Unknown floor') {
                areaFloorInfo.floorName = partitionFloor.floorName;
            }

        } else {
            console.log("Partition not found in ", partitionUuid);
        }

    });
    console.log("Final area floor info:", JSON.stringify(areaFloorInfo));
    return areaFloorInfo;
}


function findAreaForEndpoints(endpoint: any, allAreas: any[], partitionMap: Map<string, any>): any | null {
    if (!endpoint.partitions || !Array.isArray(endpoint.partitions)) return null;

    const area = allAreas.find(area =>
        area.partitions?.some((areaPartition: any) => {

            const areaPartitionId = typeof areaPartition === 'object' ? areaPartition.uuid : areaPartition;
            return endpoint.partitions.includes(areaPartitionId);
        })
    );

    if (area) {
        const areaFloorInfo = AreaFloorCalculation(area, partitionMap, area.name);
        return {
            ...area,
            ...areaFloorInfo
        };
    }
}
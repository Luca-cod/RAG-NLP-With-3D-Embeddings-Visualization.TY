import { ExtendDocument, targetFile, filePath } from "../../../config/RAG.js";
import { promises as fs } from "fs";
import { Document } from "langchain/document";
import { buildGlobalPartitionMap } from "./buildGlobalPartitionsMap.js";


export type DocumentType = 'installation-config';
export type ChunkType = "summary" | "detail" | "area" | "fallback";


export interface EndpointMetadata {
    //Basic metadata
    source: string;  //Source file name
    loc: string;  //Full file path
    type: DocumentType // Document type
    isValid: boolean;
    timestamp: string;
    chunkType: ChunkType,  // Chunk type (summary, detail, area, fallback)

    //MANDATORY endpoint data
    uuid?: string,   //device uuid
    name?: string,   //device name
    category?: number,    //category (0, 15, 11,18)
    visualizationType?: string,  //Visualization type (BOXIO, VAYYAR_CARE, etc)

    //OPTIONAL data
    categoryName?: string,    //Mapped category name
    partitions?: string[],    //UUIDs of associated partitions
    location?: string[],
    areaNames?: string[], //Area names
    areaUuids?: string[], //UUIDs of areas   
    id?: string,
    parametersCount?: number,  //Number of parameters  
    defaultParameter?: string,  //Default parameter


    // ========================================
    // SPECIFIC METADATA FOR TWO-STAGE CHUNKS
    // ========================================
    isPrimaryChunk?: boolean,
    chunkStrategy?: 'two_stage' | 'standard';  // identifies the chunking strategy used


    parameterStartIndex?: number,
    parameterEndIndex?: number,
    totalParameters?: number,

    visualizationCategory?: string;  //Mapped visualization category

    deviceType: string,
    globalPartitionMapArray?: Array<[string, string]>;


    // Flags for filtering
    hasAreaInfo?: boolean;
    hasEndpoints?: boolean;
    hasConfiguration?: boolean;
    hasControlParams?: boolean;
    isFirstFloor?: string;
    isSecondFloor?: string;

    // For area chunks
    areaName?: string;
    areaUuid?: string;
    areaIndex?: number;
    devicesCount?: number;
    floorName?: string;
    deviceTypes?: string[];
    deviceCategories?: number[];
    partitionNames?: string[];
    partitionIds?: string[];

    // For detail chunks
    isSensor?: boolean;
    isActuator?: boolean;
    isController?: boolean;
    hasMeasurementParameters?: boolean;
    hasEnumerationParameters?: boolean;
    hasConfigParameters?: boolean;
    parameterUnits?: string[];
    parameterDataTypes?: string[];

    // For splitting
    subChunkIndex?: number;
    totalSubChunks?: number;
    splitField?: string;
    fullUuid?: string;
    isSubChunk?: boolean;
    warning?: string;
    error?: string;


    parameterNames?: string[];
    parameterOperations?: string[];
    hasMeasurementParams?: boolean;

    totalEndpoints?: number;
    totalAreas?: number;
    hasPartitions?: boolean; //Indicates whether the document has partitions
    installationName?: string;
    revision?: string,
    minor?: number;
    major?: number;

    [key: string]: any;

    sequenceNumberMetadata?: SeqMetadata;   //---> CALCULATED DURING SPLITTING, HOW TO DEFINE IT HERE WHEN CREATING CHUNKS
}

export interface SeqMetadata {
    sessionId: string;
    chunkId: number;
    totalChunks: number;
    parentChunkId?: number;
    isParent?: boolean;
    isAckChunk?: boolean;
}

export interface Parameter {
    name: string,
    dataType: number,
    unit?: string,
    operation?: { type: string },
    logType?: number,
    defaultStateValue?: string,
    notifyFrequency?: number,
    maxVal: number[],
    minVal: number[],
    [key: string]: any,
}

// NEW INTERFACES TO IMPROVE MAPPING
export interface AreaPartitionMap {
    areaUuid: string;
    areaName: string;
    partitions: Array<{
        uuid: string;
        name: string;
    }>;
}

export interface EndpointAreaRelation {
    endpointUuid: string;
    endpointName: string;
    areaUuid: string;
    areaName: string;
    partitionUuids: string[];
    location: string[];
}




export async function loadDocumentsJSON(): Promise<{ Documents: ExtendDocument[], partitionMap: Map<string, any> }> {
    const processedUUIDs = new Set<string>();
    let rawContent: string;

    try {
        rawContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        console.error("ERROR: Document not found or not readable!");
        throw new Error("Execution blocked: file doesn't exist");
    }

    if (!rawContent || rawContent.trim().length === 0) {
        console.error("ERROR: Empty document!");
        throw new Error("Execution blocked: file contents empty.");
    }

    let jsonContent: any;
    try {
        jsonContent = JSON.parse(rawContent);
    } catch (parseError) {
        console.error("ERROR: JSON parsing failed", parseError);
        throw new Error("Invalid JSON format in configuration");
    }

    if (!jsonContent || typeof jsonContent !== 'object') {
        throw new Error("Invalid JSON structure: root must be an object");
    }

    const hasValidEndpoints = Array.isArray(jsonContent.endpoints) && jsonContent.endpoints.length > 0;
    const hasValidAreas = Array.isArray(jsonContent.areas) && jsonContent.areas.length > 0;

    if (!hasValidEndpoints) {
        console.warn("No valid endpoint found in JSON content");
        return getFallbackDocument(new Error("No valid endpoints in configuration"));
    }

    console.log(`Data structure: ${jsonContent.endpoints.length} endpoints, ${jsonContent.areas?.length || 0} areas`);

    // Build global maps
    const globalPartitionMap = buildGlobalPartitionMap(jsonContent);
    const areaPartitionMaps = hasValidAreas ? buildAreaPartitionMaps(jsonContent) : [];
    const endpointAreaRelations = hasValidAreas ? buildEndpointAreaRelations(jsonContent, areaPartitionMaps) : new Map<string, EndpointAreaRelation>();

    const Documents: ExtendDocument[] = [];

    // Create installation content
    const installationContent = {
        type: "installation-config",
        metadata: jsonContent.metadata || {},
        statistics: {
            totalEndpoints: jsonContent.endpoints?.length || 0,
            totalAreas: jsonContent.areas?.length || 0,
            totalPartitions: globalPartitionMap.size,
            sensorCount: jsonContent.endpoints.filter((ep: any) => ep.category === 18).length || 0,
            actuatorCount: jsonContent.endpoints?.filter((ep: any) => [11, 12, 15].includes(ep.category)).length || 0,
            controllerCount: jsonContent.endpoints?.filter((ep: any) => [0, 1, 2].includes(ep.category)).length || 0
        },
        endpoints: jsonContent.endpoints,
        areas: jsonContent.areas,
        globalPartitionMap: Object.fromEntries(globalPartitionMap)
    };

    const mainDocument = new Document({
        pageContent: JSON.stringify(installationContent),
        metadata: {
            source: targetFile,
            loc: filePath,
            type: 'intallation-config',
            isValid: true,
            timestamp: new Date().toISOString(),
            name: jsonContent.metadata?.name,
            chunkType: 'summary',

            installationName: jsonContent.metadata?.name || 'installation-config',
            revision: jsonContent.metadata?.revision,
            deviceType: 'installation',
            totalEndpoints: jsonContent.endpoints?.length || 0,
            totalAreas: jsonContent.areas?.length || 0,
            hasPartitions: globalPartitionMap.size > 0,
            hasAreaInfo: hasValidAreas,
            major: jsonContent.metadata?.major,
            minor: jsonContent.metadata?.minor,
        }
    }) as unknown as ExtendDocument;
    Documents.push(mainDocument);

    console.log("\nSingle raw document created for two-stage chunking");
    return {
        Documents,
        partitionMap: globalPartitionMap
    }
}
// ========================================
// HELPER FUNCTIONS FOR TWO-STAGE
// ========================================
export function prepareDocumentsForTwoStage(documents: ExtendDocument[]): { parsedContent: any, metadata: EndpointMetadata }[] {

    console.log("\n=== PREPARING DOCUMENTS FOR TWO-STAGE ===");
    console.log(`\nInput: ${documents.length} pre-created chunks`);

    if (!Array.isArray(documents)) {
        console.error(" Input documents are not a valid array");
        return [];
    }

    //If we obtain more than one document, only use the first one
    const mainDoc = documents.length > 1 ? documents[0] : documents[0];

    if (documents.length > 1) {
        console.warn("Expected 1 document but got", documents.length, "Using first document only");
    }

    console.log("Processing main document", mainDoc.metadata.source);

    const parsedDocs: { parsedContent: any, metadata: EndpointMetadata }[] = [];

    if (documents.length === 1) {

        try {
            // ROBUST DOCUMENT VALIDATION
            if (!mainDoc) {
                console.warn(` MainDocument is null/undefined`);
                return [];
            }

            if (!mainDoc.metadata) {
                console.warn(` MainDocument without metadata`);
                return [];
            }

            if (mainDoc.metadata.isValid === false) {
                console.warn(` MainDocument marked as invalid`);
                return [];
            }

            if (!mainDoc.pageContent || typeof mainDoc.pageContent !== 'string') {
                console.warn(` MainDocument without valid pageContent`);
                return [];
            }

            // Parse the content - these are already structured chunks
            let parsedContent: any;
            try {
                parsedContent = JSON.parse(mainDoc.pageContent);
            } catch (parseError) {
                console.error(` Error parsing MainDocument content:`, parseError);
                return [];
            }

            if (!parsedContent || typeof parsedContent !== 'object') {
                console.warn(` ParsedMainDocument content is not a valid object`);
                return [];
            }

            // DEBUG
            try {
                parsedContent = JSON.parse(mainDoc.pageContent);
            } catch (parseError) {
                console.error(` Error parsing document content:`, parseError);
                console.error(`   Content: "${mainDoc.pageContent.substring(0, 100)}..."`);
                return [];
            }

            // DEBUG: Log the document structure
            console.log(" Document structure analysis:");
            console.log(`   - Type: ${parsedContent.type}`);
            console.log(`   - Endpoints: ${parsedContent.endpoints?.length || 0}`);
            console.log(`   - Areas: ${parsedContent.areas?.length || 0}`);
            console.log(`   - Has metadata: ${!!parsedContent.metadata}`);
            console.log(`   - Has statistics: ${!!parsedContent.statistics}`);

            const prepareDoc = {
                parsedContent: parsedContent,
                metadata: {
                    ...mainDoc.metadata,
                    chunkType: 'summary',
                    deviceType: 'installation'
                } as EndpointMetadata
            };

            parsedDocs.push(prepareDoc);

            console.log("Document prepared:", parsedDocs.length / documents.length);

        } catch (error) {
            console.error(` Error processing document:`, error);
            return [];
        }

    } else {
        console.warn('Expected 1 main document but got:', documents.length, " Using first document");
    }

    // Validation of the prepared content
    const preparedDoc = parsedDocs[0];
    console.log(" Prepared document validation:");
    console.log(`   • Has endpoints: ${!!preparedDoc.parsedContent.endpoints}`);
    console.log(`   • Endpoints count: ${preparedDoc.parsedContent.endpoints?.length || 0}`);
    console.log(`   • Has areas: ${!!preparedDoc.parsedContent.areas}`);
    console.log(`   • Areas count: ${preparedDoc.parsedContent.areas?.length || 0}`);
    console.log(`   • Has globalPartitionMap: ${!!preparedDoc.parsedContent.globalPartitionMap}`);
    console.log(`   • Metadata chunkType: ${preparedDoc.metadata.chunkType}`);

    // Critical validation
    if (!preparedDoc.parsedContent.endpoints || preparedDoc.parsedContent.endpoints.length === 0) {
        console.warn(" WARNING: No endpoints found in prepared document!");
    }

    if (!preparedDoc.parsedContent.areas || preparedDoc.parsedContent.areas.length === 0) {
        console.warn(" WARNING: No areas found in prepared document!");
    }

    console.log(" TWO-STAGE PREPARATION COMPLETED\n");

    return parsedDocs;
}


// ========================================
// VALIDATION FUNCTION FOR DEBUGGING 
// ========================================

export function validateDocumentsForTwoStage(parsedDocs: { parsedContent: any, metadata: EndpointMetadata }[]): boolean {

    console.log("=== DOCUMENT VALIDATION FOR TWO-STAGE ===");

    if (!parsedDocs || parsedDocs.length === 0) {
        console.error(" No documents to validate");
        return false;
    }

    let isValid = true;
    let endpointCount = 0;
    let installationCount = 0;
    let areaCount = 0;
    let documentsWithPartitions = 0;
    let documentsWithAreas = 0;

    for (const [index, doc] of parsedDocs.entries()) {

        if (doc.metadata?.type === 'installation-config') installationCount++;
        if (doc.metadata?.partitions !== undefined && doc.metadata?.partitions?.length > 0) documentsWithPartitions++;
        if (doc.metadata?.areaNames !== undefined && doc.metadata?.areaNames?.length > 0) documentsWithAreas++;

        // Critical validations
        if (!doc.parsedContent) {
            console.error(` Document ${index}: parsedContent missing`);
            isValid = false;
        }

        if (!doc.metadata) {
            console.error(` Document ${index}: metadata missing`);
            isValid = false;
        }

        if (doc.parsedContent?.type === 'endpoint' && !doc.parsedContent?.data) {
            console.error(` Document ${index}: endpoint without data`);
            isValid = false;
        }

        // Detailed log for problematic documents
        if (!doc.parsedContent || !doc.metadata ||
            (doc.parsedContent?.type === 'endpoint' && !doc.parsedContent?.data) ||
            (doc.parsedContent?.type === 'area' && !doc.parsedContent?.data)) {
            console.log(` DEBUG Problematic document ${index}:`, {
                name: doc.metadata?.name,
                type: doc.metadata?.type,
                hasContent: !!doc.parsedContent,
                chunkType: doc.parsedContent?.type,
                hasData: !!doc.parsedContent?.data
            });
        }
    }

    console.log("Location validation statistics:");
    const locationStats = {
        endpointsWithLocation: 0,
        endpointsWithoutLocation: 0,
        areasWithFloorInfo: 0,
        areasWithoutFloorInfo: 0
    };

    parsedDocs.forEach(doc => {
        if (doc.metadata.chunkType === 'detail') {
            if (doc.metadata.isFirstFloor !== undefined ||
                doc.metadata.isSecondFloor !== undefined) {
                locationStats.endpointsWithLocation++;
            } else {
                locationStats.endpointsWithoutLocation++;
            }
        }

        if (doc.metadata.chunkType === 'area') {
            if (doc.metadata.isFirstFloor !== undefined ||
                doc.metadata.isSecondFloor !== undefined) {
                locationStats.areasWithFloorInfo++;
            } else {
                locationStats.areasWithoutFloorInfo++;
            }
        }
    });

    console.log("Location validation:", locationStats);

    // Final statistics
    console.log(`Validation statistics:`, {
        totalDocuments: parsedDocs.length,
        endpointDocuments: endpointCount,
        installationDocuments: installationCount,
        areaDocuments: areaCount,
        documentsWithPartitions: documentsWithPartitions,
        documentsWithAreas: documentsWithAreas,
        validationResult: isValid ? 'VALID' : 'INVALID'
    });

    if (endpointCount > 0 && documentsWithPartitions === 0 && documentsWithAreas === 0) {
        console.warn(" WARNING: No endpoint has location information (partitions or areas)");
    }

    if (endpointCount === 0) {
        console.error("WARNING: No endpoint documents found");
        isValid = false;
    }

    if (installationCount === 0) {
        console.warn(" WARNING: No installation-config file found");
    }

    return isValid;
}



/** Fundamental function for:
Creates the mapping between areas and partitions
Handles both objects and UUID strings for partitions
Includes robust validation
Required to resolve partition names */
export function buildAreaPartitionMaps(jsonContent: any): AreaPartitionMap[] {
    const maps: AreaPartitionMap[] = [];

    if (!jsonContent.areas || !Array.isArray(jsonContent.areas)) {
        console.warn("No areas found in JSON file");
        return maps;
    }

    for (const [index, area] of jsonContent.areas.entries()) {
        try {
            // RIGOROUS AREA VALIDATION
            if (!area || typeof area !== 'object') {
                console.warn(`Area ${index} invalid:`, area);
                continue;
            }

            if (!area.uuid || !area.name) {
                console.warn(` Area ${index} missing UUID or name:`, {
                    uuid: area.uuid,
                    name: area.name
                });
                continue;
            }

            const areaMap: AreaPartitionMap = {
                areaUuid: area.uuid,
                areaName: area.name,
                partitions: []
            };

            // SAFE PARTITION PROCESSING
            if (Array.isArray(area.partitions)) {
                for (const [partIndex, partition] of area.partitions.entries()) {
                    if (!partition) {
                        console.warn(` Partition ${partIndex} in area ${area.name} is null/undefined`);
                        continue;
                    }

                    // Handle both objects and UUID strings
                    const partitionUuid = typeof partition === 'string' ? partition : partition.uuid;
                    const partitionName = typeof partition === 'string' ?
                        `Partition_${partition.substring(0, 8)}` : partition.name;

                    if (partitionUuid && partitionName) {
                        areaMap.partitions.push({
                            uuid: partitionUuid,
                            name: partitionName
                        });
                    } else {
                        console.warn(` Partition ${partIndex} in area ${area.name} with incomplete data`);
                    }
                }
            }

            maps.push(areaMap);
            console.log(` Mapped Area: ${area.name} (${areaMap.partitions.length} partitions)`);
        } catch (error) {
            console.error(` Error processing area ${index}:`, error);
            continue;
        }
    }
    console.log(`Area maps created: ${maps.length}`);
    return maps;
}

// Iterates over endpoints and finds areas through shared partitions
function buildEndpointAreaRelations(
    jsonContent: any,
    areaPartitionMaps: AreaPartitionMap[]
): Map<string, EndpointAreaRelation> {
    const relations = new Map<string, EndpointAreaRelation>();

    console.log("  Building endpoint-area relations...");

    // Input validation
    if (!jsonContent?.areas || !Array.isArray(jsonContent.areas)) {
        console.warn("No areas found in the JSON to build relations");
        return relations;
    }

    if (!Array.isArray(areaPartitionMaps) || areaPartitionMaps.length === 0) {
        console.warn(" No partition maps available to build relations");
        return relations;
    }

    console.log(`Areas to process: ${jsonContent.areas.length}, Partition maps: ${areaPartitionMaps.length}`);
    console.log("Processed areas:", JSON.stringify(jsonContent.areas), "Partition names", JSON.stringify(areaPartitionMaps));

    let totalEndpointsProcessed = 0;
    let totalRelationsCreated = 0;

    for (const [endpointIndex, endpoint] of jsonContent.endpoints.entries()) {

        try {
            totalEndpointsProcessed++;

            // Endpoint validation
            if (!endpoint || !endpoint.uuid) {
                console.warn(`Endpoint ${endpointIndex} invalid or missing UUID`);
                continue;
            }

            // If endpoint has no partitions, skip
            if (!Array.isArray(endpoint.partitions) || endpoint.partitions.length === 0) {
                continue;
            }

            const endpointName = endpoint.name || `Device_${endpoint.uuid.substring(0, 8)}`;

            // For each area, check if it shares partitions with this endpoint
            for (const areaMap of areaPartitionMaps) {
                // Find shared partitions between endpoint and area
                const sharedPartitions = areaMap.partitions.filter(areaPartition =>
                    endpoint.partitions.includes(areaPartition.uuid)
                );

                // If shared partitions exist, create the relation
                if (sharedPartitions.length > 0) {
                    const relation: EndpointAreaRelation = {
                        endpointUuid: endpoint.uuid,
                        endpointName: endpointName,
                        areaUuid: areaMap.areaUuid,
                        areaName: areaMap.areaName,
                        partitionUuids: sharedPartitions.map(p => p.uuid),
                        location: sharedPartitions.map(p => p.name)
                    };

                    // Check for duplicates (an endpoint can belong to multiple areas)
                    if (relations.has(endpoint.uuid)) {
                        const existing = relations.get(endpoint.uuid);
                        console.log(`Endpoint ${endpoint.uuid} already mapped to ${existing?.areaName}, also adding ${areaMap.areaName}`);
                        // For now, we keep only the first relation found
                    } else {
                        relations.set(endpoint.uuid, relation);
                        totalRelationsCreated++;

                        console.log(`Relation created: ${endpointName} -> ${areaMap.areaName} (${sharedPartitions.length} shared partitions)`);
                    }
                }
            }

        } catch (endpointError) {
            console.error(`Error processing endpoint ${endpointIndex}:`, endpointError);
            continue;
        }
    }

    // FINAL REPORT
    console.log("\nENDPOINT-AREA RELATION REPORT:");
    console.log(`Endpoints processed: ${totalEndpointsProcessed}`);
    console.log(`Relations created: ${totalRelationsCreated}`);
    console.log(`Unique relations in map: ${relations.size}`);

    // DETAILED DEBUG
    if (relations.size > 0) {
        console.log("\nFirst 3 relations created:");
        let count = 0;
        for (const [uuid, relation] of relations.entries()) {
            if (count >= 3) break;
            console.log(`   ${count + 1}. ${relation.endpointName} -> ${relation.areaName}`);
            console.log(`      UUID: ${uuid}`);
            console.log(`      Shared partitions: ${relation.location.join(', ')}`);
            count++;
        }
    } else {
        console.warn("\nWARNING: No relations created!");
        console.log("Debug: verify that areas and endpoints share partitions");

        // Debug area partitions
        console.log("Partitions per area:");
        areaPartitionMaps.forEach(area => {
            console.log(`   ${area.areaName}: [${area.partitions.map(p => p.name).join(', ')}]`);
        });

        // Debug endpoint partitions (first 5)
        console.log("Partitions per endpoint (first 5):");
        jsonContent.endpoints.slice(0, 5).forEach((ep: any) => {
            if (ep.partitions?.length > 0) {
                console.log(`   ${ep.name}: [${ep.partitions.join(', ')}]`);
            }
        });
    }

    return relations;
}


// Creates a fallback document if loading fails
function getFallbackDocument(error: any): { Documents: ExtendDocument[], partitionMap: Map<string, any> } {
    const fallbackUUID = 'fallback-' + Math.random().toString(36).substring(2, 9);
    const fallBack = {
        pageContent: JSON.stringify({
            error: "Failed to load document",
            message: error instanceof Error ? error.message : String(error),
            fallbackType: "empty_system"
        }),
        metadata: {
            source: 'fallback',
            loc: 'internal',
            type: 'installation-config' as const, // fallback
            isValid: false,
            timestamp: new Date().toISOString(),
            uuid: fallbackUUID,
            name: 'Fallback Document',
            category: -1,
            visualizationType: 'N/A',
            deviceType: 'other',
            // Optional fields with default values
            categoryName: 'fallback',
            visualizationCategory: 'fallback',
            id: '0',
            partitions: [],
            location: [],
            areaNames: [],
            areaUuids: [],
            parametersCount: 0,
            defaultParameter: '',
            chunkStrategy: 'standard' as const,
            chunkType: 'fallback' as const,
            hasAreaInfo: true
        },
        readableText: "System temporarily unavailable. Please check the configuration and try again."
    };
    // "Document loading failed. Please check the configuration file."
    return {
        Documents: [fallBack],
        partitionMap: new Map()
    }
}

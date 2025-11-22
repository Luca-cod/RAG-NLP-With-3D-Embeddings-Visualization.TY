import { Document as LangChainDocument } from "langchain/document";
import { ExtendsSeqMetadata } from "../retrieval/splitters/SecondSplit2.js"


/**
 * Prepares the context by formatting the chunks into natural language.
 * Handles 3 types of chunks:
 * 1. Summary chunks (overview)
 * 2. Full detail chunks (with complete parameters array)
 * 3. Split detail chunks (parent + children with sequenceNumberSystem)
 */
export function prepareEnhancedContext(docs: LangChainDocument[], query: string): string {
    if (!Array.isArray(docs) || docs.length === 0) {
        console.warn("No documents available for context preparation");
        return "No relevant information found for the query.";
    }

    console.log(`Preparing enhanced context from ${docs.length} chunks`);

    const contextParts: string[] = [];

    // Header with query information
    contextParts.push(`=== RELEVANT INFORMATION FOR QUERY: "${query}" ===\n`);
    contextParts.push(`Found ${docs.length} relevant information chunks\n`);

    // Separate chunks by type
    const summaryChunks = docs.filter(doc => doc.metadata.chunkType === 'summary');
    const detailChunks = docs.filter(doc => doc.metadata.chunkType === 'detail');
    const areaChunks = docs.filter(doc => doc.metadata.chunkType === 'area');

    // Separate detail chunks based on presence of sequenceNumberSystem
    const seqDetailChunks = detailChunks.filter(doc => {
        const meta = doc.metadata as ExtendsSeqMetadata;
        return meta.sequenceNumberSystem?.sessionId;
    });
    const standardDetailChunks = detailChunks.filter(doc => {
        const meta = doc.metadata as ExtendsSeqMetadata;
        return !meta.sequenceNumberSystem?.sessionId;
    });

    console.log(`Chunk distribution: ${summaryChunks.length} summary, ${standardDetailChunks.length} standard detail, ${seqDetailChunks.length} sequence detail, ${areaChunks.length} area`);

    // 1. FORMAT SUMMARY CHUNKS
    if (summaryChunks.length > 0) {
        contextParts.push(formatSummaryChunks(summaryChunks));
    }

    // 2. FORMAT STANDARD DETAIL CHUNKS (full)
    if (standardDetailChunks.length > 0) {
        contextParts.push(formatStandardDetailChunks(standardDetailChunks));
    }

    // 3. FORMAT SEQUENCE DETAIL CHUNKS (parent + children)
    if (seqDetailChunks.length > 0) {
        contextParts.push(formatSequenceDetailChunks(seqDetailChunks));
    }

    // 4. FINAL STATISTICS
    contextParts.push(formatStatistics(docs, summaryChunks, standardDetailChunks, seqDetailChunks, areaChunks));

    const finalContext = contextParts.join('\n\n');
    return finalContext;
}

/**
 * Formats SUMMARY chunks into natural language
 */
function formatSummaryChunks(chunks: LangChainDocument[]): string {
    const parts: string[] = [];
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    parts.push(" DEVICE OVERVIEW (Summary Information)");
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    chunks.forEach((chunk, index) => {
        try {
            const content = JSON.parse(chunk.pageContent);
            const meta = chunk.metadata;

            // Device header
            parts.push(`${index + 1}. Device: ${content.endpoint?.name || meta.name || 'Unnamed Device'}`);
            parts.push(`   UUID: ${content.endpoint?.uuid || meta.uuid}`);

            // Category and type
            if (content.endpoint?.categoryName || meta.categoryName) {
                parts.push(`   Category: ${content.endpoint?.categoryName || meta.categoryName}`);
            }
            if (content.endpoint?.visualizationType || meta.visualizationType) {
                parts.push(`   Type: ${content.endpoint?.visualizationType || meta.visualizationType}`);
            }
            if (content.endpoint?.deviceType || meta.deviceType) {
                parts.push(`   Device Type: ${content.endpoint?.deviceType || meta.deviceType}`);
            }

            // Location information
            if (meta.floorLocation && meta.floorLocation !== 'Unknown') {
                parts.push(`   Location: ${meta.floorLocation === 'first' ? 'First Floor' : 'Second Floor'}`);
            }
            if (content.endpoint?.partitionNames?.length > 0) {
                parts.push(`   Partitions: ${content.endpoint.partitionNames.join(', ')}`);
            }
            if (content.endpoint?.associatedArea) {
                parts.push(`   Area: ${content.endpoint.associatedArea.name}`);
            }

            // Parameters statistics
            if (content.parametersStats) {
                const stats = content.parametersStats;
                parts.push(`   Parameters: ${stats.total} total`);

                if (stats.hasControl) {
                    parts.push(`   - Has control capabilities (can be controlled)`);
                }
                if (stats.hasMeasurement) {
                    parts.push(`   - Has measurement capabilities (monitors values)`);
                }
                if (stats.hasEnumeration) {
                    parts.push(`   - Has enumeration parameters (multiple preset values)`);
                }

                // Parameter names
                if (stats.parameterNames?.length > 0) {
                    parts.push(`   Available parameters: ${stats.parameterNames.slice(0, 5).join(', ')}${stats.parameterNames.length > 5 ? ` and ${stats.parameterNames.length - 5} more` : ''}`);
                }

                // Available units
                if (stats.availableUnits?.length > 0) {
                    parts.push(`   Measurement units: ${stats.availableUnits.join(', ')}`);
                }
            }

            parts.push("");

        } catch (error) {
            console.warn("Error parsing summary chunk:", error);
            parts.push(`${index + 1}. ${chunk.metadata.name || 'Device'} (parsing error)`);
            parts.push("");
        }
    });

    return parts.join('\n');
}

/**
 * Formats STANDARD detail chunks (non-split, with full parameters array)
 */
function formatStandardDetailChunks(chunks: LangChainDocument[]): string {
    const parts: string[] = [];
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    parts.push(" DETAILED DEVICE INFORMATION");
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    chunks.forEach((chunk, index) => {
        try {
            const content = JSON.parse(chunk.pageContent);
            const meta = chunk.metadata;

            // Device header
            parts.push(`${index + 1}. Device: ${content.endpoint?.name || meta.name || 'Unnamed Device'}`);
            parts.push(`   UUID: ${content.endpoint?.uuid || meta.uuid}`);

            // Category and type
            if (content.endpoint?.categoryName || meta.categoryName) {
                parts.push(`   Category: ${content.endpoint?.categoryName || meta.categoryName}`);
            }
            if (content.endpoint?.visualizationType || meta.visualizationType) {
                parts.push(`   Type: ${content.endpoint?.visualizationType || meta.visualizationType}`);
            }

            // Location information
            if (meta.floorLocation && meta.floorLocation !== 'Unknown') {
                parts.push(`   Location: ${meta.floorLocation === 'first' ? 'First Floor' : 'Second Floor'}`);
            }
            if (content.endpoint?.partitionNames?.length > 0) {
                parts.push(`   Partitions: ${content.endpoint.partitionNames.join(', ')}`);
            }
            if (content.endpoint?.associatedArea) {
                parts.push(`   Area: ${content.endpoint.associatedArea.name}`);
            }

            // DETAILED PARAMETERS
            if (content.parameters && Array.isArray(content.parameters) && content.parameters.length > 0) {
                parts.push(`\n    PARAMETERS (${content.parameters.length} total):`);

                content.parameters.forEach((param: any, paramIndex: number) => {
                    parts.push(`\n   ${paramIndex + 1}. ${param.name || 'Unnamed Parameter'}`);

                    // Current value
                    if (param.value !== undefined && param.value !== null) {
                        let valueStr = `      Current value: ${param.value}`;
                        if (param.unit) {
                            valueStr += ` ${param.unit}`;
                        }
                        parts.push(valueStr);
                    }

                    // Data type
                    if (param.dataType !== undefined) {
                        const dataTypeName = getDataTypeName(param.dataType);
                        parts.push(`      Data type: ${dataTypeName}`);
                    }

                    // Range
                    if (param.minVal !== undefined || param.maxVal !== undefined) {
                        let rangeStr = "      Range: ";
                        if (param.minVal !== undefined) rangeStr += `min ${param.minVal}`;
                        if (param.minVal !== undefined && param.maxVal !== undefined) rangeStr += " - ";
                        if (param.maxVal !== undefined) rangeStr += `max ${param.maxVal}`;
                        if (param.unit) rangeStr += ` ${param.unit}`;
                        parts.push(rangeStr);
                    }

                    // Operation type
                    if (param.operation?.type) {
                        parts.push(`      Operation: ${param.operation.type} (can be ${param.operation.type === 'switch' ? 'switched on/off' : param.operation.type === 'button' ? 'triggered' : 'controlled'})`);
                    }

                    // Log type
                    if (param.logType !== undefined) {
                        const logTypeDesc = getLogTypeDescription(param.logType);
                        parts.push(`      Logging: ${logTypeDesc}`);
                    }

                    // Enumeration values
                    if (param.enumerationVal && Array.isArray(param.enumerationVal) && param.enumerationVal.length > 0) {
                        parts.push(`      Possible values: ${param.enumerationVal.join(', ')}`);
                    }

                    // Unit prefix
                    if (param.unitPrefix) {
                        parts.push(`      Unit prefix: ${param.unitPrefix}`);
                    }
                });
            } else {
                parts.push(`\n   (This device chunk has no parameters array – possibly a parent chunk)`);
            }

            parts.push("\n" + "─".repeat(60) + "\n");

        } catch (error) {
            console.warn("Error parsing standard detail chunk:", error);
            parts.push(`${index + 1}. ${chunk.metadata.name || 'Device'} (parsing error)\n`);
        }
    });

    return parts.join('\n');
}

/**
 * Formats detail chunks using SEQUENCE NUMBER SYSTEM (parent + children)
 * These chunks were split using splitLargeJsonObjectByArrayField
 */
function formatSequenceDetailChunks(chunks: LangChainDocument[]): string {
    const parts: string[] = [];
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    parts.push(" DEVICES WITH PARAMETERS (Hierarchical Structure)");
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Group by sessionId
    const seqSessions = new Map<string, LangChainDocument[]>();

    chunks.forEach(doc => {
        const meta = doc.metadata as ExtendsSeqMetadata;
        if (meta.sequenceNumberSystem?.sessionId) {
            const sessionId = meta.sequenceNumberSystem.sessionId;
            if (!seqSessions.has(sessionId)) {
                seqSessions.set(sessionId, []);
            }
            seqSessions.get(sessionId)!.push(doc);
        }
    });

    seqSessions.forEach((sessionDocs, sessionId) => {
        // Find parent chunk (chunkId === 0)
        const parentChunk = sessionDocs.find(d => {
            const meta = d.metadata as ExtendsSeqMetadata;
            return meta.sequenceNumberSystem?.chunkId === 0;
        });

        // Find child chunks (chunkId > 0)
        const childChunks = sessionDocs.filter(d => {
            const meta = d.metadata as ExtendsSeqMetadata;
            return meta.sequenceNumberSystem && meta.sequenceNumberSystem.chunkId > 0;
        });

        if (parentChunk) {
            const parentMeta = parentChunk.metadata as ExtendsSeqMetadata;

            try {
                const parentContent = JSON.parse(parentChunk.pageContent);

                // Device header
                parts.push(`• Device: ${parentMeta.name || parentContent.deviceInfo?.name || 'Unnamed Device'}`);
                parts.push(`  UUID: ${parentMeta.uuid || parentContent.deviceInfo?.uuid || 'N/A'}`);

                if (parentMeta.category !== undefined) {
                    parts.push(`  Category: ${getCategoryName(parentMeta.category)}`);
                }
                if (parentMeta.visualizationType) {
                    parts.push(`  Type: ${parentMeta.visualizationType}`);
                }

                // Location
                if (parentMeta.floorLocation && parentMeta.floorLocation !== 'Unknown') {
                    parts.push(`  Location: ${parentMeta.floorLocation === 'first' ? 'First Floor' : 'Second Floor'}`);
                }
                if (parentMeta.partitionNames && parentMeta.partitionNames?.length > 0) {
                    parts.push(`  Partitions: ${parentMeta.partitionNames.join(', ')}`);
                }

                // Parameters from children
                if (childChunks.length > 0) {
                    parts.push(`\n  Parameters (${childChunks.length} total):\n`);

                    // Sort by chunkId
                    const sortedChildren = childChunks.sort((a, b) => {
                        const aId = (a.metadata as ExtendsSeqMetadata).sequenceNumberSystem?.chunkId || 0;
                        const bId = (b.metadata as ExtendsSeqMetadata).sequenceNumberSystem?.chunkId || 0;
                        return aId - bId;
                    });

                    sortedChildren.forEach((child, idx) => {
                        try {
                            const childContent = JSON.parse(child.pageContent);
                            const childMeta = child.metadata as ExtendsSeqMetadata;

                            const paramName = childMeta.parameterName ||
                                childContent.parameterData?.name ||
                                childMeta.name ||
                                'Parameter';

                            parts.push(`    ${idx + 1}. ${paramName}`);

                            if (childContent.parameterData) {
                                const param = childContent.parameterData;

                                if (param.value !== undefined && param.value !== null) {
                                    let valueStr = `       Value: ${param.value}`;
                                    if (param.unit) {
                                        valueStr += ` ${param.unit}`;
                                    }
                                    parts.push(valueStr);
                                }

                                if (param.dataType !== undefined) {
                                    parts.push(`       Data type: ${getDataTypeName(param.dataType)}`);
                                }

                                if (param.operation?.type) {
                                    parts.push(`       Operation: ${param.operation.type}`);
                                }

                                if (param.minVal !== undefined || param.maxVal !== undefined) {
                                    let rangeStr = "       Range: ";
                                    if (param.minVal !== undefined) rangeStr += `min ${param.minVal}`;
                                    if (param.minVal !== undefined && param.maxVal !== undefined) rangeStr += " - ";
                                    if (param.maxVal !== undefined) rangeStr += `max ${param.maxVal}`;
                                    if (param.unit) rangeStr += ` ${param.unit}`;
                                    parts.push(rangeStr);
                                }
                            }

                            parts.push("");

                        } catch (e) {
                            console.warn("Error parsing child chunk:", e);
                            parts.push(`    ${idx + 1}. ${child.metadata.name || 'Parameter'} (parsing error)`);
                        }
                    });
                } else {
                    parts.push(`  (No parameter chunks found for this device)`);
                }

                parts.push("\n" + "─".repeat(60) + "\n");

            } catch (error) {
                console.warn("Error parsing parent chunk:", error);
                parts.push(`• ${parentMeta.name || 'Device'} (parsing error)`);
                parts.push("");
            }
        } else {
            // Parent not found – show only children
            console.warn(`Session ${sessionId} has no parent chunk (orphaned children: ${childChunks.length})`);

            if (childChunks.length > 0) {
                const firstChild = childChunks[0].metadata as ExtendsSeqMetadata;
                parts.push(`• Device: ${firstChild.parentName || 'Unknown'} (parent chunk missing)`);
                parts.push(`  Parameters (${childChunks.length} orphaned):\n`);

                childChunks.forEach((child, idx) => {
                    const meta = child.metadata as ExtendsSeqMetadata;
                    parts.push(`    ${idx + 1}. ${meta.parameterName || meta.name || 'Parameter'}`);
                });

                parts.push("\n" + "─".repeat(60) + "\n");
            }
        }
    });

    return parts.join('\n');
}

/**
 * Formats final context statistics
 */
function formatStatistics(
    allDocs: LangChainDocument[],
    summaryChunks: LangChainDocument[],
    standardDetailChunks: LangChainDocument[],
    seqDetailChunks: LangChainDocument[],
    areaChunks: LangChainDocument[]
): string {
    const parts: string[] = [];
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    parts.push(" CONTEXT STATISTICS");
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    parts.push(`Total chunks provided: ${allDocs.length}`);
    parts.push(`  • Summary chunks: ${summaryChunks.length} (overview information)`);
    parts.push(`  • Standard detail chunks: ${standardDetailChunks.length} (complete device info with parameters)`);
    parts.push(`  • Sequence detail chunks: ${seqDetailChunks.length} (hierarchical parent + children)`);
    parts.push(`  • Area chunks: ${areaChunks.length} (location information)`);

    // Count parent vs children
    const parentChunks = seqDetailChunks.filter(d => {
        const meta = d.metadata as ExtendsSeqMetadata;
        return meta.sequenceNumberSystem?.chunkId === 0;
    });
    const childChunks = seqDetailChunks.filter(d => {
        const meta = d.metadata as ExtendsSeqMetadata;
        return meta.sequenceNumberSystem && meta.sequenceNumberSystem.chunkId > 0;
    });

    if (seqDetailChunks.length > 0) {
        parts.push(`    ↳ ${parentChunks.length} parent devices, ${childChunks.length} parameter chunks`);
    }

    // Unique devices
    const uniqueDevices = new Set(
        allDocs
            .map(doc => doc.metadata.uuid)
            .filter(uuid => uuid && !uuid.startsWith('parameters-'))
    );
    parts.push(`\nUnique devices in context: ${uniqueDevices.size}`);

    return parts.join('\n');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getCategoryName(category: number): string {
    const categories: Record<number, string> = {
        0: 'Controller',
        1: 'Gateway',
        2: 'Bridge',
        11: 'Actuator',
        12: 'Smart Switch',
        15: 'Smart Light',
        18: 'Sensor',
    };
    return categories[category] || `Category ${category}`;
}

function getDataTypeName(typeCode: number): string {
    const types: Record<number, string> = {
        0: 'number',
        1: 'decimal',
        2: 'boolean',
        3: 'string',
        4: 'enumeration',
        5: 'integer'
    };
    return types[typeCode] || 'unknown';
}

function getLogTypeDescription(logType: number): string {
    const descriptions: Record<number, string> = {
        0: 'configuration parameter (not logged)',
        1: 'logged on change',
        2: 'logged periodically',
        3: 'measurement (continuous logging)',
        4: 'event-based logging'
    };
    return descriptions[logType] || `log type ${logType}`;
}

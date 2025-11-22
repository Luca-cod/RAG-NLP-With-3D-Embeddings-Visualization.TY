

export function buildGlobalPartitionMap(jsonContent: any, documents?: any[]): Map<string, string> {

    const map = new Map<string, string>();


    // ========================================
    // STRATEGY 1: PARTITIONS FROM AREAS (ORIGINAL JSON)
    // ========================================


    console.log(" Building partition map from JSON structure...");

    // FIRST STRATEGY: Partitions from areas (the most important)
    if (jsonContent?.areas && Array.isArray(jsonContent.areas)) {
        console.log(` Processing ${jsonContent.areas.length} areas for partitions...`);

        for (const area of jsonContent.areas) {
            if (!area || !area.partitions || !Array.isArray(area.partitions)) continue;

            for (const partition of area.partitions) {
                try {
                    if (typeof partition === 'object' && partition.uuid && partition.name) {
                        // This is the IDEAL case: object with UUID and name
                        map.set(partition.uuid, partition.name);
                        console.log(` Mapped: ${partition.uuid} -> ${partition.name}`);
                    }
                    else if (typeof partition === 'string' && partition) {

                        const partitionName = findPartitionNameInArea(partition, area);
                        map.set(partition, partitionName);
                        console.log(` String partition mapped: ${partition} -> ${partitionName}`);
                    }
                } catch (error) {
                    console.error("Error processing partition:", error);
                }
            }
        }
    }

    // SECOND STRATEGY: Search for missing partitions in endpoints
    if (jsonContent?.endpoints && Array.isArray(jsonContent.endpoints)) {
        console.log(" Scanning endpoints for missing partition mappings...");

        for (const endpoint of jsonContent.endpoints) {
            if (!endpoint.partitions || !Array.isArray(endpoint.partitions)) continue;

            for (const partitionUuid of endpoint.partitions) {
                if (typeof partitionUuid === 'string' && !map.has(partitionUuid)) {
                    // Partition not found, let's try to deduce its name
                    const partitionName = findPartitionNameFromContext(partitionUuid, jsonContent);
                    map.set(partitionUuid, partitionName);
                    console.log(` Deduced from context: ${partitionUuid} -> ${partitionName}`);
                }
            }
        }
    }

    console.log(` Partition map completed: ${map.size} mappings`);

    // Debug: show all mappings
    console.log(" Final partition mappings:");
    for (const [uuid, name] of map.entries()) {
        console.log(`   ${uuid} -> ${name}`);
    }

    return map;
}

// Helper function per trovare nomi partizioni nel contesto
function findPartitionNameFromContext(uuid: string, jsonContent: any): string {
    // Search from areas
    if (jsonContent.areas) {
        for (const area of jsonContent.areas) {
            if (area.partitions) {
                for (const partition of area.partitions) {
                    if (typeof partition === 'object' && partition.uuid === uuid && partition.name) {
                        return partition.name;
                    }
                }
            }
        }
    }

    // Fallback: use the abbreviated UUID
    return `Partition_${uuid.substring(0, 8)}`;
}

function findPartitionNameInArea(uuid: string, area: any): string {
    // If the area has a name, use it to create a better name
    if (area.name) {
        return `${area.name}_Partition`;
    }
    return `Partition_${uuid.substring(0, 8)}`;
}
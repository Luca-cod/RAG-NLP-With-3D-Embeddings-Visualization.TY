import { Document as LangChainDocument } from "langchain/document";



export async function twoStageRetrieval(
    query: string,
    dynamicFilter: Record<string, any> = {},
    rawDocs: LangChainDocument[]
): Promise<LangChainDocument[]> {


    console.log("\n=== TWO-STAGE RETRIEVAL STARTED ===");


    const queryInfo = dynamicFilter.queryInfo || {};
    // console.log("Content of queryInfo in TwoStage", queryInfo.length);


    // --------------------  We extract the information we need from queryInfo  -------------------------------
    const isFirstFloorQuery = queryInfo.isFirstFloor === true;
    const isSecondFloorQuery = queryInfo.isSecondFloor === true;
    const isGenericQuery = queryInfo?.isGenericQuery === true;
    const isAutomationQuery = queryInfo?.isAutomationQuery === true;
    const isSpecificQuery = queryInfo?.isSpecificQuery === true;
    const hasLocationQuery = isFirstFloorQuery || isSecondFloorQuery;


    console.log(`Location query: ${hasLocationQuery ? (isFirstFloorQuery ? 'First Floor' : 'Second Floor') : 'No'}`);
    console.log(`Automation query: ${isAutomationQuery ? "Yes!" : "No!"}`);
    console.log(`Specific query: ${isSpecificQuery ? "Yes!" : "No!"}`);
    console.log(`Generic query: ${isGenericQuery ? "Yes!" : "No!"}`);


    let hasDeviceFilter: any;
    let hasDeviceCategoryFilter: any;

    if (dynamicFilter.queryInfo.detectedVisualizationTypes) {

        hasDeviceFilter = queryInfo?.detectedVisualizationTypes; //DynamicFilter.queryInfo.detectedVisualizationTypes → Array di stringhe (es: ['SMABIT_AV2010_32'])

    }

    if (queryInfo.detectedCategories) {
        hasDeviceCategoryFilter = queryInfo?.detectedCategories;
    }


    let Docs = rawDocs;


    let finalResults = Docs.filter(doc => {
        const matchVisualization = !hasDeviceFilter || doc.metadata.visualizationType === hasDeviceFilter;

        const matchCategory = !hasDeviceCategoryFilter || doc.metadata.category === hasDeviceCategoryFilter;

        // Debug per i primi documenti
        /* if (Docs.indexOf(doc) < 5) {
             console.log(`Doc "${doc.metadata.name}": vis="${doc.metadata.visualizationType}", cat="${doc.metadata.category}"`);
         }*/

        return matchVisualization && matchCategory;

    });
    console.log(`Device-specific documents: ${finalResults.length}`);
    finalResults.forEach((d: any, i: any) =>
        console.log("\nChunks type ottenuti dal two-stage:", "name:", d.metadata.name, "visualizationType -> ", d.metadata.visualizationType, "chunkType:", d.metadata.chunkType,)
    )

    /**
     * Determines the chunk strategy based on query analysis
     
    function determineChunkStrategy(analysis: QueryAnalysis): {
        chunkType: 'area' | 'detail' | 'summary';
        reason: string;
        priority: number;
    } {*/
    // PRIORITY 1: Location queries -> area chunks (fixes the reported bug)

    /*  let chunkType: 'area' | 'detail' | 'summary';
      let reason: string;
      let priority: number;
  
  
      if (DynamicFilter.queryInfo.hasLocationQuery) {
          return {
              chunkType: 'area',//detail
              reason: 'Location-based query detected',
              priority: 1
          };
      }
  
      // PRIORITY 2: Automation queries -> detail chunks
      if (DynamicFilter.queryInfo.hasAutomationQuery) {
          return {
              chunkType: 'detail',
              reason: 'Automation/control query detected',
              priority: 2
          };
      }
  
      // PRIORITY 3: Specific technical queries -> detail chunks
      if (DynamicFilter.queryInfo.isSpecific) {
          return {
              chunkType: 'detail',
              reason: 'Specific/technical query detected',
              priority: 3
          };
      }
      if (DynamicFilter.queryInfo.isGenericQuery) {
          // PRIORITY 4: Generic queries -> summary chunks
          return {
              chunkType: 'summary',
              reason: 'Generic query, using summary',
              priority: 4
          };
      }
      else {
          console.log("Query types not found!");
      }
  */
    // Throw an error for unhandled cases
    // throw new Error("Unhandled analysis case: No matching query type found.");

    //}




    // ============= STRATEGY 1: GENERIC QUERIES (SUMMARY CHUNKS) ==============================

    if (isGenericQuery) {

        console.log("\n--- Generic Query Strategy (Summary Chunks) ---");

        finalResults = finalResults.filter((doc: any) => {

            return doc.metadata.chunkType === "summary"

        });

        console.log(`Filtered to summary chunks only: ${finalResults.length}`);
    }


    // ===== DUAL SEARCH STRATEGY FOR LOCATION QUERIES =====
    else if (hasLocationQuery) {
        console.log("\n Location query detected - performing dual search");
        const targetFloor = queryInfo.targetFloor || (isFirstFloorQuery ? "first" : "second");
        console.log(`Target floor: "${targetFloor}"`);

        //Filtro manuale: only detail e area chunks with a correct location
        finalResults = finalResults.filter(doc => {//allDocs.filter(doc => {
            const meta = doc.metadata;

            // Only chunkTypes i want

            //1) Togliamo chunType === suammery e area
            if (meta.chunkType === 'summary' || meta.chunkType === 'area') {
                return false;
            }

            //  Escludiamo documenti con entrambi i flag (sono "globali")

            const hasMultipleFloors = (
                meta.isFirstFloor && meta.isFirstFloor !== "Unknown" &&
                meta.isSecondFloor && meta.isSecondFloor !== "Unknown"
            );

            if (hasMultipleFloors) {
                console.log(` Skipping multi-floor document: ${meta.name}`);
                return false; // Escludi documenti multi-floor
            }


            // Match principale su floorLocation
            if (meta.floorLocation === targetFloor) {
                return true;
            }

            // Fallback sui flag se floorLocation manca
            if (targetFloor === "first") {
                return meta.isFirstFloor === "first" || meta.isFirstFloor === "First";

            } else if (targetFloor === "second") {
                return meta.isSecondFloor === "second" || meta.isSecondFloor === "Second";
            } else {
                return false;
            }
        });

        //return hasMatchingLocation;

        console.log("After location query, we are obtained this documents:", finalResults.length);

    }
    // ===== STRATEGY 3: AUTOMATION QUERIES (CONTROL PARAMETERS) =====
    else if (isAutomationQuery) {
        console.log("\n--- Automation Query Strategy (Control Parameters) ---");


        //2. Manual filter: only detail chunks with control params

        finalResults = finalResults.filter(doc => {
            const meta = doc.metadata;
            const hasControlParamas = meta.hasControlParamas === true ||
                meta.parametersCount > 0 ||
                (meta.controlParameters && meta.controlParameters.length > 0);

            return meta.chunkType === "detail" && hasControlParamas;

        });

        console.log(`Automation documents with control parameters: ${finalResults.length}`);


    }
    else if (isSpecificQuery) {
        console.log("---- Specific Query Strategy -----");
        finalResults = finalResults.filter(doc => doc.metadata.chunkType === "detail" || doc.metadata.chunkType === "summary");
        console.log(`Specific query - keeping ALL detail chunks: ${finalResults.length}`)

    }

    // ===== FINAL PROCESSING WITHOUT DEDUPLICATION =====
    console.log("\n--- Final Processing ---");



    /* // ===== VALIDAZIONE FINALE =====
     console.log("\n--- Initial Validation... ---");
     const finalChunkTypes: Record<string, number> = {};
     finalResults.forEach((doc, i) => {
         const meta = doc.metadata;
         const identifier = meta.name || meta.areaName || meta.uuid;
 
         // Conta i chunk types
         finalChunkTypes[meta.chunkType] = (finalChunkTypes[meta.chunkType] || 0) + 1;
 
         console.log(`[${i}] ${meta.chunkType}: ${identifier}`);
         console.log(`   floorLocation: ${meta.floorLocation}`);
         console.log(`   chunkType: ${meta.chunkType}`);
         console.log(`   category: ${meta.category}`);
 
         if (meta.chunkType === 'detail') {
             console.log(`   parametersCount: ${meta.parametersCount}`);
             console.log(`   hasControlParams: ${meta.hasControlParamas}`);
         }
     });
 
     console.log(`Chunk type distribution:`, finalChunkTypes);
 
     // Take first 50 results
     const finalResultsSlice = finalResults.slice(0, 50);
     console.log(`Final location-filtered results: ${finalResultsSlice.length} documents`);
 
     // Log of final documents
     finalResultsSlice.forEach((doc, i) => {
         const identifier = doc.metadata.name || doc.metadata.areaName || doc.metadata.uuid || 'Unnamed';
         console.log(`[${i}] ${doc.metadata.chunkType}: ${identifier}`);
         console.log(`    Location: first=${doc.metadata.isFirstFloor}, second=${doc.metadata.isSecondFloor}`);
         console.log(`    PartitionNames: ${JSON.stringify(doc.metadata.partitionNames)}`);
     });
 
 
     if (finalResultsSlice.length === 0) {
         console.warn(" No location-specific documents found, using fallback");
 
     }*/

    console.log("=== TWO-STAGE RETRIEVAL COMPLETED ===");



    return finalResults;

}


// Faiss doesn't support complex filters, arrays, or complex conditions (including $or, $in - MongoDB filters)
// Therefore, I need to extract from the dynamic filter the field I want to filter with vectorStore, specifically (device name or better yet the visualizationType)

//Extract from faissFilter the parameter to use for filtering(manual filtering)
export function extractParameterForFilter(dynamicFilter: any): Record<string, string> | null {
    const viz = dynamicFilter?.faissFilter?.["metadata.visualizationType"];

    const result: Record<string, any> = {};
    if (Array.isArray(viz) && viz.length > 0) {
        result.visualizationType = viz;
        return result;

    } else if (typeof viz === 'object') {
        result.visualizationType = viz;
        return result;
    }
    return null;
}


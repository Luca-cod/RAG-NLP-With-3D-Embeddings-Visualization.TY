import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Ollama } from "@langchain/ollama";
import { promises as fs } from "fs";
import { OllamaEmbeddings } from "@langchain/ollama";
import path from 'path';
import { Document as LangChainDocument } from "langchain/document";
import { loadDocumentsJSON, prepareDocumentsForTwoStage, EndpointMetadata } from "../core/retrieval/loaders/loadDocumentJSON.js";
import { ChunkSplitter } from "../utils/logging/ChunksSplitting.js";
import { createSchemaAwareChunk } from "../core/retrieval/splitters/createSchemaAware.js"
import { createDynamicFilter } from "../services/query/AdaptiveRecoveryWithDeviceFilter copy.js";//----------------->Attenzione sto usando questa versione del filtro, per vedere che output mi ritorna ma ci mette tanto e surriscalda il pc
import { createRagChain } from "../core/chains/Chain.js";
import { filterAndDeduplicateDocuments } from "src/services/query/DocumentFilteringService.js";
//import { Validator } from "jsonschema";
import { buildGlobalPartitionMap } from "src/core/retrieval/loaders/buildGlobalPartitionsMap.js";
import { ExtendsSeqMetadata } from "src/core/retrieval/splitters/SecondSplit2.js";
import { extractParameterForFilter, twoStageRetrieval } from "src/core/retrieval/splitters/Two-StageRetrievalWithDeviceFilter.js";
import { user_query } from "./Query.js";
import { cacolateEuclideanDistancesForAllEmbedings } from "../config/ExtractEmbed.js";

import { create3DVisualization } from "./visualization3d.js";
import { applyTSNE } from "./t-SNE.js";
import { extractEmbeddings } from "./ExtractEmbed.js";

// ============================================ CONFIGURATION ================================================

export const config = {
  documentPath: "/home/luca/RAGs/EmbedRagNLP/src/data/", //Cartella con i documenti
  faissIndexPath: "./faiss_index", // Path per salvare l'indice FAISS
  outputPath: "/home/luca/RAGs/EmbedRagNLP/src/response/", // Cartella per salvare le risposte JSON
  visualizationPath: "/home/luca/RAGs/EmbedRagNLP/src/visualizations",
  modelName: "llama3.2:1b", // Nome modello Ollama
  chunkSize: 1300, // Dimensione chunk per lo splitting
  chunkOverlap: 250, // Overlap tra chunk
  retrievalConfig: {
    k: 50 //Numero (dei k documenti) più simili alla query
  },
  jsonSplitting: {
    splitKeys: ['endpoints', 'actions', 'rules'], // Chiavi da splittare
    preserveKeys: ['manifest'] // Chiavi da mantenere intere
  },
  visualization: {
    perplexity: 5,
    epsilon: 10,
    nComponents: 3,
    topKHighligth: 3
  }
};
//llama3.2:3b
export const llm = new Ollama({
  baseUrl: "http://localhost:11434",
  model: config.modelName,
  temperature: 0.01, //Valore più alto = risposte più creative, valore più baso = risposte più concrete
  numCtx: 4097, //Aumenta il contesto se possibile
  topP: 0.95 //Per maggiore coerenza
});


// EMBEDDINGS MODEL FROM OLLAMA!

export const embeddings = new OllamaEmbeddings({
  baseUrl: "http://127.0.0.1:11434",  // URL di Ollama
  model: "nomic-embed-text",
  maxRetries: 2,
  maxConcurrency: 3,//Riduci per concorrenza di debug
});

//const model = new SentenceTransformer('paraphrase-MiniLM-L6-v2');  Alternative model for embeddings


export const DEVICE_CATEGORIES: Record<number, {
  name: string;
  keyParams: string[];
  deviceTypes: string[];
  visualizationType: string[];
  description: string;
}> = {
  0: {
    name: 'controller',
    keyParams: ['mac_address', 'firmware_version', 'bsp_version'],
    deviceTypes: ['BOX-IO', 'Thermostat', 'LED Driver', 'Actuator'], // Tutti i dispositivi in categoria 0
    visualizationType: ['BOXIO', 'SMABIT_AV2010_32', 'LED_DRIVER', 'GEWISS_GWA1531'], // VisualizationType corrispondenti
    description: 'General control devices'
  },
  /*1: { // categoria per termostati
    name: 'thermostat',
    keyParams: ['temperatura', 'setpoint', 'system_mode'],
    description: 'Termostats and HVAC controls'
  },
  2: { // categoria per attuatori
    name: 'actuator',
    keyParams: ['window_covering_percentage', 'window_covering_command_up'],
    description: 'Actuators and mechanical devices' //Attuatori e dispositivi meccanici
  },*/
  11: { //categoria misuratori di consumo energetico
    name: 'energy_meter',
    keyParams: ['total_active_energy', 'phase_1_current', 'total_system_power'],
    deviceTypes: ['Energy meter'],
    visualizationType: ['EASTRON_SDM630'],
    description: 'Energy cosumption meters'
  },
  15: {// categoria per controller per illuminazioni smart
    name: 'smart_light',
    keyParams: ['line_1', 'line_2', 'active_power', 'voltage'],
    deviceTypes: ['Smart lightin controller'],
    visualizationType: ['WS558'],
    description: 'Smart lightin controller'
  },

  18: {// categoria sensori ambientali
    name: 'sensor',
    keyParams: ['temperature', 'presence', 'fall'],
    deviceTypes: ['Fall sensor'],
    visualizationType: ['VAYYAR_CARE'],
    description: 'Evironmental sensors'
  }
};


/**Ecco la lista completa dei dispositivi presenti con le loro categorie principali:

    BOX-IO (Category: 0) - Dispositivo di gestione generale

    Smart light controller (Category: 15) - Controller per illuminazione

    Thermostat (Category: 1) - Termostato per temperatura

    Line 1 lights (Category: 15) - Luci LED

    Energy meter (Category: 11) - Misuratore di energia elettrica

    Roller shutter actuator (Category: 2) - Attuatore per tapparelle

    Fall sensor (Category: 18) - Sensore di caduta e presenza */





//=================== INTERFACCE PRINCIPALI ========================================


export interface ExtendDocument extends LangChainDocument {
  metadata: EndpointMetadata,
  readableText?: string; //opzionale per testo leggibile
  // automationConfig?: AutomationConfig; //L'automatismo configurato con tutti i suoi dettagli
  //È il campo principale che sostituisce il vecchio campo pageContent, e contiene tutta la configurazione 
  // dell'automatismo, come definito nell'interfaccia AutomationConfig.

}

interface RagResponse {
  query: string;
  //response: AutomationConfig | string;
  response: string;
  timestamp: string;
  context?: string[];
  validation?: {
    valid: boolean;
    errors?: string[];
  }
}


//export const directoryPath = "/home/luca/RAGs/EmbedRagNLP/src/data";
export const directoryPath = "/home/luca/RAGs/EmbedRagNLP/src/data";
export const targetFile = 'installation-config.json'; //File specifico da processare
export const filePath = path.join(directoryPath, targetFile);


async function debugFAISSIndex(vectorStore: FaissStore) {
  const sampleDocs = await vectorStore.similaritySearch("test", 25);
  // console.log("FAISS Index Metadata Sample:");
  //sampleDocs.forEach((doc, i) => {
  //console.log(`[${i}] Metadata:`, doc.metadata);
  //});
}

//  =============================================================================================================
//                                          MAIN 
//  =============================================================================================================
async function main() {

  const startRag = performance.now();
  try {

    if (!await testOllamaConnection()) {
      throw new Error("Ollama unreachable - start service first");
    }

    console.log("Starting runRAGSystem...");
    const query = user_query;
    const response = await runRAGSystem(query);

    //const JsonSchema = await loadSchema(directoryPath);
    // const validatedResponse = validateLLMResponse(response, directoryPath);


    // Salvataggio della risposta
    await saveResponse(query, response);

    console.log("All completed successfully");

    let parsedResponse;

    if (typeof response === 'string') {
      try {
        parsedResponse = JSON.parse(response);

      } catch (e) {
        console.error("Error parsing LLM response", e);
        return;

      }

    } else {
      parsedResponse = response;
      console.log("Parse response:", parsedResponse);
    }

    //const testEmbeddings = await embeddings.embedQuery("test di prova");
    // console.log("Test Embeddings:", testEmbiddings());

  } catch (error) {
    console.error("Error in MAIN:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });
  }
  const endRag = performance.now();
  console.log(`\nTOTAL EXECUTION TIME: ${(endRag - startRag).toFixed(2)} ms\n`);
}

//  =============================================================================================================
//                                              METHODS
//  =============================================================================================================


//===================================== TEST SERVER CONNECTION ===============================================
async function testOllamaConnection() {
  try {
    const test = await fetch('http://localhost:11434', {
      method: 'GET'
    });
    console.log("Connection OK, status:", test.status);
    return true;
  } catch (error) {
    console.error("Connection failed:", error);
    return false;
  }
}

// =============================================================================================================
//                                  CORE RUG FUNCTIONS
// =============================================================================================================
export async function runRAGSystem(query: string): Promise<string> {//Promise<string | AutomationConfig> {

  try {

    if (!query || typeof query !== 'string') {
      throw new Error(`Not valid query: ${typeof query} - ${query}`);
    }

    console.time('RAG_System_Total_Time');

    console.time('Loading_Documents');

    // Loading documents
    const { Documents, partitionMap } = await loadDocumentsJSON();


    console.timeEnd('Loading_Documents');

    const globalPartitionMap = partitionMap;


    //Obtain the embedding of the query
    const queryEmbedding = await embeddings.embedQuery(user_query);
    console.log("Query Embedding sample:", queryEmbedding.slice(0, 50));

    // Log for see the structure of how the query is translate in numbers/embeddings
    const singleVector = await embeddings.embedQuery(user_query);
    console.log(singleVector.slice(0, 100));



    // Make sure it is populated, show the link between uuid and location
    /*for (const [uuid, name] of globalPartitionMap.entries()) {
      console.log(`PartitionMap entry: ${uuid} -> ${name}`);
    }*/

    Documents.forEach((d: any, idx: any) => {

      try {
        const device = JSON.parse(d.pageContent)?.device;
        if (!device) console.log(`[Doc ${idx}] Nessun campo device trovato`);
      } catch (e) {
        console.log(`[Doc ${idx}] JSON parse error`);
      }
    });


    //            Document Validation
    const validDocuments = Documents.filter((doc: any) =>
      doc.pageContent && typeof doc.pageContent === 'string'
    );

    if (validDocuments.length === 0) {
      throw new Error("No valid JSON documents found");
    }
    const parsedDocs = prepareDocumentsForTwoStage(validDocuments);

    /*     Check 'category' after prepareDocumentsForTwoStage
    console.log("After prepareDocumentsForTwoStage - checking 'category':");
    parsedDocs.forEach((d, idx) => {
      const cat = d.parsedContent?.device?.category;
      console.log(`[ParsedDoc ${idx}] device.category =`, JSON.stringify(cat));
    });*/

    if (parsedDocs.length === 0) {
      throw new Error("No valid documents after parsing");
    }

    if (parsedDocs.length === 0) {
      throw new Error("No valid JSON document after parsing");
    }


    //  ==========================  CREATION CHUNKS  =================================

    console.time('Creating_Chunks');

    let allChunks = await createSchemaAwareChunk(parsedDocs, config.chunkSize, globalPartitionMap);

    console.log("\nChunks crated from createSchemaAware:");
    allChunks.forEach(d =>
      console.log("\nChunkType relativi a questi chunks:", d.metadata.chunkType, "name:", d.metadata.name)
    );

    console.timeEnd('Creating_Chunks');


    console.time('Chunks_Splitting');

    //    --- SPLITTING CHUNKS ---
    const chunkingResults = await ChunkSplitter(allChunks, config.chunkSize, config.chunkOverlap); //config.chunkSize, config.chunkOverlap); //Documents

    console.timeEnd('Chunks_Splitting');

    chunkingResults.forEach(result => {
      console.log(`Document ${result.original.metadata.source} produced ${result.chunks.length} chunks, chunkType: ${result.original.metadata.chunkType}`);
    });

    /**   =============================================================================================================
     *                                          CREATION VECTORE STORE
          =============================================================================================================
    */
    // Vectore Store Management
    console.time('Vector_Store_Management');

    // FAISS Vector Store
    let vectorStore: FaissStore;


    //Extract ALL split chunks from all results!
    let allSplittedChunks = chunkingResults.flatMap(result => result.chunks);

    console.log(`   - Total splitted chunks: ${allSplittedChunks.length}`);


    /**  DEBUG: Verified dimensions chunk before the embedding
    console.log(` CHUNK SIZE ANALYSIS BEFORE EMBEDDING:`);
    const chunkSizes = allSplittedChunks.map(chunk => chunk.pageContent.length);

    console.log(`   - Total chunks: ${allSplittedChunks.length}`);
    console.log(`   - Max chunk size: ${Math.max(...chunkSizes)} chars`);
    console.log(`   - Min chunk size: ${Math.min(...chunkSizes)} chars`);
    console.log(`   - Avg chunk size: ${Math.round(chunkSizes.reduce((a, b) => a + b) / allSplittedChunks.length)} chars`);
*/

    //  =====================================   CREATION VECTORE STORE INDEX   ======================================================

    try {

      //       Load the existing index!
      vectorStore = await FaissStore.load(config.faissIndexPath, embeddings);




      // When i added metadata at creation of index, loading fails, every time i loading the imput file, i should restruct the index and the vectoreStore
      /**File singolo con solo i vettori
      Metadata salvati separatamente (LangChain li gestisce a parte)
      Devi ricostruire tutto l'indice per aggiungere documenti  */


      console.log("FIASS index loaded from disk");

      await debugFAISSIndex(vectorStore);


    } catch (error) {

      console.warn("Faiss index not found, creating a new index...");

      //     Create the index for the vectore store!
      vectorStore = await FaissStore.fromDocuments(allSplittedChunks, embeddings);


      console.log("Saving chunks to FAISS with metadata:");
      allSplittedChunks.forEach((chunk, index) => {
        console.log(`Chunk:${index} ChunkType:${chunk.metadata.chunkType} is isFirstFloor? ${chunk.metadata.isFirstFloor} or is isSecondFloor: ${chunk.metadata.isSecondFloor}, hasAreaInfo: ${chunk.metadata.hasAreaInfo}`);
      });

      await vectorStore.save(config.faissIndexPath);

      console.log("New FAISS index created and saved");
    }

    console.timeEnd('Vector_Store_Management');




    const dynamicFilter = createDynamicFilter(query)
    console.log("\nResult from createDynamicFilter:", dynamicFilter);


    // Debug: conta tutti i documenti nel vectorStore
    /* try {
 
       const allDocs = await vectorStore.similaritySearch("", k); // Query vuota
       console.log(`Debug: VectorStore contiene ${allDocs.length} documenti totali`);
       //allDocs.forEach((doc, i) => {
       //  console.log(`[${i}] ${doc.metadata.chunkType}: ${doc.metadata.areaName || doc.metadata.name}`);
       //});
     } catch (error) {
       console.warn("Impossibile contare i documenti nel vectorStore:", error);
     }*/



    //FAISS NON SUPPORTA FILTRI CHE UTILIZZANO METADATI, NEANCHE CHIAVE,VALORE, PERCHE' DURANTE LA CREAZIONE DELL'INDICE NON VIENE PASSATO NESSUN METADATO.
    const k = config.retrievalConfig.k; //Numero (dei k documenti) più simili alla query
    let relevantDocs: LangChainDocument[] = [];


    // ==================== estraiamo il filtro sui dispositivi ================================================
    const faissVizFilter = extractParameterForFilter(dynamicFilter);

    console.log("Embeddings instance created:", embeddings.constructor.name);


    /*   Is not function beacuse FAISS doesn't support metadata filtering!
    if (faissVizFilter) {
      const results = await vectorStore.similaritySearch(query, k, faissVizFilter);
      console.log(" Found results with filter:", results.length);
    }*/
    /** Attenzione: similaritySearch() è immediato ma non ha re-ranking interno (ad es. Max Marginal Relevance), e se query === "", restituisce solo i più simili a niente (quindi comporta fallback). */



    //Se vero, eseguo il filtraggio manuale dopo il retrieval
    if (faissVizFilter) {

      console.log("\nFAISS VisualizationType filter:", faissVizFilter);

      //    --- Appling asRetriever ---
      const retriever = vectorStore.asRetriever({
        k,
        searchType: "similarity",
        //verbose: true
      });

      //    --- Invoke the retriever ---
      let retrievalDocs = await retriever.invoke(query);

      console.log(`Retriever returned: ${retrievalDocs.length} documents`);

      console.log("Manual filtering post retrieval!");


      retrievalDocs = retrievalDocs.filter(doc => {
        const metadata = doc.metadata || {};

        return Object.entries(faissVizFilter).every(([key, value]) => {
          const metadataValue = metadata[key];
          //console.log(`Found: ${[key]} -> ${value} `);
          console.log(`Checking: ${key} -> ${metadataValue} against [${value}]`);

          // Verifica se il valore del metadata è contenuto nell'array del filtro
          return value.includes(metadataValue);
          //return metadata[key] === value;
        });

      });

      retrievalDocs.forEach(doc =>
        console.log("\nChunkType dei documenti ottenuti dopo filtering manuale con filtro", doc.metadata.chunkType, "and:", doc.metadata.visualizationType)
      )


      relevantDocs = await twoStageRetrieval(query, dynamicFilter, retrievalDocs);//config.retrievalConfig.k


      console.log("Search for relevant documents...");

      relevantDocs.forEach((doc, i) => {
        console.log(`- [${i}] ${doc.metadata.name} (UUID: ${doc.metadata.uuid}) 
        - type ${doc.metadata.type} - chunkType: ${doc.metadata.chunkType} 
        - floorLocation: ${doc.metadata.floorLocation} - Qualcosa: ${doc.metadata.floorInfo}
        .IsFirstFloor: ${doc.metadata.isFirstFloor} -isSecondFloor: ${doc.metadata.isSecondFloor}`);

      });
      console.log("relevantDocs dimension", relevantDocs.length);


    } else {

      console.warn("\nNo valid visualizationType filter found in DynamicFilter");
      console.log("\nApplying retrieval without visualizationType filter.");

      // Re-index solo i documenti validi in un nuovo vector store
      // const tempVectorStore = await FaissStore.fromDocuments(relevantDocs, new OpenAIEmbeddings());

      const retriever = vectorStore.asRetriever({
        k,
        searchType: "similarity",//'mmr',
        //searchType: "mmr", //for Max Marginal Relevance 
        //verbose: true
      })
      let retrievalDocs = await retriever.invoke(query);

      //Without manual filtering, it's applied in twoStageRetrieval because we don't have faissFilter true!
      /*retrievalDocs.forEach(doc => {
        console.log(`- ${doc.metadata.name}: chunkType=${doc.metadata.chunkType} pageContent:${doc.pageContent.length} visualizationType:${doc.metadata.visualizationType} - categories: ${doc.metadata.category}`);
      });*/


      relevantDocs = await twoStageRetrieval(query, dynamicFilter, retrievalDocs);

    }

    try {

      //Extract the embeddings
      const extractEmbed = await extractEmbeddings(relevantDocs, queryEmbedding);

      //Applied t-SNE -> riduce da ~768D a 3
      const reduceVectors = await applyTSNE(extractEmbed);


      //Distanza tra embeddings e puntoQuery
      const distance = cacolateEuclideanDistancesForAllEmbedings(reduceVectors);
      console.log("Distanza tra punti e puntoQuery:", distance);

      //Visualization3D
      await create3DVisualization(reduceVectors, query, config.visualization.topKHighligth);

    } catch (vizError) {

      console.error("Error during visualization:", vizError);
      console.log("Continuing with RAG response...");

    }


    if (allChunks.length < 1) {
      relevantDocs = prioritizeChunks(relevantDocs);
    }


    // ===================================   Applied function for filtering and deduplication   ====================================

    //const finalDocs = filterAndDeduplicateDocuments(relevantDocs, query);
    //console.log(`Final documents after filtering: ${finalDocs.length}`);



    let docsForChain = relevantDocs;
    console.log("Contenuto loadDocs prima di essere passato alla Chain", docsForChain.length);

    // ======================   Creating the chain with LCEL  ===============================
    console.log("Chain creation RAG...");
    const chain = await createRagChain(llm, query, docsForChain);

    //      Invoking the chain with the query
    const response = await chain.invoke({ query });

    console.timeEnd('RAG_System_Total_Time');


    return response;

  } catch (error) {

    console.error("System erro RAG:", error);
    return await handleSystemError(query, error);
  }

}

/* =============================================================================================================
    FUNCTION FOR PRIORITIZING CHUNKS 
   =============================================================================================================
*/

function prioritizeChunks(docs: LangChainDocument[]): LangChainDocument[] {
  return docs.sort((a, b) => {
    const aMeta = a.metadata as ExtendsSeqMetadata;
    const bMeta = b.metadata as ExtendsSeqMetadata;

    if (aMeta.sequenceNumberSystem?.chunkId !== undefined && bMeta.sequenceNumberSystem?.chunkId !== undefined) {


      if (aMeta.sequenceNumberSystem?.chunkId < 0 && bMeta.sequenceNumberSystem?.chunkId < 0) return -1;

      //1. Parent chunks FIRST(highest priority - chunkId = 0)
      if (aMeta.sequenceNumberSystem?.chunkId === 0 && bMeta.sequenceNumberSystem?.chunkId !== 0) return -1;
      if (bMeta.sequenceNumberSystem?.chunkId === 0 && aMeta.sequenceNumberSystem?.chunkId !== 0) return -1;

      //2. Non-SequenceNumber chunks SECOND (medium priority)
      if (!aMeta.sequenceNumberSystem && bMeta.sequenceNumberSystem) return -1;
      if (!bMeta.sequenceNumberSystem && aMeta.sequenceNumberSystem) return -1;

      //3. Child chunks LAST (Lowest priority) - mantain their order
      if (aMeta.sequenceNumberSystem?.chunkId > 0 && bMeta.sequenceNumberSystem?.chunkId > 0) {
        return aMeta.sequenceNumberSystem?.chunkId - bMeta.sequenceNumberSystem?.chunkId;
      }

      return 0;
    }
    return -1;

  });

}


//  =============================================================================================================
//                  ERROR HANDLING FUNCTION
// =============================================================================================================
//log the error and return a readable JSON string 
async function handleSystemError(query: string, error: any): Promise<string> {
  console.error("🚨 System error managment:", error);

  return JSON.stringify({
    response: "An error occured while processing your request.",
    error: error instanceof Error ? error.message : String(error),
    query: query,
    timestamp: new Date().toISOString()
  }, null, 2);
}




//  =============================================================================================================
//     Transform raw device configuration JSON into structured documents ready for AI processing and retrieval.
//  =============================================================================================================
export function convertLangChainDocs(docs: any[]): LangChainDocument[] {
  //se relevantDocs[0]  non ha pageContent, ma ha un campo simile (es. content o text), modifica convertLangChainDocs per mapparlo correttamente:
  //docs è un'array 
  console.log("Pre-conversion content:", docs[0]);
  return docs.map(doc => {
    //Controllo se il documento ha già la strottura ExtendDocument
    if (doc.pageContent && doc.metadata) {
      return doc as LangChainDocument;
    }

    return {
      pageContent: doc.pageContent || doc.content || "",
      metadata: doc.metadata || {
        source: 'unknown',
        loc: 'unknown',
        section: doc.metadata?.section || 'no-section'

      }
    };
  });

}



// =============================================================================================================
//                shows the actions already defined or available, useful for understanding "what it can do"
// ============================================================================================================= .
//For future debugging purposes, to see what actions are available in the automatism context
/*

function getActionsSummary(structuredContext: AutomatismContext): string {

if (!structuredContext || !structuredContext.automatism?.actions) {
    return "No actions available";
  }

  return structuredContext.automatism.actions.map(action => {
    const operations = action.operations
      .map(op => `${op.parameter.parameter}=${op.value}`)
      .join(', ') || "No operation ";

    return `- ${action.name} (${action.uuid}): ${operations}`;
  }).join('\n');
}
*/

//  ===========================================================================
//                        SAVE THE RESPONSE (JSON FORMAT)
//  ===========================================================================
async function saveResponse(query: string, response: string | any): Promise<void> {

  const responseText = typeof response === 'string' ? response : JSON.stringify(response, null, 2);

  console.log("Start saveResponse");

  try {
    // Create a folder if it doesn't exist yet
    await fs.mkdir(config.outputPath, { recursive: true });

    // Create a unique file name
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `response_${timestamp}.txt`;
    const fullPath = path.join(config.outputPath, filename);

    // Data to save
    /*const dataToSave = {
      query,
      response,
      timestamp: new Date().toISOString(),
      model: config.modelName
    };
    const ragResponse: RagResponse = {
      query,
      response,
      timestamp: new Date().toISOString(),
      context: [] // Aggiungi il contesto se necessario  ------------------>???????
    };*/

    // Save the file
    await fs.writeFile(
      fullPath,
      responseText,
      "utf-8"
    );

    console.log("Response saved in:", fullPath);
    console.log("Query executed: ", query);
  } catch (error) {
    console.error("Error saving response:", error);
    throw error;
  }
}

main();
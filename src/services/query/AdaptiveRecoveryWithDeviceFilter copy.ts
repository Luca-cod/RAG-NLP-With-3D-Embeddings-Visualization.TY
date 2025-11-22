
import { DEVICE_CATEGORIES } from "../../config/RAG.js";
import { getConfig } from "./getConfig.js";

//Contains the logic to create dynamic filters based on the query. This helps retrieve documents relevant to the query.

//========================= INTERFACE =============================================
export interface DynamicFilterConfig {
    keywordMappings: {
        [key: string]: {
            categories?: number[];
            visualizationType?: string[];
            visualizationCategories?: string[];
            regexPatterns?: RegExp[];
            metadataFields?: string[];
            keyParams?: string[];

        };

    };
    locationKeyWords: string[];
    automationKeywords: string[];
    specificKeywords: string[];
    defaultResponse: {
        categories: number[];
        examples: string[];
    };
}

interface QueryAnalysis {
    matchedKeywords: string[];
    matchedCategories: number[];
    matchedVisualizationTypes: string[];
    matchedVisualizationCategories: string[];
    hasSpecificKeywords: boolean;
    hasGenericKeywords: boolean;
    hasLocationQuery: boolean;
    isSpecific: boolean;
    isGenericQuery: boolean;
    locationKeyWords: string[];
    hasAutomationQuery: boolean;
    isAutomation: boolean;
    automationKeywords: string[];
    query: string
}

/**
 * REFACTORED VERSION: Simplified for consistent chunk structure
 * 
 * Since all documents are now installation-config type with proper chunk types,
 * filtering logic is much cleaner and more reliable.
 * 
 * KEY IMPROVEMENTS:
 * - Single document type (installation-config) with different chunk types
 * - Reliable location filtering using boolean flags
 * - Simplified filter validation for FAISS
 * - Better debugging and validation
 */

//=================================================  VERSIONE SOLO CHUNKS ==============================================================


// finale uso queesta versione!!

export function createDynamicFilter(query: string):
    //Record<string, any> {
    {
        //Return Type
        faissFilter: Record<string, any>,
        queryInfo: Record<string, any>
    } {


    if (!query || typeof query !== 'string') {
        console.warn("Invalid query provided to createDynamicFilter");
        const defaulFilter = getDefaultQueryInfo();
        return {
            faissFilter: defaulFilter,
            queryInfo: getDefaultFilter()
        }
    }

    console.log(`\n=== CREATING DYNAMIC FILTER ===`);

    const config = getConfig();
    const lowerQuery = query.toLowerCase();

    // ===== ANALYZE QUERY =====
    const queryAnalysis = analyzeQuery(lowerQuery, config);
    console.log("Query analysis:", {

        matchedCategories: queryAnalysis.matchedCategories.length,
        matchedKeywords: queryAnalysis.matchedKeywords.length,
        locationQuery: queryAnalysis.hasLocationKeywords,
        automationQuery: queryAnalysis.hasAutomationKeywords,
        specificQuery: queryAnalysis.hasSpecificKeywords,
        genericQuery: queryAnalysis.hasGenericKeywords,

    });


    // ============= DETERMINA INFO QUERY PER TWO-STAGE =================
    //const queryInfo = buildQueryInfo(queryAnalysis, lowerQuery);
    const queryInfo: Record<string, any> = {

        /* isFirstFloor: hasFirstFloor,//lowerQuery.includes("first floor"),
         isSecondFloor: hasSecondFloor,//lowerQuery.includes("second floor"),
         isGenericQuery: queryAnalysis.hasGenericKeywords,
         isAutomationQuery: queryAnalysis.hasAutomationKeywords,
         isSpecificQuery: queryAnalysis.hasAutomationKeywords,
         detectedDevices: queryAnalysis.matchedKeywords,
         detectedCategories: queryAnalysis.matchedCategories,
         detectedVisualizationTypes: queryAnalysis.matchedVisualizationTypes,
         //requiresControlParams: queryAnalysis.hasAutomationQuery,
         //requiresLocationData: queryAnalysis.hasLocationQuery,
 
         locationQuery: queryAnalysis.hasLocationKeywords*/
    };

    const locationFilter = extractLocationFilter(query);

    const hasFirstFloor = lowerQuery.includes("first floor");
    const hasSecondFloor = lowerQuery.includes("second floor");

    //Aspe devo modificarla
    const isFirstFloorQuery = locationFilter?.["metadata.floorLocation"] === "first";
    const isSecondFloorQuery = locationFilter?.["metadata.floorLocation"] === "second";
    const hasLocationQuery = isFirstFloorQuery || isSecondFloorQuery;

    console.log(`Location query: ${hasLocationQuery ? (isFirstFloorQuery ? 'First Floor' : 'Second Floor') : 'No'}`);



    // Detect specific device from query
    const detectedDevices = detectDeviceFromQuery(lowerQuery, config);


    // ===== DETERMINE CHUNK STRATEGY =====
    // const strategy = determineChunkStrategy(queryAnalysis);
    // console.log(`Chunk strategy: ${strategy.chunkType} (${strategy.reason})`);

    let filterForFaiss: { [key: string]: any } = {};

    // APPLICAZIONE FILTRO DISPOSITIVO (prima di location/automation)
    /*  for (const device of detectedDevices) {
  
          /*if (device.category !== undefined) {
  
              filterForFaiss["metadata.category"] = device.category; --> sovrascrive se più dispositivi
  
              if (device.visualizationType) {
  
                  filterForFaiss["metadata.visualizationType"] = device.visualizationType;
                  filterForFaiss.push(device.visualizationType);
  
              }
  
              console.log(` DEVICE FILTER APPLIED: ${device.name} (category: ${device.category})`);
          }                            /

    if (device.category !== undefined && !allCategories.includes(device.category)) {
        allCategories.push(device.category);
    }
    if (device.visualizationType) {
        for (const vizType of device.visualizationType) {
            if (!allVisualizationTypes.includes(vizType)) {
                allVisualizationTypes.push(vizType);
            }
        }
    }
}

//Adding in filterForFaiss all detected categories and visualizationTypes
filterForFaiss["metadata.category"] = allCategories;
filterForFaiss["metadata.visualizationType"] = allVisualizationTypes;
*/









    // Specificity determination
    const isSpecificQuery = //queryAnalysis.matchedKeywords.length > 0 ||
        //queryAnalysis.matchedCategories.length > 0 ||
        // queryAnalysis.matchedVisualizationTypes.length > 0 ||
        // queryAnalysis.matchedVisualizationCategories.length > 0 ||
        queryAnalysis.hasSpecificKeywords;

    const isGenericQuery = queryAnalysis.hasGenericKeywords; //&&
    // !queryAnalysis.hasSpecificKeywords &&
    //!queryAnalysis.hasAutomationKeywords &&
    // !queryAnalysis.hasLocationKeywords &&
    // queryAnalysis.matchedKeywords.length === 0;

    const SpecificKeywords = queryAnalysis.hasSpecificKeywords;
    const CategoriesFind = queryAnalysis.matchedCategories;








    // ===== ADD LOCATION FILTERS (Critical for reported bug fix) =====
    if (hasLocationQuery) {

        console.log("Which floor is?", locationFilter);

        queryInfo.locationQuery = true;
        queryInfo.isFirstFloor = isFirstFloorQuery;
        queryInfo.isSecondFloor = isSecondFloorQuery;

        // Aggiungi anche il floor target per facilitare il filtering
        queryInfo.targetFloor = isFirstFloorQuery ? "first" : "second";

        if (locationFilter) {
            //queryInfo.push(locationQuery)
            Object.assign(filterForFaiss, locationFilter);
        }
    }

    else if (queryAnalysis.hasAutomationKeywords) {

        //For automation query, select chunks with control parameter
        console.log("Automation query: added control parameters requirement");
        queryInfo.isAutomationQuery = true;

    }
    else if (isGenericQuery) {

        //é di tipo isGeneric query per cui seleziono SOLAMENTE chunkType === summary !
        console.log("Generic query: using summary chunks only");
        queryInfo.isGenericQuery = true;
    }

    else if (isSpecificQuery) {
        //For specific query, i prefer select only detail chunks
        console.log("Specific query, using detail chunks, there are also specific keywords or devices/categories detected", SpecificKeywords, "and these categories", CategoriesFind);
        queryInfo.isSpecificQuery = true;

    }
    // Aggiungi info sui dispositivi rilevati

    if (detectedDevices.length > 0) {
        const allCategories = detectedDevices.flatMap(d => d.category);
        const allVisualizationTypes = detectedDevices.flatMap(p => p.visualizationType || []);

        //Remove duplicates
        const uniqueCategorie = [...new Set(allCategories)];
        const uniqueVisuaizationTypes = [...new Set(allVisualizationTypes)];

        if (allCategories.length > 0) filterForFaiss["metadata.category"] = allCategories;

        if (allVisualizationTypes.length > 0) filterForFaiss["metadata.visualizationType"] = allVisualizationTypes;
    }


    /*
    if (detectedDevices.length > 0) {
        queryInfo.detectedDevices = detectedDevices.map(d => d.name);
        queryInfo.detectedCategories = detectedDevices.map(d => d.category);
        queryInfo.detectedVisualizationTypes = detectedDevices
            .flatMap(d => d.visualizationType || []);
    } */

    // ===== COMPLETA QUERY INFO CON STRATEGIA =====
    //queryInfo.chunkStrategy = strategy.chunkType;
    //queryInfo.strategyReason = strategy.reason;

    console.log(" Query Info for TwoStage:", JSON.stringify(queryInfo, null, 2));
    console.log("=== FILTER CREATION COMPLETED ===\n");


    const result = {

        faissFilter: filterForFaiss,
        queryInfo: queryInfo
    }
    if (result) console.log("Content filter", JSON.stringify(result));

    console.log(" Final result from createDynamicFilter:", {
        hasFaissFilter: !!result.faissFilter,
        hasQueryInfo: !!result.queryInfo,
        queryInfoKeys: Object.keys(result.queryInfo)
    });


    return result;
}

/**
 * Default query info fallback
 */
function getDefaultQueryInfo(): Record<string, any> {
    return {
        isFirstFloorQuery: false,
        isSecondFloorQuery: false,
        isGenericQuery: false,
        isAutomationQuery: false,
        isSpecificQuery: false,
        detectedDevices: [],
        detectedCategories: [],
        detectedVisualizationTypes: [],
        preferredChunkTypes: ['summary', 'detail', 'area'],
        requiresControlParams: false,
        requiresLocationData: false,
        chunkStrategy: 'summary',
        strategyReason: 'Default fallback'
    };
}



/**
 * Adds strategy-specific metadata filters
 */
function addStrategyMetadataFilters(
    filter: Record<string, any>,
    strategy: { chunkType: string },
    analysis: QueryAnalysis
): void {
    if (analysis.hasLocationQuery) {
        console.log("Location query: searching ALL chunk types");
        // NON filtrare per chunkType - vogliamo TUTTO!
        delete filter["metadata.chunkType"];
        return;
    }
    switch (strategy.chunkType) {
        case 'area':
            // Area chunks need area information

            filter["metadata.chunkType"] = 'area';
            console.log("Using area chunks for location query");
            break;

        case 'detail':
            if (analysis.hasAutomationQuery) {
                // Automation queries need control parameters
                filter["metadata.hasControlParams"] = true;
                console.log("Added requirement: hasControlParams = true");
            } else if (analysis.isSpecific) {
                //filter["metadata.hasControlParams"] = true;
                //console.log("Added requirement: hasControlParams = true");
            }
            break;

        case 'summary':
            analysis.isGenericQuery,
                filter["metadata.chunkType"] = 'summary';
            // Summary chunks don't need additional metadata requirements
            console.log("Using summary chunks, no additional metadata requirements");
            break;
    }
}

/**
 * Enhanced location filter extraction with boolean flags
 */
function extractLocationFilter(query: string): Record<string, any> | null {
    const lowerQuery = query.toLowerCase();

    console.log("Extracting location filter from query:", query);

    const hasFirstFloor = lowerQuery.includes("first floor");

    const hasSecondFloor = lowerQuery.includes("second floor");

    if (hasFirstFloor) {
        //return { "metadata.isFirstFloor": "first" }; //prima era "true", ma a quanto pare l'indice FAISS non supporta filtri con valori booleani
        console.log("First floor detected");
        return { "metadata.floorLocation": "first" };

    }

    if (hasSecondFloor) {
        console.log("Second floor detected");
        return { "metadata.floorLocation": "second" };
    }

    console.log("No specific floor detected in query");
    return null;
}


//Versione analyzequery con getConfig
function analyzeQuery(query: string, config: DynamicFilterConfig): {

    matchedKeywords: string[],
    matchedCategories: number[],
    matchedVisualizationTypes: string[],
    matchedVisualizationCategories: string[],
    hasSpecificKeywords: boolean,
    hasLocationKeywords: boolean,
    hasGenericKeywords: boolean,
    hasAutomationKeywords: boolean,

} {//QueryAnalysis {
    const lowerQuery = query.toLowerCase();
    const dynamicConfig = getConfig();


    // Keyword matching, cerca un collegamento tra parole nella query e quelle che ho mappato in dynamicConfig
    const matchedKeywords = Object.keys(dynamicConfig.keywordMappings).filter(keyword =>
        lowerQuery.includes(keyword) ||
        config.keywordMappings[keyword].regexPatterns?.some(pattern => pattern.test(query)) ||
        config.keywordMappings[keyword].keyParams?.some(param => new RegExp(`\\b${param}\\b`, 'i').test(query))
    );

    //Se trova una parola stampa questo log
    if (matchedKeywords.length > 1) {
        console.log("Analysing the keywords in query, we found more than 1 possibly devices:", matchedKeywords);
    }


    //Extacts keywords lists from getConfig()
    const locationKeyWords = dynamicConfig.locationKeyWords || [];
    const automationKeywords = dynamicConfig.automationKeywords || [];
    const specificKeywords = dynamicConfig.specificKeywords || [];

    const genericKeywords = [
        // Richieste di NOME
        'name', 'nome', 'called', 'chiamato', 'denominato',
        'what is', 'come si chiama', 'qual è il nome', 'uuid',
        'uuids', 'UUID', 'UUIDs',
        // Richieste di QUANTITÀ
        'how many', 'quanti', 'number', 'numero',
        // Richieste di LISTA
        'list', 'elenco', 'lista', 'show all', 'mostra tutti',
        // Richieste di TIPO/CATEGORIA
        'type', 'tipo', 'category', 'categoria', 'kind', 'genere',
        // Richieste generiche
        'describe', 'descrivi', 'tell me about', 'dimmi qualcosa',
        'overview', 'panoramica', 'riassunto', 'summary',
        'basic', 'base', 'general', 'generale'
    ];

    // Query type detection
    const hasLocationKeywords = locationKeyWords.some(term =>
        lowerQuery.includes(term.toLowerCase())
    );

    const hasAutomationKeywords = automationKeywords.some(term =>
        lowerQuery.includes(term.toLowerCase())
    );

    const hasSpecificKeywords = specificKeywords.some(term =>
        lowerQuery.includes(term.toLowerCase())
    );
    const hasGenericKeywords = genericKeywords.some(term =>
        lowerQuery.includes(term.toLowerCase())
    );

    //Fino a qua top, determina che tipo di keywords matching per tipo di query




    //Funzione matchCategories ma che include più keywords trovate! Quindi più dispositivi richiesti dalla query!

    let matchedCategories: number[] = [];

    if (matchedKeywords.length > 1) {
        //Se ci sono più keywords, unisci tutte le categorie associate a una
        matchedCategories = matchedKeywords.flatMap(keyword => {
            const mapping = dynamicConfig.keywordMappings[keyword];
            return mapping?.categories || [];
        });

        //Rimuovo i duplicati(più categorie uguali trovate, ovverro 2 box-io = 0,0 ma ne basta 1 di zero) e converto ad int
        matchedCategories = Array.from(new Set(matchedCategories.map(c => parseInt(String(c))))).filter(cat => !isNaN(cat));//se c è una stringa o c è un number
    } else {
        //Comportamento come prima
        matchedCategories = Object.entries(DEVICE_CATEGORIES)
            .filter(([_, meta]) => {
                const hasKeyParamMatch = meta.keyParams?.some(param =>
                    new RegExp(`\\b${param}\\b`, 'i').test(query)
                );
                const hasCategoryMatch = new RegExp(`\\b${meta.name}\\b`, 'i').test(query);

                const hasConfigMatch = Object.entries(dynamicConfig.keywordMappings).some(([keyword, mapping]) => {
                    const matchesCategory = mapping.categories?.includes(parseInt(meta.name === 'controller' ? '0' : meta.name));
                    const matchesQuery = lowerQuery.includes(keyword) || mapping.regexPatterns?.some(pattern => pattern.test(query));
                    return matchesCategory && matchesQuery;
                });

                return hasKeyParamMatch || hasCategoryMatch || hasConfigMatch;
            })
            .map(([cat]) => parseInt(cat))
            .filter(cat => !isNaN(cat));
    }
    //Fin qua non se tocca niente




    /*
        meta.keyParams?.some(param => new RegExp(`\\b${param}\\b`, 'i').test(query)) ||
            new RegExp(`\\b${meta.name}\\b`, 'i').test(query)
    )*/


    // Visualization type matching
    const matchedVisualizationTypes = Object.keys(filterByVisualizationType)
        .filter(type => {

            const directMatch = new RegExp(`\\b${type}\\b`, 'i').test(query);

            //console.log("C'è directMatching?", (directMatch as unknown) as RegExp, type);

            //Search visualizationTypes in getConfig
            const configMatch = Object.values(dynamicConfig.keywordMappings).some(mapping =>
                mapping.visualizationType?.includes(type) &&
                mapping.regexPatterns?.some(pattern => pattern.test(query))
            );

            //console.log("C'è configMatch?", configMatch, type);

            return directMatch || configMatch;
        });

    const visualizationCategoryToTypes = Object.entries(filterByVisualizationType)
        .reduce((acc, [type, category]) => {
            if (!acc[category]) acc[category] = [];
            acc[category].push(type);
            return acc;
        }, {} as Record<string, string[]>);

    const matchedVisualizationCategories = Object.keys(visualizationCategoryToTypes)
        .filter(category => {
            const directMatch = new RegExp(`\\b${category}\\b`, 'i').test(query);

            //Search in visualizationCategories from getCOnfig()
            const configMatch = Object.values(dynamicConfig.keywordMappings).some(mapping =>
                mapping.visualizationCategories?.includes(category) &&
                mapping.regexPatterns?.some(pattern => pattern.test(query))
            );

            return directMatch || configMatch;
        });




    console.log(` Query Analysis Results:
            - Config Keywords Used: ${Object.keys(dynamicConfig.keywordMappings).filter(k => matchedKeywords.includes(k)).join(', ')}       
            - Matched Keywords: ${matchedKeywords.join(', ')}
            - Matched Categories: ${matchedCategories.join(', ')}
            - Location Query: ${hasLocationKeywords}
            - Automation Query: ${hasAutomationKeywords}
            - Specific Query: ${hasSpecificKeywords}
            - Generic Query: ${hasGenericKeywords}

           `);



    return {
        matchedKeywords,
        matchedCategories,
        matchedVisualizationTypes,
        matchedVisualizationCategories,
        hasSpecificKeywords,
        hasLocationKeywords,
        hasGenericKeywords,
        hasAutomationKeywords,
    };
}




/*            INTERESSANTE PER LIMITARE/FILTRARE SOLAMENTE I CHUNKS INTERESSATI NELLA QUERY MA FILTERING TROPPO RESTRITTIVO E 
            DIFFICILMENTE IMPLEMENTABILE. O MEGLIO IL FILTRO FAISS NON RIESCE A FILTRARE SE CI SONO PIÙ DISPOSITIVI TROVATI NELLA QUERY TRAMITE
            QUESTO FILTRO*/

function detectDeviceFromQuery(lowerQuery: string, config: DynamicFilterConfig): {
    name: string;
    category: number[];
    visualizationType: string[]; //| undefined;
}[] {

    const results: {
        name: string;
        category: number[];
        visualizationType: string[];
    }[] = [];

    let allCategories = new Set<number>();
    let allVisualizationTypes = new Set<string>();
    const deviceNames = new Set<string>();


    //Test for debugging regex patterns
    const testQuery = "show me the uuids of actuator, thermostat and controller";
    console.log(" EMERGENCY REGEX TEST:");
    console.log("  /controller/.test(query):", /controller/i.test(testQuery));
    console.log("  /thermostat/.test(query):", /thermostat/i.test(testQuery));
    console.log("  /actuator/.test(query):", /actuator/i.test(testQuery));

    // Test con i pattern esatti dal config
    const controllerPatterns = [/controller/i, /box.io/i, /dispositivo base/i, /hub/i, /gateway/i, /coordinatore/i];
    const thermostatPatterns = [/temperature/i, /thermostat/i, /termostato/i, /temperatura/i, /clima/i, /ambiente/i, /riscaldamento/i, /raffreddamento/i, /hvac/i, /\bthermostat\b/i, /\bsetpoint\b/i, /\btemperature setting\b/i, /\btemperature control\b/i];

    console.log(" CONTROLLER PATTERNS:");
    controllerPatterns.forEach((pattern, i) => {
        console.log(`  ${i + 1}. ${pattern} -> ${pattern.test(testQuery)}`);
    });

    console.log(" THERMOSTAT PATTERNS:");
    thermostatPatterns.forEach((pattern, i) => {
        console.log(`  ${i + 1}. ${pattern} -> ${pattern.test(testQuery)}`);
    });





    //Ciclo sui mapping delle keywords
    for (const [keyword, mapping] of Object.entries(config.keywordMappings)) {

        let matched = false;
        //Check1: La query contiene direttamente le keyword?
        if (lowerQuery.includes(keyword)) {
            matched = true;
            console.log("Direct keyword match", keyword);

        }

        //Chech2: la query matcha uno dei regexPatterns?
        if (!matched && mapping.regexPatterns) {
            for (const pattern of mapping.regexPatterns) {
                if (pattern.test(lowerQuery)) {
                    matched = true;
                    console.log(`✅ Regex pattern match: "${keyword}" via ${pattern}`);
                    break;
                }
            }
        }

        //Se abbiamo un match, restituisci i dati del dispositivo
        if (matched && mapping.categories && mapping.categories.length > 0) {

            console.log(`    ADDING ${mapping.categories.length} CATEGORIES FOR "${keyword}"`);
            mapping.categories.forEach(cat => allCategories.add(cat));

            if (mapping.visualizationType) {
                mapping.visualizationType.forEach(viz => allVisualizationTypes.add(viz));
            }

            //Accumula i nomi dei dispositivi
            deviceNames.add(keyword);

            console.log(`    Accumulated for "${keyword}":`, {
                categories: Array.from(mapping.categories),
                visualizationType: mapping.visualizationType || []
            });

            const result = {
                name: keyword,
                category: mapping.categories,
                visualizationType: mapping.visualizationType || []
            };

            console.log("Device detected:", result);
            results.push(result);

        } else if (matched) {
            console.log("Matched", keyword, "but no categories defined");
        } else {
            console.log("No match for keyword:", keyword);
        }

        /* //Creo l'output che contenga tutti i risultati
         const result = Array.from(deviceNames).map(name => ({
             name: name,
             //category: Array.isArray(allCategories),
             category: category,
             allVisualizationTypes: Array.isArray(allVisualizationTypes)
         })); */





        /*for (const category of mapping.categories) {
            const result = {
                name: keyword,
                category, //mapping.categories[0], //Not undefined
                visualizationType: mapping.visualizationTypes || []
            };
     
            console.log("Device detected:", result);
     
            results.push(result);
        }
    } else if (matched) {
        console.log("Matched", keyword, "but not categories defined");
     
    } else {
        console.log("No match for keyword:", keyword);
    }*/


    }


    console.log(`\n FINAL DETECTED DEVICES: ${results.length}`);
    console.log(`    TOTAL CATEGORIES: ${Array.from(allCategories).join(', ')}`);
    console.log(`    TOTAL VIZ TYPES: ${Array.from(allVisualizationTypes).join(', ')}`);

    results.forEach((r, i) => console.log(`   ${i + 1}. ${r.name} (all cats: ${r.category}, all viz: ${r.visualizationType.join(', ')})`));

    return results;

}



// Example filter for visualizationType
export const filterByVisualizationType = {
    'BOXIO': 'controller',
    'WS558': 'smart_light',
    'SMABIT_AV2010_32': 'thermostat',
    'LED_DRIVER': 'smart_light',
    'EASTRON_SDM630': 'energy_meter',
    'GEWISS_GWA1531': 'actuator',
    'VAYYAR_CARE': 'sensor'
}


/**
 * Analizza semanticamente la query per determinare il tipo più appropriato
 * basandosi su pattern di parole chiave
 */

function analyzeQuerySemantics(query: string): {
    queryType: 'generic' | 'specific' | 'location' | 'automation',
    reason: string,
    confidence: number
} {
    const lowerQuery = query.toLowerCase();
    let score = 0;
    const reasons: string[] = [];

    //1. Rileva query di location
    const locationKeyWords = [
        'first floor', 'second floor', 'ground floor', 'terzo piano', 'quartò piano',
        'primo piano', 'secondo piano', 'piano terra',
        'floor 1', 'floor 2', 'piano 1', 'piano 2',
        'north area', 'south area', 'east area', 'west area',
        'area nord', 'area sud', 'area est', 'area ovest',
        'partition', 'zona', 'settore', 'location', 'posizione',
        'dove', 'where', 'ubicazione'
    ];

    const locationMatches = locationKeyWords.filter(keyword =>
        lowerQuery.includes(keyword)
    ).length;

    if (locationMatches > 0) {
        score += locationMatches * 10;
        reasons.push(`Trovate ${locationMatches} parole di localizzazione`);

    }

    const automationKeywords = [
        'automation', 'automatism', 'automazione', 'scenario', 'scena',
        'turn on', 'turn off', 'accendi', 'spegni',
        'set temperature', 'imposta temperatura', 'configure', 'configura',
        'when', 'if', 'quando', 'se', 'then', 'allora',
        'schedule', 'programma', 'trigger', 'azione', 'action',
        'activate', 'disattiva', 'enable', 'disable'
    ];

    const automationMatches = automationKeywords.filter(keyword =>
        lowerQuery.includes(keyword)
    ).length;

    if (automationMatches > 0) {
        score += automationMatches * 8;
        reasons.push(`Trovate ${automationMatches} parole di automazione`);
    }

    //3.=============== Rileva QUERY SPECIFICHE/TECNICHE ============
    const specificKeywords = [
        // Parametri tecnici
        'parameter', 'parametro', 'configuration', 'configurazione', 'setting',
        'technical', 'tecnico', 'detail', 'dettaglio', 'specific',
        // Dettagli firmware/versioni
        'firmware', 'version', 'versione', 'bsp', 'software',
        'mac address', 'indirizzo mac', 'serial number',
        // Valori e misurazioni
        'value', 'valore', 'measurement', 'misura', 'reading', 'lettura',
        'temperature', 'temperatura', 'power', 'potenza', 'voltage', 'tensione',
        // Comandi tecnici
        'command', 'comando', 'operation', 'operazione', 'control', 'controllo'
    ];

    const specificMatches = specificKeywords.filter(keyword =>
        lowerQuery.includes(keyword)
    ).length;

    if (specificMatches > 0) {
        score += specificMatches * 6;
        reasons.push(`Trovate ${specificMatches} parole tecniche specifiche`);
    }

    // === 4. RILEVA QUERY GENERICHE (informazioni base) ===
    const genericKeywords = [
        // Richieste di NOME
        'name', 'nome', 'called', 'chiamato', 'denominato',
        'what is', 'come si chiama', 'qual è il nome',
        // Richieste di QUANTITÀ
        'how many', 'quanti', 'number', 'numero',
        // Richieste di LISTA
        'list', 'elenco', 'lista', 'show all', 'mostra tutti',
        // Richieste di TIPO/CATEGORIA
        'type', 'tipo', 'category', 'categoria', 'kind', 'genere',
        // Richieste generiche
        'describe', 'descrivi', 'tell me about', 'dimmi qualcosa',
        'overview', 'panoramica', 'riassunto', 'summary',
        'basic', 'base', 'general', 'generale', 'devices', 'dispositivi'
    ];

    const genericMatches = genericKeywords.filter(keyword =>
        lowerQuery.includes(keyword)
    ).length;

    if (genericMatches > 0) {
        score += genericMatches * 4;
        reasons.push(`Trovate ${genericMatches} parole generiche`);
    }

    // === 5. DETERMINA IL TIPO IN BASE AI PUNTEGGI ===
    const thresholds = {
        location: 5,
        automation: 5,
        specific: 4,
        generic: 3
    };

    // Priorità in ordine di importanza
    if (locationMatches >= thresholds.location) {
        return {
            queryType: 'location',
            reason: `Query di localizzazione: ${reasons.join(', ')}`,
            confidence: Math.min(100, (locationMatches / thresholds.location) * 100)
        };
    }

    if (automationMatches >= thresholds.automation) {
        return {
            queryType: 'automation',
            reason: `Query di automazione: ${reasons.join(', ')}`,
            confidence: Math.min(100, (automationMatches / thresholds.automation) * 100)
        };
    }

    if (specificMatches >= thresholds.specific) {
        return {
            queryType: 'specific',
            reason: `Query specifica/tecnica: ${reasons.join(', ')}`,
            confidence: Math.min(100, (specificMatches / thresholds.specific) * 100)
        };
    }

    // DEFAULT: Query generica (come "nome del dispositivo")
    return {
        queryType: 'generic',
        reason: `Query generica: ${reasons.join(', ')} o default`,
        confidence: Math.max(30, Math.min(100, (genericMatches / thresholds.generic) * 100))
    };
}

/**
 * Simplified FAISS validation for single document type
 */
function validateForFaiss(filter: Record<string, any>): Record<string, any> {
    const validated: Record<string, any> = {};

    console.log("Validating filter for FAISS compatibility...");

    // Always ensure we have the document type
    validated["metadata.type"] = "installation-config";

    // Check if this is a location query
    const isLocationQuery = filter["metadata.isFirstFloor"] || filter["metadata.isSecondFloor"];

    for (const [key, value] of Object.entries(filter)) {
        if (key === "metadata.type") continue; // Already handled
        if (value === null || value === undefined) {
            console.warn('Skipping null/undefined value for', key);
            continue;
        }

        // Handle primitive values
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            validated[key] = value;
            console.log(`Added: ${key} = ${value}`);
            continue;
        }

        // Handle arrays (use first element only)
        if (Array.isArray(value)) {
            if (value.length > 0) {
                const validValues = value.filter(v =>
                    v !== null && v !== undefined &&
                    (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
                );

                if (validValues.length > 0) {
                    //validated[key] = validValues[0];
                    //console.log(`Array simplified: ${key} = ${validValues[0]}`);
                    validated[key] = validValues;
                    console.log(`Array simplified: ${key} = ${validValues}`);

                    if (validValues.length > 1) {
                        console.warn(`FAISS limitation: Using only first value from array for ${key}`);
                    }
                }
            }
            continue;
        }


        // Handle complex objects
        if (typeof value === 'object') {
            console.warn(`Complex object ignored for ${key}:`, value);
            continue;
        }

        console.warn(`Unsupported value type for ${key}:`, typeof value);
    }



    console.log(`Filter validation completed. ${Object.keys(validated).length} properties retained.`);
    return validated;
}

/**
 * Default filter fallback
 */
function getDefaultFilter(): Record<string, any> {
    return {
        "metadata.type": "installation-config",
        "metadata.chunkType": "summary"
    };
}

/**
 * Handles category filtering logic
 */
/*function handleCategoryFilters(
    analysis: QueryAnalysis,
    filter: Record<string, any>,
    queryType: string
): void {

    // For location queries, categories are secondary
    const isLocationQuery = queryType === 'location';

    // Direct category matches
    if (analysis.matchedCategories.length === 1) {
        filter["metadata.category"] = analysis.matchedCategories[0];
        console.log(`Category filter applied: ${analysis.matchedCategories[0]} ${isLocationQuery ? '(secondary to location)' : ''}`);
    } else if (analysis.matchedCategories.length > 1) {
        // For location queries, still try to use first category as it might be relevant
        if (isLocationQuery) {
            filter["metadata.category"] = analysis.matchedCategories[0];
            console.log(`Multiple categories for location query, using first: ${analysis.matchedCategories[0]}`);
        } else {
            console.log(`Multiple categories matched (${analysis.matchedCategories.join(', ')}), omitting category filter to avoid data loss`);
        }
    }

    // Keyword-based category mapping (only for non-location queries without direct matches)
    if (!isLocationQuery && analysis.matchedKeywords.length > 0 && !filter["metadata.category"]) {
        const firstKeyword = analysis.matchedKeywords[0];
        const keywordConfig = getConfig().keywordMappings[firstKeyword];

        if (keywordConfig?.categories?.length) {
            filter["metadata.category"] = keywordConfig.categories[0];
            console.log(`Category from keyword mapping: ${filter["metadata.category"]}`);
        }
    }
}*/




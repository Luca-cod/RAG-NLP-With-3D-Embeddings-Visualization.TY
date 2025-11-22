import { createDynamicFilter } from "./AdaptiveRecoveryWithDeviceFilter copy.js"
import { Document as LangChainDocument } from "langchain/document";

/*
Post-Processing
Perché è necessaria?
- Anche con un contesto ben formattato, il modello potrebbe non menzionare tutti i parametri rilevanti.
- Il post-processing funge da rete di sicurezza per evidenziare omissioni critiche.
- Il post-processing utilizza i `docs` originali (quelli recuperati dal retriever) che sono già disponibili nella funzione `createRagChain`.
- Non richiede modifiche ai moduli esistenti, solo un'estensione della catena.


Scopo Principale

Rilevare e correggere omissioni critiche nelle risposte generate dal modello LLM.

Problemi che risolve:

    Modelli LLM sometimes "hallucinate" - dimenticano informazioni presenti nel contesto

    Prioritizzazione errata - il modello potrebbe omettere dettagli importanti

    Risposte generiche - quando il modello non sfrutta appieno il contesto fornito
*/

/**
 * Post-Processing Dinamico
 */

interface ChunkContent {
    type: string;
    chunkType: string;
    endpoint?: {
        name: string;
        uuid?: number;
        parameters?: Array<{
            name: string;
            unit?: string;
            operation?: { type: string };
            dataType?: number;
            logType?: number;
        }>;
    };
    areas?: {
        name: string;
    };
    parameters?: Array<{
        name: string;
        unit?: string;
        operation?: { type: string };
        dataType?: number;
        logType?: number;
    }>;
    // installation?: any;
    parameterData?: any;
    searchableText?: string;
}

function checkRepetitiveness(response: string): boolean {
    const sentences = response.split(/[.!?]+/).filter(s => s.trim());
    const uniqueSentences = [...new Set(sentences.map(s => s.trim()))];
    return uniqueSentences.length / sentences.length < 0.7;
}

export function postProcessing(
    response: any,
    query: string,
    docs: LangChainDocument[],
    //  vectorStore: any
): string {

    console.log(query);

    let responseText: string;
    if (typeof response === "string") {
        try {
            const parsed = JSON.parse(response);
            responseText = parsed.text || parsed.response || response;
        } catch {
            responseText = response;
        }
    } else if (response && typeof response.text === "string") {
        responseText = response.text;
    } else {
        responseText = JSON.stringify(response);
    }

    if (checkRepetitiveness(responseText)) {
        return "Mi dispiace, non ho informazioni specifiche su questo argomento.";
    }

    const queryKeywords = extractKeywords(query); //vectorStore);
    const relevantParams = findRelevantParams(docs, queryKeywords);
    const missingParams = relevantParams.filter(param =>
        !isParamMentioned(responseText, param)
    );

    if (missingParams.length > 0 && missingParams.length / relevantParams.length > 0.3) {
        return `${responseText}\n\n${createMissingParamsNote(missingParams)}`;
    }
    return responseText;
}

function extractKeywords(query: string): string[] {//, vectorStore: any

    if (!query || typeof query !== 'string') {
        console.warn("Invalid query provided to extractKeywords");
        console.log(query);
        return [];
    }
    // Usa la stessa logica di createDynamicFilter per estrarre keywords rilevanti
    const filter = createDynamicFilter(query);

    const keywords: string[] = [];
    const lowerQuery = query.toLowerCase();

    // Estrai parole chiave dal query
    lowerQuery.split(/[\s,\-;:.!?]+/)
        .filter(word => word.length > 3)
        .forEach(word => keywords.push(word));

    // Estrai valori significativi dal filter
    Object.entries(filter).forEach(([key, value]) => {
        if (typeof value === 'string') { //&& value.size > 3) {
            keywords.push(value);
        }
    });

    return [...new Set(keywords)];
}

function findRelevantParams(docs: LangChainDocument[], keywords: string[]): string[] {
    const relevantParams = new Set<string>();

    if (!docs || !Array.isArray(docs)) {
        console.error("Documenti non validi");
        return [];
    }

    docs.forEach(doc => {
        if (!doc?.pageContent) return;

        try {
            const content = JSON.parse(doc.pageContent) as ChunkContent;

            // Cerca parametri in base al tipo di chunk
            if (content.chunkType === 'detail' && content.endpoint?.parameters) {
                content.endpoint.parameters.forEach(param => {
                    if (isParamRelevant(param, keywords)) {
                        relevantParams.add(param.name);
                    }
                });
            }
            else if (content.parameters) {
                // Per altri chunk types che potrebbero avere parametri
                content.parameters.forEach(param => {
                    if (isParamRelevant(param, keywords)) {
                        relevantParams.add(param.name);
                    }
                });
            }

        } catch (e) {
            console.error("Error parsing document content:", e);
        }
    });

    return Array.from(relevantParams);
}

function isParamRelevant(param: any, keywords: string[]): boolean {
    const paramName = param.name?.toLowerCase() || '';

    return keywords.some(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        return paramName.includes(lowerKeyword) ||
            param.unit?.toLowerCase().includes(lowerKeyword) ||
            param.operation?.type?.toLowerCase().includes(lowerKeyword);
    });
}

function isParamMentioned(response: string, param: string): boolean {
    return new RegExp(`\\b${param}\\b`, 'i').test(response);
}

function createMissingParamsNote(params: string[]): string {
    if (params.length === 0) return '';

    return `NOTA: I seguenti parametri rilevanti non sono stati menzionati:\n- ${params.join("\n- ")}\n\nQuesti parametri potrebbero essere utili per la tua richiesta.`;
}
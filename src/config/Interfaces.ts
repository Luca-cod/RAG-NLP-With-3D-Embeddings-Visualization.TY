import { Document as LangChainDocument } from "langchain/document";




//=================== INTERFACCE PRINCIPALI ========================================



export interface ExtendDocument extends LangChainDocument {
    metadata: EndpointMetadata,
    readableText?: string; //opzionale per testo leggibile
    automationConfig?: AutomationConfig; //L'automatismo configurato con tutti i suoi dettagli
    //È il campo principale che sostituisce il vecchio campo pageContent, e contiene tutta la configurazione 
    // dell'automatismo, come definito nell'interfaccia AutomationConfig.

}


export type DocumentType = 'installation-config';
export type ChunkType = "summary" | "detail" | "area" | "fallback";

export interface EndpointMetadata {
    //Metadata di base
    source: string;  //Source file name
    loc: string;  //Full file path
    type: DocumentType // Type document
    isValid: boolean;
    timestamp: string;
    chunkType: ChunkType,  // Chunks type (summary, detail, area, fallback)

    //Dati endpoint OBBLIGATORI
    uuid?: string,   //device uuid
    name?: string,   //decvice name
    category?: number,    //category (0, 15, 11,18)
    visualizationType?: string,  //Visualization type(BOXIO, VAYYAR_CARE, etc)

    //Dati OPZIONALI
    categoryName?: string,    //Category name mapped
    partitions?: string[],    //UUID of associated partitions
    location?: string[],
    areaNames?: string[], //Areas names
    areaUuids?: string[], //UUID of the areas   
    id?: string,
    parametersCount?: number,  //Parameters number  
    defaultParameter?: string,  //Parametro predefinito


    // ========================================
    // METADATI SPECIFICI PER TWO-STAGE CHUNKS
    // ========================================
    isPrimaryChunk?: boolean,
    chunkStrategy?: 'two_stage' | 'standard';  // identifies the chunking strategy used


    parameterStartIndex?: number,
    parameterEndIndex?: number,
    totalParameters?: number,

    visualizationCategory?: string;  // Mapped View Category

    deviceType: string,
    globalPartitionMapArray?: Array<[string, string]>;


    // Flags per il filtering
    hasAreaInfo?: boolean;
    hasEndpoints?: boolean;
    hasConfiguration?: boolean;
    hasControlParams?: boolean;
    isFirstFloor?: string;
    isSecondFloor?: string;

    // Per area chunks
    areaName?: string;
    areaUuid?: string;
    areaIndex?: number;
    devicesCount?: number;
    floorName?: string;
    deviceTypes?: string[];
    deviceCategories?: number[];
    partitionNames?: string[];
    partitionIds?: string[];

    // Per detail chunks
    isSensor?: boolean;
    isActuator?: boolean;
    isController?: boolean;
    hasMeasurementParameters?: boolean;
    hasEnumerationParameters?: boolean;
    hasConfigParameters?: boolean;
    parameterUnits?: string[];
    parameterDataTypes?: string[];

    // Per splitting
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

    //revision?: string;
    //major?: number;
    //minor?: number;

    totalEndpoints?: number;
    totalAreas?: number;
    hasPartitions?: boolean; //Indicates whether the document has partitions
    installationName?: string;
    revision?: string,
    minor?: number;
    major?: number;

    [key: string]: any;

    sequenceNumberMetadata?: SeqMetadata;   //---> VIENE CALCOLATO DURANTE LO SPLITTING, COME FACCIO A DEFINIRLO QUA NELLA CREAZIONE DEI CHUNKS
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

// NUOVE INTERFACCE PER MIGLIORARE LA MAPPATURA
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




//Interfacce utili per la domotica(ovvero modifica di valori del documento caricato per azionare i dispositivi).

export interface DocumentMetadata {
    // Metadati comuni a tutti i documenti
    source: string;
    loc: string;
    type: 'installation-config' | 'endpoint' | 'area' | 'fallback' | string;
    isValid: boolean;
    timestamp: string;

    // Metadati specifici per endpoint
    uuid?: string;
    name?: string;
    category?: number;
    categoryName?: string;
    isSensor?: boolean;
    visualizationType?: string;
    partitions?: string[];
    parametersCount?: number;
    defaultParameter?: string;

    // Metadati specifici per installation-config
    installationName?: string;
    revision?: string;

}


export interface EndpointSummary {
    uuid: string,
    name: string,
    categoria: string, // Categoria semantica (controller, sensor, actuator)
    location: string,
    configurableParams: string[],
    monitoringParams: string[]
}


export interface StructuredContext {
    metadata: {
        installationName: string;
        revision: string;
    };
    endpoints: EndpointSummary[]; // Lista semplificata di endpoint
    statistics: {
        totalEndpoints: number;
        totalConfigurableParams: number;
    };
}

export interface AutomationConfig {
    manifest: {
        uuid: string;
        name: string;
        description?: string;
        installationUuid: string;
    };
    cron?: {
        expressions: string[];
    };
    inputs: Input[];
    condition: Condition;
    actions: Action[];
    readableText?: string;
}
//Tipi per gli input
type Input = DomoticInput | HealthInput | EventInput;

//Tipi per le azioni
type Action = SetDomoticAction | SendNotificationAction | TriggerAlarmAction;

//Tipi per le condizioni
type Condition = LogicalCondition | ComparisonCondition | TemporalCondition | CronCondition | TriggerCondition | ValueChangeCondition;

// Input interfaces
interface DomoticInput {
    type: "DOMOTIC_PARAMETER";
    source: {
        parameterName: string;
        boxioId: string;
        endpointUuid: string;
    };
}

interface HealthInput {
    type: "HEALTH_PARAMETER";
    source: {
        parameterName: string;
        userId: number;
    };
}

interface EventInput {
    type: "EVENT";
    source: {
        eventType: string;
    };
}

// Action interfaces
interface SetDomoticAction {
    uuid: string;
    type: "SET_DOMOTIC_PARAMETER_VALUE";
    parameter: {
        name: string;
        boxioId: string;
        endpointUuid: string;
    };
    value: string | number | boolean;
}

interface SendNotificationAction {
    uuid: string;
    type: "SEND_NOTIFICATION";
    userIds: number[];
    platforms: ("EMAIL" | "PUSH")[];
    notification: {
        title: string;
        message: string;
    };
}

interface TriggerAlarmAction {
    uuid: string;
    type: "TRIGGER_ALARM";
    userIds: number[];
    alarm: {
        name: string;
        description: string;
        shouldRepeat: boolean;
        repeatInterval: number;
    };
    notification: {
        title: string;
        message: string;
    };
}

// Condition interfaces
interface BaseCondition {
    uuid: string;
    operator: ConditionOperator;
}

type ConditionOperator =
    | "AND"
    | "OR"
    | "GREATER_THAN"
    | "GREATER_THAN_OR_EQUAL"
    | "LESS_THAN"
    | "LESS_THAN_OR_EQUAL"
    | "EQUAL"
    | "MAINTAINED_FOR_SECONDS"
    | "HAS_CHANGED_VALUE"
    | "CRON"
    | "TRIGGER";

interface LogicalCondition extends BaseCondition {
    operator: "AND" | "OR";
    operands: Condition[];
}

interface ComparisonCondition extends BaseCondition {
    operator: "GREATER_THAN" | "GREATER_THAN_OR_EQUAL" | "LESS_THAN" | "LESS_THAN_OR_EQUAL" | "EQUAL";
    operand1: string;
    operand2: string;
}

interface TemporalCondition extends BaseCondition {
    operator: "MAINTAINED_FOR_SECONDS";
    seconds: number;
    condition: Condition;
}

interface CronCondition extends BaseCondition {
    operator: "CRON";
    expressions: string[];
}

interface TriggerCondition extends BaseCondition {
    operator: "TRIGGER";
    operand1: string;
    match: Record<string, unknown>;
}

interface ValueChangeCondition extends BaseCondition {
    operator: "HAS_CHANGED_VALUE";
    operand1: string;
}


//Interfaccia per Parser
// File: types/input.ts
export interface AutomatismContext {
    structure: {
        areas: Area[];
        endpoints: Endpoint[];
    };
    automatism: {
        actions: AutomatismAction[];
        complexRules: ComplexRule[];
        enableAlarms: boolean;
        enableRules: boolean;
        enableScenes: boolean;
    };
    metadata: {
        revision: string;
        structureId: string;
        major: number;
        minor: number;
        name?: string;
    };
}

export interface Area {
    uuid: string;
    name: string;
    partitions: Partition[];
    latitude?: number;
    longitude?: number;
}

interface Partition {
    uuid: string;
    name: string;
}

export interface Endpoint {
    uuid: string;
    name: string;
    category: number;
    parameters: Parameter[];
    partitions: string[];
    visualizationType?: string;
}

export interface Parameter {
    name: string;
    dataType: number;
    unit?: string;
    defaultValue?: string | number | boolean;
    operation?: {
        type: string;
        [key: string]: any;
    }
}

interface AutomatismAction {
    uuid: string;
    name: string;
    operations: Operation[];
    isScene?: boolean;
}

interface Operation {
    parameter: {
        endpoint: string;
        parameter: string;
    };
    value: string;
}

interface ComplexRule {
    uuid: string;
    name: string;
    rules: Condition[]; // Puoi definire un tipo più specifico se necessario
    template?: string;
}

interface RagResponse {
    query: string;
    response: AutomationConfig | string;
    timestamp: string;
    context?: string[];
    validation?: {
        valid: boolean;
        errors?: string[];
    }
}

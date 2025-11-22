import { DynamicFilterConfig } from "./AdaptiveRecoveryWithDeviceFilter copy.js";

export function getConfig(): DynamicFilterConfig {
    return {
        keywordMappings: {
            controller: {
                categories: [0, 15],
                visualizationType: ['BOXIO', 'WS558'],
                visualizationCategories: ['controller'],
                regexPatterns: [/controller/i, /box.io/i, /dispositivo base/i, /hub/i, /gateway/i, /coordinatore/i],
                keyParams: ["abilita_connessione", "firmware_version", "bsp_version", "mac_address", "voltage", "active_power"],

            },
            thermostat: {
                categories: [0],
                visualizationType: ['SMABIT_AV2010_32'],
                visualizationCategories: ['thermostat'],
                regexPatterns: [/temperature/i, /thermostat/i, /termostato/i, /temperatura/i, /clima/i, /ambiente/i, /riscaldamento/i, /raffreddamento/i, /hvac/i,
                    /\bthermostat\b/i, /\bsetpoint\b/i, /\btemperature setting\b/i, /\btemperature control\b/i],
                //metadataFields: ["visualizationType", "parameters", "name"],
                keyParams: ["temperatura", "setpoint", "system_mode"]
            },
            actuator: {
                categories: [11],
                visualizationType: ['GEWISS_GWA1531'],
                visualizationCategories: ['actuator'],
                regexPatterns: [/attuatore/i, /actuator/i, /gewiss/i, /comando/i, /controllo/i, /window/i, /covering/i, /\btapparella\b/i, /\bserranda\b/i],
                keyParams: ["window_covering_percentage", "window_covering_command_up"]
            },

            /*  ambientali: {
                  categories: [0, 18],
                  regexPatterns: [/temperature/i, /thermostat/i, /clima/i, /ambiente/i, /riscaldamento/i, /raffreddamento/i],
                  metadataFields: ["visualizationType", "parameters", "name"],
                  keyParams: ["temperatura", "setpoint"]
              },*/

            // Smart Light Controller (WS558) 
            luci: {
                categories: [15],
                visualizationType: ['WS558'],
                visualizationCategories: ['smart_light'],
                regexPatterns: [/(?<!\w)light(?!\w)/i, /illuminazione/i, /lampada/i, /luminosità/i, /luce/i, /luci/i, /accensione/i],
                keyParams: ["livello", "accensione", "line_1", "line_2", "line_3", "voltage", "active_power"]
            },

            // LED Driver (Line 1 lights)
            led: {
                categories: [0, 15], // ATTENZIONE: Nel JSON è category: 0!
                visualizationType: ['LED_DRIVER'],
                visualizationCategories: ['smart_light'],
                regexPatterns: [/\bled\b/i, /\bled driver\b/i, /\bline 1 lights\b/i],
                keyParams: ["accensione", "livello"],
            },

            //Energy Meter (EASTRON_SDM630)
            energy: {
                categories: [11],
                visualizationType: ['EASTRON_SDM630'],
                visualizationCategories: ['energy_meter'],
                regexPatterns: [/energy/i, /power/i, /consumo/i, /watt/i, /volt/i, /elettricità/i],
                keyParams: ["active_power", "power_consumption", "voltage"]
            },
            sensor: {
                categories: [18],
                visualizationType: ['VAYYAR_CARE'],
                visualizationCategories: ['sensor'],
                regexPatterns: [/sicurezza/i, /security/i, /caduta/i, /fall/i, /allarme/i, /presenza/i, /movimento/i, /sensor/i, /power/i, /measurement/i,
                    /energy/i, /meter/i
                ],
                keyParams: ["fall", "monitoraggio", "monitoring", "voltage", 'active_power', "temperature"]
            },
            /* sensori: {
                 categories: [18, 1, 11], // Includes thermostats and energy meter
                 visualizationCategories: ['sensor', 'thermostat'],
                 regexPatterns: [/sensor/i, /thermostat/i, /temperature/i],
                 keyParams: ["temperature", "fall", "voltage"],// Parametri tipici di sensori
                 metadataFields: ["deviceType", "hasMeasurementParams"]
             },*/
            automazioni: {
                regexPatterns: [  //dovrebbero essere tutti verbi
                    /automazione/i, /automatism/i, /scenario/i, /scena/i,
                    /automatico/i, /trigger/i, /condizione/i, /azione/i,
                    /quando.*allora/i, /if.*then/i, /se.*allora/i,
                    /programma/i, /schedulazione/i
                ],
                metadataFields: ["parameters", "operations", "hasControlParams"],
                keyParams: ["switch", "button", "command", "setpoint", "mode"]
            }
        },

        // === LOCATION-SPECIFIC KEYWORDS (very specific) ===
        locationKeyWords: [
            'first floor', 'primo piano', 'piano terra', 'ground floor',
            'second floor', 'secondo piano',
            'floor 1', 'floor 2', 'piano 1', 'piano 2',
            'area nord', 'area sud', 'area est', 'area ovest',
            'north area', 'south area', 'east area', 'west area',
            'partition', 'zona', 'settore'
        ],

        // === AUTOMATION-SPECIFIC KEYWORDS (actions and commands) ===
        automationKeywords: [
            // Real automation terms
            'automazione', 'automatism', 'scenario', 'scena',
            'trigger', 'schedulazione', 'programming', 'programma',

            // Device actions - very specific to automation
            'turn on', 'turn off', 'accendi', 'spegni',
            'set temperature', 'imposta temperatura',
            'open window', 'close window', 'apri finestra', 'chiudi finestra',
            'dim lights', 'abbassa luci', 'increase brightness',
            'activate', 'disattiva', 'enable', 'disable',

            // Conditional logic - specific patterns
            'when temperature', 'quando temperatura',
            'if motion', 'se movimento',
            'after sunset', 'dopo tramonto',
            'before sunrise', 'prima alba',
            'schedule at', 'programma alle',

            // Command sequences
            'execute command', 'esegui comando',
            'run scenario', 'avvia scenario',
            'stop automation', 'ferma automazione'
        ],

        // === TECHNICAL/SPECIFIC KEYWORDS ===
        specificKeywords: [/*
            'uuid', 'device id', 'endpoint id',
            'parameters', 'parametri', 'configuration', 'configurazione',
            'firmware version', 'versione firmware',
            'device details', 'dettagli dispositivo',
            'technical info', 'informazioni tecniche',
            'specifications', 'specifiche',
            'metadata', 'properties', 'proprietà', 'value', 'temperature', 'setpoint'*/


            // Identificatori tecnici
            //'uuid', 'device id', 'endpoint id',
            //'device id', 'endpoint id',

            // Configurazioni e parametri
            'parameters', 'parametri', 'configuration', 'configurazione',
            'setting', 'impostazione', 'default', 'predefinito',
            'setpoint', 'value', 'valore', 'measurement', 'misura',

            // Informazioni firmware/software
            'firmware version', 'versione firmware', 'software version',
            'bsp version', 'mac address', 'serial number',

            // Dettagli tecnici
            'device details', 'dettagli dispositivo', 'technical info',
            'informazioni tecniche', 'specifications', 'specifiche',
            'metadata', 'properties', 'proprietà',

            // Parametri specifici di dispositivi
            'temperature', 'temperatura', 'voltage', 'tensione',
            'current', 'corrente', 'power', 'potenza', 'energy', 'energia',
            'calibration', 'calibrazione', 'mode', 'modalità',

            // Comandi e controlli
            'command', 'comando', 'control', 'controllo', 'operation', 'operazione'
        ],

        defaultResponse: {
            categories: [],
            examples: ["Specify your search better"]
        }

    };
}

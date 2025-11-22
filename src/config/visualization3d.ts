
//import * as Plotly from 'plotly.js-dist-min';
import { config } from "../config/RAG.js";
import { promises as fs } from "fs";
import path from "path";

export async function create3DVisualization(
    reduceVectors: number[][],
    query: string,
    topK: number = 3): Promise<void> {

    console.log("Creating 3D visualization...");

    //Crate the folder for the visualization if its not existed
    await fs.mkdir(config.visualizationPath, { recursive: true });

    //Prepare the dates for all the points (grey)
    const allX = reduceVectors.slice(1).map(v => v[0]);
    const allY = reduceVectors.slice(1).map(v => v[1]);
    const allZ = reduceVectors.slice(1).map(v => v[2]);

    //Trace per tutti i punti (grigio)
    const allPointsTrace: any = {
        x: allX,
        y: allY,
        z: allZ,
        mode: 'markers',
        type: 'scatter3d',
        name: 'All Documents',
        marker: {
            size: 5,
            color: 'grey',
            opacity: 0.5,
            line: {
                color: 'ligthgray',
                width: 1
            }
        },
        text: Array.from({ length: allX.length }, (_, i) => `Document ${i + 1}`),
        hoverInfo: 'text'
    };

    //Trace per la query (rosso)
    const queryTrace: any = {
        x: [reduceVectors[0][0]],
        y: [reduceVectors[0][1]],
        z: [reduceVectors[0][2]],
        mode: 'markers',
        type: 'scatter3d',
        name: 'Query',
        marker: {
            size: 10,
            color: 'red',
            opacity: 0.9,
            symbol: 'diamond',
            line: {
                color: 'darkred',
                width: 2
            }
        },
        text: ['Query: ' + query],
        hoverinfo: 'text'
    };

    //Trace per i top K documenti(blu)
    const topKX = reduceVectors.slice(1, topK + 1).map(v => v[0]);
    const topKY = reduceVectors.slice(1, topK + 1).map(v => v[1]);
    const topKZ = reduceVectors.slice(1, topK + 1).map(v => v[2]);


    const topKTrace: any = {
        x: topKX,
        y: topKY,
        z: topKZ,
        mode: 'markers',
        type: 'scatter3d',
        name: `Top ${topK} Documents`,
        marker: {
            size: 8,
            color: 'blue',
            opacity: 0.9,
            line: {
                color: 'darkblue',
                width: 2
            }
        },
        text: Array.from({ length: topK }, (_, i) => `Top ${i + 1} Document`),
        hoverinfo: 'text'
    };

    //Layout 
    const layout = {
        title: {
            text: `3D Embeddings Visualization (t-SNE, Perplexity=${config.visualization.perplexity})`,
            font: { size: 18 },

        },
        scene: {
            xaxis: { title: 'Dimension 1' },
            yaxis: { title: 'Dimension 2' },
            zaxis: { title: 'Dimension3' }
        },
        showlegend: true,
        legend: {
            x: 0,
            y: 1,
        },
        width: 1200,
        heigth: 800
    };
    // Crea l'HTML

    const traces = [allPointsTrace, topKTrace, queryTrace];

    //    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Embeddings Visualization - RAG System</title>
    <!-- Plotly.js from CDN -->
    <script src="https://cdn.plot.ly/plotly-2.27.1.min.js" integrity="sha384-VKw8eVLKKnZQd2yCLHrJ6g4E6KEg5QaQc7hqvUbcJbG8sD2hk0kF4fH5d5UQlQJ0" crossorigin="anonymous"></script>

     <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        
        h1 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 2em;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .info {
            color: #555;
            margin-bottom: 25px;
            padding: 20px;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-left: 5px solid #667eea;
            border-radius: 8px;
            line-height: 1.8;
        }
        
        .info strong {
            color: #2c3e50;
            font-weight: 600;
        }
        
        .info-item {
            margin: 8px 0;
        }
        
        #plot {
            margin-top: 20px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .legend {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 8px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 2px solid #333;
        }
        
        .legend-color.query { background-color: red; }
        .legend-color.top { background-color: blue; }
        .legend-color.other { background-color: grey; }
        
        .footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 0.9em;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 15px;
            }
            
            h1 {
                font-size: 1.5em;
            }
            
            .legend {
                flex-direction: column;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎨 RAG Embeddings - 3D Visualization</h1>
        
        <div class="info">
            <div class="info-item"><strong>📝 Query:</strong> ${query}</div>
            <div class="info-item"><strong>📊 Total Documents:</strong> ${reduceVectors.length - 1}</div>
            <div class="info-item"><strong>🔬 Dimensionality Reduction:</strong> t-SNE (768D → 3D)</div>
            <div class="info-item"><strong>⚙️ t-SNE Perplexity:</strong> ${config.visualization.perplexity}</div>
            <div class="info-item"><strong>⭐ Highlighted:</strong> Top ${topK} most relevant documents</div>
        </div>
        
        <div id="plot"></div>
        
        <div class="legend">
            <div class="legend-item">
                <div class="legend-color query"></div>
                <span><strong>Query Point</strong> - Your question in embedding space</span>
            </div>
            <div class="legend-item">
                <div class="legend-color top"></div>
                <span><strong>Top ${topK} Documents</strong> - Most semantically similar</span>
            </div>
            <div class="legend-item">
                <div class="legend-color other"></div>
                <span><strong>Other Documents</strong> - Less relevant results</span>
            </div>
        </div>
        
        <div class="footer">
            <p>💡 <strong>Tip:</strong> Drag to rotate • Scroll to zoom • Hover over points for details</p>
            <p style="margin-top: 10px; font-size: 0.85em;">Points closer together are semantically similar</p>
        </div>
    </div>
    
    <script>
        // Data
        const data = ${JSON.stringify(traces)};
        
        // Layout
        const layout = ${JSON.stringify(layout)};
        
        // Configuration
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
            toImageButtonOptions: {
                format: 'png',
                filename: 'embeddings_3d_visualization',
                height: 1080,
                width: 1920,
                scale: 2
            }
        };
        
        // Create plot
        Plotly.newPlot('plot', data, layout, config);
        
        // Log success
        console.log('✅ 3D visualization loaded successfully!');
        console.log('Data points:', ${reduceVectors.length});
    </script>
</body>
</html>
  `;

    // Salva il file HTML
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `embeddings_3d_${timestamp}.html`;
    const fullPath = path.join(config.visualizationPath, filename);

    await fs.writeFile(fullPath, htmlContent, 'utf-8');

    console.log(`\n 3D visualization saved to: ${fullPath}`);
    console.log(`   Open this file in your browser to view the interactive 3D plot!\n`);

}



/** In python posso utilizzare questa funzione per calcolare il cluster degli embedding:
 * def get_clusters(X, y):
    return [X[np.where(y==i)] for i in range(np.amax(y)+1)]

    Here, np.amax(y)+1 calculates the length of the list, assuming it to be from 0 to the maximum value in y (this can be changed if necessary).
     Then, np.where(y==i) finds indices of each label, which are then selected from X.
     The order of the for loop ensures that each index corresponds to the label of that value.

     In italiano: for i in range(np.amax(y) + 1)

np.amax(y) restituisce il valore massimo presente nell’array NumPy y.

range(np.amax(y) + 1) crea un intervallo che va da 0 fino a np.amax(y) incluso (perché range esclude l’ultimo valore, quindi aggiungi 1).

Il for scorre tutti i valori interi da 0 al massimo.

y = np.array([2, 5, 3])
np.amax(y)        # 5
range(np.amax(y)+1)   # range(0, 6) → 0,1,2,3,4,5


Quindi un’espressione come:
[i for i in range(np.amax(y)+1)]  produce: [0, 1, 2, 3, 4, 5]


     Ora devo migrare questa funzione da python a typescript.
     
     In TypeScript non esiste range nativamente, né c'è NumPy. Devi fare due cose:

    Trovare il valore massimo dell’array.
    Per trovare questo valore massimo devo scrivere cosi: 
    se y è un array: const maxValue = Math.max(...y);

    Generare un array di interi da 0 a quel massimo, riprodurre range(n):
    const arr = Array.from({ length: maxValue +1}, (_, i) => i);  -> Equivalente esatto della list comprehension Python.

    versione completa equivalente:
    cont y: number[] = [2,5,3];

    const maxValue = Math.max(...y);
    const arr = Array.from({ length: maxValue +1}, (_, i) => i);
    console.log(arr); E stampa [0,1,2,3,4,5]


    
 */

function get_clusters(x: number, y: number) {
    return

}

//Function for generate rundom numbers
async function genereateRandomNumber(MaxValue: number): Promise<number> {
    return Math.floor(Math.random() * MaxValue)
}

/**
 * Oppure più semplice ancora
 * Ma ritorna un numero tra 0 incluso e 1 escluso
 * function getRandom(){
 * return Math.random();
 * }
 * 
 * Oppure per avere un numero random tra due numeri
 * function getRandomBetweenNumbers(min:number, max:number){
 *  return Math.random() * (max -min) + min
 * }
 */
console.log("Numero Random:", genereateRandomNumber(100));
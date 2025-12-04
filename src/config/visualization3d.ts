
//import * as Plotly from 'plotly.js-dist-min';
import { config } from "../config/RAG.js";
import { promises as fs } from "fs";
import path from "path";

export async function create3DVisualization(
    reduceVectors: number[][],
    query: string,
    topK: number = 3): Promise<void> {

    console.log("Creating 3D visualization...");

    // Convert first, it **won’t work** if the points are `float64`!!!
    reduceVectors = reduceVectors.map(v => Array.from(v));


    if (reduceVectors.some(v => v.length !== 3 || v.some(n => !isFinite(n)))) {
        throw new Error("Found invalid 3D vectors after t-SNE!");
    }


    for (let i = 0; i < reduceVectors.length; i++) {
        const v = reduceVectors[i];
        for (let j = 0; j < 3; j++) {

            if (!Number.isFinite(v[j])) {
                console.error("❌ INVALID NUMBER FOUND:", {
                    index: i,
                    vector: v,
                    badValue: v[j]
                });
                throw new Error("Found invalid number in embeddings");
            }

        }
    }



    //Create the folder for the visualization if its not existed
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
                color: 'lightgray',
                width: 1
            }
        },
        text: Array.from({ length: allX.length }, (_, i) => `Document ${i + 1}`),
        hoverinfo: 'text'
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

    //Trace for top K documents(blue)
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
            font: { size: 20 },

        },
        scene: {
            xaxis:
            {
                title: 'Dimension 1',
                backgroundcolor: "rgba(30,30,30,0.9)",
                gridcolor: "rgba(100,100,100,0.2)",
                zerolinecolor: "rgba(200,200,200,0.6)",
                color: "white",
                showbackground: true
                /*backgroundcolor: "rgba(240, 240, 255, 0.4)",
                gridcolor: "rgba(180,180,200,0.3)",
                zerolinecolor: "rgba(100,100,120,0.6)",
                showbackground: true, */

            },

            yaxis:
            {
                title: 'Dimension 2',
                backgroundcolor: 'rgba(30,30,30,0.9)',
                gridcolor: 'rgba(100,100,100,0.2)',
                zerolinecolor: 'rgba(200,200,200,0.6)',
                color: 'white',
                showbackground: true
                /*backgroundcolor: "rgba(240, 255, 240, 0.4)",
                gridcolor: "rgba(180,200,180,0.3)",
                zerolinecolor: "rgba(100,120,100,0.6)",
                showbackground: true,*/
            },

            zaxis:
            {
                title: 'Dimension 3',
                backgroundcolor: 'rgba(30,30,30,0.9)',
                gridcolor: 'rgba(100,100,100,0.2)',
                zerolinecolor: 'rgba(200,200,200,0.6)',
                color: 'white',
                showbackground: true
                /*backgroundcolor: "rgba(255, 240, 240, 0.4)",
                gridcolor: "rgba(200,180,180,0.3)",
                zerolinecolor: "rgba(120,100,100,0.6)",
                showbackground: true,*/
            },
        },

        //Change the grey(grigio)
        paper_bgcolor: "#121212",
        plot_bgcolor: "#121212",

        // Rimuovere la “cornice dura” e avere un cubo più moderno
        aspectmode: "cube",
        dragmode: "orbit",
        camera: {
            eye: { x: 2.2, y: 2.2, z: 1.5 }
            //eye: { x: 1.5, y: 1.5, z: 1.1 }
        },

        showlegend: true,
        legend: {
            x: 0,
            y: 1,
        },
        width: 1200,
        height: 800
    };
    // Crea l'HTML

    const traces = [allPointsTrace, topKTrace, queryTrace];

    console.log("TRACES RAW:", traces);

    console.log("JSON TRACES:", JSON.stringify(traces, null, 2));

    for (let i = 0; i < reduceVectors.length; i++) {
        const v = reduceVectors[i];
        if (!Array.isArray(v) || v.length !== 3 || v.some(n => !Number.isFinite(n))) {
            console.error("Invalid vector at index", i, v);
        }
    }




    //    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
    //integrity="sha384-VKw8eVLKKnZQd2yCLHrJ6g4E6KEg5QaQc7hqvUbcJbG8sD2hk0kF4fH5d5UQlQJ0" crossorigin="anonymous">

    // Questariga sottostante crea questo problema:L'hash SHA384 dell'integrity check non corrisponde! Questo impedisce al browser di caricare Plotly per motivi di sicurezza
    //<script src="https://cdn.plot.ly/plotly-2.27.1.min.js" integrity="sha384-VKw8eVLKKnZQd2yCLHrJ6g4E6KEg5QaQc7hqvUbcJbG8sD2hk0kF4fH5d5UQlQJ0" crossorigin="anonymous"></script>
    /**Perché l'integrity check falliva?
    
    L'hash che hai usato non corrisponde al file effettivo su cdn.plot.ly
    Questo è un meccanismo di sicurezza (Subresource Integrity) per prevenire manomissioni
    È meglio non usarlo o usare l'hash corretto (che è: CfdUumYc8S2dvFy54M+E85yISHkahaJKY7Z8fFtHiyO/mLGSmDaGwiA4VfQufhNR) */

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Embeddings Visualization - RAG System</title>
    <!-- Plotly.js from CDN -->
        <script src="https://cdn.jsdelivr.net/npm/plotly.js-dist@2.27.1/plotly.min.js"></script>
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
           <!-- background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); -->

           background: linear-gradient(135deg, #121212 0%, #121212 100%); 
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

    // Check if Plotly loaded
    if (typeof Plotly === 'undefined') {
        console.error('❌ Plotly not loaded from CDN!');
        document.getElementById('plot').innerHTML = 
            '<div style="color:red;padding:40px;text-align:center;font-size:18px;"><strong>ERROR:</strong> Plotly library failed to load.<br>Check your internet connection or firewall settings.</div>';
    } else {
        console.log('✅ Plotly loaded successfully, version:', Plotly.version);


        // Data
        const data = ${JSON.stringify(traces)};

        // Layout
        const layout = ${JSON.stringify(layout)};
        
        // Configuration
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            scrollZoom: true,
            usegl:true,
            doubleClick: 'reset',
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
        try {
            Plotly.newPlot('plot', data, layout, config)
                .then(() => {
                    console.log('✅ 3D visualization rendered successfully!');
                    console.log('   Total data points:', ${reduceVectors.length});
                })
                .catch(err => {
                    console.error('❌ Plotly.newPlot failed:', err);
                    document.getElementById('plot').innerHTML = 
                        '<div style="color:red;padding:20px;">RENDER ERROR: ' + err.message + '</div>';
                });
        } catch (err) {
            console.error('❌ Exception during Plotly.newPlot:', err);
            document.getElementById('plot').innerHTML = 
                '<div style="color:red;padding:20px;">EXCEPTION: ' + err.message + '</div>';
        }
}
        // Log success
        console.log('✅ 3D visualization loaded successfully!');
        console.log('Data points:', ${reduceVectors.length});
    </script>

</body>
</html>
  `;

    // Save the HTML file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `embeddings_3d_${timestamp}.html`;
    const fullPath = path.join(config.visualizationPath, filename);

    await fs.writeFile(fullPath, htmlContent, 'utf-8');

    console.log(`\n 3D visualization saved to: ${fullPath}`);
    console.log(`   Open this file in your browser to view the interactive 3D plot!\n`);

}



//Function for generate rundom numbers
async function genereateRandomNumber(MaxValue: number): Promise<number> {
    return Math.floor(Math.random() * MaxValue)
}

console.log("Numero Random:", genereateRandomNumber(100));
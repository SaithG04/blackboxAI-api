const express = require('express');
const { askBlackbox } = require('./askBlackbox');
const { closeBrowser } = require('./browserManager');

const app = express();
app.use(express.json());

app.post('/ask', async (req, res) => {
    const prompt = req.body.prompt;
    
    console.log(`[POST /ask] Received prompt: ${prompt}`);
    
    const response = await askBlackbox(prompt);
    
    console.log(`[POST /ask] Response from Blackbox: ${response}`);
    
    res.send({ response });
});

app.listen(3000, () => {
    console.log('[app] API running on port 3000');
});

// Cerrar el navegador cuando la aplicación se detiene
process.on('SIGINT', async () => {
    console.log('[app] Shutting down...');
    await closeBrowser();
    process.exit();
});
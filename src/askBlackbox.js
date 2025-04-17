const { getPage, navigateToPage } = require('./browserManager');

async function askBlackbox(prompt) {
    console.log('[askBlackbox] Sending prompt to Blackbox...');
    
    // Aseguramos que el navegador está iniciado y obtenemos la página
    const page = await getPage();
    
    console.log('[askBlackbox] Navigating to Blackbox...');
    await navigateToPage('https://www.blackbox.ai/');
    
    console.log('[askBlackbox] Waiting for textarea...');
    await page.waitForSelector('textarea'); // Asegúrate que sigue siendo "textarea"
    
    console.log('[askBlackbox] Filling prompt...');
    await page.fill('textarea', prompt);

    console.log('[askBlackbox] Pressing Enter...');
    await page.keyboard.press('Enter');

    try {
        console.log('[askBlackbox] Waiting for response...');
        // Esperamos un momento para asegurarnos que la respuesta se genera
        await page.waitForTimeout(5000); // Espera 5 segundos

        // Log de los elementos relevantes, como los párrafos dentro de la clase 'prose'
        const responseText = await page.evaluate(() => {
            const paragraphs = Array.from(document.querySelectorAll('.prose p'));
            return paragraphs.map(p => p.textContent).join('\n'); // Extraemos todos los párrafos de la clase 'prose'
        });
        // Limpiamos la respuesta para eliminar el prompt y devolver solo la respuesta
        let cleanedResponse = responseText.replace(prompt, '').trim();

        // Limpiamos los artefactos de respuestas anteriores
        cleanedResponse = cleanedResponse.replace(/\n\s*\n/g, '\n').trim(); // Elimina líneas vacías acumuladas

        // Si no se encuentra ninguna respuesta válida, devolver "No response"
        const response = cleanedResponse || 'No response';

        return response;
    } catch (error) {
        console.error('[askBlackbox] Failed to get response:', error.message);
        return 'No response';
    }
}

module.exports = { askBlackbox };
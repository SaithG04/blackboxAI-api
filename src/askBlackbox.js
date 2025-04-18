const { getPage, navigateToPage, releasePage } = require("./browserManager");
const logger = require("./logger");
const { v4: uuidv4 } = require("uuid");
const NodeCache = require("node-cache");

// Configuración mejorada
const responseCache = new NodeCache({
  stdTTL: 300, // 5 minutos de caché
  checkperiod: 60,
  useClones: false,
});

const TIMEOUTS = {
  NAVIGATION: 30000,
  INPUT: 20000,
  RESPONSE: 60000, // Aumentado a 60 segundos para respuestas largas
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SELECTORS = {
  INPUT: "textarea#chat-input-box",
  SEND_BUTTON: "button#prompt-form-send-button",
  RESPONSE: [".prose", ".ai-response", ".message-content", ".chat-message"],
};

// Función mejorada para limpieza de texto
function cleanText(text, prompt) {
  if (typeof text !== "string") {
    logger.warn("La respuesta no es un string, convirtiendo...");
    text = String(text);
  }

  return text
    .replace(
      new RegExp(prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      ""
    )
    .replace(/[\u25CF\uFFFD…]/g, "") // Elimina ⬤, � y ...
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Función principal robusta
async function askBlackbox(prompt) {
  const requestId = uuidv4().substring(0, 8);
  const logPrefix = `[Request ${requestId}]`;
  let pageObj = null;

  logger.info(
    `${logPrefix} Processing: "${prompt.substring(0, 50)}${
      prompt.length > 50 ? "..." : ""
    }"`
  );

  // Verificación de caché
  const cacheKey = prompt.trim().toLowerCase();
  const cachedResponse = responseCache.get(cacheKey);
  if (cachedResponse) {
    logger.debug(`${logPrefix} Serving from cache`);
    return cachedResponse;
  }

  try {
    const startTime = Date.now();
    pageObj = await getPage();
    const { page } = pageObj;

    // Navegación segura
    try {
      const currentUrl = await page.url();
      if (!currentUrl.includes("blackbox.ai")) {
        logger.debug(`${logPrefix} Navigating to Blackbox...`);
        await navigateToPage("https://www.blackbox.ai/", page);
        await page.waitForSelector(SELECTORS.INPUT, {
          visible: true,
          timeout: TIMEOUTS.NAVIGATION,
        });
      }
    } catch (navError) {
      logger.warn(`${logPrefix} Navigation error: ${navError.message}`);
      await page.reload();
    }

    // Configuración de página
    await page.setUserAgent(USER_AGENT);
    await page.setJavaScriptEnabled(true);

    // Envío del prompt con manejo de errores
    try {
      const input = await page.waitForSelector(SELECTORS.INPUT, {
        visible: true,
        timeout: TIMEOUTS.INPUT,
      });

      await input.click({ clickCount: 3 });
      await page.keyboard.press("Backspace");
      await input.type(prompt, { delay: 0 });

      try {
        await page.click(SELECTORS.SEND_BUTTON);
      } catch {
        await page.keyboard.press("Enter");
      }
    } catch (inputError) {
      logger.error(`${logPrefix} Input error: ${inputError.message}`);
      throw new Error("Error al enviar el prompt");
    }

    // Obtención de respuesta con verificación de tipo
    let responseText = "";
    const startWaitTime = Date.now();

    while (Date.now() - startWaitTime < TIMEOUTS.RESPONSE) {
      try {
        const currentResponse = await page.evaluate((selectors) => {
          const containers = Array.from(document.querySelectorAll(selectors));
          const latestContainer = containers[containers.length - 1];
          return latestContainer?.textContent?.trim() || "";
        }, SELECTORS.RESPONSE.join(","));

        if (
          typeof currentResponse === "string" &&
          currentResponse.length > responseText.length
        ) {
          responseText = currentResponse;

          // Verificar si la respuesta parece completa
          if (/[.!?]\s*$/.test(responseText) && !responseText.includes("⬤")) {
            break;
          }
        }
      } catch (e) {
        logger.warn(`${logPrefix} Error evaluating response: ${e.message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Validación y limpieza final
    if (!responseText) {
      throw new Error("No se recibió respuesta del servidor");
    }

    const cleanedResponse = cleanText(responseText, prompt);

    if (!cleanedResponse || cleanedResponse.length < 5) {
      throw new Error("Respuesta vacía o inválida");
    }

    // Almacenamiento en caché
    responseCache.set(cacheKey, cleanedResponse);
    logger.info(`${logPrefix} Response in ${Date.now() - startTime}ms`);

    return cleanedResponse;
  } catch (error) {
    logger.error(`${logPrefix} Error: ${error.message}`);
    return "No se pudo obtener una respuesta completa. Por favor, inténtelo de nuevo.";
  } finally {
    if (pageObj?.page && !pageObj.page.isClosed()) {
      try {
        await releasePage(pageObj.page);
      } catch (error) {
        logger.error(`${logPrefix} Page release error: ${error.message}`);
      }
    }
  }
}

module.exports = { askBlackbox };

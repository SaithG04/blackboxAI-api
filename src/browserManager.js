const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { v4: uuidv4 } = require("uuid");
const logger = require("./logger");

puppeteer.use(StealthPlugin());

const MAX_POOL_SIZE = 1;
const PAGE_TIMEOUT = 30000;
const BROWSER_LAUNCH_TIMEOUT = 60000;

let browserInstance = null;
let pagePool = [];
let isShuttingDown = false;

async function navigateToPage(url, page) {
  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
      referer: "https://www.google.com/",
    });
  } catch (error) {
    throw new Error(`Navigation to ${url} failed: ${error.message}`);
  }
}

async function launchBrowser() {
  if (browserInstance || isShuttingDown) {
    logger.info(`[Browser] Reusing existing instance...`);
    return browserInstance;
  }

  const browserId = uuidv4().substring(0, 8);
  logger.info(`[Browser ${browserId}] Launching stealth browser...`);

  try {
    const browser = await puppeteer.launch({
      headless: false,
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--app=https://www.blackbox.ai/", // Esto abre la URL pero no espera carga
        "--remote-debugging-port=9222",
        "--disable-features=site-per-process",
        "--disable-blink-features=AutomationControlled",
      ],
      timeout: BROWSER_LAUNCH_TIMEOUT,
      ignoreHTTPSErrors: true,
      dumpio: true,
    });

    browserInstance = browser;

    browser.on("disconnected", () => {
      if (!isShuttingDown) {
        logger.warn(
          "Browser disconnected unexpectedly! Attempting to restart..."
        );
        cleanupBrowser();
        setTimeout(
          () =>
            launchBrowser().catch((e) =>
              logger.error("Failed to restart browser:", e)
            ),
          5000
        );
      }
    });

    const [page] = await browser.pages();

    // Configuración esencial primero
    await configurePage(page);

    // Esperar activamente a que Blackbox cargue
    try {
      // Navegar explícitamente aunque usemos --app
      await navigateToPage("https://www.blackbox.ai/", page);

      // Esperar elementos clave
      await page.waitForSelector("textarea#chat-input-box", {
        timeout: 20000,
        visible: true,
      });

      logger.info("Blackbox fully loaded and ready");
    } catch (e) {
      logger.error("Failed to fully load Blackbox:", e.message);
      throw e; // Relanzar el error para manejo externo
    }

    pagePool.push(page);
    return browser;
  } catch (error) {
    logger.error(`Browser launch failed: ${error.message}`);
    browserInstance = null;
    throw error;
  }
}

async function warmupPool() {
  if (!browserInstance) {
    await launchBrowser();
  }

  try {
    const browser = await browserInstance;

    // Si el pool está vacío pero hay páginas disponibles
    if (pagePool.length === 0) {
      const pages = await browser.pages();
      if (pages.length > 0) {
        const page = pages[0];
        await configurePage(page);
        await navigateToPage("https://www.blackbox.ai/", page);
        pagePool.push(page);
        logger.info("Reused existing page for pool");
      } else {
        const newPage = await createPage(browser);
        await navigateToPage("https://www.blackbox.ai/", newPage);
        pagePool.push(newPage);
        logger.info("Created new page for pool");
      }
    }
  } catch (error) {
    logger.error("Warmup failed:", error);
    throw error;
  }
}

async function configurePage(page) {
  await page.setDefaultTimeout(PAGE_TIMEOUT);
  await page.setViewport({ width: 1280, height: 720 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  );

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        {
          name: "Chrome PDF Viewer",
          filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
        },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ],
    });

    window.navigator.permissions = {
      query: () => Promise.resolve({ state: "granted" }),
    };

    window.navigator.chrome = { runtime: {} };
  });
}

async function createPage(browser) {
  try {
    const page = await browser.newPage();
    await page.setDefaultTimeout(PAGE_TIMEOUT);
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    );

    // Add more evasion techniques
    await page.evaluateOnNewDocument(() => {
      // Overwrite the navigator
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });

      // Create a fake plugins array
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
          {
            name: "Chrome PDF Viewer",
            filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
          },
          { name: "Native Client", filename: "internal-nacl-plugin" },
        ],
      });

      // Overwrite permissions
      window.navigator.permissions = {
        query: () => Promise.resolve({ state: "granted" }),
      };

      // Overwrite user agent
      window.navigator.chrome = { runtime: {} };
    });

    return page;
  } catch (error) {
    logger.error("Page creation failed:", error.message);
    return null;
  }
}
async function getPage() {
  try {
    if (!browserInstance) {
      await warmupPool();
    }

    if (pagePool.length > 0) {
      const page = pagePool.pop();
      logger.debug(`Reusing page from pool. Pool size: ${pagePool.length}`);
      return { page, browserId: "pooled-page" };
    }

    const browser = await browserInstance;
    const page = await createPage(browser);
    if (page) {
      logger.debug(`Created new page. Pool size: ${pagePool.length}`);
      return { page, browserId: "new-page" };
    }

    throw new Error("Failed to create new page");
  } catch (error) {
    logger.error("Error getting page:", error.message);
    throw error;
  }
}

async function releasePage(page) {
  if (isShuttingDown || !browserInstance) {
    await page.close();
    return;
  }

  try {
    // Limpieza mínima para mayor estabilidad
    await page.evaluate(() => {
      window.stop(); // Detener cualquier carga en curso
    });

    // Resetear a Blackbox
    try {
      await page.goto("about:blank", { timeout: 3000 });
      await page.goto("https://www.blackbox.ai/", {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
    } catch (navError) {
      logger.warn("Navigation during release failed:", navError.message);
    }

    if (pagePool.length < MAX_POOL_SIZE) {
      pagePool.push(page);
      logger.debug("Page returned to pool");
    } else {
      await page.close();
    }
  } catch (error) {
    logger.error("Error releasing page:", error.message);
    try {
      await page.close();
    } catch (e) {
      logger.error("Error closing page:", e.message);
    }
  }
}

async function closeBrowser() {
  isShuttingDown = true;
  if (browserInstance) {
    try {
      const browser = await browserInstance;
      await browser.close();
      logger.info("Browser closed");
    } catch (error) {
      logger.error("Error closing browser:", error);
    } finally {
      cleanupBrowser();
    }
  }
}

function cleanupBrowser() {
  browserInstance = null;
  pagePool = [];
}

module.exports = {
  launchBrowser,
  warmupPool,
  getPage,
  releasePage,
  closeBrowser,
  navigateToPage,
  getBrowserInstance: () => browserInstance,
};

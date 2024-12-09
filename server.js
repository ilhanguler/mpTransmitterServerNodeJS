const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const path = require("path");
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const PORT = 1337;

// Target URL to scrape
const TARGET_URL = 'https://bilgisayarmuhendislik.iuc.edu.tr/tr/duyurular/1/1';

// Scraping interval (in milliseconds)
const SCRAPE_INTERVAL = 15000;

// Folder to save scraped HTML
const SAVE_FOLDER = './scraped';

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
});

const app = express();

app.use(limiter);

// Middleware for parsing form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (HTML, CSS, etc.)
app.use(express.static(path.join(__dirname, "public")));

if (!fs.existsSync(SAVE_FOLDER)) {
    fs.mkdirSync(SAVE_FOLDER);
}

// Function to scrape web page
const scrapePage = async () => {
    console.log('Starting scrape...');

    try {
        // Launch Puppeteer
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // Go to the target URL
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

        // Scroll to the bottom to load all dynamic content
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // Get page content (HTML)
        const content = await page.content();

        // Save the HTML to a file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = `${SAVE_FOLDER}/page-${timestamp}.html`;
        fs.writeFileSync(filePath, content);
        console.log(`HTML saved to ${filePath}`);

        // Close Puppeteer
        await browser.close();

        // Parse HTML with Cheerio
        parseHTML(content);

    } catch (error) {
        console.error('Error during scraping:', error.message);
    }
};

// Start periodic scraping
//setInterval(scrapePage, SCRAPE_INTERVAL);

// Function to parse HTML and extract content
const parseHTML = (html) => {
    console.log('Parsing HTML...');
    const $ = cheerio.load(html);

    // Example: Extract all links
    const links = [];
    $('a').each((i, elem) => {
        const link = $(elem).attr('href');
        if (link) {
            links.push(link);
        }
    });

    console.log('Extracted Links:', links);

    // Example: Extract specific content (e.g., headings)
    const headings = $('h1, h2, h3').map((i, elem) => $(elem).text().trim()).get();
    console.log('Extracted Headings:', headings);
};

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Route to display the main HTML page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Route to handle scraping
app.post("/scrape", async (req, res) => {
    const { website } = req.body;
    
    if (!website) {
        return res.status(400).send("Please provide a valid URL.");
    }

    try {
        // Launch Puppeteer
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // Navigate to the website
        await page.goto(website, { waitUntil: "networkidle2" });

        // Extract the HTML content
        const html = await page.content();

        // Load the HTML into Cheerio
        const $ = cheerio.load(html);

        // Example: Extract all links
        const links = [];
        $("a").each((i, elem) => {
            links.push($(elem).attr("href"));
        });

        // Save the HTML file
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filePath = `scraped-${timestamp}.html`;
        fs.writeFileSync(filePath, html);
        console.log(`HTML saved to ${filePath}`);

        // Close Puppeteer
        await browser.close();

        // Send scraped links back to the client
        res.json({ success: true, links, filePath });
    } catch (error) {
        console.error("Scraping error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Route to scrape a URL
app.post("/loadWebsite", async (req, res) => {
    const { website } = req.body;

    if (!website) {
        return res.status(400).send("Website URL is required.");
    }

    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(website, { waitUntil: "networkidle2" });

        // Save website content to a temporary file
        const content = await page.content();
        const tempFilePath = path.join(__dirname, "public", "temp.html");
        fs.writeFileSync(tempFilePath, content);

        await browser.close();
        res.json({ success: true, tempFilePath: "/temp.html" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Route to scrape specific elements
app.post("/scrapeElement", async (req, res) => {
    const { website, selector } = req.body;

    if (!website || !selector) {
        return res.status(400).send("Website URL and selector are required.");
    }

    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(website, { waitUntil: "networkidle2" });

        const elements = await page.$$eval(selector, (nodes) =>
            nodes.map((node) => node.outerHTML)
        );

        await browser.close();
        res.json({ success: true, elements });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});